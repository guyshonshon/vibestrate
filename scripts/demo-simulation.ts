/**
 * Demo simulation - produces ONE real run that exercises the resilience + audit
 * features shipped recently, using only fake local providers (no API), so you can
 * SEE them in the dashboard.
 *
 *   pnpm tsx scripts/demo-simulation.ts
 *   cd /tmp/vibestrate-demo && vibe ui      # then open http://localhost:4317
 *
 * The run is a panel-review where, per step:
 *   - architecture : a provider that always rate-limits -> retries -> FALLS BACK
 *                    to a backup model -> succeeds.
 *   - implement    : emits stream-json -> the audit shows INSIDE the turn
 *                    (tool calls + a spawned sub-agent).
 *   - review (correctness): rate-limited twice -> retried -> succeeds.
 *   - review (tests)      : hard failure -> TOLERATED (continueOnError panel).
 *   - the rest succeed; the arbiter APPROVES.
 *
 * Result: a merge_ready run whose `vibe audit` tree shows attempt chains
 * (rate-limit -> retry -> fallback -> success), a tolerated failure, inside-the-
 * turn tool/sub-agent detail, and a `partially_verified` assurance verdict.
 */
import path from "node:path";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { loadConfig } from "../src/project/config-loader.js";
import { findFlowById } from "../src/flows/catalog/flow-discovery.js";
import { resolveFlow } from "../src/flows/runtime/flow-resolver.js";
import { Orchestrator } from "../src/core/orchestrator.js";
import { ApprovalService } from "../src/core/run/approval-service.js";
import { buildRunAudit } from "../src/core/run/run-audit.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const DIR = "/tmp/vibestrate-demo";
const noProvider: ProviderDetectionRunner = async () => ({ exitCode: 127, stdout: "", stderr: "" });

// A step that declares a handoff output puts the exact contract - including the
// real stepId - into the prompt (see buildFlowContracts in flow-arbitration.ts).
// A real model is asked to answer with that shape; these fakes read it back out
// of their own prompt and fill it in, which is the smallest thing that satisfies
// the same parser.
//
// Deriving it from the prompt rather than hardcoding a literal is the point: the
// demo cannot drift from the contract, and it exercises the handoff path instead
// of tripping it. Before this, every provider emitted bare markdown, so the run
// carried three `unparsed` judgments and the dashboard's headline screen was a
// wall of parse errors.
const EMIT_HANDOFF = `
const emitHandoff=(p,fill)=>{
  const m=p.match(/^- (plan-handoff|architecture-handoff|execution-handoff): (.+)$/m);
  if(!m)return;
  let o;try{o=JSON.parse(m[2])}catch{return}
  fill(m[1],o);
  console.log("VIBESTRATE_FLOW_OUTPUT:");
  console.log(JSON.stringify(o,null,2));
  console.log("VIBESTRATE_FLOW_OUTPUT_END");
};`;

// Role-aware "happy" provider: plays planner / architect / reviewer / verifier.
const OK = `#!/usr/bin/env node
${EMIT_HANDOFF}
let p="";process.stdin.on("data",c=>p+=c);process.stdin.on("end",()=>{
  const role=(p.match(/Vibestrate Agent: (\\w+)/)||[])[1]||"";
  if(role==="reviewer"){console.log("# Findings\\n\\nNo blocking issues from this lens.");return;}
  if(role==="verifier"){console.log("# Arbiter verdict\\n\\nDECISION: APPROVED");return;}
  if(role==="planner"){
    console.log("# Plan\\n\\n1. Add a rate limiter\\n2. Add POST /login behind it\\n3. Cover both with tests");
    emitHandoff(p,(t,o)=>{
      o.goal="Add a login endpoint that refuses more than 5 attempts a minute per IP.";
      o.steps=[
        {id:"step-1",title:"Add a fixed-window limiter",detail:"Keyed by IP, 5 requests per 60s."},
        {id:"step-2",title:"Add POST /login",detail:"Verify the password, then issue a session."},
        {id:"step-3",title:"Cover the limit",detail:"A test that trips the 6th attempt."},
      ];
      o.filesLikelyTouched=["src/routes/login.ts","src/middleware/rate-limit.ts"];
      o.assumptions=["Sessions already exist and only need issuing."];
      o.openQuestions=["Should the limit be per IP or per account?"];
      o.risks=["A shared NAT would rate-limit unrelated users together."];
    });
    return;
  }
  if(role==="architect"){
    console.log("# Architecture\\n\\nA fixed window in front of the handler, not inside it.");
    emitHandoff(p,(t,o)=>{
      o.approach="Put the limiter in middleware so the handler stays a pure credential check.";
      o.decisions=[{
        id:"decision-1",
        decision:"Fixed window over a token bucket.",
        rationale:"One counter and one expiry; nothing to tune under this load.",
        alternatives:["Token bucket","Sliding log"],
      }];
      o.componentsTouched=["src/routes/login.ts","src/middleware/rate-limit.ts"];
      o.interfaces=["rateLimit(opts: { max: number; windowMs: number }): Middleware"];
      o.risks=["A fixed window lets a burst straddle the boundary."];
      o.openQuestions=[];
    });
    return;
  }
  console.log("# Done\\n\\nok");
});`;

// Rate-limits twice (instant reset hint) then succeeds - shows retry recovery.
const FLAKY = `#!/usr/bin/env node
const fs=require("node:fs"),path=require("node:path"),c=path.join(__dirname,"flaky.count");
let p="";process.stdin.on("data",x=>p+=x);process.stdin.on("end",()=>{
  let n=0;try{n=parseInt(fs.readFileSync(c,"utf8"),10)||0}catch{};n++;fs.writeFileSync(c,String(n));
  if(n<3){process.stderr.write("Error: 429 rate limit; retry after 0 seconds\\n");process.exit(1);}
  console.log("# Findings\\n\\nChecked the diff - looks correct.");
});`;

// Always rate-limits - exhausts retries, then the run falls back to a backup model.
const RATELIMITED = `#!/usr/bin/env node
let p="";process.stdin.on("data",x=>p+=x);process.stdin.on("end",()=>{
  process.stderr.write("HTTP 429: rate limit reached\\n");process.exit(1);});`;

// Hard failure - tolerated by the panel's continueOnError reviewers.
const BROKEN = `#!/usr/bin/env node
let p="";process.stdin.on("data",x=>p+=x);process.stdin.on("end",()=>{
  process.stderr.write("Error: invalid request - this lens crashed\\n");process.exit(1);});`;

// Emits stream-json with tool calls + a sub-agent spawn (Agent) -> the audit's
// inside-the-box view lights up (extractTurnInternals parses raw stdout).
//
// It also WRITES the files it claims to write. It used to emit an `Edit` event
// and touch nothing, so the run finished at "0 files, +0 -0" - a demo of an
// orchestrator that changed nothing. The turn runs in the run's worktree, so
// writing here is what a real agent CLI does, and it gives the diff gate, the
// diff view and the merge story something real to act on.
//
// The marker block goes to stdout as plain lines after the NDJSON. Safe on both
// readers: turn-internals.ts skips any line that is not a JSON object, and the
// handoff parser prefers a marker block over loose JSON.
const STREAMJSON = `#!/usr/bin/env node
const fs=require("node:fs");
${EMIT_HANDOFF}
let p="";process.stdin.on("data",x=>p+=x);process.stdin.on("end",()=>{
  const e=o=>console.log(JSON.stringify(o));
  e({type:"system",subtype:"init",session_id:"demo"});
  e({type:"assistant",message:{content:[{type:"tool_use",name:"Read",input:{file_path:"package.json"}}]}});
  e({type:"user",message:{content:[{type:"tool_result",content:"..."}]}});
  e({type:"assistant",message:{content:[{type:"tool_use",name:"Agent",input:{description:"audit the auth module for vulnerabilities",prompt:"..."}}]}});

  fs.mkdirSync("src/middleware",{recursive:true});
  fs.mkdirSync("src/routes",{recursive:true});
  fs.writeFileSync("src/middleware/rate-limit.ts",
    "const hits = new Map<string, { n: number; resetAt: number }>();\\n\\n"+
    "export function rateLimit({ max, windowMs }: { max: number; windowMs: number }) {\\n"+
    "  return (ip: string): boolean => {\\n"+
    "    const now = Date.now();\\n"+
    "    const seen = hits.get(ip);\\n"+
    "    if (!seen || now > seen.resetAt) {\\n"+
    "      hits.set(ip, { n: 1, resetAt: now + windowMs });\\n"+
    "      return true;\\n"+
    "    }\\n"+
    "    seen.n += 1;\\n"+
    "    return seen.n <= max;\\n"+
    "  };\\n"+
    "}\\n");
  e({type:"assistant",message:{content:[{type:"tool_use",name:"Write",input:{file_path:"src/middleware/rate-limit.ts"}}]}});

  fs.writeFileSync("src/routes/login.ts",
    "import { rateLimit } from \\"../middleware/rate-limit.js\\";\\n\\n"+
    "const allow = rateLimit({ max: 5, windowMs: 60_000 });\\n\\n"+
    "export async function login(req: Request, ip: string) {\\n"+
    "  if (!allow(ip)) return new Response(\\"Too many attempts\\", { status: 429 });\\n"+
    "  return new Response(\\"ok\\");\\n"+
    "}\\n");
  e({type:"assistant",message:{content:[{type:"tool_use",name:"Write",input:{file_path:"src/routes/login.ts"}}]}});

  e({type:"assistant",message:{content:[{type:"text",text:"# Implementation\\n\\nAdded the limiter and put the login route behind it."}]}});
  e({type:"result",subtype:"success",num_turns:3,total_cost_usd:0.042});

  emitHandoff(p,(t,o)=>{
    o.summary="Added a fixed-window limiter and put POST /login behind it.";
    o.steps=[
      {planStepId:"step-1",title:"Add a fixed-window limiter",status:"done",note:"5 requests per 60s, keyed by IP."},
      {planStepId:"step-2",title:"Add POST /login",status:"done",note:"Refuses with 429 once the window is spent."},
      {planStepId:"step-3",title:"Cover the limit",status:"skipped",note:"No test runner in this project yet."},
    ];
    o.filesChanged=["src/middleware/rate-limit.ts","src/routes/login.ts"];
    o.commandsRun=[];
    o.followUps=["Move the counter out of process memory before running more than one instance."];
    o.risks=["A fixed window lets a burst straddle the boundary."];
  });
});`;

async function writeProvider(name: string, body: string): Promise<string> {
  const file = path.join(DIR, `${name}.js`);
  await fs.writeFile(file, body, { mode: 0o755 });
  await fs.chmod(file, 0o755);
  return file;
}

async function main() {
  console.log(`Setting up a fresh demo project at ${DIR} ...`);
  await fs.rm(DIR, { recursive: true, force: true });
  await fs.mkdir(DIR, { recursive: true });
  await execa("git", ["init", "-q", "-b", "main"], { cwd: DIR });
  await execa("git", ["config", "user.email", "demo@demo"], { cwd: DIR });
  await execa("git", ["config", "user.name", "demo"], { cwd: DIR });
  await fs.writeFile(path.join(DIR, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: DIR });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: DIR });
  await applySetup({ options: { projectRoot: DIR }, detectionRunner: noProvider });

  const cli = (cmd: string, args: string[]) =>
    JSON.stringify({ type: "cli", command: cmd, args, input: "stdin" });
  await setConfigValue(DIR, "providers.ok", cli("node", [await writeProvider("ok", OK)]));
  await setConfigValue(DIR, "providers.flaky", cli("node", [await writeProvider("flaky", FLAKY)]));
  await setConfigValue(DIR, "providers.ratelimited", cli("node", [await writeProvider("ratelimited", RATELIMITED)]));
  await setConfigValue(DIR, "providers.broken", cli("node", [await writeProvider("broken", BROKEN)]));
  await setConfigValue(DIR, "providers.streamjson", cli("node", [await writeProvider("streamjson", STREAMJSON)]));
  await setConfigValue(DIR, "profiles.claude-balanced.provider", "ok");
  for (const [p, prov] of [
    ["backup", "ok"],
    ["flaky-profile", "flaky"],
    ["ratelimited-profile", "ratelimited"],
    ["broken-profile", "broken"],
    ["streamjson-profile", "streamjson"],
  ]) {
    await setConfigValue(DIR, `profiles.${p}.provider`, prov);
  }

  const loaded = await loadConfig(DIR);
  // Fast retries + a backup fallback so the demo runs in seconds.
  const config = {
    ...loaded.config,
    resilience: {
      ...loaded.config.resilience,
      rateLimit: { ...loaded.config.resilience.rateLimit, maxRetries: 2, baseDelayMs: 1, maxDelayMs: 3, fallbackProfile: "backup" },
      transient: { ...loaded.config.resilience.transient, maxRetries: 2, baseDelayMs: 1, maxDelayMs: 3 },
    },
  };

  const discovered = await findFlowById(DIR, "panel-review");
  const snapshot = resolveFlow({
    flow: discovered!.definition,
    source: discovered!.source,
    config,
    task: "Add a rate-limited login endpoint and review it across lenses.",
    stepProfileOverrides: {
      architecture: "ratelimited-profile", // always 429 -> retry -> fallback to backup
      implement: "streamjson-profile", // tool calls + sub-agent in the audit
      "review-correctness": "flaky-profile", // 429 twice -> retried -> ok
      "review-tests": "broken-profile", // hard fail -> tolerated (continueOnError)
    },
  });

  console.log("Running the simulated panel-review flow ...\n");
  const orch = new Orchestrator({
    projectRoot: DIR,
    config,
    rules: loaded.rules,
    task: snapshot.task,
    flow: snapshot,
    isGitRepo: true,
    readOnly: false,
    onProgress: (m) => process.stdout.write(`  · ${m}\n`),
  });
  // Auto-approve anything that pauses (so the demo runs unattended).
  const interval = setInterval(async () => {
    const runs = await fs.readdir(path.join(DIR, ".vibestrate", "runs")).catch(() => []);
    const runId = runs.sort().at(-1);
    if (!runId) return;
    const a = new ApprovalService(DIR, runId);
    const pending = await a.firstPending().catch(() => null);
    if (pending) await a.approve({ approvalId: pending.id }).catch(() => {});
  }, 50);

  let runId = "";
  try {
    const r = await orch.run();
    runId = r.runId;
    console.log(`\nRun finished: ${r.state.status}`);
  } catch (e) {
    const runs = await fs.readdir(path.join(DIR, ".vibestrate", "runs")).catch(() => []);
    runId = runs.sort().at(-1) ?? "";
    console.log(`\nRun ended (caught: ${e instanceof Error ? e.message : String(e)})`);
  } finally {
    clearInterval(interval);
  }

  const audit = await buildRunAudit(DIR, runId);
  console.log("\n" + "=".repeat(70));
  console.log("AUDIT TREE (same data the dashboard renders):");
  console.log("=".repeat(70));
  for (const s of audit.steps) {
    const chain = s.attempts.map((a) => (a.detail ? `${a.outcome}(${a.detail})` : a.outcome)).join(" -> ");
    console.log(`\n• ${s.id} (${s.kind})  [${s.status}]${s.model ? `  ${s.provider}/${s.model}` : ""}`);
    if (chain) console.log(`    ${chain}`);
    if (s.tools.length || s.subAgents.length) {
      const inside = [
        ...s.tools.map((t) => `${t.name}×${t.count}`),
        ...s.subAgents.map((sa) => `sub-agent: ${sa.description ?? sa.name}`),
      ].join(" · ");
      console.log(`    inside: ${inside}`);
    } else if (s.internalsOpaque) {
      console.log(`    inside: opaque`);
    }
  }
  console.log(
    `\nTotals: ${audit.totals.turns} turns · ${audit.totals.retries} retries · ${audit.totals.fallbacks} fallbacks` +
      `  ·  assurance: ${audit.assuranceVerdict}`,
  );
  console.log("\n" + "=".repeat(70));
  console.log("SEE IT IN THE DASHBOARD:");
  console.log(`  cd ${DIR} && vibe ui        # then open http://localhost:4317`);
  console.log(`  (or:  vibe audit ${runId}   in that dir)`);
  console.log("=".repeat(70));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

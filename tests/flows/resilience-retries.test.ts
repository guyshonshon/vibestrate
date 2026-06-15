import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { Orchestrator } from "../../src/core/orchestrator.js";
import { resolveFlow } from "../../src/flows/runtime/flow-resolver.js";
import { flowDefinitionSchema } from "../../src/flows/schemas/flow-schema.js";
import { loadConfig } from "../../src/project/config-loader.js";
import { setConfigValue } from "../../src/setup/config-update-service.js";
import { applySetup } from "../../src/setup/setup-service.js";
import type { ProviderDetectionRunner } from "../../src/providers/provider-detection.js";
import type { ProjectConfig } from "../../src/project/config-schema.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

// Rate-limits (429 in stderr) on the first two invocations, then succeeds.
// A counter file persists across the separate processes within one turn.
const RATE_LIMITED_THEN_OK = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const counter = path.join(__dirname, "attempts.txt");
let p = "";
process.stdin.on("data", (c) => (p += c));
process.stdin.on("end", () => {
  let n = 0;
  try { n = parseInt(fs.readFileSync(counter, "utf8"), 10) || 0; } catch {}
  n += 1;
  fs.writeFileSync(counter, String(n));
  if (n < 3) { process.stderr.write("Error: 429 rate limit exceeded\\n"); process.exit(1); }
  console.log("# Out\\n\\nok");
});
`;

// A hard error (no rate/transient pattern) - must NOT be retried.
const HARD_FAIL = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const counter = path.join(__dirname, "attempts.txt");
let p = "";
process.stdin.on("data", (c) => (p += c));
process.stdin.on("end", () => {
  let n = 0;
  try { n = parseInt(fs.readFileSync(counter, "utf8"), 10) || 0; } catch {}
  fs.writeFileSync(counter, String(n + 1));
  process.stderr.write("error: unknown flag --nope\\n");
  process.exit(1);
});
`;

async function makeRepo(providerScript: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-resil-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"resil"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

  const provPath = path.join(dir, "prov.js");
  await fs.writeFile(provPath, providerScript, { mode: 0o755 });
  await fs.chmod(provPath, 0o755);
  await setConfigValue(
    dir,
    "providers.fake",
    JSON.stringify({ type: "cli", command: "node", args: [provPath], input: "stdin" }),
  );
  await setConfigValue(dir, "profiles.claude-balanced.provider", "fake");
  return dir;
}

const soloFlow = flowDefinitionSchema.parse({
  id: "solo",
  version: 1,
  label: "Solo",
  description: "one agent turn",
  seats: { planner: { label: "Planner" } },
  steps: [{ id: "do", label: "Do", kind: "agent-turn", seat: "planner", outputs: ["plan"] }],
});

type RunEvent = { type: string; data?: Record<string, unknown> };

async function run(projectRoot: string, config: ProjectConfig, rules: Awaited<ReturnType<typeof loadConfig>>["rules"]) {
  const snapshot = resolveFlow({
    flow: soloFlow,
    source: { kind: "fixture", ref: "solo" },
    config,
    task: `resilience ${Math.random().toString(36).slice(2, 8)}`,
  });
  const orchestrator = new Orchestrator({
    projectRoot,
    config,
    rules,
    task: snapshot.task,
    flow: snapshot,
    isGitRepo: true,
    readOnly: false,
    onProgress: () => {},
  });
  let runId = "";
  try {
    const result = await orchestrator.run();
    runId = result.runId;
  } catch {
    const runs = await fs.readdir(path.join(projectRoot, ".vibestrate", "runs")).catch(() => []);
    runId = runs.sort().at(-1) ?? "";
  }
  const raw = await fs
    .readFile(path.join(projectRoot, ".vibestrate", "runs", runId, "events.ndjson"), "utf8")
    .catch(() => "");
  const events = raw.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as RunEvent);
  const attempts = Number(
    (await fs.readFile(path.join(projectRoot, "attempts.txt"), "utf8").catch(() => "0")).trim(),
  );
  return { events, attempts };
}

// Tiny delays so the test is fast.
function fastResilience(config: ProjectConfig): ProjectConfig {
  return {
    ...config,
    resilience: {
      ...config.resilience,
      rateLimit: { ...config.resilience.rateLimit, baseDelayMs: 1, maxDelayMs: 3, maxRetries: 5 },
      transient: { ...config.resilience.transient, baseDelayMs: 1, maxDelayMs: 3, maxRetries: 5 },
    },
  };
}

describe("provider resilience retries (unattended-resilience U2)", () => {
  it("retries a rate-limited turn with backoff until it succeeds", async () => {
    const projectRoot = await makeRepo(RATE_LIMITED_THEN_OK);
    const loaded = await loadConfig(projectRoot);
    const { events, attempts } = await run(projectRoot, fastResilience(loaded.config), loaded.rules);

    // The provider was called three times within the one turn (2 fails + success).
    expect(attempts).toBe(3);

    // Two resilience retries were recorded, classed as rate-limit.
    const retried = events.filter(
      (e) => e.type === "flow.step.retried" && e.data?.stepId === "do",
    );
    expect(retried).toHaveLength(2);
    expect(retried.every((e) => e.data?.class === "rate-limit")).toBe(true);

    // The turn ultimately completed (the run survived the rate limit).
    expect(events.some((e) => e.type === "flow.step.completed" && e.data?.stepId === "do")).toBe(true);
  }, 60_000);

  it("does NOT retry a hard failure (called once, run fails)", async () => {
    const projectRoot = await makeRepo(HARD_FAIL);
    const loaded = await loadConfig(projectRoot);
    const { events, attempts } = await run(projectRoot, fastResilience(loaded.config), loaded.rules);

    // Called exactly once - no resilience retry for an unrecognized error.
    expect(attempts).toBe(1);
    expect(events.some((e) => e.type === "flow.step.retried")).toBe(false);
    // The run failed honestly (the failed turn is not silently accepted).
    expect(events.some((e) => e.type === "run.failed")).toBe(true);
  }, 60_000);
});

// Primary always rate-limits; fallback profile points at an OK provider.
const ALWAYS_RATE_LIMITED = `#!/usr/bin/env node
let p = "";
process.stdin.on("data", (c) => (p += c));
process.stdin.on("end", () => { process.stderr.write("429 rate limit\\n"); process.exit(1); });
`;
const OK = `#!/usr/bin/env node
let p = "";
process.stdin.on("data", (c) => (p += c));
process.stdin.on("end", () => { console.log("# Out\\n\\nok"); });
`;

// Usage limit (quota) that includes a "retry after 0 seconds" hint so the wait
// is instant, then succeeds on the second call.
const USAGE_THEN_OK = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const counter = path.join(__dirname, "attempts.txt");
let p = "";
process.stdin.on("data", (c) => (p += c));
process.stdin.on("end", () => {
  let n = 0;
  try { n = parseInt(fs.readFileSync(counter, "utf8"), 10) || 0; } catch {}
  n += 1;
  fs.writeFileSync(counter, String(n));
  if (n < 2) { process.stderr.write("Error: usage limit exceeded; retry after 0 seconds\\n"); process.exit(1); }
  console.log("# Out\\n\\nok");
});
`;
const USAGE_ALWAYS = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const counter = path.join(__dirname, "attempts.txt");
let p = "";
process.stdin.on("data", (c) => (p += c));
process.stdin.on("end", () => {
  let n = 0;
  try { n = parseInt(fs.readFileSync(counter, "utf8"), 10) || 0; } catch {}
  fs.writeFileSync(counter, String(n + 1));
  process.stderr.write("usage limit reached\\n");
  process.exit(1);
});
`;

function withUsageLimit(config: ProjectConfig, over: Partial<ProjectConfig["resilience"]["usageLimit"]>): ProjectConfig {
  return {
    ...config,
    resilience: {
      ...config.resilience,
      usageLimit: { ...config.resilience.usageLimit, ...over },
    },
  };
}

describe("usage-limit handling (unattended-resilience U6)", () => {
  it("waits for the reset window then retries (action: wait)", async () => {
    const projectRoot = await makeRepo(USAGE_THEN_OK);
    const loaded = await loadConfig(projectRoot);
    const config = withUsageLimit(loaded.config, { action: "wait", maxWaits: 2 });
    const { events, attempts } = await run(projectRoot, config, loaded.rules);

    expect(attempts).toBe(2); // failed once, waited (instant), succeeded
    const ul = events.filter((e) => e.type === "provider.usage_limit");
    expect(ul.some((e) => e.data?.action === "wait")).toBe(true);
    expect(events.some((e) => e.type === "flow.step.completed" && e.data?.stepId === "do")).toBe(true);
  }, 60_000);

  it("stops on a usage limit by default - no pointless retries", async () => {
    const projectRoot = await makeRepo(USAGE_ALWAYS);
    const loaded = await loadConfig(projectRoot);
    // default usageLimit.action is "stop"
    const { events, attempts } = await run(projectRoot, loaded.config, loaded.rules);

    expect(attempts).toBe(1); // called once, not retried for seconds
    expect(events.some((e) => e.type === "provider.usage_limit")).toBe(true);
    expect(events.some((e) => e.type === "flow.step.retried")).toBe(false);
    expect(events.some((e) => e.type === "run.failed")).toBe(true);
  }, 60_000);
});

describe("resilience fallback to an alternate profile (U3)", () => {
  it("falls back to the configured profile when retries are exhausted", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-fb-"));
    await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
    await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
    await execa("git", ["config", "user.name", "x"], { cwd: dir });
    await fs.writeFile(path.join(dir, "package.json"), '{"name":"fb"}');
    await execa("git", ["add", "."], { cwd: dir });
    await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
    await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

    const primary = path.join(dir, "primary.js");
    const ok = path.join(dir, "ok.js");
    await fs.writeFile(primary, ALWAYS_RATE_LIMITED, { mode: 0o755 });
    await fs.writeFile(ok, OK, { mode: 0o755 });
    await fs.chmod(primary, 0o755);
    await fs.chmod(ok, 0o755);
    const cli = (cmd: string, args: string[]) =>
      JSON.stringify({ type: "cli", command: cmd, args, input: "stdin" });
    await setConfigValue(dir, "providers.primary", cli("node", [primary]));
    await setConfigValue(dir, "providers.okprov", cli("node", [ok]));
    await setConfigValue(dir, "profiles.claude-balanced.provider", "primary");
    await setConfigValue(dir, "profiles.cheap.provider", "okprov");

    const loaded = await loadConfig(dir);
    const config: ProjectConfig = {
      ...loaded.config,
      resilience: {
        ...loaded.config.resilience,
        rateLimit: {
          ...loaded.config.resilience.rateLimit,
          baseDelayMs: 1,
          maxDelayMs: 3,
          maxRetries: 2,
          fallbackProfile: "cheap",
        },
      },
    };
    const { events } = await run(dir, config, loaded.rules);

    // It retried twice on the primary, then fell back to the cheap profile.
    const retried = events.filter((e) => e.type === "flow.step.retried");
    expect(retried).toHaveLength(2);
    const fb = events.find((e) => e.type === "provider.fallback");
    expect(fb).toBeTruthy();
    expect(fb!.data?.ok).toBe(true);
    expect(fb!.data?.fallbackProfile).toBe("cheap");
    // The fallback succeeded, so the turn completed.
    expect(events.some((e) => e.type === "flow.step.completed" && e.data?.stepId === "do")).toBe(true);
  }, 60_000);
});

// A claude-shaped provider that enforces REAL session semantics: it errors
// "Session ID <U> is already in use." if it ever sees the same `--session-id`
// (open) twice, accepts any `--resume`, registers each open id, logs every
// argv, and rate-limits its FIRST invocation (429) so the resilience loop
// retries WITHIN the one turn. Mirrors the ISSUE-002 (B) collision: the first
// attempt opens U, the retry must NOT re-open U (it must re-mint a fresh id).
const SESSION_AWARE_RATE_LIMIT_THEN_OK = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const argv = process.argv.slice(2);
fs.appendFileSync(process.env.VIBESTRATE_TEST_ARGV_LOG, JSON.stringify(argv) + "\\n");
const flagValue = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };
const openId = flagValue("--session-id");
const resumeId = flagValue("--resume");
const openedFile = path.join(__dirname, "opened.json");
const counter = path.join(__dirname, "attempts.txt");
let p = "";
process.stdin.on("data", (c) => (p += c));
process.stdin.on("end", () => {
  if (openId) {
    let opened = [];
    try { opened = JSON.parse(fs.readFileSync(openedFile, "utf8")); } catch {}
    if (opened.includes(openId)) {
      // Exactly claude's error - and an UNRECOGNISED (hard) failure, so without
      // the re-mint fix this collision would fail the run, not get retried.
      process.stderr.write("Error: Session ID " + openId + " is already in use.\\n");
      process.exit(1);
    }
    opened.push(openId);
    fs.writeFileSync(openedFile, JSON.stringify(opened));
  }
  let n = 0;
  try { n = parseInt(fs.readFileSync(counter, "utf8"), 10) || 0; } catch {}
  n += 1;
  fs.writeFileSync(counter, String(n));
  // First attempt registers the open id THEN rate-limits (claude opens the
  // session before the API call fails), forcing a same-turn retry.
  if (n < 2) { process.stderr.write("Error: 429 rate limit exceeded\\n"); process.exit(1); }
  console.log(JSON.stringify({
    type: "result",
    result: "ok done",
    session_id: openId || resumeId || "no-session",
    model: "fake-claude",
    total_cost_usd: 0.001,
    usage: { input_tokens: 4, output_tokens: 2 },
  }));
});
`;

describe("session-aware retries don't re-open a registered session id (ISSUE-002 B)", () => {
  it("re-mints a fresh --session-id on a rate-limit retry instead of colliding", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-sess-remint-"));
    await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
    await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
    await execa("git", ["config", "user.name", "x"], { cwd: dir });
    await fs.writeFile(path.join(dir, "package.json"), '{"name":"sess"}');
    await execa("git", ["add", "."], { cwd: dir });
    await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
    await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

    const argvLog = path.join(dir, "claude-argv.ndjson");
    const fakeClaude = path.join(dir, "fake-claude.js");
    await fs.writeFile(fakeClaude, SESSION_AWARE_RATE_LIMIT_THEN_OK, { mode: 0o755 });
    await fs.chmod(fakeClaude, 0o755);
    await setConfigValue(
      dir,
      "providers.fake-claude",
      JSON.stringify({
        type: "claude-code",
        command: "node",
        args: [fakeClaude],
        input: "stdin",
        env: { VIBESTRATE_TEST_ARGV_LOG: argvLog },
        settings: { outputFormat: "stream-json" },
      }),
    );
    await setConfigValue(dir, "profiles.claude-balanced.provider", "fake-claude");

    const loaded = await loadConfig(dir);
    const { events } = await run(dir, fastResilience(loaded.config), loaded.rules);

    // Survived the rate limit and completed - without the fix the retry would
    // re-open the same id, hit "already in use" (hard), and fail the run.
    expect(events.some((e) => e.type === "flow.step.completed" && e.data?.stepId === "do")).toBe(true);
    expect(events.some((e) => e.type === "run.failed")).toBe(false);

    // Two invocations, and they used DISTINCT --session-id values (re-mint).
    const argv = (await fs.readFile(argvLog, "utf8"))
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as string[]);
    const openIds = argv
      .map((a) => { const i = a.indexOf("--session-id"); return i >= 0 ? a[i + 1] : null; })
      .filter((v): v is string => v !== null);
    expect(openIds).toHaveLength(2);
    expect(openIds[0]).not.toBe(openIds[1]);
    // No invocation ever re-opened an id a prior one already opened.
    expect(new Set(openIds).size).toBe(openIds.length);
  }, 60_000);
});

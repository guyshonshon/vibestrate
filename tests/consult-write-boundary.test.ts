// Consult's write boundary, tested where the write actually happens.
//
// `runConsult` is read-only, but the HTTP route calls
// `persistConsultPreferenceProposal` after it, and that appends a row to
// .vibestrate/project.yml. A test that asserts runConsult's audit log therefore
// proves nothing about the boundary users care about - it passes with the write
// in place. These tests drive POST /api/consult over the real provider path and
// assert what is true on disk afterwards:
//
//   1. Consult never touches the codebase.
//   2. The one file it can write is .vibestrate/project.yml, and only to append
//      a policy PROPOSAL.
//   3. That proposal is inert: confirmedAt null, tier advise, matcher null - so
//      a model cannot author a rule that blocks a merge.
import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { parse as parseYaml } from "yaml";
import { startServer, type StartedServer } from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({ exitCode: 127, stdout: "", stderr: "" });

/** A fake CLI provider replaying a fixed consult answer, so the real
 *  provider/assist/route path runs without a model. */
function fakeScript(answer: Record<string, unknown>): string {
  return `#!/usr/bin/env node
let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  console.log(${JSON.stringify(JSON.stringify(answer))});
});
`;
}

const BASE_ANSWER = {
  answer: "Use the default flow.",
  confidence: "high",
  caveats: [],
  usedContext: ["project config"],
  recommendedActions: [],
  proposedManualUpdate: null,
  proposedPreference: null,
};

async function makeProject(answer: Record<string, unknown>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-consult-write-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await fs.writeFile(path.join(dir, "src.txt"), "original\n");
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

  const fakeJs = path.join(dir, "fake.js");
  await fs.writeFile(fakeJs, fakeScript(answer), { mode: 0o755 });
  await fs.chmod(fakeJs, 0o755);
  await setConfigValue(
    dir,
    "providers.fake",
    JSON.stringify({ type: "cli", command: "node", args: [fakeJs], input: "stdin" }),
  );
  await setConfigValue(dir, "profiles.claude-balanced.provider", "fake");
  return dir;
}

type PolicyRow = {
  id: string;
  statement: string;
  tier: string;
  matcher: unknown;
  confirmedAt: string | null;
  source: string;
};

async function projectPolicies(dir: string): Promise<PolicyRow[]> {
  const raw = await fs.readFile(path.join(dir, ".vibestrate", "project.yml"), "utf8");
  return ((parseYaml(raw) as { projectPolicies?: PolicyRow[] }).projectPolicies ?? []);
}

async function ask(server: StartedServer, question: string): Promise<Response> {
  return fetch(`${server.url}/api/consult`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question }),
  });
}

let server: StartedServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

describe("POST /api/consult write boundary", () => {
  it("touches no tracked file when the answer proposes nothing", async () => {
    const project = await makeProject(BASE_ANSWER);
    const before = await fs.readFile(path.join(project, ".vibestrate", "project.yml"), "utf8");
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    expect((await ask(server, "Which flow should I use?")).status).toBe(200);

    expect(await fs.readFile(path.join(project, ".vibestrate", "project.yml"), "utf8")).toBe(before);
    expect(await fs.readFile(path.join(project, "src.txt"), "utf8")).toBe("original\n");
    const { stdout } = await execa("git", ["status", "--porcelain"], { cwd: project });
    // Only the untracked scaffolding the harness itself created may appear.
    const dirty = stdout
      .split("\n")
      .map((l) => l.slice(3).trim())
      .filter((p) => p && !p.startsWith(".vibestrate") && p !== "fake.js");
    expect(dirty).toEqual([]);
  }, 60_000);

  it("appends the proposed preference to project.yml as an INERT row", async () => {
    const project = await makeProject({
      ...BASE_ANSWER,
      proposedPreference: {
        statement: "Never use em-dashes in generated copy",
        correction: "Use a plain hyphen",
        rationale: "The owner said so while asking.",
      },
    });
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await ask(server, "stop using em-dashes everywhere");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { preferenceProposalId: string | null };
    expect(body.preferenceProposalId).toBeTruthy();

    const rows = await projectPolicies(project);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.statement).toBe("Never use em-dashes in generated copy");
    // The three properties that make the write safe. `confirmedAt: null` is the
    // gate both consumers check (supervisor/policy-block.ts,
    // core/run-engine/flow-verdict.ts): unconfirmed is never injected and never
    // enforced. `tier: advise` + `matcher: null` are forced by proposePolicy
    // regardless of caller intent, so a model cannot author a merge-cap.
    expect(row.confirmedAt).toBeNull();
    expect(row.tier).toBe("advise");
    expect(row.matcher).toBeNull();
    expect(row.source).toBe("supervisor-proposed");
  }, 60_000);

  it("leaves the codebase untouched even when it does propose a policy", async () => {
    const project = await makeProject({
      ...BASE_ANSWER,
      proposedPreference: {
        statement: "Always add a test with a bug fix",
        correction: null,
        rationale: "Stated while asking.",
      },
    });
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    expect((await ask(server, "always add a test with a bug fix")).status).toBe(200);

    expect(await fs.readFile(path.join(project, "src.txt"), "utf8")).toBe("original\n");
    const { stdout } = await execa("git", ["status", "--porcelain"], { cwd: project });
    const dirty = stdout
      .split("\n")
      .map((l) => l.slice(3).trim())
      .filter((p) => p && !p.startsWith(".vibestrate") && p !== "fake.js");
    expect(dirty).toEqual([]);
    // No run was created either - consult is not a doorway into the runner.
    const runs = await fs
      .readdir(path.join(project, ".vibestrate", "runs"))
      .catch(() => [] as string[]);
    expect(runs.filter((r) => r !== "consult")).toEqual([]);
  }, 60_000);
});

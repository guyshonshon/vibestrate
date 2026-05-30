import { describe, it, expect, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../../src/setup/setup-service.js";
import { setConfigValue } from "../../src/setup/config-update-service.js";
import { Orchestrator } from "../../src/core/orchestrator.js";
import { loadConfig } from "../../src/project/config-loader.js";
import { readActionLog } from "../../src/safety/action-broker.js";
import type { ProviderDetectionRunner } from "../../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

let cleanup: string[] = [];
afterEach(async () => {
  for (const d of cleanup) await fs.rm(d, { recursive: true, force: true });
  cleanup = [];
});

/**
 * End-to-end S4: with strictApplyOnly on, the executor runs read-only and emits
 * a diff (here a bare unified diff). The orchestrator's apply gateway must apply
 * it through the broker — the worktree changes, an apply-only file.patch record
 * lands, and the run still reaches merge_ready.
 */
async function makeRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-strict-"));
  cleanup.push(dir);
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

  // The executor emits a BARE unified diff (creating src/feature.ts). The apply
  // gateway's bare-diff path extracts it — no fenced-block escaping needed here.
  const diff =
    "# Implementation\\n" +
    "diff --git a/src/feature.ts b/src/feature.ts\\n" +
    "new file mode 100644\\n" +
    "--- /dev/null\\n" +
    "+++ b/src/feature.ts\\n" +
    "@@ -0,0 +1 @@\\n" +
    "+export const feature = true";

  const fake = path.join(dir, "fake-claude.js");
  await fs.writeFile(
    fake,
    `#!/usr/bin/env node
let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  let r='# Plan\\nOk.';
  if (i.includes('Vibestrate Agent: reviewer')) r='# Review\\n\\nDECISION: APPROVED';
  else if (i.includes('Vibestrate Agent: verifier')) r='VERIFICATION: PASSED';
  else if (i.includes('Vibestrate Agent: architect')) r='# Architecture\\nFine.';
  else if (i.includes('Vibestrate Agent: executor')) r='${diff}';
  else if (i.includes('Vibestrate Agent: fixer')) r='# Fix\\nDone.';
  console.log(JSON.stringify({type:'result',result:r,session_id:'s',model:'claude-opus-4-7',total_cost_usd:0,usage:{input_tokens:10,output_tokens:5}}));
});
`,
    { mode: 0o755 },
  );
  await fs.chmod(fake, 0o755);
  await setConfigValue(
    dir,
    "providers.fake",
    JSON.stringify({
      type: "claude-code",
      command: "node",
      args: [fake],
      input: "stdin",
      settings: { outputFormat: "stream-json" },
    }),
  );
  await setConfigValue(dir, "profiles.claude-balanced.provider", "fake");
  await setConfigValue(dir, "policies.strictApplyOnly", "true");
  return dir;
}

describe("S4 strict apply-only — end to end", () => {
  it("applies the executor's proposed diff through the gateway and reaches merge_ready", async () => {
    const dir = await makeRepo();
    const loaded = await loadConfig(dir);
    const out = await new Orchestrator({
      projectRoot: dir,
      config: loaded.config,
      rules: loaded.rules,
      task: "strict apply-only e2e",
      isGitRepo: true,
      onProgress: () => {},
    }).run();

    expect(out.state.status).toBe("merge_ready");

    // The gateway applied the diff into the run's worktree (NOT the project root).
    const wt = out.worktreePath!;
    expect(wt).toBeTruthy();
    expect(await fs.readFile(path.join(wt, "src/feature.ts"), "utf8")).toContain(
      "export const feature = true",
    );
    // Project root is untouched.
    await expect(
      fs.access(path.join(dir, "src/feature.ts")),
    ).rejects.toThrow();

    // An apply-only file.patch record with ok evidence is in the audit log.
    const log = await readActionLog(dir, out.runId);
    const applyOnly = log.find(
      (r) =>
        r.request.kind === "file.patch" &&
        r.request.subject.op === "apply-only",
    );
    expect(applyOnly).toBeDefined();
    expect(applyOnly!.evidence?.ok).toBe(true);
  }, 30_000);
});

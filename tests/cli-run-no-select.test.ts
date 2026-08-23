import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { buildVibestrateProgram } from "../src/cli/index.js";
import { runRunCommand } from "../src/cli/commands/run.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

// ── `--no-select` is the per-run brake on the adaptive spec-up detour ──────────
// A plan-worthy brief is routed into the read-only spec-up chain FIRST, and that
// is deliberate even with --flow: the chosen flow becomes spec-up's build target
// rather than being replaced (see chooseRunFlow). `noSelect` is the documented
// per-run escape - runSpecSchema.select says "false = skip selection, use the
// default flow (--no-select)" - and the dashboard passes it.
//
// The CLI did neither half: `--no-select` was never registered as a flag, and
// the call site passed only `forceSelect`, never `noSelect`. So the documented
// escape hatch did not exist on the CLI at all and the ONLY way to stop the
// detour was the project-wide config `adaptiveSpecUp: "off"` - a per-run
// decision that could only be made permanently.

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

const FAKE = `#!/usr/bin/env node
let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  if (i.includes('Vibestrate Agent: reviewer')) console.log('# Review\\nDECISION: APPROVED');
  else if (i.includes('Vibestrate Agent: verifier')) console.log('VERIFICATION: PASSED');
  else console.log('# Plan\\nok');
});
`;

// Plan-worthy by classifyPlanWorthy: a build verb plus "a <qualifier> <scope
// noun>" - "store" is a scope noun. This is the brief that triggers the detour.
const PLAN_WORTHY = "build a mini ecommerce store";

/** Which flow a finished run actually executed, by the artifacts it left. */
async function stepDirs(projectRoot: string): Promise<string[]> {
  const runsDir = path.join(projectRoot, ".vibestrate", "runs");
  const runs = await fs.readdir(runsDir);
  const out: string[] = [];
  for (const r of runs) {
    const flows = path.join(runsDir, r, "artifacts", "flows");
    for (const s of await fs.readdir(flows).catch(() => [])) out.push(s);
  }
  return out;
}

describe("vibe run --no-select", () => {
  it("is a registered flag on `vibe run`", () => {
    const run = buildVibestrateProgram()
      .commands.find((c) => c.name() === "run");
    expect(run, "no `run` command").toBeDefined();
    const flags = run!.options.map((o) => o.flags);
    expect(flags).toContain("--select");
    // Commander does NOT derive `--no-select` from `--select`; it has to be
    // declared, or the flag simply does not exist.
    expect(flags).toContain("--no-select");
  });

  describe("against a plan-worthy brief", () => {
    let dir: string;

    beforeEach(async () => {
      dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-noselect-"));
      await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
      await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
      await execa("git", ["config", "user.name", "x"], { cwd: dir });
      await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
      await execa("git", ["add", "."], { cwd: dir });
      await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
      await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
      await setConfigValue(dir, "git.worktreeDir", path.join(dir, "worktrees"));
      const fakeJs = path.join(dir, "fake.js");
      await fs.writeFile(fakeJs, FAKE, { mode: 0o755 });
      await fs.chmod(fakeJs, 0o755);
      await setConfigValue(
        dir,
        "providers.fake",
        JSON.stringify({ type: "cli", command: "node", args: [fakeJs], input: "stdin" }),
      );
      await setConfigValue(dir, "profiles.claude-balanced.provider", "fake");
    });

    it("detours into spec-up by default (the behaviour being opted out of)", async () => {
      const cwd = process.cwd();
      process.chdir(dir);
      try {
        await runRunCommand(PLAN_WORTHY, {});
      } finally {
        process.chdir(cwd);
      }
      expect(await stepDirs(dir)).toContain("intake");
    }, 60_000);

    it("runs the flow directly when --no-select is passed", async () => {
      const cwd = process.cwd();
      process.chdir(dir);
      try {
        await runRunCommand(PLAN_WORTHY, { select: false });
      } finally {
        process.chdir(cwd);
      }
      const steps = await stepDirs(dir);
      expect(steps, "still detoured into spec-up").not.toContain("intake");
      expect(steps, "did not run a real flow either").toContain("plan");
    }, 60_000);
  });
});

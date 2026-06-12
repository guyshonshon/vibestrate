import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { buildClaudeCodeArgs } from "../src/providers/claude-code-settings.js";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { Orchestrator } from "../src/core/orchestrator.js";
import { loadConfig } from "../src/project/config-loader.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

// Root-cause fix: vibestrate's `code_write` seat permission governs only its own
// action broker; it never reached the claude CLI, so headless `claude -p` ran in
// its default (ask) permission mode and silently denied every write. The fix
// derives the claude permission mode from the turn's resolved (post-override)
// write capability and injects `--permission-mode acceptEdits` for a write-capable
// seat on a claude-code provider.

describe("buildClaudeCodeArgs - write capability -> claude permission mode", () => {
  it("injects --permission-mode acceptEdits when write-capable, even with no settings", () => {
    // No explicit settings -> the streaming default kicks in too (P8b: live
    // transcript works out of the box).
    expect(buildClaudeCodeArgs(["-p"], undefined, { writeCapable: true })).toEqual([
      "-p",
      "--permission-mode",
      "acceptEdits",
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages",
    ]);
  });

  it("injects acceptEdits when write-capable and settings carry no explicit permissionMode", () => {
    const args = buildClaudeCodeArgs(["-p"], { outputFormat: "text" }, { writeCapable: true });
    expect(args).toContain("--permission-mode");
    expect(args).toContain("acceptEdits");
  });

  it("does NOT inject for a read-only seat (writeCapable false OR omitted)", () => {
    expect(
      buildClaudeCodeArgs(["-p"], undefined, { writeCapable: false }),
    ).not.toContain("--permission-mode");
    // Omitted opts = treat as not write-capable (preserves non-orchestrator callers).
    expect(buildClaudeCodeArgs(["-p"], undefined)).not.toContain(
      "--permission-mode",
    );
    expect(
      buildClaudeCodeArgs(["-p"], { outputFormat: "text" }, { writeCapable: false }),
    ).not.toContain("--permission-mode");
  });

  it("safeMode is strictly opt-in: absent/false adds nothing, true adds the flag once", () => {
    expect(buildClaudeCodeArgs(["-p"], undefined)).not.toContain("--safe-mode");
    expect(buildClaudeCodeArgs(["-p"], { safeMode: false })).not.toContain(
      "--safe-mode",
    );
    const on = buildClaudeCodeArgs(["-p"], { safeMode: true });
    expect(on.filter((a) => a === "--safe-mode")).toHaveLength(1);
    // Manual arg not duplicated.
    const manual = buildClaudeCodeArgs(["-p", "--safe-mode"], { safeMode: true });
    expect(manual.filter((a) => a === "--safe-mode")).toHaveLength(1);
  });

  it("streaming default: explicit outputFormat or manual --output-format args win", () => {
    // Explicit text: no stream flags at all.
    const text = buildClaudeCodeArgs(["-p"], { outputFormat: "text" });
    expect(text).toEqual(["-p", "--output-format", "text"]);
    // Raw args already carry the flag: builder adds nothing.
    const manual = buildClaudeCodeArgs(["-p", "--output-format", "json"], undefined);
    expect(manual.filter((a) => a === "--output-format")).toHaveLength(1);
    // Explicit stream-json WITHOUT includePartialMessages: no partials flag
    // (explicit settings keep full control; only the default brings partials).
    const explicitStream = buildClaudeCodeArgs(["-p"], { outputFormat: "stream-json" });
    expect(explicitStream).toContain("--verbose");
    expect(explicitStream).not.toContain("--include-partial-messages");
  });

  it("an explicit permissionMode always wins - no acceptEdits override, no duplicate flag", () => {
    const args = buildClaudeCodeArgs(["-p"], { permissionMode: "plan" }, { writeCapable: true });
    expect(args.filter((a) => a === "--permission-mode")).toHaveLength(1);
    expect(args).toContain("plan");
    expect(args).not.toContain("acceptEdits");
  });
});

// Integration: prove the orchestrator wires the POST-OVERRIDE `profile.allowWrite`
// into the spawn (not the seat name, not the pre-override profile). The reviewer's
// #1 risk was a read-only / apply-only seat leaking the write grant; these runs
// assert it can't. A claude-code-typed fake (command: node) is used so the real
// buildClaudeCodeArgs path runs and records the spawned args in agent-metrics.

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function readRoleArgs(
  dir: string,
  runId: string,
  rolePrefix: string,
): Promise<string[] | null> {
  const mdir = path.join(dir, ".vibestrate", "runs", runId, "agent-metrics");
  const files = await fs.readdir(mdir).catch(() => [] as string[]);
  const f = files.find((x) => x.startsWith(`${rolePrefix}-`));
  if (!f) return null;
  const j = JSON.parse(await fs.readFile(path.join(mdir, f), "utf8")) as { args?: string[] };
  return j.args ?? null;
}

async function makeRepoAndRun(opts: { strictApplyOnly: boolean }): Promise<{
  dir: string;
  runId: string;
}> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibe-write-perm-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

  const fakeJs = path.join(dir, "fake.js");
  await fs.writeFile(
    fakeJs,
    `#!/usr/bin/env node
let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  if (i.includes('Vibestrate Agent: reviewer')) console.log('# Review\\n\\nDECISION: APPROVED');
  else if (i.includes('Vibestrate Agent: verifier')) console.log('VERIFICATION: PASSED');
  else if (i.includes('Vibestrate Agent: planner')) console.log('# Plan');
  else if (i.includes('Vibestrate Agent: architect')) console.log('# Architecture\\nNothing risky.');
  else if (i.includes('Vibestrate Agent: executor')) console.log('# Implementation Summary\\nNone.');
  else if (i.includes('Vibestrate Agent: fixer')) console.log('# Fix\\nNone.');
  else console.log('?');
});
`,
    { mode: 0o755 },
  );
  await fs.chmod(fakeJs, 0o755);

  // A claude-code-typed provider whose command is the fake node script, so the
  // real claude-code arg builder runs (and records its args in agent-metrics).
  await setConfigValue(
    dir,
    "providers.claude",
    // The fake emits plain text, so it declares text output (otherwise the
    // P8b streaming default would route it through the stream-json adapter).
    JSON.stringify({
      type: "claude-code",
      command: "node",
      args: [fakeJs],
      input: "stdin",
      settings: { outputFormat: "text" },
    }),
  );
  await setConfigValue(dir, "profiles.claude-balanced.provider", "claude");
  if (opts.strictApplyOnly) {
    await setConfigValue(dir, "policies.strictApplyOnly", "true");
  }

  const loaded = await loadConfig(dir);
  const orch = new Orchestrator({
    projectRoot: dir,
    config: loaded.config,
    rules: loaded.rules,
    task: "make a small change",
    isGitRepo: true,
    onProgress: () => {},
  });
  const result = await orch.run();
  return { dir, runId: result.runId };
}

describe("orchestrator -> claude write-permission wiring (integration)", () => {
  it("grants acceptEdits to the code_write executor, never to read-only seats", async () => {
    const { dir, runId } = await makeRepoAndRun({ strictApplyOnly: false });

    const exec = await readRoleArgs(dir, runId, "executor");
    expect(exec, "executor must have spawned").not.toBeNull();
    expect(exec).toContain("--permission-mode");
    expect(exec).toContain("acceptEdits");

    // Read-only seats that always run before/at implement: no write grant.
    for (const role of ["planner", "architect"]) {
      const args = await readRoleArgs(dir, runId, role);
      expect(args, `${role} must have spawned`).not.toBeNull();
      expect(args, `${role} (read_only) must NOT get a write grant`).not.toContain(
        "--permission-mode",
      );
    }
  }, 60_000);

  it("strict apply-only forces the code_write executor read-only -> NO write grant", async () => {
    // The escalation guard: apply-only collapses effectivePermissions to read_only,
    // so profile.allowWrite is false and the executor must emit a diff, not write.
    // (this.readOnly investigation runs share the exact same code path.)
    const { dir, runId } = await makeRepoAndRun({ strictApplyOnly: true });
    const exec = await readRoleArgs(dir, runId, "executor");
    expect(exec, "executor must have spawned").not.toBeNull();
    expect(exec).not.toContain("--permission-mode");
  }, 60_000);
});

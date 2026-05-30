import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { runValidationCommands } from "../../src/core/validation-runner.js";
import { writeMcpConfigFile } from "../../src/mcp/mcp-config-writer.js";
import { TerminalService } from "../../src/terminal/terminal-service.js";
import { ArtifactStore } from "../../src/core/artifact-store.js";
import {
  DefaultActionBroker,
  readActionLog,
  type ActionEvaluator,
} from "../../src/safety/action-broker.js";

/**
 * S0 — Action Broker gating for command.run, file.write, terminal.create.
 * Each: a successful effect records evidence; a deny evaluator fails it closed.
 */

const denyKind =
  (kind: string): ActionEvaluator =>
  (req) =>
    req.kind === kind
      ? { effect: "deny", ruleIds: ["test"], reason: `no ${kind}` }
      : null;

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-eg-"));
}

describe("S0 command.run gating (validation runner)", () => {
  it("records command.run evidence on allow, skips on deny", async () => {
    const root = await tempProject();
    try {
      const store = new ArtifactStore(root, "run-1");
      await store.init();

      const okBroker = new DefaultActionBroker(root, "run-1");
      const ok = await runValidationCommands({
        commands: ["true"],
        cwd: root,
        store,
        broker: okBroker,
        runId: "run-1",
      });
      expect(ok.summary).toEqual({ total: 1, passed: 1, failed: 0 });
      let log = await readActionLog(root, "run-1");
      const cmdRec = log.find((r) => r.request.kind === "command.run");
      expect(cmdRec?.evidence?.ok).toBe(true);
      expect(cmdRec?.evidence?.data?.exitCode).toBe(0);

      const store2 = new ArtifactStore(root, "run-2");
      await store2.init();
      const denyBroker = new DefaultActionBroker(root, "run-2", {
        evaluators: [denyKind("command.run")],
      });
      const denied = await runValidationCommands({
        commands: ["touch SHOULD_NOT_EXIST"],
        cwd: root,
        store: store2,
        broker: denyBroker,
        runId: "run-2",
      });
      // Fail-closed: command counted as failed, never executed.
      expect(denied.summary).toEqual({ total: 1, passed: 0, failed: 1 });
      expect(denied.commands[0]!.exitCode).toBe(126);
      await expect(
        fs.access(path.join(root, "SHOULD_NOT_EXIST")),
      ).rejects.toThrow();
      log = await readActionLog(root, "run-2");
      expect(log.filter((r) => r.request.kind === "command.run")).toHaveLength(1);
      expect(log[0]!.decision.effect).toBe("deny");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe("S0 file.write gating (mcp config)", () => {
  const servers = [
    { name: "demo", config: { command: "echo", args: ["hi"] } },
  ] as never;

  it("records file.write evidence on allow", async () => {
    const root = await tempProject();
    try {
      const broker = new DefaultActionBroker(root, "run-1");
      const file = await writeMcpConfigFile({
        dir: path.join(root, "cfg"),
        servers,
        broker,
        runId: "run-1",
      });
      expect(file).toBeTruthy();
      expect(await fs.readFile(file!, "utf8")).toContain("demo");
      const log = await readActionLog(root, "run-1");
      const rec = log.find((r) => r.request.kind === "file.write");
      expect(rec?.evidence?.ok).toBe(true);
      // The subject carries the path only, never the (token-bearing) body.
      expect(rec?.request.subject.path).toBe(file);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("fails closed (throws) and writes nothing when denied", async () => {
    const root = await tempProject();
    try {
      const broker = new DefaultActionBroker(root, "run-1", {
        evaluators: [denyKind("file.write")],
      });
      await expect(
        writeMcpConfigFile({
          dir: path.join(root, "cfg"),
          servers,
          broker,
          runId: "run-1",
        }),
      ).rejects.toThrow(/file\.write/);
      await expect(
        fs.access(path.join(root, "cfg", "mcp.json")),
      ).rejects.toThrow();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe("S0 terminal.create gating", () => {
  // Minimal fake PTY driver — never actually spawns a shell.
  const fakeDriver = {
    available: true,
    unavailableReason: null,
    spawn: () => ({
      onData: () => () => {},
      onExit: () => () => {},
      write: () => {},
      resize: () => {},
      kill: () => {},
    }),
  } as never;

  async function repoWithRun(): Promise<{ root: string; runId: string }> {
    const root = await tempProject();
    const runId = "tm-run";
    const { ensureDir } = await import("../../src/utils/fs.js");
    const { runDir, runStatePath } = await import("../../src/utils/paths.js");
    const { runStateSchema } = await import("../../src/core/state-machine.js");
    const { writeJson } = await import("../../src/utils/json.js");
    const wt = path.join(
      await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-eg-wt-")),
      "wt",
    );
    await fs.mkdir(wt, { recursive: true });
    await ensureDir(runDir(root, runId));
    const ts = new Date().toISOString();
    await writeJson(
      runStatePath(root, runId),
      runStateSchema.parse({
        runId,
        task: "t",
        status: "merge_ready",
        projectRoot: root,
        worktreePath: wt,
        branchName: "b",
        reviewLoopCount: 0,
        maxReviewLoops: 2,
        startedAt: ts,
        updatedAt: ts,
        finalDecision: null,
        verification: null,
        error: null,
      }),
    );
    // Enable the terminal feature.
    await fs.mkdir(path.join(root, ".vibestrate"), { recursive: true });
    await fs.writeFile(
      path.join(root, ".vibestrate/project.yml"),
      [
        "project: { name: demo, type: generic }",
        "providers: { fake: { type: cli, command: /bin/true, inputMode: stdin } }",
        "profiles: { fake-balanced: { provider: fake } }",
        "crews: { default: { roles: { reviewer: { seats: [reviewer], profile: fake-balanced, prompt: reviewer, permissions: read } } } }",
        "defaultCrew: default",
        "policies: { allowInteractiveTerminal: true }",
        "",
      ].join("\n"),
    );
    return { root, runId };
  }

  it("refuses terminal.create when denied (403), records nothing successful", async () => {
    const { root, runId } = await repoWithRun();
    try {
      const denyBroker = new DefaultActionBroker(root, runId, {
        evaluators: [denyKind("terminal.create")],
      });
      const svc = new TerminalService(root, fakeDriver, {
        brokerFor: () => denyBroker,
      });
      await expect(
        svc.create({ runId, cols: 80, rows: 24 }),
      ).rejects.toThrow(/terminal\.create/);
      const log = await readActionLog(root, runId);
      const rec = log.filter((r) => r.request.kind === "terminal.create");
      expect(rec).toHaveLength(1);
      expect(rec[0]!.decision.effect).toBe("deny");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

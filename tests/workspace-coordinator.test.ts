import { afterEach, beforeEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { WorkspaceStore } from "../src/workspace/workspace-store.js";
import {
  resolveTargetProject,
  WorkspaceSafetyError,
} from "../src/workspace/workspace-safety.js";
import {
  abortRunInProject,
  listActiveRunsInProject,
} from "../src/workspace/workspace-coordinator.js";
import {
  WorkspaceQueueStore,
  drainWorkspaceQueue,
} from "../src/workspace/workspace-queue.js";

let prevEnv: string | undefined;
let regFile: string;

beforeEach(async () => {
  prevEnv = process.env.VIBESTRATE_WORKSPACE_FILE;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-wsc-"));
  regFile = path.join(dir, "workspace.json");
  process.env.VIBESTRATE_WORKSPACE_FILE = regFile;
});

afterEach(() => {
  if (prevEnv === undefined) delete process.env.VIBESTRATE_WORKSPACE_FILE;
  else process.env.VIBESTRATE_WORKSPACE_FILE = prevEnv;
});

/** Temp project dir; `initialized` writes a `.vibestrate/project.yml`. */
async function mkProject(label: string, initialized = true): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `vibestrate-${label}-`));
  if (initialized) {
    await fs.mkdir(path.join(root, ".vibestrate"), { recursive: true });
    await fs.writeFile(path.join(root, ".vibestrate", "project.yml"), "version: 1\n");
  }
  return root;
}

async function register(root: string, label: string): Promise<void> {
  await new WorkspaceStore(regFile).register({ root, label });
}

async function writeRun(
  root: string,
  runId: string,
  status: string,
): Promise<void> {
  const dir = path.join(root, ".vibestrate", "runs", runId);
  await fs.mkdir(dir, { recursive: true });
  const at = new Date().toISOString();
  await fs.writeFile(
    path.join(dir, "state.json"),
    JSON.stringify({
      runId,
      task: `task ${runId}`,
      status,
      projectRoot: root,
      worktreePath: null,
      branchName: null,
      startedAt: at,
      updatedAt: at,
    }),
  );
}

describe("resolveTargetProject (slice f safety gate)", () => {
  it("accepts a registered + initialized project by path and by label", async () => {
    const root = await mkProject("ok");
    await register(root, "okproj");
    const byPath = await resolveTargetProject(root, { currentRoot: "/served" });
    expect(byPath.root).toBe(path.resolve(root));
    const byLabel = await resolveTargetProject("okproj", { currentRoot: "/served" });
    expect(byLabel.label).toBe("okproj");
  });

  it("refuses an unregistered project", async () => {
    const root = await mkProject("stray");
    // not registered
    await expect(
      resolveTargetProject(root, { currentRoot: "/served" }),
    ).rejects.toBeInstanceOf(WorkspaceSafetyError);
  });

  it("refuses a registered but uninitialized project", async () => {
    const root = await mkProject("bare", false);
    await register(root, "bare");
    await expect(
      resolveTargetProject("bare", { currentRoot: "/served" }),
    ).rejects.toThrow(/not initialized|no \.vibestrate/i);
  });

  it("always allows the current (served) root even if unregistered", async () => {
    const root = await mkProject("served");
    const r = await resolveTargetProject(root, { currentRoot: root });
    expect(r.isCurrent).toBe(true);
  });
});

describe("abortRunInProject + listActiveRunsInProject", () => {
  it("aborts a non-terminal run via the target's state machine", async () => {
    const root = await mkProject("ab");
    await register(root, "ab");
    await writeRun(root, "r1", "executing");

    const active = await listActiveRunsInProject(root);
    expect(active.map((a) => a.runId)).toEqual(["r1"]);

    const r = await abortRunInProject(
      { project: "ab", runId: "r1" },
      { currentRoot: "/served" },
    );
    expect(r.alreadyTerminal).toBe(false);
    expect(r.status).toBe("aborted");

    const after = JSON.parse(
      await fs.readFile(path.join(root, ".vibestrate", "runs", "r1", "state.json"), "utf8"),
    );
    expect(after.status).toBe("aborted");

    // Aborting again is a no-op terminal.
    const again = await abortRunInProject(
      { project: "ab", runId: "r1" },
      { currentRoot: "/served" },
    );
    expect(again.alreadyTerminal).toBe(true);
  });

  it("refuses to abort in an unregistered project", async () => {
    const root = await mkProject("nope");
    await writeRun(root, "r1", "executing");
    await expect(
      abortRunInProject({ project: root, runId: "r1" }, { currentRoot: "/served" }),
    ).rejects.toBeInstanceOf(WorkspaceSafetyError);
  });
});

describe("drainWorkspaceQueue (slice d caps)", () => {
  it("respects the per-project cap, leaving blocked entries queued", async () => {
    const a = await mkProject("a");
    const b = await mkProject("b");
    await register(a, "A");
    await register(b, "B");

    const store = new WorkspaceQueueStore();
    await store.enqueue({ project: "A", task: "a1" });
    await store.enqueue({ project: "A", task: "a2" });
    await store.enqueue({ project: "B", task: "b1" });

    const launched: string[] = [];
    const result = await drainWorkspaceQueue({
      currentRoot: "/served",
      queueStore: store,
      maxConcurrent: 5,
      maxPerProject: 1,
      launch: async (req) => {
        launched.push(req.task);
        return { ok: true, root: "x", label: req.project, pid: 1, argv: [], message: "ok" };
      },
    });

    expect(launched.sort()).toEqual(["a1", "b1"]);
    expect(result.launched.length).toBe(2);
    expect(result.skipped.some((s) => s.reason === "project-cap")).toBe(true);
    expect(result.remaining).toBe(1); // a2 stays queued
    const left = await store.list();
    expect(left.map((e) => e.request.task)).toEqual(["a2"]);
  });

  it("respects the global cap", async () => {
    const a = await mkProject("a");
    await register(a, "A");
    const store = new WorkspaceQueueStore();
    await store.enqueue({ project: "A", task: "a1" });
    await store.enqueue({ project: "A", task: "a2" });

    const launched: string[] = [];
    const result = await drainWorkspaceQueue({
      currentRoot: "/served",
      queueStore: store,
      maxConcurrent: 1,
      maxPerProject: 5,
      launch: async (req) => {
        launched.push(req.task);
        return { ok: true, root: "x", label: req.project, pid: 1, argv: [], message: "ok" };
      },
    });
    expect(launched).toEqual(["a1"]);
    expect(result.skipped.some((s) => s.reason === "global-cap")).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it("drops an unsafe entry from the queue and reports it", async () => {
    const store = new WorkspaceQueueStore();
    await store.enqueue({ project: "/does/not/exist", task: "ghost" });
    const result = await drainWorkspaceQueue({
      currentRoot: "/served",
      queueStore: store,
      launch: async (req) => ({
        ok: true,
        root: "x",
        label: req.project,
        pid: 1,
        argv: [],
        message: "ok",
      }),
    });
    expect(result.launched.length).toBe(0);
    expect(result.skipped[0]?.reason).toBe("unsafe");
    expect(result.remaining).toBe(0); // unsafe entry removed
  });
});

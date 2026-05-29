import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import type {
  DriverSpawnOpts,
  TerminalDriver,
  TerminalProcess,
} from "../src/terminal/terminal-types.js";

/**
 * Build a fake terminal driver. Records every spawn for assertion. The
 * production driver is node-pty; tests never load it so they pass on
 * machines without a C++ toolchain.
 */
type Recorded = DriverSpawnOpts & {
  proc: TerminalProcess;
  data: (chunk: string) => void;
  exit: (code: number) => void;
};

function makeFakeDriver(opts?: { available?: boolean; reason?: string }): {
  driver: TerminalDriver;
  spawned: Recorded[];
} {
  const spawned: Recorded[] = [];
  const driver: TerminalDriver = {
    available: opts?.available ?? true,
    unavailableReason: opts?.available === false ? (opts.reason ?? "fake-unavailable") : null,
    spawn(input) {
      const dataHandlers = new Set<(c: string) => void>();
      const exitHandlers = new Set<(info: { exitCode: number; signal: number | null }) => void>();
      let exited = false;
      const proc: TerminalProcess = {
        pid: 99999,
        write: (_d) => {},
        resize: (_c, _r) => {},
        kill: (_sig) => {
          if (exited) return;
          exited = true;
          for (const h of exitHandlers) h({ exitCode: 0, signal: null });
        },
        onData: (cb) => {
          dataHandlers.add(cb);
          return () => dataHandlers.delete(cb);
        },
        onExit: (cb) => {
          exitHandlers.add(cb);
          return () => exitHandlers.delete(cb);
        },
      };
      const rec: Recorded = {
        ...input,
        proc,
        data: (chunk) => {
          for (const h of dataHandlers) h(chunk);
        },
        exit: (code) => {
          if (exited) return;
          exited = true;
          for (const h of exitHandlers) h({ exitCode: code, signal: null });
        },
      };
      spawned.push(rec);
      return proc;
    },
  };
  return { driver, spawned };
}

async function makeProject(opts: {
  allowTerminal: boolean;
  worktreeInsideProjectRoot?: boolean;
}): Promise<{ project: string; runId: string; worktree: string }> {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-term-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: project });
  await execa("git", ["config", "user.email", "x@x"], { cwd: project });
  await execa("git", ["config", "user.name", "x"], { cwd: project });
  await fs.writeFile(path.join(project, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: project });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: project });

  await fs.mkdir(path.join(project, ".vibestrate"), { recursive: true });
  await fs.writeFile(
    path.join(project, ".vibestrate/project.yml"),
    [
      "project: { name: demo, type: generic }",
      "providers:",
      "  fake: { type: cli, command: /bin/true, inputMode: stdin }",
      "profiles: { fake-balanced: { provider: fake } }",
      "crews: { default: { roles: { reviewer: { fills: [reviewer], profile: fake-balanced, prompt: reviewer, permissions: read } } } }",
      "defaultCrew: default",
      "commands:",
      '  validate: []',
      "policies:",
      `  allowInteractiveTerminal: ${opts.allowTerminal ? "true" : "false"}`,
      "",
    ].join("\n"),
  );

  // Worktree
  const runId = "20260512-120000-fixture";
  const worktreeBase = opts.worktreeInsideProjectRoot
    ? path.join(project, "inside-wt")
    : path.join(await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-term-wt-")), "wt");
  await execa(
    "git",
    ["worktree", "add", "-b", "vibestrate/test", worktreeBase, "main"],
    { cwd: project },
  );

  // state.json
  const runDir = path.join(project, ".vibestrate/runs", runId);
  await fs.mkdir(path.join(runDir, "artifacts"), { recursive: true });
  const ts = new Date().toISOString();
  await fs.writeFile(
    path.join(runDir, "state.json"),
    JSON.stringify({
      runId,
      task: "fixture",
      status: "merge_ready",
      projectRoot: project,
      worktreePath: worktreeBase,
      branchName: "vibestrate/test",
      reviewLoopCount: 0,
      maxReviewLoops: 2,
      startedAt: ts,
      updatedAt: ts,
      finalDecision: "APPROVED",
      verification: "PASSED",
      error: null,
    }),
  );
  return { project, runId, worktree: worktreeBase };
}

let server: StartedServer | null = null;
async function startWith(
  projectRoot: string,
  driver: TerminalDriver,
): Promise<StartedServer> {
  server = await startServer({
    projectRoot,
    port: 0,
    host: "127.0.0.1",
    terminalDriver: driver,
  });
  return server;
}

afterEach(async () => {
  if (server) await server.close();
  server = null;
});

describe("terminal policy gate", () => {
  it("availability reports policyEnabled=false when the policy is off", async () => {
    const { project } = await makeProject({ allowTerminal: false });
    const { driver } = makeFakeDriver();
    const srv = await startWith(project, driver);
    const r = await fetch(`${srv.url}/api/terminal/availability`).then((x) =>
      x.json(),
    );
    expect(r.policyEnabled).toBe(false);
    expect(r.driverAvailable).toBe(true);
    expect(typeof r.reason).toBe("string");
  });

  it("refuses create when the policy is off", async () => {
    const { project, runId } = await makeProject({ allowTerminal: false });
    const { driver } = makeFakeDriver();
    const srv = await startWith(project, driver);
    const res = await fetch(`${srv.url}/api/terminal/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId, cols: 80, rows: 24 }),
    });
    expect(res.status).toBe(403);
  });

  it("refuses create when the driver is unavailable, even if policy is on", async () => {
    const { project, runId } = await makeProject({ allowTerminal: true });
    const { driver } = makeFakeDriver({
      available: false,
      reason: "node-pty did not load.",
    });
    const srv = await startWith(project, driver);
    const res = await fetch(`${srv.url}/api/terminal/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId, cols: 80, rows: 24 }),
    });
    expect(res.status).toBe(403);
    const r = (await res.json()) as { error: string };
    expect(r.error).toMatch(/node-pty/);
  });
});

describe("terminal create: CWD safety", () => {
  it("uses the run's worktree as CWD — never project root or arbitrary path", async () => {
    const { project, runId, worktree } = await makeProject({
      allowTerminal: true,
    });
    const { driver, spawned } = makeFakeDriver();
    const srv = await startWith(project, driver);
    const res = await fetch(`${srv.url}/api/terminal/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId, cols: 80, rows: 24 }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { session: { cwd: string } };
    expect(body.session.cwd).toBe(path.resolve(worktree));
    expect(body.session.cwd).not.toBe(path.resolve(project));
    expect(spawned).toHaveLength(1);
    expect(spawned[0]!.cwd).toBe(path.resolve(worktree));
  });

  it("refuses traversal in runId", async () => {
    const { project } = await makeProject({ allowTerminal: true });
    const { driver } = makeFakeDriver();
    const srv = await startWith(project, driver);
    const res = await fetch(`${srv.url}/api/terminal/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId: "../escape", cols: 80, rows: 24 }),
    });
    expect(res.status).toBe(400);
  });

  it("refuses an unknown runId (404)", async () => {
    const { project } = await makeProject({ allowTerminal: true });
    const { driver } = makeFakeDriver();
    const srv = await startWith(project, driver);
    const res = await fetch(`${srv.url}/api/terminal/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId: "20260101-000000-ghost",
        cols: 80,
        rows: 24,
      }),
    });
    expect(res.status).toBe(404);
  });

  it("refuses a worktree that resolves inside the project root", async () => {
    const { project, runId } = await makeProject({
      allowTerminal: true,
      worktreeInsideProjectRoot: true,
    });
    const { driver } = makeFakeDriver();
    const srv = await startWith(project, driver);
    const res = await fetch(`${srv.url}/api/terminal/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId, cols: 80, rows: 24 }),
    });
    expect(res.status).toBe(409);
    const r = (await res.json()) as { error: string };
    expect(r.error).toMatch(/inside the project root/);
  });
});

describe("terminal env hygiene", () => {
  it("passes only an allowlist of env vars to the PTY", async () => {
    const { project, runId } = await makeProject({ allowTerminal: true });
    const { driver, spawned } = makeFakeDriver();
    // Inject a hostile env var that must NOT be forwarded.
    process.env.LD_PRELOAD = "/tmp/evil.so";
    process.env.DYLD_INSERT_LIBRARIES = "/tmp/evil.dylib";
    try {
      const srv = await startWith(project, driver);
      const res = await fetch(`${srv.url}/api/terminal/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId, cols: 80, rows: 24 }),
      });
      expect(res.status).toBe(200);
      const env = spawned[0]!.env;
      expect(env.LD_PRELOAD).toBeUndefined();
      expect(env.DYLD_INSERT_LIBRARIES).toBeUndefined();
      expect(env.TERM).toBe("xterm-256color");
      expect(env.VIBESTRATE_TERMINAL).toBe("1");
    } finally {
      delete process.env.LD_PRELOAD;
      delete process.env.DYLD_INSERT_LIBRARIES;
    }
  });
});

describe("terminal lifecycle (create / list / get / resize / close)", () => {
  it("walks the full lifecycle and persists session metadata", async () => {
    const { project, runId } = await makeProject({ allowTerminal: true });
    const { driver, spawned } = makeFakeDriver();
    const srv = await startWith(project, driver);

    // Create
    const created = await fetch(`${srv.url}/api/terminal/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId, cols: 80, rows: 24 }),
    }).then((r) => r.json() as Promise<{ session: { id: string } }>);
    const id = created.session.id;
    expect(id).toMatch(/^tm-/);

    // List shows it
    const list = await fetch(`${srv.url}/api/terminal/sessions`).then((r) =>
      r.json() as Promise<{ sessions: { id: string }[] }>,
    );
    expect(list.sessions.map((s) => s.id)).toContain(id);

    // Get returns the same record
    const got = await fetch(
      `${srv.url}/api/terminal/sessions/${encodeURIComponent(id)}`,
    ).then((r) => r.json() as Promise<{ session: { id: string; cols: number } }>);
    expect(got.session.id).toBe(id);

    // Resize updates cols/rows
    const resized = await fetch(
      `${srv.url}/api/terminal/sessions/${encodeURIComponent(id)}/resize`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cols: 120, rows: 40 }),
      },
    );
    expect(resized.status).toBe(200);
    const getAgain = await fetch(
      `${srv.url}/api/terminal/sessions/${encodeURIComponent(id)}`,
    ).then((r) => r.json() as Promise<{ session: { cols: number; rows: number } }>);
    expect(getAgain.session.cols).toBe(120);
    expect(getAgain.session.rows).toBe(40);

    // Close kills the PTY and marks closedAt
    const closed = await fetch(
      `${srv.url}/api/terminal/sessions/${encodeURIComponent(id)}/close`,
      { method: "POST" },
    ).then((r) => r.json() as Promise<{ session: { id: string; closedAt: string | null } }>);
    expect(closed.session.closedAt).toBeTruthy();

    // Disk-backed record reflects the close
    const persisted = JSON.parse(
      await fs.readFile(
        path.join(project, ".vibestrate/terminal/sessions.json"),
        "utf8",
      ),
    ) as { sessions: { id: string; closedAt: string | null }[] };
    const stored = persisted.sessions.find((s) => s.id === id);
    expect(stored?.closedAt).toBeTruthy();

    // Driver spawn was actually invoked
    expect(spawned).toHaveLength(1);
  });

  it("close on an unknown id returns 404", async () => {
    const { project } = await makeProject({ allowTerminal: true });
    const { driver } = makeFakeDriver();
    const srv = await startWith(project, driver);
    const res = await fetch(
      `${srv.url}/api/terminal/sessions/tm-ghost/close`,
      { method: "POST" },
    );
    expect(res.status).toBe(404);
  });

  it("session id with traversal is rejected", async () => {
    const { project } = await makeProject({ allowTerminal: true });
    const { driver } = makeFakeDriver();
    const srv = await startWith(project, driver);
    const res = await fetch(
      `${srv.url}/api/terminal/sessions/..%2Fescape`,
    );
    expect([400, 404]).toContain(res.status);
  });
});

describe("no command-execution endpoint", () => {
  // The whole point of the V0 posture: there must be no HTTP route that
  // accepts a shell command string and executes it. This test names every
  // shape the spec called out and asserts none exists.
  const FORBIDDEN_PATHS = [
    "/api/terminal/exec",
    "/api/terminal/run",
    "/api/terminal/command",
    "/api/terminal/sessions/tm-x/exec",
    "/api/terminal/sessions/tm-x/run",
  ];
  for (const pth of FORBIDDEN_PATHS) {
    it(`POST ${pth} does not exist`, async () => {
      const { project } = await makeProject({ allowTerminal: true });
      const { driver } = makeFakeDriver();
      const srv = await startWith(project, driver);
      const res = await fetch(`${srv.url}${pth}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command: "/bin/echo pwned" }),
      });
      expect(res.status).toBe(404);
    });
  }
});

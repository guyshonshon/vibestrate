// ── Workspace navigator runtime (Multi-project) ─────────────────────────────
//
// The workspace is a NAVIGATOR over isolated, multi-tenant projects — not a
// control plane. Each project is its own `vibe ui` process: its own server, its
// own managed scheduler processing its own queue, knowing nothing about the
// others. This module's only job is to *open* a project: if its dashboard is
// already live, hand back the URL; if it's dormant, start its full `vibe ui`
// (server + scheduler) on a free port and hand back the URL once it answers.
//
// Nothing here reaches into another project's state. Starting `vibe ui` for a
// root is exactly what a user typing `vibe ui` there would do — the child
// self-registers its port and owns its own lifecycle.

import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import os from "node:os";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { canonicalRoot } from "./workspace-store.js";
import { readUiLock, releaseUiLock } from "./ui-lock.js";
import {
  resolveTargetProject,
  type WorkspaceSafetyDeps,
} from "./workspace-safety.js";
import { readDirSafe, pathExists } from "../utils/fs.js";
import { readJson } from "../utils/json.js";
import {
  projectRunsDir,
  runStatePath,
  schedulerStateFile,
  schedulerQueueFile,
} from "../utils/paths.js";
import { isTerminal, runStateSchema } from "../core/state-machine.js";
import {
  schedulerStateSchema,
  queueFileSchema,
} from "../scheduler/scheduler-types.js";
import { deriveSchedulerLiveness } from "../scheduler/scheduler-liveness.js";
import { isProcessAlive } from "../scheduler/scheduler-lock.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Locate the bundled `dist/index.js` (the `vibe` entry). */
function resolveVibestrateBin(): string {
  const candidates = [
    path.resolve(HERE, "..", "..", "dist", "index.js"),
    path.resolve(HERE, "..", "..", "..", "dist", "index.js"),
    path.resolve(HERE, "index.js"),
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0]!;
}

/** A free loopback TCP port (bind :0, read it back, release). */
export async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const { port } = addr;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("could not acquire a free port")));
      }
    });
  });
}

/**
 * Is a live Vibestrate dashboard for `expectedRoot` answering on `port`?
 * Confirms BOTH that the port answers `/api/health` AND that it's serving the
 * expected root — so a stale port now owned by a different project reads as
 * not-live (we never hand back the wrong dashboard).
 */
export async function probeProjectLive(
  port: number,
  expectedRoot: string,
  timeoutMs = 700,
): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: ctrl.signal,
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: boolean; projectRoot?: string };
    if (body.ok !== true) return false;
    if (!body.projectRoot) return true; // older server without root echo
    return canonicalRoot(body.projectRoot) === canonicalRoot(expectedRoot);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export type EnsureServerResult = {
  root: string;
  label: string;
  url: string;
  port: number;
  /** True when we had to spawn a new `vibe ui` for it. */
  started: boolean;
};

export type ProjectRuntime = {
  pid: number | null;
  port: number | null;
  host: string | null;
  /** The lock points at an alive process on this host. */
  running: boolean;
};

/**
 * Read a project's runtime from its own `ui.lock` (pid / port / host) and decide
 * whether it's running — the lock exists, names a live PID, and was written on
 * THIS host. A crashed server leaves a stale lock that reads as not-running and
 * is reclaimed on the next start. No shared file, no network.
 */
export async function readProjectRuntime(root: string): Promise<ProjectRuntime> {
  const lock = await readUiLock(root);
  if (!lock) return { pid: null, port: null, host: null, running: false };
  const running = lock.host === os.hostname() && isProcessAlive(lock.pid);
  return { pid: lock.pid, port: lock.port, host: lock.host, running };
}

/**
 * Ensure a registered project has a live dashboard, returning its URL. Idempotent:
 * reuses an already-live instance; otherwise spawns `vibe ui --port <free>
 * --no-open` (detached, cwd pinned) and waits for it to answer. The spawned UI
 * self-registers its port and runs its own scheduler.
 */
export async function ensureProjectServer(
  input: { project: string },
  deps: WorkspaceSafetyDeps & { waitMs?: number },
): Promise<EnsureServerResult> {
  const target = await resolveTargetProject(input.project, deps);

  // Reuse a live instance if this project's lock points at a running server that
  // still answers for this root.
  const rt = await readProjectRuntime(target.root);
  if (rt.running && rt.port && (await probeProjectLive(rt.port, target.root))) {
    return {
      root: target.root,
      label: target.label,
      url: `http://127.0.0.1:${rt.port}/`,
      port: rt.port,
      started: false,
    };
  }

  // Dormant — start its own full `vibe ui` (server + scheduler) on a free port.
  const port = await findFreePort();
  const bin = resolveVibestrateBin();
  const child = spawn(process.execPath, [bin, "ui", "--port", String(port), "--no-open"], {
    cwd: target.root,
    env: { ...process.env, NO_COLOR: "1" },
    stdio: "ignore",
    detached: true,
  });
  child.unref();

  // Poll until it answers (or give up and hand back the URL anyway — the user's
  // tab will load once it's up). Bounded so we never hang a request.
  const deadline = Date.now() + (deps.waitMs ?? 12_000);
  while (Date.now() < deadline) {
    if (await probeProjectLive(port, target.root)) break;
    await new Promise((r) => setTimeout(r, 300));
  }

  return {
    root: target.root,
    label: target.label,
    url: `http://127.0.0.1:${port}/`,
    port,
    started: true,
  };
}

export type ProjectBusyStatus = {
  /** Non-terminal runs on disk. */
  activeRuns: number;
  /** Queued (not-yet-started) tasks in the project's own scheduler queue. */
  queueDepth: number;
  /** Tasks the scheduler currently reports as running. */
  runningTaskIds: string[];
  /** Whether the scheduler is actively draining its queue. */
  schedulerPickingUp: boolean;
  schedulerStatus: string;
  /** Any of the above ⇒ closing will interrupt in-flight work. */
  busy: boolean;
};

/**
 * Read what a project is currently doing — bounded reads under its own
 * `.vibestrate` (runs + scheduler state/queue), never an HTTP call into it. The
 * "Close" confirmation uses this to warn when shutting down would interrupt
 * active runs or queued work.
 */
export async function readProjectBusyStatus(root: string): Promise<ProjectBusyStatus> {
  let activeRuns = 0;
  try {
    const ids = await readDirSafe(projectRunsDir(root));
    for (const id of ids) {
      const sf = runStatePath(root, id);
      if (!(await pathExists(sf))) continue;
      try {
        const parsed = runStateSchema.safeParse(await readJson<unknown>(sf));
        if (parsed.success && !isTerminal(parsed.data.status)) activeRuns += 1;
      } catch {
        /* skip unreadable run */
      }
    }
  } catch {
    /* no runs dir */
  }

  // Queue depth: an absent file means nothing queued (the RunQueue default
  // would also synthesize an empty queue — but read the file directly so we
  // never confuse "no scheduler" with "live scheduler").
  let queueDepth = 0;
  try {
    const qf = schedulerQueueFile(root);
    if (await pathExists(qf)) {
      queueDepth = queueFileSchema.parse(await readJson<unknown>(qf)).entries.length;
    }
  } catch {
    /* unreadable queue ⇒ treat as empty */
  }

  // Scheduler liveness: read the state FILE. A missing file means the scheduler
  // never started here — crucially distinct from RunQueue.readState()'s default,
  // which stamps `lastUpdatedAt=now` and would read back as "live".
  let runningTaskIds: string[] = [];
  let schedulerPickingUp = false;
  let schedulerStatus = "never-started";
  try {
    const sf = schedulerStateFile(root);
    if (await pathExists(sf)) {
      const state = schedulerStateSchema.parse(await readJson<unknown>(sf));
      const liveness = deriveSchedulerLiveness(state);
      runningTaskIds = state.runningTaskIds ?? [];
      schedulerPickingUp = liveness.pickingUpWork;
      schedulerStatus = liveness.status;
    }
  } catch {
    /* unreadable state ⇒ treat as never-started */
  }

  // "Busy" = real in-flight work. A merely-live (idle) scheduler loop is the
  // normal state of any open project and must NOT block a clean close — only
  // actual runs / queued / running tasks do. `schedulerPickingUp` is reported
  // for context but doesn't, by itself, count as busy.
  const busy = activeRuns > 0 || queueDepth > 0 || runningTaskIds.length > 0;

  return {
    activeRuns,
    queueDepth,
    runningTaskIds,
    schedulerPickingUp,
    schedulerStatus,
    busy,
  };
}

/** How a close resolved.
 *  - `graceful`        — cooperative shutdown; the process exited on its own.
 *  - `graceful-unverified` — cooperative acked, but no PID on record to confirm exit.
 *  - `sigterm` / `sigkill` — the process didn't exit, so we escalated (only ever
 *    done to a CONFIRMED-live server whose registered PID came from that same
 *    process — never an unconfirmed / possibly-reused PID).
 *  - `unreachable`     — not answering and we can't safely confirm the PID; the
 *    user may need to kill it manually.
 *  - `none`            — nothing live to close. */
export type CloseMethod =
  | "graceful"
  | "graceful-unverified"
  | "sigterm"
  | "sigkill"
  | "unreachable"
  | "none";

export type CloseResult = {
  root: string;
  label: string;
  /** True when we shut a running instance down (cooperatively or by force). */
  closed: boolean;
  /** True when there was nothing live to close. */
  alreadyStopped: boolean;
  /** True when force (SIGTERM/SIGKILL) was used. */
  forced: boolean;
  method: CloseMethod;
  port: number | null;
  /** PID we acted on / would need to be killed manually, when relevant. */
  pid: number | null;
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Poll until the process is gone or the window elapses. */
async function waitForExit(pid: number, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return true;
    await sleep(150);
  }
  return !isProcessAlive(pid);
}

async function postShutdown(port: number): Promise<void> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = process.env.VIBESTRATE_API_TOKEN;
  if (token && token.trim()) headers["authorization"] = `Bearer ${token.trim()}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    await fetch(`http://127.0.0.1:${port}/api/server/shutdown`, {
      method: "POST",
      headers,
      body: "{}",
      signal: ctrl.signal,
    });
  } catch {
    // The server closes the socket as it exits — a dropped response is expected.
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Close a project's dashboard. First asks its own server to shut down
 * (`POST /api/server/shutdown` — stop scheduler + close + exit). If the server
 * is confirmed live but doesn't exit, escalate to SIGTERM then SIGKILL on its
 * registered PID — but ONLY for a confirmed-live server (the PID was
 * self-registered by the same process that's answering on the port), so a stale
 * or reused PID is never signalled. Idempotent.
 */
export async function closeProjectServer(
  input: { project: string },
  deps: WorkspaceSafetyDeps,
): Promise<CloseResult> {
  const target = await resolveTargetProject(input.project, deps);
  const rt = await readProjectRuntime(target.root);
  const port = rt.port;
  const pid = rt.pid;
  const base = { root: target.root, label: target.label, port, pid };

  // `running` = the lock points at an alive pid on this host. Confirm it's
  // actually serving (port answers /api/health for this root) before treating
  // the pid as kill-safe — that rules out a stale lock whose pid was reused.
  const live = rt.running && port ? await probeProjectLive(port, target.root) : false;

  if (!live) {
    if (rt.running && pid) {
      // Process alive but not answering: hung, or a stale lock on a reused pid.
      // We can't tell which, so we never signal it — report it for a manual kill.
      return { ...base, closed: false, alreadyStopped: false, forced: false, method: "unreachable" };
    }
    // Nothing live. Clear any stale lock so the project reads dormant.
    await releaseUiLock(target.root, { pid: pid ?? process.pid, force: true });
    return { ...base, closed: false, alreadyStopped: true, forced: false, method: "none" };
  }

  // Confirmed live (port answers for this root) → cooperative shutdown.
  await postShutdown(port as number);

  const finish = async (
    closed: boolean,
    forced: boolean,
    method: CloseMethod,
  ): Promise<CloseResult> => {
    // The graceful path releases its own lock; force/kill paths can't, so clear
    // a leftover lock here. Idempotent.
    if (closed) await releaseUiLock(target.root, { pid: pid ?? process.pid, force: true });
    return { ...base, closed, alreadyStopped: false, forced, method };
  };

  if (!pid) {
    // Server acked but no PID on record to confirm it actually exited.
    return finish(true, false, "graceful-unverified");
  }
  if (await waitForExit(pid, 3000)) return finish(true, false, "graceful");

  // Confirmed-live but didn't exit — escalate on the confirmed PID.
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    /* already gone */
  }
  if (await waitForExit(pid, 2500)) return finish(true, true, "sigterm");
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    /* already gone */
  }
  await waitForExit(pid, 1500);
  const gone = !isProcessAlive(pid);
  return gone ? finish(true, true, "sigkill") : finish(false, true, "unreachable");
}

/**
 * Per-project runtime for a set of roots (pid / port / running), read from each
 * project's own `ui.lock`. No network, no shared file — used to badge the
 * overview / switcher and to resolve a project's current port.
 */
export async function readWorkspaceRuntimes(
  roots: string[],
): Promise<Record<string, ProjectRuntime>> {
  const out: Record<string, ProjectRuntime> = {};
  await Promise.all(
    roots.map(async (root) => {
      out[root] = await readProjectRuntime(root);
    }),
  );
  return out;
}

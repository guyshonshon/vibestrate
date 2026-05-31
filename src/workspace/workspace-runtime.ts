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
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { WorkspaceStore, canonicalRoot } from "./workspace-store.js";
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

  // Reuse a live instance if the registry's last port still serves this root.
  const entry = (await (deps.store ?? new WorkspaceStore()).list()).find(
    (p) => p.root === target.root,
  );
  if (entry?.lastPort && (await probeProjectLive(entry.lastPort, target.root))) {
    return {
      root: target.root,
      label: target.label,
      url: `http://127.0.0.1:${entry.lastPort}/`,
      port: entry.lastPort,
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

export type CloseResult = {
  root: string;
  label: string;
  /** True when we asked a live instance to shut down. */
  closed: boolean;
  /** True when there was nothing live to close. */
  alreadyStopped: boolean;
  port: number | null;
};

/**
 * Close a project's dashboard — ask its own server to shut itself down (stop
 * scheduler + close + exit) via `POST /api/server/shutdown`. We never kill PIDs;
 * the server owns its lifecycle. Forwards the API token when this machine uses
 * one. Idempotent: a project that isn't live reports `alreadyStopped`.
 */
export async function closeProjectServer(
  input: { project: string },
  deps: WorkspaceSafetyDeps,
): Promise<CloseResult> {
  const target = await resolveTargetProject(input.project, deps);
  const entry = (await (deps.store ?? new WorkspaceStore()).list()).find(
    (p) => p.root === target.root,
  );
  const port = entry?.lastPort ?? null;
  if (!port || !(await probeProjectLive(port, target.root))) {
    return { root: target.root, label: target.label, closed: false, alreadyStopped: true, port };
  }

  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = process.env.VIBESTRATE_API_TOKEN;
  if (token && token.trim()) headers["authorization"] = `Bearer ${token.trim()}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    await fetch(`http://127.0.0.1:${port}/api/server/shutdown`, {
      method: "POST",
      headers,
      body: "{}",
      signal: ctrl.signal,
    });
  } catch {
    // The server closes the socket as it exits — a dropped response is expected
    // and still means the shutdown was accepted.
  } finally {
    clearTimeout(timer);
  }
  return { root: target.root, label: target.label, closed: true, alreadyStopped: false, port };
}

/**
 * Best-effort liveness map for a set of projects (parallel, short timeout).
 * Used to badge the overview / switcher; a dormant project just shows an
 * "Open" affordance that starts it on demand.
 */
export async function probeLiveness(
  projects: Array<{ root: string; lastPort: number | null }>,
): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {};
  await Promise.all(
    projects.map(async (p) => {
      out[p.root] = p.lastPort ? await probeProjectLive(p.lastPort, p.root) : false;
    }),
  );
  return out;
}

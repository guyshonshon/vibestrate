import fs from "node:fs";
import path from "node:path";
import { runStatePath } from "../utils/paths.js";
import { runStateSchema } from "../core/state-machine.js";
import { loadConfig } from "../project/config-loader.js";
import { isPathInside } from "../utils/paths.js";
import { TerminalSessionStore } from "./terminal-store.js";
import {
  TerminalError,
  type CreateSessionInput,
  type TerminalAvailability,
  type TerminalDriver,
  type TerminalProcess,
  type TerminalSession,
} from "./terminal-types.js";

const SAFE_RUN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SAFE_SESSION_ID_RE = /^tm-[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** Cap concurrent live sessions to limit fork-bomb risk. */
const MAX_LIVE_SESSIONS = 8;

/** Only these env vars cross the process boundary. No PATH widening, no
 *  forwarding of LD_PRELOAD/DYLD_* or other linker-attack vectors. */
const FORWARDED_ENV_VARS = [
  "HOME",
  "USER",
  "LOGNAME",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "PATH",
] as const;

type LiveEntry = {
  session: TerminalSession;
  process: TerminalProcess;
};

export class TerminalService {
  private readonly store: TerminalSessionStore;
  private readonly live = new Map<string, LiveEntry>();

  constructor(
    private readonly projectRoot: string,
    private readonly driver: TerminalDriver,
  ) {
    this.store = new TerminalSessionStore(projectRoot);
  }

  /** Read the policy + driver state, e.g. for a GET /api/terminal/availability. */
  async availability(): Promise<TerminalAvailability> {
    const policyEnabled = await this.policyEnabled();
    if (!policyEnabled) {
      return {
        policyEnabled: false,
        driverAvailable: this.driver.available,
        reason: "policies.allowInteractiveTerminal is false.",
      };
    }
    if (!this.driver.available) {
      return {
        policyEnabled: true,
        driverAvailable: false,
        reason:
          this.driver.unavailableReason ??
          "Terminal driver unavailable in this environment.",
      };
    }
    return { policyEnabled: true, driverAvailable: true, reason: null };
  }

  async list(): Promise<TerminalSession[]> {
    return this.store.readAll();
  }

  async get(id: string): Promise<TerminalSession> {
    this.assertSafeSessionId(id);
    const all = await this.store.readAll();
    const found = all.find((s) => s.id === id);
    if (!found) throw new TerminalError(404, `Terminal session not found: ${id}`);
    return found;
  }

  /** Resolve the live process for an existing session. Returns null if the
   *  session was created in a prior server process (server restart) — the
   *  WS route maps that to a 410 Gone. */
  liveProcess(id: string): TerminalProcess | null {
    const entry = this.live.get(id);
    return entry?.process ?? null;
  }

  async create(input: CreateSessionInput): Promise<TerminalSession> {
    const avail = await this.availability();
    if (!avail.policyEnabled || !avail.driverAvailable) {
      throw new TerminalError(
        403,
        avail.reason ?? "Terminal feature unavailable.",
      );
    }
    if (!SAFE_RUN_ID_RE.test(input.runId) || input.runId.includes("..")) {
      throw new TerminalError(400, `Unsafe runId: ${input.runId}`);
    }
    const cols = Math.max(2, Math.min(1024, Math.floor(input.cols || 80)));
    const rows = Math.max(2, Math.min(1024, Math.floor(input.rows || 24)));

    // CWD = the run's worktree. Refuses any run whose state doesn't declare
    // one (project root is never an allowed CWD for V0).
    const cwd = await this.resolveWorktreeCwd(input.runId);

    if (this.live.size >= MAX_LIVE_SESSIONS) {
      throw new TerminalError(
        429,
        `Too many live terminal sessions (cap: ${MAX_LIVE_SESSIONS}). Close one before opening another.`,
      );
    }

    const shell = pickShell();
    const env = buildSafeEnv();

    const session: TerminalSession = {
      id: makeSessionId(input.runId),
      runId: input.runId,
      cwd,
      cols,
      rows,
      shell,
      createdAt: new Date().toISOString(),
      closedAt: null,
      exitCode: null,
    };

    const proc = this.driver.spawn({ shell, cwd, cols, rows, env });

    proc.onExit(({ exitCode }) => {
      const entry = this.live.get(session.id);
      if (!entry) return;
      this.live.delete(session.id);
      void this.store.upsert({
        ...entry.session,
        closedAt: new Date().toISOString(),
        exitCode,
      });
    });

    this.live.set(session.id, { session, process: proc });
    await this.store.upsert(session);
    return session;
  }

  async resize(id: string, cols: number, rows: number): Promise<void> {
    this.assertSafeSessionId(id);
    const entry = this.live.get(id);
    if (!entry) {
      throw new TerminalError(
        410,
        `Terminal session ${id} is not live in this server.`,
      );
    }
    const c = Math.max(2, Math.min(1024, Math.floor(cols || 80)));
    const r = Math.max(2, Math.min(1024, Math.floor(rows || 24)));
    entry.process.resize(c, r);
    entry.session.cols = c;
    entry.session.rows = r;
    await this.store.upsert(entry.session);
  }

  async close(id: string): Promise<TerminalSession> {
    this.assertSafeSessionId(id);
    const entry = this.live.get(id);
    if (entry) {
      try {
        entry.process.kill("SIGHUP");
      } catch {
        // Already exited; the onExit handler will tidy.
      }
      // The onExit handler persists the closed timestamp + exit code; we
      // still mark it closed here in case the SIGHUP race leaves it dangling.
      const closed: TerminalSession = {
        ...entry.session,
        closedAt: entry.session.closedAt ?? new Date().toISOString(),
        exitCode: entry.session.exitCode ?? null,
      };
      this.live.delete(id);
      await this.store.upsert(closed);
      return closed;
    }
    const persisted = await this.store.readAll();
    const found = persisted.find((s) => s.id === id);
    if (!found) {
      throw new TerminalError(404, `Terminal session not found: ${id}`);
    }
    if (found.closedAt) return found;
    const closed: TerminalSession = {
      ...found,
      closedAt: new Date().toISOString(),
    };
    await this.store.upsert(closed);
    return closed;
  }

  /** Best-effort: kill every live PTY at server shutdown. */
  async shutdown(): Promise<void> {
    for (const [id, entry] of this.live.entries()) {
      try {
        entry.process.kill("SIGHUP");
      } catch {
        // ignore
      }
      this.live.delete(id);
    }
  }

  private async policyEnabled(): Promise<boolean> {
    try {
      const loaded = await loadConfig(this.projectRoot);
      return loaded.config.policies.allowInteractiveTerminal === true;
    } catch {
      return false;
    }
  }

  private async resolveWorktreeCwd(runId: string): Promise<string> {
    const stateFile = runStatePath(this.projectRoot, runId);
    let raw: unknown;
    try {
      raw = JSON.parse(await fs.promises.readFile(stateFile, "utf8"));
    } catch {
      throw new TerminalError(404, `Run not found: ${runId}`);
    }
    const parsed = runStateSchema.safeParse(raw);
    if (!parsed.success) {
      throw new TerminalError(409, `Run state is invalid: ${runId}`);
    }
    const wt = parsed.data.worktreePath;
    if (!wt) {
      throw new TerminalError(
        409,
        `Run ${runId} has no worktree. Terminal sessions require an isolated worktree; the project root is never an allowed CWD for V0.`,
      );
    }
    const resolved = path.resolve(wt);
    if (resolved === path.resolve(this.projectRoot)) {
      throw new TerminalError(
        409,
        "Refusing to open a terminal at the project root.",
      );
    }
    if (isPathInside(this.projectRoot, resolved)) {
      // Worktrees should live outside the project root (default
      // ../.amaco-worktrees) — if a misconfigured project has them inside,
      // refuse rather than silently allow.
      throw new TerminalError(
        409,
        `Run worktree is inside the project root (${resolved}); refusing.`,
      );
    }
    try {
      const stat = await fs.promises.stat(resolved);
      if (!stat.isDirectory()) {
        throw new TerminalError(
          409,
          `Run worktree is not a directory: ${resolved}`,
        );
      }
    } catch (err) {
      if (err instanceof TerminalError) throw err;
      throw new TerminalError(
        409,
        `Run worktree is missing: ${resolved}`,
      );
    }
    return resolved;
  }

  private assertSafeSessionId(id: string): void {
    if (!SAFE_SESSION_ID_RE.test(id) || id.includes("..")) {
      throw new TerminalError(400, `Unsafe session id: ${id}`);
    }
  }
}

function makeSessionId(runId: string): string {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  const safeRun = runId.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 32);
  return `tm-${safeRun}-${stamp}-${rand}`;
}

function pickShell(): string {
  // Prefer the user's $SHELL if it's an absolute, real path. Fall back to a
  // small allowlist; the call site never lets the browser pick.
  const fromEnv = process.env.SHELL;
  if (fromEnv && path.isAbsolute(fromEnv)) {
    try {
      const stat = fs.statSync(fromEnv);
      if (stat.isFile()) return fromEnv;
    } catch {
      // try fallbacks
    }
  }
  for (const candidate of ["/bin/zsh", "/bin/bash", "/bin/sh"]) {
    try {
      const stat = fs.statSync(candidate);
      if (stat.isFile()) return candidate;
    } catch {
      // try next
    }
  }
  return "/bin/sh";
}

function buildSafeEnv(): Record<string, string> {
  const out: Record<string, string> = {
    TERM: "xterm-256color",
    AMACO_TERMINAL: "1",
  };
  for (const k of FORWARDED_ENV_VARS) {
    const v = process.env[k];
    if (typeof v === "string" && v.length > 0) out[k] = v;
  }
  return out;
}

// Child-process execution primitives: `runShellCommand` (one command string
// through a shell) and `runArgvCommand` (explicit argv, no shell, with live
// output and cancellation). Both resolve a CommandResult instead of throwing -
// execa runs with reject:false, so a nonzero exit is data rather than a
// rejected promise.
//
// Both build the child env through `childEnv` AND pass extendEnv:false. Those
// two go together: childEnv already carries a filtered copy of process.env, so
// letting execa extend from the raw process.env would put back exactly the
// vars childEnv exists to strip. Changing one without the other silently
// re-opens that hole.
//
// Cancellation in runArgvCommand deliberately avoids execa's own `timeout`.
// execa signals the direct child only, and a provider CLI that spawned its own
// subagents would leave them orphaned and still spending. Instead the
// `signal` abort and the `timeoutMs` deadline both route into
// terminateSubprocess, which signals the whole process group (SIGTERM on
// POSIX, `taskkill /T /F` on Windows) and arms a 3s SIGKILL follow-up to that
// same group. This is why the subprocess is spawned with the `detached` flag
// from detachedSpawnOptions() - the POSIX group kill needs its own process
// group. runShellCommand does use execa's `timeout` and has no tree-kill path.
//
// `stallTimeoutMs` is the third route into that same terminate path: an
// INACTIVITY watchdog rather than a wall-clock cap. A model that streams for an
// hour is working; a child that writes nothing at all for N minutes is wedged.
// The deadline is re-armed on every byte the child writes (stdout or stderr),
// so only real silence trips it. It is only sound on a child that actually
// streams while it works, so the decision to arm it belongs to the provider
// that knows its own output contract - this module just honors the number.
//
// A run that ended any of those ways says so rather than looking like a clean
// finish: exitCode -1, a typed `termination` code on the result, plus a
// trailing `[aborted: ...]` / `[timed out: ...]` / `[stalled: ...]` marker
// appended to stderr and pushed to onChunk when a live tailer is attached, so
// a log that stops mid-stream explains itself. Callers branch on `termination`,
// never on the marker text. `onChunk` is additive - the full stdout and stderr
// are still buffered onto the result either way.

import { execa } from "execa";
import { nowIso, durationMs } from "../../utils/time.js";
import {
  killProcessTree,
  detachedSpawnOptions,
} from "../../utils/process-control.js";

// Host Claude Code (the CLI we may be running *inside*) injects CLAUDE_CODE_* and
// CLAUDECODE env vars to mark its own session/instance. A child agent we spawn -
// especially `claude` itself - must NOT inherit that identity: a nested `claude`
// then collides on session ids ("Session ID ... is already in use" - confirmed by
// re-opening an existing session id) and can mis-wire to the host's SSE port.
// Strip them so every spawned process runs as a fresh top-level agent. Purely
// subtractive; nothing we spawn legitimately needs the host's session identity.
function childEnv(extra?: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (k === "CLAUDECODE" || k.startsWith("CLAUDE_CODE_")) continue;
    env[k] = v;
  }
  return { ...env, ...(extra ?? {}) };
}

/** How a child ENDED when it did not end on its own. */
export type ChildTermination = "abort" | "timeout" | "stall";

export type CommandResult = {
  command: string;
  argv: string[];
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  /**
   * How the child ENDED, when it did not end on its own. A typed code so
   * callers branch on it instead of parsing the stderr marker: `abort` (the
   * caller's signal), `timeout` (wall-clock `timeoutMs`), `stall` (inactivity
   * `stallTimeoutMs`). Absent means the child exited by itself, whatever its
   * exit code. Only `runArgvCommand` sets it.
   */
  termination?: ChildTermination;
};

export async function runShellCommand(input: {
  command: string;
  cwd: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}): Promise<CommandResult> {
  const startedAt = new Date();
  const result = await execa(input.command, {
    cwd: input.cwd,
    env: childEnv(input.env),
    // childEnv already includes (filtered) process.env, so don't let execa
    // re-extend with the raw process.env (which would re-add CLAUDE_CODE_*).
    extendEnv: false,
    timeout: input.timeoutMs,
    reject: false,
    shell: true,
    all: false,
  });
  const endedAt = new Date();

  return {
    command: input.command,
    argv: [],
    cwd: input.cwd,
    exitCode: result.exitCode ?? -1,
    stdout: result.stdout?.toString() ?? "",
    stderr: result.stderr?.toString() ?? "",
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: durationMs(startedAt, endedAt),
  };
}

export type StreamChunk = {
  stream: "stdout" | "stderr";
  chunk: string;
  at: string;
};

export async function runArgvCommand(input: {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  stdin?: string;
  timeoutMs?: number;
  /** Optional hook fired as the child writes output. The chunks are
   *  also collected and returned via stdout/stderr on the result, so
   *  this is additive - useful for live tailing without changing the
   *  end-of-run contract. */
  onChunk?: (chunk: StreamChunk) => void;
  /** When this signal aborts, the subprocess is killed (SIGTERM, then
   *  SIGKILL on grace timeout). The returned CommandResult will have
   *  exitCode=-1 and stderr will include a final "[aborted]" marker. */
  signal?: AbortSignal;
  /**
   * Inactivity watchdog in ms: tree-kill the child when it writes NOTHING on
   * stdout or stderr for this long. Deliberately not a wall-clock cap - a
   * provider that streams for an hour is working, while silence is a wedge -
   * so the deadline is re-armed on every byte the child writes. Unsound on a
   * child that buffers until exit (it would kill a healthy run), which is why
   * the caller decides whether to arm it. Omitted or <= 0 = no watchdog.
   */
  stallTimeoutMs?: number;
}): Promise<CommandResult> {
  const startedAt = new Date();
  const { detached } = detachedSpawnOptions();
  // Use execa's process handle so we can subscribe to stream chunks
  // while *also* collecting the full buffered output for the
  // existing CommandResult contract. execa accepts AbortSignal for
  // cooperative cancellation - SIGTERM is sent on abort.
  // NOTE: we deliberately do NOT pass execa's own `timeout` here. execa's
  // timeout sends SIGTERM to the *direct child only*; a provider CLI that spawns
  // its own subagents (the "opaque box") would have those orphaned and left
  // spending. Instead `timeoutMs` drives the same tree-wide terminate path as an
  // abort (process-group kill on POSIX), so the whole box is reaped.
  const subprocess = execa(input.command, input.args, {
    cwd: input.cwd,
    env: childEnv(input.env),
    // childEnv already includes (filtered) process.env, so don't let execa
    // re-extend with the raw process.env (which would re-add CLAUDE_CODE_*).
    extendEnv: false,
    input: input.stdin,
    reject: false,
    detached,
    // execa renamed `signal` to `cancelSignal`. Pass through both
    // forms so we work against both older and newer execa shapes.
    ...(input.signal
      ? ({ cancelSignal: input.signal } as { cancelSignal: AbortSignal })
      : {}),
  });
  let forceKillTimer: NodeJS.Timeout | null = null;
  // Why the child was killed, when it was. First cause wins: a stall that
  // races the user's abort must not relabel the abort, and vice versa.
  let termination: ChildTermination | null = null;
  // Read through a function on purpose: `termination` is only ever assigned
  // from a callback, so a direct read would be narrowed to `null` by flow
  // analysis and the cause below would collapse to a single branch.
  const terminationCause = (): ChildTermination | null => termination;
  const terminateSubprocess = (): void => {
    const pid = subprocess.pid;
    if (!pid) return;
    try {
      killProcessTree(pid, "SIGTERM");
    } catch {
      try {
        subprocess.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }
    forceKillTimer = setTimeout(() => {
      try {
        killProcessTree(pid, "SIGKILL");
      } catch {
        try {
          subprocess.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }
    }, 3000);
    forceKillTimer.unref?.();
  };
  /** Record the cause once, then kill the whole process group. */
  const terminate = (cause: ChildTermination): void => {
    if (termination === null) termination = cause;
    terminateSubprocess();
  };
  const onAbort = (): void => terminate("abort");
  if (input.signal) {
    if (input.signal.aborted) {
      onAbort();
    } else {
      input.signal.addEventListener("abort", onAbort, { once: true });
    }
  }
  // Wall-clock timeout: tree-kill the whole process group when it fires.
  let timeoutTimer: NodeJS.Timeout | null = null;
  if (input.timeoutMs && input.timeoutMs > 0) {
    timeoutTimer = setTimeout(() => terminate("timeout"), input.timeoutMs);
    timeoutTimer.unref?.();
  }
  // Inactivity watchdog: the deadline is re-armed by every byte the child
  // writes, so it fires only on genuine silence, not on a long working turn.
  const stallMs =
    input.stallTimeoutMs && input.stallTimeoutMs > 0 ? input.stallTimeoutMs : 0;
  let stallTimer: NodeJS.Timeout | null = null;
  const armStallWatchdog = (): void => {
    if (!stallMs) return;
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => terminate("stall"), stallMs);
    stallTimer.unref?.();
  };
  // Output listeners serve BOTH the live tailer and the watchdog, so a run with
  // no onChunk is still watched. Re-arming happens before the chunk is handed
  // on: a slow consumer must never make a live child look silent.
  const onData = (stream: "stdout" | "stderr", b: Buffer | string): void => {
    armStallWatchdog();
    if (!input.onChunk) return;
    input.onChunk({
      stream,
      chunk: typeof b === "string" ? b : b.toString("utf8"),
      at: new Date().toISOString(),
    });
  };
  if (input.onChunk || stallMs) {
    subprocess.stdout?.on("data", (b: Buffer | string) => onData("stdout", b));
    subprocess.stderr?.on("data", (b: Buffer | string) => onData("stderr", b));
  }
  // The first silence window starts at spawn: a CLI that never writes a single
  // byte is the exact wedge this exists to catch.
  armStallWatchdog();
  let result;
  try {
    result = await subprocess;
  } finally {
    if (input.signal) {
      input.signal.removeEventListener("abort", onAbort);
    }
    if (forceKillTimer) clearTimeout(forceKillTimer);
    if (timeoutTimer) clearTimeout(timeoutTimer);
    if (stallTimer) clearTimeout(stallTimer);
  }
  const endedAt = new Date();
  // Surface the abort path so callers don't see "exitCode = 0" for a
  // signal-killed child. execa marks `isCanceled` when its signal
  // aborted the process; map that to a deterministic exitCode + a
  // trailing stderr marker so the live-stream log shows *why* the
  // output ends abruptly.
  const cause: ChildTermination | null =
    terminationCause() ??
    ((result as { isCanceled?: boolean }).isCanceled === true ||
    input.signal?.aborted === true
      ? "abort"
      : null);
  if (cause) {
    const note =
      cause === "timeout"
        ? `\n[timed out: provider CLI exceeded ${input.timeoutMs}ms and its process group was killed by vibestrate]\n`
        : cause === "stall"
          ? `\n[stalled: provider CLI produced no output for ${stallMs}ms and its process group was killed by vibestrate]\n`
          : `\n[aborted: provider CLI was killed by vibestrate]\n`;
    if (input.onChunk) {
      input.onChunk({
        stream: "stderr",
        chunk: note,
        at: new Date().toISOString(),
      });
    }
    return {
      command: input.command,
      argv: input.args,
      cwd: input.cwd,
      exitCode: -1,
      stdout: result.stdout?.toString() ?? "",
      stderr: (result.stderr?.toString() ?? "") + note,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationMs: durationMs(startedAt, endedAt),
      termination: cause,
    };
  }

  return {
    command: input.command,
    argv: input.args,
    cwd: input.cwd,
    exitCode: result.exitCode ?? -1,
    stdout: result.stdout?.toString() ?? "",
    stderr: result.stderr?.toString() ?? "",
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: durationMs(startedAt, endedAt),
  };
}

export { nowIso };

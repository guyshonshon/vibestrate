import { execa } from "execa";
import { nowIso, durationMs } from "../utils/time.js";

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
}): Promise<CommandResult> {
  const startedAt = new Date();
  const detached = process.platform !== "win32";
  // Use execa's process handle so we can subscribe to stream chunks
  // while *also* collecting the full buffered output for the
  // existing CommandResult contract. execa accepts AbortSignal for
  // cooperative cancellation - SIGTERM is sent on abort.
  // NOTE: we deliberately do NOT pass execa's own `timeout` here. execa's
  // timeout sends SIGTERM to the *direct child only*; a provider CLI that spawns
  // its own subagents (the "opaque box") would have those orphaned and left
  // spending. Instead `timeoutMs` drives the same tree-wide terminate path as an
  // abort (process-group kill on POSIX), so the whole box is reaped. See
  // custom-workflow-dags.md ("timeoutMs must actually fire that abort").
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
  let timedOut = false;
  const terminateSubprocess = (): void => {
    const pid = subprocess.pid;
    if (!pid) return;
    try {
      if (detached) process.kill(-pid, "SIGTERM");
      else subprocess.kill("SIGTERM");
    } catch {
      try {
        subprocess.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }
    forceKillTimer = setTimeout(() => {
      try {
        if (detached) process.kill(-pid, "SIGKILL");
        else subprocess.kill("SIGKILL");
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
  if (input.signal) {
    if (input.signal.aborted) {
      terminateSubprocess();
    } else {
      input.signal.addEventListener("abort", terminateSubprocess, {
        once: true,
      });
    }
  }
  // Wall-clock timeout: tree-kill the whole process group when it fires.
  let timeoutTimer: NodeJS.Timeout | null = null;
  if (input.timeoutMs && input.timeoutMs > 0) {
    timeoutTimer = setTimeout(() => {
      timedOut = true;
      terminateSubprocess();
    }, input.timeoutMs);
    timeoutTimer.unref?.();
  }
  if (input.onChunk) {
    subprocess.stdout?.on("data", (b: Buffer | string) => {
      input.onChunk!({
        stream: "stdout",
        chunk: typeof b === "string" ? b : b.toString("utf8"),
        at: new Date().toISOString(),
      });
    });
    subprocess.stderr?.on("data", (b: Buffer | string) => {
      input.onChunk!({
        stream: "stderr",
        chunk: typeof b === "string" ? b : b.toString("utf8"),
        at: new Date().toISOString(),
      });
    });
  }
  let result;
  try {
    result = await subprocess;
  } finally {
    if (input.signal) {
      input.signal.removeEventListener("abort", terminateSubprocess);
    }
    if (forceKillTimer) clearTimeout(forceKillTimer);
    if (timeoutTimer) clearTimeout(timeoutTimer);
  }
  const endedAt = new Date();
  // Surface the abort path so callers don't see "exitCode = 0" for a
  // signal-killed child. execa marks `isCanceled` when its signal
  // aborted the process; map that to a deterministic exitCode + a
  // trailing stderr marker so the live-stream log shows *why* the
  // output ends abruptly.
  const aborted =
    timedOut ||
    (result as { isCanceled?: boolean }).isCanceled === true ||
    input.signal?.aborted === true;
  if (aborted) {
    const note = timedOut
      ? `\n[timed out: provider CLI exceeded ${input.timeoutMs}ms and its process group was killed by vibestrate]\n`
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

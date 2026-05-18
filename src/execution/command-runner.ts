import { execa } from "execa";
import { nowIso, durationMs } from "../utils/time.js";

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
    env: { ...process.env, ...(input.env ?? {}) },
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
   *  this is additive — useful for live tailing without changing the
   *  end-of-run contract. */
  onChunk?: (chunk: StreamChunk) => void;
  /** When this signal aborts, the subprocess is killed (SIGTERM, then
   *  SIGKILL on grace timeout). The returned CommandResult will have
   *  exitCode=-1 and stderr will include a final "[aborted]" marker. */
  signal?: AbortSignal;
}): Promise<CommandResult> {
  const startedAt = new Date();
  // Use execa's process handle so we can subscribe to stream chunks
  // while *also* collecting the full buffered output for the
  // existing CommandResult contract. execa accepts AbortSignal for
  // cooperative cancellation — SIGTERM is sent on abort.
  const subprocess = execa(input.command, input.args, {
    cwd: input.cwd,
    env: { ...process.env, ...(input.env ?? {}) },
    timeout: input.timeoutMs,
    input: input.stdin,
    reject: false,
    // execa renamed `signal` to `cancelSignal`. Pass through both
    // forms so we work against both older and newer execa shapes.
    ...(input.signal
      ? ({ cancelSignal: input.signal } as { cancelSignal: AbortSignal })
      : {}),
  });
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
  const result = await subprocess;
  const endedAt = new Date();
  // Surface the abort path so callers don't see "exitCode = 0" for a
  // signal-killed child. execa marks `isCanceled` when its signal
  // aborted the process; map that to a deterministic exitCode + a
  // trailing stderr marker so the live-stream log shows *why* the
  // output ends abruptly.
  const aborted =
    (result as { isCanceled?: boolean }).isCanceled === true ||
    input.signal?.aborted === true;
  if (aborted) {
    const note = `\n[aborted: provider CLI was killed by amaco]\n`;
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

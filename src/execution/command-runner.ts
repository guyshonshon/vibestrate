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
}): Promise<CommandResult> {
  const startedAt = new Date();
  // Use execa's process handle so we can subscribe to stream chunks
  // while *also* collecting the full buffered output for the
  // existing CommandResult contract.
  const subprocess = execa(input.command, input.args, {
    cwd: input.cwd,
    env: { ...process.env, ...(input.env ?? {}) },
    timeout: input.timeoutMs,
    input: input.stdin,
    reject: false,
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

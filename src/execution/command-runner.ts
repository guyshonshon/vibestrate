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

export async function runArgvCommand(input: {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  stdin?: string;
  timeoutMs?: number;
}): Promise<CommandResult> {
  const startedAt = new Date();
  const result = await execa(input.command, input.args, {
    cwd: input.cwd,
    env: { ...process.env, ...(input.env ?? {}) },
    timeout: input.timeoutMs,
    input: input.stdin,
    reject: false,
  });
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

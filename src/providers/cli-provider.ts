import { runArgvCommand } from "../execution/command-runner.js";
import { prepareSandbox } from "../execution/sandbox.js";
import { ProviderError } from "../utils/errors.js";
import type { CliProviderConfig } from "./provider-schema.js";
import type { ProviderRunInput, ProviderRunResult } from "./provider-types.js";

export async function runCliProvider(
  config: CliProviderConfig,
  input: ProviderRunInput,
): Promise<ProviderRunResult> {
  const args = [...(config.args ?? [])];
  let stdin: string | undefined;

  if (config.input === "arg") {
    args.push(input.prompt);
  } else {
    stdin = input.prompt;
  }

  const env: Record<string, string> = {
    ...(config.env ?? {}),
    ...(input.env ?? {}),
  };
  if (input.mcpConfigPath) {
    env.AMACO_MCP_CONFIG = input.mcpConfigPath;
  }

  let finalCommand = config.command;
  let finalArgs = args;
  let sandboxCleanup: (() => Promise<void>) | null = null;
  if (input.sandbox) {
    const prepared = await prepareSandbox({
      command: finalCommand,
      args: finalArgs,
      worktreePath: input.sandbox.worktreePath,
      projectRoot: input.sandbox.projectRoot,
    });
    if (!prepared.ok) {
      throw new ProviderError(
        `Sandbox refused to start: ${prepared.reason}. ${prepared.hint}`,
      );
    }
    finalCommand = prepared.command;
    finalArgs = prepared.args;
    sandboxCleanup = prepared.cleanup;
  }

  let result;
  try {
    result = await runArgvCommand({
      command: finalCommand,
      args: finalArgs,
      cwd: input.cwd,
      env,
      stdin,
      ...(input.onChunk ? { onChunk: input.onChunk } : {}),
      ...(input.signal ? { signal: input.signal } : {}),
    });
  } catch (err) {
    throw new ProviderError(
      `Failed to invoke provider command "${config.command}". Is it installed and on PATH?`,
      err,
    );
  } finally {
    if (sandboxCleanup) await sandboxCleanup().catch(() => undefined);
  }

  return {
    providerId: input.providerId,
    command: config.command,
    args,
    cwd: input.cwd,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs: result.durationMs,
    startedAt: result.startedAt,
    endedAt: result.endedAt,
  };
}

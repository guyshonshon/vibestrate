import { runArgvCommand } from "../execution/command-runner.js";
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

  let result;
  try {
    result = await runArgvCommand({
      command: config.command,
      args,
      cwd: input.cwd,
      env,
      stdin,
    });
  } catch (err) {
    throw new ProviderError(
      `Failed to invoke provider command "${config.command}". Is it installed and on PATH?`,
      err,
    );
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

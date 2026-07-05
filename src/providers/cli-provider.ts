import { runArgvCommand } from "../execution/command-runner.js";
import { ProviderError } from "../utils/errors.js";
import type { CliProviderConfig } from "./provider-schema.js";
import type { ProviderRunInput, ProviderRunResult } from "./provider-types.js";
import { profileSpawnArgs, providerSandboxArgs } from "./provider-apply.js";

export async function runCliProvider(
  config: CliProviderConfig,
  input: ProviderRunInput,
): Promise<ProviderRunResult> {
  // Provider-native OS sandbox (e.g. codex `--sandbox <mode>`), when this turn
  // requested one and this provider actually enforces it. Goes right after the
  // provider's own subcommand args and before the model/effort flags; for codex
  // the prompt is on stdin so flag ordering is unconstrained.
  const sandbox = providerSandboxArgs(input.providerId, input.sandbox ?? null);
  // Apply the resolved profile's model/effort as CLI flags where we know the
  // provider's mechanism (e.g. codex). Inserted before the prompt positional.
  const args = [
    ...(config.args ?? []),
    ...sandbox.args,
    ...profileSpawnArgs(
      input.providerId,
      { model: input.model, effort: input.effort },
      input.catalog,
    ),
  ];
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
    env.VIBESTRATE_MCP_CONFIG = input.mcpConfigPath;
  }

  // Container/cloud execution: rewrite the spawn through the
  // backend's strategy (e.g. `docker exec` into the run's container). The
  // strategy controls the in-container env (allowlist), so the host env is not
  // forwarded into the container. location records where it actually ran.
  const wrapped = input.execStrategy
    ? input.execStrategy.wrap({ command: config.command, args, cwd: input.cwd, env })
    : null;
  const spawn = wrapped
    ? { command: wrapped.command, args: wrapped.args, env: wrapped.env }
    : { command: config.command, args, env };
  const executedIn = input.execStrategy?.location ?? "host";

  let result;
  try {
    result = await runArgvCommand({
      command: spawn.command,
      args: spawn.args,
      cwd: input.cwd,
      env: spawn.env,
      stdin,
      ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
      ...(input.onChunk ? { onChunk: input.onChunk } : {}),
      ...(input.signal ? { signal: input.signal } : {}),
    });
  } catch (err) {
    throw new ProviderError(
      `Failed to invoke provider command "${config.command}". Is it installed and on PATH?`,
      err,
    );
  }

  return {
    providerId: input.providerId,
    // Report the provider's own command/args (not the docker-exec wrapper) - the
    // provider ran codex/etc.; executedIn records that it ran in a container.
    command: config.command,
    args,
    cwd: input.cwd,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs: result.durationMs,
    startedAt: result.startedAt,
    endedAt: result.endedAt,
    // Honest record: only what a real provider sandbox actually applied.
    appliedSandbox: sandbox.applied ? input.sandbox ?? null : null,
    executedIn,
  };
}

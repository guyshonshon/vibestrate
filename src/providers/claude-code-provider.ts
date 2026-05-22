import { runArgvCommand } from "../execution/command-runner.js";
import { prepareSandbox } from "../execution/sandbox.js";
import { ProviderError } from "../utils/errors.js";
import type { ProviderRunInput, ProviderRunResult } from "./provider-types.js";
import {
  buildClaudeCodeArgs,
  type ClaudeCodeProviderConfig,
} from "./claude-code-settings.js";
import {
  parseClaudeCodeOutput,
  type ClaudeCodeRunMetrics,
} from "./claude-code-output-parser.js";

export type ClaudeCodeProviderRunResult = ProviderRunResult & {
  claudeMetrics: ClaudeCodeRunMetrics;
};

export async function runClaudeCodeProvider(
  config: ClaudeCodeProviderConfig,
  input: ProviderRunInput,
): Promise<ClaudeCodeProviderRunResult> {
  const args = buildClaudeCodeArgs(config.args ?? [], config.settings);
  if (input.mcpConfigPath) {
    // `--mcp-config <path>` is the documented Claude Code flag for
    // pointing the runtime at an `.mcp.json`. Inject it before the
    // prompt so a `input: "arg"` provider keeps the prompt as the
    // final positional.
    args.push("--mcp-config", input.mcpConfigPath);
  }
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
      `Failed to invoke Claude Code at "${config.command}". Is it installed and on PATH?`,
      err,
    );
  } finally {
    if (sandboxCleanup) await sandboxCleanup().catch(() => undefined);
  }

  const claudeMetrics = parseClaudeCodeOutput({
    outputFormat: config.settings?.outputFormat,
    stdout: result.stdout,
  });

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
    claudeMetrics,
  };
}

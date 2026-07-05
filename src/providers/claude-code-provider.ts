import { runArgvCommand } from "../execution/command-runner.js";
import { ProviderError } from "../utils/errors.js";
import type { ProviderRunInput, ProviderRunResult } from "./provider-types.js";
import {
  buildClaudeCodeArgs,
  effectiveClaudeOutputFormat,
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
  const writeCapable = input.allowWrite === true;
  const args = buildClaudeCodeArgs(config.args ?? [], config.settings, {
    writeCapable,
    hardenReadOnly: input.hardenReadOnly === true,
  });
  // What was ACTUALLY applied (mirrors buildClaudeCodeArgs' own condition): the
  // hardening lands only on a non-write turn, with the toggle on, and no explicit
  // permissionMode override. This is the evidence the assurance posture reads -
  // never config alone.
  const appliedReadOnlyHardening =
    !writeCapable &&
    input.hardenReadOnly === true &&
    !config.settings?.permissionMode;
  // Apply the resolved profile's model + effort - both real `claude` flags
  // (`--model <id>`, `--effort <low|medium|high|xhigh|max>`).
  if (input.model) {
    args.push("--model", input.model);
  }
  if (input.effort) {
    args.push("--effort", input.effort);
  }
  if (input.mcpConfigPath) {
    // `--mcp-config <path>` is the documented Claude Code flag for
    // pointing the runtime at an `.mcp.json`. Inject it before the
    // prompt so a `input: "arg"` provider keeps the prompt as the
    // final positional.
    args.push("--mcp-config", input.mcpConfigPath);
  }
  if (input.session?.action === "resume") {
    args.push("--resume", input.session.sessionId);
  } else if (input.session?.action === "open") {
    args.push("--session-id", input.session.sessionId);
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
    env.VIBESTRATE_MCP_CONFIG = input.mcpConfigPath;
  }

  // Container/cloud execution: rewrite the spawn through the
  // backend's strategy (e.g. `docker exec`), keeping backend=docker consistent
  // across providers. The strategy controls the in-container env (allowlist).
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
      `Failed to invoke Claude Code at "${config.command}". Is it installed and on PATH?`,
      err,
    );
  }

  const claudeMetrics = parseClaudeCodeOutput({
    // The RESOLVED format (the streaming default included), not just the
    // explicit setting - the args we actually ran carry this format.
    outputFormat: effectiveClaudeOutputFormat(config) ?? undefined,
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
    appliedReadOnlyHardening,
    executedIn,
    session: input.session
      ? {
          action: input.session.action === "resume" ? "reused" : "opened",
          sessionId: claudeMetrics.sessionId ?? input.session.sessionId,
        }
      : null,
    claudeMetrics,
  };
}

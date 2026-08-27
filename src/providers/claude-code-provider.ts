// The `claude-code` provider adapter: turns a provider config plus one turn's
// ProviderRunInput into a `claude` argv, spawns it through runArgvCommand, and
// parses the CLI's output into that turn's metrics. provider-runner dispatches
// here for providers of type "claude-code".
//
// Argv ORDER is load-bearing. Several claude flags are variadic
// (`--disallowedTools <tools...>` and friends), so when the provider passes its
// prompt as an argument (`config.input === "arg"`) the prompt is appended last,
// behind a `--` separator. A new flag belongs above that branch. Pushed after
// it, it lands past the separator and claude stops parsing it as an option - it
// becomes a stray positional instead.
//
// An `execStrategy` rewrites only the spawned command/args/env (e.g. `docker
// exec`); the returned `args` stay the claude argv, and `executedIn` records
// where the turn actually ran.

import { runArgvCommand } from "../core/execution/command-runner.js";
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


/**
 * The no-write half of a shell-capable (review_exec) turn, enforced at the
 * tool layer: acceptEdits lets commands run, this cut keeps the file-edit
 * tools out of the invocation entirely. Shell redirection can still touch the
 * disposable worktree - the diff is the audit trail - but the agent has no
 * edit tools to reach for, which is a mechanism, not a prompt request.
 * Exported for the test that pins the mechanism.
 */
export function effectiveDisallowedTools(
  shellCapable: boolean,
  fromProfile: readonly string[] | null | undefined,
): string[] {
  const base = fromProfile ?? [];
  if (!shellCapable) return [...base];
  return [...new Set([...base, "Edit", "Write", "NotebookEdit"])];
}

export async function runClaudeCodeProvider(
  config: ClaudeCodeProviderConfig,
  input: ProviderRunInput,
): Promise<ClaudeCodeProviderRunResult> {
  const writeCapable = input.allowWrite === true;
  const shellCapable = !writeCapable && input.allowShell === true;
  const args = buildClaudeCodeArgs(config.args ?? [], config.settings, {
    writeCapable,
    shellCapable,
    hardenReadOnly: input.hardenReadOnly === true,
  });
  // What was ACTUALLY applied, mirroring buildClaudeCodeArgs' auto-hardening
  // branch: it lands on a non-write turn, with the toggle on, and no explicit
  // permissionMode override (an explicitly configured permissionMode emits the
  // flag by its own path and is not counted here). This is the evidence the
  // assurance posture reads, not config.
  const appliedReadOnlyHardening =
    !writeCapable &&
    !shellCapable &&
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
  const disallowedTools = effectiveDisallowedTools(
    shellCapable,
    input.disallowedTools,
  );
  if (disallowedTools.length > 0) {
    // One comma-joined token (Claude Code splits it), mirroring `--allowed-tools`
    // in claude-code-settings.ts. `--disallowedTools` is variadic (`<tools...>`),
    // so on an `input: "arg"` provider it would keep consuming argv past the list
    // - the `--` separator pushed before the prompt (below) is what actually
    // stops the trailing positional being read as more tool names. The default
    // provider streams the prompt over stdin, so no positional exists there.
    args.push("--disallowedTools", disallowedTools.join(","));
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
    // `--` ends option parsing so the prompt can never be swallowed by a
    // preceding variadic flag. --disallowedTools, --allowed-tools, and
    // --mcp-config all take `<...>` and would otherwise read this trailing
    // positional as one more of their values (a silently prompt-stripped run).
    args.push("--", input.prompt);
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

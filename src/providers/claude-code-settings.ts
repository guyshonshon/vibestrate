import { z } from "zod";

// Optional, additive settings for the Claude Code runtime provider.
// We never invent a flag we don't know exists. Each option here is opt-in
// and only adds args when the user has explicitly set it.

export const claudeCodeSettingsSchema = z
  .object({
    outputFormat: z.enum(["text", "json", "stream-json"]).optional(),
    maxTurns: z.number().int().positive().optional(),
    maxBudgetUsd: z.number().nonnegative().optional(),
    permissionMode: z
      .enum(["default", "acceptEdits", "plan", "bypassPermissions"])
      .optional(),
    allowedTools: z.array(z.string()).optional(),
    settingsFile: z.string().optional(),
    /** OPT-IN hermetic turns: `--safe-mode` disables the operator's own
     *  CLAUDE.md / hooks / plugins inside run turns (auth and permissions
     *  unaffected). DEFAULT IS OFF on purpose - the user's environment is
     *  legitimate context ("models should work as they naturally want to");
     *  vibestrate-compiled prompts, skills, and explicit MCP are unaffected
     *  either way. */
    safeMode: z.boolean().optional(),
    includePartialMessages: z.boolean().optional(),
    includeHookEvents: z.boolean().optional(),
    extraArgs: z.array(z.string()).optional(),
  })
  .partial();

export type ClaudeCodeSettings = z.infer<typeof claudeCodeSettingsSchema>;

export type ClaudeCodeProviderConfig = {
  type: "claude-code";
  command: string;
  args: string[];
  input: "stdin" | "arg";
  env?: Record<string, string>;
  settings?: ClaudeCodeSettings;
};

/**
 * The output format a claude-code provider actually runs with. Streaming is
 * the DEFAULT: without `--output-format stream-json` the claude CLI buffers
 * its whole answer until exit, so the dashboard's live transcript shows
 * nothing while a step works (the first real run reviewed for 3 minutes in
 * total silence). Explicit `settings.outputFormat` always wins; a raw
 * `--output-format` in the config's args/extraArgs means the user manages the
 * format manually and we keep our hands off (returns null).
 */
export function effectiveClaudeOutputFormat(
  config: Pick<ClaudeCodeProviderConfig, "args" | "settings">,
): "text" | "json" | "stream-json" | null {
  if (config.settings?.outputFormat) return config.settings.outputFormat;
  if ((config.args ?? []).includes("--output-format")) return null;
  if ((config.settings?.extraArgs ?? []).includes("--output-format")) return null;
  return "stream-json";
}

export function buildClaudeCodeArgs(
  baseArgs: readonly string[],
  settings: ClaudeCodeSettings | undefined,
  opts?: { writeCapable?: boolean; hardenReadOnly?: boolean },
): string[] {
  const out = [...baseArgs];

  // Auto-derive the claude permission mode from the seat's resolved write
  // capability. A write-capable seat (orchestrator passes profile.allowWrite)
  // gets `--permission-mode acceptEdits` so the headless `claude -p` can apply
  // its file edits in the worktree without an interactive grant - the vibestrate
  // `code_write` permission alone never reached the claude CLI, so writes were
  // silently denied. A read-only seat with `hardenReadOnly` on (opt-in
  // `policies.hardenReadOnlySeats`) instead gets `--permission-mode plan`, so the
  // CLI itself refuses writes (the agent won't even attempt them) rather than
  // leaning on claude's headless default. Guards: only when the user hasn't set
  // an explicit permissionMode (explicit config always wins); write capability
  // takes precedence over the read-only hardening. This is a permission-mode
  // grant only; command execution is brokered by vibestrate separately, not by
  // claude's own Bash.
  if (!settings?.permissionMode) {
    if (opts?.writeCapable) {
      out.push("--permission-mode", "acceptEdits");
    } else if (opts?.hardenReadOnly) {
      out.push("--permission-mode", "plan");
    }
  }

  // Output format: explicit settings > manual args > the streaming default
  // (see effectiveClaudeOutputFormat). null = the user's raw args carry
  // --output-format themselves; add nothing.
  const format = effectiveClaudeOutputFormat({ args: [...baseArgs], settings });
  if (format) {
    out.push("--output-format", format);
    // `claude -p --output-format stream-json` REQUIRES --verbose (the CLI
    // errors without it).
    if (format === "stream-json" && !out.includes("--verbose")) {
      out.push("--verbose");
    }
    // The streaming DEFAULT also turns on token-level partials - that's what
    // makes the live view live. Explicit settings keep full control: an
    // explicit outputFormat only gets partials via includePartialMessages.
    if (
      format === "stream-json" &&
      !settings?.outputFormat &&
      settings?.includePartialMessages === undefined
    ) {
      out.push("--include-partial-messages");
    }
  }

  if (!settings) return out;
  if (settings.maxTurns !== undefined) {
    out.push("--max-turns", String(settings.maxTurns));
  }
  if (settings.permissionMode) {
    out.push("--permission-mode", settings.permissionMode);
  }
  if (settings.allowedTools && settings.allowedTools.length > 0) {
    out.push("--allowed-tools", settings.allowedTools.join(","));
  }
  if (settings.settingsFile) {
    out.push("--settings", settings.settingsFile);
  }
  if (settings.safeMode === true && !out.includes("--safe-mode")) {
    out.push("--safe-mode");
  }
  if (settings.includePartialMessages) {
    out.push("--include-partial-messages");
  }
  if (settings.extraArgs && settings.extraArgs.length > 0) {
    out.push(...settings.extraArgs);
  }
  return out;
}

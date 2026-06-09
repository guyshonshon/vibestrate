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

export function buildClaudeCodeArgs(
  baseArgs: readonly string[],
  settings: ClaudeCodeSettings | undefined,
  opts?: { writeCapable?: boolean },
): string[] {
  const out = [...baseArgs];

  // Auto-derive the claude permission mode from the seat's resolved write
  // capability. A write-capable seat (orchestrator passes profile.allowWrite)
  // gets `--permission-mode acceptEdits` so the headless `claude -p` can apply
  // its file edits in the worktree without an interactive grant - the vibestrate
  // `code_write` permission alone never reached the claude CLI, so writes were
  // silently denied. Guards: only when the user hasn't set an explicit
  // permissionMode (explicit config always wins), and never for a read-only /
  // forced-read-only / apply-only seat (writeCapable is false there, so no
  // grant). This is a write grant only; command execution is brokered by
  // vibestrate separately, not by claude's own Bash.
  if (opts?.writeCapable && !settings?.permissionMode) {
    out.push("--permission-mode", "acceptEdits");
  }

  if (!settings) return out;

  if (settings.outputFormat) {
    out.push("--output-format", settings.outputFormat);
    // `claude -p --output-format stream-json` REQUIRES --verbose (the CLI errors
    // without it). Add it for stream-json so the preset is valid out of the box.
    if (settings.outputFormat === "stream-json" && !out.includes("--verbose")) {
      out.push("--verbose");
    }
  }
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
  if (settings.includePartialMessages) {
    out.push("--include-partial-messages");
  }
  if (settings.extraArgs && settings.extraArgs.length > 0) {
    out.push(...settings.extraArgs);
  }
  return out;
}

import type { CliProviderConfig } from "../provider-schema.js";

/**
 * Starter preset for OpenAI's `codex` CLI.
 *
 * What Vibestrate knows for sure: the binary is named `codex`; recent versions
 * expose a non-interactive entry point. The exact flag matrix has moved
 * across releases, so we ship the most-documented invocation and ask the
 * user to verify with `vibe provider test` before relying on it.
 *
 * Default: `codex exec` with the prompt on stdin. `exec` runs a one-shot
 * (non-interactive) rather than dropping into the REPL, and prints the
 * agent's reply to stdout. Older releases took a `-q` flag for this; current
 * codex (0.13x) removed it and now rejects `-q` with an "unexpected argument"
 * usage error (exit 2), so we no longer pass it.
 *
 * If the user's installation rejects these flags, `vibe provider setup`
 * walks through `command`, `args`, and `input` and rewrites this entry.
 */
export const codexPreset: CliProviderConfig = {
  type: "cli",
  command: "codex",
  args: ["exec"],
  input: "stdin",
};

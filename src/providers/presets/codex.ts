import type { CliProviderConfig } from "../provider-schema.js";

/**
 * Starter preset for OpenAI's `codex` CLI.
 *
 * What Amaco knows for sure: the binary is named `codex`; recent versions
 * expose a non-interactive entry point. The exact flag matrix has moved
 * across releases, so we ship the most-documented invocation and ask the
 * user to verify with `amaco provider test` before relying on it.
 *
 * Default: `codex exec -q` with the prompt on stdin. `-q` keeps the
 * output machine-readable; `exec` runs a one-shot rather than dropping
 * into the interactive REPL.
 *
 * If the user's installation rejects these flags, `amaco provider setup`
 * walks through `command`, `args`, and `input` and rewrites this entry.
 */
export const codexPreset: CliProviderConfig = {
  type: "cli",
  command: "codex",
  args: ["exec", "-q"],
  input: "stdin",
};

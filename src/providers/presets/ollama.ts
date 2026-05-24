import type { CliProviderConfig } from "../provider-schema.js";

/**
 * Starter preset for Ollama's local CLI.
 *
 * Ollama requires a model name. We use a coding-oriented default and keep this
 * as a starter preset, not an auto-configured "ready" provider, because model
 * availability varies by machine. Change `args` in project.yml if you want a
 * different local model.
 */
export const ollamaPreset: CliProviderConfig = {
  type: "cli",
  command: "ollama",
  args: ["run", "qwen3.5"],
  input: "stdin",
};

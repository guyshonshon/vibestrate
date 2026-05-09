import type { CliProviderConfig } from "../provider-schema.js";

export const claudeCodePreset: CliProviderConfig = {
  type: "cli",
  command: "claude",
  args: ["-p"],
  input: "stdin",
};

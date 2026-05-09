import type { CliProviderConfig } from "../provider-schema.js";

export const genericCliPreset: CliProviderConfig = {
  type: "cli",
  command: "your-cli-here",
  args: [],
  input: "stdin",
};

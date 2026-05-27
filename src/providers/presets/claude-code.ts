import type { CliProviderConfig } from "../provider-schema.js";

// Default claude preset. The richer `claude-code` + stream-json mode (live
// output + native token/cost) is supported and opt-in via project.yml
// (`type: claude-code`, `settings.outputFormat: stream-json`); making it the
// default requires unifying the two preset builders first — see
// docs/design/provider-structured-output.md.
export const claudeCodePreset: CliProviderConfig = {
  type: "cli",
  command: "claude",
  args: ["-p"],
  input: "stdin",
};

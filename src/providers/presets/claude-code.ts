import type { ClaudeCodeProviderSchemaConfig } from "../provider-schema.js";

// Canonical claude preset: the first-class `claude-code` provider in stream-json
// mode, so amaco gets live token-by-token output + real token/cost metrics out
// of the box. Effective args: `claude -p --output-format stream-json --verbose
// --include-partial-messages`, prompt on stdin. The stream-json adapter extracts
// the response text + usage; see docs/design/provider-structured-output.md.
export const claudeCodePreset: ClaudeCodeProviderSchemaConfig = {
  type: "claude-code",
  command: "claude",
  args: ["-p"],
  input: "stdin",
  settings: {
    outputFormat: "stream-json",
    includePartialMessages: true,
  },
};

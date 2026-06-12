import type { ProviderConfig } from "../provider-schema.js";
import {
  textOutputAdapter,
  type ProviderOutputAdapter,
} from "../output-adapter.js";
import { effectiveClaudeOutputFormat } from "../claude-code-settings.js";
import { claudeStreamJsonAdapter } from "./claude-stream-json.js";

/**
 * Pick the output adapter for a provider config. claude-code resolving to
 * stream-json (explicit setting OR the streaming default) gets the structured
 * adapter; everything else uses the verbatim text adapter.
 */
export function selectOutputAdapter(
  config: ProviderConfig,
): ProviderOutputAdapter {
  if (
    config.type === "claude-code" &&
    effectiveClaudeOutputFormat(config) === "stream-json"
  ) {
    return claudeStreamJsonAdapter;
  }
  return textOutputAdapter;
}

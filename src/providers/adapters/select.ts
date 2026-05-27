import type { ProviderConfig } from "../provider-schema.js";
import {
  textOutputAdapter,
  type ProviderOutputAdapter,
} from "../output-adapter.js";
import { claudeStreamJsonAdapter } from "./claude-stream-json.js";

/**
 * Pick the output adapter for a provider config. Only claude-code with
 * `outputFormat: stream-json` gets a structured adapter today; everything else
 * uses the verbatim text adapter (unchanged behavior).
 */
export function selectOutputAdapter(
  config: ProviderConfig,
): ProviderOutputAdapter {
  if (
    config.type === "claude-code" &&
    config.settings?.outputFormat === "stream-json"
  ) {
    return claudeStreamJsonAdapter;
  }
  return textOutputAdapter;
}

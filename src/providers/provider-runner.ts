import { ProviderError } from "../utils/errors.js";
import type { ProviderConfig, ProvidersConfigMap } from "./provider-schema.js";
import type { ProviderRunInput, ProviderRunResult } from "./provider-types.js";
import { runCliProvider } from "./cli-provider.js";
import {
  runClaudeCodeProvider,
  type ClaudeCodeProviderRunResult,
} from "./claude-code-provider.js";
import type { ClaudeCodeRunMetrics } from "./claude-code-output-parser.js";
import {
  textOutputAdapter,
  type NormalizedMetrics,
  type NormalizedTurn,
} from "./output-adapter.js";
import { claudeStreamJsonAdapter } from "./adapters/claude-stream-json.js";

export type RichProviderRunResult = ProviderRunResult & {
  claudeMetrics?: ClaudeCodeRunMetrics;
  /** Output normalized to the supervision/metrics contract (see
   *  output-adapter.ts). Control + metrics consume this, not the raw stdout. */
  normalized: NormalizedTurn;
};

function claudeMetricsToNormalized(m: ClaudeCodeRunMetrics): NormalizedMetrics {
  return {
    model: m.model ?? null,
    totalCostUsd: m.totalCostUsd ?? null,
    perModelCost: m.perModelCost ?? [],
    tokenUsage: m.tokenUsage ?? null,
    toolCallCount: m.toolCallCount ?? null,
    sessionId: m.sessionId ?? null,
  };
}

export function resolveProvider(
  providers: ProvidersConfigMap,
  providerId: string,
): ProviderConfig {
  const provider = providers[providerId];
  if (!provider) {
    throw new ProviderError(
      `Provider "${providerId}" is not configured in .vibestrate/project.yml. Run \`vibestrate provider setup\` to add one, or \`vibestrate provider list\` to see what is configured.`,
    );
  }
  return provider;
}

export async function runProvider(
  providers: ProvidersConfigMap,
  input: ProviderRunInput,
): Promise<RichProviderRunResult> {
  const provider = resolveProvider(providers, input.providerId);
  if (provider.type === "cli") {
    const result = await runCliProvider(provider, input);
    // No structured adapter for generic CLIs yet → the text adapter: stdout is
    // the response, no native metrics (exactly as before adapters existed).
    return { ...result, normalized: textOutputAdapter.finalize(result.stdout) };
  }
  if (provider.type === "claude-code") {
    const result: ClaudeCodeProviderRunResult = await runClaudeCodeProvider(
      provider,
      input,
    );
    // stream-json: the adapter extracts the response text + usage from the
    // event stream (fails loud if it can't). text/json: stdout is the answer,
    // metrics from the existing claude parser.
    if (provider.settings?.outputFormat === "stream-json") {
      return { ...result, normalized: claudeStreamJsonAdapter.finalize(result.stdout) };
    }
    return {
      ...result,
      normalized: {
        responseText: result.stdout,
        metrics: claudeMetricsToNormalized(result.claudeMetrics),
      },
    };
  }
  throw new ProviderError(
    `Unsupported provider type for "${input.providerId}".`,
  );
}

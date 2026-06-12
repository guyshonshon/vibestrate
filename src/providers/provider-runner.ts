import { ProviderError } from "../utils/errors.js";
import type { ProviderConfig, ProvidersConfigMap } from "./provider-schema.js";
import type { ProviderRunInput, ProviderRunResult } from "./provider-types.js";
import { runCliProvider } from "./cli-provider.js";
import {
  runClaudeCodeProvider,
  type ClaudeCodeProviderRunResult,
} from "./claude-code-provider.js";
import { effectiveClaudeOutputFormat } from "./claude-code-settings.js";
import type { ClaudeCodeRunMetrics } from "./claude-code-output-parser.js";
import {
  textOutputAdapter,
  type NormalizedMetrics,
  type NormalizedTurn,
} from "./output-adapter.js";
import { claudeStreamJsonAdapter } from "./adapters/claude-stream-json.js";
import { runHttpApiProvider } from "./http-api-provider.js";

export type RichProviderRunResult = ProviderRunResult & {
  claudeMetrics?: ClaudeCodeRunMetrics;
  /** Output normalized to the supervision/metrics contract (see
   *  output-adapter.ts). Control + metrics consume this, not the raw stdout. */
  normalized: NormalizedTurn;
  /** Set by the resilience layer when it gives up on a failed turn: the
   *  classified failure (core/provider-resilience.ts) plus a short redacted
   *  excerpt of the provider's error text, so downstream records say WHY
   *  ("rate-limit: This model is being rate limited...") instead of just
   *  "provider exited 1". Absent on success and on non-resilient paths. */
  failure?: {
    class: "usage-limit" | "rate-limit" | "transient" | "hard";
    excerpt: string;
  };
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
      `Provider "${providerId}" is not configured in .vibestrate/project.yml. Run \`vibe provider setup\` to add one, or \`vibe provider list\` to see what is configured.`,
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
    // stream-json (explicit OR the streaming default): the adapter extracts
    // the response text + usage from the event stream. NON-FATAL by design
    // (adversarial review): a binary that rejects the flags or prints plain
    // text must not brick the run before the orchestrator's exit-code
    // handling can surface the real stderr.
    if (effectiveClaudeOutputFormat(provider) === "stream-json") {
      const textFallback = (responseText: string) => ({
        ...result,
        normalized: {
          responseText,
          metrics: claudeMetricsToNormalized(result.claudeMetrics),
        },
      });
      if (result.exitCode !== 0) {
        // Failed invocation: never hand control parsers whatever landed on
        // stdout - empty response, the orchestrator reports exit + stderr.
        return textFallback("");
      }
      try {
        return { ...result, normalized: claudeStreamJsonAdapter.finalize(result.stdout) };
      } catch {
        // Exit 0 but not a parseable event stream: a binary that ignored the
        // format flag and printed plain text. Use it as text only when it
        // doesn't look structured; a half-parsed event stream stays out of
        // the control path (cardinal rule), so fail closed to empty.
        const looksStructured = result.stdout.trimStart().startsWith("{");
        return textFallback(looksStructured ? "" : result.stdout);
      }
    }
    return {
      ...result,
      normalized: {
        responseText: result.stdout,
        metrics: claudeMetricsToNormalized(result.claudeMetrics),
      },
    };
  }
  if (provider.type === "http-api" || provider.type === "localhost-proxy") {
    // One HTTP request per turn; the runner already parsed the response into
    // responseText + real token metrics.
    const result = await runHttpApiProvider(provider, input);
    return result;
  }
  throw new ProviderError(
    `Unsupported provider type for "${input.providerId}".`,
  );
}

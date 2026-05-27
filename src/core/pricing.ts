import type { TokenUsage } from "./runtime-metrics.js";

// Local, static list-price table. No network calls — cost is either what a CLI
// self-reports (preferred) or computed on-device as `tokens × price` and
// clearly labelled an ESTIMATE. These are approximate public list prices in
// USD per 1,000,000 tokens; verify + update as vendors change them. Matched by
// model-id PREFIX so version suffixes (e.g. "claude-opus-4-7[1m]") still
// resolve. Keep specific prefixes before generic ones.
export type ModelPrice = {
  inputPer1M: number;
  outputPer1M: number;
  cacheReadPer1M?: number;
  cacheWritePer1M?: number;
};

const PRICE_TABLE: { prefix: string; price: ModelPrice }[] = [
  // Anthropic Claude
  { prefix: "claude-opus-4", price: { inputPer1M: 15, outputPer1M: 75, cacheReadPer1M: 1.5, cacheWritePer1M: 18.75 } },
  { prefix: "claude-sonnet-4", price: { inputPer1M: 3, outputPer1M: 15, cacheReadPer1M: 0.3, cacheWritePer1M: 3.75 } },
  { prefix: "claude-haiku-4", price: { inputPer1M: 1, outputPer1M: 5, cacheReadPer1M: 0.1, cacheWritePer1M: 1.25 } },
  { prefix: "claude-3-5-haiku", price: { inputPer1M: 0.8, outputPer1M: 4 } },
  // OpenAI
  { prefix: "gpt-4o-mini", price: { inputPer1M: 0.15, outputPer1M: 0.6 } },
  { prefix: "gpt-4o", price: { inputPer1M: 2.5, outputPer1M: 10 } },
  { prefix: "gpt-4.1-mini", price: { inputPer1M: 0.4, outputPer1M: 1.6 } },
  { prefix: "gpt-4.1", price: { inputPer1M: 2, outputPer1M: 8 } },
  { prefix: "o4-mini", price: { inputPer1M: 1.1, outputPer1M: 4.4 } },
  // Google Gemini
  { prefix: "gemini-2.5-pro", price: { inputPer1M: 1.25, outputPer1M: 10 } },
  { prefix: "gemini-2.5-flash", price: { inputPer1M: 0.3, outputPer1M: 2.5 } },
  { prefix: "gemini-1.5-pro", price: { inputPer1M: 1.25, outputPer1M: 5 } },
];

/** Public list price for a model id (prefix match), or null if unknown. */
export function priceForModel(model: string | null | undefined): ModelPrice | null {
  if (!model) return null;
  const m = model.toLowerCase();
  for (const row of PRICE_TABLE) {
    if (m.startsWith(row.prefix)) return row.price;
  }
  return null;
}

// Rough on-device token estimate for providers that don't report usage:
// ~4 characters per token (the common heuristic). Used only when the CLI gives
// us no real counts, and always surfaced as an estimate.
const CHARS_PER_TOKEN = 4;

export function estimateTokensFromText(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN));
}

/** Compute USD cost from token usage + a model's list price, or null when the
 *  model is unknown / there are no tokens. Cache reads/writes are priced at
 *  their own rates when the model defines them, else at the input rate. */
export function costFromTokens(
  model: string | null | undefined,
  usage: TokenUsage | null | undefined,
): number | null {
  const price = priceForModel(model);
  if (!price || !usage) return null;
  const input = usage.input ?? 0;
  const output = usage.output ?? 0;
  const cacheRead = usage.cacheRead ?? 0;
  const cacheWrite = usage.cacheCreation ?? 0;
  if (input + output + cacheRead + cacheWrite === 0) return null;
  const per1M = (n: number, rate: number): number => (n / 1_000_000) * rate;
  return (
    per1M(input, price.inputPer1M) +
    per1M(output, price.outputPer1M) +
    per1M(cacheRead, price.cacheReadPer1M ?? price.inputPer1M) +
    per1M(cacheWrite, price.cacheWritePer1M ?? price.inputPer1M)
  );
}

/**
 * Resolve a turn's cost with the precedence the metrics ledger needs:
 *   1. a CLI-reported cost is authoritative (not an estimate);
 *   2. otherwise compute `tokens × list price` (an estimate);
 *   3. otherwise null (unknown — never fabricated).
 */
export function resolveCost(input: {
  reportedCostUsd: number | null | undefined;
  model: string | null | undefined;
  tokenUsage: TokenUsage | null | undefined;
}): { costUsd: number | null; estimated: boolean } {
  if (input.reportedCostUsd !== null && input.reportedCostUsd !== undefined) {
    return { costUsd: input.reportedCostUsd, estimated: false };
  }
  const computed = costFromTokens(input.model, input.tokenUsage);
  if (computed !== null) return { costUsd: computed, estimated: true };
  return { costUsd: null, estimated: false };
}

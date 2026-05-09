import type { TokenUsage, PerModelCost } from "../core/runtime-metrics.js";

export type ClaudeCodeRunMetrics = {
  sessionId: string | null;
  model: string | null;
  totalCostUsd: number | null;
  perModelCost: PerModelCost[];
  tokenUsage: TokenUsage | null;
  toolCallCount: number | null;
  parseAvailable: boolean;
  parseError?: string;
};

const EMPTY: ClaudeCodeRunMetrics = {
  sessionId: null,
  model: null,
  totalCostUsd: null,
  perModelCost: [],
  tokenUsage: null,
  toolCallCount: null,
  parseAvailable: false,
};

function maybeNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) {
    return Number(v);
  }
  return undefined;
}

function maybeString(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim().length > 0) return v;
  return undefined;
}

function extractTokenUsage(u: unknown): TokenUsage | null {
  if (!u || typeof u !== "object") return null;
  const o = u as Record<string, unknown>;
  const out: TokenUsage = {};
  const inputTokens = maybeNumber(o.input_tokens ?? o.inputTokens);
  const outputTokens = maybeNumber(o.output_tokens ?? o.outputTokens);
  const cacheRead = maybeNumber(
    o.cache_read_input_tokens ??
      o.cache_read_tokens ??
      o.cacheReadTokens ??
      o.cacheReadInputTokens,
  );
  const cacheCreation = maybeNumber(
    o.cache_creation_input_tokens ??
      o.cache_creation_tokens ??
      o.cacheCreationTokens ??
      o.cacheCreationInputTokens,
  );
  if (inputTokens !== undefined) out.input = inputTokens;
  if (outputTokens !== undefined) out.output = outputTokens;
  if (cacheRead !== undefined) out.cacheRead = cacheRead;
  if (cacheCreation !== undefined) out.cacheCreation = cacheCreation;
  return Object.keys(out).length > 0 ? out : null;
}

function extractPerModelCost(v: unknown): PerModelCost[] {
  const out: PerModelCost[] = [];
  if (!v || typeof v !== "object") return out;
  if (Array.isArray(v)) {
    for (const item of v) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const model = maybeString(o.model);
      const cost = maybeNumber(o.cost_usd ?? o.costUsd ?? o.cost);
      if (model && cost !== undefined) {
        out.push({ model, costUsd: cost });
      }
    }
    return out;
  }
  // Object form: { "model-id": { cost_usd: 0.01 } }
  for (const [model, raw] of Object.entries(v as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const cost = maybeNumber(
      (raw as Record<string, unknown>).cost_usd ??
        (raw as Record<string, unknown>).costUsd ??
        (raw as Record<string, unknown>).cost,
    );
    if (cost !== undefined) out.push({ model, costUsd: cost });
  }
  return out;
}

function tryParseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const v = JSON.parse(trimmed);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function parseClaudeCodeOutput(input: {
  outputFormat?: "text" | "json" | "stream-json" | undefined;
  stdout: string;
}): ClaudeCodeRunMetrics {
  if (!input.stdout.trim()) return EMPTY;

  // 1. Try whole-stdout JSON object (single-shot result).
  const single = tryParseJsonObject(input.stdout);
  if (single) {
    return extractFromObject(single);
  }

  // 2. Try last JSON line for stream-json mode.
  const lines = input.stdout.split("\n").filter((l) => l.trim().length > 0);
  for (let i = lines.length - 1; i >= 0; i--) {
    const obj = tryParseJsonObject(lines[i]!);
    if (!obj) continue;
    const looksLikeFinal =
      obj.type === "result" ||
      obj.type === "result-json" ||
      obj.type === "summary" ||
      obj.is_final === true ||
      obj.subtype === "summary";
    if (looksLikeFinal) {
      return extractFromObject(obj);
    }
  }
  // 3. Aggregate streaming events: last meaningful object, fallback to first parseable.
  for (let i = lines.length - 1; i >= 0; i--) {
    const obj = tryParseJsonObject(lines[i]!);
    if (!obj) continue;
    const extracted = extractFromObject(obj);
    if (extracted.parseAvailable) return extracted;
  }

  return EMPTY;
}

function extractFromObject(obj: Record<string, unknown>): ClaudeCodeRunMetrics {
  const sessionId =
    maybeString(obj.session_id) ??
    maybeString(obj.sessionId) ??
    maybeString((obj.metadata as Record<string, unknown> | undefined)?.session_id) ??
    null;
  const model =
    maybeString(obj.model) ??
    maybeString((obj.metadata as Record<string, unknown> | undefined)?.model) ??
    null;
  const totalCost =
    maybeNumber(
      obj.total_cost_usd ??
        obj.totalCostUsd ??
        obj.cost_usd ??
        obj.costUsd ??
        (obj.usage as Record<string, unknown> | undefined)?.total_cost_usd,
    ) ?? null;
  const perModelCost = extractPerModelCost(
    obj.per_model_cost ?? obj.perModelCost ?? obj.cost_breakdown ?? [],
  );
  const tokenUsage =
    extractTokenUsage(obj.usage) ??
    extractTokenUsage(obj.token_usage) ??
    extractTokenUsage(obj.tokenUsage);
  const toolCallCount =
    maybeNumber(
      obj.tool_call_count ??
        obj.toolCallCount ??
        (obj.usage as Record<string, unknown> | undefined)?.tool_use_count ??
        (obj.usage as Record<string, unknown> | undefined)?.toolUseCount,
    ) ?? null;

  const parseAvailable =
    sessionId !== null ||
    model !== null ||
    totalCost !== null ||
    perModelCost.length > 0 ||
    tokenUsage !== null ||
    toolCallCount !== null;

  return {
    sessionId,
    model,
    totalCostUsd: totalCost,
    perModelCost,
    tokenUsage,
    toolCallCount,
    parseAvailable,
  };
}

export const EMPTY_CLAUDE_METRICS = EMPTY;

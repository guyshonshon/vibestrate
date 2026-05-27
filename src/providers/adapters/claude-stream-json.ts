// Claude Code `--output-format stream-json` adapter. Validated against real
// `claude` 2.x output. See docs/design/provider-structured-output.md.
//
// The terminal `result` event carries the final answer + usage:
//   {"type":"result","result":"<text>","total_cost_usd":N,
//    "usage":{"input_tokens","output_tokens","cache_read_input_tokens",
//             "cache_creation_input_tokens"},
//    "modelUsage":{"<model>":{"costUSD","outputTokens",...}},"session_id":"..."}
// Live text streams as:
//   {"type":"stream_event","event":{"type":"content_block_delta",
//    "delta":{"type":"text_delta","text":"..."}}}
import {
  OutputAdapterError,
  type NormalizedMetrics,
  type ProviderOutputAdapter,
} from "../output-adapter.js";

type JsonObj = Record<string, unknown>;

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Parse JSONL, tolerating the odd non-JSON line (failure is decided by the
 *  absence of a `result` event, not one malformed line). */
function parseEvents(raw: string): JsonObj[] {
  const out: JsonObj[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const o = JSON.parse(t);
      if (o && typeof o === "object") out.push(o as JsonObj);
    } catch {
      /* tolerate */
    }
  }
  return out;
}

function metricsFromResult(result: JsonObj): NormalizedMetrics {
  const usage = (result.usage as JsonObj | undefined) ?? {};
  const modelUsage =
    (result.modelUsage as Record<string, JsonObj> | undefined) ?? {};
  const perModelCost: { model: string; costUsd: number }[] = [];
  let primaryModel: string | null = null;
  let primaryCost = -1;
  for (const [model, mu] of Object.entries(modelUsage)) {
    const cost = num(mu.costUSD) ?? 0;
    perModelCost.push({ model, costUsd: cost });
    // The "primary" model is the costliest one — a background title/summary
    // model (e.g. haiku) can emit more tokens than the main model.
    if (cost > primaryCost) {
      primaryCost = cost;
      primaryModel = model;
    }
  }
  return {
    model: primaryModel,
    totalCostUsd: num(result.total_cost_usd) ?? null,
    perModelCost,
    tokenUsage: {
      input: num(usage.input_tokens),
      output: num(usage.output_tokens),
      cacheRead: num(usage.cache_read_input_tokens),
      cacheCreation: num(usage.cache_creation_input_tokens),
    },
    toolCallCount: null,
    sessionId: typeof result.session_id === "string" ? result.session_id : null,
  };
}

function deltaText(o: JsonObj): string {
  if (o.type !== "stream_event") return "";
  const ev = o.event as JsonObj | undefined;
  if (ev?.type !== "content_block_delta") return "";
  const delta = ev.delta as JsonObj | undefined;
  // Only the assistant's visible text — skip thinking/signature/tool blocks.
  if (delta?.type === "text_delta" && typeof delta.text === "string") {
    return delta.text;
  }
  return "";
}

export const claudeStreamJsonAdapter: ProviderOutputAdapter = {
  id: "claude-stream-json",

  finalize(rawStdout) {
    const events = parseEvents(rawStdout);
    const result = [...events]
      .reverse()
      .find((e) => e.type === "result") as JsonObj | undefined;
    // Fail loud: never guess the response from a stream we can't read — a
    // missed result here would feed the control parsers garbage.
    if (!result || typeof result.result !== "string") {
      throw new OutputAdapterError(
        "claude stream-json: no terminal `result` event with a string `result`.",
      );
    }
    return { responseText: result.result, metrics: metricsFromResult(result) };
  },

  // Chunks aren't line-aligned, so buffer until whole JSON lines are available,
  // then emit only assistant text deltas. Display-only; never the control path.
  createLiveFilter() {
    let buf = "";
    return (chunk: string): string => {
      buf += chunk;
      let emit = "";
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let o: JsonObj;
        try {
          o = JSON.parse(line) as JsonObj;
        } catch {
          continue;
        }
        emit += deltaText(o);
      }
      return emit;
    };
  },
};

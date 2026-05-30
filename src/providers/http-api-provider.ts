// ── HTTP-API provider (Phase 4) ─────────────────────────────────────────────
//
// Drives a non-CLI model over HTTP: an external cloud API (Anthropic / OpenAI)
// or a localhost model server (Ollama / LM Studio / vLLM, OpenAI-compatible).
// One non-streaming request per turn; the real token usage from the response is
// mapped to NormalizedMetrics (so cloud/proxy runs report real tokens, not
// estimates — Phase 4 A7 for these providers).
//
// Safety: the API key is an env-ref resolved at call time (never read from
// config literals), never logged, and redacted from any error surfaced.

import { ProviderError } from "../utils/errors.js";
import { resolveSecret, envVarName, redact } from "../notifications/gateways/secret-resolver.js";
import { nowIso } from "../utils/time.js";
import type {
  HttpApiProviderConfig,
  LocalhostProxyProviderConfig,
} from "./provider-schema.js";
import type { ProviderRunInput, ProviderRunResult } from "./provider-types.js";
import type { NormalizedMetrics, NormalizedTurn } from "./output-adapter.js";

type AnyHttpProvider = HttpApiProviderConfig | LocalhostProxyProviderConfig;

export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<{ ok: boolean; status: number; statusText: string; text(): Promise<string> }>;

const DEFAULT_TIMEOUT_MS = 600_000;

export type HttpApiRunResult = ProviderRunResult & { normalized: NormalizedTurn };

function trimSlash(u: string): string {
  return u.replace(/\/+$/, "");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function buildRequest(
  config: AnyHttpProvider,
  prompt: string,
  apiKey: string | undefined,
): { url: string; headers: Record<string, string>; body: string } {
  const base = trimSlash(config.baseUrl);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (config.type === "http-api" && config.headers) {
    Object.assign(headers, config.headers);
  }

  if (config.api === "anthropic") {
    if (apiKey) headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
    return {
      url: `${base}/v1/messages`,
      headers,
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    };
  }
  if (config.api === "openai") {
    if (apiKey) headers["authorization"] = `Bearer ${apiKey}`;
    return {
      url: `${base}/v1/chat/completions`,
      headers,
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    };
  }
  // ollama (localhost native)
  if (apiKey) headers["authorization"] = `Bearer ${apiKey}`;
  return {
    url: `${base}/api/chat`,
    headers,
    body: JSON.stringify({
      model: config.model,
      stream: false,
      messages: [{ role: "user", content: prompt }],
    }),
  };
}

function parseResponse(
  api: AnyHttpProvider["api"],
  raw: string,
): { responseText: string; metrics: NormalizedMetrics } {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new ProviderError(`Provider returned non-JSON response: ${raw.slice(0, 300)}`);
  }
  if (!isRecord(data)) throw new ProviderError("Provider response was not an object.");

  const blank: NormalizedMetrics = {
    model: null,
    totalCostUsd: null,
    perModelCost: [],
    tokenUsage: null,
    toolCallCount: null,
    sessionId: null,
  };

  if (api === "anthropic") {
    const content = Array.isArray(data.content) ? data.content : [];
    const responseText = content
      .map((b) => (isRecord(b) && b.type === "text" && typeof b.text === "string" ? b.text : ""))
      .join("");
    const u = isRecord(data.usage) ? data.usage : {};
    return {
      responseText,
      metrics: {
        ...blank,
        model: typeof data.model === "string" ? data.model : null,
        tokenUsage: {
          input: numOr(u.input_tokens),
          output: numOr(u.output_tokens),
          cacheRead: numOr(u.cache_read_input_tokens),
          cacheCreation: numOr(u.cache_creation_input_tokens),
        },
      },
    };
  }
  if (api === "openai") {
    const choices = Array.isArray(data.choices) ? data.choices : [];
    const first = isRecord(choices[0]) ? choices[0] : {};
    const msg = isRecord(first.message) ? first.message : {};
    const responseText = typeof msg.content === "string" ? msg.content : "";
    const u = isRecord(data.usage) ? data.usage : {};
    return {
      responseText,
      metrics: {
        ...blank,
        model: typeof data.model === "string" ? data.model : null,
        tokenUsage: { input: numOr(u.prompt_tokens), output: numOr(u.completion_tokens) },
      },
    };
  }
  // ollama
  const msg = isRecord(data.message) ? data.message : {};
  const responseText = typeof msg.content === "string" ? msg.content : "";
  return {
    responseText,
    metrics: {
      ...blank,
      model: typeof data.model === "string" ? data.model : null,
      tokenUsage: { input: numOr(data.prompt_eval_count), output: numOr(data.eval_count) },
    },
  };
}

function numOr(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export async function runHttpApiProvider(
  config: AnyHttpProvider,
  input: ProviderRunInput,
  fetchImpl?: FetchLike,
): Promise<HttpApiRunResult> {
  const startedAt = nowIso();
  const start = Date.now();

  // Resolve the key (required for cloud http-api; optional for localhost).
  let apiKey: string | undefined;
  if (config.type === "http-api") {
    apiKey = resolveSecret(config.apiKey);
    if (!apiKey) {
      throw new ProviderError(
        `Provider "${input.providerId}" needs its API key: set the env var ${envVarName(config.apiKey) ?? "(unset)"}.`,
      );
    }
  } else if (config.apiKey) {
    apiKey = resolveSecret(config.apiKey);
  }

  const { url, headers, body } = buildRequest(config, input.prompt, apiKey);
  const doFetch: FetchLike = fetchImpl ?? (globalThis.fetch as unknown as FetchLike);

  // Combine the caller's abort signal with a timeout.
  const timeout = AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
  const signal = input.signal
    ? anySignal([input.signal, timeout])
    : timeout;

  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await doFetch(url, { method: "POST", headers, body, signal });
  } catch (err) {
    throw new ProviderError(
      `HTTP provider request failed: ${redact(err, [apiKey])}`,
    );
  }
  const text = await res.text();
  const endedAt = nowIso();
  const durationMs = Date.now() - start;

  if (!res.ok) {
    // Never leak the key; redact the body just in case it echoes auth headers.
    throw new ProviderError(
      `HTTP provider ${url} returned ${res.status} ${res.statusText}: ${redact(text, [apiKey]).slice(0, 500)}`,
    );
  }

  const { responseText, metrics } = parseResponse(config.api, text);
  return {
    providerId: input.providerId,
    command: `${config.type}:${config.api}`,
    args: [config.model],
    cwd: input.cwd,
    exitCode: 0,
    stdout: responseText,
    stderr: "",
    durationMs,
    startedAt,
    endedAt,
    normalized: { responseText, metrics },
  };
}

/** Minimal AbortSignal.any polyfill (Node <20). */
function anySignal(signals: AbortSignal[]): AbortSignal {
  const anyFn = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (typeof anyFn === "function") return anyFn(signals);
  const ctrl = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      ctrl.abort(s.reason);
      break;
    }
    s.addEventListener("abort", () => ctrl.abort(s.reason), { once: true });
  }
  return ctrl.signal;
}

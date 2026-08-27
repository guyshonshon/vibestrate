// Ask a cloud provider which models it actually has.
//
// OPT-IN, ALWAYS. Vibestrate's default posture is "no model APIs unless
// explicitly requested": the built-in catalog and the project's overlay are
// static data, and nothing in a run ever reaches a vendor to ask questions.
// Probing breaks both halves of that - it is egress, and it spends the user's
// key - so it happens only when someone runs `vibe provider models --probe`,
// never on load, never during a run, and never as a fallback when the catalog
// looks thin.
//
// The catalog is only ever SUGGESTIONS. A model can always be typed by hand, so
// a probe that fails costs nothing but the suggestions, and is reported rather
// than retried.
//
// Secrets: the key is read through the same `resolveSecret` the provider uses
// and is never returned, logged, or put in an error. Failures go through
// `redact` with the key in the redaction list, so a vendor that echoes the
// Authorization header back in an error body cannot leak it into a terminal.
import {
  resolveSecret,
  envVarName,
  redact,
} from "../notifications/gateways/secret-resolver.js";

export type ProbeApi = "openai" | "anthropic" | "ollama";

export type ProbeResult =
  | { ok: true; models: string[] }
  | { ok: false; code: "no-key" | "http" | "unreachable" | "unreadable"; reason: string };

export type ProbeFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

const TIMEOUT_MS = 15_000;

/**
 * The models endpoint for an api family, derived from the configured chat URL.
 *
 * Derived rather than configured, because the two always sit on one base and a
 * second URL to keep in sync is a second thing to get wrong. Anthropic and
 * OpenAI both expose `/v1/models`; Ollama uses `/api/tags`.
 */
export function modelsUrlFor(api: ProbeApi, chatUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(chatUrl);
  } catch {
    return null;
  }
  if (api === "ollama") {
    u.pathname = "/api/tags";
    return u.toString();
  }
  // Everything before the first path segment that starts the chat route.
  // `/v1/chat/completions` and `/v1/messages` both reduce to `/v1`.
  const marker = u.pathname.indexOf("/chat/");
  const base =
    marker !== -1
      ? u.pathname.slice(0, marker)
      : u.pathname.replace(/\/messages\/?$/, "").replace(/\/$/, "");
  u.pathname = `${base || "/v1"}/models`;
  return u.toString();
}

/**
 * Model ids out of a `/models` payload.
 *
 * Each vendor names the list differently and none of them promise a shape, so
 * an unrecognised body is `unreadable` rather than an empty list - reporting
 * "this provider has no models" when the parse failed would be a lie the user
 * would act on.
 */
export function parseModels(api: ProbeApi, body: string): string[] | null {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }
  const pick = (rows: unknown, key: string): string[] | null => {
    if (!Array.isArray(rows)) return null;
    const out: string[] = [];
    for (const row of rows) {
      const v = (row as Record<string, unknown> | null)?.[key];
      if (typeof v === "string" && v.trim()) out.push(v.trim());
    }
    return out;
  };
  const obj = data as Record<string, unknown>;
  // openai + anthropic: { data: [{ id }] }. ollama: { models: [{ name }] }.
  const ids = api === "ollama" ? pick(obj.models, "name") : pick(obj.data, "id");
  if (ids === null) return null;
  return [...new Set(ids)].sort();
}

/**
 * Probe one provider. Never throws - every failure is a code the caller reports.
 */
export async function probeModels(input: {
  api: ProbeApi;
  chatUrl: string;
  /** The provider's `apiKey` secret ref; optional for a localhost proxy. */
  apiKeyRef?: unknown;
  requireKey: boolean;
  fetchImpl?: ProbeFetch;
}): Promise<ProbeResult> {
  const url = modelsUrlFor(input.api, input.chatUrl);
  if (!url) {
    return { ok: false, code: "unreachable", reason: `"${input.chatUrl}" is not a valid URL.` };
  }
  const key = input.apiKeyRef ? resolveSecret(input.apiKeyRef as never) : undefined;
  if (input.requireKey && !key) {
    return {
      ok: false,
      code: "no-key",
      reason: `needs its API key: set ${envVarName(input.apiKeyRef as never) ?? "the configured env var"}.`,
    };
  }
  const headers: Record<string, string> = { accept: "application/json" };
  if (key) {
    // Each vendor's own scheme - a bearer sent to Anthropic is simply ignored
    // and the probe would look like an auth failure it is not.
    if (input.api === "anthropic") {
      headers["x-api-key"] = key;
      headers["anthropic-version"] = "2023-06-01";
    } else {
      headers.authorization = `Bearer ${key}`;
    }
  }
  const doFetch = input.fetchImpl ?? (globalThis.fetch as unknown as ProbeFetch);
  let res: Awaited<ReturnType<ProbeFetch>>;
  try {
    res = await doFetch(url, { method: "GET", headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    return { ok: false, code: "unreachable", reason: redact(err, [key]) };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      ok: false,
      code: "http",
      // The body can echo the request back, key included.
      reason: `HTTP ${res.status}${body ? `: ${redact(body.slice(0, 300), [key])}` : ""}`,
    };
  }
  const models = parseModels(input.api, await res.text().catch(() => ""));
  if (models === null) {
    return {
      ok: false,
      code: "unreadable",
      reason: `${url} did not return a model list this version understands.`,
    };
  }
  return { ok: true, models };
}

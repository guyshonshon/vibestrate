// ── OpenTelemetry exporter (Phase 6) ────────────────────────────────────────
//
// Maps a finished run's persisted metrics into an OTLP/HTTP trace and POSTs it
// to a user-configured collector (Langfuse, Grafana Tempo, Jaeger, …). This is
// an exporter over data we ALREADY have — not new instrumentation. Off by
// default and local-first: nothing is sent until the user runs the export with
// an explicit endpoint. Dependency-free: we hand-build the OTLP JSON.

import { createHash } from "node:crypto";
import { MetricsStore } from "../core/metrics-store.js";
import { RunStateStore } from "../core/state-machine.js";
import { resolveSecret, redact } from "../notifications/gateways/secret-resolver.js";
import type { RuntimeMetrics } from "../core/runtime-metrics.js";

type OtlpValue =
  | { stringValue: string }
  | { intValue: string }
  | { doubleValue: number }
  | { boolValue: boolean };
type OtlpAttr = { key: string; value: OtlpValue };
type OtlpSpan = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OtlpAttr[];
  status: { code: number };
};
export type OtlpTrace = {
  resourceSpans: Array<{
    resource: { attributes: OtlpAttr[] };
    scopeSpans: Array<{ scope: { name: string; version?: string }; spans: OtlpSpan[] }>;
  }>;
};

const HEX = (s: string, len: number) => createHash("sha256").update(s).digest("hex").slice(0, len);
const traceIdFor = (runId: string) => HEX(`trace:${runId}`, 32);
const spanIdFor = (key: string) => HEX(`span:${key}`, 16);

function nanos(iso: string | null | undefined): string {
  const ms = iso ? Date.parse(iso) : NaN;
  return String((Number.isFinite(ms) ? ms : 0) * 1_000_000);
}

function attr(key: string, value: string | number | boolean | null | undefined): OtlpAttr | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return { key, value: { boolValue: value } };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { key, value: { intValue: String(value) } }
      : { key, value: { doubleValue: value } };
  }
  return { key, value: { stringValue: value } };
}
const attrs = (xs: (OtlpAttr | null)[]): OtlpAttr[] => xs.filter((x): x is OtlpAttr => x !== null);

/** Build an OTLP trace: a root run span + one child span per role turn. */
export function buildRunTraceOtlp(input: {
  metrics: RuntimeMetrics;
  status: string | null;
}): OtlpTrace {
  const m = input.metrics;
  const traceId = traceIdFor(m.runId);
  const rootSpanId = spanIdFor(`${m.runId}:root`);
  // 2 = ERROR, 1 = OK, 0 = UNSET.
  const statusCode =
    input.status === "merge_ready" ? 1 : input.status === "failed" || input.status === "blocked" || input.status === "aborted" ? 2 : 0;

  const root: OtlpSpan = {
    traceId,
    spanId: rootSpanId,
    name: m.task.slice(0, 120) || m.runId,
    kind: 1,
    startTimeUnixNano: nanos(m.startedAt),
    endTimeUnixNano: nanos(m.updatedAt),
    attributes: attrs([
      attr("vibestrate.run_id", m.runId),
      attr("vibestrate.status", input.status ?? m.finalStatus ?? null),
      attr("vibestrate.provider_calls", m.totalProviderCalls),
      attr("vibestrate.cost_usd", m.totalCostUsd),
      attr("vibestrate.duration_ms", m.totalDurationMs),
      attr("vibestrate.review_loops", m.reviewLoopCount),
    ]),
    status: { code: statusCode },
  };

  const childSpans: OtlpSpan[] = m.roles.map((r, i) => ({
    traceId,
    spanId: spanIdFor(`${m.runId}:${r.stageId}:${r.roleId}:${i}`),
    parentSpanId: rootSpanId,
    name: `${r.stageId}:${r.roleId}`,
    kind: 3, // CLIENT — an outbound model call
    startTimeUnixNano: nanos(r.startedAt),
    endTimeUnixNano: nanos(r.endedAt),
    attributes: attrs([
      attr("vibestrate.role", r.roleId),
      attr("vibestrate.stage", r.stageId),
      attr("vibestrate.provider", r.providerId),
      attr("vibestrate.provider_type", r.providerType),
      attr("vibestrate.seat", r.flowSeat),
      attr("vibestrate.model", r.model),
      attr("vibestrate.exit_code", r.exitCode),
      attr("vibestrate.cost_usd", r.totalCostUsd),
      attr("vibestrate.duration_ms", r.durationMs),
      attr("gen_ai.usage.input_tokens", r.tokenUsage?.input ?? null),
      attr("gen_ai.usage.output_tokens", r.tokenUsage?.output ?? null),
      attr("gen_ai.request.model", r.model),
    ]),
    status: { code: r.exitCode === 0 ? 1 : 2 },
  }));

  return {
    resourceSpans: [
      {
        resource: {
          attributes: attrs([attr("service.name", "vibestrate"), attr("vibestrate.task", m.task.slice(0, 200))]),
        },
        scopeSpans: [{ scope: { name: "vibestrate", version: "1" }, spans: [root, ...childSpans] }],
      },
    ],
  };
}

export type OtlpFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export type ExportResult =
  | { ok: true; status: number; spanCount: number }
  | { ok: false; reason: string };

/**
 * Export one finished run's metrics to an OTLP/HTTP collector. The endpoint is
 * explicit (no default, no SSRF block — it's the user's own collector, like a
 * configured cloud provider). An optional `authToken` env-ref → Bearer auth,
 * never logged.
 */
export async function exportRunToOtlp(input: {
  projectRoot: string;
  runId: string;
  endpoint: string;
  /** env-ref (e.g. env:LANGFUSE_TOKEN) → Authorization: Bearer. */
  authToken?: string;
  fetchImpl?: OtlpFetch;
}): Promise<ExportResult> {
  let base: URL;
  try {
    base = new URL(input.endpoint);
  } catch {
    return { ok: false, reason: `Invalid endpoint: ${input.endpoint}` };
  }
  if (base.protocol !== "https:" && base.protocol !== "http:") {
    return { ok: false, reason: "Endpoint must be http(s)." };
  }

  const metrics = await new MetricsStore(input.projectRoot, input.runId).read();
  if (!metrics) return { ok: false, reason: `No metrics found for run ${input.runId}.` };
  const state = await new RunStateStore(input.projectRoot, input.runId).read().catch(() => null);
  const trace = buildRunTraceOtlp({ metrics, status: state?.status ?? metrics.finalStatus ?? null });

  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = resolveSecret(input.authToken);
  if (input.authToken && !token) {
    return { ok: false, reason: `Auth env var for "${input.authToken}" is not set.` };
  }
  if (token) headers["authorization"] = `Bearer ${token}`;

  // OTLP/HTTP traces path.
  const url = `${input.endpoint.replace(/\/+$/, "")}/v1/traces`;
  const doFetch = input.fetchImpl ?? (globalThis.fetch as unknown as OtlpFetch);
  try {
    const res = await doFetch(url, { method: "POST", headers, body: JSON.stringify(trace) });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, reason: `Collector returned ${res.status}: ${redact(body, [token]).slice(0, 300)}` };
    }
    const spanCount = trace.resourceSpans[0]!.scopeSpans[0]!.spans.length;
    return { ok: true, status: res.status, spanCount };
  } catch (err) {
    return { ok: false, reason: `Export failed: ${redact(err, [token])}` };
  }
}

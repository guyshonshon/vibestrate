import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  buildRunTraceOtlp,
  exportRunToOtlp,
  type OtlpFetch,
} from "../src/telemetry/otel-exporter.js";
import { MetricsStore } from "../src/core/metrics-store.js";
import { makeEmptyMetrics, type RuntimeMetrics } from "../src/core/runtime-metrics.js";

function metricsFixture(): RuntimeMetrics {
  const base = makeEmptyMetrics({
    runId: "run-abc",
    task: "Add a thing",
    startedAt: "2026-01-01T00:00:00.000Z",
  });
  return {
    ...base,
    updatedAt: "2026-01-01T00:05:00.000Z",
    finalStatus: "merge_ready",
    totalCostUsd: 0.42,
    totalDurationMs: 300000,
    totalProviderCalls: 2,
    roles: [
      {
        roleId: "planner",
        stageId: "planning",
        providerId: "claude",
        providerType: "claude-code",
        command: "claude",
        args: [],
        cwd: "/wt",
        startedAt: "2026-01-01T00:00:00.000Z",
        endedAt: "2026-01-01T00:01:00.000Z",
        durationMs: 60000,
        exitCode: 0,
        sessionId: null,
        flowSeat: "planner",
        flowContextMode: null,
        flowContextFallbackReason: null,
        model: "claude-sonnet-4-5",
        totalCostUsd: 0.2,
        perModelCost: [],
        tokenUsage: { input: 100, output: 50 },
      },
      {
        roleId: "executor",
        stageId: "executing",
        providerId: "claude",
        providerType: "claude-code",
        command: "claude",
        args: [],
        cwd: "/wt",
        startedAt: "2026-01-01T00:01:00.000Z",
        endedAt: "2026-01-01T00:03:00.000Z",
        durationMs: 120000,
        exitCode: 0,
        sessionId: null,
        flowSeat: "implementer",
        flowContextMode: null,
        flowContextFallbackReason: null,
        model: "claude-sonnet-4-5",
        totalCostUsd: 0.22,
        perModelCost: [],
        tokenUsage: { input: 300, output: 120 },
      },
    ],
  } as RuntimeMetrics;
}

describe("buildRunTraceOtlp", () => {
  it("builds a root run span + one child span per role with usage attributes", () => {
    const trace = buildRunTraceOtlp({ metrics: metricsFixture(), status: "merge_ready" });
    const spans = trace.resourceSpans[0]!.scopeSpans[0]!.spans;
    expect(spans).toHaveLength(3); // root + 2 roles
    const [root, planner, executor] = spans;
    // Deterministic, valid OTLP ids.
    expect(root!.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(root!.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(root!.parentSpanId).toBeUndefined();
    expect(root!.status.code).toBe(1); // merge_ready → OK
    // Children parent to the root, in the same trace.
    expect(planner!.parentSpanId).toBe(root!.spanId);
    expect(planner!.traceId).toBe(root!.traceId);
    expect(planner!.name).toBe("planning:planner");
    // Times are nanos.
    expect(root!.startTimeUnixNano).toBe(String(Date.parse("2026-01-01T00:00:00.000Z") * 1_000_000));
    // gen_ai token usage attributes are present.
    const tok = (sp: typeof executor) =>
      sp!.attributes.find((a) => a.key === "gen_ai.usage.output_tokens");
    expect(tok(executor)).toBeTruthy();
    const cost = root!.attributes.find((a) => a.key === "vibestrate.cost_usd");
    expect(cost?.value).toEqual({ doubleValue: 0.42 });
  });

  it("is deterministic for the same run (stable trace id)", () => {
    const a = buildRunTraceOtlp({ metrics: metricsFixture(), status: "merge_ready" });
    const b = buildRunTraceOtlp({ metrics: metricsFixture(), status: "merge_ready" });
    expect(a.resourceSpans[0]!.scopeSpans[0]!.spans[0]!.traceId).toBe(
      b.resourceSpans[0]!.scopeSpans[0]!.spans[0]!.traceId,
    );
  });
});

describe("exportRunToOtlp", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-otel-"));
    await new MetricsStore(dir, "run-abc").write(metricsFixture());
  });
  afterEach(() => {
    delete process.env.LF_TOKEN;
  });

  it("POSTs the trace to /v1/traces with bearer auth from an env-ref", async () => {
    process.env.LF_TOKEN = "secret-token-123";
    const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
    const fetchImpl: OtlpFetch = async (url, init) => {
      calls.push({ url, headers: init.headers, body: init.body });
      return { ok: true, status: 200, text: async () => "" };
    };
    const r = await exportRunToOtlp({
      projectRoot: dir,
      runId: "run-abc",
      endpoint: "http://localhost:4318",
      authToken: "env:LF_TOKEN",
      fetchImpl,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.spanCount).toBe(3);
    expect(calls[0]!.url).toBe("http://localhost:4318/v1/traces");
    expect(calls[0]!.headers["authorization"]).toBe("Bearer secret-token-123");
    expect(JSON.parse(calls[0]!.body).resourceSpans).toBeTruthy();
  });

  it("errors on a missing auth env, missing metrics, and a bad endpoint", async () => {
    const noFetch: OtlpFetch = async () => ({ ok: true, status: 200, text: async () => "" });
    const noEnv = await exportRunToOtlp({
      projectRoot: dir,
      runId: "run-abc",
      endpoint: "http://localhost:4318",
      authToken: "env:LF_TOKEN",
      fetchImpl: noFetch,
    });
    expect(noEnv.ok).toBe(false);

    const noMetrics = await exportRunToOtlp({
      projectRoot: dir,
      runId: "ghost-run",
      endpoint: "http://localhost:4318",
      fetchImpl: noFetch,
    });
    expect(noMetrics.ok).toBe(false);

    const badUrl = await exportRunToOtlp({
      projectRoot: dir,
      runId: "run-abc",
      endpoint: "ftp://nope",
      fetchImpl: noFetch,
    });
    expect(badUrl.ok).toBe(false);
  });

  it("redacts the token from a collector error", async () => {
    process.env.LF_TOKEN = "secret-token-abcdef";
    const fetchImpl: OtlpFetch = async () => ({
      ok: false,
      status: 401,
      text: async () => "rejected token secret-token-abcdef",
    });
    const r = await exportRunToOtlp({
      projectRoot: dir,
      runId: "run-abc",
      endpoint: "http://localhost:4318",
      authToken: "env:LF_TOKEN",
      fetchImpl,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("[redacted]");
      expect(r.reason).not.toContain("secret-token-abcdef");
    }
  });
});

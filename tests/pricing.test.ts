import { describe, it, expect } from "vitest";
import {
  costFromTokens,
  estimateTokensFromText,
  priceForModel,
  resolveCost,
} from "../src/core/pricing.js";

describe("pricing table", () => {
  it("matches model ids by prefix (incl. version suffixes)", () => {
    expect(priceForModel("claude-opus-4-7[1m]")?.outputPer1M).toBe(75);
    expect(priceForModel("claude-haiku-4-5-20251001")?.inputPer1M).toBe(1);
    expect(priceForModel("gpt-4o-mini-2024")?.inputPer1M).toBe(0.15);
    expect(priceForModel("gpt-4o-2024")?.inputPer1M).toBe(2.5);
    expect(priceForModel("totally-unknown-model")).toBeNull();
    expect(priceForModel(null)).toBeNull();
  });

  it("estimates tokens at ~4 chars/token", () => {
    expect(estimateTokensFromText("")).toBe(0);
    expect(estimateTokensFromText("12345678")).toBe(2);
    expect(estimateTokensFromText("a")).toBe(1);
  });

  it("computes cost from tokens × list price", () => {
    // opus: $15/1M in, $75/1M out → 1M in + 1M out = $90.
    const cost = costFromTokens("claude-opus-4-7", {
      input: 1_000_000,
      output: 1_000_000,
    });
    expect(cost).toBeCloseTo(90, 5);
  });

  it("returns null cost for unknown model or no tokens", () => {
    expect(costFromTokens("unknown", { input: 100 })).toBeNull();
    expect(costFromTokens("claude-opus-4", { input: 0, output: 0 })).toBeNull();
    expect(costFromTokens("claude-opus-4", null)).toBeNull();
  });
});

describe("resolveCost precedence", () => {
  it("prefers a CLI-reported cost (not an estimate)", () => {
    const r = resolveCost({
      reportedCostUsd: 0.07,
      model: "claude-opus-4-7",
      tokenUsage: { input: 1000, output: 1000 },
    });
    expect(r).toEqual({ costUsd: 0.07, estimated: false });
  });

  it("falls back to tokens × price, flagged estimated", () => {
    const r = resolveCost({
      reportedCostUsd: null,
      model: "gpt-4o",
      tokenUsage: { input: 1_000_000, output: 0 },
    });
    expect(r.costUsd).toBeCloseTo(2.5, 5);
    expect(r.estimated).toBe(true);
  });

  it("is null (never fabricated) when the model is unknown", () => {
    const r = resolveCost({
      reportedCostUsd: null,
      model: null,
      tokenUsage: { input: 1000, output: 1000 },
    });
    expect(r).toEqual({ costUsd: null, estimated: false });
  });
});

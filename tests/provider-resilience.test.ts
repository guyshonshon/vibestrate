import { describe, expect, it } from "vitest";
import {
  classifyProviderFailure,
  computeBackoffMs,
  parseRetryAfterMs,
} from "../src/core/provider-resilience.js";
import { resilienceConfigSchema } from "../src/project/config-schema.js";

const cfg = resilienceConfigSchema.parse({});

describe("classifyProviderFailure", () => {
  it("classifies rate limits", () => {
    expect(classifyProviderFailure("Error: 429 Too Many Requests", cfg)).toBe("rate-limit");
    expect(classifyProviderFailure("rate limit exceeded, slow down", cfg)).toBe("rate-limit");
    expect(classifyProviderFailure("monthly quota reached", cfg)).toBe("rate-limit");
  });

  it("classifies transient blips", () => {
    expect(classifyProviderFailure("HTTP 503 Service Unavailable", cfg)).toBe("transient");
    expect(classifyProviderFailure("server temporarily unavailable", cfg)).toBe("transient");
    expect(classifyProviderFailure("Overloaded", cfg)).toBe("transient");
    expect(classifyProviderFailure("read ECONNRESET", cfg)).toBe("transient");
    expect(classifyProviderFailure("request timed out", cfg)).toBe("transient");
  });

  it("treats unrecognized failures as hard (fail-closed)", () => {
    expect(classifyProviderFailure("error: unknown flag --nope", cfg)).toBe("hard");
    expect(classifyProviderFailure("authentication failed: invalid api key", cfg)).toBe("hard");
    expect(classifyProviderFailure("", cfg)).toBe("hard");
  });

  it("honors user-added patterns", () => {
    const custom = resilienceConfigSchema.parse({
      transient: { maxRetries: 4, baseDelayMs: 1000, maxDelayMs: 60000, patterns: ["model is warming up"] },
    });
    expect(classifyProviderFailure("the model is warming up, try again", custom)).toBe("transient");
    // ...still hard under the default config.
    expect(classifyProviderFailure("the model is warming up, try again", cfg)).toBe("hard");
  });

  it("prefers rate-limit over transient when both could match", () => {
    expect(classifyProviderFailure("429 overloaded", cfg)).toBe("rate-limit");
  });
});

describe("parseRetryAfterMs", () => {
  it("parses common Retry-After phrasings", () => {
    expect(parseRetryAfterMs("Retry-After: 30")).toBe(30000);
    expect(parseRetryAfterMs("please retry after 5s")).toBe(5000);
    expect(parseRetryAfterMs("retry in 12 seconds")).toBe(12000);
  });
  it("returns null when there's no hint", () => {
    expect(parseRetryAfterMs("rate limit exceeded")).toBeNull();
    expect(parseRetryAfterMs("")).toBeNull();
  });
});

describe("computeBackoffMs", () => {
  const spec = { maxRetries: 5, baseDelayMs: 1000, maxDelayMs: 30000, respectRetryAfter: true };
  const noJitter = () => 0.5; // jitter factor 1.0

  it("is exponential and capped, with jitter", () => {
    expect(computeBackoffMs("transient", 1, spec, "", noJitter)).toBe(1000);
    expect(computeBackoffMs("transient", 2, spec, "", noJitter)).toBe(2000);
    expect(computeBackoffMs("transient", 3, spec, "", noJitter)).toBe(4000);
    // Capped at maxDelayMs.
    expect(computeBackoffMs("transient", 10, spec, "", noJitter)).toBe(30000);
  });

  it("honors a Retry-After hint for rate limits (capped)", () => {
    expect(computeBackoffMs("rate-limit", 1, spec, "Retry-After: 7", noJitter)).toBe(7000);
    // Above the cap -> capped.
    expect(computeBackoffMs("rate-limit", 1, spec, "retry after 999s", noJitter)).toBe(30000);
    // No hint -> exponential.
    expect(computeBackoffMs("rate-limit", 1, spec, "rate limited", noJitter)).toBe(1000);
  });

  it("keeps jitter within +/-20%", () => {
    const lo = computeBackoffMs("transient", 1, spec, "", () => 0); // -20%
    const hi = computeBackoffMs("transient", 1, spec, "", () => 1); // +20%
    expect(lo).toBe(800);
    expect(hi).toBe(1200);
  });
});

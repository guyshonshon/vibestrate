// ── Provider resilience: failure classification + backoff (U2) ──────────────
//
// Recoverable provider failures are auto-retried (see the orchestrator's
// runProviderResilient). This module is the pure, testable core: classify a
// failure's text into a class, and compute the backoff before a retry. The
// orchestrator owns the loop, the sleeping, and the events.
//
// Design: docs/design/unattended-resilience.md.

import type { ResilienceConfig } from "../project/config-schema.js";

export type ProviderFailureClass = "rate-limit" | "transient" | "hard";

// Built-in detection. CLI providers phrase errors differently, so these are a
// floor; users add more via resilience.<class>.patterns. Order: rate-limit wins
// over transient when both could match (a 429 is a rate limit, not a 5xx).
const BUILTIN_RATE_LIMIT = [
  /\b429\b/,
  /rate[\s_-]?limit/i,
  /too many requests/i,
  /\bquota\b/i,
  /usage limit/i,
];
const BUILTIN_TRANSIENT = [
  /\b5\d\d\b/, // any 5xx (500/502/503/504/529...)
  /server (?:is )?(?:temporarily )?unavailable/i,
  /temporarily unavailable/i,
  /service unavailable/i,
  /\boverloaded\b/i,
  /internal server error/i,
  /bad gateway/i,
  /gateway timeout/i,
  /connection reset/i,
  /econnreset/i,
  /etimedout/i,
  /timed?\s?out/i,
  /network error/i,
  /fetch failed/i,
  /socket hang ?up/i,
];

function compile(patterns: readonly string[]): RegExp[] {
  const out: RegExp[] = [];
  for (const p of patterns) {
    try {
      out.push(new RegExp(p, "i"));
    } catch {
      // A bad user regex is ignored rather than crashing a run.
    }
  }
  return out;
}

function anyMatch(text: string, res: readonly RegExp[]): boolean {
  return res.some((re) => re.test(text));
}

/**
 * Classify an already-known provider FAILURE (a non-zero exit's stderr/stdout,
 * or a thrown error's message). Never returns "ok" - the caller decides success
 * (exit 0). Defaults to "hard" (fail-closed: we don't retry what we don't
 * recognise, to avoid burning budget on a real error).
 */
export function classifyProviderFailure(
  text: string,
  cfg: ResilienceConfig,
): ProviderFailureClass {
  const rate = [...BUILTIN_RATE_LIMIT, ...compile(cfg.rateLimit.patterns)];
  const transient = [...BUILTIN_TRANSIENT, ...compile(cfg.transient.patterns)];
  if (anyMatch(text, rate)) return "rate-limit";
  if (anyMatch(text, transient)) return "transient";
  return "hard";
}

/** Parse a Retry-After hint (seconds) from text, in ms. null if none found. */
export function parseRetryAfterMs(text: string): number | null {
  // "Retry-After: 30", "retry after 30s", "retry in 30 seconds"
  const m = text.match(/retry[\s_-]?(?:after|in)?[:\s]+(\d{1,5})\s*(?:s|sec|seconds)?\b/i);
  if (!m) return null;
  const secs = Number(m[1]);
  if (!Number.isFinite(secs) || secs < 0) return null;
  return secs * 1000;
}

export type RetryClassSpec = {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  respectRetryAfter?: boolean;
};

/**
 * Backoff before the next attempt. Rate-limit honors a parsed Retry-After hint
 * (capped) when configured; otherwise exponential with +/-20% jitter, capped.
 * `attempt` is the just-failed attempt number (1-based).
 */
export function computeBackoffMs(
  cls: ProviderFailureClass,
  attempt: number,
  spec: RetryClassSpec,
  failureText: string,
  rng: () => number = Math.random,
): number {
  if (cls === "rate-limit" && spec.respectRetryAfter) {
    const ra = parseRetryAfterMs(failureText);
    if (ra != null) return Math.min(spec.maxDelayMs, Math.max(0, ra));
  }
  const exp = spec.baseDelayMs * 2 ** Math.max(0, attempt - 1);
  const jitter = 1 + (rng() - 0.5) * 0.4; // +/-20%
  return Math.min(spec.maxDelayMs, Math.max(0, Math.round(exp * jitter)));
}

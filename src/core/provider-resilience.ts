// ── Provider resilience: failure classification + backoff ───────────────────
//
// Recoverable provider failures are auto-retried (see the orchestrator's
// runProviderResilient). This module is the pure, testable core: classify a
// failure's text into a class, and compute the backoff before a retry. The
// orchestrator owns the loop, the sleeping, and the events.
//
// Design: docs/design/unattended-resilience.md.

import type { ResilienceConfig } from "../project/config-schema.js";
import type { ProviderSessionRequest } from "../providers/provider-types.js";
import { redactSecretsInText } from "./diff-service.js";

export type ProviderFailureClass =
  | "usage-limit"
  | "rate-limit"
  | "transient"
  | "hard";

// Built-in detection. CLI providers phrase errors differently, so these are a
// floor; users add more via resilience.<class>.patterns. Order: usage-limit
// (a quota that resets in hours) wins over rate-limit (a per-minute throttle),
// which wins over transient (a 5xx blip).
const BUILTIN_USAGE_LIMIT = [
  /usage limit/i,
  /\bquota\b/i,
  /plan limit/i,
  /(monthly|daily|weekly)\s+(usage|limit|cap)/i,
  /limit will reset/i,
  /upgrade (your|to)\b/i,
  // Claude Code's usage-window prompt ("This model is being rate limited,
  // Would you like to switch over?"). Despite the words "rate limited" it is a
  // windowed quota, not a per-minute throttle - seconds-scale retries are
  // useless, so it must classify as usage-limit (checked before rate-limit).
  /rate limited[\s\S]{0,80}switch (?:over|model)/i,
];
const BUILTIN_RATE_LIMIT = [
  /\b429\b/,
  /rate[\s_-]?limit/i,
  /too many requests/i,
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
  const usage = [...BUILTIN_USAGE_LIMIT, ...compile(cfg.usageLimit.patterns)];
  const rate = [...BUILTIN_RATE_LIMIT, ...compile(cfg.rateLimit.patterns)];
  const transient = [...BUILTIN_TRANSIENT, ...compile(cfg.transient.patterns)];
  if (anyMatch(text, usage)) return "usage-limit";
  if (anyMatch(text, rate)) return "rate-limit";
  if (anyMatch(text, transient)) return "transient";
  return "hard";
}

/**
 * Pick the session request for a provider (re)invocation inside the resilience
 * retry loop. A retried `open` MUST NOT re-send a session id a
 * prior attempt already issued: claude registers `--session-id <U>` on first use
 * and errors "Session ID <U> is already in use." on a second open. An "opened"
 * turn re-sends full context, so a fresh id is semantically identical and never
 * collides - and never depends on whether the failed attempt actually
 * registered <U> (re-mint is strictly safer than converting to `--resume`, which
 * would error "no conversation" if <U> was never created). `resume` is
 * replayable as-is; non-session turns are unchanged.
 *
 * `openAlreadyIssued` must be tracked across the WHOLE loop, NOT keyed off the
 * retry-budget counter: that counter resets to 0 on a human-approved fresh round
 * (`runProviderResilient`'s onExhausted=pause path), yet the id was still opened
 * on the very first attempt - so a counter-based check would re-send it and
 * collide again on the post-approval retry.
 */
export function sessionRequestForRetry(
  session: ProviderSessionRequest | undefined,
  openAlreadyIssued: boolean,
  freshId: () => string,
): ProviderSessionRequest | undefined {
  if (!session) return undefined;
  if (session.action !== "open") return session;
  if (!openAlreadyIssued) return session;
  return { action: "open", sessionId: freshId() };
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

// Generic credential shapes on top of the high-precision vendor patterns in
// redactSecretsInText: a provider's stderr is a prime place for auth errors
// that echo the offending header/env var, and the excerpt lands in durable,
// UI-surfaced artifacts (events.ndjson, assurance.json).
const GENERIC_CREDENTIAL_RE =
  /\b(bearer|token|key|secret|password|passwd|credential|authorization|api[-_]?key)\b([=:\s]+)(?:bearer\s+)?\S+/gi;

/**
 * A short, redacted excerpt of a provider failure's stderr/stdout - the line a
 * human needs to see ("This model is being rate limited...") instead of
 * "provider exited 1". First non-empty line(s), whitespace collapsed, vendor
 * token shapes + generic credential assignments redacted, capped at `maxLen`.
 */
export function failureExcerpt(text: string, maxLen = 240): string {
  const firstLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, 3)
    .join(" ")
    .replace(/\s+/g, " ");
  const scrubbed = redactSecretsInText(firstLines).redacted.replace(
    GENERIC_CREDENTIAL_RE,
    (_m, kw: string, sep: string) => `${kw}${sep}[REDACTED]`,
  );
  return scrubbed.length > maxLen ? `${scrubbed.slice(0, maxLen - 1)}…` : scrubbed;
}

export type AutoFallbackScope = "off" | "crew" | "any";

/**
 * Derive a fallback Profile when none is configured (resilience.autoFallback).
 * Deterministic and trust-scoped: `crew` only considers profiles already
 * seated in THIS run's flow (no provider that wasn't part of the run's trust
 * set ever sees its context); `any` extends to every configured profile, in
 * declaration order. A candidate must live on a DIFFERENT provider than the
 * failing one (same-provider profiles share the limit) and that provider must
 * be configured. Returns null when nothing qualifies.
 */
export function deriveAutoFallbackProfile(input: {
  failingProviderId: string;
  /** Profile ids seated in this run's flow, in flow order. */
  seatedProfileIds: readonly string[];
  profiles: Readonly<Record<string, { provider: string }>>;
  configuredProviderIds: ReadonlySet<string>;
  scope: AutoFallbackScope;
}): string | null {
  if (input.scope === "off") return null;
  const qualifies = (id: string): boolean => {
    const profile = input.profiles[id];
    return (
      !!profile &&
      profile.provider !== input.failingProviderId &&
      input.configuredProviderIds.has(profile.provider)
    );
  };
  const seated = [...new Set(input.seatedProfileIds)];
  const inCrew = seated.find(qualifies);
  if (inCrew) return inCrew;
  if (input.scope !== "any") return null;
  return Object.keys(input.profiles).find(qualifies) ?? null;
}

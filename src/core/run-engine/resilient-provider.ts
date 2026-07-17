import { randomUUID } from "node:crypto";
import {
  runProvider,
  type RichProviderRunResult,
} from "../../providers/provider-runner.js";
import {
  classifyProviderFailure,
  computeBackoffMs,
  deriveAutoFallbackProfile,
  failureExcerpt,
  parseRetryAfterMs,
  sessionRequestForRetry,
  type ProviderFailureClass,
} from "../provider-resilience.js";
import { capabilitiesForProvider } from "../../providers/provider-catalog.js";
import type { ResolvedCatalog } from "../../providers/provider-apply.js";
import type { EventLog } from "../stores/event-log.js";
import type { RunStateStore } from "../state-machine.js";
import type { ProjectConfig } from "../../project/config-schema.js";
import { describeError } from "../../utils/errors.js";
import { pauseForApproval, type ApprovalGateDeps } from "./approval-gate.js";
import { __RunAbortedSignal } from "./signals.js";

/** The orchestrator state the resilience loop reads. `config` is the live
 *  config object (never replaced mid-run); `approvalGateDeps` is a closure so
 *  the onExhausted pause reads live orchestrator state (notify). */
export interface ResilientProviderDeps {
  config: Pick<ProjectConfig, "resilience" | "providers" | "profiles">;
  unattended: boolean;
  approvalGateDeps: () => ApprovalGateDeps;
}

type ResilienceCtx = {
  eventLog: EventLog;
  runId: string;
  stateStore: RunStateStore;
};

/**
 * Provider resilience (unattended-resilience). Wraps a single provider
 * invocation: a recoverable failure - rate limit (429/quota) or transient blip
 * (5xx, "server temporarily unavailable", overloaded, timeout) - is retried
 * with backoff (rate-limit honors a parsed Retry-After) before the turn's
 * outcome is final, so an overnight run rides it out. Hard failures and
 * exhausted retries surface the original outcome to runRole's existing handling
 * (a non-zero result flows to assessTurnResult; a thrown error rethrows). The
 * backoff sleep is interruptible - an abort during a wait stops immediately.
 * Failed rate-limit/transient attempts typically incur no token cost, so the
 * single role-metric for the final attempt is honest enough.
 */
export async function runProviderResilient(
  deps: ResilientProviderDeps,
  input: {
    args: Parameters<typeof runProvider>[1];
    ctx: ResilienceCtx;
    stageId: string;
    abortSignal: AbortSignal;
  },
): Promise<RichProviderRunResult> {
  const r = deps.config.resilience;
  const providers = deps.config.providers;
  if (!r || !r.enabled) return runProvider(providers, input.args);

  let usageWaits = 0; // reset-waits used for a usage-limit, separate budget.
  // A retried `open` session must not re-send an id a prior
  // attempt already opened (claude: "Session ID <U> is already in use."). Track
  // whether an open was ever issued across the WHOLE loop - NOT keyed off
  // `attempt`, which resets to 0 on the onExhausted=pause human-approval round
  // (below), yet the id was opened on the first attempt. Re-mint a fresh open
  // id thereafter; an "opened" turn re-sends full context, so a fresh id is
  // identical in effect. (The resilience FALLBACK path drops the session
  // entirely; the graph/fan-out retry path carries no session - this loop is
  // the only place a fixed open id is replayed.)
  let openIssued = false;
  for (let attempt = 1; ; attempt += 1) {
    const session = sessionRequestForRetry(input.args.session, openIssued, randomUUID);
    const args =
      session === input.args.session ? input.args : { ...input.args, session };
    if (args.session?.action === "open") openIssued = true;
    let result: RichProviderRunResult | null = null;
    let lastError: unknown = null;
    let failureText: string;
    try {
      result = await runProvider(providers, args);
      if (result.exitCode === 0) return result; // success
      failureText = `${result.stderr ?? ""}\n${result.stdout ?? ""}`;
    } catch (err) {
      if (err instanceof __RunAbortedSignal || input.abortSignal.aborted) {
        throw err;
      }
      lastError = err;
      failureText = err instanceof Error ? err.message : String(err);
    }
    const cls = classifyProviderFailure(failureText, r);
    // Give up WITH the diagnosis: the classified class + a short redacted
    // excerpt ride on the result (or the thrown error), so the step record
    // and Run Assurance can say "rate-limit: This model is being rate
    // limited..." instead of laundering it into "provider exited 1".
    const excerpt = failureExcerpt(failureText);
    const giveUp = (): RichProviderRunResult => {
      if (result) return { ...result, failure: { class: cls, excerpt } };
      const err = lastError ?? new Error(failureText);
      if (err instanceof Error) {
        (err as Error & { failureClass?: ProviderFailureClass }).failureClass = cls;
      }
      throw err;
    };
    if (cls === "hard") return giveUp();

    // Usage limit / quota: a windowed quota that resets (often hours out),
    // handled separately from the seconds-scale rate-limit/transient backoff.
    if (cls === "usage-limit") {
      const ul = r.usageLimit;
      if (ul.action === "wait" && usageWaits < ul.maxWaits) {
        usageWaits += 1;
        const hint = parseRetryAfterMs(failureText);
        const waitMs = Math.min(ul.maxWaitMin * 60_000, hint ?? 5 * 60_000);
        await input.ctx.eventLog.append({
          type: "provider.usage_limit",
          message: `Usage limit at ${input.stageId}; waiting ${Math.round(waitMs / 60000)}m for reset (wait ${usageWaits}/${ul.maxWaits}).`,
          data: { stepId: input.stageId, action: "wait", waitMs, wait: usageWaits, maxWaits: ul.maxWaits },
        });
        await interruptibleSleep(waitMs, input.abortSignal);
        continue; // retry the same provider after the reset window
      }
      // Give-up point (action=stop, action=fallback, or waits exhausted):
      // try to reseat the turn before failing. The EXPLICIT fallbackProfile
      // only applies when the user opted into fallback semantics; the
      // auto-derived one (resilience.autoFallback, trust-scoped) applies at
      // every give-up - "stop" means "don't wait hours", not "don't use a
      // provider the run already trusts".
      const explicitFb =
        ul.action === "fallback" || (ul.action === "wait" && usageWaits >= ul.maxWaits)
          ? (ul.fallbackProfile ?? r.rateLimit.fallbackProfile)
          : null;
      if (explicitFb || r.autoFallback !== "off") {
        const fb = await tryProviderFallback(deps, {
          baseArgs: input.args,
          fallbackProfile: explicitFb,
          cls,
          ctx: input.ctx,
          stageId: input.stageId,
          abortSignal: input.abortSignal,
        });
        if (fb) return fb;
      }
      await input.ctx.eventLog.append({
        type: "provider.usage_limit",
        message: `Usage limit at ${input.stageId}; giving up (action=${ul.action}): ${excerpt}`,
        data: { stepId: input.stageId, action: ul.action, resolved: "give-up", detail: excerpt },
      });
      return giveUp();
    }

    const spec = cls === "rate-limit" ? r.rateLimit : r.transient;
    if (attempt > spec.maxRetries) {
      // Retries exhausted: try an alternate Profile once (explicitly
      // configured, else auto-derived per resilience.autoFallback - a model
      // that may not be limited/down), then give up with the original outcome.
      if (spec.fallbackProfile || r.autoFallback !== "off") {
        const fb = await tryProviderFallback(deps, {
          baseArgs: input.args,
          fallbackProfile: spec.fallbackProfile,
          cls,
          ctx: input.ctx,
          stageId: input.stageId,
          abortSignal: input.abortSignal,
        });
        if (fb) return fb;
      }
      // onExhausted: pause (attended) - wait for a human to approve a fresh
      // round of retries, or reject (give up). --unattended forces fail.
      if (r.onExhausted === "pause" && !deps.unattended) {
        const approved = await pauseForApproval(deps.approvalGateDeps(), {
          ctx: input.ctx,
          stageId: input.stageId,
          reason: `Provider ${cls} unrecovered at ${input.stageId} after ${spec.maxRetries} retries`,
          requestedAction: "provider.exhausted",
          requestedMessage: `Provider ${cls} hasn't recovered at ${input.stageId} after ${spec.maxRetries} retries. Approve to retry again, or reject to fail.`,
          resumedMessage: `Retrying ${input.stageId} after approval.`,
        });
        if (approved) {
          attempt = 0; // fresh retry budget after the human waited/fixed it
          continue;
        }
      }
      // The terminal moment used to be silent - the single worst gap when a
      // run died overnight. Now it's on the record (and in the supervisor's
      // engagement feed) before the failure surfaces to the step.
      await input.ctx.eventLog.append({
        type: "provider.retries_exhausted",
        message: `Provider ${cls} at ${input.stageId} unrecovered after ${spec.maxRetries} retries; giving up: ${excerpt}`,
        data: { stepId: input.stageId, class: cls, retries: spec.maxRetries, detail: excerpt },
      });
      return giveUp();
    }

    const delayMs = computeBackoffMs(cls, attempt, spec, failureText);
    await input.ctx.eventLog.append({
      type: "flow.step.retried",
      message: `Provider ${cls} at ${input.stageId} (attempt ${attempt}/${spec.maxRetries + 1}); retrying in ${Math.round(delayMs / 1000)}s.`,
      data: {
        stepId: input.stageId,
        attempt,
        maxAttempts: spec.maxRetries + 1,
        class: cls,
        delayMs,
      },
    });
    await interruptibleSleep(delayMs, input.abortSignal);
  }
}

/**
 * Resilience fallback: after retries for a recoverable class are
 * exhausted, run the turn once on an alternate Profile (a different model that
 * may not be limited/down). The profile is the explicitly configured
 * fallbackProfile when set; otherwise one is auto-derived per
 * resilience.autoFallback - trust-scoped to profiles already seated in this
 * run's flow by default ("crew"), so no provider outside the run's trust set
 * ever sees its context. Returns the result only on a clean success;
 * otherwise null (the caller gives up with the original outcome). The fallback
 * is a DIFFERENT provider, so any session is dropped and it is not itself
 * retried. Every outcome - swap, no-candidate, failed attempt - is recorded
 * as a `provider.fallback` event so the seat change is never silent. The
 * turn's resolved allowWrite/permissions ride along unchanged from baseArgs
 * (write capability is per-turn, never per-profile).
 */
export async function tryProviderFallback(
  deps: ResilientProviderDeps,
  input: {
    baseArgs: Parameters<typeof runProvider>[1];
    fallbackProfile: string | null;
    cls: string;
    ctx: ResilienceCtx;
    stageId: string;
    abortSignal: AbortSignal;
  },
): Promise<RichProviderRunResult | null> {
  let fbId = input.fallbackProfile;
  let auto = false;
  const scope = deps.config.resilience?.autoFallback ?? "crew";
  if (!fbId && scope !== "off") {
    // The run's trust set: profiles actually seated in this run's flow steps.
    let seated: string[] = [];
    try {
      const state = await input.ctx.stateStore.read();
      seated = (state?.flow?.steps ?? [])
        .map((s) => s.profileId)
        .filter((p): p is string => !!p);
    } catch {
      // best-effort; an unreadable state just narrows the candidate set
    }
    fbId = deriveAutoFallbackProfile({
      failingProviderId: input.baseArgs.providerId,
      seatedProfileIds: seated,
      profiles: deps.config.profiles,
      configuredProviderIds: new Set(Object.keys(deps.config.providers)),
      scope,
    });
    auto = fbId !== null;
  }
  if (!fbId) {
    await input.ctx.eventLog.append({
      type: "provider.fallback",
      message: `No fallback for ${input.stageId} (${input.cls}): none configured and no alternate-provider profile in scope "${scope}".`,
      data: { stepId: input.stageId, class: input.cls, fallbackProfile: null, ok: false },
    });
    return null;
  }
  const profile = deps.config.profiles[fbId];
  if (!profile || !deps.config.providers[profile.provider]) {
    await input.ctx.eventLog.append({
      type: "provider.fallback",
      message: `No usable fallback profile "${fbId}" for ${input.stageId} (${input.cls}); giving up.`,
      data: { stepId: input.stageId, class: input.cls, fallbackProfile: fbId, ok: false },
    });
    return null;
  }
  const fbArgs: Parameters<typeof runProvider>[1] = {
    ...input.baseArgs,
    providerId: profile.provider,
    model: profile.model ?? undefined,
    effort: profile.power ?? undefined,
    maxTokens: profile.maxTokens ?? undefined,
    timeoutMs: profile.timeoutMs ?? undefined,
    session: undefined,
  };
  await input.ctx.eventLog.append({
    type: "provider.fallback",
    message: `${auto ? `Auto-falling back (scope ${scope})` : "Falling back"} to profile "${fbId}" (provider ${profile.provider}) at ${input.stageId} after ${input.cls}.`,
    data: { stepId: input.stageId, class: input.cls, fallbackProfile: fbId, provider: profile.provider, ok: true, auto },
  });
  try {
    const result = await runProvider(deps.config.providers, fbArgs);
    if (result.exitCode === 0) return result;
    await input.ctx.eventLog.append({
      type: "provider.fallback",
      message: `Fallback profile "${fbId}" also failed at ${input.stageId} (exited ${result.exitCode}); giving up with the original outcome.`,
      data: { stepId: input.stageId, class: input.cls, fallbackProfile: fbId, ok: false, failed: true },
    });
    return null;
  } catch (err) {
    if (err instanceof __RunAbortedSignal || input.abortSignal.aborted) throw err;
    await input.ctx.eventLog.append({
      type: "provider.fallback",
      message: `Fallback profile "${fbId}" errored at ${input.stageId} (${describeError(err)}); giving up with the original outcome.`,
      data: { stepId: input.stageId, class: input.cls, fallbackProfile: fbId, ok: false, failed: true },
    });
    return null;
  }
}

/** A timeout that rejects (with __RunAbortedSignal) the instant the signal
 *  aborts, so a backoff wait never delays a user abort. */
export function interruptibleSleep(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new __RunAbortedSignal());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new __RunAbortedSignal());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** The provider's lowest effort/power level (for reduce-effort), or undefined
 *  when the provider exposes no effort control. */
export function lowestEffort(
  providers: ProjectConfig["providers"],
  catalog: ResolvedCatalog | null,
  providerId: string,
): string | undefined {
  const provCfg = providers[providerId];
  if (!provCfg || !catalog) return undefined;
  const levels = capabilitiesForProvider(providerId, provCfg, catalog).powerLevels;
  return levels.length > 0 ? levels[0] : undefined;
}

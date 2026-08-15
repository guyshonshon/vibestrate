// ── Action Policy engine ────────────────────────────────────────────────────
//
// Turns the user's declarative `actions` policies into Action Broker
// `ActionEvaluator`s. Each policy becomes one pure evaluator that inspects an
// `ActionRequest` (kind + subject) and returns a `deny` / `require_approval`
// decision when it matches, or null to abstain. The broker chain resolves
// first-deny-wins, else first-require_approval, else allow.
//
// Matching is intentionally narrow and side-effect-free: exact provider id,
// a bounded regex over the command string, a glob over written/touched paths,
// or an exact run.complete status. A policy with no `match` applies to every
// request of its listed kinds.

import {
  describeBrokenPolicySet,
  globToRegex,
  loadPolicySnapshot,
} from "./policy-store.js";
import { toPosixPath } from "../utils/paths.js";
import type { ActionPolicy } from "./policy-types.js";
import type {
  ActionDecision,
  ActionEvaluator,
  ActionRequest,
} from "../safety/action-broker.js";

/** True when `policy` applies to `request` (kind ∈ on AND match passes). */
export function actionPolicyMatches(
  policy: ActionPolicy,
  request: ActionRequest,
): boolean {
  if (!policy.on.includes(request.kind as ActionPolicy["on"][number])) {
    return false;
  }
  const m = policy.match;
  if (!m) return true; // kind-only policy → matches every request of that kind

  const subject = request.subject;
  if (m.providerId !== undefined) {
    if (subject.providerId !== m.providerId) return false;
  }
  if (m.status !== undefined) {
    if (subject.status !== m.status) return false;
  }
  if (m.commandRegex !== undefined) {
    const command = typeof subject.command === "string" ? subject.command : "";
    let re: RegExp;
    try {
      re = new RegExp(m.commandRegex, m.commandFlags);
    } catch {
      return false; // uncompilable patterns are dropped at load time; be safe
    }
    if (!re.test(command)) return false;
  }
  if (m.pathGlob !== undefined) {
    const re = globToRegex(m.pathGlob);
    const paths = collectPaths(subject);
    // A glob is always authored with `/`, but a `file.write` subject carries a
    // NATIVE absolute path - `\`-separated on Windows, where a `/` glob would
    // then match nothing and every pathGlob policy would silently protect
    // nothing. Both spellings are tested rather than the raw path replaced,
    // because `\` is a legal POSIX filename character: an action policy's
    // effect is only ever deny / require_approval, so widening the candidate
    // set can add a refusal but can never let a write through that the raw
    // path already caught.
    if (!paths.some((p) => re.test(p) || re.test(toPosixPath(p)))) return false;
  }
  return true;
}

/** Gather candidate paths from a subject (`path` and/or `files[]`). */
function collectPaths(subject: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (typeof subject.path === "string") out.push(subject.path);
  if (Array.isArray(subject.files)) {
    for (const f of subject.files) if (typeof f === "string") out.push(f);
  }
  return out;
}

/** Compile one policy into an evaluator. */
export function actionPolicyToEvaluator(policy: ActionPolicy): ActionEvaluator {
  return (request: ActionRequest): ActionDecision | null => {
    if (!actionPolicyMatches(policy, request)) return null;
    return {
      effect: policy.effect,
      ruleIds: [policy.id],
      reason: `${policy.message} (policy: ${policy.id})`,
    };
  };
}

export function buildActionEvaluators(
  policies: readonly ActionPolicy[],
): ActionEvaluator[] {
  return policies.map(actionPolicyToEvaluator);
}

/**
 * Effects refused when the policy set on disk did not fully load: every kind
 * that changes something, plus the two that run something.
 *
 * `provider.spawn` is deliberately NOT here, and that is not a gap - it is
 * refused one layer down, in `runProvider`, which is the true single funnel for
 * model turns (three spawn sites build no broker at all). Refusing it there
 * makes it read as the configuration error it is, rather than a policy-shaped
 * deny that looks like a rule the user wrote. Keeping it out also makes this
 * path structurally identical to POLICY_UNAVAILABLE_KINDS - same kinds,
 * different reason - instead of two fail-closed paths that disagree.
 */
const BROKEN_SET_DENY_KINDS = new Set<ActionRequest["kind"]>([
  "file.patch",
  "file.write",
  "run.complete",
  "git.merge",
  "command.run",
  "terminal.create",
  // Launching a run off a chat message while the policy set is half-loaded is
  // the worst version of this: the rules meant to bound that run are exactly
  // the ones that failed to load.
  "run.start",
]);

/**
 * An evaluator that refuses effects because the policy set did not load. Not a
 * general fail-closed default - it fires only on a condition the user can see
 * and fix, and the reason names both the condition and the command that
 * explains it.
 */
export function brokenPolicySetEvaluator(reason: string): ActionEvaluator {
  return (request) =>
    BROKEN_SET_DENY_KINDS.has(request.kind)
      ? { effect: "deny", ruleIds: ["policy.set.broken"], reason }
      : null;
}

/**
 * Load `.vibestrate/policies/` and compile its action policies into evaluators.
 * Used by `createActionBroker` to lazily wire policy enforcement into every
 * broker without changing any (synchronous) construction site.
 *
 * If the set did not fully load, the compiled policies are REPLACED by the deny
 * evaluator above rather than appended to - the loaded subset is not a policy
 * set anyone chose.
 *
 * The recovery path is deliberately outside the broker: `vibe policies doctor`
 * and `list`, the policies HTTP routes, and the dashboard panel all read the
 * snapshot directly, so a broken set can never lock someone out of the error
 * that tells them what to fix.
 */
export async function loadActionPolicyEvaluators(
  projectRoot: string,
): Promise<ActionEvaluator[]> {
  const snapshot = await loadPolicySnapshot(projectRoot);
  const broken = describeBrokenPolicySet(snapshot);
  if (broken) return [brokenPolicySetEvaluator(broken.short)];
  return buildActionEvaluators(snapshot.actions);
}

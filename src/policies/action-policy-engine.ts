// ── Action Policy engine (Epic S / S2) ──────────────────────────────────────
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

import { globToRegex } from "./policy-store.js";
import { loadPolicySnapshot } from "./policy-store.js";
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
    if (!paths.some((p) => re.test(p))) return false;
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
 * Load `.vibestrate/policies/` and compile its action policies into evaluators.
 * Used by `createActionBroker` to lazily wire policy enforcement into every
 * broker without changing any (synchronous) construction site.
 */
export async function loadActionPolicyEvaluators(
  projectRoot: string,
): Promise<ActionEvaluator[]> {
  const snapshot = await loadPolicySnapshot(projectRoot);
  return buildActionEvaluators(snapshot.actions);
}

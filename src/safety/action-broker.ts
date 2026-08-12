// ── Action Broker ───────────────────────────────────────────────────────────
//
// The Vibestrate-owned boundary every real effect crosses: provider spawn,
// command run, file patch/write, terminal create, run completion, git merge.
// A request is *decided* (allow / deny / require_approval) by a chain of pure
// evaluators, then *recorded* to an append-only per-run evidence log
// (`runs/<id>/actions.ndjson`) - the audit trail the Run Assurance artifact
// and replay read from.
//
// The broker is the boundary + the decision/evidence records. Its resolution is
// default-ALLOW with a policy VETO: an effect with no matching evaluator is
// allowed, and evaluators can only refuse (`deny`) or hold (`require_approval`),
// never grant. What is fail-closed is the *handling* of a decision - anything
// short of `allow` refuses the effect at the call site - and a policy-loader
// error, which denies write/outcome kinds (POLICY_UNAVAILABLE_EVALUATOR below).
// The deny floor that applies with zero policies configured lives one layer up,
// in the built-in patch-safety check (secret content, forbidden paths).

import { appendLine, pathExists, readText } from "../utils/fs.js";
import { runActionsPath } from "../utils/paths.js";
import { nowIso } from "../utils/time.js";
import { loadActionPolicyEvaluators } from "../policies/action-policy-engine.js";

/**
 * Every effect kind that a real emitter constructs today. The union is the
 * product's honest claim about what crosses the boundary: a kind listed here
 * with no emitter would advertise coverage that does not exist, so a kind is
 * added only together with the site that raises it. `actionKindSchema`
 * (policy-types.ts) mirrors this exactly, and a collision test keeps the two
 * from drifting - a kind users can write a policy for must be a kind something
 * actually raises.
 *
 * Deliberately absent: per-request network and per-tool MCP interception. A
 * provider CLI's own HTTP calls and tool invocations happen inside an opaque
 * subprocess vibestrate cannot see; network confinement is enforced at the
 * container layer instead (`execution.container.egress`), not here.
 */
export type ActionKind =
  | "provider.spawn"
  | "command.run"
  | "file.patch"
  | "file.write"
  | "terminal.create"
  | "run.complete"
  // The human-triggered integration->main merge (guided merge). Emitted
  // ONLY by the guided-merge service - no scheduler / run-completion path may
  // reach it (tested invariant in tests/guided-merge.test.ts).
  | "git.merge";

// Which kinds can actually HOLD for a human (`require_approval`) rather than
// merely refuse is a property of the effect sites, enumerated once as
// HOLDABLE_ACTION_KINDS in policy-types.ts, where the policy schema enforces it.

export type ActionRequest = {
  runId: string;
  stageId?: string;
  roleId?: string;
  kind: ActionKind;
  /** Kind-specific details (provider id, command, target path, …). Must not
   *  carry secrets - callers pass references/ids, never credential material. */
  subject: Record<string, unknown>;
  proposedBy: "provider" | "ui" | "cli" | "system";
};

export type ActionEffect = "allow" | "deny" | "require_approval";

export type ActionDecision =
  | { effect: "allow"; ruleIds: string[] }
  | { effect: "deny"; ruleIds: string[]; reason: string }
  | { effect: "require_approval"; ruleIds: string[]; reason: string };

export type ActionEvidence = {
  ok: boolean;
  summary?: string;
  data?: Record<string, unknown>;
};

/** The write/outcome/irreversible kinds that must FAIL CLOSED when the policy
 *  loader THROWS (an fs blip, not a policy the user wrote): file writes, run
 *  completion, and the merge to main. The remaining kinds stay permissive so a
 *  transient error can't brick benign runs - provider.spawn throwing would stop
 *  every run from even starting.
 *
 *  Distinct from a policy set that loaded but is BROKEN (malformed file,
 *  duplicate id, unreadable directory). That is deterministic and user-fixable,
 *  so it denies a wider set (see BROKEN_SET_DENY_KINDS in
 *  action-policy-engine.ts) and refuses model spawns one layer down, in
 *  runProvider. The two paths are mutually exclusive: this one fires on a
 *  rejected promise, that one on a resolved-but-broken snapshot.
 *
 *  git.merge is denied (not abstained) because it is the most
 *  irreversible effect and is only ever human-initiated, so failing it closed
 *  just makes the user retry once policy loads - the safer default. */
const POLICY_UNAVAILABLE_KINDS = new Set<ActionKind>([
  "file.patch",
  "file.write",
  "run.complete",
  "git.merge",
]);

/**
 * Injected in place of `[]` when the policy loader throws: a loader error
 * is no longer fail-OPEN. It DENIES write/outcome effects (so an apply refuses, a
 * diff rolls back, a run can't reach merge_ready) and ABSTAINS on everything else
 * (so runs still start). A malformed policy FILE never reaches here: the store
 * records it and the loader turns it into the broken-set denial instead, which
 * is a stricter and better-explained refusal. This fires only on a genuinely
 * unexpected fs/read error that leaves us with no snapshot at all.
 */
export const POLICY_UNAVAILABLE_EVALUATOR: ActionEvaluator = (request) =>
  POLICY_UNAVAILABLE_KINDS.has(request.kind)
    ? {
        effect: "deny",
        ruleIds: ["policy.unavailable"],
        reason:
          "Action policy could not be loaded; failing closed for write/outcome effects.",
      }
    : null;

/** A pure veto/escalation hook. Returns a non-allow decision to override the
 *  default, or null to abstain. The first deny wins; otherwise the first
 *  require_approval; otherwise allow. Evaluators must not perform side effects. */
export type ActionEvaluator = (request: ActionRequest) => ActionDecision | null;

export type ActionRecord = {
  timestamp: string;
  request: ActionRequest;
  decision: ActionDecision;
  evidence: ActionEvidence | null;
};

export interface ActionBroker {
  /** Evaluate policy for a proposed effect. Never mutates anything. */
  decide(request: ActionRequest): Promise<ActionDecision>;
  /** Append the decision (and optional post-execution evidence) to the log. */
  record(
    request: ActionRequest,
    decision: ActionDecision,
    evidence?: ActionEvidence | null,
  ): Promise<void>;
}

export type DefaultActionBrokerOptions = {
  /** Ordered veto/escalation chain. Empty ⇒ everything is allowed. */
  evaluators?: ActionEvaluator[];
  /** Lazily-loaded evaluators (e.g. on-disk policies), appended after the
   *  static `evaluators` on first `decide()`. Lets construction stay
   *  synchronous while still wiring async-loaded policy into every broker. */
  evaluatorLoader?: () => Promise<ActionEvaluator[]>;
};

/**
 * Fail-closed broker. Decisions are deterministic and side-effect-free;
 * `record` is the only thing that writes (append-only NDJSON).
 */
export class DefaultActionBroker implements ActionBroker {
  private readonly evaluators: ActionEvaluator[];
  private readonly evaluatorLoader?: () => Promise<ActionEvaluator[]>;
  /** Memoized loader result so disk policies are read at most once per broker. */
  private loaded: Promise<ActionEvaluator[]> | null = null;

  constructor(
    private readonly projectRoot: string,
    private readonly runId: string,
    opts: DefaultActionBrokerOptions = {},
  ) {
    this.evaluators = opts.evaluators ?? [];
    this.evaluatorLoader = opts.evaluatorLoader;
  }

  private async allEvaluators(): Promise<ActionEvaluator[]> {
    if (!this.evaluatorLoader) return this.evaluators;
    if (!this.loaded) {
      // Fail-CLOSED on a loader error: a broken policy load denies
      // write/outcome effects (apply refuses, diff rolls back, run can't
      // complete) but abstains on read-only kinds so runs still start. Malformed
      // policy FILES are already skipped by the store; this guards an unexpected
      // throw (e.g. fs error). Previously this returned [] (fail-open).
      this.loaded = this.evaluatorLoader().catch(() => [
        POLICY_UNAVAILABLE_EVALUATOR,
      ]);
    }
    return [...this.evaluators, ...(await this.loaded)];
  }

  async decide(request: ActionRequest): Promise<ActionDecision> {
    let approval: ActionDecision | null = null;
    for (const evaluate of await this.allEvaluators()) {
      const verdict = evaluate(request);
      if (!verdict) continue;
      if (verdict.effect === "deny") return verdict; // first deny wins
      if (verdict.effect === "require_approval" && !approval) approval = verdict;
    }
    return approval ?? { effect: "allow", ruleIds: [] };
  }

  async record(
    request: ActionRequest,
    decision: ActionDecision,
    evidence: ActionEvidence | null = null,
  ): Promise<void> {
    const record: ActionRecord = {
      timestamp: nowIso(),
      request,
      decision,
      evidence,
    };
    await appendLine(
      runActionsPath(this.projectRoot, this.runId),
      JSON.stringify(record),
    );
  }
}

/**
 * Single construction point for a run's broker. Both the orchestrator and the
 * effect-site services (suggestion/bundle apply, …) build their broker here so
 * the action-policy engine can wire the evaluator chain in ONE place and every
 * effect kind inherits it - the "one boundary" guarantee. They all append to
 * the same per-run `runs/<id>/actions.ndjson`.
 */
export function createActionBroker(
  projectRoot: string,
  runId: string,
  opts: DefaultActionBrokerOptions = {},
): ActionBroker {
  return new DefaultActionBroker(projectRoot, runId, {
    ...opts,
    // Wire on-disk action policies unless the caller supplied a loader
    // (e.g. tests injecting evaluators directly).
    evaluatorLoader:
      opts.evaluatorLoader ??
      (() => loadActionPolicyEvaluators(projectRoot)),
  });
}

/** Result of gating an effect at a call site. */
export type ActionGate =
  | { allowed: true; decision: ActionDecision }
  | { allowed: false; decision: ActionDecision; effect: "deny" | "require_approval"; reason: string };

/**
 * Gate an effect: decide, and on a non-allow verdict record the denial (so the
 * evidence log shows the blocked attempt) and return it so the caller can fail
 * closed. On allow, returns the decision; the caller runs the effect and then
 * calls `broker.record(request, decision, evidence)` with the outcome.
 *
 * `canHold` is the call site declaring it has an approval seam to await on. A
 * `require_approval` verdict at a site WITHOUT one cannot pause anybody - it can
 * only refuse - so the refusal is recorded as evidence against the decision.
 * The decision itself is left untouched (the policy really did say "hold"); the
 * evidence is what keeps the audit log from implying a human was asked. The
 * policy schema blocks this combination for kinds where no site can ever hold,
 * so in practice this fires only for `file.patch` outside the diff gate.
 */
export async function gateAction(
  broker: ActionBroker,
  request: ActionRequest,
  opts: { canHold?: boolean } = {},
): Promise<ActionGate> {
  const decision = await broker.decide(request);
  if (decision.effect === "allow") return { allowed: true, decision };
  const heldWithoutSeam =
    decision.effect === "require_approval" && opts.canHold !== true;
  await broker.record(
    request,
    decision,
    heldWithoutSeam
      ? {
          ok: false,
          summary: `require_approval cannot pause ${request.kind} here (no approval seam at this effect site); the action was refused`,
        }
      : null,
  );
  const reason = "reason" in decision ? decision.reason : "policy denied";
  return { allowed: false, decision, effect: decision.effect, reason };
}

/** Read the append-only action log for a run (skips malformed lines). */
export async function readActionLog(
  projectRoot: string,
  runId: string,
): Promise<ActionRecord[]> {
  const file = runActionsPath(projectRoot, runId);
  if (!(await pathExists(file))) return [];
  const text = await readText(file);
  const out: ActionRecord[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as ActionRecord);
    } catch {
      // tolerate a partially-written final line
    }
  }
  return out;
}

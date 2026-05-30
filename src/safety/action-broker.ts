// ── Action Broker (Epic S / S0) ────────────────────────────────────────────
//
// The Vibestrate-owned boundary every real effect crosses: provider spawn,
// command run, file patch/write, network/MCP, terminal create, run completion.
// A request is *decided* (allow / deny / require_approval) by a chain of pure
// evaluators, then *recorded* to an append-only per-run evidence log
// (`runs/<id>/actions.ndjson`) — the audit trail the Run Assurance artifact
// (S5) and replay read from.
//
// S0 is the boundary + the decision/evidence records. Default policy is
// allow (no evaluators wired yet); Policy Engine V2 (S2) plugs in as
// evaluators without changing call sites. Design:
// docs/design/policy-enforcement-assurance.md.

import { appendLine, pathExists, readText } from "../utils/fs.js";
import { runActionsPath } from "../utils/paths.js";
import { nowIso } from "../utils/time.js";

export type ActionKind =
  | "provider.spawn"
  | "command.run"
  | "file.patch"
  | "file.write"
  | "network.request"
  | "mcp.tool"
  | "terminal.create"
  | "run.complete";

export type ActionRequest = {
  runId: string;
  stageId?: string;
  roleId?: string;
  kind: ActionKind;
  /** Kind-specific details (provider id, command, target path, …). Must not
   *  carry secrets — callers pass references/ids, never credential material. */
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
};

/**
 * Fail-closed broker. Decisions are deterministic and side-effect-free;
 * `record` is the only thing that writes (append-only NDJSON).
 */
export class DefaultActionBroker implements ActionBroker {
  private readonly evaluators: ActionEvaluator[];

  constructor(
    private readonly projectRoot: string,
    private readonly runId: string,
    opts: DefaultActionBrokerOptions = {},
  ) {
    this.evaluators = opts.evaluators ?? [];
  }

  async decide(request: ActionRequest): Promise<ActionDecision> {
    let approval: ActionDecision | null = null;
    for (const evaluate of this.evaluators) {
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
 * the Policy Engine V2 (S2) can wire the evaluator chain in ONE place and every
 * effect kind inherits it — the "one boundary" guarantee. They all append to
 * the same per-run `runs/<id>/actions.ndjson`.
 */
export function createActionBroker(
  projectRoot: string,
  runId: string,
  opts: DefaultActionBrokerOptions = {},
): ActionBroker {
  return new DefaultActionBroker(projectRoot, runId, opts);
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
 */
export async function gateAction(
  broker: ActionBroker,
  request: ActionRequest,
): Promise<ActionGate> {
  const decision = await broker.decide(request);
  if (decision.effect === "allow") return { allowed: true, decision };
  await broker.record(request, decision, null);
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

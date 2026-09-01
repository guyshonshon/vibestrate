import { appendLine, readText } from "../../utils/fs.js";
import { runEventsPath } from "../../utils/paths.js";
import { nowIso } from "../../utils/time.js";

export type VibestrateEventType =
  | "run.created"
  | "run.startup"
  | "ledger.flagged"
  | "methodology.unknown"
  | "run.rewound"
  | "run.rewound.restored"
  | "run.rewound.carried"
  | "run.snapshot.captured"
  | "run.snapshot.pruned"
  | "state.changed"
  | "git.worktree.created"
  | "git.worktree.env"
  | "git.commit.excluded-symlinks"
  | "role.started"
  | "role.completed"
  | "role.failed"
  | "provider.started"
  | "provider.completed"
  | "provider.failed"
  | "provider.effort_ignored"
  | "provider.sandboxed"
  | "provider.sandbox_unavailable"
  | "execution.containerized"
  | "execution.container_unavailable"
  | "policy.permission_mode"
  | "policy.posture_applied"
  | "provider.hardened"
  | "provider.fallback"
  | "provider.usage_limit"
  | "provider.retries_exhausted"
  | "validation.started"
  | "validation.scoped"
  | "validation.command.completed"
  | "review.decision"
  // A review cited a file that is not in the worktree - the one hallucination
  // that can be checked exactly. Advisory: recorded, never a gate.
  | "review.findings.ungrounded"
  | "verification.decision"
  | "policy.warning"
  | "approval.requested"
  | "approval.approved"
  | "approval.rejected"
  | "approval.changes_requested"
  | "approval.expired"
  | "run.pause_requested"
  // A human queued a note onto a live run. Carries the step it is aimed at and
  // the resulting depth, never the note text - see applyQueuedGuidance.
  | "run.guidance.queued"
  | "run.abort_requested"
  | "run.paused"
  | "run.resume_requested"
  | "run.resumed"
  | "skill.assigned"
  | "skill.unassigned"
  | "run.completed"
  | "run.failed"
  | "run.aborted"
  | "spend.warning"
  | "spend.action"
  | "spend.capped"
  | "budget.limit"
  | "editor.opened"
  | "editor.open_failed"
  | "suggestion.created"
  | "suggestion.approved"
  | "suggestion.rejected"
  | "suggestion.applied"
  | "suggestion.apply_failed"
  | "suggestion.validation_passed"
  | "suggestion.validation_failed"
  | "suggestion.reverted"
  | "suggestion.revert_failed"
  | "bundle.created"
  | "bundle.updated"
  | "bundle.approved"
  | "bundle.rejected"
  | "bundle.applied"
  | "bundle.apply_failed"
  | "bundle.partially_applied"
  | "bundle.validation_passed"
  | "bundle.validation_failed"
  | "bundle.reverted"
  | "bundle.revert_failed"
  | "suggestion.auto_revert_succeeded"
  | "suggestion.auto_revert_failed"
  | "bundle.auto_revert_succeeded"
  | "bundle.auto_revert_failed"
  | "bundle.smart_apply_started"
  | "bundle.smart_apply_step_passed"
  | "bundle.smart_apply_step_failed"
  | "bundle.smart_apply_step_reverted"
  | "bundle.smart_apply_completed"
  | "bundle.smart_apply_stopped"
  | "suggestion.validation_profile_updated"
  | "bundle.validation_profile_updated"
  | "mcp.attached"
  | "control.applied"
  | "workflow.selected"
  | "persona.selected"
  | "persona.upgraded"
  | "supervisor.reviewer_profile"
  | "supervisor.review_lenses"
  | "supervisor.spec_up_posture"
  | "supervisor.policy_advise"
  | "supervisor.policy_block"
  // The Supervisor proposing what to do about a run that did not complete.
  // Recorded even when it will not act, so a refusal is visible in the log
  // rather than being an absence a reader has to notice.
  | "supervisor.intervention"
  // One per piece of context the Supervisor added to a step, carrying its
  // source, stated reason and size. An addition nobody can see is
  // indistinguishable from a change to the flow.
  | "supervisor.context_injection"
  // The run changed a file outside the path scope its architect declared
  // (scope-gate.ts). Deterministic merge-cap, never a model verdict.
  | "supervisor.scope_block"
  | "supervisor.ponytail"
  | "flow.snapshot.written"
  | "flow.participant.capabilities"
  | "flow.session.opened"
  | "flow.session.reused"
  | "flow.session.rehydrated"
  | "flow.session.stateless"
  | "flow.context.built"
  | "flow.findings.updated"
  | "flow.decision.completed"
  | "flow.handoff.parsed"
  | "flow.step.started"
  | "flow.step.completed"
  | "flow.step.failed"
  | "flow.step.changes_requested"
  // A human queued a note on the live run and the orchestrator applied it to
  // this step at its boundary (guidance-service.ts). Auditable: the run record
  // shows where a person redirected the work, not just what the agents chose.
  | "flow.step.guided"
  | "flow.step.retried"
  | "flow.step.skipped"
  | "flow.loop.iteration"
  | "flow.loop.decision"
  | "flow.graph.started"
  | "flow.frontier.scheduled"
  | "flow.graph.completed"
  | "checklist.run.started"
  | "checklist.item.started"
  | "checklist.item.completed"
  | "checklist.item.blocked"
  | "checklist.item.gate"
  | "supervised.halted"
  | "supervised.step.context_reset"
  | "supervised.supervisor"
  | "supervised.enhance"
  | "flow.checklist.item.review"
  | "needs_testing.flagged"
  | "context.materialized"
  | "action.allowed"
  | "action.denied"
  | "action.approval_required";

export type VibestrateEvent = {
  timestamp: string;
  type: VibestrateEventType;
  message: string;
  data?: Record<string, unknown>;
};

export class EventLog {
  constructor(private readonly projectRoot: string, private readonly runId: string) {}

  get filePath(): string {
    return runEventsPath(this.projectRoot, this.runId);
  }

  async append(event: Omit<VibestrateEvent, "timestamp">): Promise<void> {
    const full: VibestrateEvent = { timestamp: nowIso(), ...event };
    await appendLine(this.filePath, JSON.stringify(full));
  }

  /**
   * The run's recorded evidence, for code that must classify what happened
   * from what was actually logged rather than from prose or a model's opinion.
   *
   * Tolerant on purpose: a malformed line is skipped, not thrown, and a missing
   * file reads as no evidence. A caller that cannot read the log has to treat
   * that as "unknown", which is never a licence to act.
   */
  async read(): Promise<{ type: string; data?: Record<string, unknown> }[]> {
    let raw: string;
    try {
      raw = await readText(this.filePath);
    } catch {
      return [];
    }
    const out: { type: string; data?: Record<string, unknown> }[] = [];
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        const parsed = JSON.parse(t) as { type?: unknown; data?: unknown };
        if (typeof parsed.type === "string") {
          out.push({
            type: parsed.type,
            data:
              parsed.data && typeof parsed.data === "object"
                ? (parsed.data as Record<string, unknown>)
                : undefined,
          });
        }
      } catch {
        // A half-written final line is normal on a killed run; skip it.
      }
    }
    return out;
  }
}

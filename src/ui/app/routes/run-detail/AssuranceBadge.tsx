import { Button } from "../../../components/design/Button.js";
import type {
  VibestrateEvent,
  ApprovalRequest,
  EngagementEntry,
  PerItemVerdict,
  RunAssurance,
  RunAudit,
  RunState,
  RuntimeMetrics,
  SpecUpQuestion,
  WorkflowSelectionView,
} from "../../../lib/types.js";
import { AlertTriangle, Bolt, Cpu, FolderTree, Scale, ShieldCheck } from "lucide-react";
import { StatTile } from "../../../components/design/StatTile.js";
import { VERDICT_META } from "./shared.js";
import { LaneCell, laneTone } from "./LaneCell.js";

export function AssuranceBadge({
  assurance,
  onViewReview,
  onRerunWithFixes,
  onViewValidation,
}: {
  assurance: RunAssurance;
  onViewReview?: () => void;
  onRerunWithFixes?: () => void;
  onViewValidation?: () => void;
}) {
  const a = assurance;
  const vm = VERDICT_META[a.verdict];
  const Icon = vm.icon;
  const hasMeta =
    (a.coverage?.toleratedStepFailures ?? 0) > 0 ||
    !!a.supervisor?.persona ||
    (!!a.isolation && a.isolation.posture !== "none");
  const isoBits = a.isolation
    ? [
        a.isolation.osSandboxedTurns > 0 ? `${a.isolation.osSandboxedTurns} OS-sandboxed` : null,
        a.isolation.hardenedTurns > 0 ? `${a.isolation.hardenedTurns} hardened` : null,
        a.isolation.unconfinedRequestedTurns > 0 ? `${a.isolation.unconfinedRequestedTurns} unconfined` : null,
      ].filter(Boolean)
    : [];
  return (
    <div className={`rounded-[18px] border px-4 py-3.5 ${vm.card}`} data-screen-label="01 Assurance">
      <div className="flex items-start gap-2.5">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-coal-500/60 ${vm.tone}`}>
          <Icon className="h-4 w-4" strokeWidth={1.9} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-violet-soft">
            Run assurance
          </div>
          <div className={`text-[15px] font-semibold ${vm.tone}`}>{a.verdict.replace(/_/g, " ")}</div>
          <div className="mt-0.5 text-[12px] leading-snug text-chalk-300">{a.summary}</div>
        </div>
        {onViewReview || onViewValidation ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {onViewReview ? (
              <Button variant="secondary" size="sm" onClick={onViewReview}>
                View review
              </Button>
            ) : null}
            {onViewReview && onRerunWithFixes ? (
              <Button variant="secondary" size="sm" onClick={onRerunWithFixes}>
                Re-run with fixes
              </Button>
            ) : null}
            {onViewValidation ? (
              <Button variant="secondary" size="sm" onClick={onViewValidation}>
                View validation
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <LaneCell label="Policy" value={a.policy.status.replace(/_/g, " ")} tone={laneTone(a.policy.status)} />
        <LaneCell
          label="Validation"
          value={`${a.validation.status.replace(/_/g, " ")}${a.validation.total > 0 ? ` ${a.validation.passed}/${a.validation.total}` : ""}`}
          sub={a.validation.status === "environment" ? "toolchain missing - nothing was checked" : undefined}
          tone={laneTone(a.validation.status)}
        />
        <LaneCell label="Review" value={a.review.status.replace(/_/g, " ")} tone={laneTone(a.review.status)} />
        <LaneCell label="Verification" value={a.verification.status.replace(/_/g, " ")} tone={laneTone(a.verification.status)} />
      </div>

      {hasMeta ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {(a.coverage?.toleratedStepFailures ?? 0) > 0 ? (
            <div
              title={`${a.coverage.toleratedStepFailures} tolerated failure${a.coverage.toleratedStepFailures === 1 ? "" : "s"}`}
            >
              <StatTile
                label="Coverage"
                value={`${a.coverage.toleratedStepFailures} tolerated failure${a.coverage.toleratedStepFailures === 1 ? "" : "s"}`}
              />
            </div>
          ) : null}
          {a.supervisor?.persona ? (
            <div title="The supervisor's review independence is honest, not a confidence source - single-profile is a same-model self-check that can only lower confidence.">
              <StatTile
                label="Supervisor"
                value={`${a.supervisor.persona} (${a.supervisor.independence})`}
              />
            </div>
          ) : null}
          {a.isolation && a.isolation.posture !== "none" ? (
            <div title="How confined the run's agents actually were, derived from per-turn provider evidence (not config). Informational - it never affects the verdict; the default is the worktree + diff gate.">
              <StatTile
                label="Isolation"
                value={`${a.isolation.posture}${isoBits.length ? ` · ${isoBits.join(" · ")}` : ""}`}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {a.blockers && a.blockers.length > 0 ? (
        <div className="mt-2 space-y-1.5">
          {a.blockers.map((b, i) => (
            <div key={i} className="rounded-[12px] border border-rose-400/25 bg-rose-500/[0.06] px-3 py-2">
              <div className="text-[12px] font-semibold text-rose-300">
                Cause{b.stepId ? ` · ${b.stepId}` : ""}{b.class ? ` · ${b.class}` : ""}
              </div>
              <div className="mt-0.5 text-meta text-chalk-300">{b.detail}</div>
            </div>
          ))}
        </div>
      ) : null}

      {(a.caps?.length ?? 0) > 0 || (a.notes?.length ?? 0) > 0 ? (
        <div className="mt-2 flex flex-col gap-1 text-meta text-chalk-400">
          {(a.caps?.length ?? 0) > 0 ? (
            <div>
              <span className="font-semibold">Caps</span> {a.caps.join(", ")}
            </div>
          ) : null}
          {(a.notes?.length ?? 0) > 0 ? (
            <div>
              <span className="font-semibold">Notes</span> {a.notes!.map(humanizeAssuranceNote).join(", ")}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Turn an assurance note code into a short human phrase. Notes are
 *  informational (a lane that wasn't required) - never a verdict-capping gap. */

function humanizeAssuranceNote(code: string): string {
  switch (code) {
    case "validation_not_required":
      return "validation not required";
    case "validation_skipped_inert":
      return "validation skipped (inert change)";
    case "review_skipped_inert_diff":
      return "review skipped (inert diff)";
    case "review_not_required":
      return "no review needed";
    case "verification_not_required":
      return "verification not required";
    default:
      return code.replace(/_/g, " ");
  }
}

// Unused - kept so we can quickly add an inline "needs review" indicator
// later without re-importing icons.
void Bolt;
void Scale;

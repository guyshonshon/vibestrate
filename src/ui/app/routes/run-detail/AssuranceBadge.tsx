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
import { AlertTriangle, Bolt, ChevronRight, Cpu, FolderTree, Scale, ShieldCheck } from "lucide-react";
import { StatTile } from "../../../components/design/StatTile.js";
import { VERDICT_META } from "./shared.js";
import { LaneCell, laneTone } from "./LaneCell.js";


/**
 * Split the four gates into what went wrong and what did not.
 *
 * The panel used to render all four at equal weight, which spent the same area
 * on `passed` as on the finding that stopped the run. Only a gate with
 * something to report earns a row.
 */
type LaneInput = { lane: string; status: string; detail?: string | null };
export type LaneFinding = { lane: string; state: string; why: string | null; severe: boolean };

/** Cleared: the gate ran and was satisfied. */
function isCleared(status: string): boolean {
  return /(^|_)(passed|verified|approved|ok)($|_)/.test(status.toLowerCase());
}
/** Not asked of this run - honest, and not a finding. */
function isNotApplicable(status: string): boolean {
  return /(not_applicable|not_required|not_run|skipped|missing)/.test(status.toLowerCase());
}

export function splitLanes(lanes: LaneInput[]): {
  findings: LaneFinding[];
  cleared: LaneInput[];
  clearedSentence: string;
} {
  const findings: LaneFinding[] = [];
  const cleared: LaneInput[] = [];
  for (const l of lanes) {
    if (isCleared(l.status) || isNotApplicable(l.status)) {
      cleared.push(l);
      continue;
    }
    findings.push({
      lane: l.lane,
      state: l.status.replace(/_/g, " "),
      why: l.detail ?? null,
      // Rose for a refusal or a failure, amber for "could not tell" - the
      // difference between a verdict and a gap in the evidence.
      severe: /(fail|blocked|changes|unsafe|reject)/.test(l.status.toLowerCase()),
    });
  }
  const parts = cleared.map((c) =>
    isCleared(c.status)
      ? `${c.lane} passed`
      : `${c.lane.toLowerCase()} ${c.status.replace(/_/g, " ")}`,
  );
  const sentence =
    parts.length === 0
      ? ""
      : parts.length === 1
        ? `${parts[0]}.`
        : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}.`;
  return { findings, cleared, clearedSentence: sentence };
}

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
  const { findings, cleared, clearedSentence } = splitLanes([
    { lane: "Policy", status: a.policy.status },
    {
      lane: "Validation",
      status: a.validation.status,
      detail:
        a.validation.status === "environment"
          ? "The toolchain was missing, so the code was never checked."
          : a.validation.total > 0
            ? `${a.validation.passed} of ${a.validation.total} checks passed.`
            : null,
    },
    { lane: "Review", status: a.review.status },
    { lane: "Verification", status: a.verification.status },
  ]);
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
          <div className="mt-0.5 text-[12px] leading-snug text-chalk-300">
            {findings.length > 0
              ? `${findings.length} of ${findings.length + cleared.length} gates did not clear.`
              : a.summary}
          </div>
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

      {/* ── Findings first, one row each ──────────────────────────────────
          The lanes used to be a four-column grid inside a 474px panel: 104px
          per cell, every cell forced to 142px by the one that wrapped, and
          three of the four holding a single word. A row spans the panel, so a
          gate that has something to say can say it in a sentence. Gates that
          cleared are a confirmation, not a finding, and collapse to one line
          below. */}
      {findings.length > 0 ? (
        <div className="mt-3 flex flex-col gap-2">
          {findings.map((f) => (
            <div
              key={f.lane}
              className={`flex items-start gap-2.5 rounded-[12px] border px-3 py-2 ${
                f.severe
                  ? "border-rose-400/25 bg-rose-500/[0.06]"
                  : "border-amber-soft/25 bg-amber-soft/[0.06]"
              }`}
            >
              <span
                className={`mt-0.5 w-[3px] self-stretch rounded-full ${
                  f.severe ? "bg-rose-300" : "bg-amber-soft"
                }`}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-[12.5px] font-semibold text-chalk-100">{f.lane}</span>
                  <span className={`ui-label ${f.severe ? "text-rose-300" : "text-amber-soft"}`}>
                    {f.state}
                  </span>
                </div>
                {f.why ? (
                  <div className="mt-0.5 text-[12px] leading-snug text-chalk-300">{f.why}</div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {cleared.length > 0 ? (
        <div className="mt-2.5 flex items-start gap-2 border-t border-[color:var(--line-soft)] pt-2.5">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" aria-hidden />
          <span className="text-[12px] leading-snug text-chalk-300">{clearedSentence}</span>
        </div>
      ) : null}

      {hasMeta ? (
        <details className="group mt-2">
          <summary className="ui-label flex cursor-pointer list-none items-center gap-1.5 text-chalk-300 hover:text-chalk-100">
            <ChevronRight
              className="h-3 w-3 transition-transform group-open:rotate-90"
              strokeWidth={2}
              aria-hidden
            />
            How this run was conducted
          </summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {(a.coverage?.toleratedStepFailures ?? 0) > 0 ? (
              <StatTile
                label="Coverage"
                value={`${a.coverage.toleratedStepFailures} tolerated failure${a.coverage.toleratedStepFailures === 1 ? "" : "s"}`}
              />
            ) : null}
            {a.supervisor?.persona ? (
              <div title="Review independence is honest, not a confidence source - single-profile is a same-model self-check that can only lower confidence.">
                <StatTile
                  label="Supervisor"
                  value={`${a.supervisor.persona} (${a.supervisor.independence})`}
                />
              </div>
            ) : null}
            {a.isolation && a.isolation.posture !== "none" ? (
              <div title="How confined the run's agents actually were, from per-turn provider evidence (not config). Informational - it never affects the verdict.">
                <StatTile
                  label="Isolation"
                  value={`${a.isolation.posture}${isoBits.length ? ` \u00b7 ${isoBits.join(" \u00b7 ")}` : ""}`}
                />
              </div>
            ) : null}
          </div>
        </details>
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

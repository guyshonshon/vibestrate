import { AlertTriangle, ArrowRight, FileText } from "lucide-react";
import type {
  ConsultResult,
  ConsultSections,
  ConsultSectionItem,
  ConsultRef,
} from "../../lib/types.js";
import { Button } from "../design/Button.js";
import { cn } from "../design/cn.js";

/** Hash route a computed item opens: run -> run detail, task -> board card. */
function refHref(ref: ConsultRef): string {
  return ref.kind === "run" ? `#/runs/${ref.id}` : `#/tasks/${ref.id}`;
}

const CONFIDENCE_TONE: Record<ConsultResult["answer"]["confidence"], string> = {
  high: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
  medium: "border-amber-400/30 bg-amber-500/10 text-amber-200",
  low: "border-white/15 bg-white/[0.04] text-fog-300",
};

export type ProposalState = "open" | "applied" | "rejected" | "busy";

/** The full consult answer rendering, shared by the page and the floating dock
 *  so a result reads the same everywhere: narration + computed project state +
 *  caveats + recommended actions + the (never-auto) VIBESTRATE.md proposal. */
export function ConsultAnswerView({
  result,
  proposalState,
  onDecideProposal,
  compact = false,
}: {
  result: ConsultResult;
  proposalState: ProposalState;
  onDecideProposal: (action: "apply" | "reject") => void;
  /** Tighter spacing for the narrow dock panel. */
  compact?: boolean;
}) {
  const answer = result.answer;
  const pad = compact ? "p-3" : "p-4";
  return (
    <div className={cn("space-y-3", compact ? "" : "space-y-4")}>
      <div className={cn("glass rounded-xl border border-white/[0.08]", pad)}>
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <span className="eyebrow">Answer</span>
          <span className={cn("rounded-md border px-2 py-0.5 text-[11px]", CONFIDENCE_TONE[answer.confidence])}>
            confidence: {answer.confidence}
          </span>
        </div>
        <p className="whitespace-pre-wrap text-[13px] leading-[1.6] text-fog-100">
          {answer.answer.trim()}
        </p>

        {result.sections ? <ComputedSections sections={result.sections} /> : null}

        {answer.caveats.length ? (
          <div className="mt-3.5 rounded-lg border border-amber-400/20 bg-amber-500/[0.05] p-3">
            <div className="mb-1 flex items-center gap-1.5 text-[11.5px] text-amber-200">
              <AlertTriangle className="h-3 w-3" strokeWidth={1.9} /> Could not verify
            </div>
            <ul className="space-y-1 text-[12.5px] text-fog-300">
              {answer.caveats.map((c, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-fog-500">·</span> {c}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {answer.recommendedActions.length ? (
        <div className={cn("glass rounded-xl border border-white/[0.08]", pad)}>
          <span className="eyebrow">Recommended</span>
          <ul className="mt-2 space-y-1.5">
            {answer.recommendedActions.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-[12.5px] text-fog-200">
                <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-violet-soft" strokeWidth={1.9} />
                <span>
                  <span className="mono text-[11.5px] text-violet-soft">{a.kind}</span> {a.detail}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {answer.proposedManualUpdate ? (
        <div className={cn("glass rounded-xl border border-violet-soft/25", pad)}>
          <div className="mb-1.5 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-violet-soft" strokeWidth={1.7} />
            <span className="eyebrow">Proposed VIBESTRATE.md update</span>
            <span className="text-[10.5px] text-fog-500">(proposal - not applied)</span>
          </div>
          <p className="text-[12px] text-fog-400">{answer.proposedManualUpdate.rationale}</p>
          <p className="mt-0.5 text-[11.5px] text-fog-500">evidence: {answer.proposedManualUpdate.evidence}</p>
          <pre className="mt-2 overflow-x-auto rounded-md border border-white/10 bg-ink-200/60 p-3 text-[12px] text-fog-200 whitespace-pre-wrap">
            {answer.proposedManualUpdate.suggestedText.trim()}
          </pre>
          {result.proposalId ? (
            proposalState === "applied" ? (
              <p className="mt-3 text-[12px] text-emerald-300">
                Applied to VIBESTRATE.md - review the diff before committing.
              </p>
            ) : proposalState === "rejected" ? (
              <p className="mt-3 text-[12px] text-fog-500">Dismissed.</p>
            ) : (
              <div className="mt-3 flex justify-end gap-2">
                <Button size="sm" variant="ghost" disabled={proposalState === "busy"} onClick={() => onDecideProposal("reject")}>
                  Dismiss
                </Button>
                <Button size="sm" variant="primary" disabled={proposalState === "busy"} onClick={() => onDecideProposal("apply")}>
                  {proposalState === "busy" ? "Applying…" : "Apply to VIBESTRATE.md"}
                </Button>
              </div>
            )
          ) : null}
        </div>
      ) : null}

      <p className="text-[11px] text-fog-500">
        Grounded in: {(answer.usedContext.length ? answer.usedContext : result.usedSources).join(", ") || "no project context"}
        {" · answered by "}
        {result.providerId}
        {result.model ? `/${result.model}` : ""}
        {result.effort ? ` · effort ${result.effort}` : ""}
        {result.profileId && result.profileId !== "(ad-hoc)" ? ` · ${result.profileId}` : ""}
      </p>
      {result.notes.length ? (
        <ul className="space-y-0.5 text-[11px] text-fog-600">
          {result.notes.map((n, i) => (
            <li key={i}>! {n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Deterministic, code-computed project-state sections (T10) - rendered verbatim
 *  next to the model's narration so "what's open / next" is the same for the
 *  same project state, not whatever the model volunteered. */
export function ComputedSections({ sections }: { sections: ConsultSections }) {
  const groups: { title: string; items: ConsultSectionItem[] }[] = [
    { title: "Recent activity", items: sections.recentActivity },
    { title: "Open intents", items: sections.openIntents },
    { title: "Mentioned, never worked on", items: sections.mentionedNeverWorked },
    { title: "Suggested next steps", items: sections.suggestedNextSteps },
  ].filter((g) => g.items.length > 0);
  const housekeeping = sections.housekeeping ?? [];
  if (groups.length === 0 && housekeeping.length === 0) return null;
  return (
    <div className="mt-3.5 rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="mb-2 text-[11px] uppercase tracking-[0.12em] text-fog-500">Project state · computed</div>
      {groups.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.map((g) => (
            <div key={g.title}>
              <div className="mb-1 text-[12px] font-medium text-fog-200">{g.title}</div>
              <ul className="space-y-1 text-[12.5px] text-fog-200">
                {g.items.slice(0, 6).map((it, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span className="mt-[1px] text-fog-500">·</span>
                    {it.ref ? (
                      <a
                        href={refHref(it.ref)}
                        title={`Open this ${it.ref.kind}`}
                        className="text-fog-100 underline decoration-white/20 underline-offset-2 hover:text-violet-soft hover:decoration-violet-soft/60"
                      >
                        {it.text}
                      </a>
                    ) : (
                      <span className="text-fog-200">{it.text}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
      {housekeeping.length > 0 ? (
        <div className={groups.length > 0 ? "mt-3 border-t border-white/[0.06] pt-2.5" : ""}>
          <div className="mb-1 text-[12px] font-medium text-amber-300/90">Housekeeping</div>
          <ul className="space-y-1 text-[12.5px] text-fog-300">
            {housekeeping.map((tip, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="text-amber-300/70">·</span>
                <span className="leading-snug">{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

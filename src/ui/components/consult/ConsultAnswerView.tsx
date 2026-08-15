import { AlertTriangle, ArrowRight, FileText } from "lucide-react";
import type {
  ConsultResult,
  ConsultSections,
  ConsultSectionItem,
  ConsultRef,
} from "../../lib/types.js";
import { Button } from "../design/Button.js";
import { cn } from "../design/cn.js";
import { ShowMeHow } from "./ShowMeHow.js";

/** Hash route a computed item opens: run -> run detail, task -> board card. */
function refHref(ref: ConsultRef): string {
  return ref.kind === "run" ? `#/runs/${ref.id}` : `#/tasks/${ref.id}`;
}

/**
 * Confidence used to be a tinted chip next to the "Answer" heading, whose only
 * job was to name a state. It is folded into the verification block instead, so
 * how much of the answer was inferred is read where the unverified parts are
 * listed. `high` says nothing on its own - the block only appears when there is
 * something to qualify.
 */
const VERIFICATION_TITLE: Record<ConsultResult["answer"]["confidence"], string> = {
  high: "Could not verify",
  medium: "Partly inferred",
  low: "Mostly inferred",
};

const CARD = "rounded-[16px] border border-[color:var(--line)] bg-coal-600";

export type ProposalState = "open" | "applied" | "rejected" | "busy";

/** The full consult answer rendering, shared by the page and the floating dock
 *  so a result reads the same everywhere: narration + computed project state +
 *  caveats + recommended actions + the (never-auto) VIBESTRATE.md proposal. */
export function ConsultAnswerView({
  result,
  proposalState,
  onDecideProposal,
  question,
  compact = false,
}: {
  result: ConsultResult;
  proposalState: ProposalState;
  onDecideProposal: (action: "apply" | "reject") => void;
  /** What was asked, so a walkthrough built from this answer knows the goal.
   *  Optional: the answer alone is enough to build one from. */
  question?: string;
  /** Tighter spacing for the narrow dock panel. */
  compact?: boolean;
}) {
  const answer = result.answer;
  const pad = compact ? "p-3" : "p-4";
  return (
    <div className={cn("space-y-3", compact ? "" : "space-y-4")}>
      <div className={cn(CARD, pad)}>
        <div className="mb-2.5 text-[13.5px] font-semibold text-violet-vivid">Answer</div>
        <p className="whitespace-pre-wrap text-[14.5px] leading-[1.6] text-chalk-100">
          {answer.answer.trim()}
        </p>

        {result.sections ? <ComputedSections sections={result.sections} /> : null}

        {answer.caveats.length || answer.confidence !== "high" ? (
          <div className="mt-3.5 rounded-[12px] border border-amber-soft/40 bg-amber-soft/10 p-3">
            <div className="flex items-center gap-1.5 text-meta text-amber-soft">
              <AlertTriangle className="h-3 w-3" strokeWidth={1.9} aria-hidden />
              {VERIFICATION_TITLE[answer.confidence]}
            </div>
            {answer.caveats.length ? (
              <ul className="mt-1 space-y-1 text-[13.5px] text-chalk-100">
                {answer.caveats.map((c, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span className="text-chalk-400">·</span> {c}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {/* An answer says what to do; this walks it. The sequence is built for
            this question and checked against the real screens before it opens,
            so a question outside the five authored walkthroughs still gets one
            rather than a paragraph. */}
        <ShowMeHow
          className="mt-3.5"
          ask={question ?? ""}
          answer={answer.answer}
          label="Show me how"
        />
      </div>

      {answer.recommendedActions.length ? (
        <div className={cn(CARD, pad)}>
          <span className="text-[13.5px] font-semibold text-violet-vivid">Recommended</span>
          <ul className="mt-2 space-y-1.5">
            {answer.recommendedActions.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-[13.5px] text-chalk-100">
                <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-violet-soft" strokeWidth={1.9} />
                <span>
                  <span className="mono text-meta text-violet-soft">{a.kind}</span> {a.detail}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {answer.proposedManualUpdate ? (
        <div className={cn(CARD, pad)}>
          <div className="mb-1.5 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-violet-soft" strokeWidth={1.7} />
            <span className="text-[13.5px] font-semibold text-violet-vivid">Proposed VIBESTRATE.md update</span>
            <span className="text-meta text-chalk-400">(proposal - not applied)</span>
          </div>
          <p className="text-[12px] text-chalk-400">{answer.proposedManualUpdate.rationale}</p>
          <p className="mt-0.5 text-meta text-chalk-400">evidence: {answer.proposedManualUpdate.evidence}</p>
          <pre className="mt-2 overflow-x-auto rounded-[10px] border border-[color:var(--line)] bg-coal-800 p-3 text-[12px] text-chalk-200 whitespace-pre-wrap">
            {answer.proposedManualUpdate.suggestedText.trim()}
          </pre>
          {result.proposalId ? (
            proposalState === "applied" ? (
              <p className="mt-3 text-[12px] text-emerald">
                Applied to VIBESTRATE.md - review the diff before committing.
              </p>
            ) : proposalState === "rejected" ? (
              <p className="mt-3 text-[12px] text-chalk-400">Dismissed.</p>
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

      <p className="text-meta text-chalk-400">
        Grounded in: {(answer.usedContext.length ? answer.usedContext : result.usedSources).join(", ") || "no project context"}
        {" · answered by "}
        {result.providerId}
        {result.model ? `/${result.model}` : ""}
        {result.effort ? ` · effort ${result.effort}` : ""}
        {result.profileId && result.profileId !== "(ad-hoc)" ? ` · ${result.profileId}` : ""}
      </p>
      {result.notes.length ? (
        <ul className="space-y-0.5 text-meta text-chalk-400">
          {result.notes.map((n, i) => (
            <li key={i}>! {n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Deterministic, code-computed project-state sections - rendered verbatim
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
    <div className="mt-3.5 rounded-[12px] border border-[color:var(--line)] bg-coal-500 p-3">
      <div className="mb-2 text-meta font-semibold text-violet-vivid">Project state · computed</div>
      {groups.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.map((g) => (
            <div key={g.title}>
              <div className="mb-1 text-[12px] font-semibold text-chalk-100">{g.title}</div>
              <ul className="space-y-1 text-[13.5px] text-chalk-100">
                {g.items.slice(0, 6).map((it, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span className="mt-[1px] text-chalk-400">·</span>
                    {it.ref ? (
                      <a
                        href={refHref(it.ref)}
                        title={`Open this ${it.ref.kind}`}
                        className="text-chalk-100 underline decoration-[color:var(--line-strong)] underline-offset-2 hover:text-violet-soft hover:decoration-violet-soft/60"
                      >
                        {it.text}
                      </a>
                    ) : (
                      <span className="text-chalk-200">{it.text}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
      {housekeeping.length > 0 ? (
        <div className={groups.length > 0 ? "mt-3 border-t border-[color:var(--line-soft)] pt-2.5" : ""}>
          <div className="mb-1 text-[12px] font-semibold text-amber-soft">Housekeeping</div>
          <ul className="space-y-1 text-[13.5px] text-chalk-100">
            {housekeeping.map((tip, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="text-amber-soft/70">·</span>
                <span className="leading-snug">{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

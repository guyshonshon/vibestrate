import { useState } from "react";
import { ChevronDown, ChevronRight, ShieldCheck } from "lucide-react";
import { Chip } from "../design/Chip.js";
import { relTime } from "../design/format.js";
import type {
  EngagementEntry,
  RunAssurance,
  WorkflowSelectionView,
} from "../../lib/types.js";

// ── Supervisor panel (P9b) ───────────────────────────────────────────────────
// Top of the run hierarchy: WHO is supervising (persona + review
// independence), WHAT it decided about this task (flow selection / upgrade
// story), the live decision feed (judgment vs enforced vs structural moments,
// derived from the event log), and the arbitration verdict when the flow ran
// one. Approvals render inside this section (the page passes the banner as
// children) - approving/rejecting is supervisor business.

/** Loose view of arbitration.json - the panel only reads the headline. */
export type ArbitrationView = {
  findings?: { finding?: { severity?: string } }[];
  decision?: {
    output?: {
      recommendation?: string;
      summary?: string;
      residualRisks?: string[];
      requiredHumanActions?: string[];
      disagreementFindingIds?: string[];
    };
  } | null;
} | null;

/** Flat tinted fill for a decision-feed class tag (not a pill). */
const CLS_TAG: Record<string, string> = {
  judgment: "bg-violet-soft/12 text-violet-soft",
  enforced: "bg-amber-soft/12 text-amber-soft",
  structural: "bg-coal-500 text-chalk-300",
};

const TONE_TEXT: Record<string, string> = {
  ok: "text-emerald-400",
  warn: "text-amber-soft",
  bad: "text-rose-300",
  info: "text-chalk-300",
};

function flowStory(sel: WorkflowSelectionView): string {
  const reason = sel.reasons[0] ?? null;
  switch (sel.source) {
    case "supervisor-upgraded": {
      const up = sel.personaUpgrade;
      return up
        ? `upgraded ${up.from} to ${up.to} - matched ${up.signals.map((s) => `"${s}"`).join(", ")}`
        : `upgraded to ${sel.flowId} on risk signals`;
    }
    case "sized":
      return `sized this task to ${sel.flowId}${reason ? ` - ${reason}` : ""}`;
    case "spec-up":
      return `routed this brief into spec-up first${reason ? ` - ${reason}` : ""}`;
    case "selected":
      return `chose ${sel.flowId} (${sel.confidence} confidence)${reason ? ` - ${reason}` : ""}`;
    case "forced":
      return `flow ${sel.flowId} was forced for this run`;
    case "default":
      return `flow ${sel.flowId} is the project default`;
    case "only-flow":
      return `flow ${sel.flowId} is the only flow available`;
    default:
      return `flow ${sel.flowId}`;
  }
}

function selectionStory(sel: WorkflowSelectionView | null): string | null {
  if (!sel) return null;
  // Adaptive spec-up: the brief is under-specified, so it runs spec-up FIRST
  // (a read-only intake -> spec) and the chosen flow then builds from the spec.
  if (sel.needsSpecUp) {
    return `ran spec-up on this brief first, then builds with ${sel.flowId} from the approved spec`;
  }
  return flowStory(sel);
}

export function SupervisorPanel({
  selection,
  assurance,
  engagement,
  arbitration,
  children,
}: {
  selection: WorkflowSelectionView | null;
  assurance: RunAssurance | null;
  engagement: EngagementEntry[];
  arbitration: ArbitrationView;
  /** The pending-approval banner, when the run is waiting on a human. */
  children?: React.ReactNode;
}) {
  const [feedOpen, setFeedOpen] = useState(true);
  const [whyOpen, setWhyOpen] = useState(false);
  const persona =
    selection?.personaId ?? assurance?.supervisor?.persona ?? "staff-engineer";
  const independence = assurance?.supervisor?.independence ?? null;
  const story = selectionStory(selection);
  // The full "Flow & why" is worth expanding only when there's more than the
  // one-line story already carries: extra reasons, recorded risks, a non-default
  // posture, an advisory, or a persona upgrade. Default/forced runs (no real
  // selection reasoning) stay collapsed to the story line.
  const hasWhy =
    !!selection &&
    (selection.reasons.length > 1 ||
      selection.risks.length > 0 ||
      selection.posture !== "normal" ||
      !!selection.advisory ||
      !!selection.personaUpgrade);
  const decision = arbitration?.decision?.output ?? null;
  const findings = arbitration?.findings ?? [];
  const sevCount = (sev: string) =>
    findings.filter((f) => f.finding?.severity === sev).length;
  // Newest first - this is a glanceable feed, not the forensic Events tab.
  const feed = [...engagement].reverse().slice(0, 30);

  return (
    <section
      className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 px-4 py-3"
      data-screen-label="00 Supervisor"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-coal-500/60 text-violet-soft">
          <ShieldCheck className="h-4 w-4" strokeWidth={1.9} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-chalk-400">
            Supervisor
          </div>
          <div className="flex items-baseline gap-2">
            <span className="truncate text-[13px] font-semibold text-chalk-100">{persona}</span>
            {independence ? (
              <span
                className="mono shrink-0 text-[10.5px] text-chalk-400"
                title="Review independence is honest, not a confidence source - single-profile is a same-model self-check that can only lower confidence."
              >
                {independence}
              </span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setFeedOpen((v) => !v)}
          className="flex shrink-0 items-center gap-1 text-[11.5px] text-chalk-400 hover:text-chalk-100"
        >
          {feedOpen ? (
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.9} />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.9} />
          )}
          {engagement.length} decision{engagement.length === 1 ? "" : "s"}
        </button>
      </div>

      {story ? (
        <div className="mt-2 flex items-start gap-2 rounded-[12px] bg-coal-500/40 px-3 py-2">
          <span className="min-w-0 flex-1 text-[12px] leading-snug text-chalk-300">{story}</span>
          {hasWhy ? (
            <button
              type="button"
              onClick={() => setWhyOpen((v) => !v)}
              className="flex shrink-0 items-center gap-1 text-[11px] text-violet-soft hover:text-violet-soft/80"
              aria-expanded={whyOpen}
              title="The full flow-selection reasoning the orchestrator recorded"
            >
              {whyOpen ? (
                <ChevronDown className="h-3 w-3" strokeWidth={1.9} />
              ) : (
                <ChevronRight className="h-3 w-3" strokeWidth={1.9} />
              )}
              why
            </button>
          ) : null}
        </div>
      ) : null}

      {whyOpen && selection && hasWhy ? (
        <div className="mt-2 rounded-[14px] border border-violet-soft/25 bg-violet-soft/[0.05] px-3 py-2 text-[11.5px]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-chalk-300">
            <span className="mono text-[11px] text-chalk-400">Flow &amp; why</span>
            <span className="mono text-chalk-300">{selection.flowId}</span>
            {selection.crewId ? (
              <span className="mono text-[10.5px] text-chalk-400">crew: {selection.crewId}</span>
            ) : null}
            <span className="text-chalk-400">·</span>
            <span className="text-chalk-400">{selection.source}</span>
            <span className="text-chalk-400">·</span>
            <span className="text-chalk-400">{selection.confidence} confidence</span>
            {selection.posture !== "normal" ? (
              <Chip tone="amber">{selection.posture}</Chip>
            ) : null}
          </div>
          {selection.personaUpgrade ? (
            <p className="mt-1.5 text-amber-soft">
              Upgraded {selection.personaUpgrade.from} → {selection.personaUpgrade.to}
              {selection.personaUpgrade.signals.length > 0
                ? ` (matched ${selection.personaUpgrade.signals.map((s) => `"${s}"`).join(", ")})`
                : ""}
            </p>
          ) : null}
          {selection.reasons.length > 0 ? (
            <ul className="mt-1.5 space-y-0.5">
              {selection.reasons.map((r, i) => (
                <li key={i} className="flex gap-1.5 text-chalk-300">
                  <span className="text-violet-soft">•</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {selection.risks.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[10.5px] text-chalk-400">risks:</span>
              {selection.risks.map((r, i) => (
                <Chip key={i} tone="amber">
                  {r}
                </Chip>
              ))}
            </div>
          ) : null}
          {selection.advisory ? (
            <p className="mt-1.5 text-chalk-400">{selection.advisory}</p>
          ) : null}
        </div>
      ) : null}

      {decision ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[12px] bg-coal-500/40 px-3 py-2 text-[12px]">
          <Chip tone={decision.recommendation === "merge-ready" ? "emerald" : "amber"}>
            arbitration: {decision.recommendation ?? "needs-human"}
          </Chip>
          <span className="mono text-[10.5px] text-chalk-400">
            {findings.length} finding{findings.length === 1 ? "" : "s"}
            {findings.length > 0
              ? ` (${sevCount("high")}H/${sevCount("medium")}M/${sevCount("low")}L)`
              : ""}
            {(decision.disagreementFindingIds?.length ?? 0) > 0
              ? ` · ${decision.disagreementFindingIds!.length} disagreement(s)`
              : ""}
          </span>
          {decision.requiredHumanActions?.length ? (
            <span className="text-amber-soft">
              needs you: {decision.requiredHumanActions.join("; ")}
            </span>
          ) : null}
        </div>
      ) : null}

      {children}

      {feedOpen && feed.length > 0 ? (
        <ul className="mt-2.5 space-y-1.5 border-t border-[color:var(--line-soft)] pt-2.5">
          {feed.map((e) => (
            <li
              key={e.seq}
              className="flex items-start gap-2.5 rounded-[10px] bg-coal-500/40 px-3 py-2"
            >
              <span
                className={`mt-px shrink-0 rounded-[6px] px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.06em] ${CLS_TAG[e.cls] ?? CLS_TAG.structural}`}
              >
                {e.cls}
              </span>
              <div className="min-w-0 flex-1">
                <div className={`text-[12px] font-medium ${TONE_TEXT[e.tone] ?? "text-chalk-100"}`}>
                  {e.title}
                </div>
                {e.detail ? (
                  <div className="mt-0.5 text-[11px] text-chalk-400">{e.detail}</div>
                ) : null}
              </div>
              <span className="mt-px ml-auto shrink-0 mono text-[10px] text-chalk-400">
                {relTime(e.timestamp)}
              </span>
            </li>
          ))}
        </ul>
      ) : feedOpen && engagement.length === 0 ? (
        <p className="mt-2 text-[11.5px] text-chalk-400">
          No supervisor decisions recorded yet - they appear here the moment
          the orchestrator selects, gates, or judges something.
        </p>
      ) : null}
    </section>
  );
}

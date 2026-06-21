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

const CLS_TONE: Record<string, "violet" | "amber" | "neutral"> = {
  judgment: "violet",
  enforced: "amber",
  structural: "neutral",
};

const TONE_TEXT: Record<string, string> = {
  ok: "text-emerald-300/90",
  warn: "text-amber-300",
  bad: "text-rose-300",
  info: "text-fog-200",
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
  // Adaptive spec-up (P1): the brief is under-specified, so it runs spec-up FIRST
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
      className="rounded-xl border border-white/[0.08] surface-ink-100-55 px-4 py-3"
      data-screen-label="00 Supervisor"
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <ShieldCheck className="h-4 w-4 text-violet-soft" strokeWidth={1.7} />
        <span className="eyebrow">Supervisor</span>
        <span className="text-[12.5px] font-medium text-fog-100">{persona}</span>
        {independence ? (
          <span
            className="mono text-[10.5px] text-fog-500"
            title="Review independence is honest, not a confidence source - single-profile is a same-model self-check that can only lower confidence."
          >
            {independence}
          </span>
        ) : null}
        {story ? (
          <span className="text-[12px] text-fog-300 truncate min-w-0">
            {story}
          </span>
        ) : null}
        {hasWhy ? (
          <button
            type="button"
            onClick={() => setWhyOpen((v) => !v)}
            className="flex shrink-0 items-center gap-1 text-[11px] text-violet-soft hover:text-fog-200"
            aria-expanded={whyOpen}
            title="The full flow-selection reasoning the orchestrator recorded"
          >
            {whyOpen ? (
              <ChevronDown className="h-3 w-3" strokeWidth={1.7} />
            ) : (
              <ChevronRight className="h-3 w-3" strokeWidth={1.7} />
            )}
            why
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setFeedOpen((v) => !v)}
          className="ml-auto flex shrink-0 items-center gap-1 text-[11.5px] text-fog-400 hover:text-fog-200"
        >
          {feedOpen ? (
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.7} />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.7} />
          )}
          {engagement.length} decision{engagement.length === 1 ? "" : "s"}
        </button>
      </div>

      {whyOpen && selection && hasWhy ? (
        <div className="mt-2 rounded-lg border border-violet-soft/25 bg-violet-soft/[0.05] px-3 py-2 text-[11.5px]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-fog-300">
            <span className="eyebrow text-violet-soft">Flow &amp; why</span>
            <span className="mono text-fog-200">{selection.flowId}</span>
            {selection.crewId ? (
              <span className="mono text-[10.5px] text-fog-500">crew: {selection.crewId}</span>
            ) : null}
            <span className="text-fog-500">·</span>
            <span className="text-fog-400">{selection.source}</span>
            <span className="text-fog-500">·</span>
            <span className="text-fog-400">{selection.confidence} confidence</span>
            {selection.posture !== "normal" ? (
              <Chip tone="amber">{selection.posture}</Chip>
            ) : null}
          </div>
          {selection.personaUpgrade ? (
            <p className="mt-1.5 text-amber-300/90">
              Upgraded {selection.personaUpgrade.from} → {selection.personaUpgrade.to}
              {selection.personaUpgrade.signals.length > 0
                ? ` (matched ${selection.personaUpgrade.signals.map((s) => `"${s}"`).join(", ")})`
                : ""}
            </p>
          ) : null}
          {selection.reasons.length > 0 ? (
            <ul className="mt-1.5 space-y-0.5">
              {selection.reasons.map((r, i) => (
                <li key={i} className="flex gap-1.5 text-fog-300">
                  <span className="text-violet-soft">•</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {selection.risks.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[10.5px] text-fog-500">risks:</span>
              {selection.risks.map((r, i) => (
                <Chip key={i} tone="amber">
                  {r}
                </Chip>
              ))}
            </div>
          ) : null}
          {selection.advisory ? (
            <p className="mt-1.5 text-fog-400">{selection.advisory}</p>
          ) : null}
        </div>
      ) : null}

      {decision ? (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px]">
          <Chip tone={decision.recommendation === "merge-ready" ? "emerald" : "amber"}>
            arbitration: {decision.recommendation ?? "needs-human"}
          </Chip>
          <span className="mono text-[10.5px] text-fog-400">
            {findings.length} finding{findings.length === 1 ? "" : "s"}
            {findings.length > 0
              ? ` (${sevCount("high")}H/${sevCount("medium")}M/${sevCount("low")}L)`
              : ""}
            {(decision.disagreementFindingIds?.length ?? 0) > 0
              ? ` · ${decision.disagreementFindingIds!.length} disagreement(s)`
              : ""}
          </span>
          {decision.requiredHumanActions?.length ? (
            <span className="text-amber-300/90">
              needs you: {decision.requiredHumanActions.join("; ")}
            </span>
          ) : null}
        </div>
      ) : null}

      {children}

      {feedOpen && feed.length > 0 ? (
        <ul className="mt-2.5 space-y-1 border-t border-white/[0.05] pt-2">
          {feed.map((e) => (
            <li key={e.seq} className="flex items-baseline gap-2 text-[11.5px]">
              <Chip tone={CLS_TONE[e.cls] ?? "neutral"}>{e.cls}</Chip>
              <span className={`truncate ${TONE_TEXT[e.tone] ?? "text-fog-200"}`}>
                {e.title}
              </span>
              {e.detail ? (
                <span className="truncate text-fog-500">{e.detail}</span>
              ) : null}
              <span className="ml-auto shrink-0 mono text-[10px] text-fog-500">
                {relTime(e.timestamp)}
              </span>
            </li>
          ))}
        </ul>
      ) : feedOpen && engagement.length === 0 ? (
        <p className="mt-2 text-[11.5px] text-fog-500">
          No supervisor decisions recorded yet - they appear here the moment
          the orchestrator selects, gates, or judges something.
        </p>
      ) : null}
    </section>
  );
}

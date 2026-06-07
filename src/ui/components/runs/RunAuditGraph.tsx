// Run audit as a top-to-bottom hierarchical graph (not a flat list). The run's
// dependency DAG is laid out in longest-path layers (the same `layersOf` the Flow
// graph + CLI + TUI share): the orchestrator roots the top, each step descends
// below the steps it `needs`, steps that ran concurrently sit side by side in one
// layer (a fan-out), and a join (e.g. the arbiter) converges the layer below it.
// Each step node carries its own nested detail - the attempt chain (rate-limit ->
// retry -> fallback -> success) and any spawned sub-agents - so the full hierarchy
// of what happened reads top to bottom. Sourced from /audit.
import type {
  RunAudit,
  AuditStep,
  AuditAttempt,
  AuditAttemptOutcome,
} from "../../lib/types";
import { isGraphSteps, layersOf } from "../workflow/FlowGraph.js";

const OUTCOME: Record<
  AuditAttemptOutcome,
  { icon: string; tone: string; dot: string }
> = {
  success: { icon: "✓", tone: "text-emerald-300", dot: "bg-emerald-400" },
  "rate-limit": { icon: "◷", tone: "text-amber-300", dot: "bg-amber-400" },
  transient: { icon: "↻", tone: "text-amber-300", dot: "bg-amber-400" },
  fallback: { icon: "⇄", tone: "text-cyan-300", dot: "bg-cyan-400" },
  paused: { icon: "‖", tone: "text-cyan-300", dot: "bg-cyan-400" },
  "tolerated-failure": { icon: "⚠", tone: "text-amber-300", dot: "bg-amber-400" },
  failed: { icon: "✕", tone: "text-rose-300", dot: "bg-rose-400" },
};

const STATUS: Record<string, { dot: string; tone: string; border: string }> = {
  passed: { dot: "bg-emerald-400", tone: "text-emerald-300", border: "border-l-emerald-400/50" },
  failed: { dot: "bg-rose-400", tone: "text-rose-300", border: "border-l-rose-400/50" },
  blocked: { dot: "bg-rose-400", tone: "text-rose-300", border: "border-l-rose-400/50" },
  skipped: { dot: "bg-fog-500", tone: "text-fog-400", border: "border-l-fog-500/40" },
  running: { dot: "bg-violet-soft animate-pulse", tone: "text-violet-soft", border: "border-l-violet-soft/50" },
  pending: { dot: "bg-fog-600", tone: "text-fog-500", border: "border-l-fog-600/40" },
};

/** A short centered vertical connector drawn between two layers, with a faint
 *  arrowhead so the top-to-bottom direction reads. */
function Connector() {
  return (
    <div className="flex flex-col items-center" aria-hidden>
      <span className="h-4 w-px bg-white/15" />
      <span className="-mt-[3px] text-[9px] leading-none text-white/25">{"▼"}</span>
    </div>
  );
}

/** A nested vertical mini-stream: one row per item, a dot + connecting line so
 *  the sequence (attempts, sub-agents) reads as its own little timeline. */
function MiniRow({
  dot,
  line,
  children,
}: {
  dot: string;
  line: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-2">
      <div className="relative flex w-2 shrink-0 flex-col items-center pt-[5px]">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ring-2 ring-ink-200 ${dot}`} />
        {line ? <span className="mt-1 w-px flex-1 bg-white/10" /> : null}
      </div>
      <div className="min-w-0 flex-1 pb-1.5">{children}</div>
    </li>
  );
}

function AttemptStream({ attempts }: { attempts: AuditAttempt[] }) {
  return (
    <ul className="mt-2 list-none p-0">
      {attempts.map((a, i) => {
        const o = OUTCOME[a.outcome];
        return (
          <MiniRow key={i} dot={o.dot} line={i < attempts.length - 1}>
            <div className="-mt-[1px] flex flex-wrap items-baseline gap-x-2 text-[11.5px]">
              <span className={o.tone}>
                <span className="mr-1">{o.icon}</span>
                {a.outcome}
              </span>
              {a.detail ? <span className="text-fog-500">{a.detail}</span> : null}
            </div>
          </MiniRow>
        );
      })}
    </ul>
  );
}

function StepNode({ step, compact }: { step: AuditStep; compact: boolean }) {
  const st = STATUS[step.status] ?? {
    dot: "bg-fog-600",
    tone: "text-fog-400",
    border: "border-l-fog-600/40",
  };
  const meta = [
    step.seat ? `${step.seat}${step.provider ? ` → ${step.provider}` : ""}` : step.provider,
    step.model,
    step.durationMs != null ? `${(step.durationMs / 1000).toFixed(1)}s` : null,
    step.costUsd != null ? `$${step.costUsd.toFixed(3)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const hasInside = step.tools.length > 0 || step.subAgents.length > 0;
  return (
    <div
      className={`w-full rounded-lg border border-white/[0.06] border-l-2 ${st.border} bg-ink-200/40 px-3 py-2 ${
        compact ? "min-w-[210px] max-w-[300px] flex-1" : "max-w-md"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${st.dot}`} />
        <span className="text-[13px] font-medium text-fog-100">{step.id}</span>
        <span className="mono text-[10.5px] text-fog-600">{step.kind}</span>
        <span className={`ml-auto text-[11px] ${st.tone}`}>{step.status}</span>
      </div>
      {meta ? <div className="mt-0.5 text-[11px] text-fog-500">{meta}</div> : null}
      {step.decision ? (
        <div className="mt-1 inline-block rounded border border-white/10 px-1.5 py-0.5 text-[10.5px] text-fog-300">
          decision: {step.decision}
        </div>
      ) : null}

      {step.attempts.length > 0 ? <AttemptStream attempts={step.attempts} /> : null}

      {hasInside ? (
        <div className="mt-2 rounded-md border border-white/[0.04] bg-black/20 p-2">
          <div className="eyebrow mb-1 text-[9.5px]">inside the turn</div>
          {step.tools.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1">
              {step.tools.map((t) => (
                <span
                  key={t.name}
                  className="rounded bg-white/5 px-1.5 py-0.5 text-[10.5px] text-fog-300"
                >
                  {t.name}
                  {t.count > 1 ? <span className="text-fog-500">{"×"}{t.count}</span> : null}
                </span>
              ))}
            </div>
          ) : null}
          {step.subAgents.length > 0 ? (
            <ul className="mt-1.5 list-none p-0">
              {step.subAgents.map((sa, i) => (
                <MiniRow key={i} dot="bg-violet-soft" line={i < step.subAgents.length - 1}>
                  <div className="-mt-[1px] text-[11px] text-violet-soft">
                    <span className="mr-1">{"⤷"}</span>
                    sub-agent
                    <span className="ml-1.5 text-fog-400">{sa.description ?? sa.name}</span>
                  </div>
                </MiniRow>
              ))}
            </ul>
          ) : null}
        </div>
      ) : step.internalsOpaque ? (
        <div className="mt-1.5 text-[10.5px] italic text-fog-600">
          inside the turn: opaque (provider internals not exposed)
        </div>
      ) : null}
    </div>
  );
}

/** One topological layer: a single step centered, or a fan-out wave of
 *  concurrent steps drawn side by side inside a dashed "parallel" group. */
function Layer({ steps }: { steps: AuditStep[] }) {
  if (steps.length === 1) {
    return (
      <div className="flex justify-center">
        <StepNode step={steps[0]!} compact={false} />
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-dashed border-white/10 p-2">
      <div className="mb-1.5 text-center text-[10px] uppercase tracking-wide text-fog-500">
        parallel {"×"}{steps.length}
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {steps.map((s) => (
          <StepNode key={s.id} step={s} compact />
        ))}
      </div>
    </div>
  );
}

export function RunAuditGraph({ audit }: { audit: RunAudit }) {
  const layers = isGraphSteps(audit.steps)
    ? layersOf(audit.steps)
    : audit.steps.map((s) => [s]); // linear flow -> a straight vertical chain
  return (
    <section data-screen-label="Run audit">
      <div className="mb-2.5 flex items-baseline justify-between">
        <span className="eyebrow">Run audit {"·"} what happened</span>
        <span className="mono text-[11px] text-fog-400">
          {audit.totals.turns} turns {"·"} {audit.totals.retries} retries {"·"}{" "}
          {audit.totals.fallbacks} fallbacks
          {audit.totals.costUsd != null ? ` · $${audit.totals.costUsd.toFixed(3)}` : ""}
        </span>
      </div>
      <div className="glass overflow-x-auto p-4">
        <div className="flex min-w-fit flex-col items-stretch">
          {/* Root: the orchestrator. The whole DAG descends from it. */}
          <div className="flex justify-center">
            <div className="w-full max-w-md rounded-lg border border-violet-soft/30 bg-violet-soft/[0.06] px-3 py-2">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="h-2 w-2 rounded-full bg-violet-soft" />
                <span className="text-[13px] font-semibold text-fog-100">orchestrator</span>
                <span className="ml-auto text-[11px] text-fog-300">
                  {audit.status.replace(/_/g, " ")}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-fog-500">
                {audit.flow ? (
                  <span>
                    {audit.flow.label}{" "}
                    <span className="text-fog-600">({audit.flow.id})</span>
                  </span>
                ) : null}
                {audit.assuranceVerdict ? (
                  <span className="text-fog-400">
                    {"·"} assurance: {audit.assuranceVerdict.replace(/_/g, " ")}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {layers.map((layerSteps, li) => (
            <div key={li}>
              <Connector />
              <Layer steps={layerSteps} />
            </div>
          ))}

          {audit.control.length > 0 ? (
            <>
              <Connector />
              <div className="flex justify-center">
                <div className="w-full max-w-md rounded-lg border border-white/[0.06] bg-ink-200/40 px-3 py-2">
                  <div className="eyebrow mb-1 text-[9.5px]">control events</div>
                  <ul className="list-none space-y-0.5 p-0 text-[11.5px]">
                    {audit.control.map((c, i) => (
                      <li key={i}>
                        <span className="mono text-cyan-300">{c.type}</span>{" "}
                        <span className="text-fog-400">{c.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}

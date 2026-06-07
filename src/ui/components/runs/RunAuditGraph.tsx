// Run audit as a vertical node-graph (not a flat list). One descending spine
// roots at the orchestrator and flows down through each step's agent node; every
// step branches into its own sub-streams - the attempt chain (rate-limit ->
// retry -> fallback -> success) and any spawned sub-agents - so the hierarchy of
// "what actually happened" reads top to bottom at a glance. Sourced from /audit.
import type {
  RunAudit,
  AuditStep,
  AuditAttempt,
  AuditAttemptOutcome,
} from "../../lib/types";

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

const STATUS: Record<string, { dot: string; tone: string }> = {
  passed: { dot: "bg-emerald-400", tone: "text-emerald-300" },
  failed: { dot: "bg-rose-400", tone: "text-rose-300" },
  blocked: { dot: "bg-rose-400", tone: "text-rose-300" },
  skipped: { dot: "bg-fog-500", tone: "text-fog-400" },
  running: { dot: "bg-violet-soft animate-pulse", tone: "text-violet-soft" },
  pending: { dot: "bg-fog-600", tone: "text-fog-500" },
};

/** One row of a vertical stream: a rail column (dot + connecting line) on the
 *  left, content on the right. The line fills the row's height so consecutive
 *  rows connect dot-to-dot; the last row in a stream omits it. */
function Row({
  dot,
  line,
  ring = "ring-ink-200",
  size = "h-2.5 w-2.5",
  children,
}: {
  dot: string;
  line: boolean;
  ring?: string;
  size?: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <div className="relative flex w-3 shrink-0 flex-col items-center pt-[5px]">
        <span className={`${size} shrink-0 rounded-full ring-2 ${ring} ${dot}`} />
        {line ? <span className="mt-1 w-px flex-1 bg-white/10" /> : null}
      </div>
      <div className="min-w-0 flex-1 pb-3">{children}</div>
    </li>
  );
}

function AttemptStream({ attempts }: { attempts: AuditAttempt[] }) {
  return (
    <ul className="mt-2 list-none p-0">
      {attempts.map((a, i) => {
        const o = OUTCOME[a.outcome];
        return (
          <Row
            key={i}
            dot={o.dot}
            line={i < attempts.length - 1}
            size="h-1.5 w-1.5"
            ring="ring-ink-200"
          >
            <div className="flex flex-wrap items-baseline gap-x-2 text-[11.5px] -mt-[1px]">
              <span className={o.tone}>
                <span className="mr-1">{o.icon}</span>
                {a.outcome}
              </span>
              {a.detail ? (
                <span className="text-fog-500">{a.detail}</span>
              ) : null}
            </div>
          </Row>
        );
      })}
    </ul>
  );
}

function StepNode({ step, last }: { step: AuditStep; last: boolean }) {
  const st = STATUS[step.status] ?? { dot: "bg-fog-600", tone: "text-fog-400" };
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
    <Row dot={st.dot} line={!last}>
      <div className="rounded-lg border border-white/[0.06] bg-ink-200/40 px-3 py-2">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[13px] font-medium text-fog-100">{step.id}</span>
          <span className="mono text-[10.5px] text-fog-600">{step.kind}</span>
          <span className={`ml-auto text-[11px] ${st.tone}`}>{step.status}</span>
        </div>
        {meta ? (
          <div className="mt-0.5 text-[11px] text-fog-500">{meta}</div>
        ) : null}
        {step.needs.length > 0 ? (
          <div className="mt-0.5 text-[10.5px] text-fog-600">
            after {step.needs.join(", ")}
          </div>
        ) : null}
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
                    {t.count > 1 ? (
                      <span className="text-fog-500">{"×"}{t.count}</span>
                    ) : null}
                  </span>
                ))}
              </div>
            ) : null}
            {step.subAgents.length > 0 ? (
              <ul className="mt-1.5 list-none p-0">
                {step.subAgents.map((sa, i) => (
                  <Row
                    key={i}
                    dot="bg-violet-soft"
                    line={i < step.subAgents.length - 1}
                    size="h-1.5 w-1.5"
                    ring="ring-ink-200"
                  >
                    <div className="-mt-[1px] text-[11px] text-violet-soft">
                      <span className="mr-1">{"⤷"}</span>
                      sub-agent
                      <span className="ml-1.5 text-fog-400">
                        {sa.description ?? sa.name}
                      </span>
                    </div>
                  </Row>
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
    </Row>
  );
}

export function RunAuditGraph({ audit }: { audit: RunAudit }) {
  const hasControl = audit.control.length > 0;
  return (
    <section data-screen-label="Run audit">
      <div className="mb-2.5 flex items-baseline justify-between">
        <span className="eyebrow">Run audit {"·"} what happened</span>
        <span className="mono text-[11px] text-fog-400">
          {audit.totals.turns} turns {"·"} {audit.totals.retries} retries{" "}
          {"·"} {audit.totals.fallbacks} fallbacks
          {audit.totals.costUsd != null
            ? ` · $${audit.totals.costUsd.toFixed(3)}`
            : ""}
        </span>
      </div>
      <div className="glass p-4">
        <ul className="m-0 list-none p-0">
          {/* Root: the orchestrator. Everything below descends from it. */}
          <Row dot="bg-violet-soft" line size="h-3 w-3" ring="ring-ink-200">
            <div className="-mt-[2px]">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[13px] font-semibold text-fog-100">
                  orchestrator
                </span>
                <span className="text-[11px] text-fog-400">
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
                    {"·"} assurance:{" "}
                    {audit.assuranceVerdict.replace(/_/g, " ")}
                  </span>
                ) : null}
              </div>
            </div>
          </Row>

          {audit.steps.map((s, i) => (
            <StepNode
              key={s.id}
              step={s}
              last={!hasControl && i === audit.steps.length - 1}
            />
          ))}

          {hasControl
            ? audit.control.map((c, i) => (
                <Row
                  key={`ctl-${i}`}
                  dot="bg-cyan-400"
                  line={i < audit.control.length - 1}
                  size="h-1.5 w-1.5"
                  ring="ring-ink-200"
                >
                  <div className="-mt-[1px] text-[11.5px]">
                    <span className="mono text-cyan-300">{c.type}</span>{" "}
                    <span className="text-fog-400">{c.message}</span>
                  </div>
                </Row>
              ))
            : null}
        </ul>
      </div>
    </section>
  );
}

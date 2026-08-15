import { useMemo } from "react";
import { Bot, ListChecks, MessageSquare, Terminal, Users } from "lucide-react";
import type { EngagementEntry, RunState, RuntimeMetrics } from "../../lib/types.js";
import { LiveOutputPanel } from "./LiveOutputPanel.js";

// The active-run control centre.
//
// The shape is a DEPTH hierarchy, not a panel grid: the run, then the step it is
// on, then the agent working that step, then that agent's own numbers. Each
// level is indented behind a rail, so "which of these facts is about which
// thing" is answerable by looking rather than by reading labels.
//
// Everything here is derived from evidence the run already writes. Where a lane
// has nothing yet it says so; a cockpit that renders an empty box for a thing
// that has not happened teaches you to distrust the whole screen.

function Metric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="min-w-0 rounded-[12px] border border-[color:var(--line-soft)] bg-coal-800 px-3.5 py-2.5">
      <div className="truncate text-[17px] font-bold text-chalk-100">{value}</div>
      <div className="truncate text-meta font-semibold text-violet-soft">{label}</div>
      {sub ? <div className="truncate text-meta text-chalk-300">{sub}</div> : null}
    </div>
  );
}

function money(n: number | null | undefined): string {
  return typeof n === "number" ? `$${n.toFixed(2)}` : "$0.00";
}
function count(n: number | null | undefined): string {
  return typeof n === "number" ? n.toLocaleString() : "-";
}
function mins(ms: number | null | undefined): string {
  if (typeof ms !== "number" || ms <= 0) return "-";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** One level of nesting: a titled band behind a coloured rail. */
function Level({
  icon,
  title,
  meta,
  depth,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  meta?: string;
  depth: 0 | 1 | 2;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginLeft: depth * 18 }} className="relative">
      <div className="absolute bottom-0 left-0 top-0 w-px bg-[color:var(--line-soft)]" />
      <div className="pl-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-violet-soft">{icon}</span>
          <span className="text-[12.5px] font-semibold text-chalk-100">{title}</span>
          {meta ? <span className="text-meta text-chalk-300">{meta}</span> : null}
        </div>
        {children}
      </div>
    </div>
  );
}

export function RunControlCenter({
  runId,
  run,
  metrics,
  engagement,
}: {
  runId: string;
  run: RunState;
  metrics: RuntimeMetrics | null;
  engagement: EngagementEntry[];
}) {
  const steps = run.flow?.steps ?? [];

  /** The step actually being worked. Falls back to the last one that moved, so
   *  a run between steps still shows where it is rather than nothing. */
  const currentStep = useMemo(() => {
    return (
      steps.find((s) => s.status === "running") ??
      [...steps].reverse().find((s) => s.status !== "pending" && s.status !== "skipped") ??
      null
    );
  }, [steps]);

  /** The agent on that step. Role metrics arrive in execution order, so the last
   *  one is the one working now. */
  const activeRole = useMemo(() => {
    const roles = metrics?.roles ?? [];
    if (roles.length === 0) return null;
    return roles[roles.length - 1] ?? null;
  }, [metrics]);

  /** The supervisor's judgments on this step. This is a reconstruction from the
   *  engagement feed, not a captured dialogue - the supervisor and the agent
   *  never literally chat - so it is labelled as decisions, not as messages. */
  const stepExchange = useMemo(() => {
    if (!currentStep) return [];
    return engagement
      .filter((e) => e.stepId === currentStep.id)
      .slice(-8);
  }, [engagement, currentStep]);

  const doneSteps = steps.filter((s) => s.status === "passed").length;
  const checklist = run.checklistProgress ?? null;

  return (
    <section className="rounded-[18px] border border-[color:var(--line)] bg-coal-900 p-4">
      {/* Level 0 - the run as a whole. */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Metric
          label="Spend"
          value={money(metrics?.totalCostUsd)}
          sub={`${count(metrics?.totalProviderCalls)} calls`}
        />
        <Metric label="Elapsed" value={mins(metrics?.totalDurationMs)} />
        <Metric
          label="Steps"
          value={steps.length ? `${doneSteps}/${steps.length}` : "-"}
          sub={currentStep ? currentStep.id : undefined}
        />
        <Metric
          label="Checklist"
          value={checklist ? `${checklist.completed}/${checklist.total}` : "-"}
          sub={checklist ? "items" : "not a checklist run"}
        />
        <Metric
          label="Files"
          value={count(metrics?.filesChanged)}
          sub={`+${count(metrics?.diffInsertions)} / -${count(metrics?.diffDeletions)}`}
        />
        <Metric
          label="Checks"
          value={
            metrics?.validationSummary
              ? `${metrics.validationSummary.passed}/${metrics.validationSummary.total}`
              : "-"
          }
          sub={metrics?.validationSummary ? "passed" : "none yet"}
        />
      </div>

      {/* The crew, as a static fact rather than a level. Who is seated does not
          change while the run works, so nesting it under "what is happening now"
          would imply a liveness it does not have. */}
      {(metrics?.roles?.length ?? 0) > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[12px] border border-[color:var(--line-soft)] bg-coal-800 px-3.5 py-2.5">
          <span className="inline-flex items-center gap-1.5 text-meta font-semibold text-violet-soft">
            <Users className="h-3.5 w-3.5" strokeWidth={2} />
            Crew
          </span>
          {[...new Map((metrics?.roles ?? []).map((r) => [r.roleId, r])).values()].map(
            (r) => (
              <span key={r.roleId} className="text-[12px] text-chalk-200">
                <span className="font-semibold text-chalk-100">{r.roleId}</span>
                {r.model ? <span className="text-chalk-300"> · {r.model}</span> : null}
              </span>
            ),
          )}
        </div>
      ) : null}

      <div className="flex flex-col gap-4">
        {/* Level 1 - the step being worked. */}
        <Level
          depth={0}
          icon={<ListChecks className="h-4 w-4" strokeWidth={2} />}
          title={currentStep ? `Working: ${currentStep.id}` : "No step running"}
          meta={currentStep ? currentStep.kind : undefined}
        >
          {checklist && checklist.total > 0 ? (
            <p className="text-[12.5px] text-chalk-200">
              Item {Math.min(checklist.currentIndex + 1, checklist.total)} of {checklist.total}
              {checklist.completed > 0 ? ` · ${checklist.completed} done` : ""}
            </p>
          ) : (
            <p className="text-[12.5px] text-chalk-300">
              This run works the flow straight through rather than item by item.
            </p>
          )}

          {/* Level 2 - the agent on that step, and its own numbers. */}
          <div className="mt-3">
            <Level
              depth={1}
              icon={<Bot className="h-4 w-4" strokeWidth={2} />}
              title={activeRole ? activeRole.roleId : "No agent has run yet"}
              meta={
                activeRole
                  ? [activeRole.flowSeat, activeRole.model].filter(Boolean).join(" · ")
                  : undefined
              }
            >
              {activeRole ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Metric
                    label="Tokens in"
                    value={count(activeRole.tokenUsage?.input)}
                    sub={activeRole.tokensEstimated ? "estimated" : undefined}
                  />
                  <Metric label="Tokens out" value={count(activeRole.tokenUsage?.output)} />
                  <Metric
                    label="Cost"
                    value={money(activeRole.totalCostUsd)}
                    sub={activeRole.costEstimated ? "estimated" : undefined}
                  />
                  <Metric label="Tool calls" value={count(activeRole.toolCallCount)} />
                </div>
              ) : (
                <p className="text-[12.5px] text-chalk-300">
                  Nothing has been spent on this run yet.
                </p>
              )}

              {/* Level 3 - what the supervisor decided about this step. */}
              <div className="mt-3">
                <Level
                  depth={2}
                  icon={<MessageSquare className="h-4 w-4" strokeWidth={2} />}
                  title="Supervisor on this step"
                >
                  {stepExchange.length === 0 ? (
                    <p className="text-[12.5px] text-chalk-300">
                      The supervisor has not weighed in on this step yet.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {stepExchange.map((e) => (
                        <li
                          key={e.seq}
                          className="rounded-[10px] border border-[color:var(--line-soft)] bg-coal-800 px-3 py-2"
                        >
                          <div className="text-[12px] font-semibold text-chalk-100">
                            {e.title}
                          </div>
                          {e.detail ? (
                            <div className="mt-0.5 text-meta leading-snug text-chalk-300">
                              {e.detail}
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-meta text-chalk-400">
                    Reconstructed from what the run recorded. The supervisor and the agent
                    do not literally talk; these are the decisions it took around this step.
                  </p>
                </Level>
              </div>
            </Level>
          </div>
        </Level>

        {/* Level 1 - the live transcript, a sibling of the step rather than nested
            under the agent: it is the whole run's output stream. */}
        <Level
          depth={0}
          icon={<Terminal className="h-4 w-4" strokeWidth={2} />}
          title="Transcript"
        >
          <div className="h-[280px] overflow-hidden rounded-[12px] border border-[color:var(--line-soft)]">
            <LiveOutputPanel runId={runId} status={run.status} />
          </div>
        </Level>
      </div>
    </section>
  );
}

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  Check,
  Cpu,
  LayoutGrid,
  Layers,
  Lock,
  MessagesSquare,
  Play,
  Sparkles,
  Users,
} from "lucide-react";
import { api } from "../../lib/api.js";
import { navigate } from "../App.js";
import { cn } from "../../components/design/cn.js";
import { RunStatusBadge } from "../../components/runs/RunStatusBadge.js";
import type {
  DiscoveredFlow,
  FlowStepDefinition,
  PersonaSummary,
  ProjectMetadata,
  RunState,
  TaskSuggestion,
} from "../../lib/types.js";

/**
 * Run composition as a task command center (#/compose), product register.
 * Full width: composition on the left (brief, a 4-up flow grid, a strong config
 * panel, crew, Start), a contextual right rail on the right (the selected flow's
 * steps, plus the utilities you reach for to compose efficiently: pick up from
 * the roadmap, ask the orchestrator, recent activity). Component vocabulary is
 * ported 1:1 from the marketing docs: SQUARE corners, flat ink surfaces with a
 * hairline, the `.brand-card` left-accent that turns violet on hover/active,
 * tracked-uppercase labels, Bricolage/Geist/mono. A grain texture over the ground
 * is the one twist; violet is only the active signal, emerald only on Start.
 */
export function RunComposePage() {
  const [meta, setMeta] = useState<ProjectMetadata | null>(null);
  const [flows, setFlows] = useState<DiscoveredFlow[]>([]);
  const [defaultFlow, setDefaultFlow] = useState<string | null>(null);
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  const [suggestions, setSuggestions] = useState<TaskSuggestion[]>([]);

  const [brief, setBrief] = useState("");
  const [flowId, setFlowId] = useState("");
  const [crewId, setCrewId] = useState<string | null>(null);
  const [personaId, setPersonaId] = useState<string | null>(null);
  const [effort, setEffort] = useState<"low" | "medium" | "high" | null>(null);
  const [concise, setConcise] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [unattended, setUnattended] = useState(false);
  const [forceSelect, setForceSelect] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [m, f, p, s] = await Promise.all([
        api.getProjectMetadata().catch(() => null),
        api.listFlows().catch(() => ({ flows: [] as DiscoveredFlow[], defaultFlow: null })),
        api.listPersonas().catch(() => null),
        api.suggestNext().catch(() => [] as TaskSuggestion[]),
      ]);
      if (cancelled) return;
      setMeta(m);
      setFlows(f.flows);
      setDefaultFlow(f.defaultFlow ?? null);
      if (m?.defaultCrew) setCrewId(m.defaultCrew);
      if (p) {
        setPersonas(p.personas);
        setPersonaId((cur) => cur ?? p.defaultPersona);
      }
      setSuggestions(s);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedFlow = useMemo(
    () => flows.find((f) => f.id === flowId) ?? null,
    [flows, flowId],
  );

  async function start(taskId?: string) {
    const typed = brief.trim();
    if (!taskId && !typed) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.spawnRun({
        task:
          typed ||
          (taskId ? suggestions.find((s) => s.taskId === taskId)?.title ?? "" : ""),
        taskId,
        flow: flowId ? { id: flowId } : undefined,
        crewId: crewId ?? undefined,
        persona: personaId ?? undefined,
        effort: effort ?? undefined,
        concise: concise || undefined,
        readOnly: readOnly || undefined,
        unattended: unattended || undefined,
        select: forceSelect || undefined,
      });
      navigate({ kind: "run", runId: r.runId });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  const canStart = brief.trim().length > 0 && !busy;
  const recent = meta?.recentRuns ?? [];

  return (
    <div data-scene className="grain scene-ground min-h-full">
      <div className="mx-auto max-w-[1520px] px-8 py-9">
        {/* Header (twist: wordmark highlight-box) */}
        <header className="flex items-end justify-between gap-4 border-b border-[color:var(--line)] pb-5">
          <div className="min-w-0">
            <h1 className="font-display text-[30px] font-semibold leading-none tracking-[-0.03em] text-fog-100">
              New{" "}
              <span className="hl-box font-wordmark text-[26px]">run</span>
            </h1>
            <p className="mt-3 max-w-[62ch] text-[13px] leading-[1.55] text-fog-300">
              Describe the change, or pick something up from your roadmap. Choose
              the flow and crew; the run plans, builds, reviews, and verifies, then
              stops before anything ships.
            </p>
          </div>
          <span className="hidden whitespace-nowrap font-mono text-[11px] text-fog-500 sm:block">
            vibe&nbsp;run
          </span>
        </header>

        <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* ── Main composition ─────────────────────────────────────────── */}
          <div className="flex flex-col gap-7 lg:col-span-8">
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="Add structured logging to the settings save handler"
              className="slab min-h-[120px] w-full resize-y px-4 py-3.5 text-[15px] leading-[1.6] text-fog-100 outline-none placeholder:text-fog-500 focus:border-violet-soft/45"
             
            />

            {/* Flow - 4-up boxes in a container */}
            <section>
              <SectionLabel icon={<Layers className="h-3 w-3" strokeWidth={1.8} />}>
                Flow
              </SectionLabel>
              <div className="slab-flat p-3">
                {flows.length === 0 ? (
                  <div className="px-1 py-2 text-[12.5px] text-fog-400">
                    No flows discovered.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
                    {flows.map((f) => {
                      const steps = f.definition.steps ?? [];
                      const seats = Object.keys(f.definition.seats ?? {}).length;
                      const on = f.id === flowId;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setFlowId(on ? "" : f.id)}
                          className={cn(
                            "brand-card flex flex-col gap-2 px-3 py-3 text-left",
                            on && "is-active",
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <StepPips steps={steps} active={on} />
                            {on ? (
                              <Check className="h-3.5 w-3.5 text-violet-soft" strokeWidth={2.2} />
                            ) : f.id === defaultFlow ? (
                              <span className=" border border-[color:var(--line)] px-1 py-px text-[9px] uppercase tracking-wide text-fog-500">
                                default
                              </span>
                            ) : null}
                          </div>
                          <div className="font-display text-[13px] font-medium leading-tight text-fog-100">
                            {f.definition.label}
                          </div>
                          <div className="font-mono text-[10px] text-fog-500">
                            {steps.length} steps · {seats} seats
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            {/* Configuration - a strong, present panel */}
            <section>
              <SectionLabel>Configuration</SectionLabel>
              <div className="slab p-4">
                <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
                  <ConfigGroup label="Run mode">
                    <Toggle on={readOnly} onClick={() => setReadOnly((x) => !x)} label="Read-only" icon={<Lock className="h-3 w-3" strokeWidth={1.8} />} />
                    <Toggle on={unattended} onClick={() => setUnattended((x) => !x)} label="Unattended" />
                  </ConfigGroup>
                  <ConfigGroup label="Tuning">
                    <label className="flex h-8 items-center gap-1.5 border border-[color:var(--line)] px-2.5 text-[11.5px] text-fog-300">
                      <Cpu className="h-3 w-3 text-fog-500" strokeWidth={1.8} /> Effort
                      <select
                        value={effort ?? ""}
                        onChange={(e) =>
                          setEffort((e.target.value || null) as "low" | "medium" | "high" | null)
                        }
                        className="bg-transparent font-mono text-fog-100 outline-none"
                      >
                        <option value="" className="bg-ink-200">auto</option>
                        <option value="low" className="bg-ink-200">low</option>
                        <option value="medium" className="bg-ink-200">medium</option>
                        <option value="high" className="bg-ink-200">high</option>
                      </select>
                    </label>
                    <Toggle on={concise} onClick={() => setConcise((x) => !x)} label="Concise" />
                    <Toggle on={forceSelect} onClick={() => setForceSelect((x) => !x)} label="Auto-pick flow" />
                  </ConfigGroup>
                  <ConfigGroup label="Crew">
                    {(meta?.crews ?? []).map((c) => {
                      const on = c.id === crewId;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setCrewId(c.id)}
                          className={cn(
                            " border px-3 py-1.5 text-[12px] transition",
                            on
                              ? "border-violet-soft/45 bg-violet-mid/[0.12] text-fog-100"
                              : "border-[color:var(--line)] text-fog-300 hover:text-fog-100",
                          )}
                        >
                          {c.label}
                        </button>
                      );
                    })}
                  </ConfigGroup>
                  {personas.length > 0 ? (
                    <ConfigGroup label="Supervisor">
                      <select
                        value={personaId ?? ""}
                        onChange={(e) => setPersonaId(e.target.value || null)}
                        className="h-8 max-w-[200px] border border-[color:var(--line)] bg-transparent px-2.5 text-[12px] text-fog-100 outline-none"
                      >
                        {personas.map((p) => (
                          <option key={p.id} value={p.id} className="bg-ink-200">
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </ConfigGroup>
                  ) : null}
                </div>
              </div>
            </section>

            {/* Start */}
            <div className="flex items-center gap-4 border-t border-[color:var(--line)] pt-6">
              <button
                type="button"
                disabled={!canStart}
                onClick={() => start()}
                className={cn(
                  "inline-flex items-center gap-2 px-5 py-2.5 text-[13.5px] font-medium transition",
                  canStart
                    ? "bg-emerald text-ink-0 hover:bg-emerald-mid"
                    : "cursor-not-allowed border border-[color:var(--line)] text-fog-500",
                )}
              >
                <Play className="h-3.5 w-3.5" strokeWidth={2.2} />
                {busy ? "Starting…" : "Start run"}
              </button>
              <span className="text-[11.5px] text-fog-400">
                Nothing pushes or merges. The run stops at merge-ready, blocked, or failed.
              </span>
            </div>
            {error ? (
              <div className=" border border-[color:var(--fail)]/40 bg-[color:var(--fail)]/[0.08] px-3 py-2 text-[12px] text-fail">
                {error}
              </div>
            ) : null}
          </div>

          {/* ── Right rail: flow detail + task utilities ─────────────────── */}
          <aside className="flex flex-col gap-4 lg:col-span-4 lg:sticky lg:top-6 lg:self-start">
            <FlowDetail flow={selectedFlow} />

            <RailCard
              title="Pick up from the roadmap"
              icon={<Sparkles className="h-3.5 w-3.5 text-violet-soft" strokeWidth={1.8} />}
              action={{ label: "Board", onClick: () => navigate({ kind: "board" }), icon: <LayoutGrid className="h-3 w-3" strokeWidth={1.8} /> }}
            >
              {suggestions.length === 0 ? (
                <Empty>No open tasks ranked yet. Open the board to add some.</Empty>
              ) : (
                <ul className="flex flex-col">
                  {suggestions.slice(0, 5).map((s) => (
                    <li key={s.taskId}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => start(s.taskId)}
                        className="flex w-full items-center gap-2  px-1.5 py-1.5 text-left transition hover:bg-fog-100/[0.04] disabled:opacity-50"
                      >
                        <ArrowRight className="h-3 w-3 shrink-0 text-fog-500" strokeWidth={1.8} />
                        <span className="flex-1 truncate text-[12.5px] text-fog-100">{s.title}</span>
                        <span className={cn("font-mono text-[10px]", s.ready ? "text-emerald" : "text-warn")}>
                          {s.ready ? "ready" : `${s.openBlockers.length}b`}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </RailCard>

            <RailCard
              title="Ask the orchestrator"
              icon={<MessagesSquare className="h-3.5 w-3.5 text-violet-soft" strokeWidth={1.8} />}
            >
              <p className="px-1.5 text-[12px] leading-[1.5] text-fog-300">
                Not sure what to run? Consult reads your project state - shipped,
                open, decided - and recommends, read-only.
              </p>
              <button
                type="button"
                onClick={() => navigate({ kind: "consult", taskId: null })}
                className="mt-2 flex items-center gap-1.5 px-1.5 text-[12px] text-violet-soft hover:text-violet-soft/80"
              >
                Open consult <ArrowRight className="h-3 w-3" strokeWidth={1.8} />
              </button>
            </RailCard>

            {recent.length > 0 ? (
              <RailCard
                title="Recent runs"
                icon={<Activity className="h-3.5 w-3.5 text-fog-400" strokeWidth={1.8} />}
                action={{ label: "All", onClick: () => navigate({ kind: "runs" }) }}
              >
                <ul className="flex flex-col">
                  {recent.slice(0, 5).map((r: RunState) => (
                    <li key={r.runId}>
                      <button
                        type="button"
                        onClick={() => navigate({ kind: "run", runId: r.runId })}
                        className="flex w-full items-center gap-2  px-1.5 py-1.5 text-left transition hover:bg-fog-100/[0.04]"
                      >
                        <RunStatusBadge status={r.status} compact />
                        <span className="flex-1 truncate text-[12px] text-fog-200">
                          {r.displayName || r.task}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </RailCard>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  );
}

/** The selected flow's content (its step sequence + seats), on the right. */
function FlowDetail({ flow }: { flow: DiscoveredFlow | null }) {
  if (!flow) {
    return (
      <div className="slab-flat p-4">
        <div className="text-[12.5px] text-fog-400">
          Pick a flow to preview its steps - or leave it unpinned and the
          orchestrator chooses for the task.
        </div>
      </div>
    );
  }
  const steps = flow.definition.steps ?? [];
  const seats = Object.keys(flow.definition.seats ?? {});
  return (
    <div className="brand-callout overflow-hidden">
      <div className="border-b border-[color:var(--line)] px-4 py-2.5">
        <div className="font-display text-[14px] font-medium text-fog-100">
          {flow.definition.label}
        </div>
        <div className="mt-0.5 font-mono text-[10.5px] text-fog-400">
          {flow.id} · {steps.length} steps · {seats.length} seats
        </div>
      </div>
      <div className="p-3">
        {flow.definition.description ? (
          <p className="mb-2.5 px-1 text-[11.5px] leading-[1.5] text-fog-300">
            {flow.definition.description}
          </p>
        ) : null}
        <ol className="flex flex-col gap-1">
          {steps.map((s) => (
            <li key={s.id} className="flex items-center gap-2.5  px-1.5 py-1">
              <StepKindDot kind={s.kind} />
              <span className="flex-1 truncate text-[12px] text-fog-200">{s.label}</span>
              {s.seat ? (
                <span className="font-mono text-[10px] text-fog-500">{s.seat}</span>
              ) : (
                <span className="font-mono text-[10px] text-fog-600">{s.kind}</span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function StepKindDot({ kind }: { kind: string }) {
  const tone =
    kind === "review-turn"
      ? "bg-violet-soft"
      : kind === "validation"
        ? "bg-fog-500"
        : kind === "approval-gate"
          ? "bg-warn"
          : "bg-fog-200";
  return <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone)} aria-hidden />;
}

function RailCard({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  action?: { label: string; onClick: () => void; icon?: React.ReactNode };
  children: React.ReactNode;
}) {
  return (
    <div className="slab-flat overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-[color:var(--line-soft)] px-3 py-2">
        {icon}
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-fog-400">
          {title}
        </span>
        {action ? (
          <button
            type="button"
            onClick={action.onClick}
            className="ml-auto flex items-center gap-1 text-[11px] text-fog-500 hover:text-fog-200"
          >
            {action.icon}
            {action.label}
          </button>
        ) : null}
      </div>
      <div className="p-2">{children}</div>
    </div>
  );
}

function ConfigGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-fog-500">
        {label}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function SectionLabel({
  icon,
  children,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-fog-500">
      {icon}
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-1.5 py-1 text-[11.5px] text-fog-500">{children}</div>;
}

function Toggle({
  on,
  onClick,
  label,
  icon,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 items-center gap-1.5 border px-2.5 text-[11.5px] transition",
        on
          ? "border-violet-soft/45 bg-violet-mid/[0.12] text-fog-100"
          : "border-[color:var(--line)] text-fog-300 hover:text-fog-100",
      )}
    >
      {icon}
      {label}
      <span className={cn("font-mono", on ? "text-violet-soft" : "text-fog-500")}>
        {on ? "on" : "off"}
      </span>
    </button>
  );
}

/** A compact glyph of a flow's shape: one bar per step, tinted by step kind. */
function StepPips({ steps, active }: { steps: FlowStepDefinition[]; active: boolean }) {
  const shown = steps.slice(0, 12);
  const tone = (kind: string): string => {
    if (kind === "review-turn") return active ? "bg-violet-soft" : "bg-fog-300";
    if (kind === "validation") return "bg-fog-500";
    if (kind === "approval-gate") return active ? "bg-violet-soft" : "bg-fog-400";
    return active ? "bg-violet-mid" : "bg-fog-200";
  };
  return (
    <div className="flex h-6 items-end gap-[2px]" aria-hidden>
      {shown.map((s, i) => (
        <span
          key={i}
          className={cn("w-[3px]", tone(s.kind))}
          style={{ height: `${7 + ((i * 5) % 10)}px` }}
        />
      ))}
    </div>
  );
}

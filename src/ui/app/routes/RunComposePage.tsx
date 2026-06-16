import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Cpu, Layers, Lock, Play, Users } from "lucide-react";
import { api } from "../../lib/api.js";
import { navigate } from "../App.js";
import { cn } from "../../components/design/cn.js";
import type {
  DiscoveredFlow,
  FlowStepDefinition,
  PersonaSummary,
  ProjectMetadata,
  TaskSuggestion,
} from "../../lib/types.js";

/**
 * Dedicated run-composition page (#/compose), product register. Brand-continued
 * but RESTRAINED (Linear/Vercel craft, per the marketing PRODUCT.md "quiet
 * everywhere but the hero"): one raised plane for the brief (the page's focal
 * point), a differentiated flow LIST (not an identical card grid), hierarchy via
 * type + space + hairlines, violet only as the active signal, emerald only on
 * Start. No glass, no gradients. Headings in Bricolage, technical bits in mono.
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

  return (
    <div data-scene className="scene-ground min-h-full">
      <div className="mx-auto max-w-[820px] px-6 py-10">
        {/* Title */}
        <div className="flex items-end justify-between gap-4 border-b border-[color:var(--line)] pb-5">
          <div className="min-w-0">
            <h1 className="font-display text-[30px] font-semibold leading-none tracking-[-0.03em] text-fog-100">
              New run
            </h1>
            <p className="mt-2.5 max-w-[58ch] text-[13px] leading-[1.55] text-fog-300">
              Describe the change, or pick something up from your roadmap. Choose
              the flow and crew; the run plans, builds, reviews, and verifies, then
              stops before anything ships.
            </p>
          </div>
          <span className="hidden whitespace-nowrap font-mono text-[11px] text-fog-500 sm:block">
            vibe&nbsp;run
          </span>
        </div>

        {/* Brief - the focal plane */}
        <div className="mt-7">
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="Add structured logging to the settings save handler"
            className="slab min-h-[124px] w-full resize-y px-4 py-3.5 text-[15px] leading-[1.6] text-fog-100 outline-none placeholder:text-fog-500 focus:border-violet-soft/45"
            style={{ boxShadow: "var(--shadow-contact)" }}
          />
        </div>

        {/* Pick up from the roadmap (only when the brief is empty) */}
        {brief.trim() === "" && suggestions.length > 0 ? (
          <div className="mt-3 overflow-hidden rounded-md border border-[color:var(--line)] bg-ink-50">
            <div className="px-4 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-fog-500">
              Pick up from your roadmap
            </div>
            <div className="divide-y divide-[color:var(--line-soft)] border-t border-[color:var(--line-soft)]">
              {suggestions.slice(0, 5).map((s) => (
                <button
                  key={s.taskId}
                  type="button"
                  disabled={busy}
                  onClick={() => start(s.taskId)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-fog-100/[0.03] disabled:opacity-50"
                >
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-fog-500" strokeWidth={1.8} />
                  <span className="flex-1 truncate text-[13px] text-fog-100">{s.title}</span>
                  <span
                    className={cn(
                      "font-mono text-[10.5px]",
                      s.ready ? "text-emerald" : "text-warn",
                    )}
                  >
                    {s.ready ? "ready" : `${s.openBlockers.length} blocked`}
                  </span>
                  <span className="hidden max-w-[200px] truncate text-[11px] text-fog-400 md:block">
                    {s.reason}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Flow - a differentiated list, not a card grid */}
        <SectionLabel icon={<Layers className="h-3 w-3" strokeWidth={1.8} />}>
          Flow
        </SectionLabel>
        <div className="flex flex-col gap-0.5">
          {flows.length === 0 ? (
            <div className="text-[12.5px] text-fog-400">No flows discovered.</div>
          ) : (
            flows.map((f) => {
              const steps = f.definition.steps ?? [];
              const seats = Object.keys(f.definition.seats ?? {}).length;
              const on = f.id === flowId;
              const isDefault = f.id === defaultFlow;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFlowId(on ? "" : f.id)}
                  className={cn(
                    "group flex items-center gap-4 rounded-md border px-3.5 py-3 text-left transition",
                    on
                      ? "border-violet-soft/45 bg-violet-mid/[0.10]"
                      : "border-transparent hover:bg-fog-100/[0.03]",
                  )}
                >
                  <StepPips steps={steps} active={on} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-[14px] font-medium text-fog-100">
                        {f.definition.label}
                      </span>
                      {isDefault ? (
                        <span className="rounded border border-[color:var(--line)] px-1 py-px text-[9.5px] uppercase tracking-wide text-fog-500">
                          default
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 font-mono text-[10.5px] text-fog-500">
                      {f.id} · {steps.length} steps · {seats} seats
                    </div>
                  </div>
                  {on ? (
                    <Check className="h-4 w-4 shrink-0 text-violet-soft" strokeWidth={2} />
                  ) : null}
                </button>
              );
            })
          )}
          <div className="mt-1 text-[10.5px] text-fog-500">
            {selectedFlow
              ? `Pinned: ${selectedFlow.definition.label}.`
              : "No flow pinned - the orchestrator picks for the task."}
          </div>
        </div>

        {/* Crew */}
        {meta && meta.crews.length > 0 ? (
          <>
            <SectionLabel icon={<Users className="h-3 w-3" strokeWidth={1.8} />}>
              Crew
            </SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {meta.crews.map((c) => {
                const on = c.id === crewId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCrewId(c.id)}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-[12.5px] transition",
                      on
                        ? "border-violet-soft/45 bg-violet-mid/[0.10] text-fog-100"
                        : "border-[color:var(--line)] text-fog-300 hover:text-fog-100",
                    )}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </>
        ) : null}

        {/* Configuration - grouped, not a row of clones */}
        <SectionLabel>Configuration</SectionLabel>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-8 items-center gap-1.5 rounded-md border border-[color:var(--line)] px-2.5 text-[11.5px] text-fog-300">
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
          <GroupDivider />
          <Toggle on={concise} onClick={() => setConcise((x) => !x)} label="Concise" />
          <Toggle on={forceSelect} onClick={() => setForceSelect((x) => !x)} label="Auto-pick flow" />
          <GroupDivider />
          <Toggle on={readOnly} onClick={() => setReadOnly((x) => !x)} label="Read-only" icon={<Lock className="h-3 w-3" strokeWidth={1.8} />} />
          <Toggle on={unattended} onClick={() => setUnattended((x) => !x)} label="Unattended" />
          {personas.length > 0 ? (
            <>
              <GroupDivider />
              <label className="flex h-8 items-center gap-1.5 rounded-md border border-[color:var(--line)] px-2.5 text-[11.5px] text-fog-300">
                Supervisor
                <select
                  value={personaId ?? ""}
                  onChange={(e) => setPersonaId(e.target.value || null)}
                  className="max-w-[150px] bg-transparent text-fog-100 outline-none"
                >
                  {personas.map((p) => (
                    <option key={p.id} value={p.id} className="bg-ink-200">
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
        </div>

        {/* Start */}
        <div className="mt-9 flex items-center gap-4 border-t border-[color:var(--line)] pt-6">
          <button
            type="button"
            disabled={!canStart}
            onClick={() => start()}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-[13.5px] font-medium transition",
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
          <div className="mt-3 rounded-md border border-[color:var(--fail)]/40 bg-[color:var(--fail)]/[0.08] px-3 py-2 text-[12px] text-fail">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Quiet section label: a hairline-led header with generous space above. */
function SectionLabel({
  icon,
  children,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2.5 mt-8 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-fog-500">
      {icon}
      {children}
    </div>
  );
}

function GroupDivider() {
  return <span className="mx-0.5 h-5 w-px bg-[color:var(--line)]" aria-hidden />;
}

/** A compact on/off control. Violet only when active (the rare signal). */
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
        "flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11.5px] transition",
        on
          ? "border-violet-soft/45 bg-violet-mid/[0.10] text-fog-100"
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

/** A compact glyph of a flow's shape: one bar per step, tinted by step kind, so
 *  flows are scannable at a glance instead of reading as identical cards. */
function StepPips({ steps, active }: { steps: FlowStepDefinition[]; active: boolean }) {
  const shown = steps.slice(0, 12);
  const tone = (kind: string): string => {
    if (kind === "review-turn") return active ? "bg-violet-soft" : "bg-fog-300";
    if (kind === "validation") return "bg-fog-500";
    if (kind === "approval-gate") return active ? "bg-violet-soft" : "bg-fog-400";
    return active ? "bg-violet-mid" : "bg-fog-200"; // agent/response/summary
  };
  return (
    <div className="flex h-7 w-12 shrink-0 items-end gap-[2px]" aria-hidden>
      {shown.map((s, i) => (
        <span
          key={i}
          className={cn("w-[3px] rounded-sm", tone(s.kind))}
          style={{ height: `${8 + ((i * 5) % 11)}px` }}
        />
      ))}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Cpu, Layers, Lock, Play, Sparkles, Users } from "lucide-react";
import { api } from "../../lib/api.js";
import { navigate } from "../App.js";
import { cn } from "../../components/design/cn.js";
import type {
  DiscoveredFlow,
  PersonaSummary,
  ProjectMetadata,
  TaskSuggestion,
} from "../../lib/types.js";

/**
 * Dedicated run-composition page (Epic C2), built natively in the marketing
 * design language - solid `data-scene` ground + `.slab` surfaces, Bricolage
 * display type, emerald for the single "go" action, mono only for technical
 * bits. No glass. The full control surface (CLI=UI parity) is visible here, and
 * an empty brief proposes starts from the roadmap (the propose interaction).
 *
 * Scoped first cut: brief + flow quick-look + crew + controls + propose + start.
 * Advanced authoring (per-step profiles, seat overrides, presets) stays on the
 * existing composer for now; this page is the new-design home for the common run.
 */
export function RunComposePage() {
  const [meta, setMeta] = useState<ProjectMetadata | null>(null);
  const [flows, setFlows] = useState<DiscoveredFlow[]>([]);
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
        api.listFlows().catch(() => ({ flows: [] as DiscoveredFlow[] })),
        api.listPersonas().catch(() => null),
        api.suggestNext().catch(() => [] as TaskSuggestion[]),
      ]);
      if (cancelled) return;
      setMeta(m);
      setFlows(f.flows);
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
    const task = taskId ? "" : brief.trim();
    if (!taskId && !task) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.spawnRun({
        task: task || (taskId ? suggestions.find((s) => s.taskId === taskId)?.title ?? "" : ""),
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
    <div data-scene className="scene-ground min-h-full overflow-y-auto">
      <div className="mx-auto max-w-[880px] px-6 py-9">
        <header className="mb-5">
          <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em] text-fog-100">
            New run
          </h1>
          <p className="mt-1 text-[13px] text-fog-300">
            Describe the task, or start one from your roadmap. Pick the flow and
            crew; the orchestrator plans, builds, reviews, and verifies.
          </p>
        </header>

        {/* Brief */}
        <div className="slab p-4">
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={3}
            placeholder="e.g. Add structured logging to the settings save handler"
            className="w-full resize-y bg-transparent text-[14px] leading-[1.6] text-fog-100 placeholder:text-fog-500 outline-none"
          />
        </div>

        {/* Propose from roadmap (only when the brief is empty) */}
        {brief.trim() === "" && suggestions.length > 0 ? (
          <div className="mt-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-fog-500">
              <Sparkles className="h-3 w-3 text-violet-soft" strokeWidth={1.8} /> Or start from your roadmap
            </div>
            <div className="flex flex-col gap-1.5">
              {suggestions.slice(0, 5).map((s) => (
                <button
                  key={s.taskId}
                  type="button"
                  disabled={busy}
                  onClick={() => start(s.taskId)}
                  className="slab-flat flex items-center gap-3 px-3 py-2 text-left hover:border-violet-soft/40 disabled:opacity-50"
                >
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-violet-soft" strokeWidth={1.8} />
                  <span className="flex-1 truncate text-[13px] text-fog-100">{s.title}</span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-mono",
                      s.ready ? "text-emerald" : "text-warn",
                    )}
                  >
                    {s.ready ? "ready" : `${s.openBlockers.length} blocked`}
                  </span>
                  <span className="hidden max-w-[220px] truncate text-[11px] text-fog-400 sm:block">
                    {s.reason}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Flow quick-look */}
        <section className="mt-6">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-fog-500">
            <Layers className="h-3 w-3" strokeWidth={1.8} /> Flow
          </div>
          {flows.length === 0 ? (
            <div className="text-[12.5px] text-fog-400">No flows discovered.</div>
          ) : (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {flows.slice(0, 6).map((f) => {
                const steps = f.definition.steps?.length ?? 0;
                const seats = Object.keys(f.definition.seats ?? {}).length;
                const on = f.id === flowId;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFlowId(on ? "" : f.id)}
                    className={cn(
                      "slab-flat px-3 py-2.5 text-left transition",
                      on ? "border-violet-soft/60 ring-1 ring-violet-soft/30" : "hover:border-violet-soft/30",
                    )}
                  >
                    <div className="font-display text-[13.5px] font-medium text-fog-100">
                      {f.definition.label}
                    </div>
                    <div className="mt-0.5 font-mono text-[10.5px] text-fog-400">
                      {steps} steps · {seats} seats
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {selectedFlow ? (
            <div className="mt-1.5 font-mono text-[10.5px] text-fog-500">
              flow: {selectedFlow.id}
            </div>
          ) : (
            <div className="mt-1.5 text-[10.5px] text-fog-500">
              No flow pinned - the orchestrator uses the default.
            </div>
          )}
        </section>

        {/* Crew */}
        {meta && meta.crews.length > 0 ? (
          <section className="mt-5">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-fog-500">
              <Users className="h-3 w-3" strokeWidth={1.8} /> Crew
            </div>
            <div className="flex flex-wrap gap-2">
              {meta.crews.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCrewId(c.id)}
                  className={cn(
                    "slab-flat px-3 py-1.5 text-[12.5px] transition",
                    c.id === crewId ? "border-violet-soft/60 text-fog-100" : "text-fog-300 hover:text-fog-100",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {/* Controls (full CLI=UI parity, always visible) */}
        <section className="mt-5">
          <div className="mb-2 text-[11px] uppercase tracking-[0.12em] text-fog-500">
            Configuration
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="slab-flat flex h-8 items-center gap-1.5 px-2.5 text-[11.5px] text-fog-300">
              <Cpu className="h-3 w-3 text-violet-soft" strokeWidth={1.8} /> Effort
              <select
                value={effort ?? ""}
                onChange={(e) =>
                  setEffort((e.target.value || null) as "low" | "medium" | "high" | null)
                }
                className="bg-transparent text-fog-100 outline-none"
              >
                <option value="" className="bg-ink-200">auto</option>
                <option value="low" className="bg-ink-200">low</option>
                <option value="medium" className="bg-ink-200">medium</option>
                <option value="high" className="bg-ink-200">high</option>
              </select>
            </label>
            <Toggle on={concise} onClick={() => setConcise((x) => !x)} label="Concise" />
            <Toggle on={readOnly} onClick={() => setReadOnly((x) => !x)} label="Read-only" icon={<Lock className="h-3 w-3" strokeWidth={1.8} />} tone="amber" />
            <Toggle on={unattended} onClick={() => setUnattended((x) => !x)} label="Unattended" tone="cyan" />
            <Toggle on={forceSelect} onClick={() => setForceSelect((x) => !x)} label="Auto-pick flow" />
            {personas.length > 0 ? (
              <label className="slab-flat flex h-8 items-center gap-1.5 px-2.5 text-[11.5px] text-fog-300">
                Supervisor
                <select
                  value={personaId ?? ""}
                  onChange={(e) => setPersonaId(e.target.value || null)}
                  className="max-w-[140px] bg-transparent text-fog-100 outline-none"
                >
                  {personas.map((p) => (
                    <option key={p.id} value={p.id} className="bg-ink-200">
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </section>

        {/* Start */}
        <div className="mt-7 flex items-center gap-3">
          <button
            type="button"
            disabled={!canStart}
            onClick={() => start()}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-4 py-2 text-[13px] font-medium transition",
              canStart
                ? "bg-emerald text-ink-0 hover:bg-emerald-mid"
                : "cursor-not-allowed bg-ink-300 text-fog-500",
            )}
          >
            <Play className="h-3.5 w-3.5" strokeWidth={2} />
            {busy ? "Starting…" : "Start run"}
          </button>
          <span className="text-[11.5px] text-fog-500">
            Nothing pushes or merges - the run stops at merge-ready, blocked, or failed.
          </span>
        </div>
        {error ? (
          <div className="mt-3 slab-flat border-fail/40 px-3 py-2 text-[12px] text-fail">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Toggle({
  on,
  onClick,
  label,
  icon,
  tone = "violet",
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
  tone?: "violet" | "amber" | "cyan";
}) {
  const onTone =
    tone === "amber"
      ? "border-amber-400/40 text-amber-300"
      : tone === "cyan"
        ? "border-cyan-400/40 text-cyan-300"
        : "border-violet-soft/50 text-violet-100";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "slab-flat flex h-8 items-center gap-1.5 px-2.5 text-[11.5px] transition",
        on ? onTone : "text-fog-300 hover:text-fog-100",
      )}
    >
      {icon}
      {label} {on ? "on" : "off"}
    </button>
  );
}

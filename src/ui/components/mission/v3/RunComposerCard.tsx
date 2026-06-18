import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Layers,
  LayoutGrid,
  Lock,
  Play,
  Sparkles,
  Users,
} from "lucide-react";
import { api } from "../../../lib/api.js";
import { navigate } from "../../../app/App.js";
import { cn } from "../../design/cn.js";
import { ConfigRow, SectionLabel, StepPips, Toggle } from "./composeKit.js";
import type {
  DiscoveredFlow,
  PersonaSummary,
  ProjectMetadata,
  TaskSuggestion,
} from "../../../lib/types.js";

/**
 * The dashboard's run composer - a self-contained slab card carrying the
 * #/compose "New run" look: card-based Flow + Crew selection and designed
 * Configuration controls, in the flat brand-card vocabulary. Standalone: it
 * fetches its own flows / crews / personas / suggestions and spawns the run
 * itself, so Mission Control no longer feeds it. The full page (#/compose)
 * keeps the extras this card deliberately drops - the steps disclosure, the
 * working-context rail, and the metrics quick-look.
 */
export function RunComposerCard() {
  const [meta, setMeta] = useState<ProjectMetadata | null>(null);
  const [flows, setFlows] = useState<DiscoveredFlow[]>([]);
  const [defaultFlow, setDefaultFlow] = useState<string | null>(null);
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  const [suggestions, setSuggestions] = useState<TaskSuggestion[]>([]);

  const [brief, setBrief] = useState("");
  const [flowId, setFlowId] = useState("");
  const [crewId, setCrewId] = useState<string | null>(null);
  const [personaId, setPersonaId] = useState<string | null>(null);
  const [concise, setConcise] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [unattended, setUnattended] = useState(false);
  const [forceSelect, setForceSelect] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Flow inputs (declared params); required ones gate the run. Prefilled from
  // the durable project profile - a stored answer becomes the field's start
  // value, so a project is filled once and reused. Secrets are never prefilled.
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [paramPrefill, setParamPrefill] = useState<
    Record<string, { value: string; setBy: string; secret: boolean }>
  >({});
  const [generating, setGenerating] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [m, f, p, s] = await Promise.all([
        api.getProjectMetadata().catch(() => null),
        api
          .listFlows()
          .catch(() => ({ flows: [] as DiscoveredFlow[], defaultFlow: null })),
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
  const flowParams = selectedFlow?.definition.params ?? null;

  useEffect(() => {
    setParamValues({});
    setParamPrefill({});
    if (!flowId) return;
    let cancelled = false;
    void api
      .getFlowParams(flowId)
      .then((values) => {
        if (cancelled) return;
        setParamPrefill(values);
        const seed: Record<string, string> = {};
        for (const [name, v] of Object.entries(values)) {
          if (!v.secret && v.value) seed[name] = v.value;
        }
        if (Object.keys(seed).length > 0) setParamValues(seed);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [flowId]);

  function paramFilled(
    name: string,
    def: { required?: boolean; default?: unknown },
  ): boolean {
    const v = paramValues[name];
    if (v !== undefined && v.trim() !== "") return true;
    if (def.default !== undefined) return true;
    const pf = paramPrefill[name];
    return !!pf && (pf.secret || pf.value.length > 0);
  }
  const missingRequired = flowParams
    ? Object.entries(flowParams)
        .filter(([n, d]) => d.required && !paramFilled(n, d))
        .map(([n]) => n)
    : [];

  async function generateParam(name: string) {
    if (!flowId) return;
    setGenerating(name);
    try {
      const { suggestion } = await api.generateParam(flowId, name);
      setParamValues((c) => ({ ...c, [name]: suggestion }));
    } catch {
      // generation is optional - leave the field for manual entry
    } finally {
      setGenerating(null);
    }
  }

  async function start(taskId?: string) {
    const typed = brief.trim();
    if (!taskId && !typed) return;
    setBusy(true);
    setError(null);
    try {
      const params = Object.fromEntries(
        Object.entries(paramValues).filter(([, v]) => v && v.trim() !== ""),
      );
      const r = await api.spawnRun({
        task:
          typed ||
          (taskId
            ? suggestions.find((s) => s.taskId === taskId)?.title ?? ""
            : ""),
        taskId,
        params: Object.keys(params).length > 0 ? params : undefined,
        flow: flowId ? { id: flowId } : undefined,
        crewId: crewId ?? undefined,
        persona: personaId ?? undefined,
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

  const canStart = brief.trim().length > 0 && missingRequired.length === 0 && !busy;
  const crews = meta?.crews ?? [];

  return (
    <div className="slab fade-up overflow-hidden">
      {/* Task: brief + roadmap pickup, one source of intent */}
      <section className="px-5 pt-5 pb-4">
        <SectionLabel>Task</SectionLabel>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void start();
            }
          }}
          placeholder="Add structured logging to the settings save handler"
          className="min-h-[96px] w-full resize-y border border-[color:var(--line)] bg-ink-0 px-4 py-3 text-[15px] leading-[1.6] text-fog-100 outline-none placeholder:text-fog-500 focus:border-violet-soft/45"
        />
        {suggestions.length > 0 ? (
          <div className="mt-2 border border-[color:var(--line)] border-t-0 bg-ink-50">
            <div className="flex items-center gap-1.5 border-b border-[color:var(--line-soft)] px-3 py-1.5">
              <Sparkles className="h-3 w-3 text-violet-soft" strokeWidth={1.8} />
              <span className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-fog-500">
                Or pick up from your roadmap
              </span>
              <button
                type="button"
                onClick={() => navigate({ kind: "board" })}
                className="ml-auto flex items-center gap-1 text-[10.5px] text-fog-500 hover:text-fog-200"
              >
                <LayoutGrid className="h-3 w-3" strokeWidth={1.8} /> Board
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 p-2">
              {suggestions.slice(0, 6).map((s) => (
                <button
                  key={s.taskId}
                  type="button"
                  disabled={busy}
                  onClick={() => void start(s.taskId)}
                  title={s.reason}
                  className="brand-card flex items-center gap-2 px-2.5 py-1.5 disabled:opacity-50"
                >
                  <span className="max-w-[200px] truncate text-[12px] text-fog-100">
                    {s.title}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-[9.5px]",
                      s.ready ? "text-emerald" : "text-warn",
                    )}
                  >
                    {s.ready ? "ready" : `${s.openBlockers.length}b`}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {/* Flow */}
      <section className="border-t border-[color:var(--line-soft)] px-5 py-4">
        <SectionLabel icon={<Layers className="h-3 w-3" strokeWidth={1.8} />}>
          Flow
        </SectionLabel>
        {flows.length === 0 ? (
          <div className="text-[12.5px] text-fog-400">No flows discovered.</div>
        ) : (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
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
                      <span className="border border-[color:var(--line)] px-1 py-px text-[9px] uppercase tracking-wide text-fog-500">
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
      </section>

      {/* Flow inputs - the selected flow's declared params (required ones gate
          the run; they ARE part of the task). */}
      {flowParams && Object.keys(flowParams).length > 0 ? (
        <section className="border-t border-[color:var(--line-soft)] px-5 py-4">
          <SectionLabel icon={<Sparkles className="h-3 w-3" strokeWidth={1.8} />}>
            Inputs
          </SectionLabel>
          <div className="grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2">
            {Object.entries(flowParams).map(([name, def]) => {
              const pf = paramPrefill[name];
              const val =
                paramValues[name] ??
                (def.secret
                  ? ""
                  : pf && !pf.secret
                    ? pf.value
                    : def.default != null
                      ? String(def.default)
                      : "");
              const set = (v: string) =>
                setParamValues((c) => ({ ...c, [name]: v }));
              return (
                <label key={name} className="flex flex-col gap-1">
                  <span className="flex items-center gap-1.5 text-[11.5px] text-fog-200">
                    <span className="font-medium">{name}</span>
                    {def.required ? <span className="text-fail">*</span> : null}
                    {def.shared ? (
                      <span className="text-fog-600" title="Project-global">
                        · shared
                      </span>
                    ) : null}
                    {pf && !def.secret ? (
                      <span
                        className="text-emerald/80"
                        title={`From the project profile (${pf.setBy})`}
                      >
                        · {pf.setBy === "generated" ? "generated" : "saved"}
                      </span>
                    ) : null}
                    {def.description ? (
                      <span className="text-fog-500">· {def.description}</span>
                    ) : null}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {def.type === "boolean" ? (
                      <Toggle
                        on={val === "true"}
                        onClick={() => set(val === "true" ? "false" : "true")}
                        label={name}
                      />
                    ) : def.type === "enum" && def.values?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {def.values.map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => set(opt)}
                            className={cn(
                              "border px-2 py-1 text-[11.5px] transition",
                              val === opt
                                ? "border-violet-soft/45 bg-violet-mid/[0.12] text-fog-100"
                                : "border-[color:var(--line)] text-fog-300 hover:text-fog-100",
                            )}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <input
                        type={
                          def.secret
                            ? "text"
                            : def.type === "number"
                              ? "number"
                              : "text"
                        }
                        value={val}
                        onChange={(e) => set(e.target.value)}
                        placeholder={
                          def.secret
                            ? "env var NAME (e.g. OPENAI_API_KEY)"
                            : def.type
                        }
                        className="min-w-0 flex-1 border border-[color:var(--line)] bg-ink-0 px-2.5 py-1.5 text-[12px] text-fog-100 outline-none placeholder:text-fog-500 focus:border-violet-soft/45"
                      />
                    )}
                    {def.generate && !def.secret ? (
                      <button
                        type="button"
                        disabled={generating === name}
                        onClick={() => void generateParam(name)}
                        title={def.generate.instruction}
                        className="flex shrink-0 items-center gap-1 border border-violet-soft/40 px-2 py-1.5 text-[11px] text-violet-100 transition hover:bg-violet-mid/10 disabled:opacity-50"
                      >
                        <Sparkles className="h-3 w-3" strokeWidth={1.8} />
                        {generating === name ? "…" : "Generate"}
                      </button>
                    ) : null}
                  </div>
                </label>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Crew - card-based selection, like Flow */}
      {crews.length > 0 ? (
        <section className="border-t border-[color:var(--line-soft)] px-5 py-4">
          <SectionLabel icon={<Users className="h-3 w-3" strokeWidth={1.8} />}>
            Crew
          </SectionLabel>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {crews.map((c) => {
              const on = c.id === crewId;
              const profiles = [...new Set(c.roles.map((r) => r.profile))];
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCrewId(c.id)}
                  className={cn(
                    "brand-card flex flex-col gap-1.5 px-3 py-3 text-left",
                    on && "is-active",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display text-[13px] font-medium text-fog-100">
                      {c.label}
                    </span>
                    {on ? (
                      <Check className="h-3.5 w-3.5 text-violet-soft" strokeWidth={2.2} />
                    ) : c.id === meta?.defaultCrew ? (
                      <span className="border border-[color:var(--line)] px-1 py-px text-[9px] uppercase tracking-wide text-fog-500">
                        default
                      </span>
                    ) : null}
                  </div>
                  <div className="font-mono text-[10px] text-fog-500">
                    {c.roles.length} roles · {profiles.slice(0, 3).join(", ")}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {c.roles.slice(0, 4).map((r) => (
                      <span
                        key={r.id}
                        className="border border-[color:var(--line-soft)] px-1 py-px text-[9.5px] text-fog-400"
                      >
                        {r.label}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Configuration - designed controls, no native menus */}
      <section className="border-t border-[color:var(--line-soft)] px-5 py-4">
        <SectionLabel>Configuration</SectionLabel>
        <div className="border border-[color:var(--line-soft)] divide-y divide-[color:var(--line-soft)]">
          <ConfigRow label="Run mode">
            <Toggle
              on={readOnly}
              onClick={() => setReadOnly((x) => !x)}
              label="Read-only"
              icon={<Lock className="h-3 w-3" strokeWidth={1.8} />}
            />
            <Toggle
              on={unattended}
              onClick={() => setUnattended((x) => !x)}
              label="Unattended"
            />
            <div className="w-full pt-1 text-[11px] leading-[1.5] text-fog-400">
              {readOnly || unattended ? (
                <ul className="space-y-1">
                  {readOnly ? (
                    <li className="flex items-start gap-1.5">
                      <Lock
                        className="mt-0.5 h-3 w-3 shrink-0 text-violet-soft"
                        strokeWidth={1.8}
                      />
                      <span>
                        <span className="text-fog-200">
                          Read-only is enforced.
                        </span>{" "}
                        Every role plans and proposes but never writes; the
                        write / validate / verify steps are skipped, and apply,
                        validate, and revert are refused.
                      </span>
                    </li>
                  ) : null}
                  {unattended ? (
                    <li className="flex items-start gap-1.5">
                      <span
                        className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-violet-soft"
                        aria-hidden
                      />
                      <span>
                        <span className="text-fog-200">Unattended.</span> The run
                        never pauses for a human: approval gates auto-resolve
                        after a timeout and a budget or resilience limit ends the
                        run instead of waiting.
                      </span>
                    </li>
                  ) : null}
                </ul>
              ) : (
                <span className="text-fog-500">
                  Default: agents can write inside the run&apos;s worktree and the
                  run pauses for you at approval gates. Nothing is ever pushed or
                  merged.
                </span>
              )}
            </div>
          </ConfigRow>
          <ConfigRow label="Tuning">
            <Toggle
              on={concise}
              onClick={() => setConcise((x) => !x)}
              label="Concise"
            />
            <Toggle
              on={forceSelect}
              onClick={() => setForceSelect((x) => !x)}
              label="Auto-pick flow"
            />
          </ConfigRow>
          {personas.length > 0 ? (
            <ConfigRow label="Supervisor">
              {personas.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPersonaId(p.id)}
                  title={p.description}
                  className={cn(
                    "border px-2.5 py-1.5 text-[11.5px] transition",
                    p.id === personaId
                      ? "border-violet-soft/45 bg-violet-mid/[0.12] text-fog-100"
                      : "border-[color:var(--line)] text-fog-300 hover:text-fog-100",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </ConfigRow>
          ) : null}
        </div>
      </section>

      {/* Start */}
      <div className="flex flex-wrap items-center gap-4 border-t border-[color:var(--line)] px-5 py-4">
        <button
          type="button"
          disabled={!canStart}
          onClick={() => void start()}
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
        {missingRequired.length > 0 ? (
          <span className="text-[11.5px] text-warn">
            Fill required input{missingRequired.length > 1 ? "s" : ""}:{" "}
            {missingRequired.join(", ")}
          </span>
        ) : (
          <span className="text-[11.5px] text-fog-400">
            Nothing pushes or merges. The run stops at merge-ready, blocked, or
            failed.
          </span>
        )}
      </div>
      {error ? (
        <div className="mx-5 mb-5 border border-[color:var(--fail)]/40 bg-[color:var(--fail)]/[0.08] px-3 py-2 text-[12px] text-fail">
          {error}
        </div>
      ) : null}
    </div>
  );
}

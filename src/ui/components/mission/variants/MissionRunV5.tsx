import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Layers,
  LayoutGrid,
  Lock,
  Play,
  ShieldCheck,
  Sparkles,
  Terminal,
  Users,
} from "lucide-react";
import { api } from "../../../lib/api.js";
import { navigate } from "../../../app/App.js";
import { cn } from "../../design/cn.js";
import type {
  DiscoveredFlow,
  FlowStepDefinition,
  PersonaSummary,
  ProjectMetadata,
  TaskSuggestion,
} from "../../../lib/types.js";

/**
 * MissionRunV5 - the "Two-Pane Workspace" redesign of the start-a-run hero.
 *
 * A spacious two-column workspace in the vibestrate.com language: square flat
 * slabs (radius 0), big Bricolage display type, mono meta, emerald = ready/
 * selected, violet = active/primary. The LEFT pane is the composition (task
 * field, Flow + Crew as roomy square cards with emerald fill-on-select,
 * Configuration toggles, Inputs); the RIGHT pane is a calm, sticky "Run
 * summary" that reads back the selections, the readiness line, the live
 * `vibe run` command, and the big violet "Start run" button.
 *
 * The entire data layer is copied verbatim from v3/RunComposerCard.tsx - same
 * api.* calls, same state, same submit (api.spawnRun -> navigate). Only the
 * JSX and the presentational sub-components below are this variant's own.
 */
export function MissionRunV5() {
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

  const canStart =
    brief.trim().length > 0 && missingRequired.length === 0 && !busy;
  const crews = meta?.crews ?? [];

  // ── Derived, presentation-only readback ──────────────────────────────────
  const selectedCrew = crews.find((c) => c.id === crewId) ?? null;
  const selectedPersona = personas.find((p) => p.id === personaId) ?? null;
  const briefEmpty = brief.trim().length === 0;

  // Live `vibe run ...` mirror of the current composition (CLI = TUI = UI),
  // copyable. Same shape as RunComposePage's runCmd.
  const runCmd = useMemo(() => {
    const parts = ["vibe run", JSON.stringify(brief.trim() || "your task")];
    if (flowId) parts.push(`--flow ${flowId}`);
    if (crewId && crewId !== meta?.defaultCrew) parts.push(`--crew ${crewId}`);
    if (readOnly) parts.push("--read-only");
    if (unattended) parts.push("--unattended");
    if (concise) parts.push("--concise");
    if (forceSelect) parts.push("--select");
    if (personaId) parts.push(`--supervisor ${personaId}`);
    return parts.join(" ");
  }, [
    brief,
    flowId,
    crewId,
    readOnly,
    unattended,
    concise,
    forceSelect,
    personaId,
    meta?.defaultCrew,
  ]);
  const [cmdCopied, setCmdCopied] = useState(false);
  async function copyCmd() {
    try {
      await navigator.clipboard.writeText(runCmd);
      setCmdCopied(true);
      window.setTimeout(() => setCmdCopied(false), 1200);
    } catch {
      // clipboard unavailable
    }
  }

  return (
    <div className="fade-up grain relative overflow-hidden border border-[color:var(--line)] bg-ink-0">
      <div className="relative z-10 px-5 py-7 sm:px-8 sm:py-9">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* ── LEFT: composition ──────────────────────────────────────────── */}
        <div className="flex flex-col gap-8 lg:col-span-8">
          {/* Task */}
          <section>
            <PaneTitle>Task</PaneTitle>
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
              className="slab min-h-[128px] w-full resize-y px-5 py-4 text-[16px] leading-[1.6] text-fog-100 outline-none placeholder:text-fog-500 focus:border-violet-soft/45"
            />
            {suggestions.length > 0 ? (
              <div className="mt-3 slab-flat">
                <div className="flex items-center gap-2 border-b border-[color:var(--line-soft)] px-4 py-2.5">
                  <Sparkles
                    className="h-3.5 w-3.5 text-violet-soft"
                    strokeWidth={1.8}
                  />
                  <span className="font-mono text-[12px] text-fog-300">
                    Or pick up from your roadmap
                  </span>
                  <button
                    type="button"
                    onClick={() => navigate({ kind: "board" })}
                    className="ml-auto flex items-center gap-1.5 font-mono text-[12px] text-fog-400 transition hover:text-fog-100"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" strokeWidth={1.8} /> Board
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 p-3">
                  {suggestions.slice(0, 6).map((s) => (
                    <button
                      key={s.taskId}
                      type="button"
                      disabled={busy}
                      onClick={() => void start(s.taskId)}
                      title={s.reason}
                      className="flex items-center gap-2.5 border border-[color:var(--line)] bg-ink-50 px-3.5 py-2 text-left transition hover:border-violet-soft/40 hover:bg-ink-100 disabled:opacity-50"
                    >
                      <span className="max-w-[240px] truncate text-[13.5px] text-fog-100">
                        {s.title}
                      </span>
                      <span
                        className={cn(
                          "font-mono text-[11px]",
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

          {/* Configuration - dense grid sitting with the Task brief, no box. */}
          <section>
            <PaneTitle>Configuration</PaneTitle>
            <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
              <div className="flex flex-col gap-2.5">
                <span className="font-mono text-[12px] text-fog-400">
                  Run mode
                </span>
                <div className="flex flex-wrap gap-2">
                  <BigToggle
                    on={readOnly}
                    onClick={() => setReadOnly((x) => !x)}
                    label="Read-only"
                    icon={<Lock className="h-3.5 w-3.5" strokeWidth={1.8} />}
                  />
                  <BigToggle
                    on={unattended}
                    onClick={() => setUnattended((x) => !x)}
                    label="Unattended"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2.5">
                <span className="font-mono text-[12px] text-fog-400">
                  Tuning
                </span>
                <div className="flex flex-wrap gap-2">
                  <BigToggle
                    on={concise}
                    onClick={() => setConcise((x) => !x)}
                    label="Concise"
                  />
                  <BigToggle
                    on={forceSelect}
                    onClick={() => setForceSelect((x) => !x)}
                    label="Auto-pick flow"
                  />
                </div>
              </div>
              {personas.length > 0 ? (
                <div className="flex flex-col gap-2.5 sm:col-span-2">
                  <span className="font-mono text-[12px] text-fog-400">
                    Supervisor
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {personas.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPersonaId(p.id)}
                        title={p.description}
                        className={cn(
                          "border px-3.5 py-2 text-[13px] transition",
                          p.id === personaId
                            ? "border-violet-soft/50 bg-violet-mid/[0.14] text-fog-100"
                            : "border-[color:var(--line)] text-fog-300 hover:text-fog-100",
                        )}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <p className="text-[12.5px] leading-[1.6] text-fog-300 sm:col-span-2">
                {readOnly || unattended ? (
                  <span className="flex flex-col gap-1.5">
                    {readOnly ? (
                      <span>
                        <span className="text-fog-100">
                          Read-only is enforced.
                        </span>{" "}
                        Every role plans and proposes but never writes; the write
                        / validate / verify steps are skipped, and apply, validate,
                        and revert are refused.
                      </span>
                    ) : null}
                    {unattended ? (
                      <span>
                        <span className="text-fog-100">Unattended.</span> The run
                        never pauses for a human: approval gates auto-resolve after
                        a timeout and a budget or resilience limit ends the run
                        instead of waiting.
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span className="text-fog-300">
                    Default: agents can write inside the run&apos;s worktree and
                    the run pauses for you at approval gates. Nothing is ever
                    pushed or merged.
                  </span>
                )}
              </p>
            </div>
          </section>

          {/* Flow - roomy square cards, emerald fill-on-select */}
          <section>
            <PaneTitle
              icon={<Layers className="h-4 w-4" strokeWidth={1.8} />}
            >
              Flow
            </PaneTitle>
            {flows.length === 0 ? (
              <div className="slab-flat px-5 py-4 text-[14px] text-fog-300">
                No flows discovered.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {flows.map((f) => {
                  const steps = f.definition.steps ?? [];
                  const seats = Object.keys(f.definition.seats ?? {}).length;
                  const on = f.id === flowId;
                  return (
                    <SelectCard
                      key={f.id}
                      on={on}
                      onClick={() => setFlowId(on ? "" : f.id)}
                      title={f.definition.label}
                      meta={`${steps.length} steps · ${seats} seats`}
                      badge={
                        f.id === defaultFlow ? "default" : undefined
                      }
                      pips={<FlowBars steps={steps} on={on} />}
                    />
                  );
                })}
              </div>
            )}
          </section>

          {/* Crew - same roomy card language */}
          {crews.length > 0 ? (
            <section>
              <PaneTitle
                icon={<Users className="h-4 w-4" strokeWidth={1.8} />}
              >
                Crew
              </PaneTitle>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {crews.map((c) => {
                  const on = c.id === crewId;
                  const profiles = [...new Set(c.roles.map((r) => r.profile))];
                  return (
                    <SelectCard
                      key={c.id}
                      on={on}
                      onClick={() => setCrewId(c.id)}
                      title={c.label}
                      meta={`${c.roles.length} roles · ${profiles
                        .slice(0, 3)
                        .join(", ")}`}
                      badge={
                        c.id === meta?.defaultCrew ? "default" : undefined
                      }
                      tags={c.roles.slice(0, 4).map((r) => r.label)}
                    />
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* Inputs - the selected flow's declared params */}
          {flowParams && Object.keys(flowParams).length > 0 ? (
            <section>
              <PaneTitle
                icon={<Sparkles className="h-4 w-4" strokeWidth={1.8} />}
              >
                Inputs
              </PaneTitle>
              <div className="slab-flat grid grid-cols-1 gap-x-7 gap-y-5 p-5 sm:grid-cols-2">
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
                    <label key={name} className="flex flex-col gap-1.5">
                      <span className="flex flex-wrap items-center gap-1.5 text-[13px] text-fog-200">
                        <span className="font-medium">{name}</span>
                        {def.required ? (
                          <span className="text-fail">*</span>
                        ) : null}
                        {def.shared ? (
                          <span className="text-fog-400" title="Project-global">
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
                          <span className="text-fog-400">
                            · {def.description}
                          </span>
                        ) : null}
                      </span>
                      <div className="flex items-center gap-2">
                        {def.type === "boolean" ? (
                          <BigToggle
                            on={val === "true"}
                            onClick={() =>
                              set(val === "true" ? "false" : "true")
                            }
                            label={name}
                          />
                        ) : def.type === "enum" && def.values?.length ? (
                          <div className="flex flex-wrap gap-1.5">
                            {def.values.map((opt) => (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => set(opt)}
                                className={cn(
                                  "border px-3 py-1.5 text-[13px] transition",
                                  val === opt
                                    ? "border-violet-soft/50 bg-violet-mid/[0.14] text-fog-100"
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
                            className="min-w-0 flex-1 border border-[color:var(--line)] bg-ink-0 px-3 py-2 text-[13.5px] text-fog-100 outline-none placeholder:text-fog-500 focus:border-violet-soft/45"
                          />
                        )}
                        {def.generate && !def.secret ? (
                          <button
                            type="button"
                            disabled={generating === name}
                            onClick={() => void generateParam(name)}
                            title={def.generate.instruction}
                            className="flex shrink-0 items-center gap-1.5 border border-violet-soft/40 px-3 py-2 text-[12.5px] text-violet-100 transition hover:bg-violet-mid/10 disabled:opacity-50"
                          >
                            <Sparkles className="h-3.5 w-3.5" strokeWidth={1.8} />
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
        </div>

        {/* ── RIGHT: run summary (sticky) ────────────────────────────────── */}
        <aside className="lg:col-span-4 lg:sticky lg:top-6">
          <PaneTitle>Run summary</PaneTitle>
          <div className="slab-flat">
            <p className="border-b border-[color:var(--line-soft)] px-5 py-3 text-[12.5px] leading-[1.55] text-fog-300">
              What this run will do, before you start it.
            </p>

            {/* Readback rows - clean labels, mono values */}
            <dl className="flex flex-col divide-y divide-[color:var(--line-soft)]">
              <SummaryRow
                label="Flow"
                value={selectedFlow ? selectedFlow.definition.label : "auto"}
                hint={
                  selectedFlow
                    ? `${(selectedFlow.definition.steps ?? []).length} steps`
                    : "orchestrator picks"
                }
                accent={selectedFlow ? "emerald" : "muted"}
              />
              <SummaryRow
                label="Crew"
                value={selectedCrew ? selectedCrew.label : "default"}
                hint={
                  selectedCrew ? `${selectedCrew.roles.length} roles` : undefined
                }
              />
              <SummaryRow
                label="Supervisor"
                value={selectedPersona ? selectedPersona.label : "default"}
              />
              <SummaryRow
                label="Mode"
                value={
                  readOnly && unattended
                    ? "read-only · unattended"
                    : readOnly
                      ? "read-only"
                      : unattended
                        ? "unattended"
                        : "interactive · writes"
                }
                accent={readOnly ? "violet" : undefined}
              />
              {concise || forceSelect ? (
                <SummaryRow
                  label="Tuning"
                  value={[
                    concise ? "concise" : null,
                    forceSelect ? "auto-pick flow" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                />
              ) : null}
            </dl>

            {/* Readiness line */}
            <div className="border-t border-[color:var(--line-soft)] px-5 py-4">
              {!canStart ? (
                <div className="flex items-start gap-2.5 text-[13px] leading-[1.5] text-warn">
                  <span
                    className="mt-[7px] h-1.5 w-1.5 shrink-0 bg-warn"
                    aria-hidden
                  />
                  <span>
                    {briefEmpty
                      ? "Write a task brief to start the run."
                      : missingRequired.length > 0
                        ? `Fill required input${
                            missingRequired.length > 1 ? "s" : ""
                          }: ${missingRequired.join(", ")}.`
                        : "Starting…"}
                  </span>
                </div>
              ) : (
                <div className="flex items-start gap-2.5 text-[13px] leading-[1.5] text-emerald">
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0"
                    strokeWidth={2.2}
                  />
                  <span>Ready to start. Nothing pushes or merges.</span>
                </div>
              )}
            </div>

            {/* Start button */}
            <div className="px-5 pb-4">
              <button
                type="button"
                disabled={!canStart}
                onClick={() => void start()}
                className={cn(
                  "flex w-full items-center justify-center gap-2.5 px-5 py-3.5 text-[15px] font-medium transition",
                  canStart
                    ? "border border-violet-deep bg-violet-deep text-white hover:bg-white hover:text-violet-deep"
                    : "cursor-not-allowed border border-[color:var(--line)] text-fog-500",
                )}
              >
                <Play className="h-4 w-4" strokeWidth={2.2} />
                {busy ? "Starting…" : "Start run"}
              </button>
            </div>

            {/* Live command mirror - copyable */}
            <div className="px-5 pb-5">
              <button
                type="button"
                onClick={() => void copyCmd()}
                title={`Copy - run this from the terminal or \`vibe shell\`:\n${runCmd}`}
                className="group flex w-full items-center gap-2 border border-[color:var(--line)] bg-ink-0 px-3 py-2.5 text-left transition hover:border-violet-soft/30"
              >
                <Terminal
                  className="h-3.5 w-3.5 shrink-0 text-violet-soft"
                  strokeWidth={1.8}
                />
                <span className="select-none font-mono text-fog-500">$</span>
                <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-fog-200">
                  {runCmd}
                </code>
                <span className="flex shrink-0 items-center gap-1 font-mono text-[11px] text-fog-500 group-hover:text-fog-300">
                  {cmdCopied ? (
                    <Check className="h-3 w-3" strokeWidth={1.8} />
                  ) : (
                    <Copy className="h-3 w-3" strokeWidth={1.8} />
                  )}
                  {cmdCopied ? "copied" : "copy"}
                </span>
              </button>
            </div>

            {/* Safety reassurance */}
            <div className="flex items-start gap-2.5 border-t border-[color:var(--line-soft)] px-5 py-4 text-[12px] leading-[1.55] text-fog-300">
              <ShieldCheck
                className="mt-px h-4 w-4 shrink-0 text-emerald"
                strokeWidth={1.8}
              />
              <span>
                Nothing pushes or merges. The run stops at merge-ready, blocked,
                or failed - you review the diff before anything ships.
              </span>
            </div>

            {error ? (
              <div className="mx-5 mb-5 border border-[color:var(--fail)]/40 bg-[color:var(--fail)]/[0.08] px-3 py-2.5 text-[12.5px] text-fail">
                {error}
              </div>
            ) : null}
          </div>
        </aside>
        </div>
      </div>
    </div>
  );
}

// ── Presentational sub-components (V5-only) ─────────────────────────────────

/** Section header in the left pane: a legible Bricolage title, not a tiny
 * uppercase mono eyebrow. */
function PaneTitle({
  icon,
  children,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <h2 className="mb-4 flex items-center gap-2.5 font-display text-[20px] font-semibold tracking-[-0.02em] text-fog-100">
      {icon ? <span className="text-violet-soft">{icon}</span> : null}
      {children}
    </h2>
  );
}

type FlowStepLike = { kind?: string; inputs?: unknown[] };

/** A rough proxy for how long / tedious a step is - there's no measured
 * wall-clock in a flow definition, so we weight by kind (LLM turns are the slow
 * ones; validations / gates are light) plus the context each step has to chew
 * through (its declared inputs). Not real timing, just relative heft. */
function stepWeight(step: FlowStepLike): number {
  const kind = step.kind ?? "";
  const base =
    kind === "agent-turn" || kind === "review-turn"
      ? 3
      : kind === "response-turn"
        ? 2.4
        : kind === "validation"
          ? 1
          : 1.6;
  const ctx = Array.isArray(step.inputs) ? step.inputs.length : 0;
  return base + ctx * 0.6;
}

/** A compact bar chart, one bar per flow step. Bar count = number of steps;
 * bar height = that step's relative heft (stepWeight). Caps at 18 bars; longer
 * flows show "+N". */
function FlowBars({ steps, on }: { steps: FlowStepLike[]; on: boolean }) {
  if (steps.length === 0) return null;
  const max = 18;
  const shown = steps.slice(0, max);
  const extra = steps.length - shown.length;
  const weights = shown.map(stepWeight);
  const peak = Math.max(...weights, 1);
  return (
    <div className="flex h-[18px] items-end gap-[3px]" aria-hidden>
      {shown.map((s, i) => (
        <span
          key={i}
          style={{
            height: `${4 + Math.round(((weights[i] ?? 0) / peak) * 14)}px`,
          }}
          className={cn(
            "w-[3px] rounded-[1px]",
            on ? "bg-ink-0/70" : "bg-violet-soft/55",
          )}
        />
      ))}
      {extra > 0 ? (
        <span
          className={cn(
            "ml-1 self-center font-mono text-[10px]",
            on ? "text-ink-0/60" : "text-fog-400",
          )}
        >
          +{extra}
        </span>
      ) : null}
    </div>
  );
}

/** A roomy square selection card. Selected = SOLID emerald fill with dark ink
 * text (the marketing "green hero" / Flows-page treatment). */
function SelectCard({
  on,
  onClick,
  title,
  meta,
  badge,
  tags,
  pips,
}: {
  on: boolean;
  onClick: () => void;
  title: string;
  meta: string;
  badge?: string;
  tags?: string[];
  pips?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col gap-2.5 border px-4 py-4 text-left transition",
        on
          ? "border-emerald bg-emerald text-ink-0"
          : "border-[color:var(--line)] bg-ink-50 hover:border-violet-soft/40 hover:bg-ink-100",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "font-display text-[15.5px] font-semibold leading-tight",
            on ? "text-ink-0" : "text-fog-100",
          )}
        >
          {title}
        </span>
        {on ? (
          <span
            className="grid h-5 w-5 shrink-0 place-items-center bg-ink-0 text-emerald"
            aria-hidden
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2.4} />
          </span>
        ) : badge ? (
          <span className="border border-[color:var(--line)] px-1.5 py-px font-mono text-[10px] uppercase tracking-wide text-fog-400">
            {badge}
          </span>
        ) : null}
      </div>
      {pips ? <div className="-my-0.5">{pips}</div> : null}
      <span
        className={cn(
          "font-mono text-[12px]",
          on ? "text-ink-0/75" : "text-fog-400",
        )}
      >
        {meta}
      </span>
      {tags && tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span
              key={t}
              className={cn(
                "border px-1.5 py-px text-[11px]",
                on
                  ? "border-ink-0/25 text-ink-0/80"
                  : "border-[color:var(--line-soft)] text-fog-400",
              )}
            >
              {t}
            </span>
          ))}
        </div>
      ) : null}
    </button>
  );
}

/** A square on/off toggle pill - violet fill when on, hairline when off. */
function BigToggle({
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
      aria-pressed={on}
      className={cn(
        "inline-flex items-center gap-2 border px-3.5 py-2 text-[13px] transition",
        on
          ? "border-violet-soft/50 bg-violet-mid/[0.14] text-fog-100"
          : "border-[color:var(--line)] text-fog-300 hover:text-fog-100",
      )}
    >
      {icon ? (
        <span className={on ? "text-violet-soft" : "text-fog-400"}>{icon}</span>
      ) : null}
      <span>{label}</span>
      <span
        className={cn(
          "h-1.5 w-1.5",
          on ? "bg-violet-soft" : "bg-[color:var(--line-strong)]",
        )}
        aria-hidden
      />
    </button>
  );
}

/** A run-summary readback row: label left, value + hint right (mono value). */
function SummaryRow({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "emerald" | "violet" | "muted";
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 py-3">
      <dt className="font-mono text-[12px] text-fog-400">{label}</dt>
      <dd className="flex min-w-0 items-baseline gap-2 text-right">
        <span
          className={cn(
            "truncate font-mono text-[13px]",
            accent === "emerald"
              ? "text-emerald"
              : accent === "violet"
                ? "text-violet-soft"
                : accent === "muted"
                  ? "text-fog-400"
                  : "text-fog-100",
          )}
        >
          {value}
        </span>
        {hint ? (
          <span className="shrink-0 font-mono text-[11px] text-fog-500">
            {hint}
          </span>
        ) : null}
      </dd>
    </div>
  );
}

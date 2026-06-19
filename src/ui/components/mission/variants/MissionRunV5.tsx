import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Layers,
  LayoutGrid,
  Lock,
  Moon,
  Play,
  ShieldCheck,
  Sparkles,
  Sun,
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

  // Local preview toggle for the themeable run-control (B: this surface is
  // light/dark-ready via --s-* scene tokens; the rest of the app stays dark).
  const [runTheme, setRunTheme] = useState<"dark" | "paper">("dark");
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
    <div
      data-scene={runTheme === "paper" ? "paper" : "dark"}
      className="fade-up overflow-hidden rounded-2xl border"
      style={{
        background: "var(--s-aurora)",
        borderColor: "var(--s-line)",
        color: "var(--s-ink)",
      }}
    >
      <div className="px-5 py-5 sm:px-7 sm:py-6">
        {/* One toggle themes the whole run-control (preview light / dark). */}
        <div className="mb-4 flex items-center justify-end">
          <button
            type="button"
            onClick={() => setRunTheme((t) => (t === "paper" ? "dark" : "paper"))}
            title="Preview the run control in light / dark"
            aria-label="Toggle light or dark preview"
            className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12px] transition"
            style={{ borderColor: "var(--s-line)", color: "var(--s-ink-dim)" }}
          >
            {runTheme === "paper" ? (
              <>
                <Sun className="h-3.5 w-3.5" strokeWidth={1.8} /> Light
              </>
            ) : (
              <>
                <Moon className="h-3.5 w-3.5" strokeWidth={1.8} /> Dark
              </>
            )}
          </button>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* ── LEFT: composition ──────────────────────────────────────────── */}
        <div className="flex flex-col gap-6 lg:col-span-8">
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
              className="s-glass-2 min-h-[116px] w-full resize-y rounded-xl border border-[color:var(--s-line)] px-5 py-3.5 text-[16px] leading-[1.6] outline-none transition placeholder:text-[color:var(--s-ink-faint)] focus:border-[color:var(--s-accent)]"
              style={{ color: "var(--s-ink)" }}
            />
            {suggestions.length > 0 ? (
              <div
                className="s-glass-2 mt-2.5 overflow-hidden rounded-xl border"
                style={{ borderColor: "var(--s-line)" }}
              >
                <div
                  className="flex items-center gap-2 px-4 py-2.5"
                  style={{ borderBottom: "1px solid var(--s-line)" }}
                >
                  <Sparkles
                    className="h-3.5 w-3.5"
                    strokeWidth={1.8}
                    style={{ color: "var(--s-accent-bright)" }}
                  />
                  <span
                    className="font-mono text-[12px]"
                    style={{ color: "var(--s-ink-dim)" }}
                  >
                    Or pick up from your roadmap
                  </span>
                  <button
                    type="button"
                    onClick={() => navigate({ kind: "board" })}
                    className="ml-auto flex items-center gap-1.5 font-mono text-[12px] transition hover:brightness-125"
                    style={{ color: "var(--s-ink-faint)" }}
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
                      className="flex items-center gap-2.5 rounded-lg border px-3.5 py-2 text-left transition hover:brightness-110 disabled:opacity-50"
                      style={{
                        background: "var(--s-slab)",
                        borderColor: "var(--s-line)",
                      }}
                    >
                      <span
                        className="max-w-[240px] truncate text-[13.5px]"
                        style={{ color: "var(--s-ink)" }}
                      >
                        {s.title}
                      </span>
                      <span
                        className="font-mono text-[11px]"
                        style={{
                          color: s.ready
                            ? "var(--s-ok-ink)"
                            : "var(--s-warn-ink)",
                        }}
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
            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2.5">
                <span className="font-mono text-[12px] text-[color:var(--s-ink-dim)]">
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
                <span className="font-mono text-[12px] text-[color:var(--s-ink-dim)]">
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
                  <span className="font-mono text-[12px] text-[color:var(--s-ink-dim)]">
                    Supervisor
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {personas.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPersonaId(p.id)}
                        title={p.description}
                        className="rounded-lg border px-3.5 py-2 text-[13px] transition hover:brightness-110"
                        style={
                          p.id === personaId
                            ? {
                                background: "var(--s-soft)",
                                borderColor: "transparent",
                                color: "var(--s-soft-ink)",
                              }
                            : {
                                borderColor: "var(--s-line)",
                                color: "var(--s-ink-dim)",
                              }
                        }
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <p
                className="text-[12.5px] leading-[1.6] sm:col-span-2"
                style={{ color: "var(--s-ink-dim)" }}
              >
                {readOnly || unattended ? (
                  <span className="flex flex-col gap-1.5">
                    {readOnly ? (
                      <span>
                        <span style={{ color: "var(--s-ink)" }}>
                          Read-only is enforced.
                        </span>{" "}
                        Every role plans and proposes but never writes; the write
                        / validate / verify steps are skipped, and apply, validate,
                        and revert are refused.
                      </span>
                    ) : null}
                    {unattended ? (
                      <span>
                        <span style={{ color: "var(--s-ink)" }}>Unattended.</span>{" "}
                        The run never pauses for a human: approval gates
                        auto-resolve after a timeout and a budget or resilience
                        limit ends the run instead of waiting.
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span>
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
              <div
                className="rounded-xl border px-5 py-4 text-[14px]"
                style={{
                  background: "var(--s-slab-2)",
                  borderColor: "var(--s-line)",
                  color: "var(--s-ink-dim)",
                }}
              >
                No flows discovered.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
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
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
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
              <div
                className="s-glass-2 grid grid-cols-1 gap-x-7 gap-y-4 rounded-xl border p-4 sm:grid-cols-2"
                style={{ borderColor: "var(--s-line)" }}
              >
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
                      <span
                        className="flex flex-wrap items-center gap-1.5 text-[13px]"
                        style={{ color: "var(--s-ink)" }}
                      >
                        <span className="font-medium">{name}</span>
                        {def.required ? (
                          <span className="text-fail">*</span>
                        ) : null}
                        {def.shared ? (
                          <span
                            style={{ color: "var(--s-ink-faint)" }}
                            title="Project-global"
                          >
                            · shared
                          </span>
                        ) : null}
                        {pf && !def.secret ? (
                          <span
                            style={{ color: "var(--s-ok-ink)" }}
                            title={`From the project profile (${pf.setBy})`}
                          >
                            · {pf.setBy === "generated" ? "generated" : "saved"}
                          </span>
                        ) : null}
                        {def.description ? (
                          <span style={{ color: "var(--s-ink-faint)" }}>
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
                                className="rounded-lg border px-3 py-1.5 text-[13px] transition hover:brightness-110"
                                style={
                                  val === opt
                                    ? {
                                        background: "var(--s-soft)",
                                        borderColor: "transparent",
                                        color: "var(--s-soft-ink)",
                                      }
                                    : {
                                        borderColor: "var(--s-line)",
                                        color: "var(--s-ink-dim)",
                                      }
                                }
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
                            className="min-w-0 flex-1 rounded-lg border border-[color:var(--s-line)] px-3 py-2 text-[13.5px] outline-none transition placeholder:text-[color:var(--s-ink-faint)] focus:border-[color:var(--s-accent)]"
                            style={{ background: "var(--s-slab)", color: "var(--s-ink)" }}
                          />
                        )}
                        {def.generate && !def.secret ? (
                          <button
                            type="button"
                            disabled={generating === name}
                            onClick={() => void generateParam(name)}
                            title={def.generate.instruction}
                            className="flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-[12.5px] transition hover:brightness-110 disabled:opacity-50"
                            style={{
                              borderColor: "var(--s-line)",
                              color: "var(--s-accent-bright)",
                            }}
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

        {/* ── RIGHT: run summary (04 "soft cards", themeable via --s-* tokens) ── */}
        <aside className="lg:col-span-4 lg:sticky lg:top-6">
          <PaneTitle>Run summary</PaneTitle>
          <div
            className="s-glass overflow-hidden rounded-2xl border pb-2"
            style={{
              borderColor: "var(--s-line)",
              color: "var(--s-slab-ink)",
            }}
          >
            <div className="px-4 pt-3.5 pb-2.5">
              <p
                className="text-[12.5px] leading-[1.5]"
                style={{ color: "var(--s-ink-dim)" }}
              >
                What this run will do, before you start it.
              </p>
            </div>

            {/* Readback rows - soft rounded panels with accent chips */}
            <div className="flex flex-col gap-2 px-3">
              <SummaryRow
                icon={<Layers className="h-4 w-4" strokeWidth={1.8} />}
                label="Flow"
                value={selectedFlow ? selectedFlow.definition.label : "auto"}
                hint={
                  selectedFlow
                    ? `${(selectedFlow.definition.steps ?? []).length} steps`
                    : "orchestrator picks"
                }
                accent={selectedFlow ? "ok" : "muted"}
              />
              <SummaryRow
                icon={<Users className="h-4 w-4" strokeWidth={1.8} />}
                label="Crew"
                value={selectedCrew ? selectedCrew.label : "default"}
                hint={
                  selectedCrew ? `${selectedCrew.roles.length} roles` : undefined
                }
                accent={selectedCrew ? "ok" : "muted"}
              />
              <SummaryRow
                icon={<ShieldCheck className="h-4 w-4" strokeWidth={1.8} />}
                label="Supervisor"
                value={selectedPersona ? selectedPersona.label : "default"}
                accent={selectedPersona ? undefined : "muted"}
              />
              <SummaryRow
                icon={<Lock className="h-4 w-4" strokeWidth={1.8} />}
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
                accent={readOnly || unattended ? "soft" : undefined}
              />
              {concise || forceSelect ? (
                <SummaryRow
                  icon={<Sparkles className="h-4 w-4" strokeWidth={1.8} />}
                  label="Tuning"
                  value={[
                    concise ? "concise" : null,
                    forceSelect ? "auto-pick flow" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  accent="soft"
                />
              ) : null}
            </div>

            {/* Readiness line */}
            <div className="px-4 pt-3.5">
              {!canStart ? (
                <div
                  className="flex items-start gap-2.5 text-[13px] leading-[1.5]"
                  style={{ color: "var(--s-warn-ink)" }}
                >
                  <span
                    className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: "var(--s-warn-ink)" }}
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
                <div
                  className="flex items-start gap-2.5 text-[13px] leading-[1.5]"
                  style={{ color: "var(--s-ok-ink)" }}
                >
                  <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} />
                  <span>Ready to start. Nothing pushes or merges.</span>
                </div>
              )}
            </div>

            {/* Start button - accent fill */}
            <div className="px-4 pt-3">
              <button
                type="button"
                disabled={!canStart}
                onClick={() => void start()}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl px-5 py-3.5 text-[15px] font-medium transition disabled:cursor-not-allowed"
                style={
                  canStart
                    ? {
                        background: "var(--s-accent)",
                        color: "var(--s-on-accent)",
                      }
                    : {
                        background: "var(--s-slab-2)",
                        color: "var(--s-ink-faint)",
                      }
                }
              >
                <Play className="h-4 w-4" strokeWidth={2.2} />
                {busy ? "Starting…" : "Start run"}
              </button>
            </div>

            {/* Live command mirror - copyable */}
            <div className="px-4 pt-2.5">
              <button
                type="button"
                onClick={() => void copyCmd()}
                title={`Copy - run this from the terminal or \`vibe shell\`:\n${runCmd}`}
                className="s-glass-2 group flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left"
              >
                <Terminal
                  className="h-3.5 w-3.5 shrink-0"
                  strokeWidth={1.8}
                  style={{ color: "var(--s-accent-bright)" }}
                />
                <span
                  className="select-none font-mono"
                  style={{ color: "var(--s-ink-faint)" }}
                >
                  $
                </span>
                <code
                  className="min-w-0 flex-1 truncate font-mono text-[12px]"
                  style={{ color: "var(--s-ink-dim)" }}
                >
                  {runCmd}
                </code>
                <span
                  className="flex shrink-0 items-center gap-1 font-mono text-[11px]"
                  style={{ color: "var(--s-ink-faint)" }}
                >
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
            <div
              className="mt-3.5 flex items-start gap-2.5 px-4 py-3.5 text-[12px] leading-[1.55]"
              style={{
                borderTop: "1px solid var(--s-line)",
                color: "var(--s-ink-dim)",
              }}
            >
              <ShieldCheck
                className="mt-px h-4 w-4 shrink-0"
                strokeWidth={1.8}
                style={{ color: "var(--s-ok-ink)" }}
              />
              <span>
                Nothing pushes or merges. The run stops at merge-ready, blocked,
                or failed - you review the diff before anything ships.
              </span>
            </div>

            {error ? (
              <div className="mx-4 mb-2 rounded-lg border border-[color:var(--fail)]/40 bg-[color:var(--fail)]/[0.08] px-3 py-2.5 text-[12.5px] text-fail">
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
    <h2
      className="mb-3 flex items-center gap-2.5 font-display text-[20px] font-semibold tracking-[-0.02em]"
      style={{ color: "var(--s-ink)" }}
    >
      {icon ? (
        <span style={{ color: "var(--s-accent-bright)" }}>{icon}</span>
      ) : null}
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
            background: on ? "#04231a" : "var(--s-accent-bright)",
          }}
          className={cn("w-[3px] rounded-[1px]", on ? "opacity-70" : "opacity-60")}
        />
      ))}
      {extra > 0 ? (
        <span
          className="ml-1 self-center font-mono text-[10px]"
          style={{ color: on ? "rgba(4,35,26,0.65)" : "var(--s-ink-faint)" }}
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
        "flex flex-col gap-2 overflow-hidden rounded-xl border px-3.5 py-3 text-left transition hover:brightness-110",
        !on && "s-glass",
      )}
      style={
        on
          ? { background: "var(--emerald)", borderColor: "transparent", color: "#04231a" }
          : { borderColor: "var(--s-line)", color: "var(--s-ink)" }
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="font-display text-[15.5px] font-semibold leading-tight"
          style={{ color: on ? "#04231a" : "var(--s-ink)" }}
        >
          {title}
        </span>
        {on ? (
          <span
            className="grid h-5 w-5 shrink-0 place-items-center rounded-md"
            style={{ background: "#04231a", color: "var(--emerald)" }}
            aria-hidden
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2.4} />
          </span>
        ) : badge ? (
          <span
            className="rounded-md border px-1.5 py-px font-mono text-[10px] uppercase tracking-wide"
            style={{ borderColor: "var(--s-line)", color: "var(--s-ink-faint)" }}
          >
            {badge}
          </span>
        ) : null}
      </div>
      {pips ? <div className="-my-0.5">{pips}</div> : null}
      <span
        className="font-mono text-[12px]"
        style={{ color: on ? "rgba(4,35,26,0.72)" : "var(--s-ink-faint)" }}
      >
        {meta}
      </span>
      {tags && tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span
              key={t}
              className="rounded-md border px-1.5 py-px text-[11px]"
              style={
                on
                  ? { borderColor: "rgba(4,35,26,0.25)", color: "rgba(4,35,26,0.8)" }
                  : { borderColor: "var(--s-line)", color: "var(--s-ink-dim)" }
              }
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
      className="inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-[13px] transition hover:brightness-110"
      style={
        on
          ? {
              background: "var(--s-soft)",
              borderColor: "transparent",
              color: "var(--s-soft-ink)",
            }
          : { borderColor: "var(--s-line)", color: "var(--s-ink-dim)" }
      }
    >
      {icon ? (
        <span
          style={{ color: on ? "var(--s-soft-ink)" : "var(--s-ink-faint)" }}
        >
          {icon}
        </span>
      ) : null}
      <span>{label}</span>
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: on ? "var(--s-soft-ink)" : "var(--s-line)" }}
        aria-hidden
      />
    </button>
  );
}

/** 04 "soft card" readback row: a rounded inner panel with a leading accent
 * icon, a dim label, and a value that becomes a colored chip when accented.
 * All colors come from --s-* scene tokens so it works in dark and paper. */
function SummaryRow({
  icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  accent?: "ok" | "soft" | "muted";
}) {
  const chip = accent === "ok" || accent === "soft";
  return (
    <div className="s-glass-2 flex items-center justify-between gap-3 rounded-xl px-3.5 py-2">
      <span
        className="flex items-center gap-2.5 text-[13px]"
        style={{ color: "var(--s-ink-dim)" }}
      >
        <span className="flex" style={{ color: "var(--s-accent-bright)" }}>
          {icon}
        </span>
        {label}
      </span>
      <span className="flex min-w-0 items-baseline gap-2 text-right">
        {chip ? (
          <span
            className="truncate rounded-lg px-2.5 py-1 text-[12.5px] font-medium"
            style={{
              background: accent === "ok" ? "var(--s-ok)" : "var(--s-soft)",
              color: accent === "ok" ? "var(--s-ok-ink)" : "var(--s-soft-ink)",
            }}
          >
            {value}
          </span>
        ) : (
          <span
            className="truncate text-[13.5px] font-medium"
            style={{
              color:
                accent === "muted" ? "var(--s-ink-faint)" : "var(--s-slab-ink)",
            }}
          >
            {value}
          </span>
        )}
        {hint ? (
          <span
            className="shrink-0 text-[11px]"
            style={{ color: "var(--s-ink-faint)" }}
          >
            {hint}
          </span>
        ) : null}
      </span>
    </div>
  );
}

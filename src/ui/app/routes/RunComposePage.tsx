import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  Check,
  ChevronRight,
  Compass,
  Copy,
  Gauge,
  LayoutGrid,
  Layers,
  Lock,
  MessagesSquare,
  Play,
  Sparkles,
  Terminal,
  Users,
} from "lucide-react";
import { api } from "../../lib/api.js";
import { navigate } from "../App.js";
import { cn } from "../../components/design/cn.js";
import { RunStatusBadge } from "../../components/runs/RunStatusBadge.js";
import {
  ConfigRow,
  SectionLabel,
  StepPips,
  Toggle,
} from "../../components/mission/v3/composeKit.js";
import type {
  ConsultResult,
  DiscoveredFlow,
  PersonaSummary,
  ProjectMetadata,
  RunState,
  TaskSuggestion,
} from "../../lib/types.js";

/**
 * Run composition as a task command center (#/compose), product register.
 * Component vocabulary ported 1:1 from the marketing docs: SQUARE corners, flat
 * ink surfaces + hairline, the `.brand-card` left-accent (violet on hover/active),
 * tracked-uppercase labels, Bricolage/Geist/mono. Layout: the TASK is the brief
 * plus roadmap pickup together (one source of intent); flow + crew are picked as
 * cards; configuration is designed controls (no native menus). The right rail is
 * the working context: the selected flow's steps, an INLINE "ask the supervisor"
 * (no navigation away), a metrics quick-look, and recent runs.
 */
export function RunComposePage() {
  const [meta, setMeta] = useState<ProjectMetadata | null>(null);
  const [flows, setFlows] = useState<DiscoveredFlow[]>([]);
  const [defaultFlow, setDefaultFlow] = useState<string | null>(null);
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  const [suggestions, setSuggestions] = useState<TaskSuggestion[]>([]);
  const [todaySpend, setTodaySpend] = useState<number | null>(null);

  const [brief, setBrief] = useState("");
  const [flowId, setFlowId] = useState("");
  const [crewId, setCrewId] = useState<string | null>(null);
  const [personaId, setPersonaId] = useState<string | null>(null);
  const [concise, setConcise] = useState(false);
  // Permission mode (P4): read-only is the strict end of the same axis, so it's
  // derived from the mode rather than a separate toggle.
  const [permissionMode, setPermissionMode] = useState<
    "read-only" | "ask" | "accept-edits" | "auto"
  >("auto");
  const readOnly = permissionMode === "read-only";
  const [unattended, setUnattended] = useState(false);
  const [forceSelect, setForceSelect] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Flow inputs (the flow's declared params - required ones must be filled
  // before the run starts). Prefilled from the durable project profile.
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [paramPrefill, setParamPrefill] = useState<
    Record<string, { value: string; setBy: string; secret: boolean }>
  >({});
  const [generating, setGenerating] = useState<string | null>(null);

  // Inline consult (ask the supervisor without leaving the page).
  const [askQ, setAskQ] = useState("");
  const [askBusy, setAskBusy] = useState(false);
  const [askResult, setAskResult] = useState<ConsultResult | null>(null);
  const [askErr, setAskErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [m, f, p, s, b] = await Promise.all([
        api.getProjectMetadata().catch(() => null),
        api.listFlows().catch(() => ({ flows: [] as DiscoveredFlow[], defaultFlow: null })),
        api.listPersonas().catch(() => null),
        api.suggestNext().catch(() => [] as TaskSuggestion[]),
        api.getBudget().catch(() => null),
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
      setTodaySpend(b?.todaySpendUsd ?? null);
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

  // Prefill the flow's inputs from the project profile when the flow changes
  // (a stored answer becomes the field's starting value); secrets are never
  // prefilled into a visible field.
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

  function paramFilled(name: string, def: { required?: boolean; default?: unknown }): boolean {
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
          (taskId ? suggestions.find((s) => s.taskId === taskId)?.title ?? "" : ""),
        taskId,
        params: Object.keys(params).length > 0 ? params : undefined,
        flow: flowId ? { id: flowId } : undefined,
        crewId: crewId ?? undefined,
        persona: personaId ?? undefined,
        concise: concise || undefined,
        readOnly: readOnly || undefined,
        permissionMode: permissionMode === "auto" ? undefined : permissionMode,
        unattended: unattended || undefined,
        select: forceSelect || undefined,
      });
      navigate({ kind: "run", runId: r.runId });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  // "Plan" = start the Shape phase from this brief instead of building straight
  // away: launches the read-only intake run that asks the gap questions, then
  // hands off to the chosen flow once the spec is approved. Mirrors
  // `vibe shape start`; only the brief (+ optional persona + build-target flow)
  // applies - run mode / crew / tuning are execution-time concerns.
  async function plan() {
    const typed = brief.trim();
    if (!typed) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.shapeIntake({
        task: typed,
        persona: personaId ?? undefined,
        flowId: flowId || undefined,
      });
      navigate({ kind: "run", runId: r.runId });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  async function ask() {
    const q = askQ.trim();
    if (!q || askBusy) return;
    setAskBusy(true);
    setAskErr(null);
    try {
      // Make the supervisor aware of WHERE it's standing: the compose surface and
      // its controls, plus the current selections - so it can answer questions
      // about this page (e.g. "what does tuning do") instead of only the project.
      const surface = [
        "Surface context (where I'm asking from): the Vibestrate dashboard's 'New run' (compose) page, where a run is configured before it starts.",
        "Its controls: a Task brief; Flow selection; Crew selection; and a Configuration panel with Run mode (Read-only, Unattended), Tuning (Concise = ask agents to keep output short; Auto-pick flow = let the orchestrator choose the flow when none is pinned), and a Supervisor persona.",
        selectedFlow
          ? `Currently pinned flow: ${selectedFlow.definition.label} (${selectedFlow.id}).`
          : "No flow pinned (the orchestrator would pick).",
        `Crew: ${crewId ?? "default"}. Supervisor: ${personaId ?? "default"}.`,
        brief.trim()
          ? `The current Task brief is: "${brief.trim()}".`
          : "No Task brief has been written yet.",
      ].join(" ");
      const r = await api.consult({ question: `${surface}\n\nMy question: ${q}` });
      setAskResult(r);
    } catch (err) {
      setAskErr(err instanceof Error ? err.message : String(err));
    } finally {
      setAskBusy(false);
    }
  }

  const canStart = brief.trim().length > 0 && missingRequired.length === 0 && !busy;
  // Plan only needs a brief: the intake run is read-only and doesn't run the
  // pinned flow, so its required params don't gate shaping.
  const canPlan = brief.trim().length > 0 && !busy;
  const recent = meta?.recentRuns ?? [];
  const counts = meta?.counts;

  // Live CLI/TUI mirror of the current composition (CLI = TUI = UI). Shows the
  // exact `vibe run` that this page would invoke; copyable.
  const runCmd = useMemo(() => {
    const parts = ["vibe run", JSON.stringify(brief.trim() || "your task")];
    if (flowId) parts.push(`--flow ${flowId}`);
    if (crewId && crewId !== meta?.defaultCrew) parts.push(`--crew ${crewId}`);
    if (permissionMode === "read-only") parts.push("--read-only");
    else if (permissionMode !== "auto") parts.push(`--permission-mode ${permissionMode}`);
    if (unattended) parts.push("--unattended");
    if (concise) parts.push("--concise");
    if (forceSelect) parts.push("--select");
    if (personaId) parts.push(`--supervisor ${personaId}`);
    return parts.join(" ");
  }, [brief, flowId, crewId, permissionMode, unattended, concise, forceSelect, personaId, meta?.defaultCrew]);
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
    <div data-scene className="grain scene-ground min-h-full">
      <div className="mx-auto max-w-[1520px] px-8 py-9">
        <header className="flex items-start justify-between gap-6 border-b border-[color:var(--line)] pb-5">
          <div className="min-w-0">
            <h1 className="font-display text-[30px] font-semibold leading-none tracking-[-0.03em] text-fog-100">
              New <span className="hl-box font-wordmark text-[26px]">run</span>
            </h1>
            <p className="mt-3 max-w-[62ch] text-[13px] leading-[1.55] text-fog-300">
              Describe the change or pick one up from your roadmap, choose the flow
              and crew, and start. The run plans, builds, reviews, and verifies,
              then stops before anything ships.
            </p>
          </div>
          {/* Live command mirror (CLI = TUI = UI): the exact `vibe run` this page
              would invoke, reflecting every selection - copyable. */}
          <button
            type="button"
            onClick={copyCmd}
            title={`Copy - run this from the terminal or \`vibe shell\`:\n${runCmd}`}
            className="group hidden w-[clamp(260px,32vw,520px)] shrink-0 items-center gap-2 border border-[color:var(--line)] bg-ink-0 px-3 py-2 text-left transition hover:border-violet-soft/30 md:flex"
          >
            <Terminal className="h-3.5 w-3.5 shrink-0 text-violet-soft" strokeWidth={1.8} />
            <span className="select-none text-fog-600">$</span>
            <code className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-fog-200">{runCmd}</code>
            <span className="flex shrink-0 items-center gap-1 text-[10.5px] text-fog-500 group-hover:text-fog-300">
              {cmdCopied ? <Check className="h-3 w-3" strokeWidth={1.8} /> : <Copy className="h-3 w-3" strokeWidth={1.8} />}
              {cmdCopied ? "copied" : "copy"}
            </span>
          </button>
        </header>

        <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* ── Composition ──────────────────────────────────────────────── */}
          <div className="flex flex-col gap-7 lg:col-span-8">
            {/* Task: brief + roadmap pickup, one unified source of intent */}
            <section>
              <SectionLabel>Task</SectionLabel>
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="Add structured logging to the settings save handler"
                className="slab min-h-[112px] w-full resize-y px-4 py-3.5 text-[15px] leading-[1.6] text-fog-100 outline-none placeholder:text-fog-500 focus:border-violet-soft/45"
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
                        onClick={() => start(s.taskId)}
                        title={s.reason}
                        className="brand-card flex items-center gap-2 px-2.5 py-1.5 disabled:opacity-50"
                      >
                        <span className="max-w-[200px] truncate text-[12px] text-fog-100">{s.title}</span>
                        <span className={cn("font-mono text-[9.5px]", s.ready ? "text-emerald" : "text-warn")}>
                          {s.ready ? "ready" : `${s.openBlockers.length}b`}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>

            {/* Flow */}
            <section>
              <SectionLabel icon={<Layers className="h-3 w-3" strokeWidth={1.8} />}>Flow</SectionLabel>
              <div className="slab-flat p-3">
                {flows.length === 0 ? (
                  <div className="px-1 py-2 text-[12.5px] text-fog-400">No flows discovered.</div>
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
                          className={cn("brand-card flex flex-col gap-2 px-3 py-3 text-left", on && "is-active")}
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
              </div>
              {selectedFlow ? (
                <details className="slab-flat group mt-2">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2.5 text-[11.5px] text-fog-300 transition hover:text-fog-100 [&::-webkit-details-marker]:hidden">
                    <ChevronRight className="h-3 w-3 shrink-0 text-fog-500 transition-transform group-open:rotate-90" strokeWidth={1.8} />
                    <span className="font-medium">Steps &amp; seats</span>
                    <span className="font-mono text-[10px] text-fog-500">
                      {selectedFlow.definition.label} · {(selectedFlow.definition.steps ?? []).length} steps
                    </span>
                  </summary>
                  <div className="border-t border-[color:var(--line-soft)]">
                    <FlowSteps flow={selectedFlow} />
                  </div>
                </details>
              ) : null}
            </section>

            {/* Flow inputs - the selected flow's declared params. Required ones
                must be filled before the run starts (they ARE part of the task). */}
            {flowParams && Object.keys(flowParams).length > 0 ? (
              <section>
                <SectionLabel icon={<Sparkles className="h-3 w-3" strokeWidth={1.8} />}>
                  Inputs
                </SectionLabel>
                <div className="slab-flat grid grid-cols-1 gap-x-6 gap-y-3.5 p-4 sm:grid-cols-2">
                  {Object.entries(flowParams).map(([name, def]) => {
                    const pf = paramPrefill[name];
                    const val =
                      paramValues[name] ??
                      (def.secret ? "" : pf && !pf.secret ? pf.value : def.default != null ? String(def.default) : "");
                    const set = (v: string) => setParamValues((c) => ({ ...c, [name]: v }));
                    return (
                      <label key={name} className="flex flex-col gap-1">
                        <span className="flex items-center gap-1.5 text-[11.5px] text-fog-200">
                          <span className="font-medium">{name}</span>
                          {def.required ? <span className="text-fail">*</span> : null}
                          {def.shared ? <span className="text-fog-600" title="Project-global">· shared</span> : null}
                          {pf && !def.secret ? (
                            <span className="text-emerald/80" title={`From the project profile (${pf.setBy})`}>
                              · {pf.setBy === "generated" ? "generated" : "saved"}
                            </span>
                          ) : null}
                          {def.description ? <span className="text-fog-500">· {def.description}</span> : null}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {def.type === "boolean" ? (
                            <Toggle on={val === "true"} onClick={() => set(val === "true" ? "false" : "true")} label={name} />
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
                              type={def.secret ? "text" : def.type === "number" ? "number" : "text"}
                              value={val}
                              onChange={(e) => set(e.target.value)}
                              placeholder={def.secret ? "env var NAME (e.g. OPENAI_API_KEY)" : def.type}
                              className="min-w-0 flex-1 border border-[color:var(--line)] bg-ink-0 px-2.5 py-1.5 text-[12px] text-fog-100 outline-none placeholder:text-fog-500 focus:border-violet-soft/45"
                            />
                          )}
                          {def.generate && !def.secret ? (
                            <button
                              type="button"
                              disabled={generating === name}
                              onClick={() => generateParam(name)}
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

            {/* Crew - deeper, card-based selection (like Flow) */}
            {meta && meta.crews.length > 0 ? (
              <section>
                <SectionLabel icon={<Users className="h-3 w-3" strokeWidth={1.8} />}>Crew</SectionLabel>
                <div className="slab-flat p-3">
                  <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
                    {meta.crews.map((c) => {
                      const on = c.id === crewId;
                      const profiles = [...new Set(c.roles.map((r) => r.profile))];
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setCrewId(c.id)}
                          className={cn("brand-card flex flex-col gap-1.5 px-3 py-3 text-left", on && "is-active")}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-display text-[13px] font-medium text-fog-100">{c.label}</span>
                            {on ? <Check className="h-3.5 w-3.5 text-violet-soft" strokeWidth={2.2} /> : null}
                          </div>
                          <div className="font-mono text-[10px] text-fog-500">
                            {c.roles.length} roles · {profiles.slice(0, 3).join(", ")}
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {c.roles.slice(0, 4).map((r) => (
                              <span key={r.id} className="border border-[color:var(--line-soft)] px-1 py-px text-[9.5px] text-fog-400">
                                {r.label}
                              </span>
                            ))}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
            ) : null}

            {/* Configuration - designed controls, no native menus */}
            <section>
              <SectionLabel>Configuration</SectionLabel>
              <div className="slab-flat divide-y divide-[color:var(--line-soft)]">
                <ConfigRow label="Run mode">
                  <div className="flex w-full flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-fog-500">Permission</span>
                    {(["auto", "ask", "accept-edits", "read-only"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPermissionMode(m)}
                        className={cn(
                          "inline-flex items-center gap-1 border px-2 py-1 text-[11.5px] transition",
                          m === permissionMode
                            ? "border-violet-soft/45 bg-violet-soft/10 text-violet-soft"
                            : "border-white/[0.08] bg-ink-200 text-fog-300 hover:text-fog-100",
                        )}
                      >
                        {m === "read-only" ? <Lock className="h-3 w-3" strokeWidth={1.8} /> : null}
                        {m}
                      </button>
                    ))}
                  </div>
                  <Toggle on={unattended} onClick={() => setUnattended((x) => !x)} label="Unattended" />
                  <div className="w-full pt-1 text-[11px] leading-[1.5] text-fog-400">
                    {readOnly || unattended || permissionMode === "ask" || permissionMode === "accept-edits" ? (
                      <ul className="space-y-1">
                        {readOnly ? (
                          <li className="flex items-start gap-1.5">
                            <Lock className="mt-0.5 h-3 w-3 shrink-0 text-violet-soft" strokeWidth={1.8} />
                            <span>
                              <span className="text-fog-200">Read-only is enforced.</span> It overrides the crew&apos;s write and execute permissions: every role runs read-only (plans and proposes, never writes), the write / validate / verify steps are skipped, and apply, validate, and revert are refused.
                            </span>
                          </li>
                        ) : null}
                        {permissionMode === "ask" ? (
                          <li className="flex items-start gap-1.5">
                            <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-violet-soft" aria-hidden />
                            <span>
                              <span className="text-fog-200">Ask.</span> The agent writes, then every resulting change waits for your approval before it&apos;s kept - reject and the worktree is rolled back.
                            </span>
                          </li>
                        ) : null}
                        {permissionMode === "accept-edits" ? (
                          <li className="flex items-start gap-1.5">
                            <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-violet-soft" aria-hidden />
                            <span>
                              <span className="text-fog-200">Accept-edits.</span> Changes auto-apply, but the run does not auto-complete - it holds for your sign-off, then resumes to merge-ready on approval.
                            </span>
                          </li>
                        ) : null}
                        {unattended ? (
                          <li className="flex items-start gap-1.5">
                            <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-violet-soft" aria-hidden />
                            <span>
                              <span className="text-fog-200">Unattended.</span> The run never pauses for a human: approval gates auto-resolve after a timeout and a budget or resilience limit ends the run instead of waiting.
                            </span>
                          </li>
                        ) : null}
                      </ul>
                    ) : (
                      <span className="text-fog-500">
                        Default: agents can write inside the run&apos;s worktree and the run pauses for you at approval gates. Nothing is ever pushed or merged.
                      </span>
                    )}
                  </div>
                </ConfigRow>
                <ConfigRow label="Tuning">
                  <Toggle on={concise} onClick={() => setConcise((x) => !x)} label="Concise" />
                  <Toggle on={forceSelect} onClick={() => setForceSelect((x) => !x)} label="Auto-pick flow" />
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
              <button
                type="button"
                disabled={!canPlan}
                onClick={() => plan()}
                title="Shape it first: answer a few scoping questions, then build."
                className={cn(
                  "inline-flex items-center gap-2 px-5 py-2.5 text-[13.5px] font-medium transition border",
                  canPlan
                    ? "border-violet-soft/40 text-violet-soft hover:bg-violet-500/10"
                    : "cursor-not-allowed border-[color:var(--line)] text-fog-500",
                )}
              >
                <Compass className="h-3.5 w-3.5" strokeWidth={2.2} />
                Plan first
              </button>
              {missingRequired.length > 0 ? (
                <span className="text-[11.5px] text-warn">
                  Fill required input{missingRequired.length > 1 ? "s" : ""}: {missingRequired.join(", ")}
                </span>
              ) : (
                <span className="text-[11.5px] text-fog-400">
                  Nothing pushes or merges. The run stops at merge-ready, blocked, or failed.
                </span>
              )}
            </div>
            {error ? (
              <div className="border border-[color:var(--fail)]/40 bg-[color:var(--fail)]/[0.08] px-3 py-2 text-[12px] text-fail">
                {error}
              </div>
            ) : null}
          </div>

          {/* ── Right rail: working context + utilities ──────────────────── */}
          <aside className="flex flex-col gap-4 lg:col-span-4 lg:sticky lg:top-6 lg:self-start">
            <FlowSummary flow={selectedFlow} />

            {/* Ask the supervisor - inline, no navigation away */}
            <RailCard title="Ask the supervisor" icon={<MessagesSquare className="h-3.5 w-3.5 text-violet-soft" strokeWidth={1.8} />}>
              <div className="px-1.5 pb-1">
                <textarea
                  value={askQ}
                  onChange={(e) => setAskQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask();
                  }}
                  rows={2}
                  placeholder="What should I run? Is this risky? What did we already ship here?"
                  className="w-full resize-none border border-[color:var(--line)] bg-ink-0 px-2.5 py-2 text-[12px] text-fog-100 outline-none placeholder:text-fog-500 focus:border-violet-soft/45"
                />
                <div className="mt-1.5 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!askQ.trim() || askBusy}
                    onClick={ask}
                    className={cn(
                      "border px-2.5 py-1 text-[11.5px] transition",
                      askQ.trim() && !askBusy
                        ? "border-violet-soft/45 text-violet-100 hover:bg-violet-mid/10"
                        : "cursor-not-allowed border-[color:var(--line)] text-fog-500",
                    )}
                  >
                    {askBusy ? "Asking…" : "Ask"}
                  </button>
                  <span className="text-[10px] text-fog-600">read-only · ⌘↵</span>
                </div>
                {askErr ? <p className="mt-2 text-[11px] text-fail">{askErr}</p> : null}
                {askResult ? (
                  <div className="mt-2.5 border-t border-[color:var(--line-soft)] pt-2.5">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span
                        className={cn(
                          "border px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wide",
                          askResult.answer.confidence === "high"
                            ? "border-emerald/40 text-emerald"
                            : askResult.answer.confidence === "medium"
                              ? "border-warn/40 text-warn"
                              : "border-[color:var(--line)] text-fog-400",
                        )}
                      >
                        {askResult.answer.confidence} confidence
                      </span>
                      <button
                        type="button"
                        onClick={() => setAskResult(null)}
                        className="ml-auto text-[10.5px] text-fog-500 hover:text-fog-200"
                      >
                        clear
                      </button>
                    </div>
                    <p className="max-h-[220px] overflow-y-auto whitespace-pre-wrap text-[12px] leading-[1.55] text-fog-200">
                      {askResult.answer.answer.trim()}
                    </p>
                    {askResult.answer.recommendedActions.length > 0 ? (
                      <ul className="mt-2 space-y-1 border-t border-[color:var(--line-soft)] pt-2">
                        {askResult.answer.recommendedActions.slice(0, 4).map((a, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-[11.5px] text-fog-300">
                            <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-violet-soft" strokeWidth={1.8} />
                            <span>
                              <span className="font-mono text-[10.5px] text-violet-soft">{a.kind}</span> {a.detail}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </RailCard>

            {/* Metrics quick-look */}
            <RailCard
              title="Metrics"
              icon={<Gauge className="h-3.5 w-3.5 text-fog-400" strokeWidth={1.8} />}
              action={{ label: "Open", onClick: () => navigate({ kind: "metrics" }) }}
            >
              <div className="flex items-stretch divide-x divide-[color:var(--line-soft)]">
                <Stat label="Today" value={todaySpend == null ? "-" : `$${todaySpend.toFixed(2)}`} />
                <Stat label="Active" value={`${counts?.runningTaskIds.length ?? 0}`} />
                <Stat label="Queue" value={`${counts?.queueLength ?? 0}`} />
              </div>
            </RailCard>

            {recent.length > 0 ? (
              <RailCard title="Recent runs" icon={<Activity className="h-3.5 w-3.5 text-fog-400" strokeWidth={1.8} />} action={{ label: "All", onClick: () => navigate({ kind: "runs" }) }}>
                <ul className="flex flex-col">
                  {recent.slice(0, 4).map((r: RunState) => (
                    <li key={r.runId}>
                      <button
                        type="button"
                        onClick={() => navigate({ kind: "run", runId: r.runId })}
                        className="flex w-full items-center gap-2 px-1.5 py-1.5 text-left transition hover:bg-fog-100/[0.04]"
                      >
                        <RunStatusBadge status={r.status} compact />
                        <span className="flex-1 truncate text-[12px] text-fog-200">{r.displayName || r.task}</span>
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

// Right-rail summary: just enough to recognize the pinned flow. The full
// step/seat breakdown lives in the "Steps & seats" disclosure under the Flow
// picker (so the narrow rail doesn't carry a cramped wall of steps).
function FlowSummary({ flow }: { flow: DiscoveredFlow | null }) {
  if (!flow) {
    return (
      <div className="slab-flat p-4 text-[12.5px] text-fog-400">
        Pick a flow to preview its steps - or leave it unpinned and the
        orchestrator chooses for the task.
      </div>
    );
  }
  const steps = flow.definition.steps ?? [];
  const seats = Object.keys(flow.definition.seats ?? {});
  return (
    <div className="brand-callout p-3">
      <div className="font-display text-[14px] font-medium text-fog-100">{flow.definition.label}</div>
      <div className="mt-0.5 font-mono text-[10.5px] text-fog-400">
        {flow.id} · {steps.length} steps · {seats.length} seats
      </div>
      {flow.definition.description ? (
        <p className="mt-2 line-clamp-2 text-[11.5px] leading-[1.5] text-fog-300">{flow.definition.description}</p>
      ) : null}
      <div className="mt-2">
        <StepPips steps={steps} active />
      </div>
    </div>
  );
}

// The full step/seat breakdown, rendered inside the Flow disclosure.
function FlowSteps({ flow }: { flow: DiscoveredFlow }) {
  const steps = flow.definition.steps ?? [];
  return (
    <div className="p-3">
      {flow.definition.description ? (
        <p className="mb-2.5 px-1 text-[11.5px] leading-[1.5] text-fog-300">{flow.definition.description}</p>
      ) : null}
      <ol className="flex flex-col gap-1">
        {steps.map((s) => (
          <li key={s.id} className="flex items-center gap-2.5 px-1.5 py-1">
            <StepKindDot kind={s.kind} />
            <span className="flex-1 truncate text-[12px] text-fog-200">{s.label}</span>
            <span className="font-mono text-[10px] text-fog-500">{s.seat || s.kind}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function StepKindDot({ kind }: { kind: string }) {
  const tone =
    kind === "review-turn" ? "bg-violet-soft" : kind === "validation" ? "bg-fog-500" : kind === "approval-gate" ? "bg-warn" : "bg-fog-200";
  return <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone)} aria-hidden />;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 px-3 py-1.5">
      <div className="text-[9.5px] uppercase tracking-[0.12em] text-fog-500">{label}</div>
      <div className="mt-0.5 font-mono text-[14px] text-fog-100">{value}</div>
    </div>
  );
}

function RailCard({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  action?: { label: string; onClick: () => void };
  children: React.ReactNode;
}) {
  return (
    <div className="slab-flat overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-[color:var(--line-soft)] px-3 py-2">
        {icon}
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-fog-400">{title}</span>
        {action ? (
          <button type="button" onClick={action.onClick} className="ml-auto text-[11px] text-fog-500 hover:text-fog-200">
            {action.label}
          </button>
        ) : null}
      </div>
      <div className="p-2">{children}</div>
    </div>
  );
}


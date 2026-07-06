import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  Check,
  ChevronRight,
  Compass,
  Copy,
  Gauge,
  LayoutGrid,
  Lock,
  MessagesSquare,
  Play,
  Sparkles,
  Terminal,
} from "lucide-react";
import { api } from "../../lib/api.js";
import { navigate } from "../App.js";
import { cn } from "../../components/design/cn.js";
import { Button } from "../../components/design/Button.js";
import { StatTile } from "../../components/design/StatTile.js";
import { EntityIcon, FlowIcon, type EntityKind } from "../../components/design/EntityIcon.js";
import { FlowBars } from "../../components/design/FlowBars.js";
import { RunStatusBadge } from "../../components/runs/RunStatusBadge.js";
import type {
  ConsultResult,
  DiscoveredFlow,
  PersonaSummary,
  ProjectMetadata,
  RunState,
  TaskSuggestion,
} from "../../lib/types.js";

/**
 * Run composition as a full-page task command center (#/compose). This is the
 * page-scale sibling of Mission Control's `MissionComposer`, so it shares that
 * canonical idiom 1:1 (coal/chalk/violet-soft, `PickCard` flow/crew tiles with
 * the `FlowBars` step-meter, `EntityIcon` identity glyphs, recessed `Section`
 * wells) and adds the richer surface a dedicated page affords: a live `vibe run`
 * command mirror (CLI = TUI = UI), the selected flow's declared inputs, an
 * inline "ask the supervisor" rail, a metrics quick-look, and recent runs.
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
  // Permission mode: read-only is the strict end of the same axis, so it's
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

  // "Plan" = start the Spec-up phase from this brief instead of building straight
  // away: launches the read-only intake run that asks the gap questions, then
  // hands off to the chosen flow once the spec is approved. Mirrors
  // `vibe spec-up start`; only the brief (+ optional persona + build-target flow)
  // applies - run mode / crew / tuning are execution-time concerns.
  async function plan() {
    const typed = brief.trim();
    if (!typed) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.specUpIntake({
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
  // pinned flow, so its required params don't gate spec-up.
  const canPlan = brief.trim().length > 0 && !busy;
  const recent = meta?.recentRuns ?? [];
  const counts = meta?.counts;
  const crews = meta?.crews ?? [];

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

  // The launch button states its own blocker in its label (contract rule), so no
  // separate dot+sentence "readiness" text sits beside it.
  const startLabel = busy
    ? "Starting…"
    : brief.trim().length === 0
      ? "Add a task brief to start"
      : missingRequired.length > 0
        ? "Fill required inputs"
        : "Start run";

  return (
    <div className="font-jakarta px-10 py-7 fade-up">
      <header className="mb-6">
        <h1 className="text-[24px] font-extrabold tracking-[-0.02em] text-chalk-100">
          New run
        </h1>
      </header>

      {/* Contained header: the page's intent + the live command mirror (CLI =
          TUI = UI) in one framed block, not loose grey text on the canvas. */}
      <section className="mb-6 flex flex-wrap items-start gap-4 rounded-[20px] border border-[color:var(--line)] bg-coal-600 p-5">
        <p className="min-w-0 flex-1 max-w-[72ch] text-[13px] leading-[1.55] text-chalk-300">
          Describe the change or pick one up from your roadmap, choose the flow
          and crew, and start. The run plans, builds, reviews, and verifies, then
          stops before anything ships.
        </p>
        <button
          type="button"
          onClick={copyCmd}
          title={`Copy - run this from the terminal or \`vibe shell\`:\n${runCmd}`}
          className="group hidden w-[clamp(260px,30vw,460px)] shrink-0 items-center gap-2 rounded-[12px] border border-[color:var(--line)] bg-coal-800 px-3 py-2 text-left transition hover:border-violet-soft/40 md:flex"
        >
          <Terminal className="h-3.5 w-3.5 shrink-0 text-violet-soft" strokeWidth={1.8} />
          <span className="select-none text-chalk-400">$</span>
          <code className="mono min-w-0 flex-1 truncate text-[11.5px] text-chalk-300">{runCmd}</code>
          <span className="flex shrink-0 items-center gap-1 text-[10.5px] font-medium text-chalk-400 group-hover:text-chalk-300">
            {cmdCopied ? <Check className="h-3 w-3" strokeWidth={2.2} /> : <Copy className="h-3 w-3" strokeWidth={1.8} />}
            {cmdCopied ? "copied" : "copy"}
          </span>
        </button>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* ── Composition ──────────────────────────────────────────────── */}
        <div className="lg:col-span-8">
          <div className="flex flex-col gap-6 rounded-[22px] border border-[color:var(--line)] bg-coal-600 p-5 lg:p-6">
            {/* Task: brief + roadmap pickup, one unified source of intent */}
            <div>
              <h2 className="mb-2.5 text-[16px] font-bold text-chalk-100">Task</h2>
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void start();
                }}
                placeholder="Add structured logging to the settings save handler"
                className="min-h-[112px] w-full resize-y rounded-[14px] border border-[color:var(--line-strong)] bg-coal-800 px-4 py-3 text-[14px] leading-[1.6] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none"
              />
              {suggestions.length > 0 ? (
                <div className="mt-2.5 rounded-[16px] border border-[color:var(--line)] bg-coal-800 p-3">
                  <div className="mb-2 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-violet-vivid" strokeWidth={1.9} />
                    <span className="text-[12px] font-semibold text-violet-vivid">
                      Or pick up from your roadmap
                    </span>
                    <button
                      type="button"
                      onClick={() => navigate({ kind: "board" })}
                      className="ml-auto flex items-center gap-1 text-[11.5px] font-semibold text-violet-soft transition hover:text-violet-soft/80"
                    >
                      <LayoutGrid className="h-3.5 w-3.5" strokeWidth={1.9} /> Board
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions.slice(0, 6).map((s) => (
                      <button
                        key={s.taskId}
                        type="button"
                        disabled={busy}
                        onClick={() => start(s.taskId)}
                        title={s.reason}
                        className="flex items-center gap-2 rounded-[10px] border border-[color:var(--line)] bg-coal-600 px-2.5 py-1.5 transition hover:bg-coal-500 disabled:opacity-50"
                      >
                        <span className="max-w-[220px] truncate text-[12px] text-chalk-100">{s.title}</span>
                        <span className={cn("mono text-[10px] font-semibold", s.ready ? "text-emerald-400" : "text-amber-soft")}>
                          {s.ready ? "ready" : `${s.openBlockers.length}b`}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Flow */}
            <Section title="Flow" entity="flow">
              {flows.length === 0 ? (
                <p className="px-1 py-1 text-[12.5px] text-chalk-400">No flows discovered.</p>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5">
                  <PickCard
                    on={!flowId}
                    entity="flow"
                    onClick={() => setFlowId("")}
                    title="Auto"
                    meta="orchestrator picks"
                  >
                    <div className="my-2.5 flex h-6 items-center text-chalk-400">
                      <FlowIcon size={22} />
                    </div>
                  </PickCard>
                  {flows.map((f) => {
                    const steps = f.definition.steps ?? [];
                    const seats = Object.keys(f.definition.seats ?? {}).length;
                    const on = f.id === flowId;
                    return (
                      <PickCard
                        key={f.id}
                        on={on}
                        entity="flow"
                        onClick={() => setFlowId(on ? "" : f.id)}
                        title={f.definition.label}
                        isDefault={f.id === defaultFlow}
                        meta={`${steps.length} steps · ${seats} seats`}
                      >
                        <FlowBars steps={steps} on={on} />
                      </PickCard>
                    );
                  })}
                </div>
              )}
              {selectedFlow ? (
                <details className="group mt-2.5 rounded-[12px] border border-[color:var(--line)] bg-coal-600">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2.5 text-[12px] text-chalk-300 transition hover:text-chalk-100 [&::-webkit-details-marker]:hidden">
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-chalk-400 transition-transform group-open:rotate-90" strokeWidth={1.9} />
                    <span className="font-semibold">Steps &amp; seats</span>
                    <span className="mono text-[10.5px] text-chalk-400">
                      {selectedFlow.definition.label} · {(selectedFlow.definition.steps ?? []).length} steps
                    </span>
                  </summary>
                  <div className="border-t border-[color:var(--line-soft)]">
                    <FlowSteps flow={selectedFlow} />
                  </div>
                </details>
              ) : null}
            </Section>

            {/* Flow inputs - the selected flow's declared params. Required ones
                must be filled before the run starts (they ARE part of the task). */}
            {flowParams && Object.keys(flowParams).length > 0 ? (
              <Section title="Inputs">
                <div className="grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2">
                  {Object.entries(flowParams).map(([name, def]) => {
                    const pf = paramPrefill[name];
                    const val =
                      paramValues[name] ??
                      (def.secret ? "" : pf && !pf.secret ? pf.value : def.default != null ? String(def.default) : "");
                    const set = (v: string) => setParamValues((c) => ({ ...c, [name]: v }));
                    return (
                      <label key={name} className="flex flex-col gap-1.5">
                        <span className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
                          <span className="font-semibold text-chalk-100">{name}</span>
                          {def.required ? <span className="text-violet-soft">*</span> : null}
                          {def.shared ? <span className="text-chalk-400" title="Project-global">· shared</span> : null}
                          {pf && !def.secret ? (
                            <span className="text-emerald-400/90" title={`From the project profile (${pf.setBy})`}>
                              · {pf.setBy === "generated" ? "generated" : "saved"}
                            </span>
                          ) : null}
                          {def.description ? <span className="text-chalk-400">· {def.description}</span> : null}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {def.type === "boolean" ? (
                            <MiniToggle on={val === "true"} set={(v) => set(v ? "true" : "false")} label={name} title={name} />
                          ) : def.type === "enum" && def.values?.length ? (
                            <div className="flex flex-wrap gap-1.5">
                              {def.values.map((opt) => (
                                <MiniToggle key={opt} on={val === opt} set={() => set(opt)} label={opt} title={opt} />
                              ))}
                            </div>
                          ) : (
                            <input
                              type={def.secret ? "text" : def.type === "number" ? "number" : "text"}
                              value={val}
                              onChange={(e) => set(e.target.value)}
                              placeholder={def.secret ? "env var NAME (e.g. OPENAI_API_KEY)" : def.type}
                              className="min-w-0 flex-1 rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 px-2.5 py-2 text-[12.5px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none"
                            />
                          )}
                          {def.generate && !def.secret ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={generating === name}
                              onClick={() => generateParam(name)}
                              title={def.generate.instruction}
                              iconLeft={<Sparkles className="h-3 w-3" strokeWidth={1.9} />}
                              className="shrink-0"
                            >
                              {generating === name ? "…" : "Generate"}
                            </Button>
                          ) : null}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </Section>
            ) : null}

            {/* Crew - card-based selection, same idiom as Flow */}
            {crews.length > 0 ? (
              <Section title="Crew" entity="crew">
                <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5">
                  {crews.map((c) => {
                    const on = c.id === crewId;
                    const profiles = [...new Set(c.roles.map((r) => r.profile))];
                    return (
                      <PickCard
                        key={c.id}
                        on={on}
                        entity="crew"
                        onClick={() => setCrewId(c.id)}
                        title={c.label}
                        isDefault={c.id === meta?.defaultCrew}
                        meta={`${c.roles.length} roles · ${profiles.slice(0, 3).join(", ")}`}
                      >
                        <div className="my-2 flex flex-wrap gap-1">
                          {c.roles.slice(0, 4).map((r) => (
                            <span
                              key={r.id}
                              className="rounded-[6px] bg-coal-500 px-1.5 py-px text-[10px] font-medium text-chalk-300"
                            >
                              {r.label}
                            </span>
                          ))}
                          {c.roles.length > 4 ? (
                            <span className="text-[10px] text-chalk-400">+{c.roles.length - 4}</span>
                          ) : null}
                        </div>
                      </PickCard>
                    );
                  })}
                </div>
              </Section>
            ) : null}

            {/* Configuration */}
            <Section title="Configuration">
              <div className="flex flex-col gap-4">
                <div>
                  <div className="mb-2 text-[11.5px] font-semibold text-chalk-300">Permission</div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(["auto", "ask", "accept-edits", "read-only"] as const).map((m) => (
                      <MiniToggle
                        key={m}
                        on={m === permissionMode}
                        set={() => setPermissionMode(m)}
                        label={m}
                        title={`Permission mode: ${m}`}
                        icon={m === "read-only" ? <Lock className="h-3 w-3" strokeWidth={1.9} /> : undefined}
                      />
                    ))}
                    <span className="mx-1 h-5 w-px bg-[color:var(--line)]" aria-hidden />
                    <MiniToggle on={unattended} set={setUnattended} label="Unattended" title="The run never pauses for a human" />
                  </div>
                  <div className="mt-2.5 text-[11.5px] leading-[1.55] text-chalk-300">
                    {readOnly || unattended || permissionMode === "ask" || permissionMode === "accept-edits" ? (
                      <ul className="space-y-1.5">
                        {readOnly ? (
                          <ModeNote icon={<Lock className="mt-0.5 h-3 w-3 shrink-0 text-violet-soft" strokeWidth={1.9} />}>
                            <span className="font-semibold text-chalk-100">Read-only is enforced.</span> It overrides the crew&apos;s write and execute permissions: every role runs read-only (plans and proposes, never writes), the write / validate / verify steps are skipped, and apply, validate, and revert are refused.
                          </ModeNote>
                        ) : null}
                        {permissionMode === "ask" ? (
                          <ModeNote>
                            <span className="font-semibold text-chalk-100">Ask.</span> The agent writes, then every resulting change waits for your approval before it&apos;s kept - reject and the worktree is rolled back.
                          </ModeNote>
                        ) : null}
                        {permissionMode === "accept-edits" ? (
                          <ModeNote>
                            <span className="font-semibold text-chalk-100">Accept-edits.</span> Changes auto-apply, but the run does not auto-complete - it holds for your sign-off, then resumes to merge-ready on approval.
                          </ModeNote>
                        ) : null}
                        {unattended ? (
                          <ModeNote>
                            <span className="font-semibold text-chalk-100">Unattended.</span> The run never pauses for a human: approval gates auto-resolve after a timeout and a budget or resilience limit ends the run instead of waiting.
                          </ModeNote>
                        ) : null}
                      </ul>
                    ) : (
                      <span className="text-chalk-400">
                        Default: agents can write inside the run&apos;s worktree and the run pauses for you at approval gates. Nothing is ever pushed or merged.
                      </span>
                    )}
                  </div>
                </div>

                <div className="border-t border-[color:var(--line-soft)] pt-3.5">
                  <div className="mb-2 text-[11.5px] font-semibold text-chalk-300">Tuning</div>
                  <div className="flex flex-wrap gap-1.5">
                    <MiniToggle on={concise} set={setConcise} label="Concise" title="Ask agents to keep output short" />
                    <MiniToggle on={forceSelect} set={setForceSelect} label="Auto-pick flow" title="Let the orchestrator choose the flow when none is pinned" />
                  </div>
                </div>

                {personas.length > 0 ? (
                  <div className="border-t border-[color:var(--line-soft)] pt-3.5">
                    <div className="mb-2 flex items-center gap-1.5 text-[11.5px] font-semibold text-chalk-300">
                      <EntityIcon entity="persona" size={14} className="text-violet-soft" /> Supervisor
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {personas.map((p) => {
                        const on = p.id === personaId;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setPersonaId(p.id)}
                            title={p.description}
                            className={cn(
                              "rounded-[9px] px-2.5 py-1 text-[12px] font-medium transition",
                              on
                                ? "bg-violet-soft/20 text-violet-soft"
                                : "bg-coal-800 text-chalk-400 hover:text-chalk-100",
                            )}
                          >
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </Section>

            {/* Start */}
            <div className="flex flex-wrap items-center gap-3 border-t border-[color:var(--line)] pt-5">
              <Button
                variant="primary"
                size="lg"
                disabled={!canStart}
                onClick={() => start()}
                iconLeft={<Play className="h-3.5 w-3.5" strokeWidth={2.4} />}
              >
                {startLabel}
              </Button>
              <Button
                variant="outline"
                size="lg"
                disabled={!canPlan}
                onClick={() => plan()}
                title="Spec-up first: answer a few scoping questions, then build."
                iconLeft={<Compass className="h-3.5 w-3.5" strokeWidth={2.2} />}
              >
                Plan first
              </Button>
              {missingRequired.length > 0 ? (
                <span className="text-[11.5px] text-amber-soft">
                  Required input{missingRequired.length > 1 ? "s" : ""}: {missingRequired.join(", ")}
                </span>
              ) : (
                <span className="text-[11.5px] text-chalk-400">
                  Nothing pushes or merges. The run stops at merge-ready, blocked, or failed.
                </span>
              )}
            </div>
            {error ? (
              <div className="rounded-[12px] border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-300">
                {error}
              </div>
            ) : null}
          </div>
        </div>

        {/* ── Right rail: working context + utilities ──────────────────── */}
        <aside className="flex flex-col gap-4 lg:col-span-4 lg:sticky lg:top-6 lg:self-start">
          <FlowSummary flow={selectedFlow} />

          {/* Ask the supervisor - inline, no navigation away */}
          <RailCard title="Ask the supervisor" icon={<MessagesSquare className="h-4 w-4 text-violet-soft" strokeWidth={1.9} />}>
            <textarea
              value={askQ}
              onChange={(e) => setAskQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask();
              }}
              rows={2}
              placeholder="What should I run? Is this risky? What did we already ship here?"
              className="w-full resize-none rounded-[12px] border border-[color:var(--line-strong)] bg-coal-800 px-3 py-2 text-[12.5px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none"
            />
            <div className="mt-2 flex items-center gap-2">
              <Button variant="secondary" size="sm" disabled={!askQ.trim() || askBusy} onClick={ask}>
                {askBusy ? "Asking…" : "Ask"}
              </Button>
              <span className="mono text-[10.5px] text-chalk-400">read-only · ⌘↵</span>
            </div>
            {askErr ? <p className="mt-2 text-[11.5px] text-rose-300">{askErr}</p> : null}
            {askResult ? (
              <div className="mt-3 border-t border-[color:var(--line-soft)] pt-3">
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className={cn(
                      "mono text-[10.5px] font-semibold",
                      askResult.answer.confidence === "high"
                        ? "text-emerald-400"
                        : askResult.answer.confidence === "medium"
                          ? "text-amber-soft"
                          : "text-chalk-400",
                    )}
                  >
                    {askResult.answer.confidence} confidence
                  </span>
                  <button
                    type="button"
                    onClick={() => setAskResult(null)}
                    className="ml-auto text-[11px] font-medium text-chalk-400 transition hover:text-chalk-100"
                  >
                    clear
                  </button>
                </div>
                <p className="max-h-[220px] overflow-y-auto whitespace-pre-wrap text-[12.5px] leading-[1.55] text-chalk-300">
                  {askResult.answer.answer.trim()}
                </p>
                {askResult.answer.recommendedActions.length > 0 ? (
                  <ul className="mt-2.5 space-y-1.5 border-t border-[color:var(--line-soft)] pt-2.5">
                    {askResult.answer.recommendedActions.slice(0, 4).map((a, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[11.5px] text-chalk-300">
                        <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-violet-soft" strokeWidth={1.9} />
                        <span>
                          <span className="mono text-[10.5px] font-semibold text-violet-soft">{a.kind}</span> {a.detail}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </RailCard>

          {/* Metrics quick-look */}
          <RailCard
            title="Metrics"
            icon={<Gauge className="h-4 w-4 text-violet-soft" strokeWidth={1.9} />}
            action={{ label: "Open", onClick: () => navigate({ kind: "metrics" }) }}
          >
            <div className="flex flex-wrap items-stretch gap-1">
              <StatTile value={todaySpend == null ? "-" : `$${todaySpend.toFixed(2)}`} label="today" />
              <StatTile value={counts?.runningTaskIds.length ?? 0} label="active" />
              <StatTile value={counts?.queueLength ?? 0} label="queue" />
            </div>
          </RailCard>

          {recent.length > 0 ? (
            <RailCard
              title="Recent runs"
              icon={<Activity className="h-4 w-4 text-violet-soft" strokeWidth={1.9} />}
              action={{ label: "All", onClick: () => navigate({ kind: "runs" }) }}
            >
              <ul className="flex flex-col gap-0.5">
                {recent.slice(0, 4).map((r: RunState) => (
                  <li key={r.runId}>
                    <button
                      type="button"
                      onClick={() => navigate({ kind: "run", runId: r.runId })}
                      className="flex w-full items-center gap-2 rounded-[10px] px-2 py-1.5 text-left transition hover:bg-coal-500"
                    >
                      <RunStatusBadge status={r.status} compact />
                      <span className="flex-1 truncate text-[12px] text-chalk-300">{r.displayName || r.task}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </RailCard>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

// A labeled config block: a violet section title over a coal-600 framed card,
// matching MissionComposer's `Section` so the page-scale composer reads the same
// as the dashboard one.
function Section({
  title,
  entity,
  children,
}: {
  title: string;
  entity?: EntityKind;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-1.5">
        {entity ? <EntityIcon entity={entity} size={15} className="text-violet-vivid" /> : null}
        <span className="text-[12px] font-semibold text-violet-vivid">{title}</span>
      </div>
      {children}
    </section>
  );
}

// A selectable flow/crew tile - the canonical composer pick card (EntityIcon +
// bold name + optional meter/role chips), ported from MissionComposer so the
// two composers can't drift.
function PickCard({
  on,
  onClick,
  title,
  entity,
  isDefault,
  children,
  meta,
}: {
  on: boolean;
  onClick: () => void;
  title: string;
  entity?: EntityKind;
  isDefault?: boolean;
  children?: ReactNode;
  meta?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-[14px] border p-3 text-left transition",
        on
          ? "border-violet-soft/70 bg-coal-400"
          : "border-[color:var(--line)] bg-coal-500 hover:border-[color:var(--line-strong)] hover:bg-coal-400",
      )}
    >
      <div className="flex items-center gap-1.5">
        {entity ? (
          <EntityIcon entity={entity} size={16} className={cn("shrink-0", on ? "text-violet-soft" : "text-chalk-400")} />
        ) : null}
        <span className="truncate text-[13.5px] font-bold text-chalk-100">{title}</span>
        {isDefault ? <span className="ml-auto shrink-0 text-[10px] font-bold text-chalk-400">default</span> : null}
      </div>
      {children}
      {meta ? <div className="text-[11px] text-chalk-400">{meta}</div> : null}
    </button>
  );
}

// Compact inline toggle / segment button - MissionComposer's `MiniToggle`.
function MiniToggle({
  on,
  set,
  label,
  title,
  icon,
}: {
  on: boolean;
  set: (v: boolean) => void;
  label: string;
  title: string;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      title={title}
      onClick={() => set(!on)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[9px] border px-2.5 py-1 text-[11.5px] font-medium transition",
        on
          ? "border-violet-soft/55 bg-violet-soft/[0.14] text-violet-vivid"
          : "border-[color:var(--line)] text-chalk-400 hover:border-[color:var(--line-strong)] hover:text-chalk-100",
      )}
    >
      {on && !icon ? <Check className="h-3 w-3 shrink-0" strokeWidth={2.6} aria-hidden /> : icon}
      {label}
    </button>
  );
}

// One bullet in the run-mode explanation list. Default marker is a small violet
// dot; pass an icon (e.g. the lock) to replace it.
function ModeNote({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-1.5">
      {icon ?? <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-violet-soft" aria-hidden />}
      <span>{children}</span>
    </li>
  );
}

// Right-rail summary: just enough to recognize the pinned flow. The full
// step/seat breakdown lives in the "Steps & seats" disclosure under the Flow
// picker (so the narrow rail doesn't carry a cramped wall of steps).
function FlowSummary({ flow }: { flow: DiscoveredFlow | null }) {
  if (!flow) {
    return (
      <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4 text-[12.5px] leading-[1.55] text-chalk-400">
        Pick a flow to preview its steps - or leave it unpinned and the
        orchestrator chooses for the task.
      </div>
    );
  }
  const steps = flow.definition.steps ?? [];
  const seats = Object.keys(flow.definition.seats ?? {});
  return (
    <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4">
      <div className="flex items-center gap-1.5">
        <EntityIcon entity="flow" size={16} className="shrink-0 text-violet-soft" />
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-chalk-100">{flow.definition.label}</span>
      </div>
      <FlowBars steps={steps} />
      {flow.definition.description ? (
        <p className="line-clamp-2 text-[12px] leading-snug text-chalk-300">{flow.definition.description}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-stretch gap-1">
        <StatTile value={steps.length} label={steps.length === 1 ? "step" : "steps"} />
        <StatTile value={seats.length} label={seats.length === 1 ? "seat" : "seats"} />
        <StatTile value={flow.id} label="id" />
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
        <p className="mb-2.5 px-1 text-[11.5px] leading-[1.5] text-chalk-300">{flow.definition.description}</p>
      ) : null}
      <ol className="flex flex-col gap-1">
        {steps.map((s) => (
          <li key={s.id} className="flex items-center gap-2.5 px-1.5 py-1">
            <StepKindDot kind={s.kind} />
            <span className="flex-1 truncate text-[12px] text-chalk-300">{s.label}</span>
            <span className="mono text-[10px] text-chalk-400">{s.seat || s.kind}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function StepKindDot({ kind }: { kind: string }) {
  const tone =
    kind === "review-turn"
      ? "bg-violet-soft"
      : kind === "validation"
        ? "bg-sky-glow"
        : kind === "approval-gate"
          ? "bg-amber-soft"
          : "bg-chalk-400";
  return <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone)} aria-hidden />;
}

// A framed stat - bold value over a violet unit label, content-width. Same tile
// the flow card uses, so facts read as data, not a grey meta line.
function RailCard({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon?: ReactNode;
  action?: { label: string; onClick: () => void };
  children: ReactNode;
}) {
  return (
    <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4">
      <div className="mb-3 flex items-center gap-1.5">
        {icon}
        <span className="text-[12px] font-semibold text-violet-vivid">{title}</span>
        {action ? (
          <button
            type="button"
            onClick={action.onClick}
            className="ml-auto text-[11.5px] font-semibold text-violet-soft transition hover:text-violet-soft/80"
          >
            {action.label}
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

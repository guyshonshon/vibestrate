import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowRight, Check, Lock, Plus } from "lucide-react";
import { api } from "../../lib/api.js";
import { navigate } from "../../app/App.js";
import { EntityIcon, FlowIcon, type EntityKind } from "../design/EntityIcon.js";
import { FlowBars } from "../design/FlowBars.js";
import { ConsultOrb } from "../consult/ConsultOrb.js";
import { AssistPopover } from "./AssistPopover.js";
import { RunActions } from "./RunActions.js";
import { PhaseRail, RUN_TERMINAL, statusMessage } from "./runPhase.js";
import type {
  DiscoveredFlow,
  PersonaSummary,
  RunState,
  RunStatus,
  TaskSuggestion,
} from "../../lib/types.js";

type FlowParamDef = { required?: boolean; label?: string; default?: unknown; secret?: boolean };

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
      className={`w-full rounded-[14px] border p-3 text-left transition ${
        on
          ? "border-violet-soft/70 bg-coal-500"
          : "border-[color:var(--line)] bg-coal-600 hover:border-[color:var(--line-strong)]"
      }`}
    >
      <div className="flex items-center gap-1.5">
        {entity ? (
          <EntityIcon entity={entity} size={16} className={`shrink-0 ${on ? "text-violet-soft" : "text-chalk-400"}`} />
        ) : null}
        <span className="truncate text-[13.5px] font-bold text-chalk-100">{title}</span>
        {isDefault ? (
          <span className="ml-auto shrink-0 text-[10px] font-bold text-chalk-400">default</span>
        ) : null}
      </div>
      {children}
      {meta ? <div className="text-[11px] text-chalk-400">{meta}</div> : null}
    </button>
  );
}

// A labeled config block: optional entity icon + title over a recessed well, so
// each section (Flow, Crew, Run options) reads as its own framed container.
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
      <div className="rounded-[16px] border border-[color:var(--line)] bg-coal-800 p-3">{children}</div>
    </section>
  );
}

// Compact run-option toggle: a small inline switch + label. Several fit on one
// row, so run options stay tiny under the task brief.
function MiniToggle({
  on,
  set,
  label,
  title,
}: {
  on: boolean;
  set: (v: boolean) => void;
  label: string;
  title: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      title={title}
      onClick={() => set(!on)}
      className={`inline-flex items-center gap-1.5 rounded-[9px] border px-2.5 py-1 text-[11.5px] font-medium transition ${
        on
          ? "border-violet-soft/55 bg-violet-soft/[0.14] text-violet-vivid"
          : "border-[color:var(--line)] text-chalk-400 hover:border-[color:var(--line-strong)] hover:text-chalk-100"
      }`}
    >
      {on ? <Check className="h-3 w-3 shrink-0" strokeWidth={2.6} aria-hidden /> : null}
      {label}
    </button>
  );
}

// One readback line in the sticky run summary.
function SummaryRow({
  entity,
  icon,
  label,
  value,
  hint,
  muted,
}: {
  entity?: EntityKind;
  icon?: ReactNode;
  label: string;
  value: string;
  hint?: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-[12px] bg-coal-600 px-3 py-2.5">
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-coal-800 ${
          muted ? "text-chalk-400" : "text-chalk-300"
        }`}
      >
        {entity ? <EntityIcon entity={entity} size={15} /> : icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-violet-vivid">
          {label}
        </span>
        <span className="block truncate text-[13px] font-semibold text-chalk-100">{value}</span>
      </span>
      {hint ? <span className="shrink-0 text-[11px] text-chalk-400">{hint}</span> : null}
    </div>
  );
}

// The planned flow x crew relationship graph: an n8n-style plug graph. Compact
// nodes - flow seats on the left, crew roles on the right - each with a port nub
// on its facing edge, wired by bezier cables (one per role that fills a seat:
// role.seats.includes(seatId), the same rule the flow resolver uses). Narrow by
// construction (fixed-width node columns). Seats no role fills read amber (the
// run will pause to ask); roles that fill nothing dim.
const PB_GUT = 58;
const PB_ROWH = 44;

function PatchBay({
  flow,
  crew,
}: {
  flow: DiscoveredFlow | null;
  crew: { roles: Array<{ id: string; label: string; seats: string[]; profile: string }> } | null;
}) {
  const wrap = (body: ReactNode) => (
    <div className="w-full rounded-[16px] border border-[color:var(--line)] bg-coal-800 p-3">
      <div className="mb-2.5 flex items-center gap-1.5 text-[12px] font-semibold text-violet-vivid">
        <FlowIcon size={14} className="text-violet-vivid" />
        Flow × Crew
      </div>
      {body}
    </div>
  );

  if (!flow) {
    return wrap(
      <p className="max-w-[300px] text-[12px] leading-[1.5] text-chalk-400">
        Auto - the orchestrator picks the flow and fills its seats from the default crew. Pick a flow to see the wiring.
      </p>,
    );
  }
  const seats = Object.entries(flow.definition.seats ?? {});
  const roles = crew?.roles ?? [];
  if (seats.length === 0) {
    return wrap(<p className="text-[12px] text-chalk-400">This flow declares no seats.</p>);
  }

  const rows = Math.max(seats.length, roles.length, 1);
  const height = rows * PB_ROWH;
  const links: Array<{ si: number; rj: number }> = [];
  seats.forEach(([key], si) => {
    roles.forEach((r, rj) => {
      if (r.seats.includes(key)) links.push({ si, rj });
    });
  });
  const linkedSeats = new Set(links.map((l) => l.si));
  const usedRoles = new Set(links.map((l) => l.rj));
  const cy = (i: number) => i * PB_ROWH + PB_ROWH / 2;

  return wrap(
    <>
      <div className="flex items-start">
        {/* Seats - output plug on the right edge */}
        <div className="flex min-w-0 flex-1 flex-col">
          {seats.map(([key, seat], i) => {
            const on = linkedSeats.has(i);
            return (
              <div key={key} className="relative flex items-center" style={{ height: PB_ROWH }}>
                <div
                  className={`relative w-full rounded-[9px] border px-2.5 py-1.5 ${
                    on
                      ? "border-[color:var(--line-strong)] bg-coal-600"
                      : "border-amber-soft/45 bg-amber-soft/[0.07]"
                  }`}
                >
                  <span className="block truncate text-[12px] font-medium text-chalk-100">{seat.label}</span>
                  <span
                    className="absolute right-[-5px] top-1/2 h-[10px] w-[10px] -translate-y-1/2 rounded-full border-2"
                    style={{
                      borderColor: on ? "var(--color-violet-soft)" : "var(--color-amber-soft)",
                      background: on ? "var(--color-violet-soft)" : "var(--color-coal-800)",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Cables */}
        <div className="shrink-0" style={{ width: PB_GUT }}>
          <svg width={PB_GUT} height={height} className="block" aria-hidden>
            {links.map((l, k) => (
              <path
                key={k}
                d={`M 0 ${cy(l.si)} C ${PB_GUT * 0.5} ${cy(l.si)}, ${PB_GUT * 0.5} ${cy(l.rj)}, ${PB_GUT} ${cy(l.rj)}`}
                fill="none"
                stroke="var(--color-violet-soft)"
                strokeWidth="2"
                strokeLinecap="round"
                opacity="0.75"
              />
            ))}
          </svg>
        </div>

        {/* Roles - input plug on the left edge */}
        <div className="flex min-w-0 flex-1 flex-col">
          {roles.length === 0 ? (
            <div className="flex items-center px-2 text-[11px] text-chalk-400" style={{ height: PB_ROWH }}>
              default crew
            </div>
          ) : (
            roles.map((r, j) => {
              const used = usedRoles.has(j);
              return (
                <div key={r.id} className="relative flex items-center" style={{ height: PB_ROWH }}>
                  <div
                    className={`relative w-full rounded-[9px] border px-2.5 py-1 ${
                      used
                        ? "border-[color:var(--line-strong)] bg-coal-600"
                        : "border-[color:var(--line)] bg-coal-600 opacity-55"
                    }`}
                  >
                    <span className="block truncate text-[11.5px] font-medium leading-tight text-chalk-100">
                      {r.label}
                    </span>
                    <span className="block truncate text-[9.5px] leading-tight text-chalk-400">{r.profile}</span>
                    <span
                      className="absolute left-[-5px] top-1/2 h-[10px] w-[10px] -translate-y-1/2 rounded-full"
                      style={{ background: used ? "var(--color-violet-soft)" : "var(--color-coal-400)" }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      {linkedSeats.size < seats.length ? (
        <p className="mt-2 max-w-[360px] text-[11px] leading-[1.4] text-amber-soft">
          Some seats aren&apos;t filled by this crew - the run will pause to ask which role takes them.
        </p>
      ) : null}
    </>,
  );
}

// The Run summary morphs into this once a run is launched: a live phase panel
// (real status, polled - no timers) for the just-launched run, with "Start
// another run" to return to the launcher. The left column stays composable, so
// it never reads as a one-run tool.
function LaunchPanel({
  status,
  run,
  runId,
  taskTitle,
  onOpen,
  onStartAnother,
  onUpdated,
}: {
  status: RunStatus;
  run: RunState | null;
  runId: string;
  taskTitle: string;
  onOpen: () => void;
  onStartAnother: () => void;
  onUpdated: (run: RunState) => void;
}) {
  const terminal = RUN_TERMINAL.has(status);
  return (
    <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-800 p-4">
      <div className="flex items-start gap-3">
        <ConsultOrb size={38} state={terminal ? "idle" : "thinking"} />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-violet-vivid">
            {terminal ? `Run ${status.replace(/_/g, " ")}` : "Launching run"}
          </div>
          <div className="text-[15px] font-bold text-chalk-100">{statusMessage(status)}</div>
          <div className="mt-0.5 truncate text-[12px] text-chalk-400">
            {run?.displayName || taskTitle}
            {run?.branchName ? <span className="font-mono"> · {run.branchName}</span> : null}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <PhaseRail status={status} showLabels />
      </div>

      {!terminal ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <RunActions
            runId={runId}
            status={status}
            pauseRequested={run?.pauseRequested}
            onUpdated={onUpdated}
          />
        </div>
      ) : null}

      <button
        type="button"
        onClick={onOpen}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-[12px] bg-violet-soft px-4 py-2.5 text-[13.5px] font-bold text-coal-900 transition hover:bg-violet-soft/90"
      >
        Open run <ArrowRight className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onStartAnother}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-[12px] border border-[color:var(--line-strong)] px-4 py-2.5 text-[13px] font-semibold text-chalk-300 transition hover:text-chalk-100"
      >
        <Plus className="h-4 w-4" /> Start another run
      </button>
    </div>
  );
}

export function MissionComposer() {
  const [meta, setMeta] = useState<Awaited<ReturnType<typeof api.getProjectMetadata>> | null>(null);
  const [flows, setFlows] = useState<DiscoveredFlow[]>([]);
  const [defaultFlow, setDefaultFlow] = useState<string | null>(null);
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  const [suggestions, setSuggestions] = useState<TaskSuggestion[]>([]);

  const [task, setTask] = useState("");
  const [crewId, setCrewId] = useState<string>("");
  const [flowId, setFlowId] = useState<string>("");
  const [personaId, setPersonaId] = useState<string>("");
  const [concise, setConcise] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [unattended, setUnattended] = useState(false);
  const [forceSelect, setForceSelect] = useState(false);
  const [params, setParams] = useState<Record<string, string>>({});

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assistOpen, setAssistOpen] = useState(false);
  const [launchedRunId, setLaunchedRunId] = useState<string | null>(null);
  const [launchedRun, setLaunchedRun] = useState<RunState | null>(null);
  const [launchStatus, setLaunchStatus] = useState<RunStatus>("created");

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
      setSuggestions(s);
      if (m?.defaultCrew) setCrewId(m.defaultCrew);
      if (p) {
        setPersonas(p.personas);
        setPersonaId((cur) => cur || p.defaultPersona);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Poll the launched run's real status for the in-panel phase view. Stops on
  // terminal status, cancels on unmount / start-another. No scripted timers.
  useEffect(() => {
    if (!launchedRunId) return;
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const r = await api.getRun(launchedRunId);
        if (cancelled) return;
        setLaunchedRun(r);
        setLaunchStatus(r.status);
        if (RUN_TERMINAL.has(r.status)) return;
      } catch {
        // transient - retry next tick
      }
      if (!cancelled) timer = window.setTimeout(poll, 1500);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [launchedRunId]);

  const selectedFlow = useMemo(() => flows.find((f) => f.id === flowId) ?? null, [flows, flowId]);
  const flowParams = (selectedFlow?.definition.params ?? null) as Record<string, FlowParamDef> | null;
  const missing = flowParams
    ? Object.entries(flowParams)
        .filter(([n, d]) => d.required && !(params[n]?.trim()) && d.default === undefined)
        .map(([n]) => n)
    : [];

  const crews = meta?.crews ?? [];
  const canLaunch = task.trim().length > 0 && missing.length === 0 && !busy;

  const launch = async () => {
    if (!canLaunch) return;
    setBusy(true);
    setError(null);
    try {
      const filled = Object.fromEntries(Object.entries(params).filter(([, v]) => v && v.trim() !== ""));
      const r = await api.spawnRun({
        task: task.trim(),
        crewId: crewId || undefined,
        flow: flowId ? { id: flowId } : undefined,
        persona: personaId || undefined,
        params: Object.keys(filled).length > 0 ? filled : undefined,
        concise: concise || undefined,
        readOnly: readOnly || undefined,
        unattended: unattended || undefined,
        select: forceSelect || undefined,
      });
      // The Run summary morphs into a live phase panel for this run; the left
      // column stays a launcher. Nudge the dashboard so it also appears in
      // Active (runs are concurrent / worktree-isolated).
      setLaunchedRun(null);
      setLaunchStatus("created");
      setLaunchedRunId(r.runId);
      setBusy(false);
      window.dispatchEvent(new Event("vibestrate:runs-refresh"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const selectedCrew = useMemo(() => crews.find((c) => c.id === crewId) ?? null, [crews, crewId]);
  const modeLabel =
    readOnly && unattended
      ? "read-only · unattended"
      : readOnly
        ? "read-only"
        : unattended
          ? "unattended"
          : "interactive · writes";
  const tuning = [concise ? "concise" : null, forceSelect ? "auto-pick flow" : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="rounded-[22px] border border-[color:var(--line)] bg-coal-600 p-5 lg:p-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* ── LEFT: configuration ── */}
        <div className="flex min-w-0 flex-col gap-5 lg:col-span-7">
          <div>
            <h2 className="mb-2.5 text-[16px] font-bold text-chalk-100">New run</h2>
            <div className="relative">
              <textarea
                value={task}
                onChange={(e) => setTask(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void launch();
                }}
                rows={3}
                placeholder="Describe the change to run. e.g. Add retry with backoff to the uploader."
                className="w-full resize-none rounded-[14px] border border-[color:var(--line-strong)] bg-coal-800 py-3 pl-4 pr-14 text-[14px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setAssistOpen((v) => !v)}
                aria-label="Supervisor assist"
                aria-expanded={assistOpen}
                title="Supervisor assist"
                className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full transition hover:scale-105"
              >
                <ConsultOrb size={30} state={assistOpen ? "thinking" : "idle"} />
              </button>
              {assistOpen ? (
                <AssistPopover
                  suggestions={suggestions}
                  onPick={(t) => {
                    setTask(t);
                    setAssistOpen(false);
                  }}
                  onClose={() => setAssistOpen(false)}
                />
              ) : null}
            </div>

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <MiniToggle on={concise} set={setConcise} label="Concise" title="Terser supervisor output" />
              <MiniToggle on={readOnly} set={setReadOnly} label="Read-only" title="No file writes" />
              <MiniToggle on={unattended} set={setUnattended} label="Unattended" title="Skip approval pauses" />
              <MiniToggle on={forceSelect} set={setForceSelect} label="Force flow select" title="Always auto-pick a flow" />
            </div>
          </div>

          <Section title="Flow" entity="flow">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-2.5">
              <PickCard on={!flowId} entity="flow" onClick={() => setFlowId("")} title="Auto" meta="orchestrator picks">
                <div className="my-2.5 flex h-6 items-center text-chalk-400">
                  <FlowIcon size={22} />
                </div>
              </PickCard>
              {flows.map((f) => {
                const stepDefs = f.definition.steps ?? [];
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
                    meta={`${stepDefs.length} steps · ${seats} seats`}
                  >
                    <FlowBars steps={stepDefs} on={on} />
                  </PickCard>
                );
              })}
            </div>
          </Section>

          {crews.length > 0 ? (
            <Section title="Crew" entity="crew">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-2.5">
                <PickCard on={!crewId} entity="crew" onClick={() => setCrewId("")} title="Default" meta="project crew">
                  <div className="my-2.5 h-[18px]" />
                </PickCard>
                {crews.map((c) => {
                  const on = c.id === crewId;
                  return (
                    <PickCard
                      key={c.id}
                      on={on}
                      entity="crew"
                      onClick={() => setCrewId(c.id)}
                      title={c.label}
                      isDefault={c.id === meta?.defaultCrew}
                      meta={`${c.roles.length} roles`}
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
                        {c.roles.length > 4 ? <span className="text-[10px] text-chalk-400">+{c.roles.length - 4}</span> : null}
                      </div>
                    </PickCard>
                  );
                })}
              </div>
            </Section>
          ) : null}

          {/* Flow parameters - only when the selected flow declares them */}
          {flowParams && Object.keys(flowParams).length > 0 ? (
            <Section title="Flow parameters">
              <div className="flex flex-col gap-2.5">
                {Object.entries(flowParams).map(([name, def]) => (
                  <div key={name}>
                    <div className="mb-1 text-[11.5px] text-chalk-400">
                      {def.label ?? name}
                      {def.required ? <span className="text-violet-soft"> *</span> : null}
                    </div>
                    <input
                      value={params[name] ?? ""}
                      onChange={(e) => setParams((p) => ({ ...p, [name]: e.target.value }))}
                      type={def.secret ? "password" : "text"}
                      placeholder={def.default !== undefined ? `default: ${String(def.default)}` : ""}
                      className="w-full rounded-[12px] border border-[color:var(--line-strong)] bg-coal-600 px-3 py-2.5 text-[13px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            </Section>
          ) : null}
        </div>

        {/* ── RIGHT: flow×crew graph + run options + run summary ── */}
        <aside className="flex flex-col gap-4 self-start lg:col-span-5">
          <PatchBay flow={selectedFlow} crew={selectedCrew} />

          {launchedRunId ? (
            <LaunchPanel
              status={launchStatus}
              run={launchedRun}
              runId={launchedRunId}
              taskTitle={task}
              onOpen={() => navigate({ kind: "control", runId: launchedRunId })}
              onStartAnother={() => {
                setLaunchedRunId(null);
                setLaunchedRun(null);
                setTask("");
              }}
              onUpdated={(r) => {
                setLaunchedRun(r);
                setLaunchStatus(r.status);
              }}
            />
          ) : (
          <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-800 p-4">
            <h3 className="text-[13.5px] font-bold text-chalk-100">Run summary</h3>
            <p className="mt-1 text-[12px] leading-[1.5] text-chalk-400">
              What this run will do, before you start it.
            </p>

            <div className="mt-3 flex flex-col gap-2">
              <SummaryRow
                entity="flow"
                label="Flow"
                value={selectedFlow ? selectedFlow.definition.label : "Auto"}
                hint={selectedFlow ? `${(selectedFlow.definition.steps ?? []).length} steps` : "picks for you"}
                muted={!selectedFlow}
              />
              <SummaryRow
                entity="crew"
                label="Crew"
                value={selectedCrew ? selectedCrew.label : "Default"}
                hint={selectedCrew ? `${selectedCrew.roles.length} roles` : undefined}
                muted={!selectedCrew}
              />
              {personas.length > 0 ? (
                <div className="rounded-[12px] bg-coal-600 px-3 py-2.5">
                  <div className="mb-2 flex items-center gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-coal-800 text-chalk-300">
                      <EntityIcon entity="persona" size={15} />
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-violet-vivid">
                      Supervisor
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {personas.map((p) => {
                      const on = p.id === personaId;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setPersonaId(on ? "" : p.id)}
                          className={`rounded-[9px] px-2.5 py-1 text-[12px] font-medium transition ${
                            on
                              ? "bg-violet-soft/20 text-violet-soft"
                              : "bg-coal-800 text-chalk-400 hover:text-chalk-100"
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <SummaryRow entity="persona" label="Supervisor" value="Default" muted />
              )}
              <SummaryRow
                icon={<Lock className="h-4 w-4" strokeWidth={1.8} />}
                label="Mode"
                value={modeLabel}
                muted={!readOnly && !unattended}
              />
              {tuning ? (
                <SummaryRow
                  icon={<Check className="h-4 w-4" strokeWidth={1.8} />}
                  label="Tuning"
                  value={tuning}
                />
              ) : null}
            </div>

            <button
              onClick={() => void launch()}
              disabled={!canLaunch}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-[12px] bg-violet-soft px-4 py-3 text-[14px] font-bold text-coal-900 transition hover:bg-violet-soft/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? (
                "Launching…"
              ) : task.trim().length === 0 ? (
                "Add a task brief to launch"
              ) : missing.length > 0 ? (
                "Fill required inputs"
              ) : (
                <>
                  Launch run <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            {error ? (
              <div className="mt-3 rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
                {error}
              </div>
            ) : null}

            <div className="mt-3.5 border-t border-[color:var(--line)] pt-3 text-[11.5px] leading-[1.55] text-chalk-400">
              Nothing pushes or merges. The run stops at merge-ready, blocked, or failed - you review the diff before
              anything ships.
            </div>
          </div>
          )}
        </aside>
      </div>
    </div>
  );
}

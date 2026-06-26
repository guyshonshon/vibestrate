import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  Layers,
  Play,
  ShieldCheck,
  Terminal,
  Users,
} from "lucide-react";
import { api } from "../../lib/api.js";
import { navigate } from "../../app/App.js";
import { cn } from "../design/cn.js";
import type {
  DiscoveredFlow,
  PersonaSummary,
  ProjectMetadata,
} from "../../lib/types.js";

/**
 * MissionComposer - "start a run" in the vibestrate.com marketing language.
 *
 * Flat, SQUARE (radius 0), near-black, hairline borders, solid violet/emerald.
 * Left pane = the task + how it runs (mode, supervisor). Right rail = the run
 * summary plus a single "Composition" container: a flow picker, a crew picker,
 * and a live map of how the crew's roles fill the flow's seats (a flow declares
 * seats; a crew fills them). No new deps - reads the ink/fog/violet/emerald
 * tokens already ported 1:1 from the marketing site.
 */
type Mode = "interactive" | "readOnly" | "unattended";
type MetaCrew = NonNullable<ProjectMetadata["crews"]>[number];

export function MissionComposer() {
  const [meta, setMeta] = useState<ProjectMetadata | null>(null);
  const [flows, setFlows] = useState<DiscoveredFlow[]>([]);
  const [defaultFlow, setDefaultFlow] = useState<string | null>(null);
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);

  const [brief, setBrief] = useState("");
  const [flowId, setFlowId] = useState("");
  const [crewId, setCrewId] = useState<string | null>(null);
  const [personaId, setPersonaId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("interactive");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cmdCopied, setCmdCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [m, f, p] = await Promise.all([
        api.getProjectMetadata().catch(() => null),
        api
          .listFlows()
          .catch(() => ({ flows: [] as DiscoveredFlow[], defaultFlow: null })),
        api.listPersonas().catch(() => null),
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
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const crews = meta?.crews ?? [];
  const readOnly = mode === "readOnly";
  const unattended = mode === "unattended";
  const canStart = brief.trim().length > 0 && !busy;

  const selectedFlow = flows.find((f) => f.id === flowId) ?? null;
  const selectedCrew = crews.find((c) => c.id === crewId) ?? null;
  const selectedPersona = personas.find((p) => p.id === personaId) ?? null;
  const modeLabel =
    mode === "readOnly" ? "Read-only" : mode === "unattended" ? "Unattended" : "Interactive";

  const runCmd = useMemo(() => {
    const parts = ["vibe run", JSON.stringify(brief.trim() || "your task")];
    if (flowId) parts.push(`--flow ${flowId}`);
    if (crewId && crewId !== meta?.defaultCrew) parts.push(`--crew ${crewId}`);
    if (readOnly) parts.push("--read-only");
    if (unattended) parts.push("--unattended");
    if (personaId) parts.push(`--supervisor ${personaId}`);
    return parts.join(" ");
  }, [brief, flowId, crewId, readOnly, unattended, personaId, meta?.defaultCrew]);

  async function start() {
    const typed = brief.trim();
    if (!typed) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.spawnRun({
        task: typed,
        flow: flowId ? { id: flowId } : undefined,
        crewId: crewId ?? undefined,
        persona: personaId ?? undefined,
        readOnly: readOnly || undefined,
        unattended: unattended || undefined,
      });
      navigate({ kind: "run", runId: r.runId });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  async function copyCmd() {
    try {
      await navigator.clipboard.writeText(runCmd);
      setCmdCopied(true);
      window.setTimeout(() => setCmdCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="slab">
      <div className="grid grid-cols-1 lg:grid-cols-12">
        {/* ── Left: the task + how it runs ──────────────────────────────── */}
        <div className="flex flex-col gap-5 p-6 lg:col-span-7 lg:border-r lg:border-white/[0.08]">
          <h2 className="font-display text-[26px] font-semibold leading-none tracking-[-0.02em] text-fog-100">
            Start a&nbsp;
            <span className="border-b-[3px] border-violet-soft pb-0.5">run</span>
          </h2>

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
              className="s-focusable min-h-[120px] w-full resize-y border border-white/[0.1] bg-ink-200 px-4 py-3 text-[15px] leading-[1.55] text-fog-100 outline-none placeholder:text-fog-400"
            />
          </section>

          <section>
            <PaneTitle icon={<ShieldCheck className="h-4 w-4" strokeWidth={1.9} />}>
              Supervisor
            </PaneTitle>
            {personas.length > 0 ? (
              <Segmented
                options={personas.map((p) => ({ value: p.id, label: p.label }))}
                value={personaId}
                onChange={setPersonaId}
              />
            ) : null}
          </section>

          <section>
            <PaneTitle>Mode</PaneTitle>
            <Segmented
              options={[
                { value: "interactive", label: "Interactive" },
                { value: "readOnly", label: "Read-only" },
                { value: "unattended", label: "Unattended" },
              ]}
              value={mode}
              onChange={(v) => setMode(v as Mode)}
              fill
            />
            <p className="mt-2 text-[12.5px] leading-[1.5] text-fog-300">
              {mode === "readOnly"
                ? "Every role plans and proposes but never writes; apply, validate, and revert are refused."
                : mode === "unattended"
                  ? "The run never pauses for a human: approval gates auto-resolve and a budget or resilience limit ends it instead of waiting."
                  : "Agents write inside the run's worktree and pause at approval gates. Nothing is pushed or merged."}
            </p>
          </section>
        </div>

        {/* ── Right: run summary + the composition (flow x crew seats) ───── */}
        <aside className="flex flex-col gap-5 bg-ink-50 p-6 lg:col-span-5">
          <div>
            <PaneTitle>Run summary</PaneTitle>
            <div className="border border-white/[0.08]">
              <SummaryRow icon={<Layers className="h-3.5 w-3.5" strokeWidth={1.9} />} label="Flow" value={selectedFlow?.definition.label ?? "auto"} muted={!selectedFlow} />
              <SummaryRow icon={<Users className="h-3.5 w-3.5" strokeWidth={1.9} />} label="Crew" value={selectedCrew?.label ?? "default"} muted={!selectedCrew} />
              <SummaryRow icon={<ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.9} />} label="Supervisor" value={selectedPersona?.label ?? "default"} muted={!selectedPersona} />
              <SummaryRow icon={<Play className="h-3.5 w-3.5" strokeWidth={1.9} />} label="Mode" value={modeLabel} last />
            </div>
          </div>

          {/* Composition: pick flow + crew, see how the crew fills the seats */}
          <div>
            <PaneTitle icon={<Layers className="h-4 w-4" strokeWidth={1.9} />}>Composition</PaneTitle>
            <div className="border border-white/[0.1] bg-ink-100">
              <div className="grid grid-cols-2 gap-2.5 p-2.5">
                <div>
                  <div className="mb-1.5 text-[12px] text-fog-300">Flow</div>
                  <Dropdown
                    value={flowId || null}
                    placeholder="auto"
                    options={flows.map((f) => ({
                      value: f.id,
                      label: f.definition.label,
                      hint: `${(f.definition.steps ?? []).length}s · ${Object.keys(f.definition.seats ?? {}).length}·`,
                    }))}
                    onChange={(v) => setFlowId(v === flowId ? "" : v)}
                  />
                </div>
                <div>
                  <div className="mb-1.5 text-[12px] text-fog-300">Crew</div>
                  <Dropdown
                    value={crewId}
                    placeholder="default"
                    options={crews.map((c) => ({ value: c.id, label: c.label, hint: `${c.roles.length}r` }))}
                    onChange={setCrewId}
                  />
                </div>
              </div>
              <div className="border-t border-white/[0.1]">
                <div className="flex items-center justify-between px-4 pt-3 pb-1">
                  <span className="text-[12.5px] font-medium text-fog-200">Wiring</span>
                  <span className="mono text-[11px] text-fog-400">
                    {selectedFlow
                      ? `${Object.keys(selectedFlow.definition.seats ?? {}).length} seats · ${selectedCrew?.label ?? "default"}`
                      : "auto"}
                  </span>
                </div>
                <PatchBay flow={selectedFlow} crew={selectedCrew} />
              </div>
            </div>
          </div>

          {canStart ? (
            <div className="flex items-center gap-2 text-[13px] text-emerald-300">
              <Check className="h-4 w-4 shrink-0" strokeWidth={2.4} />
              <span>Ready to start. Nothing pushes or merges.</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[13px] text-amber-300">
              <span className="h-1.5 w-1.5 shrink-0" style={{ background: "var(--warn)" }} />
              <span>Write a task brief to start the run.</span>
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              disabled={!canStart}
              onClick={() => void start()}
              className="flex w-full items-center justify-center gap-2.5 px-5 py-4 text-[15px] font-semibold text-white transition-all disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                background: canStart ? "var(--color-violet-deep)" : "var(--color-ink-300)",
                boxShadow: canStart
                  ? "inset 0 1px 0 rgba(255,255,255,0.28), 0 10px 26px -12px var(--color-violet-deep)"
                  : "none",
              }}
            >
              <Play className="h-[18px] w-[18px]" strokeWidth={2.4} />
              {busy ? "Starting…" : "Start run"}
            </button>
            <button
              type="button"
              onClick={() => void copyCmd()}
              title={runCmd}
              className="flex w-full min-w-0 items-center gap-2 border border-white/[0.09] bg-ink-100 px-3 py-2.5 text-left hover:bg-ink-200"
            >
              <Terminal className="h-3.5 w-3.5 shrink-0 text-violet-soft" strokeWidth={1.9} />
              <code className="min-w-0 flex-1 truncate mono text-[11.5px] text-fog-300">{runCmd}</code>
              <span className="mono text-[11px] text-fog-400">
                {cmdCopied ? <Check className="h-3 w-3" strokeWidth={1.8} /> : <Copy className="h-3 w-3" strokeWidth={1.8} />}
              </span>
            </button>
          </div>

          {error ? (
            <div className="border border-rose-400/30 bg-rose-500/[0.06] px-3 py-2 text-[12.5px] text-rose-300">
              {error}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

/** Legible Bricolage section header (not a faint mono eyebrow). */
function PaneTitle({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <h3 className="mb-2.5 flex items-center gap-2 font-display text-[15.5px] font-semibold tracking-[-0.01em] text-fog-100">
      {icon ? <span className="text-violet-soft">{icon}</span> : null}
      {children}
    </h3>
  );
}

/** The dynamic layer: a patch-bay. Flow seats are sockets down the left, crew
 * roles are plugs down the right, and SVG cables wire each role into the seat
 * it fills. Unused crew plugs dim; open seats read neutral. */
function PatchBay({ flow, crew }: { flow: DiscoveredFlow | null; crew: MetaCrew | null }) {
  if (!flow) {
    return (
      <div className="px-4 py-4 text-[12.5px] leading-[1.5] text-fog-400">
        Auto - the orchestrator picks the flow and fills its seats from the default crew.
      </div>
    );
  }
  const seats = Object.entries(flow.definition.seats ?? {});
  const roles = crew?.roles ?? [];
  if (seats.length === 0) {
    return <div className="px-4 py-4 text-[12.5px] text-fog-400">This flow declares no seats.</div>;
  }
  const rowH = 46;
  const GUT = 54;
  const height = Math.max(seats.length, roles.length) * rowH;
  const links = seats
    .map(([key], si) => {
      const rj = roles.findIndex((r) => r.seats.includes(key));
      return rj >= 0 ? { si, rj } : null;
    })
    .filter((l): l is { si: number; rj: number } => l !== null);
  const usedRoles = new Set(links.map((l) => l.rj));
  const linkedSeats = new Set(links.map((l) => l.si));
  const cy = (i: number) => i * rowH + rowH / 2;
  return (
    <div className="px-3 pb-3 pt-2">
      <div className="mb-1.5 flex items-center justify-between mono text-[10.5px] uppercase tracking-[0.08em] text-fog-400">
        <span>Seats</span>
        <span>Crew</span>
      </div>
      <div className="flex items-start">
        {/* Seats (sockets) */}
        <div className="flex flex-1 flex-col">
          {seats.map(([key, seat], i) => {
            const on = linkedSeats.has(i);
            return (
              <div key={key} className="relative flex items-center" style={{ height: rowH }}>
                <div
                  className={cn(
                    "flex h-[34px] w-full items-center border pl-3 pr-5 text-[12.5px]",
                    on ? "border-violet-soft/40 bg-violet-soft/[0.08] text-fog-100" : "border-white/[0.1] bg-ink-200 text-fog-300",
                  )}
                >
                  <span className="truncate">{seat.label}</span>
                </div>
                <span
                  className="absolute right-[-6px] top-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    width: 12,
                    height: 12,
                    border: `2px solid ${on ? "var(--color-violet-soft)" : "rgba(255,255,255,0.22)"}`,
                    background: "var(--color-ink-0)",
                  }}
                />
              </div>
            );
          })}
        </div>
        {/* Cable gutter */}
        <div className="relative shrink-0" style={{ width: GUT }}>
          <svg width={GUT} height={height} className="block" aria-hidden>
            {links.map((l, k) => (
              <path
                key={k}
                d={`M 0 ${cy(l.si)} C ${GUT / 2} ${cy(l.si)}, ${GUT / 2} ${cy(l.rj)}, ${GUT} ${cy(l.rj)}`}
                fill="none"
                stroke="var(--emerald)"
                strokeWidth="1.6"
                opacity="0.65"
              />
            ))}
          </svg>
        </div>
        {/* Roles (plugs) */}
        <div className="flex flex-1 flex-col">
          {roles.length === 0 ? (
            <div className="flex h-[34px] items-center px-3 text-[12px] text-fog-400">default crew</div>
          ) : (
            roles.map((r, j) => {
              const used = usedRoles.has(j);
              return (
                <div key={r.id} className="relative flex items-center" style={{ height: rowH }}>
                  <span
                    className="absolute left-[-6px] top-1/2 z-10 -translate-y-1/2 rounded-full"
                    style={{ width: 12, height: 12, background: used ? "var(--emerald)" : "rgba(255,255,255,0.2)" }}
                  />
                  <div
                    className={cn(
                      "flex h-[34px] w-full flex-col justify-center border pl-5 pr-3",
                      used ? "border-emerald-400/30 bg-emerald-500/[0.06]" : "border-white/[0.1] bg-ink-200 opacity-55",
                    )}
                  >
                    <span className="truncate text-[12px] font-medium leading-tight text-fog-100">{r.label}</span>
                    <span className="mono truncate text-[10px] leading-tight text-fog-400">{r.profile}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

/** Compact flat dropdown (no deps). Closes on outside click or selection. */
function Dropdown({
  value,
  placeholder,
  options,
  onChange,
}: {
  value: string | null;
  placeholder: string;
  options: { value: string; label: string; hint?: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const cur = options.find((o) => o.value === value) ?? null;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 border border-white/[0.1] bg-ink-200 px-3 py-2 text-[13px] hover:bg-ink-300"
      >
        <span className={cn("truncate", cur ? "text-fog-100" : "text-fog-400")}>
          {cur?.label ?? placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-fog-400" strokeWidth={1.8} />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-[260px] overflow-auto border border-white/[0.16] bg-ink-100 shadow-[0_12px_30px_-12px_rgba(0,0,0,0.7)]">
          {options.map((o) => {
            const on = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px]",
                  on ? "text-white" : "text-fog-200 hover:bg-ink-300",
                )}
                style={on ? { background: "var(--color-violet-deep)" } : undefined}
              >
                <span className="truncate">{o.label}</span>
                {o.hint ? <span className="mono text-[10.5px] text-fog-400">{o.hint}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function Segmented({
  options,
  value,
  onChange,
  fill,
}: {
  options: { value: string; label: string }[];
  value: string | null;
  onChange: (v: string) => void;
  fill?: boolean;
}) {
  return (
    <div className={cn("inline-flex flex-wrap border border-white/[0.1] bg-ink-200", fill && "flex w-full")}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "px-4 py-2.5 text-[13px] font-medium transition-colors",
              i !== 0 && "border-l border-white/[0.1]",
              fill && "flex-1 text-center",
              on ? "text-white" : "text-fog-300 hover:bg-ink-300 hover:text-fog-100",
            )}
            style={on ? { background: "var(--color-violet-deep)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22)" } : undefined}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SummaryRow({
  icon,
  label,
  value,
  muted,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  muted?: boolean;
  last?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 px-3.5 py-2.5", !last && "border-b border-white/[0.07]")}>
      <span className="flex items-center gap-2 text-[13px] text-fog-300">
        <span className="text-violet-soft">{icon}</span>
        {label}
      </span>
      <span className={cn("truncate text-[13px] font-medium", muted ? "text-fog-400" : "text-fog-100")}>{value}</span>
    </div>
  );
}

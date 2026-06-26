import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Layers, Play, ShieldCheck, Terminal, Users } from "lucide-react";
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
 * Left pane = selection: task, flow cards, crew cards, supervisor, mode. Right
 * pane = the summary: a compact readback plus a "patch-bay" wireframe that wires
 * the chosen crew's roles into the chosen flow's seats (seats are sockets, roles
 * are plugs, SVG cables connect them). No new deps - reads the ink/fog/violet/
 * emerald tokens already ported 1:1 from the marketing site.
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
        {/* ── Left: selection ───────────────────────────────────────────── */}
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
              className="s-focusable min-h-[88px] w-full resize-y border border-white/[0.1] bg-ink-200 px-4 py-3 text-[15px] leading-[1.55] text-fog-100 outline-none placeholder:text-fog-400"
            />
          </section>

          <section>
            <PaneTitle icon={<Layers className="h-4 w-4" strokeWidth={1.9} />}>Flow</PaneTitle>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {flows.slice(0, 6).map((f) => {
                const steps = f.definition.steps ?? [];
                const seats = Object.keys(f.definition.seats ?? {}).length;
                const on = f.id === flowId;
                return (
                  <OptionCard
                    key={f.id}
                    on={on}
                    onClick={() => setFlowId(on ? "" : f.id)}
                    title={f.definition.label}
                    badge={f.id === defaultFlow ? "default" : undefined}
                    viz={<CountViz count={steps.length} on={on} />}
                    meta={`${steps.length} steps · ${seats} seats`}
                  />
                );
              })}
            </div>
          </section>

          <section>
            <PaneTitle icon={<Users className="h-4 w-4" strokeWidth={1.9} />}>Crew</PaneTitle>
            {crews.length > 0 ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {crews.map((c) => {
                  const on = c.id === crewId;
                  const profiles = [...new Set(c.roles.map((r) => r.profile))];
                  return (
                    <OptionCard
                      key={c.id}
                      on={on}
                      onClick={() => setCrewId(on ? null : c.id)}
                      title={c.label}
                      badge={c.id === meta?.defaultCrew ? "default" : undefined}
                      viz={<CountViz count={c.roles.length} on={on} square />}
                      meta={`${c.roles.length} roles · ${profiles.slice(0, 2).join(" · ")}`}
                    />
                  );
                })}
              </div>
            ) : null}
          </section>

          <section>
            <PaneTitle icon={<ShieldCheck className="h-4 w-4" strokeWidth={1.9} />}>Supervisor</PaneTitle>
            {personas.length > 0 ? (
              <Segmented options={personas.map((p) => ({ value: p.id, label: p.label }))} value={personaId} onChange={setPersonaId} />
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

        {/* ── Right: summary + the wireframe ────────────────────────────── */}
        <aside className="flex flex-col gap-5 bg-ink-50 p-6 lg:col-span-5">
          <div>
            <PaneTitle>Run summary</PaneTitle>
            <div className="border border-white/[0.08]">
              <SummaryRow icon={<ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.9} />} label="Supervisor" value={selectedPersona?.label ?? "default"} muted={!selectedPersona} />
              <SummaryRow icon={<Play className="h-3.5 w-3.5" strokeWidth={1.9} />} label="Mode" value={modeLabel} last />
            </div>
          </div>

          <div>
            <PaneTitle icon={<Layers className="h-4 w-4" strokeWidth={1.9} />}>Composition</PaneTitle>
            <div className="border border-white/[0.1] bg-ink-100">
              <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-2.5">
                <span className="truncate font-display text-[13.5px] font-semibold text-fog-100">
                  {selectedFlow?.definition.label ?? "Auto flow"}
                </span>
                <span className="mono shrink-0 text-[11px] text-fog-400">
                  {selectedFlow
                    ? `${Object.keys(selectedFlow.definition.seats ?? {}).length} seats · ${selectedCrew?.label ?? "default"}`
                    : "orchestrator picks"}
                </span>
              </div>
              <PatchBay flow={selectedFlow} crew={selectedCrew} />
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
                boxShadow: canStart ? "inset 0 1px 0 rgba(255,255,255,0.28), 0 10px 26px -12px var(--color-violet-deep)" : "none",
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
            <div className="border border-rose-400/30 bg-rose-500/[0.06] px-3 py-2 text-[12.5px] text-rose-300">{error}</div>
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

/** A square selection card: title + a count viz + a meta line. Selected fills
 * solid emerald with dark ink (the marketing "ready/selected" treatment). */
function OptionCard({
  on,
  onClick,
  title,
  badge,
  viz,
  meta,
}: {
  on: boolean;
  onClick: () => void;
  title: string;
  badge?: string;
  viz: React.ReactNode;
  meta: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col gap-1.5 border px-3.5 py-3 text-left transition-colors",
        on ? "border-transparent" : "border-white/[0.1] bg-ink-200 hover:bg-ink-300",
      )}
      style={on ? { background: "var(--emerald)", color: "#04231a", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.28)" } : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-display text-[15px] font-semibold leading-tight">{title}</span>
        {on ? (
          <Check className="h-4 w-4 shrink-0" strokeWidth={2.6} />
        ) : badge ? (
          <span className="mono text-[9.5px] uppercase tracking-wide text-fog-400">{badge}</span>
        ) : null}
      </div>
      {viz}
      <span className={cn("truncate mono text-[11px]", on ? "" : "text-fog-400")} style={on ? { color: "rgba(4,35,26,0.74)" } : undefined}>
        {meta}
      </span>
    </button>
  );
}

/** Tiny "amount" viz: bars for flow steps, squares for crew roles. */
function CountViz({ count, on, square }: { count: number; on: boolean; square?: boolean }) {
  if (count === 0) return null;
  const n = Math.min(count, 14);
  return (
    <div className="flex h-[16px] items-end gap-[2px]" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          style={{
            width: "3px",
            height: square ? "5px" : `${4 + ((i * 5) % 12)}px`,
            alignSelf: square ? "center" : "flex-end",
            background: on ? "#04231a" : "var(--color-violet-soft)",
            opacity: on ? 0.8 : 0.6,
          }}
        />
      ))}
    </div>
  );
}

type PlugRole = MetaCrew["roles"][number];

/** The summary wireframe. Each flow seat is grouped with the crew role that
 * fills it as one row, joined by a flat SQUARE plug-in connector (a square plug
 * seated in a square socket) - matching the card language, not round cables.
 * Unused crew is gathered into a separate "spare" group. */
function PatchBay({ flow, crew }: { flow: DiscoveredFlow | null; crew: MetaCrew | null }) {
  if (!flow) {
    return (
      <div className="px-4 py-5 text-[12.5px] leading-[1.5] text-fog-400">
        Pick a flow and crew on the left - the wiring of roles into seats shows here.
      </div>
    );
  }
  const seats = Object.entries(flow.definition.seats ?? {});
  const roles = crew?.roles ?? [];
  if (seats.length === 0) {
    return <div className="px-4 py-5 text-[12.5px] text-fog-400">This flow declares no seats.</div>;
  }
  const conns = seats.map(([key, seat]) => ({
    key,
    label: seat.label,
    role: roles.find((r) => r.seats.includes(key)) ?? null,
  }));
  const usedIds = new Set(conns.map((c) => c.role?.id).filter(Boolean));
  const spare = roles.filter((r) => !usedIds.has(r.id));
  return (
    <div className="flex flex-col gap-2 p-3">
      {conns.map((c) => (
        <PlugRow key={c.key} seatLabel={c.label} role={c.role} />
      ))}
      {spare.length > 0 ? (
        <div className="mt-1 border-t border-white/[0.07] pt-2.5">
          <div className="mb-2 text-[11.5px] font-medium text-fog-300">Spare crew</div>
          <div className="flex flex-wrap gap-1.5">
            {spare.map((r) => (
              <span key={r.id} className="flex items-center gap-1.5 border border-white/[0.1] bg-ink-200 px-2 py-1 text-[11px] text-fog-400">
                <span className="inline-block h-2 w-2 border border-white/25" />
                {r.label}
                <span className="mono text-[9.5px] text-fog-500">{r.profile}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** One seat grouped with its filling role, joined by a square plug-in. */
function PlugRow({ seatLabel, role }: { seatLabel: string; role: PlugRole | null }) {
  const filled = role !== null;
  return (
    <div className="flex items-stretch">
      <div className="flex flex-1 flex-col justify-center border border-violet-soft/35 bg-violet-soft/[0.08] px-3 py-2">
        <span className="truncate text-[12.5px] font-medium leading-tight text-fog-100">{seatLabel}</span>
        <span className="mono text-[9px] uppercase tracking-[0.1em] text-violet-soft/80">seat</span>
      </div>
      {/* square plug-in connector: an emerald plug seated in a violet socket */}
      <div className="relative flex w-[30px] shrink-0 items-center justify-center">
        <span
          className="absolute"
          style={{ width: 18, height: 18, border: `2px solid ${filled ? "var(--color-violet-soft)" : "rgba(255,255,255,0.22)"}`, background: "var(--color-ink-0)" }}
        />
        {filled ? <span className="absolute" style={{ width: 10, height: 10, background: "var(--emerald)" }} /> : null}
      </div>
      {filled ? (
        <div className="flex flex-1 flex-col justify-center border border-emerald-400/30 bg-emerald-500/[0.07] px-3 py-2">
          <span className="truncate text-[12.5px] font-medium leading-tight text-fog-100">{role.label}</span>
          <span className="mono truncate text-[9.5px] leading-tight text-fog-400">{role.profile}</span>
        </div>
      ) : (
        <div className="flex flex-1 items-center border border-dashed border-white/[0.14] bg-ink-100 px-3 py-2 text-[11.5px] text-fog-500">
          open - no role fills this seat
        </div>
      )}
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

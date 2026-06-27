import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronDown, ChevronUp, Route as RouteIcon } from "lucide-react";
import { api } from "../../lib/api.js";
import { navigate } from "../../app/App.js";
import type { DiscoveredFlow, PersonaSummary } from "../../lib/types.js";

type FlowParamDef = { required?: boolean; label?: string; default?: unknown; secret?: boolean };

const fieldLbl = "mb-2 text-[12px] font-semibold text-chalk-400";

function FlowBars({ count, on }: { count: number; on: boolean }) {
  const n = Math.max(1, Math.min(count, 8));
  return (
    <div className="my-2.5 flex gap-1">
      {Array.from({ length: n }).map((_, i) => (
        <span
          key={i}
          className="h-1.5 flex-1 rounded-full"
          style={{ background: on ? "#a78bfa" : "rgba(167,139,250,0.3)" }}
        />
      ))}
    </div>
  );
}

function PickCard({
  on,
  onClick,
  title,
  isDefault,
  children,
  meta,
}: {
  on: boolean;
  onClick: () => void;
  title: string;
  isDefault?: boolean;
  children?: React.ReactNode;
  meta?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-[160px] shrink-0 rounded-[14px] border p-3 text-left transition ${
        on ? "border-violet-soft/60 bg-violet-soft/[0.08]" : "border-white/[0.07] bg-coal-800 hover:border-white/15"
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-[13px] font-bold text-chalk-100">{title}</span>
        {isDefault ? <span className="shrink-0 text-[10px] font-bold text-violet-soft">default</span> : null}
      </div>
      {children}
      {meta ? <div className="text-[11px] text-chalk-400">{meta}</div> : null}
    </button>
  );
}

export function MissionComposer() {
  const [meta, setMeta] = useState<Awaited<ReturnType<typeof api.getProjectMetadata>> | null>(null);
  const [flows, setFlows] = useState<DiscoveredFlow[]>([]);
  const [defaultFlow, setDefaultFlow] = useState<string | null>(null);
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);

  const [task, setTask] = useState("");
  const [crewId, setCrewId] = useState<string>("");
  const [flowId, setFlowId] = useState<string>("");
  const [personaId, setPersonaId] = useState<string>("");
  const [concise, setConcise] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [unattended, setUnattended] = useState(false);
  const [forceSelect, setForceSelect] = useState(false);
  const [params, setParams] = useState<Record<string, string>>({});

  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [m, f, p] = await Promise.all([
        api.getProjectMetadata().catch(() => null),
        api.listFlows().catch(() => ({ flows: [] as DiscoveredFlow[], defaultFlow: null })),
        api.listPersonas().catch(() => null),
      ]);
      if (cancelled) return;
      setMeta(m);
      setFlows(f.flows);
      setDefaultFlow(f.defaultFlow ?? null);
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
      navigate({ kind: "control", runId: r.runId });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const Toggle = ({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) => (
    <button
      type="button"
      onClick={() => set(!on)}
      className={`rounded-[10px] px-3 py-1.5 text-[12.5px] font-semibold ${
        on ? "bg-violet-soft/20 text-violet-soft" : "bg-coal-800 text-chalk-400 hover:text-chalk-100"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="rounded-[22px] border border-white/[0.06] bg-coal-600 p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[16px] font-bold text-chalk-100">New run</h2>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-[12.5px] font-semibold text-violet-soft hover:text-violet-soft/80"
        >
          {expanded ? "Fewer options" : "More options"}
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      <textarea
        value={task}
        onChange={(e) => setTask(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void launch();
        }}
        rows={3}
        placeholder="Describe the change to run. e.g. Add retry with backoff to the uploader."
        className="w-full resize-none rounded-[14px] border border-white/[0.08] bg-coal-800 px-4 py-3 text-[14px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none"
      />

      {/* Flow - visual cards, step bars */}
      <div className="mt-4">
        <div className={fieldLbl}>Flow</div>
        <div className="flex gap-2.5 overflow-x-auto pb-1">
          <PickCard on={!flowId} onClick={() => setFlowId("")} title="Auto" meta="orchestrator picks">
            <div className="my-2.5 flex items-center gap-1.5 text-violet-soft">
              <RouteIcon className="h-4 w-4" strokeWidth={2} />
            </div>
          </PickCard>
          {flows.map((f) => {
            const steps = (f.definition.steps ?? []).length;
            const seats = Object.keys(f.definition.seats ?? {}).length;
            const on = f.id === flowId;
            return (
              <PickCard
                key={f.id}
                on={on}
                onClick={() => setFlowId(on ? "" : f.id)}
                title={f.definition.label}
                isDefault={f.id === defaultFlow}
                meta={`${steps} steps · ${seats} seats`}
              >
                <FlowBars count={steps} on={on} />
              </PickCard>
            );
          })}
        </div>
      </div>

      {/* Crew - visual cards, role chips */}
      {crews.length > 0 ? (
        <div className="mt-4">
          <div className={fieldLbl}>Crew</div>
          <div className="flex gap-2.5 overflow-x-auto pb-1">
            <PickCard on={!crewId} onClick={() => setCrewId("")} title="Default" meta="project crew">
              <div className="my-2.5 h-[18px]" />
            </PickCard>
            {crews.map((c) => {
              const on = c.id === crewId;
              return (
                <PickCard
                  key={c.id}
                  on={on}
                  onClick={() => setCrewId(c.id)}
                  title={c.label}
                  isDefault={c.id === meta?.defaultCrew}
                  meta={`${c.roles.length} roles`}
                >
                  <div className="my-2 flex flex-wrap gap-1">
                    {c.roles.slice(0, 4).map((r) => (
                      <span
                        key={r.id}
                        className="rounded-[6px] bg-violet-soft/12 px-1.5 py-px text-[10px] font-medium text-violet-soft"
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
        </div>
      ) : null}

      {expanded ? (
        <div className="mt-4 flex flex-col gap-4 border-t border-white/[0.06] pt-4">
          {personas.length > 0 ? (
            <div>
              <div className={fieldLbl}>Supervisor persona</div>
              <div className="flex flex-wrap gap-2">
                {personas.map((p) => {
                  const on = p.id === personaId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPersonaId(on ? "" : p.id)}
                      className={`rounded-[10px] px-3 py-1.5 text-[12.5px] font-semibold ${
                        on ? "bg-violet-soft/20 text-violet-soft" : "bg-coal-800 text-chalk-400 hover:text-chalk-100"
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {flowParams && Object.keys(flowParams).length > 0 ? (
            <div>
              <div className={fieldLbl}>Flow parameters</div>
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
                      className="w-full rounded-[12px] border border-white/[0.08] bg-coal-800 px-3 py-2.5 text-[13px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <div className={fieldLbl}>Run options</div>
            <div className="flex flex-wrap gap-2">
              <Toggle on={concise} set={setConcise} label="Concise" />
              <Toggle on={readOnly} set={setReadOnly} label="Read-only" />
              <Toggle on={unattended} set={setUnattended} label="Unattended" />
              <Toggle on={forceSelect} set={setForceSelect} label="Force flow select" />
            </div>
          </div>
        </div>
      ) : null}

      {missing.length > 0 ? (
        <div className="mt-3 text-[12.5px] text-amber-soft">
          Required flow parameters: {missing.join(", ")} - open More options.
        </div>
      ) : null}
      {error ? <div className="mt-3 text-[12.5px] text-rose-300">{error}</div> : null}

      <div className="mt-4">
        <button
          onClick={() => void launch()}
          disabled={!canLaunch}
          className="flex items-center gap-2 rounded-[12px] bg-violet-soft px-4 py-2.5 text-[13.5px] font-bold text-coal-900 hover:bg-violet-soft/90 disabled:opacity-40"
        >
          {busy ? (
            "Launching…"
          ) : (
            <>
              Launch run <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

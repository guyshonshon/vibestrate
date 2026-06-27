import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { api } from "../../lib/api.js";
import { navigate } from "../../app/App.js";
import type { DiscoveredFlow, PersonaSummary } from "../../lib/types.js";

type FlowParamDef = { required?: boolean; label?: string; default?: unknown; secret?: boolean };

const selectCls =
  "rounded-[12px] border border-white/[0.08] bg-coal-800 px-3 py-2.5 text-[13px] text-chalk-100 focus:border-violet-soft/50 focus:outline-none";
const fieldLbl = "mb-1.5 block text-[12px] font-semibold text-chalk-400";

/**
 * Inline new-run composer for Mission Control (soft-dark). Collapsed = task +
 * flow + crew + a run summary; "More options" expands in-place to persona, the
 * selected flow's params, and the run toggles. Mirrors the real spawnRun fields
 * the old MissionRunV5 used. Launches a real run, then lands on the control page.
 */
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
  const flowLabel = flowId ? selectedFlow?.definition.label ?? flowId : "auto";
  const crewLabel = crewId ? crews.find((c) => c.id === crewId)?.label ?? crewId : "default";
  const personaLabel = personaId ? personas.find((p) => p.id === personaId)?.label ?? personaId : "default";

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

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label className={fieldLbl}>Flow</label>
          <select value={flowId} onChange={(e) => setFlowId(e.target.value)} className={`w-full ${selectCls}`}>
            <option value="">Auto {defaultFlow ? "(orchestrator picks)" : ""}</option>
            {flows.map((f) => (
              <option key={f.id} value={f.id}>
                {f.definition.label}
                {f.id === defaultFlow ? " · default" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={fieldLbl}>Crew</label>
          <select value={crewId} onChange={(e) => setCrewId(e.target.value)} className={`w-full ${selectCls}`}>
            <option value="">Default</option>
            {crews.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
                {c.id === meta?.defaultCrew ? " · default" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {expanded ? (
        <div className="mt-4 flex flex-col gap-4 border-t border-white/[0.06] pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={fieldLbl}>Supervisor persona</label>
              <select value={personaId} onChange={(e) => setPersonaId(e.target.value)} className={`w-full ${selectCls}`}>
                <option value="">Default</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {flowParams && Object.keys(flowParams).length > 0 ? (
            <div>
              <label className={fieldLbl}>Flow parameters</label>
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
                      className={`w-full ${selectCls}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <label className={fieldLbl}>Run options</label>
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

      <div className="mt-4 flex items-center justify-between gap-3">
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
        <div className="truncate text-[12px] text-chalk-400">
          Flow: <span className="text-chalk-300">{flowLabel}</span> &middot; Crew:{" "}
          <span className="text-chalk-300">{crewLabel}</span> &middot; Persona:{" "}
          <span className="text-chalk-300">{personaLabel}</span>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Database, Sparkles, Trash2, Save, KeyRound } from "lucide-react";
import { api, type ProjectParamsView } from "../../lib/api.js";
import type { DiscoveredFlow, FlowParam } from "../../lib/types.js";
import { Select } from "../design/Select.js";

/**
 * Project parameters (durable param memory). The explicit editor for the typed
 * answers persisted in `.vibestrate/project-params.json` and reused across
 * runs. Unlike the run Composer (which only ADDS unset values), this is where
 * overwriting a stored value is allowed - editing here supersedes.
 *
 * Model-independent: questions come from the flow's param schema, the surface is
 * Vibestrate's, a provider is only an optional "Generate" helper. Secrets are
 * never typed here - a secret param collects an env var NAME (stored `env:NAME`).
 */
export function ProjectParamsPanel() {
  const [flows, setFlows] = useState<DiscoveredFlow[]>([]);
  const [stored, setStored] = useState<ProjectParamsView | null>(null);
  const [flowId, setFlowId] = useState<string>("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);

  async function reload() {
    setStored(await api.getParams());
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [f, p] = await Promise.all([api.listFlows(), api.getParams()]);
        if (cancelled) return;
        const withParams = f.flows.filter(
          (fl) => fl.definition.params && Object.keys(fl.definition.params).length > 0,
        );
        setFlows(withParams);
        setStored(p);
        if (withParams[0]) setFlowId(withParams[0].id);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(
    () => flows.find((f) => f.id === flowId) ?? null,
    [flows, flowId],
  );
  const params = selected?.definition.params ?? {};

  // The stored key for a param (mirrors paramKeyFor): bare if shared, else
  // `<flowId>.<param>`. Used to show the current stored value per field.
  function storageKey(name: string, def: FlowParam): string {
    return def.shared ? name : `${flowId}.${name}`;
  }
  function storedFor(name: string, def: FlowParam): ProjectParamsView["values"][string] | undefined {
    return stored?.values[storageKey(name, def)];
  }

  // Reset edits when the flow changes.
  useEffect(() => setEdits({}), [flowId]);

  async function save() {
    if (!flowId) return;
    const values: Record<string, string> = {};
    for (const [name, val] of Object.entries(edits)) {
      if (val.trim() === "") continue;
      values[name] = val;
    }
    if (Object.keys(values).length === 0) {
      setNotice("Nothing to save - edit a field first.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await api.setParams({ flowId, values });
      setStored(r.params);
      setEdits({});
      setNotice(
        r.warnings.length > 0
          ? `Saved. ${r.warnings.join(" ")}`
          : `Saved ${Object.keys(values).length} value(s).`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function generate(name: string) {
    if (!flowId) return;
    setGenerating(name);
    setError(null);
    try {
      const { suggestion } = await api.generateParam(flowId, name);
      // A suggestion is a draft the user reviews - it fills the field, it does
      // NOT auto-save.
      setEdits((c) => ({ ...c, [name]: suggestion }));
      setNotice(`Generated a suggestion for "${name}" - review and Save to keep it.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(null);
    }
  }

  async function unset(key: string) {
    setBusy(true);
    setError(null);
    try {
      await api.unsetParamKey(key);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const storedEntries = useMemo(
    () => Object.entries(stored?.values ?? {}).sort(([a], [b]) => a.localeCompare(b)),
    [stored],
  );

  return (
    <section className="px-4 py-4">
      <header className="flex items-center gap-2 text-[13px] font-medium text-vibestrate-fg">
        <Database className="h-3.5 w-3.5" strokeWidth={1.6} />
        Project parameters
        <span className="text-[11px] font-normal text-vibestrate-fg-muted">
          · durable param memory (filled once, reused across runs)
        </span>
      </header>

      {error ? (
        <div className="mt-2 border border-vibestrate-fail/40 bg-vibestrate-fail/10 px-2 py-1 text-[11.5px] text-vibestrate-fail">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="mt-2 border border-vibestrate-success/40 bg-vibestrate-success/10 px-2 py-1 text-[11.5px] text-vibestrate-success">
          {notice}
        </div>
      ) : null}

      {flows.length === 0 ? (
        <div className="mt-3 text-[11.5px] text-vibestrate-fg-dim">
          No flow declares parameters yet. A flow's <span className="vibestrate-mono">params:</span> block
          defines what the profile can store.
        </div>
      ) : (
        <div className="slab mt-3 p-3">
          <div className="flex items-center gap-2">
            <label className="text-[11.5px] text-vibestrate-fg-dim">Flow</label>
            <Select
              value={flowId}
              ariaLabel="Flow whose parameters to edit"
              className="min-w-[150px]"
              onChange={(v) => setFlowId(v)}
              options={flows.map((f) => ({ value: f.id, label: `${f.label} (${f.id})` }))}
            />
          </div>

          <div className="mt-3 flex flex-col gap-2.5">
            {Object.entries(params).map(([name, def]) => {
              const stored = storedFor(name, def);
              const editVal = edits[name];
              return (
                <div key={name} className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-[12px] text-vibestrate-fg">
                    <span className="font-medium">{name}</span>
                    <span className="vibestrate-mono border border-vibestrate-border px-1 text-[10px] text-vibestrate-fg-dim">
                      {def.type}
                    </span>
                    {def.shared ? (
                      <span className="border border-vibestrate-border px-1 text-[10px] text-vibestrate-fg-dim" title="Project-global: shared across flows">
                        shared
                      </span>
                    ) : null}
                    {def.secret ? (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-300" title="Stored as an env var reference, never the raw secret">
                        <KeyRound className="h-2.5 w-2.5" strokeWidth={1.6} /> secret
                      </span>
                    ) : null}
                    {def.description ? (
                      <span className="text-[11px] text-vibestrate-fg-dim">· {def.description}</span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {def.type === "enum" && def.values?.length && !def.secret ? (
                      <Select
                        value={editVal ?? (stored && !stored.secret ? stored.value : "")}
                        ariaLabel={`Value for ${name}`}
                        className="flex-1"
                        onChange={(v) => setEdits((c) => ({ ...c, [name]: v }))}
                        options={[
                          { value: "", label: "(unset)" },
                          ...def.values.map((v) => ({ value: v, label: v })),
                        ]}
                      />
                    ) : (
                      <input
                        type="text"
                        value={
                          editVal ??
                          (def.secret
                            ? ""
                            : stored && !stored.secret
                              ? stored.value
                              : "")
                        }
                        placeholder={
                          def.secret
                            ? "env var NAME (e.g. OPENAI_API_KEY)"
                            : def.type === "number"
                              ? "number"
                              : "value"
                        }
                        onChange={(e) => setEdits((c) => ({ ...c, [name]: e.target.value }))}
                        className="flex-1 border border-vibestrate-border bg-vibestrate-panel-2 px-2 py-1 text-[12px] text-vibestrate-fg"
                      />
                    )}
                    {def.generate && !def.secret ? (
                      <button
                        type="button"
                        disabled={generating === name || busy}
                        onClick={() => generate(name)}
                        title={def.generate.instruction}
                        className="inline-flex items-center gap-1 border border-violet-400/40 px-2 py-1 text-[11px] text-violet-200 hover:bg-violet-400/10 disabled:opacity-50"
                      >
                        <Sparkles className="h-3 w-3" strokeWidth={1.6} />
                        {generating === name ? "…" : "Generate"}
                      </button>
                    ) : null}
                  </div>
                  {stored ? (
                    <div className="text-[10.5px] text-vibestrate-fg-muted">
                      stored: {stored.secret ? <span className="vibestrate-mono">{stored.value || "env ref"}</span> : <span className="vibestrate-mono">{stored.value}</span>}{" "}
                      <span className="text-vibestrate-fg-dim">({stored.setBy})</span>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={save}
              className="inline-flex items-center gap-1.5 border border-vibestrate-accent/40 bg-vibestrate-accent/10 px-3 py-1 text-[12px] text-vibestrate-accent hover:bg-vibestrate-accent/20 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" strokeWidth={1.6} /> Save
            </button>
            <span className="text-[10.5px] text-vibestrate-fg-dim">
              Editing here overwrites a stored value (supersedes). Secrets store an env var NAME only.
            </span>
          </div>
        </div>
      )}

      {storedEntries.length > 0 ? (
        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-[0.12em] text-vibestrate-fg-dim">
            All stored values ({storedEntries.length})
          </div>
          <ul className="mt-1.5 flex flex-col gap-1">
            {storedEntries.map(([key, entry]) => (
              <li
                key={key}
                className="flex items-center gap-2 border border-vibestrate-border bg-vibestrate-panel-2 px-2 py-1 text-[11.5px]"
              >
                <span className="vibestrate-mono text-vibestrate-fg">{key}</span>
                <span className="text-vibestrate-fg-muted">=</span>
                <span className="vibestrate-mono truncate text-vibestrate-fg-dim">
                  {entry.secret ? `[secret -> ${entry.value}]` : entry.value}
                </span>
                <span className="ml-auto text-[10px] text-vibestrate-fg-muted">{entry.setBy}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => unset(key)}
                  title="Remove this stored value"
                  className="text-vibestrate-fg-muted hover:text-vibestrate-fail disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3" strokeWidth={1.6} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

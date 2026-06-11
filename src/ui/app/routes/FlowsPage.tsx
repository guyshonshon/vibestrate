import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  Flag,
  GitFork,
  Library,
  PenLine,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { api } from "../../lib/api.js";
import type {
  DiscoveredFlow,
  FlowStepDefinition,
  FlowCoverage,
  HubFlowRow,
  SeatCoverage,
} from "../../lib/types.js";
import { Button } from "../../components/design/Button.js";
import { Chip, type ChipTone } from "../../components/design/Chip.js";
import { cn } from "../../components/design/cn.js";

type Props = {
  /** Open a flow in the Flow Builder (customize slots/steps, then run). */
  onOpenInFlow: (flowId: string) => void;
};

type Toast = { kind: "ok" | "err"; text: string } | null;
type Busy = { id: string; action: "fork" | "delete" | "export" } | null;
type ImportMode = "yaml" | "url";

/** Trigger a client-side download of text content (no extra round-trip; the
 *  YAML already came back through the audited export route). */
function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: "application/x-yaml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Minimal valid flow used by "New blank flow" - a single seat + one step,
 *  which the user then shapes in the Flow Builder. */
function blankFlow(id: string) {
  return {
    id,
    version: 1,
    label: "New flow",
    description: "A new flow - customize its seats and steps.",
    seats: { worker: { label: "Worker" } },
    steps: [
      { id: "do", label: "Do the work", kind: "agent-turn", seat: "worker" },
    ],
  };
}

/**
 * Flows - the dashboard catalog of run recipes, independent of the Flow
 * Builder. Discover builtin + project flows, inspect each one's flow (slots,
 * ordered steps, approval gates), fork a builtin into the project to customize
 * it, or delete a project flow. All over the audited `/api/flows` routes -
 * the browser never shells out. Groundwork for the Flows Hub (#3).
 */
export function FlowsPage({ onOpenInFlow }: Props) {
  const [flows, setFlows] = useState<DiscoveredFlow[] | null>(null);
  const [invalid, setInvalid] = useState<{ path: string; message: string }[]>([]);
  const [defaultFlowId, setDefaultFlowId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>("yaml");
  const [importText, setImportText] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [importOverwrite, setImportOverwrite] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      const r = await api.listFlows();
      setFlows(r.flows);
      setInvalid(r.invalid ?? []);
      setDefaultFlowId(r.defaultFlow ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function flash(t: Toast) {
    setToast(t);
    if (t) window.setTimeout(() => setToast(null), 3200);
  }

  async function fork(flowId: string) {
    setBusy({ id: flowId, action: "fork" });
    try {
      const r = await api.forkFlowToProject(flowId);
      await load();
      setExpanded(r.flowId);
      flash({
        kind: "ok",
        text: r.alreadyForked
          ? `${flowId} is already a project flow.`
          : `Forked ${flowId} into .vibestrate/flows/ - customize it in the Flow Builder.`,
      });
    } catch (err) {
      flash({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  // Fork a builtin (e.g. the default flow) into the project and jump straight
  // into the Flow Builder to edit it. The project copy then shadows the builtin
  // everywhere - including plain `vibe run` for the default flow.
  async function forkAndEdit(flowId: string) {
    setBusy({ id: flowId, action: "fork" });
    try {
      await api.forkFlowToProject(flowId);
      onOpenInFlow(flowId);
    } catch (err) {
      flash({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  async function remove(flowId: string) {
    if (!window.confirm(`Delete the project flow "${flowId}"? This removes .vibestrate/flows/${flowId}/.`)) {
      return;
    }
    setBusy({ id: flowId, action: "delete" });
    try {
      await api.deleteFlow(flowId);
      await load();
      flash({ kind: "ok", text: `Deleted project flow ${flowId}.` });
    } catch (err) {
      flash({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  async function useAsDefault(flowId: string) {
    try {
      await api.setDefaultFlow(flowId);
      setDefaultFlowId(flowId);
      flash({ kind: "ok", text: `Default flow is now ${flowId} - runs use it when none is picked.` });
    } catch (err) {
      flash({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    }
  }

  async function exportFlow(flowId: string) {
    setBusy({ id: flowId, action: "export" });
    try {
      const r = await api.exportFlow(flowId);
      downloadText(`${r.flowId}.flow.yml`, r.yaml);
      flash({ kind: "ok", text: `Exported ${r.flowId} as YAML.` });
    } catch (err) {
      flash({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  async function doImport() {
    setImportBusy(true);
    try {
      const input =
        importMode === "url"
          ? { url: importUrl.trim(), overwrite: importOverwrite }
          : { yaml: importText, overwrite: importOverwrite };
      const r = await api.importFlow(input);
      await load();
      setExpanded(r.flowId);
      setImportOpen(false);
      setImportText("");
      setImportUrl("");
      setImportOverwrite(false);
      flash({
        kind: "ok",
        text: `Imported ${r.flowId}${r.overwritten ? " (overwritten)" : ""}.`,
      });
    } catch (err) {
      flash({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setImportBusy(false);
    }
  }

  // Create a fresh project flow and jump into the builder. Ids must be unique,
  // so we suffix with a short timestamp to avoid clobbering an existing flow.
  async function createBlank() {
    setCreating(true);
    try {
      const id = `new-flow-${Date.now().toString(36)}`;
      const r = await api.createFlow(blankFlow(id));
      onOpenInFlow(r.flowId);
    } catch (err) {
      flash({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setCreating(false);
    }
  }

  // The built-in default flow is rendered as its own "runs by default" card,
  // sourced from the real definition; the rest list below it.
  const defaultFlow = flows?.find((g) => g.id === "default") ?? null;
  const otherFlows = flows?.filter((g) => g.id !== "default") ?? [];
  // With no persisted defaultFlow, the orchestrator runs the built-in "default".
  const effectiveDefault = defaultFlowId ?? "default";

  return (
    <div className="relative z-10 mx-auto max-w-[1100px] px-8 pt-6 pb-16 fade-up">
      <section className="mt-1">
        <div className="eyebrow mb-1.5">Flows</div>
        <h1 className="text-display text-[21px] sm:text-[23px] leading-[1.2]">
          The Default flow
          <span className="text-fog-400">
            {flows ? ` + ${otherFlows.length} more` : ""}
          </span>
        </h1>
        <p className="text-fog-300 text-[13px] mt-1.5 max-w-[68ch]">
          A flow is the recipe your crew follows - ordered steps, the roles that
          run them, approval gates. The <strong className="text-fog-100">Default
          flow</strong> runs unless you pick another. Fork a builtin to edit it.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            iconLeft={<Plus size={13} />}
            disabled={creating}
            onClick={() => void createBlank()}
          >
            {creating ? "Creating…" : "New flow"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            iconLeft={<Upload size={13} />}
            onClick={() => setImportOpen((v) => !v)}
          >
            Import
          </Button>
        </div>
      </section>

      {importOpen ? (
        <section className="mt-4 rounded-xl border border-white/10 surface-ink-100-55 px-4 py-3.5">
          <div className="flex items-center gap-3">
            <div className="eyebrow">Import a flow</div>
            <div className="ml-auto inline-flex rounded-md border border-white/10 p-0.5 text-[11.5px]">
              {(["yaml", "url"] as ImportMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setImportMode(m)}
                  className={cn(
                    "rounded px-2 py-0.5",
                    importMode === m
                      ? "bg-violet-soft/20 text-fog-100"
                      : "text-fog-400 hover:text-fog-200",
                  )}
                >
                  {m === "yaml" ? "Paste YAML" : "From URL"}
                </button>
              ))}
            </div>
          </div>
          {importMode === "yaml" ? (
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Paste a flow.yml here…"
              spellCheck={false}
              className="mono mt-3 h-44 w-full resize-y rounded-md border border-white/10 bg-ink-200/50 px-2.5 py-2 text-[12px] text-fog-200 outline-none focus:border-violet-soft/50"
            />
          ) : (
            <input
              type="url"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="https://example.com/path/flow.yml"
              className="mono mt-3 w-full rounded-md border border-white/10 bg-ink-200/50 px-2.5 py-2 text-[12px] text-fog-200 outline-none focus:border-violet-soft/50"
            />
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-1.5 text-[12px] text-fog-300">
              <input
                type="checkbox"
                checked={importOverwrite}
                onChange={(e) => setImportOverwrite(e.target.checked)}
              />
              Overwrite if a project flow with the same id exists
            </label>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setImportOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                iconLeft={<Upload size={13} />}
                disabled={
                  importBusy ||
                  (importMode === "yaml" ? !importText.trim() : !importUrl.trim())
                }
                onClick={() => void doImport()}
              >
                {importBusy ? "Importing…" : "Import"}
              </Button>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-fog-500">
            Validated against the flow schema; refused if it carries secrets.
            URL fetches are size- and time-bounded.
          </p>
        </section>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/5 px-3 py-2 text-[12.5px] text-rose-300">
          {error}
        </div>
      ) : null}

      {invalid.length > 0 ? (
        <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-500/5 px-3 py-2.5 text-[12.5px] text-amber-200">
          <div className="font-medium">
            {invalid.length} project flow{invalid.length === 1 ? "" : "s"} couldn't
            be loaded and {invalid.length === 1 ? "was" : "were"} skipped:
          </div>
          <ul className="mt-1.5 space-y-1">
            {invalid.map((bad) => (
              <li key={bad.path} className="text-[11.5px]">
                <span className="mono text-amber-300/90">{bad.path}</span>
                <span className="text-amber-200/80"> - {bad.message}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="mt-7 space-y-3">
        {defaultFlow ? (
          <DefaultFlowCard
            flow={defaultFlow}
            busy={busy?.id === "default" ? busy.action : null}
            isDefault={effectiveDefault === "default"}
            onForkEdit={() => void forkAndEdit("default")}
            onExport={() => void exportFlow("default")}
            onUseAsDefault={() => void useAsDefault("default")}
          />
        ) : null}
        {!flows ? (
          <div className="text-fog-400 text-[13px]">Loading flows…</div>
        ) : otherFlows.length === 0 ? (
          <div className="text-fog-400 text-[13px]">No other flows yet.</div>
        ) : (
          otherFlows.map((g) => (
            <FlowCard
              key={g.id}
              flow={g}
              expanded={expanded === g.id}
              busy={busy?.id === g.id ? busy.action : null}
              isDefault={effectiveDefault === g.id}
              onToggle={() => setExpanded((cur) => (cur === g.id ? null : g.id))}
              onOpenInFlow={() => onOpenInFlow(g.id)}
              onFork={() => void fork(g.id)}
              onDelete={() => void remove(g.id)}
              onExport={() => void exportFlow(g.id)}
              onUseAsDefault={() => void useAsDefault(g.id)}
            />
          ))
        )}
      </section>

      <HubSection
        onInstalled={(flowId) => {
          setToast({ kind: "ok", text: `Installed hub flow "${flowId}".` });
          void load();
        }}
        onError={(text) => setToast({ kind: "err", text })}
      />

      {toast ? (
        <div
          className={cn(
            "fixed bottom-4 right-4 z-30 rounded-lg border px-3.5 py-2 text-[12.5px] shadow-2xl",
            toast.kind === "ok"
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
              : "border-rose-400/30 bg-rose-500/10 text-rose-200",
          )}
        >
          {toast.kind === "ok" ? "✓ " : "✗ "}
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}

/** Best-effort one-liner for the hub's diagnosis blob (same logic as the
 *  shell hub view). */
function hubDiagnosisLabel(d: unknown): string | null {
  if (!d) return null;
  if (typeof d === "string") return d;
  if (typeof d === "object") {
    const o = d as Record<string, unknown>;
    for (const k of ["verdict", "status", "summary", "note"]) {
      if (typeof o[k] === "string") return o[k] as string;
    }
  }
  return null;
}

/** Flows Hub browser (P3b): search the live hub, install by ref through the
 *  validated + secret-guarded import writer. Badge honesty: the hub's
 *  `verified` flag renders as "hub-curated" (a curation claim, not an
 *  integrity guarantee); install always discloses that a flow is executable
 *  configuration. Errors surface the hub client's reasons verbatim. */
function HubSection({
  onInstalled,
  onError,
}: {
  onInstalled: (flowId: string) => void;
  onError: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<HubFlowRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [hubError, setHubError] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);

  // Debounced search whenever the section is open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const t = window.setTimeout(async () => {
      try {
        const r = await api.listHubFlows(query.trim() || undefined);
        if (!cancelled) {
          setRows(r.flows);
          setHubError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setRows([]);
          setHubError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [open, query]);

  async function install(row: HubFlowRow, overwrite = false): Promise<void> {
    const name = row.label || row.name || row.ref;
    if (
      !overwrite &&
      !window.confirm(
        `Install "${name}" (${row.ref}) from the hub?\n\nA hub flow is executable configuration - it will drive agents and propose commands in this project. Review it before running.`,
      )
    ) {
      return;
    }
    setInstalling(row.ref);
    try {
      const r = await api.installHubFlow({ ref: row.ref, overwrite });
      onInstalled(r.result.flowId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!overwrite && /exist|overwrite|conflict/i.test(msg)) {
        if (
          window.confirm(
            `A flow with this id already exists locally.\n\n${msg}\n\nOverwrite it with the hub version?`,
          )
        ) {
          await install(row, true);
          return;
        }
      } else {
        onError(msg);
      }
    } finally {
      setInstalling(null);
    }
  }

  return (
    <section className="mt-8">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-left"
        >
          {open ? (
            <ChevronDown className="h-4 w-4 text-fog-400" strokeWidth={1.7} />
          ) : (
            <ChevronRight className="h-4 w-4 text-fog-400" strokeWidth={1.7} />
          )}
          <Library className="h-4 w-4 text-fog-300" strokeWidth={1.7} />
          <span className="text-display text-[15px] text-fog-100">Flows Hub</span>
        </button>
        <span className="text-[11.5px] text-fog-500">
          community flows from vibestrate.com - installed through the validated,
          secret-guarded import writer
        </span>
      </div>

      {open ? (
        <div className="mt-3 space-y-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the hub (name, tag, description)…"
            className="w-full max-w-[420px] rounded-md border border-white/10 bg-ink-200/70 px-2.5 py-1.5 text-[13px] text-fog-100 outline-none focus:border-violet-soft/40"
          />
          {hubError ? (
            <div className="rounded-lg border border-rose-400/30 bg-rose-500/5 px-3 py-2 text-[12.5px] text-rose-300">
              {hubError}
            </div>
          ) : loading && rows === null ? (
            <div className="text-[13px] text-fog-400">Searching the hub…</div>
          ) : rows && rows.length === 0 ? (
            <div className="text-[13px] text-fog-400">No hub flows match.</div>
          ) : rows ? (
            <ul className="space-y-2">
              {rows.map((row) => {
                const diag = hubDiagnosisLabel(row.diagnosis);
                return (
                  <li
                    key={row.ref}
                    className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-[13.5px] font-medium text-fog-100">
                        {row.label || row.name || row.ref}
                      </span>
                      <span className="mono text-[11px] text-fog-500">{row.ref}</span>
                      {row.verified ? (
                        <Chip tone="emerald">hub-curated</Chip>
                      ) : null}
                      {diag ? (
                        <span className="text-[11px] text-fog-400">{diag}</span>
                      ) : null}
                      <span className="flex-1" />
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={installing !== null}
                        onClick={() => void install(row)}
                      >
                        <Download className="mr-1 h-3.5 w-3.5" strokeWidth={1.7} />
                        {installing === row.ref ? "Installing…" : "Install"}
                      </Button>
                    </div>
                    {row.description ? (
                      <p className="mt-1 text-[12.5px] text-fog-300">
                        {row.description}
                      </p>
                    ) : null}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fog-500">
                      {row.author ? <span>by {row.author}</span> : null}
                      {typeof row.steps === "number" ? (
                        <span>{row.steps} steps</span>
                      ) : null}
                      {row.version ? <span>v{row.version}</span> : null}
                      {(row.tags ?? []).map((t) => (
                        <span key={t} className="mono">
                          #{t}
                        </span>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <p className="text-[11.5px] text-fog-500">
            Checksums verify transport integrity only; "hub-curated" is the
            hub's curation claim, not an integrity guarantee. Review an
            installed flow before running it.
          </p>
        </div>
      ) : null}
    </section>
  );
}

// The built-in Default flow, sourced from its real definition (single source of
// truth). It runs as the implicit default via the orchestrator's standard path,
// and is also runnable explicitly as `--flow default`. Shown as a distinct
// "runs by default" card - not forked/deleted here. Loop-body steps (the
// adaptive review→fix loop) are marked with ↺.
function DefaultFlowCard({
  flow,
  busy,
  isDefault,
  onForkEdit,
  onExport,
  onUseAsDefault,
}: {
  flow: DiscoveredFlow;
  busy: "fork" | "delete" | "export" | null;
  isDefault: boolean;
  onForkEdit: () => void;
  onExport: () => void;
  onUseAsDefault: () => void;
}) {
  const steps = flow.definition.steps;
  const loop = flow.definition.loop ?? null;
  const loopBody = loop
    ? {
        from: steps.findIndex((s) => s.id === loop.from),
        to: steps.findIndex((s) => s.id === loop.to),
      }
    : null;
  const isProject = flow.source.kind === "project";
  return (
    <div className="rounded-xl border border-violet-soft/25 surface-ink-100-55 px-4 py-3.5">
      <div className="flex items-center gap-2">
        <span className="text-[14px] font-medium text-fog-100">{flow.label}</span>
        <Chip tone={isProject ? "violet" : "neutral"}>
          {isProject ? "edited (project)" : "built-in"}
        </Chip>
        {isDefault ? (
          <Chip tone="emerald">runs by default</Chip>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<Flag size={13} />}
            onClick={onUseAsDefault}
            title="Make this the project's default flow"
          >
            Use as default
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          iconLeft={isProject ? <PenLine size={13} /> : <GitFork size={13} />}
          disabled={busy !== null}
          onClick={onForkEdit}
        >
          {isProject ? "Edit" : busy === "fork" ? "Forking…" : "Fork & edit"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          iconLeft={<Download size={13} />}
          disabled={busy !== null}
          onClick={onExport}
          title="Export this flow as YAML"
        >
          {busy === "export" ? "Exporting…" : "Export"}
        </Button>
      </div>
      <p className="mt-1 text-[12px] text-fog-400 max-w-[68ch]">
        {flow.description} Each step is performed by a role (configure providers
        in Crew).
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {steps.map((s, i) => {
          const inLoop =
            loopBody !== null &&
            loopBody.from >= 0 &&
            i >= loopBody.from &&
            i <= loopBody.to;
          return (
            <span key={s.id} className="flex items-center gap-1.5">
              {i > 0 ? <span className="text-fog-500 text-[11px]">→</span> : null}
              <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[11.5px] text-fog-200">
                {s.label}
                {inLoop ? (
                  <span
                    className="ml-1 text-[10px] text-sky-300"
                    title="part of the adaptive review→fix loop"
                  >
                    ↺
                  </span>
                ) : null}
                {s.seat ? (
                  <span className="mono ml-1 text-[10px] text-violet-soft">{s.seat}</span>
                ) : null}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function FlowCard({
  flow: g,
  expanded,
  busy,
  isDefault,
  onToggle,
  onOpenInFlow,
  onFork,
  onDelete,
  onExport,
  onUseAsDefault,
}: {
  flow: DiscoveredFlow;
  expanded: boolean;
  busy: "fork" | "delete" | "export" | null;
  isDefault: boolean;
  onToggle: () => void;
  onOpenInFlow: () => void;
  onFork: () => void;
  onDelete: () => void;
  onExport: () => void;
  onUseAsDefault: () => void;
}) {
  const isProject = g.source.kind === "project";
  const steps = g.definition.steps;
  const seats = Object.entries(g.definition.seats);
  const gateCount = steps.filter(
    (s) => s.kind === "approval-gate" || s.approval,
  ).length;

  return (
    <div className="rounded-xl border border-white/10 surface-ink-100-55">
      <div className="flex items-start justify-between gap-4 px-4 py-3.5">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 items-start gap-2.5 text-left"
        >
          {expanded ? (
            <ChevronDown size={15} className="mt-0.5 shrink-0 text-fog-400" />
          ) : (
            <ChevronRight size={15} className="mt-0.5 shrink-0 text-fog-400" />
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Library size={14} className="text-violet-soft shrink-0" />
              <span className="text-[15px] font-medium text-fog-100">{g.label}</span>
              <span className="mono text-[11px] text-fog-500">{g.id}</span>
              <Chip tone={isProject ? "violet" : "neutral"}>
                {isProject ? "project" : g.source.kind}
              </Chip>
              {isDefault ? <Chip tone="emerald">runs by default</Chip> : null}
              <span className="mono text-[10.5px] text-fog-500">v{g.version}</span>
            </div>
            <p className="mt-1 text-[12.5px] leading-snug text-fog-400 max-w-[75ch]">
              {g.description}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-fog-500">
              <span>{steps.length} steps</span>
              <span>·</span>
              <span>{seats.length} seats</span>
              {gateCount > 0 ? (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1 text-amber-300/90">
                    <Flag size={11} />
                    {gateCount} approval {gateCount === 1 ? "gate" : "gates"}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-2">
          {!isDefault ? (
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<Flag size={13} />}
              onClick={onUseAsDefault}
              title="Make this the project's default flow"
            >
              Use as default
            </Button>
          ) : null}
          {!isProject ? (
            <Button
              variant="primary"
              size="sm"
              iconLeft={<GitFork size={13} />}
              disabled={busy !== null}
              onClick={onFork}
            >
              {busy === "fork" ? "Forking…" : "Fork to project"}
            </Button>
          ) : null}
          <Button
            variant={isProject ? "primary" : "outline"}
            size="sm"
            iconLeft={<PenLine size={13} />}
            onClick={onOpenInFlow}
            title="Open the flow editor (preview, customize, dry-run)"
          >
            {isProject ? "Edit" : "Open"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<Download size={13} />}
            disabled={busy !== null}
            onClick={onExport}
            title="Export this flow as YAML"
          >
            {busy === "export" ? "Exporting…" : "Export"}
          </Button>
          {isProject ? (
            <Button
              variant="outline"
              size="sm"
              iconLeft={<Trash2 size={13} />}
              disabled={busy !== null}
              onClick={onDelete}
            >
              {busy === "delete" ? "Deleting…" : "Delete"}
            </Button>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <div className="border-t border-white/10 px-4 py-3.5">
          {seats.length > 0 ? (
            <div className="mb-3">
              <div className="eyebrow mb-1.5">Seats</div>
              <div className="flex flex-wrap gap-1.5">
                {seats.map(([id, seat]) => (
                  <span
                    key={id}
                    className="rounded-md border border-white/10 bg-ink-200/50 px-2 py-1 text-[11.5px] text-fog-300"
                    title={seat.description ?? undefined}
                  >
                    <span className="text-fog-100">{seat.label}</span>{" "}
                    <span className="text-fog-500">({id})</span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <CoverageBadges flowId={g.id} />

          <div className="eyebrow mb-1.5">Flow</div>
          <ol className="space-y-1.5">
            {steps.map((step, i) => (
              <StepRow key={step.id} index={i + 1} step={step} />
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

/** Lazy per-seat coverage of a flow against the default crew: is it crewed and
 *  runnable? Fetched when the card expands. */
function CoverageBadges({ flowId }: { flowId: string }) {
  const [cov, setCov] = useState<FlowCoverage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void api
      .flowCoverage(flowId)
      .then((c) => alive && setCov(c))
      .catch((e) => alive && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [flowId]);

  if (err) {
    return (
      <div className="mb-3 text-[11.5px] text-amber-200/80">
        Coverage unavailable: {err}
      </div>
    );
  }
  if (!cov) {
    return <div className="mb-3 text-[11.5px] text-fog-500">Checking crew coverage…</div>;
  }
  const tone = (s: SeatCoverage["status"]): ChipTone =>
    s === "filled" ? "emerald" : s === "ambiguous" ? "amber" : "rose";
  return (
    <div className="mb-3">
      <div className="eyebrow mb-1.5 flex items-center gap-2">
        Crew coverage
        <span className="text-fog-500 normal-case">crew: {cov.crewId}</span>
        <Chip tone={cov.runnable ? "emerald" : "rose"}>
          {cov.runnable ? "runnable" : "has gaps"}
        </Chip>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {cov.seats.map((s) => (
          <span
            key={s.seatId}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-ink-200/50 px-2 py-1 text-[11.5px]"
            title={
              s.status === "filled"
                ? `filled by ${s.resolvedRoleId}`
                : s.status === "ambiguous"
                  ? `ambiguous: ${s.candidateRoleIds.join(", ")}`
                  : "no role fills this seat"
            }
          >
            <span className="text-fog-200">{s.seatId}</span>
            <Chip tone={tone(s.status)}>{s.status}</Chip>
            {!s.usedByStep ? (
              <span className="text-fog-600 text-[10px]">unused</span>
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}

function StepRow({ index, step }: { index: number; step: FlowStepDefinition }) {
  const kind = stepKindChip(step.kind);
  const target = step.seat ?? null;
  const hasApproval = step.kind === "approval-gate" || !!step.approval;
  return (
    <li className="flex items-center gap-2.5 rounded-md border border-white/[0.06] bg-ink-200/30 px-2.5 py-1.5">
      <span className="mono w-5 shrink-0 text-right text-[11px] text-fog-600">{index}</span>
      <Chip tone={kind.tone}>{kind.label}</Chip>
      <span className="min-w-0 truncate text-[12.5px] text-fog-200">{step.label}</span>
      {target ? (
        <span className="mono text-[10.5px] text-fog-500">{target}</span>
      ) : null}
      {step.optional ? (
        <span className="rounded border border-white/10 px-1 text-[10px] text-fog-500">optional</span>
      ) : null}
      {step.repeat ? (
        <span className="rounded border border-white/10 px-1 text-[10px] text-fog-500">×{step.repeat.times}</span>
      ) : null}
      {hasApproval ? (
        <span
          className="ml-auto inline-flex items-center gap-1 text-[10.5px] text-amber-300/90"
          title={step.approval?.reason ?? "Human approval gate"}
        >
          <Flag size={11} />
          {step.approval?.riskLevel ? `${step.approval.riskLevel} risk` : "approval"}
        </span>
      ) : null}
    </li>
  );
}

function stepKindChip(kind: FlowStepDefinition["kind"]): {
  label: string;
  tone: ChipTone;
} {
  switch (kind) {
    case "agent-turn":
      return { label: "agent", tone: "neutral" };
    case "review-turn":
      return { label: "review", tone: "sky" };
    case "response-turn":
      return { label: "response", tone: "neutral" };
    case "validation":
      return { label: "validation", tone: "emerald" };
    case "approval-gate":
      return { label: "approval", tone: "amber" };
    case "summary-turn":
      return { label: "summary", tone: "neutral" };
  }
}

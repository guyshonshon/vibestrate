import React, { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
  Upload,
} from "lucide-react";
import { api } from "../../lib/api.js";
import type { DiscoveredFlow, HubFlowRow, HubPublishResult } from "../../lib/types.js";
import { Button } from "../../components/design/Button.js";
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
      flash({
        kind: "ok",
        text: r.alreadyForked
          ? `${flowId} is already a project flow.`
          : `Copied ${flowId} into your project - customize it in the Flow Builder.`,
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
  const defaultFlowCount = defaultFlow ? 1 : 0;
  const otherFlows = flows?.filter((g) => g.id !== "default") ?? [];
  // With no persisted defaultFlow, the orchestrator runs the built-in "default".
  const effectiveDefault = defaultFlowId ?? "default";

  return (
    <div className="relative z-10 mx-auto max-w-[1520px] px-8 pt-6 pb-16 fade-up">
      <section className="mt-1">
        <h1 className="font-display font-semibold leading-[1.02] tracking-[-0.025em] text-[clamp(30px,3.4vw,46px)]">
          All flows{" "}
          <span className="mono align-middle text-[clamp(15px,1.4vw,20px)] text-fog-500 num-tabular">
            {flows ? defaultFlowCount + otherFlows.length : ""}
          </span>
        </h1>
        <p className="text-fog-300 text-[14.5px] leading-[1.55] mt-3 max-w-[68ch]">
          A flow is the recipe your crew follows - ordered steps, the roles that
          run them, approval gates. The <strong className="text-fog-100">Default
          flow</strong> runs unless you pick another.
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
        <section className="mt-4 slab px-4 py-3.5">
          <div className="flex items-center gap-3">
            <div className="eyebrow">Import a flow</div>
            <div className="ml-auto inline-flex border border-white/10 p-0.5 text-[11.5px]">
              {(["yaml", "url"] as ImportMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setImportMode(m)}
                  className={cn(
                    "px-2 py-0.5",
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
              className="mono mt-3 h-44 w-full resize-y border border-white/10 bg-ink-200/50 px-2.5 py-2 text-[12px] text-fog-200 outline-none focus:border-violet-soft/50"
            />
          ) : (
            <input
              type="url"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="https://example.com/path/flow.yml"
              className="mono mt-3 w-full border border-white/10 bg-ink-200/50 px-2.5 py-2 text-[12px] text-fog-200 outline-none focus:border-violet-soft/50"
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
        <div className="mt-4 border border-rose-400/30 bg-rose-500/5 px-3 py-2 text-[12.5px] text-rose-300">
          {error}
        </div>
      ) : null}

      {invalid.length > 0 ? (
        <div className="mt-4 border border-amber-400/30 bg-amber-500/5 px-3 py-2.5 text-[12.5px] text-amber-200">
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

      <section className="mt-8">
        {!flows ? (
          <div className="text-fog-400 text-[13px]">Loading flows…</div>
        ) : (
          <div className="hubp-grid">
            {defaultFlow ? (
              <LocalFlowCard
                flow={defaultFlow}
                variant={effectiveDefault === "default" ? "selected" : "violet"}
                busy={busy?.id === "default" ? busy.action : null}
                onOpen={() => onOpenInFlow("default")}
                onUseAsDefault={() => void useAsDefault("default")}
                onExport={() => void exportFlow("default")}
                onFork={() => void forkAndEdit("default")}
                onDelete={null}
              />
            ) : null}
            {otherFlows.map((g, i) => {
              const isProject = g.source.kind === "project";
              const variant =
                effectiveDefault === g.id
                  ? "selected"
                  : i % 2 === 0
                    ? "violet"
                    : "white";
              return (
                <LocalFlowCard
                  key={g.id}
                  flow={g}
                  variant={variant}
                  busy={busy?.id === g.id ? busy.action : null}
                  onOpen={() => onOpenInFlow(g.id)}
                  onUseAsDefault={() => void useAsDefault(g.id)}
                  onExport={() => void exportFlow(g.id)}
                  onFork={isProject ? null : () => void fork(g.id)}
                  onDelete={isProject ? () => void remove(g.id) : null}
                />
              );
            })}
          </div>
        )}
      </section>

      <HubSection
        projectFlows={(flows ?? []).filter((f) => f.source.kind === "project")}
        onInstalled={(flowId) => {
          setToast({ kind: "ok", text: `Installed hub flow "${flowId}".` });
          void load();
        }}
        onError={(text) => setToast({ kind: "err", text })}
      />

      {toast ? (
        <div
          className={cn(
            "fixed bottom-4 right-4 z-30 border px-3.5 py-2 text-[12.5px] shadow-2xl",
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
  projectFlows,
  onInstalled,
  onError,
}: {
  projectFlows: DiscoveredFlow[];
  onInstalled: (flowId: string) => void;
  onError: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<HubFlowRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [hubError, setHubError] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);

  // ── Publish form state ────────────────────────────────────────────────────
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishFlowId, setPublishFlowId] = useState("");
  const [publishName, setPublishName] = useState("");
  const [publishVersion, setPublishVersion] = useState("");
  const [publishHandle, setPublishHandle] = useState("");
  const [publishConfirmed, setPublishConfirmed] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<(HubPublishResult & { warnings?: string[] }) | null>(null);

  // Debounced search; runs only while open, on open + on query change.
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

  function handlePublishFlowChange(flowId: string) {
    setPublishFlowId(flowId);
    const flow = projectFlows.find((f) => f.id === flowId);
    if (flow && !publishName) setPublishName(flow.label || flow.id);
    if (flow && publishName === (projectFlows.find((f) => f.id === publishFlowId)?.label ?? publishFlowId)) {
      setPublishName(flow.label || flow.id);
    }
    setPublishResult(null);
    setPublishError(null);
  }

  async function submitPublish(e: React.FormEvent) {
    e.preventDefault();
    if (!publishConfirmed || !publishFlowId || !publishVersion || !publishHandle) return;
    setPublishing(true);
    setPublishError(null);
    setPublishResult(null);
    try {
      const r = await api.publishHubFlow({
        flowId: publishFlowId,
        version: publishVersion,
        name: publishName || undefined,
        handle: publishHandle,
      });
      setPublishResult({ ...r.result, warnings: r.warnings });
      setPublishConfirmed(false);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  }

  return (
    <section className="mt-12 border-t border-[color:var(--line)] pt-8">
      {/* Hub - collapsed by default; these flows are downloaded over the internet. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 text-left"
      >
        {open ? (
          <ChevronDown className="h-5 w-5 shrink-0 text-fog-400" strokeWidth={1.8} />
        ) : (
          <ChevronRight className="h-5 w-5 shrink-0 text-fog-400" strokeWidth={1.8} />
        )}
        <h2 className="font-display font-semibold leading-[1.05] tracking-[-0.025em] text-[clamp(22px,2.4vw,32px)] text-fog-100">
          Pull a <span className="hl-box font-wordmark">flow</span>
        </h2>
        <span className="mono text-[11px] uppercase tracking-[0.1em] text-fog-500">
          download from the internet
        </span>
        {open ? (
          <span className="mono ml-auto text-[11px] uppercase tracking-[0.08em] text-fog-500 whitespace-nowrap">
            {hubError ? "hub unavailable" : rows ? `${rows.length} ${rows.length === 1 ? "flow" : "flows"}` : "loading…"}
          </span>
        ) : null}
      </button>

      {!open ? (
        <p className="mt-2 max-w-[68ch] text-[13px] leading-[1.5] text-fog-400">
          Browse and install community flows from vibestrate.com - downloaded over
          the internet, vetted through the secret-guarded import writer.
        </p>
      ) : (
        <>
          <div className="relative mb-4 mt-5 max-w-[420px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fog-500" strokeWidth={1.8} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or @handle…"
              className="mono slab w-full py-2 pl-9 pr-3 text-[13px] text-fog-100 outline-none placeholder:text-fog-500 focus:ring-1 focus:ring-violet-soft/40"
            />
          </div>

          <div className="mt-0">
        {hubError ? (
          <div className="border border-rose-400/30 bg-rose-500/5 px-3 py-2.5 text-[12.5px] text-rose-300">
            Couldn&apos;t load the hub right now: {hubError}
          </div>
        ) : loading && rows === null ? (
          <div className="hubp-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="fcard" aria-hidden style={{ background: "rgba(255,255,255,0.015)" }} />
            ))}
          </div>
        ) : rows && rows.length === 0 ? (
          <div className="slab px-6 py-10 text-center text-[13px] text-fog-400">
            No hub flows match these filters.
          </div>
        ) : rows ? (
          <div className="hubp-grid">
            {rows.map((row) => {
              const risk = hubDiagnosisLabel(row.diagnosis);
              const name = row.label || row.name || row.ref;
              const primaryTag = (row.tags ?? [])[0];
              return (
                <button
                  key={row.ref}
                  type="button"
                  className={cn("fcard", row.verified && "is-verified")}
                  disabled={installing !== null}
                  onClick={() => void install(row)}
                  title={`Install ${row.ref}`}
                >
                  <div className="fcard-top">
                    <div className="fcard-id">
                      {row.verified ? (
                        <>
                          <span className="fcard-check">✓</span>
                          <span className="fcard-verified">hub-curated</span>
                        </>
                      ) : row.author ? (
                        <span className="fcard-author">@{row.author}</span>
                      ) : null}
                    </div>
                  </div>
                  <span className="fcard-name">{name}</span>
                  {row.description ? <p className="fcard-sum">{row.description}</p> : null}
                  <div className="fcard-strip">
                    {primaryTag ? <span className="fcard-cell">{primaryTag}</span> : null}
                    {row.version ? <span className="fcard-cell">v{row.version}</span> : null}
                    {typeof row.steps === "number" ? <span className="fcard-cell">{row.steps} steps</span> : null}
                    {typeof row.installs === "number" ? <span className="fcard-cell">{row.installs.toLocaleString()} ↓</span> : null}
                    {installing === row.ref ? <span className="fcard-cell">installing…</span> : null}
                    {risk ? <span className="fcard-cell fcard-cell-risk">{risk}</span> : null}
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}
          </div>

          <p className="mt-4 max-w-[80ch] text-[12.5px] leading-[1.5] text-fog-300">
            &ldquo;Hub-curated&rdquo; is the hub&apos;s curation claim, not an integrity
            guarantee; checksums verify transport only. A hub flow is executable
            configuration: review an installed flow before running it.
          </p>

          {/* ── Publish a flow ──────────────────────────────────────────── */}
          <div className="mt-10 border-t border-[color:var(--line)] pt-6">
            <button
              type="button"
              onClick={() => {
                setPublishOpen((v) => !v);
                setPublishResult(null);
                setPublishError(null);
              }}
              className="flex items-center gap-2 text-left"
            >
              {publishOpen ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-fog-400" strokeWidth={1.8} />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-fog-400" strokeWidth={1.8} />
              )}
              <span className="mono text-[12px] uppercase tracking-[0.08em] text-fog-400">
                Publish a flow to the hub
              </span>
            </button>

            {publishOpen && (
              <form onSubmit={(e) => void submitPublish(e)} className="mt-4 max-w-[520px]">
                <div className="slab px-4 py-4 space-y-3">
                  {/* Flow picker */}
                  <div>
                    <label className="mono mb-1 block text-[11px] uppercase tracking-[0.08em] text-fog-400">
                      Flow
                    </label>
                    {projectFlows.length === 0 ? (
                      <p className="text-[12.5px] text-fog-400">
                        No project flows found. Fork or create a project flow first.
                      </p>
                    ) : (
                      <select
                        value={publishFlowId}
                        onChange={(e) => handlePublishFlowChange(e.target.value)}
                        required
                        className="mono slab w-full py-1.5 px-2 text-[13px] text-fog-100 outline-none focus:ring-1 focus:ring-violet-soft/40"
                      >
                        <option value="">Select a project flow…</option>
                        {projectFlows.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.label} ({f.id})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Name */}
                  <div>
                    <label className="mono mb-1 block text-[11px] uppercase tracking-[0.08em] text-fog-400">
                      Name
                    </label>
                    <input
                      type="text"
                      value={publishName}
                      onChange={(e) => setPublishName(e.target.value)}
                      placeholder="human-readable name"
                      className="mono slab w-full py-1.5 px-2 text-[13px] text-fog-100 outline-none placeholder:text-fog-500 focus:ring-1 focus:ring-violet-soft/40"
                    />
                  </div>

                  {/* Version */}
                  <div>
                    <label className="mono mb-1 block text-[11px] uppercase tracking-[0.08em] text-fog-400">
                      Version
                    </label>
                    <input
                      type="text"
                      value={publishVersion}
                      onChange={(e) => setPublishVersion(e.target.value)}
                      placeholder="1.0.0"
                      required
                      className="mono slab w-full py-1.5 px-2 text-[13px] text-fog-100 outline-none placeholder:text-fog-500 focus:ring-1 focus:ring-violet-soft/40"
                    />
                  </div>

                  {/* Handle */}
                  <div>
                    <label className="mono mb-1 block text-[11px] uppercase tracking-[0.08em] text-fog-400">
                      Handle
                    </label>
                    <input
                      type="text"
                      value={publishHandle}
                      onChange={(e) => setPublishHandle(e.target.value)}
                      placeholder="your-github-handle"
                      required
                      className="mono slab w-full py-1.5 px-2 text-[13px] text-fog-100 outline-none placeholder:text-fog-500 focus:ring-1 focus:ring-violet-soft/40"
                    />
                  </div>

                  {/* Confirm gate */}
                  <label className="flex cursor-pointer items-start gap-2 pt-1">
                    <input
                      type="checkbox"
                      checked={publishConfirmed}
                      onChange={(e) => setPublishConfirmed(e.target.checked)}
                      className="mt-0.5 shrink-0 accent-violet-500"
                    />
                    <span className="text-[12.5px] leading-[1.45] text-fog-300">
                      I understand this publishes a public, immutable version to the hub.
                      It cannot be retracted once live.
                    </span>
                  </label>

                  {/* Errors */}
                  {publishError ? (
                    <div className="border border-rose-400/30 bg-rose-500/5 px-3 py-2 text-[12.5px] text-rose-300">
                      {publishError}
                    </div>
                  ) : null}

                  {/* Success result */}
                  {publishResult ? (
                    <div className="border border-emerald-400/30 bg-emerald-500/5 px-3 py-2.5 text-[12.5px] text-emerald-200 space-y-1">
                      <div>
                        Published: <span className="mono">{publishResult.ref}</span>
                        {publishResult.version ? <> v{publishResult.version}</> : null}
                        {publishResult.sha256 ? (
                          <> - sha <span className="mono">{publishResult.sha256.slice(0, 12)}</span></>
                        ) : null}
                      </div>
                      {publishResult.alreadyExisted ? (
                        <div className="text-fog-400">already published - version unchanged</div>
                      ) : null}
                      {publishResult.diagnosis?.verdict === "flagged" && publishResult.diagnosis.findings?.length ? (
                        <div className="mt-1 space-y-0.5">
                          <span className="text-amber-300">flagged:</span>
                          {publishResult.diagnosis.findings.map((f, i) => (
                            <div key={i} className="text-fog-300">
                              {f.severity ? <span className="text-amber-400">[{f.severity}] </span> : null}
                              {f.message}
                              {f.path ? <span className="text-fog-500"> ({f.path})</span> : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {publishResult.warnings?.length ? (
                        <div className="mt-1 text-amber-300">
                          {publishResult.warnings.map((w, i) => <div key={i}>{w}</div>)}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="pt-1">
                    <Button
                      type="submit"
                      disabled={!publishConfirmed || !publishFlowId || !publishVersion || !publishHandle || publishing}
                      className="text-[12.5px]"
                    >
                      {publishing ? "Publishing…" : "Publish"}
                    </Button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </>
      )}
    </section>
  );
}

// Unified flow card: the same fcard slab the hub uses. The default flow is the
// white "hero" card; other flows are violet. The card name opens the flow;
// management actions are revealed on hover (no buttons/pills in the resting card).
function LocalFlowCard({
  flow,
  variant,
  busy,
  onOpen,
  onUseAsDefault,
  onExport,
  onFork,
  onDelete,
}: {
  flow: DiscoveredFlow;
  variant: "selected" | "violet" | "white";
  busy: "fork" | "delete" | "export" | null;
  onOpen: () => void;
  onUseAsDefault: () => void;
  onExport: () => void;
  onFork: (() => void) | null;
  onDelete: (() => void) | null;
}) {
  const isProject = flow.source.kind === "project";
  const isSelected = variant === "selected";
  const steps = flow.definition.steps ?? [];
  const seats = Object.keys(flow.definition.seats ?? {}).length;
  const gates = steps.filter((s) => s.kind === "approval-gate" || !!s.approval).length;
  return (
    <div className={cn("fcard", variant === "selected" && "is-selected", variant === "white" && "is-verified")}>
      <div className="fcard-top">
        <div className="fcard-id">
          {isSelected ? (
            <>
              <span className="fcard-check">✓</span>
              <span className="fcard-verified">runs by default</span>
            </>
          ) : (
            <span className="fcard-author">{isProject ? "project" : "built-in"}</span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="fcard-name block w-full bg-transparent p-0 text-left"
      >
        {flow.label}
      </button>
      {flow.definition.description ? (
        <p className="fcard-sum">{flow.definition.description}</p>
      ) : null}
      <div className="fcard-strip">
        <span className="fcard-cell">{steps.length} steps</span>
        <span className="fcard-cell">{seats} {seats === 1 ? "seat" : "seats"}</span>
        {gates > 0 ? (
          <span className="fcard-cell">{gates} {gates === 1 ? "gate" : "gates"}</span>
        ) : null}
        {flow.version != null ? <span className="fcard-cell">v{flow.version}</span> : null}
      </div>
      <div className="fcard-actions">
        {!isSelected ? (
          <button type="button" className="fcard-act" onClick={onUseAsDefault}>
            set default
          </button>
        ) : null}
        <button type="button" className="fcard-act" onClick={onOpen}>
          {isProject ? "edit" : "open"}
        </button>
        {onFork ? (
          <button type="button" className="fcard-act" disabled={busy !== null} onClick={onFork}>
            {busy === "fork" ? "copying…" : "customize"}
          </button>
        ) : null}
        <button type="button" className="fcard-act" disabled={busy !== null} onClick={onExport}>
          {busy === "export" ? "exporting…" : "export"}
        </button>
        {onDelete ? (
          <button type="button" className="fcard-act" disabled={busy !== null} onClick={onDelete}>
            {busy === "delete" ? "deleting…" : "delete"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

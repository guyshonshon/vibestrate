import React, { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Plus,
  Search,
  Upload,
} from "lucide-react";
import { api } from "../../lib/api.js";
import type { DiscoveredFlow, HubFlowRow, HubPublishResult } from "../../lib/types.js";
import { Button } from "../../components/design/Button.js";
import { EntityIcon } from "../../components/design/EntityIcon.js";
import { FlowBars } from "../../components/design/FlowBars.js";
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
    <div className="font-jakarta px-10 py-7 fade-up">
      <header className="mb-6">
        <h1 className="text-[24px] font-extrabold tracking-[-0.02em] text-chalk-100">
          Flows
        </h1>
      </header>

      {/* Contained header: title context + the page's primary actions live in a
          single framed block instead of floating loose on the canvas. */}
      <section className="mb-6 flex flex-wrap items-start gap-4 rounded-[20px] border border-[color:var(--line)] bg-coal-600 p-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-bold text-chalk-100">All flows</h2>
            <span className="mono num-tabular text-[12px] text-chalk-400">
              {flows ? defaultFlowCount + otherFlows.length : ""}
            </span>
          </div>
          <div className="mt-1.5 max-w-[68ch] space-y-1 text-[13px] leading-[1.55] text-chalk-300">
            <p>
              A flow is the recipe your crew follows - ordered steps, the roles
              that run them, approval gates.
            </p>
            <p>
              The{" "}
              <strong className="font-semibold text-chalk-100">Default flow</strong>{" "}
              runs unless you pick another.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
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
        <section className="mt-4 rounded-[18px] border border-[color:var(--line)] bg-coal-600 px-4 py-3.5">
          <div className="flex items-center gap-3">
            <div className="text-[12px] font-semibold text-violet-vivid">Import a flow</div>
            <div className="ml-auto inline-flex rounded-[10px] border border-[color:var(--line)] p-0.5 text-[11.5px]">
              {(["yaml", "url"] as ImportMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setImportMode(m)}
                  className={cn(
                    "rounded-[8px] px-2 py-0.5 transition",
                    importMode === m
                      ? "bg-coal-500 text-chalk-100"
                      : "text-chalk-400 hover:text-chalk-100",
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
              className="mono mt-3 h-44 w-full resize-y rounded-[12px] border border-[color:var(--line-strong)] bg-coal-800 px-2.5 py-2 text-[12px] text-chalk-100 outline-none focus:border-violet-soft/50"
            />
          ) : (
            <input
              type="url"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="https://example.com/path/flow.yml"
              className="mono mt-3 w-full rounded-[12px] border border-[color:var(--line-strong)] bg-coal-800 px-2.5 py-2 text-[12px] text-chalk-100 outline-none focus:border-violet-soft/50"
            />
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-1.5 text-[12px] text-chalk-300">
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
          <p className="mt-2 text-[11px] text-chalk-400">
            Validated against the flow schema; refused if it carries secrets.
            URL fetches are size- and time-bounded.
          </p>
        </section>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-[12px] border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-300">
          {error}
        </div>
      ) : null}

      {invalid.length > 0 ? (
        <div className="mt-4 rounded-[12px] border border-amber-soft/30 bg-amber-soft/10 px-3 py-2.5 text-[12.5px] text-amber-soft">
          <div className="font-semibold">
            {invalid.length} project flow{invalid.length === 1 ? "" : "s"} couldn't
            be loaded and {invalid.length === 1 ? "was" : "were"} skipped:
          </div>
          <ul className="mt-1.5 space-y-1">
            {invalid.map((bad) => (
              <li key={bad.path} className="text-[11.5px]">
                <span className="mono text-amber-soft">{bad.path}</span>
                <span className="text-chalk-300"> - {bad.message}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="mt-8">
        {!flows ? (
          <div className="text-[13px] text-chalk-400">Loading flows…</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
    if (flow) {
      const prevFlow = projectFlows.find((f) => f.id === publishFlowId);
      const prevLabel = prevFlow?.label || prevFlow?.id || "";
      if (!publishName || publishName === prevLabel) {
        setPublishName(flow.label || flow.id);
      }
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
    <section className="mt-12">
      {/* Hub header - the same contained frame as the All flows header. */}
      <div className="mb-6 rounded-[20px] border border-[color:var(--line)] bg-coal-600 p-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-[15px] font-bold text-chalk-100">Pull a flow</h2>
          <span className="text-[12px] text-chalk-300">from the hub</span>
          <Button
            variant="secondary"
            size="sm"
            className="ml-1"
            iconLeft={open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Hide hub" : "Browse hub"}
          </Button>
          {open ? (
            <span className="mono text-[11.5px] text-chalk-400 whitespace-nowrap">
              {hubError ? "hub unavailable" : rows ? `${rows.length} ${rows.length === 1 ? "flow" : "flows"}` : "loading…"}
            </span>
          ) : null}
        </div>
        <p className="mt-2 max-w-[68ch] text-[13px] leading-[1.55] text-chalk-300">
          Browse and install community flows from vibestrate.com - downloaded over
          the internet, vetted through the secret-guarded import writer.
        </p>
      </div>

      {open ? (
        <>
          <div className="relative mb-4 max-w-[420px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-chalk-400" strokeWidth={1.9} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or @handle…"
              className="mono w-full rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 py-2 pl-9 pr-3 text-[13px] text-chalk-100 outline-none placeholder:text-chalk-400 focus:border-violet-soft/50"
            />
          </div>

          <div className="mt-0">
        {hubError ? (
          <div className="rounded-[12px] border border-rose-400/30 bg-rose-500/10 px-3 py-2.5 text-[12.5px] text-rose-300">
            Couldn&apos;t load the hub right now: {hubError}
          </div>
        ) : loading && rows === null ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-[150px] rounded-[14px] border border-[color:var(--line)] bg-coal-600/40" aria-hidden />
            ))}
          </div>
        ) : rows && rows.length === 0 ? (
          <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 px-6 py-10 text-center text-[13px] text-chalk-300">
            No hub flows match these filters.
          </div>
        ) : rows ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rows.map((row) => {
              const risk = hubDiagnosisLabel(row.diagnosis);
              const name = row.label || row.name || row.ref;
              // The hub only sends a step *count*, not the per-step kinds, so the
              // meter shows shape (count) in neutral grey, not the violet/sky/amber
              // makeup the local cards carry. Same card shell either way.
              const meterSteps =
                typeof row.steps === "number"
                  ? Array.from({ length: Math.max(1, row.steps) }, () => ({}))
                  : [];
              const stats: FlowStat[] = [
                ...(typeof row.steps === "number"
                  ? [{ value: row.steps, label: row.steps === 1 ? "step" : "steps" }]
                  : []),
                ...(row.version ? [{ value: `v${row.version}`, label: "version" }] : []),
                ...(typeof row.installs === "number"
                  ? [{ value: row.installs.toLocaleString(), label: "installs" }]
                  : []),
              ];
              return (
                <FlowCard
                  key={row.ref}
                  title={name}
                  badge={
                    row.verified ? (
                      <span className="shrink-0 text-[10px] font-bold text-emerald-400">curated</span>
                    ) : row.author ? (
                      <span className="mono shrink-0 text-[10.5px] text-violet-soft">@{row.author}</span>
                    ) : null
                  }
                  steps={meterSteps}
                  description={row.description}
                  stats={stats}
                  extra={
                    risk ? <div className="mt-2 text-[10.5px] text-amber-soft">{risk}</div> : null
                  }
                  footer={
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={installing !== null}
                      onClick={() => void install(row)}
                    >
                      {installing === row.ref ? "Installing…" : "Install"}
                    </Button>
                  }
                />
              );
            })}
          </div>
        ) : null}
          </div>

          <p className="mt-4 max-w-[80ch] text-[12.5px] leading-[1.5] text-chalk-300">
            &ldquo;Hub-curated&rdquo; is the hub&apos;s curation claim, not an integrity
            guarantee; checksums verify transport only. A hub flow is executable
            configuration: review an installed flow before running it.
          </p>
        </>
      ) : null}

      {/* ── Publish a flow - always visible, independent of browsing the hub ── */}
      <div className="mt-8 border-t border-[color:var(--line)] pt-6">
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
                <ChevronDown className="h-4 w-4 shrink-0 text-chalk-400" strokeWidth={1.8} />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-chalk-400" strokeWidth={1.8} />
              )}
              <span className="text-[12px] font-semibold text-violet-vivid">
                Publish a flow to the hub
              </span>
            </button>

            {publishOpen && (
              <form onSubmit={(e) => void submitPublish(e)} className="mt-4 max-w-[520px]">
                <div className="space-y-3 rounded-[16px] border border-[color:var(--line)] bg-coal-800 px-4 py-4">
                  {/* Flow picker */}
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-violet-vivid">
                      Flow
                    </label>
                    {projectFlows.length === 0 ? (
                      <p className="text-[12.5px] text-chalk-400">
                        No project flows found. Fork or create a project flow first.
                      </p>
                    ) : (
                      <select
                        value={publishFlowId}
                        onChange={(e) => handlePublishFlowChange(e.target.value)}
                        required
                        className="mono w-full rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 px-2.5 py-1.5 text-[13px] text-chalk-100 outline-none focus:border-violet-soft/50"
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
                    <label className="mb-1 block text-[11px] font-semibold text-violet-vivid">
                      Name
                    </label>
                    <input
                      type="text"
                      value={publishName}
                      onChange={(e) => setPublishName(e.target.value)}
                      placeholder="human-readable name"
                      className="mono w-full rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 px-2.5 py-1.5 text-[13px] text-chalk-100 outline-none placeholder:text-chalk-400 focus:border-violet-soft/50"
                    />
                  </div>

                  {/* Version */}
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-violet-vivid">
                      Version
                    </label>
                    <input
                      type="text"
                      value={publishVersion}
                      onChange={(e) => setPublishVersion(e.target.value)}
                      placeholder="1.0.0"
                      required
                      className="mono w-full rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 px-2.5 py-1.5 text-[13px] text-chalk-100 outline-none placeholder:text-chalk-400 focus:border-violet-soft/50"
                    />
                  </div>

                  {/* Handle */}
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-violet-vivid">
                      Handle
                    </label>
                    <input
                      type="text"
                      value={publishHandle}
                      onChange={(e) => setPublishHandle(e.target.value)}
                      placeholder="your-github-handle"
                      required
                      className="mono w-full rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 px-2.5 py-1.5 text-[13px] text-chalk-100 outline-none placeholder:text-chalk-400 focus:border-violet-soft/50"
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
                    <span className="text-[12.5px] leading-[1.45] text-chalk-300">
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
                        <div className="text-chalk-400">already published - version unchanged</div>
                      ) : null}
                      {publishResult.diagnosis?.verdict === "flagged" && publishResult.diagnosis.findings?.length ? (
                        <div className="mt-1 space-y-0.5">
                          <span className="text-amber-300">flagged:</span>
                          {publishResult.diagnosis.findings.map((f, i) => (
                            <div key={i} className="text-chalk-300">
                              {f.severity ? <span className="text-amber-400">[{f.severity}] </span> : null}
                              {f.message}
                              {f.path ? <span className="text-chalk-400"> ({f.path})</span> : null}
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
  const stats: FlowStat[] = [
    { value: steps.length, label: steps.length === 1 ? "step" : "steps" },
    { value: seats, label: seats === 1 ? "seat" : "seats" },
    ...(gates > 0 ? [{ value: gates, label: gates === 1 ? "gate" : "gates" }] : []),
    ...(flow.version != null ? [{ value: `v${flow.version}`, label: "version" }] : []),
  ];
  // The universal FlowCard renders the chrome; this composes it with the
  // local catalog's actions (Edit/Open + the management overflow menu) and the
  // emerald default mark. The hub uses the same FlowCard so the two can't drift.
  return (
    <FlowCard
      title={flow.label}
      onTitleClick={onOpen}
      selected={isSelected}
      badge={
        isSelected ? (
          <span className="shrink-0 text-[10px] font-bold text-emerald-400">default</span>
        ) : null
      }
      steps={steps}
      description={flow.definition.description}
      stats={stats}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onOpen}>
            {isProject ? "Edit" : "Open"}
          </Button>
          <div className="ml-auto">
            <FlowCardMenu
              busy={busy !== null}
              items={[
                isSelected ? null : { label: "Set as default", onClick: onUseAsDefault },
                onFork ? { label: busy === "fork" ? "Copying…" : "Customize", onClick: onFork } : null,
                { label: busy === "export" ? "Exporting…" : "Export", onClick: onExport },
                onDelete ? { label: busy === "delete" ? "Deleting…" : "Delete", onClick: onDelete, danger: true } : null,
              ]}
            />
          </div>
        </>
      }
    />
  );
}

type FlowStat = { value: string | number; label: string };

/**
 * The universal flow card. One component renders a flow the same everywhere -
 * the local catalog and the hub - so the two never drift: flow icon + name +
 * an optional trailing badge, the FlowBars step-meter, a clamped description,
 * a row of framed stat tiles, an optional extra line, and a bordered footer
 * for the card's actions. Callers supply their own stats + footer; the chrome
 * is fixed here.
 */
function FlowCard({
  title,
  onTitleClick,
  badge,
  steps,
  description,
  stats,
  extra,
  footer,
  selected,
}: {
  title: string;
  onTitleClick?: () => void;
  badge?: React.ReactNode;
  steps: Array<{ kind?: string }>;
  description?: string | null;
  stats: FlowStat[];
  extra?: React.ReactNode;
  footer: React.ReactNode;
  selected?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-[14px] border bg-coal-600 p-3.5",
        selected ? "border-emerald-500/40" : "border-[color:var(--line)]",
      )}
    >
      <div className="flex items-center gap-2">
        <EntityIcon entity="flow" size={16} className="shrink-0 text-violet-soft" />
        {onTitleClick ? (
          <button
            type="button"
            onClick={onTitleClick}
            className="min-w-0 flex-1 truncate bg-transparent p-0 text-left text-[13.5px] font-bold text-chalk-100 transition hover:text-violet-soft"
          >
            {title}
          </button>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-chalk-100">
            {title}
          </span>
        )}
        {badge}
      </div>
      <FlowBars steps={steps} />
      {description ? (
        <p className="line-clamp-2 text-[12px] leading-snug text-chalk-300">{description}</p>
      ) : null}
      {stats.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-stretch gap-1.5">
          {stats.map((s, i) => (
            <StatTile key={i} value={s.value} label={s.label} />
          ))}
        </div>
      ) : null}
      {extra}
      <div className="mt-3.5 flex items-center gap-1.5 border-t border-[color:var(--line-soft)] pt-3">
        {footer}
      </div>
    </div>
  );
}

/** A single framed stat - a small inset card with a bold value over its unit,
 *  the unit carrying violet so a card's facts read as data, not faint grey
 *  text. Hugs its content (no stretch) so the row stays tight, not two
 *  half-card slabs. */
function StatTile({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex min-w-[52px] flex-col gap-0.5 rounded-[10px] border border-[color:var(--line-soft)] bg-coal-500/50 px-3 py-1.5">
      <span className="num-tabular text-[15px] font-bold leading-none text-chalk-100">{value}</span>
      <span className="text-[10.5px] font-medium text-violet-soft">{label}</span>
    </div>
  );
}

type MenuItem = { label: string; onClick: () => void; danger?: boolean };

/** Overflow menu for a card's secondary actions - a single contained icon
 *  button that opens a coal popover. Keeps the resting card to one primary
 *  button instead of a wrapping row of bare text links. */
function FlowCardMenu({ items, busy }: { items: Array<MenuItem | null>; busy: boolean }) {
  const real = items.filter((x): x is MenuItem => x !== null);
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
  if (real.length === 0) return null;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 w-7 items-center justify-center rounded-[10px] border border-[color:var(--line-strong)] bg-coal-600 text-chalk-300 transition hover:bg-coal-500 hover:text-chalk-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <MoreHorizontal className="h-4 w-4" strokeWidth={1.9} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 min-w-[148px] overflow-hidden rounded-[12px] border border-[color:var(--line)] bg-coal-800 py-1 shadow-2xl"
        >
          {real.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className={cn(
                "block w-full px-3 py-1.5 text-left text-[12.5px] font-medium transition hover:bg-coal-500",
                it.danger ? "text-rose-300 hover:text-rose-300" : "text-chalk-300 hover:text-chalk-100",
              )}
            >
              {it.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

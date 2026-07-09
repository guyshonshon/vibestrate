import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Check, FolderTree, Map as MapIcon, MessageSquarePlus, RotateCcw, Search, Sparkles, Trash2 } from "lucide-react";
import { ApiError, api, type CodebaseAnnotation } from "../../lib/api.js";
import type {
  FileTreeResult,
  FileView,
  RunState,
} from "../../lib/types.js";
import { FileTreeView } from "../../components/codebase/FileTreeView.js";
import { FileViewer } from "../../components/codebase/FileViewer.js";
import { FreshnessIndicator } from "../../components/codebase/FreshnessIndicator.js";
import { CodebaseMapPanel } from "../../components/codebase/CodebaseMapPanel.js";
import {
  ContentResults,
  SupervisorResults,
} from "../../components/codebase/CodebaseSearchResults.js";
import { Button } from "../../components/design/Button.js";
import { Select } from "../../components/design/Select.js";
import { StatTile } from "../../components/design/StatTile.js";
import { cn } from "../../components/design/cn.js";
import { PageShell, PageHeader } from "../../components/layout/PageShell.js";
import { useCodebaseEvents } from "../../lib/useCodebaseEvents.js";

type Props = {
  /** Optional initial state from the URL: ?path=&line=&runId=. */
  initial: { path: string | null; line: number | null; runId: string | null };
  onUrlChange: (input: {
    path: string | null;
    line: number | null;
    runId: string | null;
  }) => void;
};

type Source = "project" | "worktree";

export function CodebasePage({ initial, onUrlChange }: Props) {
  const [runs, setRuns] = useState<RunState[]>([]);
  const [source, setSource] = useState<Source>(initial.runId ? "worktree" : "project");
  const [runId, setRunId] = useState<string | null>(initial.runId);
  const [tree, setTree] = useState<FileTreeResult | null>(null);
  const [filter, setFilter] = useState("");
  // Search: mode + query + content-search options. `filter` stays the fast
  // filename filter for the tree; content/supervisor search hit the server.
  const [searchMode, setSearchMode] = useState<"files" | "content" | "supervisor" | "map">("files");
  const [query, setQuery] = useState("");
  const [include, setInclude] = useState("");
  const [exclude, setExclude] = useState("");
  const [regex, setRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [supervisorToken, setSupervisorToken] = useState(0);
  const [path, setPath] = useState<string | null>(initial.path);
  const [line, setLine] = useState<number | null>(initial.line);
  const [view, setView] = useState<FileView | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Draft anchor for a new annotation. Lifted here so clicking the "+" on a
  // line in the viewer can pre-fill the form in the side panel.
  const [annDraftLine, setAnnDraftLine] = useState<number | null>(null);
  const [annDraftEndLine, setAnnDraftEndLine] = useState<number | null>(null);

  // `mountedRef` gates every async setState. The previous crash on
  // "go to codebase, then leave" was the burst of in-flight fetches
  // resolving onto an unmounted component - combined with the SSE
  // reconnect loop still holding queued setTimeouts. The flag plus
  // explicit cleanup of pending timers and SSE in useCodebaseEvents
  // makes the page safe to abandon at any moment.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Load runs once for the worktree picker.
  useEffect(() => {
    void api
      .listRuns()
      .then((r) => {
        if (mountedRef.current) setRuns(r);
      })
      .catch(() => {});
  }, []);

  const sseUrl =
    source === "project"
      ? "/api/project/events/stream"
      : runId
        ? `/api/runs/${encodeURIComponent(runId)}/codebase/events/stream`
        : null;
  const freshness = useCodebaseEvents(sseUrl);

  const reloadTree = useCallback(async () => {
    if (!mountedRef.current) return;
    setError(null);
    try {
      if (source === "project") {
        // Bounded tree fetch: a 2000-node tree (the previous default)
        // could still spike memory + parsing time when re-fetched
        // every few seconds on busy repos. 600 entries / depth 3 is
        // enough for normal browsing; users expand deeper interactively.
        const next = await api.getProjectTree({ depth: 3, maxEntries: 600 });
        if (mountedRef.current) setTree(next);
      } else if (runId) {
        const next = await api.getRunTree(runId);
        if (mountedRef.current) setTree(next);
      } else {
        if (mountedRef.current) setTree(null);
      }
    } catch (err) {
      if (mountedRef.current)
        setError(err instanceof Error ? err.message : String(err));
    }
  }, [source, runId]);

  useEffect(() => {
    void reloadTree();
  }, [reloadTree]);

  const reloadFile = useCallback(async () => {
    if (!mountedRef.current) return;
    if (!path) {
      setView(null);
      return;
    }
    setLoadingFile(true);
    setFileError(null);
    try {
      const span = lineRangeFor(line);
      const file =
        source === "project"
          ? await api.getProjectFile({
              path,
              lineStart: span.start ?? undefined,
              lineEnd: span.end ?? undefined,
            })
          : runId
            ? await api.getRunFile({
                runId,
                path,
                lineStart: span.start ?? undefined,
                lineEnd: span.end ?? undefined,
              })
            : null;
      if (mountedRef.current) setView(file);
    } catch (err) {
      if (!mountedRef.current) return;
      if (err instanceof ApiError) setFileError(err.message);
      else setFileError(err instanceof Error ? err.message : String(err));
      setView(null);
    } finally {
      if (mountedRef.current) setLoadingFile(false);
    }
  }, [path, line, source, runId]);

  useEffect(() => {
    void reloadFile();
  }, [reloadFile]);

  // When the SSE channel reports a change, force-reload the tree +
  // file view - debounced 400ms so a burst of git/filetree events
  // collapses to one fetch. Bails out if the component already
  // unmounted while the timer was pending.
  useEffect(() => {
    if (!freshness.lastEvent) return;
    const t = window.setTimeout(() => {
      if (!mountedRef.current) return;
      void reloadTree();
      void reloadFile();
    }, 400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshness.lastEvent]);

  // Push URL changes back so deep-links survive a refresh.
  useEffect(() => {
    onUrlChange({ path, line, runId: source === "worktree" ? runId : null });
    // `onUrlChange` is intentionally excluded - if the parent gives
    // us a non-stable callback, the effect re-fires on every render
    // and stomps the URL back to `#/codebase`, trapping the user on
    // this page. The effect only needs to run when the displayed
    // file/run state actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, line, source, runId]);

  const sourceLabel = useMemo(() => {
    if (source === "project") return "Project root";
    if (runId) return `Run worktree - ${runId}`;
    return "Run worktree (none selected)";
  }, [source, runId]);

  return (
    <PageShell variant="fill">
      <PageHeader
        className="mb-4"
        title="Codebase"
        actions={
          <>
            <div className="inline-flex items-center gap-0.5 rounded-[10px] border border-[color:var(--line)] bg-coal-800 p-0.5">
              <SourceTab active={source === "project"} onClick={() => setSource("project")}>
                Project
              </SourceTab>
              <SourceTab
                active={source === "worktree"}
                onClick={() => {
                  setSource("worktree");
                  // Content/supervisor search runs against the project git repo,
                  // not a run worktree - fall back to the filename filter.
                  setSearchMode("files");
                }}
              >
                Worktree
              </SourceTab>
            </div>
            {source === "worktree" ? (
              <Select
                value={runId ?? ""}
                ariaLabel="Run worktree to inspect"
                className="min-w-[180px] max-w-[220px]"
                placeholder="Choose a run"
                onChange={(v) => {
                  setRunId(v || null);
                  setPath(null);
                  setLine(null);
                }}
                options={runs.map((r) => ({ value: r.runId, label: r.runId }))}
              />
            ) : null}
            <FreshnessIndicator
              freshness={freshness}
              onRefresh={() => {
                void reloadTree();
                void reloadFile();
              }}
            />
          </>
        }
      />

      <div className="flex min-h-0 flex-1 gap-3 pb-5">
        {/* ── File tree + search ────────────────────────────────────── */}
        <aside className="flex w-72 shrink-0 flex-col overflow-hidden rounded-[16px] border border-[color:var(--line)] bg-coal-700">
          <div className="border-b border-[color:var(--line-soft)] p-2.5">
            {/* Mode chips. Content + supervisor search hit the project's git
                repo, so they're offered only in project mode. */}
            <div className="mb-2 inline-flex items-center gap-0.5 rounded-[9px] border border-[color:var(--line)] bg-coal-800 p-0.5">
              <ModeChip active={searchMode === "files"} onClick={() => setSearchMode("files")} icon={<FolderTree className="h-3 w-3" strokeWidth={1.9} />} label="Files" />
              {source === "project" ? (
                <>
                  <ModeChip active={searchMode === "content"} onClick={() => setSearchMode("content")} icon={<Search className="h-3 w-3" strokeWidth={1.9} />} label="Content" />
                  <ModeChip active={searchMode === "supervisor"} onClick={() => setSearchMode("supervisor")} icon={<Sparkles className="h-3 w-3" strokeWidth={1.9} />} label="Ask" />
                  <ModeChip active={searchMode === "map"} onClick={() => setSearchMode("map")} icon={<MapIcon className="h-3 w-3" strokeWidth={1.9} />} label="Map" />
                </>
              ) : null}
            </div>

            {searchMode === "map" ? (
              <p className="px-0.5 text-[11px] leading-snug text-chalk-300">
                Deterministic snapshot of stack, layout, entry points, and best-effort
                routes - shown on the right.
              </p>
            ) : searchMode === "files" ? (
              <SearchInput icon={<Search />} value={filter} onChange={setFilter} placeholder="Filter files by name" />
            ) : searchMode === "content" ? (
              <div className="space-y-1.5">
                <SearchInput icon={<Search />} value={query} onChange={setQuery} placeholder="Search file contents" />
                <div className="grid grid-cols-2 gap-1.5">
                  <MiniInput value={include} onChange={setInclude} placeholder="Include glob" />
                  <MiniInput value={exclude} onChange={setExclude} placeholder="Exclude glob" />
                </div>
                <div className="flex items-center gap-3 px-0.5 pt-0.5">
                  <Toggle checked={regex} onChange={setRegex} label="Regex" />
                  <Toggle checked={caseSensitive} onChange={setCaseSensitive} label="Case" />
                </div>
              </div>
            ) : (
              <form
                className="space-y-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (query.trim()) setSupervisorToken((t) => t + 1);
                }}
              >
                <SearchInput icon={<Sparkles />} value={query} onChange={setQuery} placeholder="e.g. the file that handles login" />
                <Button type="submit" variant="primary" size="sm" className="w-full" disabled={!query.trim()} iconLeft={<Sparkles className="h-3.5 w-3.5" strokeWidth={1.9} />}>
                  Ask the supervisor
                </Button>
              </form>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto py-1.5">
            {searchMode === "map" ? null : searchMode === "content" ? (
              <ContentResults
                query={query}
                regex={regex}
                caseSensitive={caseSensitive}
                include={include}
                exclude={exclude}
                selectedPath={path}
                onOpen={(p, l) => {
                  setPath(p);
                  setLine(l ?? null);
                }}
              />
            ) : searchMode === "supervisor" ? (
              <SupervisorResults
                query={query}
                submitToken={supervisorToken}
                selectedPath={path}
                onOpen={(p) => {
                  setPath(p);
                  setLine(null);
                }}
                onRunTerm={(term) => {
                  setSearchMode("content");
                  setRegex(false);
                  setQuery(term);
                }}
              />
            ) : error ? (
              <div className="m-2.5 rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[11.5px] text-rose-300">
                {error}
                <button
                  type="button"
                  onClick={() => void reloadTree()}
                  className="ml-1 font-semibold text-rose-300 underline underline-offset-2 hover:text-rose-200"
                >
                  retry
                </button>
              </div>
            ) : tree ? (
              <FileTreeView
                data={tree}
                selectedPath={path}
                filter={filter}
                onSelectFile={(rel) => {
                  setPath(rel);
                  setLine(null);
                }}
              />
            ) : source === "worktree" && !runId ? (
              <div className="m-2.5 rounded-[10px] border border-[color:var(--line)] bg-coal-600 px-3 py-3 text-[11.5px] text-chalk-300">
                Pick a run above to inspect its worktree.
              </div>
            ) : (
              <div className="px-3 py-2 text-[11.5px] text-chalk-400">Loading tree.</div>
            )}
          </div>
        </aside>

        {searchMode === "map" ? (
          /* ── Codebase map ────────────────────────────────────────── */
          <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[16px] border border-[color:var(--line)] bg-coal-700">
            <CodebaseMapPanel />
          </main>
        ) : (
          <>
            {/* ── File viewer ─────────────────────────────────────────── */}
            <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[16px] border border-[color:var(--line)] bg-coal-700">
              <FileViewer
                view={view}
                loading={loadingFile}
                error={fileError}
                runId={runId}
                highlightLine={line}
                onAnnotateLine={
                  source === "project"
                    ? (l) => {
                        setAnnDraftLine(l);
                        setAnnDraftEndLine(null);
                      }
                    : undefined
                }
              />
            </main>

            {/* ── Inspector + annotations ─────────────────────────────── */}
            <AnnotationsPanel
              source={source}
              sourceLabel={sourceLabel}
              tree={tree}
              view={view}
              line={line}
              path={path}
              draftLine={annDraftLine}
              setDraftLine={setAnnDraftLine}
              draftEndLine={annDraftEndLine}
              setDraftEndLine={setAnnDraftEndLine}
            />
          </>
        )}
      </div>
    </PageShell>
  );
}

function lineRangeFor(line: number | null): {
  start: number | null;
  end: number | null;
} {
  if (!line || !Number.isFinite(line)) return { start: null, end: null };
  // Show a window around the highlighted line so the user has context.
  const start = Math.max(1, line - 30);
  const end = line + 60;
  return { start, end };
}

function SourceTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[8px] px-3 py-1 text-[12px] font-semibold transition",
        active
          ? "bg-coal-600 text-chalk-100 shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
          : "text-chalk-400 hover:text-chalk-200",
      )}
    >
      {children}
    </button>
  );
}

function anchorLabel(line: number | null, endLine: number | null): string {
  if (line === null) return "Whole file";
  if (endLine === null || endLine === line) return `Line ${line}`;
  return `Lines ${line}-${endLine}`;
}

function ModeChip({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded-[7px] px-2 py-1 text-[11px] font-semibold transition",
        active
          ? "bg-coal-600 text-chalk-100 shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
          : "text-chalk-400 hover:text-chalk-100",
      )}
    >
      <span className={active ? "text-violet-soft" : ""}>{icon}</span>
      {label}
    </button>
  );
}

function SearchInput({
  icon,
  value,
  onChange,
  placeholder,
}: {
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-chalk-400 [&>svg]:h-3.5 [&>svg]:w-3.5">
        {icon}
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 py-1.5 pl-8 pr-3 text-[12.5px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none"
      />
    </div>
  );
}

function MiniInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      spellCheck={false}
      className="mono w-full rounded-[8px] border border-[color:var(--line-strong)] bg-coal-800 px-2 py-1 text-[11px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none"
    />
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-chalk-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3 w-3 accent-violet-soft"
      />
      {label}
    </label>
  );
}

function AnnotationsPanel(props: {
  source: Source;
  sourceLabel: string;
  tree: FileTreeResult | null;
  view: FileView | null;
  line: number | null;
  path: string | null;
  draftLine: number | null;
  setDraftLine: (n: number | null) => void;
  draftEndLine: number | null;
  setDraftEndLine: (n: number | null) => void;
}) {
  const { source, sourceLabel, tree, view, path } = props;
  const [anns, setAnns] = useState<CodebaseAnnotation[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [share, setShare] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const canAnnotate = source === "project" && !!path && !view?.isSecretLike;

  const load = useCallback(async () => {
    if (source !== "project" || !path) {
      setAnns([]);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const list = await api.listAnnotations({ path });
      if (mounted.current) setAnns(list);
    } catch (e) {
      if (mounted.current) setErr(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [source, path]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    if (!path || !body.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const created = await api.addAnnotation({
        path,
        line: props.draftLine,
        endLine: props.draftEndLine,
        body,
        shareWithRoles: share,
      });
      if (!mounted.current) return;
      setAnns((cur) => [created, ...cur]);
      setBody("");
      props.setDraftLine(null);
      props.setDraftEndLine(null);
    } catch (e) {
      if (mounted.current) setErr(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setSaving(false);
    }
  }

  async function patch(
    id: string,
    p: { status?: "open" | "resolved"; shareWithRoles?: boolean },
  ) {
    setBusyId(id);
    try {
      const updated = await api.updateAnnotation(id, p);
      if (mounted.current) setAnns((cur) => cur.map((a) => (a.id === id ? updated : a)));
    } catch (e) {
      if (mounted.current) setErr(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setBusyId(null);
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    try {
      await api.deleteAnnotation(id);
      if (mounted.current) setAnns((cur) => cur.filter((a) => a.id !== id));
    } catch (e) {
      if (mounted.current) setErr(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setBusyId(null);
    }
  }

  return (
    <aside className="hidden w-80 shrink-0 flex-col overflow-y-auto rounded-[16px] border border-[color:var(--line)] bg-coal-700 lg:flex">
      <div className="border-b border-[color:var(--line-soft)] p-3">
        <h2 className="text-[13px] font-bold text-violet-vivid">Inspector</h2>
        <div className="num-tabular mt-1.5 truncate text-[12px] font-semibold text-chalk-100">
          {sourceLabel}
        </div>
        {tree ? (
          <div className="mt-2 flex flex-wrap items-stretch gap-1">
            <StatTile value={tree.totalCount} label="entries" />
            <StatTile value={tree.depth} label="depth" />
            {tree.truncated ? (
              <StatTile value="yes" label="truncated" tone="amber" />
            ) : null}
          </div>
        ) : null}
        {view ? (
          <>
            <div className="mt-2.5 truncate text-[11.5px] font-medium text-chalk-300">
              <span className="num-tabular">{view.path}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-stretch gap-1">
              <StatTile
                value={view.totalLines === null ? "-" : view.totalLines}
                label="lines"
              />
              <StatTile value={`${(view.size / 1024).toFixed(1)}k`} label="bytes" />
              {view.isSecretLike ? (
                <StatTile value="redacted" label="status" tone="amber" />
              ) : view.isBinary ? (
                <StatTile value="binary" label="status" />
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <MessageSquarePlus className="h-3.5 w-3.5 text-violet-soft" strokeWidth={1.9} aria-hidden />
          <h2 className="text-[13px] font-bold text-violet-vivid">Annotations</h2>
        </div>
        <p className="mb-3 text-[11.5px] leading-snug text-chalk-300">
          Notes pinned to this file. Ones marked{" "}
          <span className="font-semibold text-violet-soft">visible to agents</span> are
          added to every agent's prompt during runs - your guidance, acknowledged by the
          crew.
        </p>

        {err ? (
          <div className="mb-2 rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-[11.5px] text-rose-300">
            {err}
          </div>
        ) : null}

        {source !== "project" ? (
          <div className="rounded-[12px] border border-[color:var(--line)] bg-coal-600 px-3 py-2.5 text-[11.5px] text-chalk-300">
            Switch to <span className="font-semibold text-chalk-100">Project</span> to read
            or add annotations - they're pinned to the project codebase.
          </div>
        ) : !path ? (
          <div className="rounded-[12px] border border-[color:var(--line)] bg-coal-600 px-3 py-2.5 text-[11.5px] text-chalk-300">
            Select a file from the tree to see and add its annotations.
          </div>
        ) : (
          <>
            {canAnnotate ? (
              <div className="rounded-[12px] border border-[color:var(--line)] bg-coal-600 p-2.5">
                <div className="mb-2 flex items-center gap-1.5">
                  <span className="text-[11px] font-medium text-violet-soft">Anchor</span>
                  <span className="rounded-[8px] bg-coal-500 px-1.5 py-0.5 text-[11px] font-semibold text-chalk-100">
                    {anchorLabel(props.draftLine, props.draftEndLine)}
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={props.draftLine ?? ""}
                    placeholder="line"
                    aria-label="Anchor line"
                    onChange={(e) =>
                      props.setDraftLine(e.target.value ? Number(e.target.value) : null)
                    }
                    className="ml-auto w-14 rounded-[8px] border border-[color:var(--line-strong)] bg-coal-800 px-1.5 py-0.5 text-[11px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none"
                  />
                  <span className="text-chalk-400">-</span>
                  <input
                    type="number"
                    min={1}
                    value={props.draftEndLine ?? ""}
                    placeholder="end"
                    aria-label="Anchor end line"
                    disabled={props.draftLine === null}
                    onChange={(e) =>
                      props.setDraftEndLine(e.target.value ? Number(e.target.value) : null)
                    }
                    className="w-14 rounded-[8px] border border-[color:var(--line-strong)] bg-coal-800 px-1.5 py-0.5 text-[11px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none disabled:opacity-40"
                  />
                </div>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="e.g. don't refactor this - it's load-bearing for the migration."
                  rows={3}
                  className="w-full resize-y rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 px-2.5 py-2 text-[12px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-chalk-300">
                    <input
                      type="checkbox"
                      checked={share}
                      onChange={(e) => setShare(e.target.checked)}
                      className="accent-violet-500"
                    />
                    <Bot className="h-3.5 w-3.5 text-chalk-400" strokeWidth={1.9} aria-hidden />
                    Visible to agents
                  </label>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!body.trim() || saving}
                    onClick={() => void add()}
                  >
                    {saving ? "Adding" : "Add note"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-[12px] border border-[color:var(--line)] bg-coal-600 px-3 py-2.5 text-[11.5px] text-chalk-300">
                Annotations are disabled for secret-like files.
              </div>
            )}

            <div className="mt-3 flex flex-col gap-2">
              {loading ? (
                <div className="text-[11.5px] text-chalk-400">Loading annotations.</div>
              ) : anns.length === 0 ? (
                <div className="rounded-[12px] border border-[color:var(--line-soft)] bg-coal-600/60 px-3 py-2.5 text-[11.5px] text-chalk-300">
                  {canAnnotate
                    ? "No annotations yet. Add the first note above to guide the crew on this file."
                    : "No annotations on this file yet."}
                </div>
              ) : (
                anns.map((a) => (
                  <AnnotationCard
                    key={a.id}
                    annotation={a}
                    busy={busyId === a.id}
                    onToggleResolve={() =>
                      void patch(a.id, { status: a.status === "open" ? "resolved" : "open" })
                    }
                    onToggleShare={() => void patch(a.id, { shareWithRoles: !a.shareWithRoles })}
                    onDelete={() => void remove(a.id)}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

function AnnotationCard({
  annotation: a,
  busy,
  onToggleResolve,
  onToggleShare,
  onDelete,
}: {
  annotation: CodebaseAnnotation;
  busy: boolean;
  onToggleResolve: () => void;
  onToggleShare: () => void;
  onDelete: () => void;
}) {
  const resolved = a.status === "resolved";
  return (
    <div
      className={cn(
        "rounded-[12px] border border-[color:var(--line)] bg-coal-600 p-2.5",
        resolved && "opacity-60",
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className="num-tabular rounded-[8px] bg-coal-500 px-1.5 py-0.5 text-[10px] font-semibold text-chalk-200">
          {anchorLabel(a.line, a.endLine)}
        </span>
        <button
          type="button"
          onClick={onToggleShare}
          disabled={busy}
          title={a.shareWithRoles ? "Shared with agents - click to make private" : "Private - click to share with agents"}
          className={cn(
            "inline-flex items-center gap-1 rounded-[8px] px-1.5 py-0.5 text-[10px] font-semibold transition disabled:opacity-50",
            a.shareWithRoles
              ? "bg-violet-soft/12 text-violet-soft hover:bg-violet-soft/20"
              : "text-chalk-400 hover:bg-coal-500 hover:text-chalk-200",
          )}
        >
          <Bot className="h-3 w-3" strokeWidth={1.9} aria-hidden />
          {a.shareWithRoles ? "roles" : "private"}
        </button>
        <div className="ml-auto flex items-center gap-1">
          <IconBtn title={resolved ? "Reopen" : "Resolve"} onClick={onToggleResolve} disabled={busy}>
            {resolved ? <RotateCcw className="h-3 w-3" strokeWidth={1.9} /> : <Check className="h-3 w-3" strokeWidth={1.9} />}
          </IconBtn>
          <IconBtn title="Delete" onClick={onDelete} disabled={busy}>
            <Trash2 className="h-3 w-3" strokeWidth={1.9} />
          </IconBtn>
        </div>
      </div>
      <p
        className={cn(
          "mt-1.5 whitespace-pre-wrap text-[12px] leading-snug text-chalk-200",
          resolved && "line-through",
        )}
      >
        {a.body}
      </p>
    </div>
  );
}

function IconBtn({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-6 w-6 items-center justify-center rounded-[8px] text-chalk-400 transition hover:bg-coal-500 hover:text-chalk-100 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

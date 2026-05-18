import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api } from "../../lib/api.js";
import type {
  FileTreeResult,
  FileView,
  RunState,
} from "../../lib/types.js";
import { FileTreeView } from "../../components/codebase/FileTreeView.js";
import { FileViewer } from "../../components/codebase/FileViewer.js";
import { FreshnessIndicator } from "../../components/codebase/FreshnessIndicator.js";
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
  const [path, setPath] = useState<string | null>(initial.path);
  const [line, setLine] = useState<number | null>(initial.line);
  const [view, setView] = useState<FileView | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // `mountedRef` gates every async setState. The previous crash on
  // "go to codebase, then leave" was the burst of in-flight fetches
  // resolving onto an unmounted component — combined with the SSE
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
  // file view — debounced 400ms so a burst of git/filetree events
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
    // `onUrlChange` is intentionally excluded — if the parent gives
    // us a non-stable callback, the effect re-fires on every render
    // and stomps the URL back to `#/codebase`, trapping the user on
    // this page. The effect only needs to run when the displayed
    // file/run state actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, line, source, runId]);

  const sourceLabel = useMemo(() => {
    if (source === "project") return "Project root";
    if (runId) return `Run worktree · ${runId}`;
    return "Run worktree (none selected)";
  }, [source, runId]);

  return (
    <div className="flex h-full overflow-hidden">
      <aside className="flex w-72 shrink-0 flex-col border-r border-amaco-border bg-amaco-panel/40">
        <header className="flex flex-col gap-1.5 border-b border-amaco-border px-3 py-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSource("project")}
              className={`rounded border px-2 py-0.5 text-[11px] ${
                source === "project"
                  ? "border-amaco-accent/40 bg-amaco-accent-soft/30 text-amaco-fg"
                  : "border-amaco-border text-amaco-fg-dim hover:bg-amaco-panel-2"
              }`}
            >
              Project
            </button>
            <button
              type="button"
              onClick={() => setSource("worktree")}
              className={`rounded border px-2 py-0.5 text-[11px] ${
                source === "worktree"
                  ? "border-amaco-accent/40 bg-amaco-accent-soft/30 text-amaco-fg"
                  : "border-amaco-border text-amaco-fg-dim hover:bg-amaco-panel-2"
              }`}
            >
              Worktree
            </button>
            {source === "worktree" ? (
              <select
                value={runId ?? ""}
                onChange={(e) => {
                  setRunId(e.target.value || null);
                  setPath(null);
                  setLine(null);
                }}
                className="ml-auto max-w-[160px] truncate rounded border border-amaco-border bg-amaco-panel-2 px-1 py-0.5 text-[11px] text-amaco-fg-dim"
              >
                <option value="">— choose run —</option>
                {runs.map((r) => (
                  <option key={r.runId} value={r.runId}>
                    {r.runId}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filter…"
            className="rounded border border-amaco-border bg-amaco-panel-2 px-2 py-1 text-[11.5px] text-amaco-fg placeholder-amaco-fg-muted"
          />
          <FreshnessIndicator
            freshness={freshness}
            onRefresh={() => {
              void reloadTree();
              void reloadFile();
            }}
          />
        </header>
        <div className="flex-1 overflow-y-auto py-1">
          {error ? (
            <div className="px-3 py-2 text-[11.5px] text-amaco-fail">{error}</div>
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
          ) : (
            <div className="px-3 py-2 text-[11.5px] text-amaco-fg-muted">
              {source === "worktree" && !runId
                ? "Pick a run to inspect its worktree."
                : "Loading…"}
            </div>
          )}
        </div>
      </aside>
      <main className="flex flex-1 flex-col overflow-hidden">
        <FileViewer
          view={view}
          loading={loadingFile}
          error={fileError}
          runId={runId}
          highlightLine={line}
        />
      </main>
      <aside className="hidden w-64 shrink-0 flex-col border-l border-amaco-border bg-amaco-panel/40 px-3 py-3 text-[12px] text-amaco-fg-dim lg:flex">
        <div className="text-[10.5px] uppercase tracking-[0.12em] text-amaco-fg-muted">
          Inspector
        </div>
        <div className="mt-2 amaco-mono truncate text-[11.5px] text-amaco-fg">
          {sourceLabel}
        </div>
        {tree ? (
          <div className="mt-1 amaco-mono text-[10.5px] text-amaco-fg-muted">
            {tree.totalCount} entries · depth {tree.depth}
            {tree.truncated ? " · truncated" : ""}
          </div>
        ) : null}
        {view ? (
          <div className="mt-3 flex flex-col gap-1">
            <KV label="Path">
              <span className="amaco-mono">{view.path}</span>
            </KV>
            <KV label="Lines">
              {view.totalLines === null ? "—" : view.totalLines}
            </KV>
            <KV label="Bytes">{view.size}</KV>
            {line !== null ? <KV label="Line">{line}</KV> : null}
            {view.isSecretLike ? (
              <KV label="Status">
                <span className="text-amaco-warn">redacted</span>
              </KV>
            ) : view.isBinary ? (
              <KV label="Status">binary</KV>
            ) : view.isTruncated ? (
              <KV label="Status">truncated window</KV>
            ) : null}
          </div>
        ) : null}
        <p className="mt-auto text-[10.5px] text-amaco-fg-muted">
          Read-only. The dashboard does not edit files.
        </p>
      </aside>
    </div>
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

function KV({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[68px_1fr] gap-2 text-[11.5px]">
      <span className="text-amaco-fg-muted">{label}</span>
      <span className="text-amaco-fg">{children}</span>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Check, MessageSquarePlus, RotateCcw, Trash2 } from "lucide-react";
import { ApiError, api, type CodebaseAnnotation } from "../../lib/api.js";
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
  // Draft anchor for a new annotation. Lifted here so clicking the "+" on a
  // line in the viewer can pre-fill the form in the side panel.
  const [annDraftLine, setAnnDraftLine] = useState<number | null>(null);
  const [annDraftEndLine, setAnnDraftEndLine] = useState<number | null>(null);

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
      <aside className="flex w-72 shrink-0 flex-col border-r border-white/10 bg-ink-100/40 backdrop-blur-xl">
        <header className="flex flex-col gap-2 border-b border-white/10 px-3 py-2.5">
          <div className="eyebrow">Codebase</div>
          <div className="flex items-center gap-1.5">
            <SourceTab active={source === "project"} onClick={() => setSource("project")}>
              Project
            </SourceTab>
            <SourceTab active={source === "worktree"} onClick={() => setSource("worktree")}>
              Worktree
            </SourceTab>
            {source === "worktree" ? (
              <select
                value={runId ?? ""}
                onChange={(e) => {
                  setRunId(e.target.value || null);
                  setPath(null);
                  setLine(null);
                }}
                className="ml-auto max-w-[150px] truncate rounded-md border border-white/10 bg-ink-200/70 px-1.5 py-0.5 text-[11px] text-fog-300"
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
            placeholder="Filter files…"
            className="rounded-md border border-white/10 bg-ink-200/70 px-2.5 py-1.5 text-[12px] text-fog-100 placeholder-fog-500 outline-none focus:border-violet-soft/40"
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
            <div className="px-3 py-2 text-[11.5px] text-rose-300">{error}</div>
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
            <div className="px-3 py-2 text-[11.5px] text-fog-500">
              {source === "worktree" && !runId
                ? "Pick a run to inspect its worktree."
                : "Loading…"}
            </div>
          )}
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
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
      className={`rounded-md border px-2 py-0.5 text-[11px] transition ${
        active
          ? "border-violet-soft/40 bg-violet-soft/10 text-fog-100"
          : "border-white/10 text-fog-400 hover:bg-white/[0.04]"
      }`}
    >
      {children}
    </button>
  );
}

function anchorLabel(line: number | null, endLine: number | null): string {
  if (line === null) return "Whole file";
  if (endLine === null || endLine === line) return `Line ${line}`;
  return `Lines ${line}–${endLine}`;
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
    <aside className="hidden w-80 shrink-0 flex-col overflow-y-auto border-l border-white/10 bg-ink-100/40 px-3 py-3 backdrop-blur-xl lg:flex">
      <div className="eyebrow">Inspector</div>
      <div className="mono mt-2 truncate text-[11.5px] text-fog-100">{sourceLabel}</div>
      {tree ? (
        <div className="mono mt-0.5 text-[10.5px] text-fog-500">
          {tree.totalCount} entries · depth {tree.depth}
          {tree.truncated ? " · truncated" : ""}
        </div>
      ) : null}
      {view ? (
        <div className="mt-3 flex flex-col gap-1">
          <KV label="Path">
            <span className="mono">{view.path}</span>
          </KV>
          <KV label="Lines">{view.totalLines === null ? "—" : view.totalLines}</KV>
          <KV label="Bytes">{view.size}</KV>
          {view.isSecretLike ? (
            <KV label="Status">
              <span className="text-amber-300">redacted</span>
            </KV>
          ) : view.isBinary ? (
            <KV label="Status">binary</KV>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 mb-2 flex items-center gap-2 border-t border-white/10 pt-3">
        <MessageSquarePlus className="h-3.5 w-3.5 text-violet-soft" />
        <div className="eyebrow !tracking-[0.14em]">Annotations</div>
      </div>
      <p className="mb-3 text-[11px] leading-snug text-fog-500">
        Notes pinned to this file. Ones marked{" "}
        <span className="text-fog-300">visible to agents</span> are added to every
        agent's prompt during runs — your guidance, acknowledged by the crew.
      </p>

      {err ? (
        <div className="mb-2 rounded-md border border-rose-400/30 bg-rose-500/5 px-2 py-1.5 text-[11px] text-rose-300">
          {err}
        </div>
      ) : null}

      {source !== "project" ? (
        <div className="rounded-md border border-white/10 bg-ink-200/40 px-2.5 py-2 text-[11.5px] text-fog-400">
          Switch to <span className="text-fog-200">Project</span> to read or add
          annotations — they're pinned to the project codebase.
        </div>
      ) : !path ? (
        <div className="rounded-md border border-white/10 bg-ink-200/40 px-2.5 py-2 text-[11.5px] text-fog-400">
          Select a file to see and add annotations.
        </div>
      ) : (
        <>
          {canAnnotate ? (
            <div className="rounded-lg border border-white/10 bg-ink-200/40 p-2.5">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-fog-400">
                <span>Anchor:</span>
                <span className="rounded border border-white/10 px-1.5 py-0.5 text-fog-200">
                  {anchorLabel(props.draftLine, props.draftEndLine)}
                </span>
                <input
                  type="number"
                  min={1}
                  value={props.draftLine ?? ""}
                  placeholder="line"
                  onChange={(e) =>
                    props.setDraftLine(e.target.value ? Number(e.target.value) : null)
                  }
                  className="ml-auto w-14 rounded border border-white/10 bg-ink-300/60 px-1.5 py-0.5 text-[11px] text-fog-100 outline-none focus:border-violet-soft/40"
                />
                <span className="text-fog-600">–</span>
                <input
                  type="number"
                  min={1}
                  value={props.draftEndLine ?? ""}
                  placeholder="end"
                  disabled={props.draftLine === null}
                  onChange={(e) =>
                    props.setDraftEndLine(e.target.value ? Number(e.target.value) : null)
                  }
                  className="w-14 rounded border border-white/10 bg-ink-300/60 px-1.5 py-0.5 text-[11px] text-fog-100 outline-none focus:border-violet-soft/40 disabled:opacity-40"
                />
              </div>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="e.g. don't refactor this — it's load-bearing for the migration."
                rows={3}
                className="w-full resize-y rounded-md border border-white/10 bg-ink-300/60 px-2 py-1.5 text-[12px] text-fog-100 placeholder-fog-600 outline-none focus:border-violet-soft/40"
              />
              <div className="mt-2 flex items-center justify-between">
                <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-fog-300">
                  <input
                    type="checkbox"
                    checked={share}
                    onChange={(e) => setShare(e.target.checked)}
                    className="accent-violet-500"
                  />
                  <Bot className="h-3.5 w-3.5 text-fog-400" />
                  Visible to agents
                </label>
                <button
                  type="button"
                  disabled={!body.trim() || saving}
                  onClick={() => void add()}
                  className="rounded-md border border-violet-soft/40 bg-violet-soft/10 px-2.5 py-1 text-[11.5px] text-fog-100 hover:bg-violet-soft/20 disabled:opacity-40"
                >
                  {saving ? "Adding…" : "Add note"}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-white/10 bg-ink-200/40 px-2.5 py-2 text-[11.5px] text-fog-400">
              Annotations are disabled for secret-like files.
            </div>
          )}

          <div className="mt-3 flex flex-col gap-2">
            {loading ? (
              <div className="text-[11.5px] text-fog-500">Loading…</div>
            ) : anns.length === 0 ? (
              <div className="text-[11.5px] text-fog-500">No annotations on this file yet.</div>
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
      className={`rounded-lg border border-white/10 bg-ink-200/40 p-2.5 ${
        resolved ? "opacity-55" : ""
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span className="mono rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-fog-300">
          {anchorLabel(a.line, a.endLine)}
        </span>
        <button
          type="button"
          onClick={onToggleShare}
          disabled={busy}
          title={a.shareWithRoles ? "Shared with agents — click to make private" : "Private — click to share with agents"}
          className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${
            a.shareWithRoles
              ? "border-violet-soft/40 bg-violet-soft/10 text-violet-soft"
              : "border-white/10 text-fog-500"
          }`}
        >
          <Bot className="h-3 w-3" />
          {a.shareWithRoles ? "roles" : "private"}
        </button>
        <div className="ml-auto flex items-center gap-1">
          <IconBtn title={resolved ? "Reopen" : "Resolve"} onClick={onToggleResolve} disabled={busy}>
            {resolved ? <RotateCcw className="h-3 w-3" /> : <Check className="h-3 w-3" />}
          </IconBtn>
          <IconBtn title="Delete" onClick={onDelete} disabled={busy}>
            <Trash2 className="h-3 w-3" />
          </IconBtn>
        </div>
      </div>
      <p className={`mt-1.5 whitespace-pre-wrap text-[12px] leading-snug text-fog-200 ${resolved ? "line-through" : ""}`}>
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
      className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/10 text-fog-400 hover:bg-white/[0.05] hover:text-fog-100 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[64px_1fr] gap-2 text-[11.5px]">
      <span className="text-fog-500">{label}</span>
      <span className="truncate text-fog-200">{children}</span>
    </div>
  );
}

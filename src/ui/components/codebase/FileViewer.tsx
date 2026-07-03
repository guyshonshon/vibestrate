import { useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, FileCode2, Hash } from "lucide-react";
import { ApiError, api } from "../../lib/api.js";
import type { FileView } from "../../lib/types.js";
import { highlightLines } from "../../lib/syntax-highlight.js";
import { Button } from "../design/Button.js";
import { cn } from "../design/cn.js";

type Props = {
  view: FileView | null;
  loading: boolean;
  error: string | null;
  /** Optional run id; pulled into copied references when present. */
  runId?: string | null;
  highlightLine?: number | null;
  /** When provided, each line shows a hover "annotate" affordance. */
  onAnnotateLine?: (line: number) => void;
};

export function FileViewer({
  view,
  loading,
  error,
  runId,
  highlightLine,
  onAnnotateLine,
}: Props) {
  const [openMsg, setOpenMsg] = useState<string | null>(null);

  // Highlight the visible window of source as a single block, then map back
  // onto the per-line array. Memoised so re-renders (hover, selection,
  // openMsg toggles) don't re-tokenise the file. Skip highlighting on
  // files over the threshold - highlight.js is synchronous and big
  // files (eg a 4000-line .js bundle) were blocking the main thread
  // long enough that users couldn't even click the sidebar to leave.
  const HIGHLIGHT_LINE_CAP = 800;
  const highlighted = useMemo<string[] | null>(() => {
    if (!view || view.lines.length === 0) return null;
    if (view.isBinary || view.isSecretLike) return null;
    if (view.language === "text") return null;
    if (view.lines.length > HIGHLIGHT_LINE_CAP) return null;
    const joined = view.lines.map((l) => l.text).join("\n");
    const result = highlightLines(joined, view.language);
    if (result.length !== view.lines.length) return null;
    return result;
  }, [view]);

  // Soft-cap rendered lines. The server already caps at 4000
  // lines per response, but 4000 line-divs each with a hover state,
  // a copy button, and a syntax span amounted to ~120k React nodes
  // - enough to make the browser feel locked. Render the first
  // RENDER_LINE_CAP and let the user opt into the rest.
  const RENDER_LINE_CAP = 1500;
  const [showAllLines, setShowAllLines] = useState(false);
  // Reset the "show all" override whenever the displayed file
  // changes - otherwise opening a different giant file inherits
  // the previous override and freezes the page again.
  useEffect(() => {
    setShowAllLines(false);
  }, [view?.path]);
  const visibleLines =
    view && view.lines.length > RENDER_LINE_CAP && !showAllLines
      ? view.lines.slice(0, RENDER_LINE_CAP)
      : view?.lines ?? [];

  async function openInEditor(line: number | null) {
    if (!view) return;
    setOpenMsg(null);
    try {
      const r = await api.openInEditor({
        path: view.path,
        runId: view.rootKind === "worktree" ? runId ?? null : null,
        line,
      });
      setOpenMsg(
        r.ok
          ? `Opened in ${r.command}.`
          : r.message ?? "Editor refused to open the file.",
      );
    } catch (err) {
      if (err instanceof ApiError) setOpenMsg(err.message);
      else setOpenMsg(err instanceof Error ? err.message : String(err));
    }
  }

  if (loading) {
    return (
      <div className="px-4 py-6 text-[12.5px] text-chalk-400">Loading file.</div>
    );
  }
  if (error) {
    return (
      <div className="p-3">
        <div className="rounded-[12px] border border-rose-400/30 bg-rose-500/10 px-3 py-2.5 text-[12.5px] text-rose-300">
          {error}
        </div>
      </div>
    );
  }
  if (!view) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 py-6 text-center">
        <FileCode2 className="h-6 w-6 text-chalk-400" strokeWidth={1.6} aria-hidden />
        <div className="text-[13px] font-semibold text-chalk-100">No file open</div>
        <p className="max-w-[260px] text-[12px] text-chalk-300">
          Pick a file from the tree on the left to read it, copy a line reference, or
          open it in your editor.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-[color:var(--line-soft)] px-3 py-2">
        <span className="num-tabular truncate text-[12px] font-semibold text-chalk-100">
          {view.path}
        </span>
        <span className="shrink-0 rounded-[7px] bg-coal-500 px-1.5 py-0.5 text-[10px] font-medium text-chalk-300">
          {view.rootKind}
        </span>
        <span className="shrink-0 rounded-[7px] bg-coal-500 px-1.5 py-0.5 text-[10px] font-medium text-violet-soft">
          {view.language}
        </span>
        <span className="num-tabular shrink-0 text-[10.5px] text-chalk-400">
          {view.totalLines !== null
            ? `${view.totalLines} lines / ${(view.size / 1024).toFixed(1)} KB`
            : `${(view.size / 1024).toFixed(1)} KB`}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <CopyButton text={view.path} title="Copy path" />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void openInEditor(highlightLine ?? null)}
            disabled={view.isSecretLike}
            iconLeft={<ExternalLink className="h-3.5 w-3.5" strokeWidth={1.9} />}
            title={
              view.isSecretLike
                ? "Editor handoff is blocked for secret-like files"
                : "Open in configured editor"
            }
          >
            Editor
          </Button>
        </div>
      </header>
      {openMsg ? (
        <div className="border-b border-[color:var(--line-soft)] bg-coal-600/60 px-3 py-1.5 text-[11px] text-chalk-300">
          {openMsg}
        </div>
      ) : null}
      {view.notice ? (
        <div className="border-b border-amber-soft/40 bg-amber-soft/10 px-3 py-1.5 text-[11.5px] text-amber-soft">
          {view.notice}
        </div>
      ) : null}
      <div className="flex-1 overflow-auto bg-coal-800">
        {view.lines.length === 0 ? (
          <div className="px-3 py-6 text-[12px] text-chalk-400">
            {view.isSecretLike
              ? "Contents redacted."
              : view.isBinary
                ? "Binary file."
                : "No preview available."}
          </div>
        ) : (
          <>
          {view.lines.length > RENDER_LINE_CAP && !showAllLines ? (
            <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5 border-b border-amber-soft/40 bg-amber-soft/10 px-3 py-1.5 text-[11px] text-amber-soft">
              Showing first {RENDER_LINE_CAP.toLocaleString()} of{" "}
              {view.lines.length.toLocaleString()} lines - rendering the rest can make the
              page sluggish.
              <button
                type="button"
                onClick={() => setShowAllLines(true)}
                className="ml-1 rounded-[8px] bg-amber-soft/15 px-2 py-0.5 text-[10.5px] font-semibold text-amber-soft transition hover:bg-amber-soft/25"
              >
                Show all {view.lines.length.toLocaleString()}
              </button>
            </div>
          ) : null}
          {view.lines.length > HIGHLIGHT_LINE_CAP ? (
            <div className="border-b border-[color:var(--line-soft)] px-3 py-1 text-[10.5px] text-chalk-400">
              Syntax highlighting skipped for files over{" "}
              {HIGHLIGHT_LINE_CAP.toLocaleString()} lines.
            </div>
          ) : null}
          <pre className="num-tabular m-0 text-[12px] leading-[1.45]">
            {visibleLines.map((l, idx) => (
              <div
                key={l.number}
                className={cn(
                  "group flex border-b border-transparent",
                  highlightLine === l.number
                    ? "bg-violet-soft/12"
                    : "hover:bg-coal-600/50",
                )}
              >
                <button
                  type="button"
                  className="num-tabular inline-flex w-14 shrink-0 select-none items-center justify-end gap-0.5 border-r border-[color:var(--line-soft)] px-2 py-0.5 text-[10.5px] text-chalk-400 transition hover:text-chalk-100"
                  title="Copy file:line reference"
                  onClick={() => {
                    const ref = `${view.path}:${l.number}${
                      runId ? `?runId=${runId}` : ""
                    }`;
                    void navigator.clipboard.writeText(ref).catch(() => {});
                  }}
                >
                  {l.number}
                  <Hash className="h-2.5 w-2.5 opacity-0 group-hover:opacity-60" />
                </button>
                {onAnnotateLine && !view.isSecretLike ? (
                  <button
                    type="button"
                    className="inline-flex w-5 shrink-0 select-none items-center justify-center text-[11px] text-chalk-400 opacity-0 transition hover:text-violet-soft group-hover:opacity-100"
                    title={`Annotate line ${l.number}`}
                    onClick={() => onAnnotateLine(l.number)}
                  >
                    +
                  </button>
                ) : null}
                {highlighted ? (
                  <span
                    className="hljs whitespace-pre px-2 py-0.5"
                    /* highlight.js output is HTML-escaped + only emits its
                       own <span class="hljs-..."> wrappers; safe to inject. */
                    dangerouslySetInnerHTML={{
                      __html: highlighted[idx] ?? "",
                    }}
                  />
                ) : (
                  <span className="whitespace-pre px-2 py-0.5">{l.text}</span>
                )}
              </div>
            ))}
          </pre>
          </>
        )}
      </div>
    </div>
  );
}

function CopyButton({ text, title }: { text: string; title: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          // ignore
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-[10px] bg-coal-500 px-2.5 py-1.5 text-[12px] font-semibold text-chalk-100 transition hover:bg-coal-400"
      title={title}
    >
      <Copy className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden />
      {copied ? "Copied" : "Copy path"}
    </button>
  );
}

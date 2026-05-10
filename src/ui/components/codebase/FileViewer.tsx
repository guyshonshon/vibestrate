import { useState } from "react";
import { Copy, Hash } from "lucide-react";
import type { FileView } from "../../lib/types.js";

type Props = {
  view: FileView | null;
  loading: boolean;
  error: string | null;
  /** Optional run id; pulled into copied references when present. */
  runId?: string | null;
  highlightLine?: number | null;
};

export function FileViewer({ view, loading, error, runId, highlightLine }: Props) {
  if (loading) {
    return (
      <div className="px-4 py-6 text-[12.5px] text-amaco-fg-muted">
        Loading file…
      </div>
    );
  }
  if (error) {
    return (
      <div className="px-4 py-6 text-[12.5px] text-amaco-fail">{error}</div>
    );
  }
  if (!view) {
    return (
      <div className="px-4 py-6 text-[12.5px] text-amaco-fg-muted">
        Select a file from the tree.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-amaco-border bg-amaco-panel/40 px-3 py-1.5">
        <span className="amaco-mono truncate text-[12px] text-amaco-fg">
          {view.path}
        </span>
        <span className="amaco-mono rounded border border-amaco-border px-1 text-[10px] text-amaco-fg-muted">
          {view.rootKind}
        </span>
        <span className="amaco-mono rounded border border-amaco-border px-1 text-[10px] text-amaco-fg-muted">
          {view.language}
        </span>
        {view.totalLines !== null ? (
          <span className="amaco-mono text-[10.5px] text-amaco-fg-muted">
            {view.totalLines} lines · {(view.size / 1024).toFixed(1)} KB
          </span>
        ) : (
          <span className="amaco-mono text-[10.5px] text-amaco-fg-muted">
            {(view.size / 1024).toFixed(1)} KB
          </span>
        )}
        <CopyButton text={view.path} title="Copy path" />
      </header>
      {view.notice ? (
        <div className="border-b border-amaco-warn/40 bg-amaco-warn/10 px-3 py-1.5 text-[11.5px] text-amaco-warn">
          {view.notice}
        </div>
      ) : null}
      <div className="flex-1 overflow-auto bg-amaco-canvas">
        {view.lines.length === 0 ? (
          <div className="px-3 py-6 text-[12px] text-amaco-fg-muted">
            {view.isSecretLike
              ? "Contents redacted."
              : view.isBinary
                ? "Binary file."
                : "No preview available."}
          </div>
        ) : (
          <pre className="amaco-mono m-0 text-[12px] leading-[1.45]">
            {view.lines.map((l) => (
              <div
                key={l.number}
                className={`group flex border-b border-transparent ${
                  highlightLine === l.number
                    ? "bg-amaco-accent-soft/30"
                    : "hover:bg-amaco-panel-2/40"
                }`}
              >
                <button
                  type="button"
                  className="amaco-mono inline-flex w-14 shrink-0 select-none items-center justify-end gap-0.5 border-r border-amaco-border px-2 py-0.5 text-[10.5px] text-amaco-fg-muted hover:text-amaco-fg"
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
                <span className="whitespace-pre px-2 py-0.5">{l.text}</span>
              </div>
            ))}
          </pre>
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
      className="ml-auto inline-flex items-center gap-1 rounded border border-amaco-border px-1.5 py-0.5 text-[10.5px] text-amaco-fg-dim hover:bg-amaco-panel-2"
      title={title}
    >
      <Copy className="h-3 w-3" strokeWidth={1.5} />
      {copied ? "copied" : "copy"}
    </button>
  );
}

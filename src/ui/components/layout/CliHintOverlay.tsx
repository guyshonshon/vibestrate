import { useEffect, useRef, useState } from "react";
import { Terminal, X, Copy, Check } from "lucide-react";
import type { Route } from "../../app/route.js";
import { hintForRoute, type CliHint } from "../../lib/cli-hints.js";

type Props = {
  route: Route;
};

export function CliHintOverlay({ route }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Close on outside-click + Escape so the overlay stays out of the way.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!panelRef.current) return;
      if (!panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const hint: CliHint = hintForRoute(route);

  const copy = async (cmd: string) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(cmd);
      window.setTimeout(() => setCopied((c) => (c === cmd ? null : c)), 1200);
    } catch {
      // Clipboard can be unavailable (no permissions, no secure context).
      // Silently no-op — the command text is still visible.
    }
  };

  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-40 flex flex-col items-end gap-2">
      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="CLI equivalent for this view"
          className="pointer-events-auto w-[360px] max-w-[calc(100vw-1.5rem)] rounded-md border border-vibestrate-border bg-vibestrate-panel/95 shadow-lg backdrop-blur"
        >
          <div className="flex items-start gap-2 border-b border-vibestrate-border px-3 py-2">
            <Terminal className="mt-[2px] h-3.5 w-3.5 text-vibestrate-fg-muted" strokeWidth={1.5} />
            <div className="flex-1">
              <div className="text-[12px] font-medium text-vibestrate-fg">{hint.title}</div>
              <div className="mt-0.5 text-[11px] leading-snug text-vibestrate-fg-muted">
                {hint.blurb}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-0.5 text-vibestrate-fg-muted hover:bg-vibestrate-panel-2 hover:text-vibestrate-fg"
              aria-label="Close CLI hint"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          </div>
          <ul className="max-h-[40vh] space-y-1.5 overflow-y-auto px-3 py-2">
            {hint.commands.map((c) => (
              <li key={c.cmd} className="group">
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded bg-vibestrate-panel-2 px-1.5 py-0.5 font-mono text-[11px] text-vibestrate-fg">
                    {c.cmd}
                  </code>
                  <button
                    type="button"
                    onClick={() => copy(c.cmd)}
                    className="rounded p-0.5 text-vibestrate-fg-muted opacity-0 transition group-hover:opacity-100 hover:bg-vibestrate-panel-2 hover:text-vibestrate-fg"
                    aria-label={`Copy: ${c.cmd}`}
                    title="Copy"
                  >
                    {copied === c.cmd ? (
                      <Check className="h-3 w-3" strokeWidth={1.5} />
                    ) : (
                      <Copy className="h-3 w-3" strokeWidth={1.5} />
                    )}
                  </button>
                </div>
                {c.note ? (
                  <div className="ml-0.5 mt-0.5 text-[10.5px] leading-snug text-vibestrate-fg-muted">
                    {c.note}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          {hint.tips && hint.tips.length > 0 ? (
            <div className="border-t border-vibestrate-border px-3 py-2">
              <div className="text-[10px] font-medium uppercase tracking-wide text-vibestrate-fg-muted">
                Tips
              </div>
              <ul className="mt-1 list-disc space-y-0.5 pl-3.5 text-[10.5px] leading-snug text-vibestrate-fg-muted">
                {hint.tips.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full border border-vibestrate-border bg-vibestrate-panel/90 text-vibestrate-fg-muted shadow-sm backdrop-blur hover:text-vibestrate-fg"
        aria-label={open ? "Hide CLI hint" : "Show CLI equivalent for this view"}
        title="Show CLI equivalent"
        aria-expanded={open}
      >
        <Terminal className="h-3.5 w-3.5" strokeWidth={1.5} />
      </button>
    </div>
  );
}

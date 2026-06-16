import { useEffect, useRef, useState } from "react";
import { Terminal, X, Copy, Check, ChevronRight } from "lucide-react";
import type { Route } from "../../app/route.js";
import { hintForRoute, type CliHint } from "../../lib/cli-hints.js";

type Props = {
  route: Route;
};

const HIDDEN_KEY = "vibe.cliHint.hidden";

/**
 * Floating "run it on the CLI/TUI" launcher. Lives at the bottom-LEFT (the
 * consult orb owns bottom-right) so the two never overlap. It's a labelled pill
 * with presence, not a faint icon, and it can be hidden entirely (persisted) -
 * a tiny edge nub brings it back so hiding is never a one-way trap.
 */
export function CliHintOverlay({ route }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [hidden, setHidden] = useState<boolean>(() => {
    try {
      return localStorage.getItem(HIDDEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const panelRef = useRef<HTMLDivElement | null>(null);

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

  function setHiddenPersisted(v: boolean) {
    setHidden(v);
    setOpen(false);
    try {
      if (v) localStorage.setItem(HIDDEN_KEY, "1");
      else localStorage.removeItem(HIDDEN_KEY);
    } catch {
      // storage unavailable - in-memory only is fine
    }
  }

  const hint: CliHint = hintForRoute(route);

  const copy = async (cmd: string) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(cmd);
      window.setTimeout(() => setCopied((c) => (c === cmd ? null : c)), 1200);
    } catch {
      // Clipboard can be unavailable (no permissions / no secure context).
    }
  };

  // Hidden: a minimal edge nub to bring it back (hiding is never one-way).
  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => setHiddenPersisted(false)}
        className="pointer-events-auto fixed bottom-3 left-0 z-40 flex h-7 w-3 items-center justify-center border border-l-0 border-vibestrate-border bg-vibestrate-panel/80 text-vibestrate-fg-muted opacity-50 backdrop-blur transition hover:w-5 hover:opacity-100 print:hidden"
        aria-label="Show CLI launcher"
        title="Show CLI launcher"
      >
        <ChevronRight className="h-3 w-3" strokeWidth={1.8} />
      </button>
    );
  }

  return (
    <div className="pointer-events-none fixed bottom-3 left-3 z-40 flex flex-col items-start gap-2 print:hidden">
      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="CLI equivalent for this view"
          className="pointer-events-auto w-[360px] max-w-[calc(100vw-1.5rem)] border border-[color:var(--line)] bg-ink-100 shadow-[var(--shadow-contact)]"
        >
          <div className="flex items-start gap-2 border-b border-[color:var(--line)] px-3 py-2">
            <Terminal className="mt-[2px] h-3.5 w-3.5 text-violet-soft" strokeWidth={1.6} />
            <div className="flex-1">
              <div className="font-display text-[12.5px] font-medium text-fog-100">{hint.title}</div>
              <div className="mt-0.5 text-[11px] leading-snug text-fog-400">{hint.blurb}</div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-0.5 text-fog-500 hover:text-fog-100"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.6} />
            </button>
          </div>
          <ul className="max-h-[40vh] space-y-1.5 overflow-y-auto px-3 py-2">
            {hint.commands.map((c) => (
              <li key={c.cmd} className="group">
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate border border-[color:var(--line-soft)] bg-ink-0 px-1.5 py-0.5 font-mono text-[11px] text-fog-100">
                    {c.cmd}
                  </code>
                  <button
                    type="button"
                    onClick={() => copy(c.cmd)}
                    className="p-0.5 text-fog-500 opacity-0 transition group-hover:opacity-100 hover:text-fog-100"
                    aria-label={`Copy: ${c.cmd}`}
                    title="Copy"
                  >
                    {copied === c.cmd ? <Check className="h-3 w-3" strokeWidth={1.6} /> : <Copy className="h-3 w-3" strokeWidth={1.6} />}
                  </button>
                </div>
                {c.note ? <div className="ml-0.5 mt-0.5 text-[10.5px] leading-snug text-fog-500">{c.note}</div> : null}
              </li>
            ))}
          </ul>
          {hint.tips && hint.tips.length > 0 ? (
            <div className="border-t border-[color:var(--line)] px-3 py-2">
              <div className="text-[10px] font-medium uppercase tracking-wide text-fog-500">Tips</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-3.5 text-[10.5px] leading-snug text-fog-400">
                {hint.tips.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="border-t border-[color:var(--line)] px-3 py-1.5 text-right">
            <button
              type="button"
              onClick={() => setHiddenPersisted(true)}
              className="text-[10.5px] text-fog-500 hover:text-fog-200"
            >
              Hide launcher
            </button>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto flex h-8 items-center gap-1.5 border border-[color:var(--line)] bg-ink-100 px-2.5 text-[11.5px] text-fog-300 shadow-[var(--shadow-contact)] transition hover:border-violet-soft/40 hover:text-fog-100"
        aria-label={open ? "Hide CLI hint" : "Run this on the CLI / TUI"}
        title="Run this on the CLI / TUI"
        aria-expanded={open}
      >
        <Terminal className="h-3.5 w-3.5 text-violet-soft" strokeWidth={1.8} />
        <span className="font-mono">CLI</span>
      </button>
    </div>
  );
}

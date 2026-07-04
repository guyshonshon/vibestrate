import { useEffect, useRef, useState } from "react";
import { Terminal, X, Copy, Check } from "lucide-react";
import type { Route } from "../../app/route.js";
import { hintForRoute, type CliHint } from "../../lib/cli-hints.js";

type Props = {
  route: Route;
};

const HIDDEN_KEY = "vibe.cliHint.hidden";

/**
 * Floating "run it on the CLI/TUI" launcher. It's the sibling of the consult
 * orb (bottom-right): the same rounded coal/chalk pill with a hover-expand
 * label, sitting at the bottom-LEFT of the content area (inset past the sidebar
 * so it never covers it). Can be hidden entirely (persisted) - a tiny edge nub
 * brings it back so hiding is never a one-way trap.
 */
// Stacked above the consult orb (bottom-right): orb height (~62px) + bottom-5
// inset + a small gap.
const ABOVE_ORB = 92;

export function CliHintOverlay({ route }: Props) {
  const [open, setOpen] = useState(false);
  const [consultOpen, setConsultOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [hidden, setHidden] = useState<boolean>(() => {
    try {
      return localStorage.getItem(HIDDEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Step aside while the consult panel is open - it fills the same corner.
  useEffect(() => {
    const onConsult = (e: Event) => {
      setConsultOpen(!!(e as CustomEvent<{ open?: boolean }>).detail?.open);
    };
    window.addEventListener("vibestrate:consult-state", onConsult);
    return () =>
      window.removeEventListener("vibestrate:consult-state", onConsult);
  }, []);

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

  // The consult panel owns the corner while it's open.
  if (consultOpen) return null;

  // Hidden: a minimal edge nub to bring it back (hiding is never one-way).
  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => setHiddenPersisted(false)}
        style={{ bottom: ABOVE_ORB }}
        className="pointer-events-auto fixed right-5 z-40 flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--line)] bg-coal-600/80 text-chalk-400 opacity-60 backdrop-blur transition hover:opacity-100 print:hidden"
        aria-label="Show CLI launcher"
        title="Show CLI launcher"
      >
        <Terminal className="h-4 w-4" strokeWidth={1.8} />
      </button>
    );
  }

  return (
    <div
      style={{ bottom: ABOVE_ORB }}
      className="pointer-events-none fixed right-5 z-40 flex flex-col items-end gap-2 print:hidden"
    >
      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="CLI equivalent for this view"
          className="pointer-events-auto w-[360px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-[16px] border border-[color:var(--line)] bg-coal-700 shadow-2xl shadow-black/50"
        >
          <div className="flex items-start gap-2 border-b border-[color:var(--line)] px-3.5 py-2.5">
            <Terminal
              className="mt-[2px] h-3.5 w-3.5 text-violet-soft"
              strokeWidth={1.8}
            />
            <div className="flex-1">
              <div className="text-[12.5px] font-semibold text-chalk-100">
                {hint.title}
              </div>
              <div className="mt-0.5 text-[11px] leading-snug text-chalk-300">
                {hint.blurb}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-0.5 text-chalk-400 hover:text-chalk-100"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.8} />
            </button>
          </div>
          <ul className="max-h-[40vh] space-y-1.5 overflow-y-auto px-3.5 py-2.5">
            {hint.commands.map((c) => (
              <li key={c.cmd} className="group">
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded-[8px] border border-[color:var(--line-soft)] bg-coal-800 px-2 py-1 font-mono text-[11px] text-chalk-100">
                    {c.cmd}
                  </code>
                  <button
                    type="button"
                    onClick={() => copy(c.cmd)}
                    className="p-0.5 text-chalk-400 opacity-0 transition group-hover:opacity-100 hover:text-chalk-100"
                    aria-label={`Copy: ${c.cmd}`}
                    title="Copy"
                  >
                    {copied === c.cmd ? (
                      <Check className="h-3 w-3" strokeWidth={1.8} />
                    ) : (
                      <Copy className="h-3 w-3" strokeWidth={1.8} />
                    )}
                  </button>
                </div>
                {c.note ? (
                  <div className="ml-0.5 mt-0.5 text-[10.5px] leading-snug text-chalk-400">
                    {c.note}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          {hint.tips && hint.tips.length > 0 ? (
            <div className="border-t border-[color:var(--line)] px-3.5 py-2.5">
              <div className="text-[11px] font-semibold text-violet-soft">
                Tips
              </div>
              <ul className="mt-1 list-disc space-y-0.5 pl-3.5 text-[10.5px] leading-snug text-chalk-300">
                {hint.tips.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="border-t border-[color:var(--line)] px-3.5 py-1.5 text-right">
            <button
              type="button"
              onClick={() => setHiddenPersisted(true)}
              className="text-[10.5px] text-chalk-400 hover:text-chalk-200"
            >
              Hide launcher
            </button>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group pointer-events-auto flex items-center gap-0 rounded-full border border-violet-soft/30 bg-coal-600 p-1.5 shadow-xl shadow-black/40 transition-all hover:border-violet-soft/50"
        aria-label={open ? "Hide CLI hint" : "Run this on the CLI / TUI"}
        title="Run this on the CLI / TUI"
        aria-expanded={open}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-coal-500 text-violet-soft ring-1 ring-violet-soft/20">
          <Terminal className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <span className="max-w-0 overflow-hidden whitespace-nowrap font-mono text-[12.5px] font-medium text-chalk-100 transition-all duration-300 group-hover:ml-2.5 group-hover:mr-1.5 group-hover:max-w-[60px]">
          CLI
        </span>
      </button>
    </div>
  );
}

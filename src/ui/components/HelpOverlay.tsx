import { useEffect, useState } from "react";
import { Keyboard, X } from "lucide-react";

/**
 * Global help overlay. Opens on:
 *   - `?` keystroke (outside an input)
 *   - the custom `amaco:help-overlay` event dispatched by
 *     `useNumberedNav` and other shortcut handlers
 *   - the `?` button surfaces sprinkled around the chrome
 *
 * Closes on Esc, outside click, or the X button. Self-contained, no
 * route, no portal — renders a fixed full-viewport scrim.
 */
export function HelpOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onCustom = () => setOpen((v) => !v);
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (isTyping) return;
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("amaco:help-overlay", onCustom);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("amaco:help-overlay", onCustom);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={(e) => {
        // Close on backdrop click — but not on inner panel clicks.
        if (e.target === e.currentTarget) setOpen(false);
      }}
      className="fixed inset-0 z-[100] flex items-start justify-center bg-amaco-canvas/80 backdrop-blur-sm px-4 py-12 sm:py-20"
    >
      <div className="relative w-full max-w-2xl rounded-md border border-amaco-border bg-amaco-panel shadow-2xl">
        <header className="flex items-center gap-2 border-b border-amaco-border px-4 py-3">
          <Keyboard
            className="h-4 w-4 text-amaco-accent"
            strokeWidth={1.5}
            aria-hidden
          />
          <h2 className="text-[14px] font-medium text-amaco-fg">
            Keyboard shortcuts
          </h2>
          <span className="amaco-mono ml-2 text-[10.5px] text-amaco-fg-muted">
            press ? to toggle · Esc to close
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close help"
            className="ml-auto rounded p-1 text-amaco-fg-dim hover:bg-amaco-panel-2 hover:text-amaco-fg"
          >
            <X className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {GROUPS.map((g) => (
              <section key={g.title} aria-labelledby={`hg-${g.title}`}>
                <h3
                  id={`hg-${g.title}`}
                  className="mb-1 text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted"
                >
                  {g.title}
                </h3>
                <dl className="space-y-1">
                  {g.items.map((it) => (
                    <div
                      key={it.what}
                      className="flex items-baseline justify-between gap-2 text-[12px]"
                    >
                      <dt className="text-amaco-fg-dim">{it.what}</dt>
                      <dd>
                        {it.keys.map((k, i) => (
                          <span key={`${it.what}-${i}`}>
                            {i > 0 ? (
                              <span className="amaco-mono mx-1 text-amaco-fg-muted">
                                {it.combinator ?? "·"}
                              </span>
                            ) : null}
                            <kbd className="amaco-mono rounded border border-amaco-border bg-amaco-panel-2 px-1.5 py-0.5 text-[11px] text-amaco-fg">
                              {k}
                            </kbd>
                          </span>
                        ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
          <p className="mt-4 text-[11px] text-amaco-fg-muted">
            Layout state (panel order + collapsed state, section order,
            composer config) persists per-browser via{" "}
            <code className="amaco-mono rounded bg-amaco-panel-2 px-1">
              localStorage
            </code>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

type HelpItem = {
  what: string;
  keys: string[];
  combinator?: string;
};

type HelpGroup = { title: string; items: HelpItem[] };

const GROUPS: HelpGroup[] = [
  {
    title: "Composer",
    items: [
      { what: "Focus composer", keys: ["⌘K"], combinator: "or" },
      { what: "Focus composer (alt)", keys: ["/"] },
      { what: "Submit prompt", keys: ["↵"] },
      { what: "Newline", keys: ["⇧↵"] },
    ],
  },
  {
    title: "Navigation",
    items: [
      { what: "Backlog panel", keys: ["1"] },
      { what: "Ready panel", keys: ["2"] },
      { what: "Queue panel", keys: ["3"] },
      { what: "Approvals panel", keys: ["4"] },
      { what: "Suggestions panel", keys: ["5"] },
      { what: "Notifications panel", keys: ["6"] },
      { what: "Toggle this help", keys: ["?"] },
    ],
  },
  {
    title: "Slash commands",
    items: [
      { what: "Spawn run", keys: ["/run <prompt>"] },
      { what: "Create task", keys: ["/task <title>"] },
      { what: "Queue task", keys: ["/queue <id>"] },
      { what: "Open board", keys: ["/board"] },
      { what: "Open all runs", keys: ["/runs"] },
      { what: "Open settings", keys: ["/settings"] },
    ],
  },
  {
    title: "Layout",
    items: [
      { what: "Reorder panel / section", keys: ["drag header"] },
      { what: "Collapse panel", keys: ["click chevron"] },
      { what: "Right-click for actions + CLI", keys: ["right-click"] },
    ],
  },
  {
    title: "Run actions (panel cards)",
    items: [
      { what: "Open run", keys: ["click card"] },
      { what: "Re-run (in detail view)", keys: ["R"] },
      { what: "Pause / Resume / Abort", keys: ["right-click"] },
      { what: "Copy CLI command", keys: ["right-click"] },
    ],
  },
  {
    title: "Back / navigation",
    items: [
      { what: "Back (browser history)", keys: ["header ← button"] },
      { what: "Notifications", keys: ["header bell"] },
      { what: "Settings", keys: ["header gear"] },
    ],
  },
];

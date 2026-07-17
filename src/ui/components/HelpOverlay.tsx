import { useEffect, useState } from "react";
import { Keyboard, X } from "lucide-react";
import { KBD } from "./design/Chip.js";
import { TourRelaunchRow } from "./onboarding/TourOverlay.js";

/**
 * Global help overlay. Opens on:
 *   - `?` keystroke (outside an input)
 *   - the custom `vibestrate:help-overlay` event dispatched by the TopBar
 *     and other shortcut handlers
 *   - the `?` button surfaces sprinkled around the chrome
 *
 * Closes on Esc, outside click, or the X button. Self-contained, no
 * route, no portal - renders a fixed full-viewport scrim.
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
    window.addEventListener("vibestrate:help-overlay", onCustom);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("vibestrate:help-overlay", onCustom);
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
        // Close on backdrop click - but not on inner panel clicks.
        if (e.target === e.currentTarget) setOpen(false);
      }}
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 px-4 py-12 backdrop-blur-sm sm:py-20"
    >
      <div className="relative w-full max-w-2xl overflow-hidden rounded-[18px] border border-[color:var(--line)] bg-coal-700 shadow-2xl shadow-black/50">
        <header className="flex items-center gap-2.5 border-b border-[color:var(--line)] px-4 py-3">
          <Keyboard
            className="h-4 w-4 text-violet-soft"
            strokeWidth={1.9}
            aria-hidden
          />
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold text-chalk-100">
              Keyboard shortcuts
            </h2>
            <div className="text-[10.5px] font-medium text-violet-soft">
              press ? to toggle · Esc to close
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close help"
            className="ml-auto grid h-7 w-7 place-items-center rounded-[9px] text-chalk-400 transition hover:bg-coal-500 hover:text-chalk-100"
          >
            <X className="h-4 w-4" strokeWidth={1.8} aria-hidden />
          </button>
        </header>
        <TourRelaunchRow onLaunch={() => setOpen(false)} />
        <div className="max-h-[70vh] overflow-y-auto p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {GROUPS.map((g) => (
              <section key={g.title} aria-labelledby={`hg-${g.title}`}>
                <h3
                  id={`hg-${g.title}`}
                  className="mb-1.5 text-[12px] font-semibold text-violet-vivid"
                >
                  {g.title}
                </h3>
                <dl className="space-y-1">
                  {g.items.map((it) => (
                    <div
                      key={it.what}
                      className="flex items-baseline justify-between gap-2 text-[12px]"
                    >
                      <dt className="text-chalk-300">{it.what}</dt>
                      <dd>
                        {it.keys.map((k, i) => (
                          <span key={`${it.what}-${i}`}>
                            {i > 0 ? (
                              <span className="mono mx-1 text-chalk-400">
                                {it.combinator ?? "·"}
                              </span>
                            ) : null}
                            <KBD>{k}</KBD>
                          </span>
                        ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
          <p className="mt-4 text-[11px] text-chalk-400">
            Layout state (sidebar width, panel order + collapsed state,
            section order, composer config) persists per-browser via{" "}
            <code className="mono rounded-[6px] bg-coal-500 px-1 py-0.5 text-chalk-300">
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
      { what: "Resize sidebar", keys: ["drag right edge"] },
      { what: "Reset sidebar width", keys: ["dbl-click edge"] },
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

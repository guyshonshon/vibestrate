import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Compass, X } from "lucide-react";
import { Button } from "../design/Button.js";
import { usePersistedState } from "../../lib/usePersistedState.js";

type TourStep = {
  id: string;
  title: string;
  body: string;
  /** Value of the target's `data-tour` attribute. */
  anchor: string;
};

// A fixed-length tuple (not TourStep[]) so `STEPS[stepIndex]` types as
// TourStep rather than TourStep | undefined under noUncheckedIndexedAccess -
// stepIndex is always kept in range by firstAvailableFrom/lastAvailableUpTo.
const STEPS: readonly [TourStep, TourStep, TourStep, TourStep, TourStep] = [
  {
    id: "runs",
    title: "Runs",
    body: "Every task you start shows up here - queued, executing, or waiting on you to approve something.",
    anchor: "nav-runs",
  },
  {
    id: "flows",
    title: "Flows",
    body: "Flows are the playbooks a run follows. Built-in ones cover the common shapes; add your own per project.",
    anchor: "nav-flows",
  },
  {
    id: "board",
    title: "Board",
    body: "The Board lines up every active run side by side, with its phase and current agent.",
    anchor: "nav-board",
  },
  {
    id: "consult",
    title: "Consult",
    body: "The orb answers questions about the project from its real context - read-only, it never acts on its own.",
    anchor: "consult-orb",
  },
  {
    id: "new-run",
    title: "New run",
    body: "This is where it starts - describe the task and the orchestrator takes it from there. Settings and the help overlay (press ?) cover the rest.",
    anchor: "nav-new-run",
  },
];

const TOUR_SEEN_KEY = "vibestrate.tourSeen";
const FIRST_VISIT_DELAY_MS = 900;
const CARD_WIDTH = 320;
const CARD_MARGIN = 14;

function findAnchorEl(anchor: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`);
}

/** First step index at or after `from` whose anchor exists in the DOM. */
function firstAvailableFrom(from: number): number | null {
  for (let i = from; i < STEPS.length; i++) {
    const s = STEPS[i];
    if (s && findAnchorEl(s.anchor)) return i;
  }
  return null;
}

/** Last step index at or before `from` whose anchor exists in the DOM. */
function lastAvailableUpTo(from: number): number | null {
  for (let i = from; i >= 0; i--) {
    const s = STEPS[i];
    if (s && findAnchorEl(s.anchor)) return i;
  }
  return null;
}

/**
 * First-visit product tour: plain coach marks over the sidebar nav and the
 * consult orb, no third-party tour library. Mirrors HelpOverlay's shape
 * (self-contained, fixed full-viewport, opens on a CustomEvent, closes on
 * Esc/outside-click/X) so a render error here can't take the rest of the
 * app down with it - there's nothing for other components to depend on.
 *
 * Anchors are resolved by `data-tour` attribute + getBoundingClientRect
 * rather than refs, so this stays decoupled from Sidebar/ConsultDock's
 * prop trees. A step whose anchor isn't currently mounted (e.g. the
 * consult orb while its panel is open) is skipped rather than shown
 * floating with nothing to point at.
 */
export function TourOverlay() {
  const [seen, setSeen] = usePersistedState<boolean>(TOUR_SEEN_KEY, false);
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // `?? STEPS[0]` only satisfies the type checker for an out-of-range index;
  // stepIndex is always kept in range by firstAvailableFrom/lastAvailableUpTo.
  const step = STEPS[stepIndex] ?? STEPS[0];

  const close = useCallback(
    (markSeen: boolean) => {
      setOpen(false);
      if (markSeen) setSeen(true);
    },
    [setSeen],
  );

  // First-visit trigger: open once, after the page has had a moment to
  // paint. If no anchor is reachable yet (e.g. landed on a chromeless
  // route), skip silently for this session rather than show a floating
  // card with nothing to point at - the flag stays unset, so it retries
  // next launch.
  useEffect(() => {
    if (seen) return;
    const id = window.setTimeout(() => {
      const start = firstAvailableFrom(0);
      if (start !== null) {
        setStepIndex(start);
        setOpen(true);
      }
    }, FIRST_VISIT_DELAY_MS);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-launch from the help overlay, ignoring the seen flag.
  useEffect(() => {
    const onRelaunch = () => {
      const start = firstAvailableFrom(0);
      if (start !== null) {
        setStepIndex(start);
        setOpen(true);
      }
    };
    window.addEventListener("vibestrate:tour", onRelaunch);
    return () => window.removeEventListener("vibestrate:tour", onRelaunch);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Track the current step's anchor position; recompute on resize.
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => setRect(findAnchorEl(step.anchor)?.getBoundingClientRect() ?? null);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, step.anchor]);

  const hasNext = stepIndex < STEPS.length - 1 && firstAvailableFrom(stepIndex + 1) !== null;
  const hasBack = stepIndex > 0 && lastAvailableUpTo(stepIndex - 1) !== null;

  const goNext = useCallback(() => {
    const next = firstAvailableFrom(stepIndex + 1);
    if (next === null) {
      close(true); // nothing left reachable - finish rather than stall
      return;
    }
    setStepIndex(next);
  }, [stepIndex, close]);

  const goBack = useCallback(() => {
    const prev = lastAvailableUpTo(stepIndex - 1);
    if (prev !== null) setStepIndex(prev);
  }, [stepIndex]);

  if (!open) return null;

  // Anchor on the left half of the viewport -> card sits to its right
  // (sidebar items); otherwise to its left (the bottom-right consult orb).
  const onLeftHalf = rect ? rect.left + rect.width / 2 < window.innerWidth / 2 : true;
  const cardLeft = rect
    ? onLeftHalf
      ? Math.min(rect.right + CARD_MARGIN, window.innerWidth - CARD_WIDTH - CARD_MARGIN)
      : Math.max(rect.left - CARD_WIDTH - CARD_MARGIN, CARD_MARGIN)
    : Math.max((window.innerWidth - CARD_WIDTH) / 2, CARD_MARGIN);
  const cardMaxTop = window.innerHeight - CARD_MARGIN - 220; // rough card height budget
  const cardTop = rect
    ? Math.min(Math.max(rect.top, CARD_MARGIN), Math.max(cardMaxTop, CARD_MARGIN))
    : Math.max((window.innerHeight - 220) / 2, CARD_MARGIN);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Dashboard tour"
      className="fixed inset-0 z-[100]"
      onClick={() => close(true)}
    >
      {rect ? (
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-[12px] border-2 border-violet-soft transition-all duration-200 ease-out"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: "0 0 0 9999px rgba(6, 6, 10, 0.6)",
          }}
        />
      ) : (
        <div aria-hidden className="pointer-events-none fixed inset-0 bg-black/55 backdrop-blur-[1px]" />
      )}

      <div
        ref={cardRef}
        onClick={(e) => e.stopPropagation()}
        style={{ top: cardTop, left: cardLeft, width: CARD_WIDTH }}
        className="fixed rounded-[16px] border border-[color:var(--line)] bg-coal-700 p-4 shadow-2xl shadow-black/50"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="mono text-[11px] font-bold text-violet-soft">
            {stepIndex + 1} of {STEPS.length}
          </div>
          <button
            type="button"
            onClick={() => close(true)}
            aria-label="Skip tour"
            className="grid h-6 w-6 place-items-center rounded-[8px] text-chalk-400 transition hover:bg-coal-500 hover:text-chalk-100"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
          </button>
        </div>
        <h3 className="mt-1.5 text-[14px] font-semibold text-chalk-100">{step.title}</h3>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-chalk-300">{step.body}</p>
        <div className="mt-3.5 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => close(true)}>
            Skip tour
          </Button>
          <div className="flex items-center gap-1.5">
            {hasBack ? (
              <Button variant="outline" size="sm" onClick={goBack}>
                Back
              </Button>
            ) : null}
            <Button variant="primary" size="sm" onClick={goNext}>
              {hasNext ? "Next" : "Done"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Small button for the help overlay to re-launch the tour on demand.
 * Dispatches the same `vibestrate:tour` event TourOverlay listens for.
 */
export function TourRelaunchRow({ onLaunch }: { onLaunch?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[color:var(--line)] bg-coal-800/50 px-4 py-2.5">
      <div className="flex items-center gap-2 text-[12px] text-chalk-300">
        <Compass className="h-3.5 w-3.5 text-violet-soft" strokeWidth={1.9} aria-hidden />
        New here? Take the guided tour of the dashboard.
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          onLaunch?.();
          window.dispatchEvent(new CustomEvent("vibestrate:tour"));
        }}
      >
        Take the tour
      </Button>
    </div>
  );
}

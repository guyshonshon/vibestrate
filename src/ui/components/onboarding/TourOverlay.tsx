import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, Compass, X } from "lucide-react";
import { Button } from "../design/Button.js";
import { usePersistedState } from "../../lib/usePersistedState.js";
import { Z_LAYER } from "../../lib/z-layers.js";
import { navigate } from "../../app/App.js";
import { parseHashRoute, type Route } from "../../app/route.js";
import {
  DEFAULT_GUIDE_ID,
  GUIDES,
  GUIDE_LAUNCH_EVENT,
  findGuide,
  type Guide,
  type GuideLaunchDetail,
  type GuideStep,
} from "../../lib/guides/guides.js";

/**
 * Open a walkthrough from anywhere. Fires the event this overlay listens for,
 * so a surface offering "show me how to" needs nothing but this call.
 *
 * `stepId` starts it on one step, which is what consult's "Take me there"
 * sends: you asked about seats, so the overlay opens on seats and moves you
 * there rather than starting a tour from the top.
 *
 * It lives here rather than beside the catalog because the catalog is pure
 * data with no browser globals, which is what keeps it unit-testable under the
 * node-only Vitest environment.
 */
export function launchGuide(guideId: string = DEFAULT_GUIDE_ID, stepId?: string): void {
  window.dispatchEvent(
    new CustomEvent<GuideLaunchDetail>(GUIDE_LAUNCH_EVENT, { detail: { guideId, stepId } }),
  );
}

const TOUR_SEEN_KEY = "vibestrate.tourSeen";
const FIRST_VISIT_DELAY_MS = 900;
const CARD_WIDTH = 320;
const CARD_MARGIN = 14;
/** How long a step waits for its target before it says so and offers the next one. */
const ANCHOR_WAIT_MS = 4000;
const POLL_MS = 150;

function findAnchorEl(anchor: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`);
}

/**
 * A step is reachable if the guide can get the user to it. A step that carries
 * a route always counts, because its target is by definition not mounted until
 * we navigate - the old rule (anchor must already be in the DOM) skipped every
 * such step before it could ever run.
 */
function isReachable(step: GuideStep): boolean {
  if (step.route) return true;
  if (!step.anchor) return true;
  return findAnchorEl(step.anchor) !== null;
}

function firstReachableFrom(steps: readonly GuideStep[], from: number): number | null {
  for (let i = Math.max(from, 0); i < steps.length; i++) {
    const s = steps[i];
    if (s && isReachable(s)) return i;
  }
  return null;
}

function lastReachableUpTo(steps: readonly GuideStep[], from: number): number | null {
  for (let i = Math.min(from, steps.length - 1); i >= 0; i--) {
    const s = steps[i];
    if (s && isReachable(s)) return i;
  }
  return null;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

type Box = { left: number; top: number; right: number; bottom: number };

function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

/** The page's own content column. The card is chrome; this is what it must not
 *  sit on top of when it has any choice about it. */
function contentBox(): Box | null {
  const main = document.querySelector("main");
  if (!main) return null;
  const r = main.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

/**
 * Place the card beside the target when either side has room, otherwise stack
 * it under (or over) the target. The old left-half/right-half rule was tuned
 * for a 240px sidebar rail and put the card straight on top of anything wider,
 * which is most page content.
 *
 * One extra rule, for a step whose target is app CHROME - a sidebar row, say -
 * rather than something on the page: of the placements that do not cover the
 * ring, take the one that covers the least of `<main>`. Pointing at the Flows
 * nav row used to drop the card immediately right of the rail, on top of the
 * "Draft a flow" box the step had just sent the user to look at. A card that
 * hides the thing it teaches is worse than a card slightly further from its
 * ring. When the target is IN the page, beside it is still right: the page is
 * where the target is, so every placement covers some of it.
 */
function placeCard(
  rect: DOMRect | null,
  cardH: number,
): { left: number; top: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Nothing to point at: dock the card out of the way of the sidebar and the
  // consult orb rather than dimming the screen the user was sent to read.
  if (!rect) {
    return {
      left: Math.max(vw - CARD_WIDTH - CARD_MARGIN * 2, CARD_MARGIN),
      top: CARD_MARGIN * 4,
    };
  }
  const maxLeft = Math.max(vw - CARD_WIDTH - CARD_MARGIN, CARD_MARGIN);
  const maxTop = Math.max(vh - cardH - CARD_MARGIN, CARD_MARGIN);
  const at = (left: number, top: number) => ({
    left: clamp(left, CARD_MARGIN, maxLeft),
    top: clamp(top, CARD_MARGIN, maxTop),
  });
  const centeredLeft = rect.left + rect.width / 2 - CARD_WIDTH / 2;

  const beside = (() => {
    const fitsRight = vw - rect.right - CARD_MARGIN * 2 >= CARD_WIDTH;
    const fitsLeft = rect.left - CARD_MARGIN * 2 >= CARD_WIDTH;
    if (!fitsRight && !fitsLeft) return null;
    const left = fitsRight ? rect.right + CARD_MARGIN : rect.left - CARD_WIDTH - CARD_MARGIN;
    return at(left, rect.top);
  })();
  const stacked = (() => {
    const below = rect.bottom + CARD_MARGIN;
    const top =
      below + cardH + CARD_MARGIN <= vh
        ? below
        : Math.max(rect.top - cardH - CARD_MARGIN, CARD_MARGIN);
    return at(centeredLeft, top);
  })();

  const content = contentBox();
  const target: Box = {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
  };
  const anchorIsChrome = content !== null && overlapArea(target, content) === 0;
  if (anchorIsChrome) {
    const candidates = [
      beside,
      stacked,
      at(rect.left - CARD_WIDTH - CARD_MARGIN, rect.top),
      at(centeredLeft, rect.bottom + CARD_MARGIN),
      at(centeredLeft, rect.top - cardH - CARD_MARGIN),
    ].filter((c): c is { left: number; top: number } => c !== null);
    let best: { left: number; top: number } | null = null;
    let bestCover = Infinity;
    for (const c of candidates) {
      const box: Box = {
        left: c.left,
        top: c.top,
        right: c.left + CARD_WIDTH,
        bottom: c.top + cardH,
      };
      // A card over the ring defeats the ring, whatever it saves elsewhere.
      if (overlapArea(box, target) > 0) continue;
      const cover = overlapArea(box, content);
      if (cover < bestCover) {
        bestCover = cover;
        best = c;
      }
    }
    if (best) return best;
  }
  return beside ?? stacked;
}

/**
 * Walkthrough overlay: coach marks over real elements, driven by the authored
 * guides in lib/guides. Mirrors HelpOverlay's shape (self-contained, fixed
 * full-viewport, opens on a CustomEvent, closes on Esc/X) so a render error
 * here can't take the rest of the app down with it.
 *
 * Anchors resolve by `data-tour` attribute + getBoundingClientRect rather than
 * refs, so this stays decoupled from every page's prop tree.
 *
 * Three rules the surface depends on:
 *  - It does not block the page. The root is pointer-events-none and only the
 *    card takes clicks, because a guide that says "press this" and then eats
 *    the press is worse than no guide.
 *  - It re-measures on a timer while open. Navigation, async data and image
 *    load all move the target after the first measurement, and a ring left at
 *    the old coordinates points at nothing.
 *  - It never claims to have found something it has not. A target that does
 *    not appear within ANCHOR_WAIT_MS is stated plainly and the step still
 *    advances; it keeps polling, so a slow mount still gets its ring.
 */
export function TourOverlay() {
  const [seen, setSeen] = usePersistedState<boolean>(TOUR_SEEN_KEY, false);
  const [guide, setGuide] = useState<Guide | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [missing, setMissing] = useState(false);
  const [cardH, setCardH] = useState(220);
  const [routeKind, setRouteKind] = useState<Route["kind"]>(
    () => parseHashRoute(window.location.hash).kind,
  );
  const cardRef = useRef<HTMLDivElement | null>(null);

  const steps = guide?.steps ?? [];
  const step: GuideStep | null = guide ? (guide.steps[stepIndex] ?? null) : null;
  // Route comparison is by kind, not by full URL: a user already inside the
  // crew editor must not be thrown back to a blank one.
  const away = !!step?.route && step.route.kind !== routeKind;

  // A TOUR drives itself. Asking someone being shown around to press a button
  // makes them do the walking; the step just goes. The deliberate press is
  // consult's "Take me there" (components/consult/ConsultGuides.tsx), which is
  // what OPENS this overlay on a chosen step - after that, moving is its job.
  // Kind-compare above means arriving does not re-fire this, and a step already
  // on its route never navigates at all.
  useEffect(() => {
    if (away && step?.route) navigate(step.route);
  }, [away, step]);

  const close = useCallback(
    (markSeen: boolean) => {
      setGuide(null);
      setRect(null);
      setMissing(false);
      // The flag only gates the first-visit auto-open. Anyone who has run a
      // walkthrough has met the system, whichever one they ran.
      if (markSeen) setSeen(true);
    },
    [setSeen],
  );

  const open = useCallback((g: Guide, stepId?: string) => {
    // A named step is where the user asked to be taken, so it wins over the
    // top of the guide. An id that is not in this guide is a wiring bug on the
    // caller's side and starts at the beginning rather than showing nothing.
    const named = stepId ? g.steps.findIndex((s) => s.id === stepId) : -1;
    const start = named >= 0 ? named : firstReachableFrom(g.steps, 0);
    if (start === null) return;
    setGuide(g);
    setStepIndex(start);
    setRect(null);
    setMissing(false);
  }, []);

  useEffect(() => {
    const onHash = () => setRouteKind(parseHashRoute(window.location.hash).kind);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // First-visit trigger: open the dashboard tour once, after the page has had
  // a moment to paint. If no anchor is reachable yet (e.g. landed on a
  // chromeless route), skip silently for this session - the flag stays unset,
  // so it retries next launch.
  useEffect(() => {
    if (seen) return;
    const id = window.setTimeout(() => {
      const g = findGuide(DEFAULT_GUIDE_ID);
      if (g) open(g);
    }, FIRST_VISIT_DELAY_MS);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Launch on demand, ignoring the seen flag.
  useEffect(() => {
    const onLaunch = (e: Event) => {
      const detail = (e as CustomEvent<GuideLaunchDetail>).detail;
      const id = detail?.guideId ?? DEFAULT_GUIDE_ID;
      const g = findGuide(id);
      if (!g) {
        // Ids come from our own catalog, so an unknown one is a wiring bug.
        console.warn(`[vibestrate] no walkthrough with id "${id}"`);
        return;
      }
      open(g, detail?.stepId);
    };
    window.addEventListener(GUIDE_LAUNCH_EVENT, onLaunch);
    return () => window.removeEventListener(GUIDE_LAUNCH_EVENT, onLaunch);
  }, [open]);

  useEffect(() => {
    if (!guide) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [guide, close]);

  const anchor = step?.anchor ?? null;

  // Track the target while the step is showing. One self-coalescing loop
  // handles the three things that move a ring: the target mounting late after
  // a navigation, the page reflowing as data lands, and scrolling.
  useLayoutEffect(() => {
    if (!guide || !step) return;
    if (away || !anchor) {
      setRect(null);
      setMissing(false);
      return;
    }
    let timer = 0;
    let scrolled = false;
    let lastKey = "";
    const deadline = Date.now() + ANCHOR_WAIT_MS;
    const tick = () => {
      window.clearTimeout(timer);
      const el = findAnchorEl(anchor);
      if (!el) {
        if (Date.now() > deadline) {
          setMissing(true);
          setRect(null);
        }
        timer = window.setTimeout(tick, POLL_MS);
        return;
      }
      setMissing(false);
      const r = el.getBoundingClientRect();
      if (!scrolled && (r.top < CARD_MARGIN || r.bottom > window.innerHeight - CARD_MARGIN)) {
        scrolled = true;
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      const key = `${r.top}|${r.left}|${r.width}|${r.height}`;
      if (key !== lastKey) {
        lastKey = key;
        setRect(r);
      }
      timer = window.setTimeout(tick, POLL_MS);
    };
    tick();
    window.addEventListener("resize", tick);
    window.addEventListener("scroll", tick, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", tick);
      window.removeEventListener("scroll", tick, true);
    };
  }, [guide, step, anchor, away]);

  // Real card height, so placement can stack it under a target without
  // running off the bottom of the viewport.
  useLayoutEffect(() => {
    const h = cardRef.current?.offsetHeight;
    if (h && h !== cardH) setCardH(h);
  });

  const hasNext = firstReachableFrom(steps, stepIndex + 1) !== null;
  const hasBack = stepIndex > 0 && lastReachableUpTo(steps, stepIndex - 1) !== null;

  const goNext = useCallback(() => {
    const next = firstReachableFrom(steps, stepIndex + 1);
    if (next === null) {
      close(true); // nothing left reachable - finish rather than stall
      return;
    }
    setStepIndex(next);
    setRect(null);
    setMissing(false);
  }, [steps, stepIndex, close]);

  const goBack = useCallback(() => {
    const prev = lastReachableUpTo(steps, stepIndex - 1);
    if (prev === null) return;
    setStepIndex(prev);
    setRect(null);
    setMissing(false);
  }, [steps, stepIndex]);

  if (!guide || !step) return null;

  const { left: cardLeft, top: cardTop } = placeCard(rect, cardH);

  return (
    <div
      role="dialog"
      aria-label={guide.title}
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: Z_LAYER.coachMark }}
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
      ) : null}

      {/* Capped to the viewport, not just positioned within it. `cardH` starts
          at a 220px guess and only corrects after the first paint, and a card
          taller than the window cannot be placed anywhere that fits - either
          way the footer ran off the bottom and Back/Done became unreachable.
          The card scrolls its own body instead, so the actions are always on
          screen whatever the height turns out to be. */}
      <div
        ref={cardRef}
        style={{
          top: cardTop,
          left: cardLeft,
          width: CARD_WIDTH,
          maxHeight: `calc(100vh - ${CARD_MARGIN * 2}px)`,
        }}
        className="pointer-events-auto fixed flex flex-col overflow-y-auto overscroll-contain rounded-[16px] border border-[color:var(--line)] bg-coal-700 p-4 shadow-2xl shadow-black/50"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {/* Segmented rail mirrors mission/runPhase's PhaseRail idiom (filled
                to current position) rather than inventing a new progress shape. */}
            <div className="flex items-center gap-1" aria-hidden>
              {steps.map((s, i) => (
                <span
                  key={s.id}
                  className="h-1 flex-1 rounded-full"
                  style={{
                    background: i <= stepIndex ? "var(--color-violet-soft)" : "var(--color-coal-400)",
                  }}
                />
              ))}
            </div>
            <div className="mt-1.5 text-meta font-semibold text-chalk-200">
              <span className="text-violet-soft">
                {stepIndex + 1} of {steps.length}
              </span>{" "}
              {guide.title}
            </div>
          </div>
          <button
            type="button"
            onClick={() => close(true)}
            aria-label="Close walkthrough"
            className="grid h-6 w-6 place-items-center rounded-[8px] text-chalk-300 transition hover:bg-coal-500 hover:text-chalk-100"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
          </button>
        </div>

        <h3 className="mt-1.5 text-[14px] font-semibold text-chalk-100">{step.title}</h3>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-chalk-200">{step.body}</p>
        {step.todo ? (
          <p className="mt-2 flex items-start gap-1.5 text-[12.5px] leading-relaxed text-violet-soft">
            <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
            {step.todo}
          </p>
        ) : null}


        {/* The honest terminus: the step says the target is not on screen and
            still lets the guide move on, instead of spinning or vanishing. */}
        {missing ? (
          <p className="mt-2.5 text-[12px] leading-relaxed text-amber-300">
            Nothing on this screen matches this step yet.
          </p>
        ) : null}

        <div className="mt-3.5 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => close(true)}>
            Close
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
 * Launcher for the authored walkthroughs. Mounted by the help overlay, and
 * usable by any other surface that offers "show me how to" - it dispatches the
 * same event the overlay listens for, so nothing needs to import the overlay.
 */
export function GuideLauncher({ onLaunch }: { onLaunch?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {GUIDES.filter((g) => g.id !== DEFAULT_GUIDE_ID).map((g) => (
        <Button
          key={g.id}
          variant="outline"
          size="sm"
          title={g.summary}
          onClick={() => {
            onLaunch?.();
            launchGuide(g.id);
          }}
        >
          {g.title}
        </Button>
      ))}
    </div>
  );
}

/**
 * Help-overlay row: the first-visit tour, plus the walkthroughs that point at
 * a specific piece of work.
 */
export function TourRelaunchRow({ onLaunch }: { onLaunch?: () => void }) {
  return (
    <div className="border-b border-[color:var(--line)] bg-coal-800/50 px-4 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[12px] text-chalk-200">
          <Compass className="h-3.5 w-3.5 text-violet-soft" strokeWidth={1.9} aria-hidden />
          New here? Take the guided tour of the dashboard.
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            onLaunch?.();
            launchGuide(DEFAULT_GUIDE_ID);
          }}
        >
          Take the tour
        </Button>
      </div>
      <div className="mt-2">
        <GuideLauncher onLaunch={onLaunch} />
      </div>
    </div>
  );
}

import { cn } from "../design/cn.js";

/**
 * A small padlock toggle with a satisfying open/close animation. The shackle is
 * its own <path> that swings on a spring (overshoot easing) around the body's
 * top-right pivot, so unlocking "pops" it open and locking snaps it shut. Used
 * on the Providers page to mark a row as locked (it won't be dragged); the
 * behavior is deliberately light - the point is a tactile, legible affordance.
 */
export function LockToggle({
  locked,
  onToggle,
  title,
}: {
  locked: boolean;
  onToggle: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={locked}
      title={title ?? (locked ? "Locked - click to unlock" : "Lock in place")}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        "grid h-7 w-7 shrink-0 place-items-center rounded-md border transition-colors duration-200",
        locked
          ? "border-violet-soft/40 bg-violet-soft/10 text-violet-soft"
          : "border-white/10 bg-transparent text-fog-500 hover:border-white/20 hover:text-fog-200",
      )}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {/* shackle - swings open on a spring around the body's top-right corner */}
        <path
          d="M8 11V8a4 4 0 0 1 8 0v3"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          style={{
            transformBox: "fill-box",
            transformOrigin: "100% 100%",
            transform: locked
              ? "rotate(0deg)"
              : "rotate(-26deg) translateY(-1px)",
            transition: "transform .3s cubic-bezier(.34,1.56,.64,1)",
          }}
        />
        {/* body */}
        <rect
          x="4"
          y="11"
          width="16"
          height="10"
          rx="2.5"
          stroke="currentColor"
          strokeWidth="2"
          fill="currentColor"
          fillOpacity={locked ? 0.16 : 0.06}
          style={{ transition: "fill-opacity .25s ease" }}
        />
        {/* keyhole */}
        <circle cx="12" cy="15.4" r="1.35" fill="currentColor" />
        <rect x="11.35" y="15.9" width="1.3" height="3" rx="0.65" fill="currentColor" />
      </svg>
    </button>
  );
}

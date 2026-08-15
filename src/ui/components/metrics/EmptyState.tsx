import { Button } from "../design/Button.js";

// Empty state (CTA, never a dead end - primitives-contract §10a). Local to the
// metrics panels on purpose; app-wide empty-state consolidation is a separate
// concern.
//
// It sizes to its sentence. This used to be a centred `py-10` box, which inside
// an already-bordered card drew a second chart-shaped panel to hold one line -
// on an empty project that reserved space was most of the page's dead gap.
export function EmptyState({
  text,
  actionLabel,
  onAction,
}: {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 rounded-[12px] border border-[color:var(--line-soft)] bg-coal-500/40 px-3.5 py-2.5">
      <span className="min-w-0 text-[13px] leading-[1.4] text-chalk-300">
        {text}
      </span>
      {actionLabel && onAction ? (
        <Button variant="secondary" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

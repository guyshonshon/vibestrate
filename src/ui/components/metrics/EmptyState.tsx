import { Button } from "../design/Button.js";

// Empty state (CTA, never a dead end - primitives-contract §10a). Local to the
// metrics panels on purpose; app-wide empty-state consolidation is a separate
// concern.
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
    <div className="flex flex-col items-center gap-3 rounded-[14px] border border-[color:var(--line-soft)] bg-coal-500/40 py-10 text-center">
      <span className="max-w-[360px] text-[12.5px] text-chalk-300">{text}</span>
      {actionLabel && onAction ? (
        <Button variant="secondary" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

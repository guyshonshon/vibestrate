import { lazy, Suspense } from "react";
import type { ReplayFocus } from "../../app/App.js";

/**
 * Lazy wrapper around ReplayPanel. The panel pulls in a non-trivial chunk
 * of timeline + summary rendering code that only matters when the user
 * opens the Replay tab. Mirrors the LazyTerminalPanel pattern from the
 * code-split phase.
 */
const ReplayPanelLazy = lazy(() =>
  import("./ReplayPanel.js").then((m) => ({ default: m.ReplayPanel })),
);

export function LazyReplayPanel({
  runId,
  focus,
}: {
  runId: string;
  focus?: ReplayFocus | null;
}) {
  return (
    <Suspense
      fallback={
        <div className="text-amaco-fg-muted text-[11.5px]">Loading replay…</div>
      }
    >
      <ReplayPanelLazy runId={runId} focus={focus ?? null} />
    </Suspense>
  );
}

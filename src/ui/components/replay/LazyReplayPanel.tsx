import { lazy, Suspense } from "react";
import type { ReplayFocus } from "../../app/App.js";
import { ErrorBoundary } from "../layout/ErrorBoundary.js";
import {
  Skeleton,
  SkeletonBlock,
  SkeletonRows,
  SkeletonText,
} from "../design/Skeleton.js";

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
    // A rejected dynamic import (stale deploy, offline) would otherwise
    // crash to the app-level boundary far above this tab. React caches a
    // rejected lazy() import, so this boundary's "Try again" can't recover
    // the chunk by itself - its Reload path is what actually fixes it.
    <ErrorBoundary resetKey={runId}>
      {/* The fallback carries its own bones rather than importing the panel's,
          which would pull the chunk this wrapper exists to defer. */}
      <Suspense
        fallback={
          <Skeleton label="Loading the replay" className="flex h-full flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <SkeletonBlock tone="text" h={12} w={168} />
              <SkeletonBlock tone="text" h={11} w={76} />
            </div>
            <SkeletonBlock h={30} w="100%" bordered />
            <div className="grid min-h-0 flex-1 grid-cols-[200px_1fr] gap-2">
              <div className="rounded-[14px] border border-[color:var(--line)] bg-coal-600 p-2">
                <SkeletonRows rows={7} meta />
              </div>
              <div className="rounded-[14px] border border-[color:var(--line)] bg-coal-600 p-3">
                <SkeletonText lines={9} size={11} gap={9} />
              </div>
            </div>
          </Skeleton>
        }
      >
        <ReplayPanelLazy runId={runId} focus={focus ?? null} />
      </Suspense>
    </ErrorBoundary>
  );
}

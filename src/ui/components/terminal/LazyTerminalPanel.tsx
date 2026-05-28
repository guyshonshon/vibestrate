import { lazy, Suspense } from "react";

/**
 * Lazy wrapper around TerminalPanel.
 *
 * The terminal pulls in @xterm/xterm, @xterm/addon-fit, and the xterm CSS
 * — together ~300 kB of JS that the user only needs if they actually open
 * the Terminal inspector tab on a run. Importing TerminalPanel through
 * React.lazy + dynamic import() tells the bundler to split those deps into
 * an async chunk; users who never open the tab never pay for them.
 *
 * The dynamic import resolves the module's named `TerminalPanel` export to
 * a default export, since React.lazy() wants `{ default: Component }`.
 */
const TerminalPanelLazy = lazy(() =>
  import("./TerminalPanel.js").then((m) => ({ default: m.TerminalPanel })),
);

export function LazyTerminalPanel({ runId }: { runId: string }) {
  return (
    <Suspense
      fallback={
        <div className="text-vibestrate-fg-muted text-[11.5px]">
          Loading terminal…
        </div>
      }
    >
      <TerminalPanelLazy runId={runId} />
    </Suspense>
  );
}

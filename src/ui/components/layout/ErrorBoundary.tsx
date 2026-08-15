// A render-error boundary so a crash in one view shows a visible, readable panel
// instead of unmounting the whole app to a blank page (previously the only trace
// was an uncaught error in the browser console). It catches errors thrown during
// render / lifecycle of its children; async and event-handler errors are caught
// separately by GlobalErrorOverlay.
//
// `resetKey` lets the boundary recover on navigation: when the page identity
// changes, a stuck error clears so the new view gets a fresh attempt - without
// remounting children on every render (which would drop page state).
//
// This is the app's last-resort crash net, so its render path must not itself
// be able to throw: it uses the design/ErrorState `compact` surface directly
// (a pure presentational component with no data fetching, hooks, or context)
// rather than the higher-level ErrorView/describeError helpers, which pull in
// the API client module for classification this boundary doesn't need.
import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "../design/ErrorState.js";

type Props = { children: ReactNode; resetKey?: string };
type State = { error: Error | null; info: ErrorInfo | null };

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep the console trace (devtools), and stash the component stack to show.
    console.error("[vibestrate] render error:", error, info.componentStack);
    this.setState({ info });
  }

  override componentDidUpdate(prev: Props): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null, info: null });
    }
  }

  private reset = (): void => this.setState({ error: null, info: null });

  override render(): ReactNode {
    const { error, info } = this.state;
    if (!error) return this.props.children;
    const hasDebugInfo = !!(error.stack || info?.componentStack);
    return (
      <div className="m-6">
        <ErrorState
          compact
          title="This view failed to render."
          detail={error.message}
          actions={[
            { label: "Try again", onClick: this.reset },
            { label: "Reload", variant: "secondary", onClick: () => window.location.reload() },
          ]}
        />
        {hasDebugInfo ? (
          <div className="mt-3 rounded-[14px] border border-[color:var(--line)] bg-coal-600 px-4 py-3.5">
            {error.stack ? (
              <details className="text-meta text-chalk-400">
                <summary className="cursor-pointer select-none">stack trace</summary>
                <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words">
                  {error.stack}
                </pre>
              </details>
            ) : null}
            {info?.componentStack ? (
              <details className="mt-2 text-meta text-chalk-400">
                <summary className="cursor-pointer select-none">component stack</summary>
                <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words">
                  {info.componentStack}
                </pre>
              </details>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }
}

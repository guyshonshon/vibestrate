// A render-error boundary so a crash in one view shows a visible, readable panel
// instead of unmounting the whole app to a blank page (previously the only trace
// was an uncaught error in the browser console). It catches errors thrown during
// render / lifecycle of its children; async and event-handler errors are caught
// separately by GlobalErrorOverlay.
//
// `resetKey` lets the boundary recover on navigation: when the page identity
// changes, a stuck error clears so the new view gets a fresh attempt - without
// remounting children on every render (which would drop page state).
import { Component, type ErrorInfo, type ReactNode } from "react";

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
    return (
      <div className="m-6 rounded-xl border border-rose-500/30 bg-rose-500/[0.06] p-5 text-rose-100">
        <div className="text-sm font-semibold">
          Something broke while rendering this view.
        </div>
        <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words text-[11.5px] text-rose-200/90">
          {error.message}
        </pre>
        {error.stack ? (
          <details className="mt-2 text-[10.5px] text-rose-200/60">
            <summary className="cursor-pointer select-none">stack trace</summary>
            <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words">
              {error.stack}
            </pre>
          </details>
        ) : null}
        {info?.componentStack ? (
          <details className="mt-2 text-[10.5px] text-rose-200/60">
            <summary className="cursor-pointer select-none">component stack</summary>
            <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words">
              {info.componentStack}
            </pre>
          </details>
        ) : null}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={this.reset}
            className="rounded border border-rose-400/40 px-2.5 py-1 text-[11px] hover:bg-rose-400/10"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded border border-rose-400/40 px-2.5 py-1 text-[11px] hover:bg-rose-400/10"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}

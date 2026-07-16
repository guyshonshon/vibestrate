import { RefreshCw } from "lucide-react";
import { ApiError } from "./api.js";
import { ErrorState, type ErrorAction } from "../components/design/ErrorState.js";

export type ErrorDescription = {
  title: string;
  detail?: string;
  hint?: string;
  retryable: boolean;
};

function firstLine(s: string): string {
  const i = s.indexOf("\n");
  return (i === -1 ? s : s.slice(0, i)).trim();
}

/** Fallback hint when the server didn't send one. Two sentences so it renders
 *  as two lines (what happened / what to do). Mirrors src/core/error-format.ts;
 *  the UI build can't import src/core (separate tsconfig), so keep in sync. */
function defaultHint(status: number): string | undefined {
  if (status === 404)
    return "The resource no longer exists. It may have been deleted, cancelled, or never existed.";
  if (status === 401 || status === 403)
    return "This action needs an API token or broader permission. Set VIBESTRATE_API_TOKEN, or run it from the CLI.";
  if (status === 400 || status === 422)
    return "The request was rejected. Fix the input and try again - the change was not partially applied.";
  if (status >= 500)
    return "The server hit an error. vibestrate logged it to .vibestrate/issues.ndjson - check the Issues panel, then retry.";
  return undefined;
}

/**
 * Classify any thrown value into a designed error shape. For an ApiError it
 * prefers the server's own classification (title/hint from formatError, so the
 * dashboard reads the same as the CLI) and falls back to status-derived copy.
 * Network / unknown errors get the offline / generic treatment.
 */
export function describeError(err: unknown): ErrorDescription {
  if (err instanceof ApiError) {
    const s = err.status;
    const title =
      err.title?.trim() ||
      firstLine(err.message) ||
      (s >= 500 ? `Server error ${s}` : `Request failed (${s})`);
    const hint = err.hint?.trim() || defaultHint(s);
    // Raw message as detail ONLY when it adds something title/hint don't already
    // say - otherwise the flattened "title - hint" message echoes the card.
    const detail = err.title
      ? undefined
      : firstLine(err.message) !== title
        ? err.message
        : undefined;
    return { title, detail, hint, retryable: s >= 500 };
  }
  const msg = (err instanceof Error ? err.message : String(err ?? "")).trim();
  if (/failed to fetch|networkerror|load failed|\bfetch\b/i.test(msg))
    return {
      title: "Can't reach the dashboard",
      detail: msg,
      hint: "The dashboard server may have stopped. Check it's running, then retry.",
      retryable: true,
    };
  return {
    title: firstLine(msg) || "Something went wrong",
    detail: msg || undefined,
    retryable: true,
  };
}

/**
 * Call-site API: classify `err` and render it with recovery forks. `actions`
 * are your contextual buttons (Back to X, New Y); pass `onRetry` to append a
 * Retry on retryable kinds. `override` patches any classified field.
 */
export function ErrorView({
  err,
  actions = [],
  onRetry,
  compact,
  className,
  override,
}: {
  err: unknown;
  actions?: ErrorAction[];
  onRetry?: () => void;
  compact?: boolean;
  className?: string;
  override?: Partial<ErrorDescription>;
}) {
  const d = { ...describeError(err), ...override };
  const retry: ErrorAction[] =
    onRetry && d.retryable
      ? [
          {
            label: "Retry",
            onClick: onRetry,
            variant: "secondary",
            iconLeft: <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.9} />,
          },
        ]
      : [];
  return (
    <ErrorState
      title={d.title}
      detail={d.detail}
      hint={d.hint}
      actions={[...actions, ...retry]}
      compact={compact}
      className={className}
    />
  );
}

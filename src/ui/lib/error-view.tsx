import { RefreshCw } from "lucide-react";
import { ApiError } from "./api.js";
import {
  ErrorState,
  type ErrorAction,
  type ErrorGlyph,
  type ErrorTone,
} from "../components/design/ErrorState.js";

export type ErrorDescription = {
  tone: ErrorTone;
  glyph: ErrorGlyph;
  title: string;
  detail?: string;
  hint?: string;
  retryable: boolean;
};

function firstLine(s: string): string {
  const i = s.indexOf("\n");
  return (i === -1 ? s : s.slice(0, i)).trim();
}

const TONE_FOR: Record<ErrorGlyph, ErrorTone> = {
  "not-found": "rose",
  forbidden: "amber",
  validation: "amber",
  server: "rose",
  offline: "amber",
  blocked: "amber",
  generic: "rose",
};

function glyphForHttp(kind: string | undefined, status: number): ErrorGlyph {
  if (status === 404 || kind === "http-404") return "not-found";
  if (status === 401 || status === 403 || kind === "http-401" || kind === "http-403")
    return "forbidden";
  if (status === 400 || status === 422) return "validation";
  if (status >= 500 || (kind ?? "").startsWith("http-5")) return "server";
  return "generic";
}

/** Fallback hint when the server didn't send one - matches error-format.ts. */
function defaultHint(status: number): string | undefined {
  if (status === 404)
    return "The resource no longer exists. It may have been deleted, cancelled, or never existed.";
  if (status === 401 || status === 403)
    return "This action needs an API token or broader permission. Set VIBESTRATE_API_TOKEN, or run it from the CLI.";
  if (status === 400 || status === 422)
    return "Fix the input and try again - the change was not partially applied.";
  if (status >= 500)
    return "vibestrate logged this to .vibestrate/issues.ndjson - check the Issues panel, then retry.";
  return undefined;
}

/**
 * Classify any thrown value into a designed error shape. For an ApiError it
 * prefers the server's own classification (kind/title/hint from formatError, so
 * the dashboard reads the same as the CLI) and falls back to status-derived
 * copy. Network / unknown errors get the offline / generic treatment.
 */
export function describeError(err: unknown): ErrorDescription {
  if (err instanceof ApiError) {
    const s = err.status;
    const glyph = glyphForHttp(err.kind, s);
    const title =
      err.title?.trim() ||
      firstLine(err.message) ||
      (s >= 500 ? `Server error ${s}` : `Request failed (${s})`);
    const hint = err.hint?.trim() || defaultHint(s);
    // Show the raw message as detail ONLY when it adds something the title/hint
    // don't already say - otherwise the flattened "title - hint" message would
    // echo the card three times.
    const detail =
      err.title || (hint && firstLine(err.message) === title)
        ? undefined
        : firstLine(err.message) !== title
          ? err.message
          : undefined;
    return { tone: TONE_FOR[glyph], glyph, title, detail, hint, retryable: s >= 500 };
  }
  const msg = (err instanceof Error ? err.message : String(err ?? "")).trim();
  if (/failed to fetch|networkerror|load failed|\bfetch\b/i.test(msg))
    return {
      tone: "amber",
      glyph: "offline",
      title: "Can't reach the dashboard",
      detail: msg,
      hint: "The dashboard server may have stopped. Check it's running, then retry.",
      retryable: true,
    };
  return {
    tone: "rose",
    glyph: "generic",
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
      tone={d.tone}
      glyph={d.glyph}
      title={d.title}
      detail={d.detail}
      hint={d.hint}
      actions={[...actions, ...retry]}
      compact={compact}
      className={className}
    />
  );
}

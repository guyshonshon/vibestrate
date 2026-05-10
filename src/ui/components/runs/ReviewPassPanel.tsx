import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Layers,
  RefreshCw,
  RotateCcw,
  Wrench,
  X,
} from "lucide-react";
import { ApiError, api } from "../../lib/api.js";
import type {
  BundlePreflightResult,
  ReviewSuggestion,
  SuggestionBundle,
  SuggestionValidationResult,
} from "../../lib/types.js";

type Props = {
  runId: string;
  /** Suggestions list, used for cross-referencing titles in the bundle drawer. */
  suggestions: ReviewSuggestion[];
  onChange: () => void;
};

/**
 * Panel for review passes (suggestion bundles). Lives at the bottom of the
 * Suggestions inspector tab. Shows every bundle with its status, member
 * suggestions, preflight findings, and the four lifecycle actions: approve /
 * apply / validate / revert.
 */
export function ReviewPassPanel({ runId, suggestions, onChange }: Props) {
  const [bundles, setBundles] = useState<SuggestionBundle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [preflights, setPreflights] = useState<
    Record<string, BundlePreflightResult | null>
  >({});
  const [validations, setValidations] = useState<
    Record<string, SuggestionValidationResult | null>
  >({});

  async function load() {
    try {
      setBundles(await api.listBundles(runId));
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    }
  }

  useEffect(() => {
    void load();
    const i = setInterval(load, 5_000);
    return () => clearInterval(i);
  }, [runId]);

  async function preflight(b: SuggestionBundle) {
    setBusy(b.id);
    try {
      const r = await api.preflightBundle({ runId, bundleId: b.id });
      setPreflights((prev) => ({ ...prev, [b.id]: r }));
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(null);
    }
  }
  async function approve(b: SuggestionBundle) {
    setBusy(b.id);
    try {
      await api.approveBundle({ runId, bundleId: b.id });
      await load();
      onChange();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(null);
    }
  }
  async function reject(b: SuggestionBundle) {
    setBusy(b.id);
    try {
      await api.rejectBundle({ runId, bundleId: b.id });
      await load();
      onChange();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(null);
    }
  }
  async function apply(b: SuggestionBundle) {
    setBusy(b.id);
    try {
      const r = await api.applyBundle({ runId, bundleId: b.id });
      setPreflights((prev) => ({ ...prev, [b.id]: r.preflight }));
      await load();
      onChange();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(null);
    }
  }
  async function validate(b: SuggestionBundle) {
    setBusy(b.id);
    try {
      const r = await api.validateBundle({ runId, bundleId: b.id });
      setValidations((prev) => ({ ...prev, [b.id]: r.result }));
      await load();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(null);
    }
  }
  async function revert(b: SuggestionBundle) {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Revert review pass "${b.title}" — this runs git apply -R against the worktree only. Continue?`,
      )
    ) {
      return;
    }
    setBusy(b.id);
    try {
      await api.revertBundle({ runId, bundleId: b.id });
      await load();
      onChange();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(null);
    }
  }

  const titleFor = (id: string): string =>
    suggestions.find((s) => s.id === id)?.title ?? id;

  return (
    <div className="space-y-2 text-[12px]">
      <header className="flex items-center gap-2">
        <Layers className="h-3.5 w-3.5 text-amaco-accent" strokeWidth={1.5} />
        <span className="text-[12px] font-medium text-amaco-fg">
          Review passes
        </span>
        <span className="amaco-mono text-[10.5px] text-amaco-fg-muted">
          {bundles.length}
        </span>
        <button
          type="button"
          onClick={() => void load()}
          className="ml-auto rounded border border-amaco-border p-1 text-amaco-fg-dim hover:bg-amaco-panel-2"
          title="Refresh"
        >
          <RefreshCw className="h-3 w-3" strokeWidth={1.5} />
        </button>
      </header>
      {error ? (
        <div className="rounded border border-amaco-fail/40 bg-amaco-fail/10 px-2 py-1 text-[11.5px] text-amaco-fail">
          {error}
        </div>
      ) : null}
      {bundles.length === 0 ? (
        <div className="rounded border border-dashed border-amaco-border px-3 py-3 text-center text-[11.5px] text-amaco-fg-muted">
          No review passes yet. Use the <span className="amaco-mono">Select</span>{" "}
          mode above to group suggestions into a pass.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {bundles.map((b) => {
            const expanded = open === b.id;
            const isApplied =
              b.status === "applied" ||
              b.status === "validation_passed" ||
              b.status === "validation_failed";
            return (
              <li
                key={b.id}
                className="rounded border border-amaco-border bg-amaco-panel-2 px-2.5 py-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <BundleStatusBadge status={b.status} />
                  <span className="font-medium text-amaco-fg">{b.title}</span>
                  <span className="amaco-mono text-[10.5px] text-amaco-fg-muted">
                    {b.suggestionIds.length} suggestion
                    {b.suggestionIds.length === 1 ? "" : "s"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : b.id)}
                    className="ml-auto rounded border border-amaco-border px-1.5 py-0.5 text-[11px] text-amaco-fg-dim hover:bg-amaco-panel"
                  >
                    {expanded ? "Hide" : "Details"}
                  </button>
                </div>
                {b.errorMessage ? (
                  <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-amaco-fail">
                    <AlertTriangle className="h-3 w-3" strokeWidth={1.5} />
                    {b.errorMessage}
                  </div>
                ) : null}
                {b.sameFileWarnings.length > 0 ? (
                  <div className="mt-1 rounded border border-amaco-warn/40 bg-amaco-warn/10 px-2 py-1 text-[11px] text-amaco-warn">
                    {b.sameFileWarnings.length} same-file warning
                    {b.sameFileWarnings.length === 1 ? "" : "s"} — patches in
                    this pass touch overlapping files.
                  </div>
                ) : null}
                {expanded ? (
                  <div className="mt-2 space-y-1.5 text-[11.5px]">
                    {b.description ? (
                      <p className="whitespace-pre-wrap text-amaco-fg-dim">
                        {b.description}
                      </p>
                    ) : null}
                    <ul className="ml-3 list-disc text-amaco-fg-dim">
                      {b.suggestionIds.map((sid) => (
                        <li key={sid} className="amaco-mono">
                          {titleFor(sid)}{" "}
                          <span className="text-amaco-fg-muted">{sid}</span>
                        </li>
                      ))}
                    </ul>
                    {preflights[b.id] ? (
                      <PreflightBlock result={preflights[b.id]!} />
                    ) : null}
                    {validations[b.id] ? (
                      <ValidationBlock result={validations[b.id]!} />
                    ) : b.validationResultPath ? (
                      <div className="amaco-mono text-[10.5px] text-amaco-fg-muted">
                        last validation: {b.validationResultPath}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                  {b.status === "draft" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void preflight(b)}
                        disabled={busy === b.id}
                        className="inline-flex items-center gap-1 rounded border border-amaco-border bg-amaco-panel px-1.5 py-0.5 text-amaco-fg-dim hover:bg-amaco-panel-2 disabled:opacity-50"
                      >
                        Preflight
                      </button>
                      <button
                        type="button"
                        onClick={() => void approve(b)}
                        disabled={busy === b.id}
                        className="inline-flex items-center gap-1 rounded border border-amaco-success/40 bg-amaco-success/10 px-1.5 py-0.5 text-amaco-success hover:bg-amaco-success/15 disabled:opacity-50"
                      >
                        <Check className="h-3 w-3" strokeWidth={1.5} />
                        Approve pass
                      </button>
                      <button
                        type="button"
                        onClick={() => void reject(b)}
                        disabled={busy === b.id}
                        className="inline-flex items-center gap-1 rounded border border-amaco-warn/40 bg-amaco-warn/10 px-1.5 py-0.5 text-amaco-warn hover:bg-amaco-warn/15 disabled:opacity-50"
                      >
                        <X className="h-3 w-3" strokeWidth={1.5} />
                        Reject
                      </button>
                    </>
                  ) : null}
                  {b.status === "approved" ? (
                    <button
                      type="button"
                      onClick={() => void apply(b)}
                      disabled={busy === b.id}
                      className="inline-flex items-center gap-1 rounded border border-amaco-accent/40 bg-amaco-accent-soft/30 px-1.5 py-0.5 text-amaco-fg hover:bg-amaco-accent-soft/50 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3 w-3" strokeWidth={1.5} />
                      Apply review pass
                    </button>
                  ) : null}
                  {isApplied ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void validate(b)}
                        disabled={busy === b.id}
                        className="inline-flex items-center gap-1 rounded border border-amaco-border bg-amaco-panel px-1.5 py-0.5 text-amaco-fg-dim hover:bg-amaco-panel-2 disabled:opacity-50"
                      >
                        <Wrench className="h-3 w-3" strokeWidth={1.5} />
                        Validate
                      </button>
                      <button
                        type="button"
                        onClick={() => void revert(b)}
                        disabled={busy === b.id}
                        className="inline-flex items-center gap-1 rounded border border-amaco-warn/40 bg-amaco-warn/10 px-1.5 py-0.5 text-amaco-warn hover:bg-amaco-warn/15 disabled:opacity-50"
                      >
                        <RotateCcw className="h-3 w-3" strokeWidth={1.5} />
                        Revert
                      </button>
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PreflightBlock({ result }: { result: BundlePreflightResult }) {
  const failures = result.findings.filter((f) => f.reason !== null);
  return (
    <div
      className={`rounded border px-2 py-1 text-[11px] ${
        result.ok
          ? "border-amaco-success/40 bg-amaco-success/10 text-amaco-success"
          : "border-amaco-fail/40 bg-amaco-fail/10 text-amaco-fail"
      }`}
    >
      <div>
        Preflight {result.ok ? "passed" : "failed"} —{" "}
        {result.findings.length} suggestion
        {result.findings.length === 1 ? "" : "s"} checked.
      </div>
      {failures.length > 0 ? (
        <ul className="mt-1 space-y-0.5">
          {failures.map((f, i) => (
            <li key={i} className="amaco-mono text-[10.5px]">
              {f.suggestionId}: {f.reason}
            </li>
          ))}
        </ul>
      ) : null}
      {result.sameFileWarnings.length > 0 ? (
        <div className="mt-1 amaco-mono text-[10.5px] text-amaco-warn">
          {result.sameFileWarnings.length} same-file warning
          {result.sameFileWarnings.length === 1 ? "" : "s"}
        </div>
      ) : null}
    </div>
  );
}

function ValidationBlock({
  result,
}: {
  result: SuggestionValidationResult;
}) {
  if (result.status === "no_commands_configured") {
    return (
      <div className="rounded border border-amaco-warn/40 bg-amaco-warn/10 px-2 py-1 text-[11px] text-amaco-warn">
        No <span className="amaco-mono">commands.validate</span> configured.
      </div>
    );
  }
  const ok = result.status === "passed";
  return (
    <div
      className={`rounded border px-2 py-1 text-[11px] ${
        ok
          ? "border-amaco-success/40 bg-amaco-success/10 text-amaco-success"
          : "border-amaco-fail/40 bg-amaco-fail/10 text-amaco-fail"
      }`}
    >
      Validation {ok ? "passed" : "failed"}: {result.summary.passed}/
      {result.summary.total} commands.
    </div>
  );
}

function BundleStatusBadge({ status }: { status: SuggestionBundle["status"] }) {
  const tone =
    status === "applied" ||
    status === "approved" ||
    status === "validation_passed"
      ? "border-amaco-success/40 text-amaco-success"
      : status === "failed" ||
          status === "validation_failed" ||
          status === "revert_failed" ||
          status === "partially_applied"
        ? "border-amaco-fail/40 text-amaco-fail"
        : status === "rejected" || status === "reverted"
          ? "border-amaco-border text-amaco-fg-muted"
          : status === "applying"
            ? "border-amaco-warn/40 text-amaco-warn"
            : "border-amaco-accent/40 text-amaco-accent";
  return (
    <span
      className={`amaco-mono inline-flex items-center rounded border px-1 text-[10px] ${tone}`}
    >
      {status}
    </span>
  );
}

function messageFor(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return err instanceof Error ? err.message : String(err);
}

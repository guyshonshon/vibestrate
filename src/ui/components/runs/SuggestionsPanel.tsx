import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Lightbulb,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { ApiError, api } from "../../lib/api.js";
import type {
  ReviewSuggestion,
  SuggestionStatus,
} from "../../lib/types.js";

type Props = {
  runId: string;
  /** When set, the new-suggestion form prefills with these values. */
  prefill?: {
    file: string | null;
    lineStart: number | null;
    lineEnd: number | null;
  } | null;
};

export function SuggestionsPanel({ runId, prefill }: Props) {
  const [items, setItems] = useState<ReviewSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    body: "",
    file: prefill?.file ?? "",
    lineStart: prefill?.lineStart ?? "",
    lineEnd: prefill?.lineEnd ?? "",
    proposedPatch: "",
  });

  useEffect(() => {
    setDraft((d) => ({
      ...d,
      file: prefill?.file ?? d.file,
      lineStart:
        prefill?.lineStart != null ? String(prefill.lineStart) : d.lineStart,
      lineEnd: prefill?.lineEnd != null ? String(prefill.lineEnd) : d.lineEnd,
    }));
  }, [prefill?.file, prefill?.lineStart, prefill?.lineEnd]);

  async function load() {
    try {
      setItems(await api.listSuggestions(runId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void load();
    const i = setInterval(load, 5_000);
    return () => clearInterval(i);
  }, [runId]);

  async function approve(s: ReviewSuggestion) {
    setBusy(s.id);
    try {
      await api.approveSuggestion({ runId, suggestionId: s.id });
      await load();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(null);
    }
  }
  async function reject(s: ReviewSuggestion) {
    setBusy(s.id);
    try {
      await api.rejectSuggestion({ runId, suggestionId: s.id });
      await load();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(null);
    }
  }
  async function apply(s: ReviewSuggestion) {
    setBusy(s.id);
    try {
      await api.applySuggestion({ runId, suggestionId: s.id });
      await load();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(null);
    }
  }
  async function submitDraft(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.title.trim()) return;
    setBusy("create");
    try {
      await api.createSuggestion({
        runId,
        title: draft.title.trim(),
        body: draft.body || undefined,
        file: draft.file || null,
        lineStart: draft.lineStart ? Number(draft.lineStart) : null,
        lineEnd: draft.lineEnd ? Number(draft.lineEnd) : null,
        proposedPatch: draft.proposedPatch || null,
      });
      setDraft({
        title: "",
        body: "",
        file: "",
        lineStart: "",
        lineEnd: "",
        proposedPatch: "",
      });
      setCreating(false);
      await load();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2 text-[12px]">
      <header className="flex items-center gap-2">
        <Lightbulb className="h-3.5 w-3.5 text-amaco-accent" strokeWidth={1.5} />
        <span className="text-[12px] font-medium text-amaco-fg">Suggestions</span>
        <span className="amaco-mono text-[10.5px] text-amaco-fg-muted">
          {items.length}
        </span>
        <button
          type="button"
          onClick={() => void load()}
          className="ml-auto rounded border border-amaco-border p-1 text-amaco-fg-dim hover:bg-amaco-panel-2"
          title="Refresh"
        >
          <RefreshCw className="h-3 w-3" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="inline-flex items-center gap-1 rounded border border-amaco-border px-1.5 py-0.5 text-[11px] text-amaco-fg-dim hover:bg-amaco-panel-2"
        >
          <Plus className="h-3 w-3" strokeWidth={1.5} />
          New
        </button>
      </header>
      {error ? (
        <div className="rounded border border-amaco-fail/40 bg-amaco-fail/10 px-2 py-1 text-[11.5px] text-amaco-fail">
          {error}
        </div>
      ) : null}
      {creating ? (
        <form
          onSubmit={submitDraft}
          className="space-y-1.5 rounded border border-amaco-border bg-amaco-panel-2 p-2 text-[11.5px]"
        >
          <input
            value={draft.title}
            onChange={(e) =>
              setDraft((d) => ({ ...d, title: e.target.value }))
            }
            placeholder="Title (required)"
            className="w-full rounded border border-amaco-border bg-amaco-panel px-1.5 py-1"
          />
          <div className="flex gap-1.5">
            <input
              value={draft.file}
              onChange={(e) =>
                setDraft((d) => ({ ...d, file: e.target.value }))
              }
              placeholder="src/foo.ts"
              className="flex-1 rounded border border-amaco-border bg-amaco-panel px-1.5 py-1"
            />
            <input
              value={draft.lineStart}
              onChange={(e) =>
                setDraft((d) => ({ ...d, lineStart: e.target.value }))
              }
              placeholder="line start"
              className="w-24 rounded border border-amaco-border bg-amaco-panel px-1.5 py-1"
            />
            <input
              value={draft.lineEnd}
              onChange={(e) =>
                setDraft((d) => ({ ...d, lineEnd: e.target.value }))
              }
              placeholder="line end"
              className="w-24 rounded border border-amaco-border bg-amaco-panel px-1.5 py-1"
            />
          </div>
          <textarea
            value={draft.body}
            onChange={(e) =>
              setDraft((d) => ({ ...d, body: e.target.value }))
            }
            placeholder="Describe what should change…"
            rows={3}
            className="w-full rounded border border-amaco-border bg-amaco-panel px-1.5 py-1"
          />
          <textarea
            value={draft.proposedPatch}
            onChange={(e) =>
              setDraft((d) => ({ ...d, proposedPatch: e.target.value }))
            }
            placeholder="Optional unified diff (will require approval before apply)"
            rows={4}
            className="amaco-mono w-full rounded border border-amaco-border bg-amaco-panel px-1.5 py-1 text-[11px]"
          />
          <div className="flex gap-1.5">
            <button
              type="submit"
              disabled={busy !== null}
              className="rounded border border-amaco-accent/40 bg-amaco-accent-soft/30 px-2 py-0.5 text-[11px] text-amaco-fg hover:bg-amaco-accent-soft/50 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="rounded border border-amaco-border px-2 py-0.5 text-[11px] text-amaco-fg-dim"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
      {items.length === 0 ? (
        <div className="rounded border border-dashed border-amaco-border px-3 py-4 text-center text-[11.5px] text-amaco-fg-muted">
          No suggestions yet. Reviewer/verifier `AMACO_SUGGESTION` blocks land
          here, plus anything you create manually.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((s) => (
            <Row
              key={s.id}
              s={s}
              busy={busy === s.id}
              onApprove={() => approve(s)}
              onReject={() => reject(s)}
              onApply={() => apply(s)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({
  s,
  busy,
  onApprove,
  onReject,
  onApply,
}: {
  s: ReviewSuggestion;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onApply: () => void;
}) {
  return (
    <li className="rounded border border-amaco-border bg-amaco-panel-2 px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={s.status} />
        <span className="amaco-mono rounded border border-amaco-border px-1 text-[10px] text-amaco-fg-muted">
          {s.source}
        </span>
        <span className="font-medium text-amaco-fg">{s.title}</span>
        {s.file ? (
          <span className="amaco-mono ml-auto truncate text-[10.5px] text-amaco-fg-muted">
            {s.file}
            {s.lineStart ? `:${s.lineStart}` : ""}
            {s.lineEnd ? `-${s.lineEnd}` : ""}
          </span>
        ) : null}
      </div>
      {s.body ? (
        <p className="mt-1 whitespace-pre-wrap text-[11.5px] text-amaco-fg-dim">
          {s.body}
        </p>
      ) : null}
      {s.proposedPatch ? (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[10.5px] text-amaco-fg-muted">
            proposed patch ({s.proposedPatch.split("\n").length} lines)
          </summary>
          <pre className="amaco-mono mt-1 max-h-48 overflow-auto rounded border border-amaco-border bg-amaco-panel px-2 py-1.5 text-[10.5px] text-amaco-fg">
            {s.proposedPatch}
          </pre>
        </details>
      ) : null}
      {s.errorMessage ? (
        <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-amaco-fail">
          <AlertTriangle className="h-3 w-3" strokeWidth={1.5} />
          {s.errorMessage}
        </div>
      ) : null}
      {s.status === "open" ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
          <button
            type="button"
            onClick={onApprove}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded border border-amaco-success/40 bg-amaco-success/10 px-1.5 py-0.5 text-amaco-success hover:bg-amaco-success/15 disabled:opacity-50"
          >
            <Check className="h-3 w-3" strokeWidth={1.5} />
            Approve
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded border border-amaco-warn/40 bg-amaco-warn/10 px-1.5 py-0.5 text-amaco-warn hover:bg-amaco-warn/15 disabled:opacity-50"
          >
            <X className="h-3 w-3" strokeWidth={1.5} />
            Reject
          </button>
        </div>
      ) : null}
      {s.status === "approved" && s.proposedPatch ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
          <button
            type="button"
            onClick={onApply}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded border border-amaco-accent/40 bg-amaco-accent-soft/30 px-1.5 py-0.5 text-amaco-fg hover:bg-amaco-accent-soft/50 disabled:opacity-50"
          >
            <CheckCircle2 className="h-3 w-3" strokeWidth={1.5} />
            Apply patch
          </button>
        </div>
      ) : null}
    </li>
  );
}

function StatusBadge({ status }: { status: SuggestionStatus }) {
  const tone =
    status === "applied" || status === "approved"
      ? "border-amaco-success/40 text-amaco-success"
      : status === "rejected" || status === "failed"
        ? "border-amaco-fail/40 text-amaco-fail"
        : status === "resolved"
          ? "border-amaco-border text-amaco-fg-muted"
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

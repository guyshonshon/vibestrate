import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  History,
  Lightbulb,
  Plus,
  RefreshCw,
  RotateCcw,
  Square,
  CheckSquare,
  Wrench,
  X,
} from "lucide-react";
import { ApiError, api } from "../../lib/api.js";
import type {
  ReviewSuggestion,
  SuggestionStatus,
  SuggestionValidationResult,
} from "../../lib/types.js";
import { ReviewPassPanel } from "./ReviewPassPanel.js";
import { ProfileSelect } from "./ProfileSelect.js";
import { streamRunEvents } from "../../lib/events.js";
import { navigate } from "../../app/App.js";

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
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [validations, setValidations] = useState<
    Record<string, SuggestionValidationResult | null>
  >({});
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
      setError(messageFor(err));
    }
  }

  useEffect(() => {
    void load();
    // Background poll is a fallback for the SSE channel below; the channel
    // does the heavy lifting whenever a profile / status event lands.
    const i = setInterval(load, 5_000);
    return () => clearInterval(i);
  }, [runId]);

  // Subscribe to the run's event stream so profile edits + suggestion/bundle
  // state changes refresh the list immediately instead of waiting for the
  // 5 s poll. Falls back to polling if the SSE channel drops.
  useEffect(() => {
    const handle = streamRunEvents(runId, (event) => {
      if (
        event.type === "suggestion.validation_profile_updated" ||
        event.type === "bundle.validation_profile_updated" ||
        event.type === "suggestion.created" ||
        event.type === "suggestion.applied" ||
        event.type === "suggestion.reverted" ||
        event.type === "suggestion.validation_passed" ||
        event.type === "suggestion.validation_failed" ||
        event.type === "bundle.applied" ||
        event.type === "bundle.reverted" ||
        event.type === "bundle.validation_passed" ||
        event.type === "bundle.validation_failed"
      ) {
        void load();
      }
    });
    return () => handle.close();
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
  async function apply(
    s: ReviewSuggestion,
    mode: "plain" | "validate" | "validate-revert" = "plain",
    profileName?: string | null,
  ) {
    if (mode === "validate-revert") {
      const ok =
        typeof window === "undefined" ||
        window.confirm(
          `If validation fails, Amaco will revert the patch for "${s.title}" in the run worktree (git apply -R, never push or merge). Continue?`,
        );
      if (!ok) return;
    }
    setBusy(s.id);
    try {
      await api.applySuggestion({
        runId,
        suggestionId: s.id,
        validateAfterApply: mode !== "plain",
        autoRevertOnValidationFail: mode === "validate-revert",
        // Only forward when actually validating; the server rejects this
        // combo otherwise.
        validationProfile:
          mode !== "plain" ? (profileName ?? s.validationProfile ?? null) : null,
      });
      await load();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(null);
    }
  }
  async function validate(s: ReviewSuggestion, profileName?: string | null) {
    setBusy(s.id);
    try {
      const r = await api.validateSuggestion({
        runId,
        suggestionId: s.id,
        validationProfile: profileName ?? s.validationProfile ?? null,
      });
      setValidations((prev) => ({ ...prev, [s.id]: r.result }));
      await load();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(null);
    }
  }
  async function updateProfile(
    s: ReviewSuggestion,
    next: string | null,
  ): Promise<void> {
    if ((s.validationProfile ?? null) === next) return;
    setBusy(s.id);
    try {
      await api.updateSuggestionProfile({
        runId,
        suggestionId: s.id,
        validationProfile: next,
      });
      await load();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(null);
    }
  }
  async function revert(s: ReviewSuggestion) {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Revert suggestion "${s.title}" in the worktree? This runs git apply -R; the project root is never touched.`,
      )
    ) {
      return;
    }
    setBusy(s.id);
    try {
      await api.revertSuggestion({ runId, suggestionId: s.id });
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

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedIds = useMemo(() => [...selected], [selected]);

  async function createReviewPassFromSelection() {
    if (selectedIds.length === 0) return;
    const title = window.prompt(
      `Title for the review pass (${selectedIds.length} suggestion${selectedIds.length === 1 ? "" : "s"}):`,
      "Review pass",
    );
    if (!title) return;
    setBusy("create-bundle");
    try {
      await api.createBundle({
        runId,
        title,
        suggestionIds: selectedIds,
      });
      setSelected(new Set());
      setSelectMode(false);
      await load();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 text-[12px]">
      <header className="flex items-center gap-2">
        <Lightbulb className="h-3.5 w-3.5 text-amaco-accent" strokeWidth={1.5} />
        <span className="text-[12px] font-medium text-amaco-fg">Suggestions</span>
        <span className="amaco-mono text-[10.5px] text-amaco-fg-muted">
          {items.length}
        </span>
        <button
          type="button"
          onClick={() => {
            setSelectMode((v) => !v);
            setSelected(new Set());
          }}
          className={`ml-auto inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] ${
            selectMode
              ? "border-amaco-accent/50 bg-amaco-accent-soft/30 text-amaco-fg"
              : "border-amaco-border text-amaco-fg-dim hover:bg-amaco-panel-2"
          }`}
          title={
            selectMode
              ? "Exit selection"
              : "Select suggestions to group into a review pass"
          }
        >
          {selectMode ? (
            <CheckSquare className="h-3 w-3" strokeWidth={1.5} />
          ) : (
            <Square className="h-3 w-3" strokeWidth={1.5} />
          )}
          {selectMode ? `${selectedIds.length} selected` : "Select"}
        </button>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded border border-amaco-border p-1 text-amaco-fg-dim hover:bg-amaco-panel-2"
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

      {selectMode && selectedIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded border border-amaco-accent/40 bg-amaco-accent-soft/20 px-2 py-1.5 text-[11px]">
          <span className="text-amaco-fg">
            Group {selectedIds.length} suggestion
            {selectedIds.length === 1 ? "" : "s"} into a review pass.
          </span>
          <button
            type="button"
            onClick={() => void createReviewPassFromSelection()}
            disabled={busy !== null}
            className="ml-auto rounded border border-amaco-accent/40 bg-amaco-accent-soft/30 px-2 py-0.5 text-[11px] text-amaco-fg hover:bg-amaco-accent-soft/50 disabled:opacity-50"
          >
            New review pass…
          </button>
        </div>
      ) : null}

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
              runId={runId}
              busy={busy === s.id}
              selectMode={selectMode}
              selected={selected.has(s.id)}
              onToggleSelect={() => toggleSelected(s.id)}
              validation={validations[s.id] ?? null}
              onApprove={() => approve(s)}
              onReject={() => reject(s)}
              onApply={(mode, profile) => apply(s, mode, profile)}
              onValidate={(profile) => validate(s, profile)}
              onRevert={() => revert(s)}
              onProfileChange={(p) => updateProfile(s, p)}
            />
          ))}
        </ul>
      )}

      <ReviewPassPanel
        runId={runId}
        suggestions={items}
        onChange={() => void load()}
      />
    </div>
  );
}

function Row({
  s,
  runId,
  busy,
  selectMode,
  selected,
  onToggleSelect,
  validation,
  onApprove,
  onReject,
  onApply,
  onValidate,
  onRevert,
  onProfileChange,
}: {
  s: ReviewSuggestion;
  runId: string;
  busy: boolean;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  validation: SuggestionValidationResult | null;
  onApprove: () => void;
  onReject: () => void;
  onApply: (
    mode: "plain" | "validate" | "validate-revert",
    profileName?: string | null,
  ) => void;
  onValidate: (profileName?: string | null) => void;
  onRevert: () => void;
  onProfileChange: (next: string | null) => void;
}) {
  // The row's "profile" mirrors what's persisted on the suggestion. Editing
  // PATCHes immediately (via onProfileChange) so this dropdown is the
  // canonical edit affordance — the Validate / Apply buttons read from
  // s.validationProfile via props on the next render.
  const [profile, setProfile] = useState<string | null>(s.validationProfile);
  useEffect(() => {
    setProfile(s.validationProfile);
  }, [s.validationProfile]);

  const isApplied =
    s.status === "applied" ||
    s.status === "validation_passed" ||
    s.status === "validation_failed";

  return (
    <li className="rounded border border-amaco-border bg-amaco-panel-2 px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-2">
        {selectMode ? (
          <button
            type="button"
            onClick={onToggleSelect}
            className="rounded p-0.5 text-amaco-fg-dim hover:bg-amaco-panel"
            aria-label={selected ? "Deselect" : "Select"}
          >
            {selected ? (
              <CheckSquare
                className="h-3.5 w-3.5 text-amaco-accent"
                strokeWidth={1.5}
              />
            ) : (
              <Square className="h-3.5 w-3.5" strokeWidth={1.5} />
            )}
          </button>
        ) : null}
        <StatusBadge status={s.status} />
        <span className="amaco-mono rounded border border-amaco-border px-1 text-[10px] text-amaco-fg-muted">
          {s.source}
        </span>
        {s.bundleId ? (
          <span
            className="amaco-mono rounded border border-amaco-accent/40 px-1 text-[10px] text-amaco-accent"
            title={`Part of review pass ${s.bundleId}`}
          >
            review pass
          </span>
        ) : null}
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
      {validation ? <ValidationBlock result={validation} /> : null}
      {s.status === "approved" || isApplied ? (
        <div className="mt-1.5 space-y-0.5">
          <ProfileSelect
            value={profile}
            onChange={(next) => {
              // Optimistic local state so the preview updates immediately;
              // PATCH happens via onProfileChange and the parent reload
              // brings everything back into sync.
              setProfile(next);
              onProfileChange(next);
            }}
            suggestedFromMarker={
              s.source === "reviewer" ||
              s.source === "verifier" ||
              s.source === "artifact"
                ? s.validationProfile
                : null
            }
          />
          <p className="text-[10px] text-amaco-fg-muted">
            Editing only changes future validation runs. It does not re-run
            validation.
          </p>
        </div>
      ) : null}
      <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
        {s.status === "open" ? (
          <>
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
          </>
        ) : null}
        {s.status === "approved" && s.proposedPatch ? (
          <ApplyMenu
            busy={busy}
            onApply={(mode) => onApply(mode, profile)}
          />
        ) : null}
        {isApplied ? (
          <>
            <button
              type="button"
              onClick={() => onValidate(profile)}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded border border-amaco-border bg-amaco-panel-2 px-1.5 py-0.5 text-amaco-fg-dim hover:bg-amaco-panel disabled:opacity-50"
              title="Run commands.validate inside the run worktree"
            >
              <Wrench className="h-3 w-3" strokeWidth={1.5} />
              Validate
            </button>
            <button
              type="button"
              onClick={onRevert}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded border border-amaco-warn/40 bg-amaco-warn/10 px-1.5 py-0.5 text-amaco-warn hover:bg-amaco-warn/15 disabled:opacity-50"
              title="Revert this suggestion's patch via git apply -R"
            >
              <RotateCcw className="h-3 w-3" strokeWidth={1.5} />
              Revert
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={() =>
            navigate({
              kind: "run",
              runId,
              tab: "replay",
              replayFocus: { kind: "match", match: { kind: "suggestion", id: s.id } },
            })
          }
          className="ml-auto inline-flex items-center gap-1 rounded border border-amaco-border bg-amaco-panel-2 px-1.5 py-0.5 text-amaco-fg-dim hover:bg-amaco-panel"
          title="Jump to this suggestion in the read-only Replay timeline"
        >
          <History className="h-3 w-3" strokeWidth={1.5} />
          Replay
        </button>
      </div>
    </li>
  );
}

function ValidationBlock({ result }: { result: SuggestionValidationResult }) {
  if (result.status === "no_commands_configured") {
    return (
      <div className="mt-1.5 rounded border border-amaco-warn/40 bg-amaco-warn/10 px-2 py-1 text-[11px] text-amaco-warn">
        No `commands.validate` configured. Run{" "}
        <span className="amaco-mono">amaco config set commands.validate '["pnpm test"]'</span>.
      </div>
    );
  }
  const ok = result.status === "passed";
  return (
    <div
      className={`mt-1.5 rounded border px-2 py-1 text-[11px] ${
        ok
          ? "border-amaco-success/40 bg-amaco-success/10 text-amaco-success"
          : "border-amaco-fail/40 bg-amaco-fail/10 text-amaco-fail"
      }`}
    >
      <div>
        Validation {ok ? "passed" : "failed"}: {result.summary.passed}/
        {result.summary.total} commands.
      </div>
      {!ok ? (
        <ul className="mt-1 space-y-0.5">
          {result.commands
            .filter((c) => c.status === "failed")
            .map((c, i) => (
              <li key={i} className="amaco-mono text-[10.5px]">
                {c.command} → exit {c.exitCode}
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}

function StatusBadge({ status }: { status: SuggestionStatus }) {
  const tone =
    status === "applied" ||
    status === "approved" ||
    status === "validation_passed"
      ? "border-amaco-success/40 text-amaco-success"
      : status === "rejected" ||
          status === "failed" ||
          status === "validation_failed" ||
          status === "revert_failed"
        ? "border-amaco-fail/40 text-amaco-fail"
        : status === "resolved" || status === "reverted"
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

function ApplyMenu({
  busy,
  onApply,
}: {
  busy: boolean;
  onApply: (mode: "plain" | "validate" | "validate-revert") => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <div className="inline-flex divide-x divide-amaco-accent/40 overflow-hidden rounded border border-amaco-accent/40 bg-amaco-accent-soft/30">
        <button
          type="button"
          onClick={() => onApply("plain")}
          disabled={busy}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-amaco-fg hover:bg-amaco-accent-soft/50 disabled:opacity-50"
        >
          <CheckCircle2 className="h-3 w-3" strokeWidth={1.5} />
          Apply patch
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={busy}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="More apply options"
          className="inline-flex items-center px-1 py-0.5 text-amaco-fg hover:bg-amaco-accent-soft/50 disabled:opacity-50"
        >
          ▾
        </button>
      </div>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 w-72 rounded border border-amaco-border bg-amaco-panel shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onApply("plain");
            }}
            className="block w-full px-3 py-1.5 text-left text-[11.5px] hover:bg-amaco-panel-2"
          >
            <div className="text-amaco-fg">Apply</div>
            <div className="text-[10.5px] text-amaco-fg-muted">
              Just apply the patch.
            </div>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onApply("validate");
            }}
            className="block w-full px-3 py-1.5 text-left text-[11.5px] hover:bg-amaco-panel-2"
          >
            <div className="text-amaco-fg">Apply &amp; validate</div>
            <div className="text-[10.5px] text-amaco-fg-muted">
              After apply, run commands.validate against the worktree.
            </div>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onApply("validate-revert");
            }}
            className="block w-full border-t border-amaco-border px-3 py-1.5 text-left text-[11.5px] hover:bg-amaco-panel-2"
          >
            <div className="text-amaco-fg">
              Apply, validate, revert if validation fails
            </div>
            <div className="text-[10.5px] text-amaco-warn">
              If validation fails, Amaco will attempt to revert the patch in the
              run worktree (git apply -R, never push or merge).
            </div>
          </button>
        </div>
      ) : null}
    </div>
  );
}

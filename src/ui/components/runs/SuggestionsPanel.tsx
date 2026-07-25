import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
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
import { Button } from "../design/Button.js";
import { IconBtn } from "../design/IconBtn.js";
import { Chip, type ChipTone } from "../design/Chip.js";
import { FormField } from "../design/FormField.js";

// Canonical input recipe (primitives-contract §6).
const INPUT =
  "w-full rounded-[14px] border border-[color:var(--line-strong)] bg-coal-800 px-3 py-2.5 text-[13px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none";

// Intent-tinted ghost recipe (primitives-contract §4), the same shape used
// for the Approve/Reject decision pair on Mission Control
// (MissionControlPage.tsx:349-351) - a dense, borderless tint rather than the
// framed `design/Button`, since Button has no per-status (affirm/warn/fail)
// color variant.
const INTENT_BTN =
  "inline-flex items-center gap-1 rounded-[10px] px-1.5 py-0.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

type Props = {
  runId: string;
  /** When set, the new-suggestion form prefills with these values. */
  prefill?: {
    file: string | null;
    lineStart: number | null;
    lineEnd: number | null;
  } | null;
  /** When true, write-side actions (approve/apply/validate/revert) are
   * hidden - the server refuses them with 409 anyway, but hiding the
   * controls keeps the surface honest about what's possible. */
  readOnly?: boolean;
};

export function SuggestionsPanel({ runId, prefill, readOnly }: Props) {
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
          `If validation fails, Vibestrate will revert the patch for "${s.title}" in the run worktree (git apply -R, never push or merge). Continue?`,
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
        <Lightbulb className="h-3.5 w-3.5 text-violet-soft" strokeWidth={1.5} />
        <span className="text-[12px] font-medium text-chalk-100">Suggestions</span>
        <span className="font-mono text-[10.5px] text-chalk-400">
          {items.length}
        </span>
        <button
          type="button"
          onClick={() => {
            setSelectMode((v) => !v);
            setSelected(new Set());
          }}
          className={`ml-auto ${INTENT_BTN} ${
            selectMode
              ? "bg-violet-soft/15 text-violet-soft hover:bg-violet-soft/25"
              : "text-chalk-300 hover:bg-coal-500 hover:text-chalk-100"
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
        <IconBtn variant="plain" title="Refresh" onClick={() => void load()}>
          <RefreshCw className="h-3 w-3" strokeWidth={1.5} />
        </IconBtn>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setCreating((v) => !v)}
          iconLeft={<Plus className="h-3 w-3" strokeWidth={1.5} />}
        >
          New
        </Button>
      </header>

      {selectMode && selectedIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-[10px] border border-violet-soft/30 bg-violet-soft/10 px-2 py-1.5 text-[11px]">
          <span className="text-chalk-100">
            Group {selectedIds.length} suggestion
            {selectedIds.length === 1 ? "" : "s"} into a review pass.
          </span>
          <Button
            variant="primary"
            size="sm"
            className="ml-auto"
            disabled={busy !== null}
            onClick={() => void createReviewPassFromSelection()}
          >
            New review pass…
          </Button>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-[11.5px] text-rose-300">
          {error}
        </div>
      ) : null}

      {creating ? (
        <form
          onSubmit={submitDraft}
          className="space-y-2 rounded-[14px] border border-[color:var(--line)] bg-coal-600 p-3 text-[11.5px]"
        >
          <FormField label="Title">
            <input
              value={draft.title}
              onChange={(e) =>
                setDraft((d) => ({ ...d, title: e.target.value }))
              }
              placeholder="Title (required)"
              className={INPUT}
            />
          </FormField>
          <div className="flex gap-1.5">
            <div className="flex-1">
              <FormField label="File">
                <input
                  value={draft.file}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, file: e.target.value }))
                  }
                  placeholder="src/foo.ts"
                  className={INPUT}
                />
              </FormField>
            </div>
            <div className="w-24">
              <FormField label="Line start">
                <input
                  value={draft.lineStart}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, lineStart: e.target.value }))
                  }
                  placeholder="line start"
                  className={INPUT}
                />
              </FormField>
            </div>
            <div className="w-24">
              <FormField label="Line end">
                <input
                  value={draft.lineEnd}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, lineEnd: e.target.value }))
                  }
                  placeholder="line end"
                  className={INPUT}
                />
              </FormField>
            </div>
          </div>
          <FormField label="Description">
            <textarea
              value={draft.body}
              onChange={(e) =>
                setDraft((d) => ({ ...d, body: e.target.value }))
              }
              placeholder="Describe what should change…"
              rows={3}
              className={`resize-none ${INPUT}`}
            />
          </FormField>
          <FormField label="Proposed patch">
            <textarea
              value={draft.proposedPatch}
              onChange={(e) =>
                setDraft((d) => ({ ...d, proposedPatch: e.target.value }))
              }
              placeholder="Optional unified diff (will require approval before apply)"
              rows={4}
              className={`resize-none font-mono text-[11px] ${INPUT}`}
            />
          </FormField>
          <div className="flex gap-1.5">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={busy !== null}
            >
              Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCreating(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {items.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-[color:var(--line)] px-3 py-4 text-center text-[11.5px] text-chalk-400">
          No suggestions yet. Reviewer/verifier `VIBESTRATE_SUGGESTION` blocks
          land here, plus anything you create manually.
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
              readOnly={readOnly ?? false}
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
  readOnly,
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
  readOnly: boolean;
}) {
  // The row's "profile" mirrors what's persisted on the suggestion. Editing
  // PATCHes immediately (via onProfileChange) so this dropdown is the
  // canonical edit affordance - the Validate / Apply buttons read from
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
    <li className="rounded-[14px] border border-[color:var(--line)] bg-coal-600 px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-2">
        {selectMode ? (
          <button
            type="button"
            onClick={onToggleSelect}
            className="rounded-[8px] p-0.5 text-chalk-300 hover:bg-coal-500"
            aria-label={selected ? "Deselect" : "Select"}
          >
            {selected ? (
              <CheckSquare
                className="h-3.5 w-3.5 text-violet-soft"
                strokeWidth={1.5}
              />
            ) : (
              <Square className="h-3.5 w-3.5" strokeWidth={1.5} />
            )}
          </button>
        ) : null}
        <StatusBadge status={s.status} />
        <span className="rounded-[6px] border border-[color:var(--line)] px-1 font-mono text-[10px] text-chalk-400">
          {s.source}
        </span>
        {s.bundleId ? (
          <span
            className="rounded-[6px] border border-violet-soft/40 px-1 font-mono text-[10px] text-violet-soft"
            title={`Part of review pass ${s.bundleId}`}
          >
            review pass
          </span>
        ) : null}
        <span className="font-medium text-chalk-100">{s.title}</span>
        {s.file ? (
          <span className="ml-auto truncate font-mono text-[10.5px] text-chalk-400">
            {s.file}
            {s.lineStart ? `:${s.lineStart}` : ""}
            {s.lineEnd ? `-${s.lineEnd}` : ""}
          </span>
        ) : null}
      </div>
      {s.body ? (
        <p className="mt-1 whitespace-pre-wrap text-[11.5px] text-chalk-300">
          {s.body}
        </p>
      ) : null}
      {s.proposedPatch ? (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[10.5px] text-chalk-400">
            proposed patch ({s.proposedPatch.split("\n").length} lines)
          </summary>
          <pre className="mt-1 max-h-48 overflow-auto rounded-[10px] border border-[color:var(--line)] bg-coal-800 px-2 py-1.5 font-mono text-[10.5px] text-chalk-100">
            {s.proposedPatch}
          </pre>
        </details>
      ) : null}
      {s.errorMessage ? (
        <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-rose-300">
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
          <p className="text-[10px] text-chalk-400">
            Editing only changes future validation runs. It does not re-run
            validation.
          </p>
        </div>
      ) : null}
      <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
        {readOnly ? (
          <span
            className="inline-flex items-center gap-1 rounded-[10px] border border-amber-soft/40 bg-amber-soft/10 px-1.5 py-0.5 text-[10.5px] text-amber-soft"
            title="This run is read-only. Apply / Validate / Revert are disabled. Start a non-read-only run on the same task to act on this suggestion."
          >
            read-only run - actions disabled
          </span>
        ) : (
          <>
            {s.status === "open" ? (
              <>
                <button
                  type="button"
                  onClick={onApprove}
                  disabled={busy}
                  className={`${INTENT_BTN} bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25`}
                >
                  <Check className="h-3 w-3" strokeWidth={1.5} />
                  Approve
                </button>
                <button
                  type="button"
                  onClick={onReject}
                  disabled={busy}
                  className={`${INTENT_BTN} bg-rose-500/15 text-rose-300 hover:bg-rose-500/25`}
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
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => onValidate(profile)}
                  title="Run commands.validate inside the run worktree"
                  iconLeft={<Wrench className="h-3 w-3" strokeWidth={1.5} />}
                >
                  Validate
                </Button>
                <button
                  type="button"
                  onClick={onRevert}
                  disabled={busy}
                  title="Revert this suggestion's patch via git apply -R"
                  className={`${INTENT_BTN} bg-amber-soft/15 text-amber-soft hover:bg-amber-soft/25`}
                >
                  <RotateCcw className="h-3 w-3" strokeWidth={1.5} />
                  Revert
                </button>
              </>
            ) : null}
          </>
        )}
        <Button
          variant="secondary"
          size="sm"
          className="ml-auto"
          title="Jump to this suggestion in the read-only Replay timeline"
          onClick={() =>
            navigate({
              kind: "run",
              runId,
              tab: "replay",
              replayFocus: { kind: "match", match: { kind: "suggestion", id: s.id } },
            })
          }
          iconLeft={<History className="h-3 w-3" strokeWidth={1.5} />}
        >
          Replay
        </Button>
      </div>
    </li>
  );
}

function ValidationBlock({ result }: { result: SuggestionValidationResult }) {
  if (result.status === "no_commands_configured") {
    return (
      <div className="mt-1.5 rounded-[10px] border border-amber-soft/40 bg-amber-soft/10 px-2 py-1 text-[11px] text-amber-soft">
        No `commands.validate` configured. Run{" "}
        <span className="font-mono text-[12.5px]">
          vibe config set commands.validate '["pnpm test"]'
        </span>
        .
      </div>
    );
  }
  const ok = result.status === "passed";
  return (
    <div
      className={`mt-1.5 rounded-[10px] border px-2 py-1 text-[11px] ${
        ok
          ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-400"
          : "border-rose-400/40 bg-rose-500/10 text-rose-300"
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
              <li key={i} className="font-mono text-[10.5px]">
                {c.command} → exit {c.exitCode}
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}

// Mirrors the original cascading-ternary bucket order exactly (success ->
// fail -> neutral -> default violet) so unhandled statuses keep the same
// fallback tone as before this migration.
const SUGGESTION_STATUS_TONE: Record<SuggestionStatus, ChipTone> = {
  applied: "emerald",
  approved: "emerald",
  validation_passed: "emerald",
  rejected: "rose",
  failed: "rose",
  validation_failed: "rose",
  revert_failed: "rose",
  resolved: "neutral",
  reverted: "neutral",
  open: "violet",
  applying: "violet",
  reverted_after_validation_failed: "violet",
  validation_failed_revert_failed: "violet",
};

function StatusBadge({ status }: { status: SuggestionStatus }) {
  return (
    <Chip contained tone={SUGGESTION_STATUS_TONE[status] ?? "neutral"}>
      {status}
    </Chip>
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
      <div className="inline-flex divide-x divide-violet-soft/40 overflow-hidden rounded-[10px] border border-violet-soft/40 bg-violet-soft/15">
        <button
          type="button"
          onClick={() => onApply("plain")}
          disabled={busy}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-violet-soft hover:bg-violet-soft/25 disabled:opacity-50"
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
          className="inline-flex items-center px-1 py-0.5 text-violet-soft hover:bg-violet-soft/25 disabled:opacity-50"
        >
          <ChevronDown className="h-3 w-3" strokeWidth={1.5} />
        </button>
      </div>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 w-72 rounded-[14px] border border-[color:var(--line)] bg-coal-600 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onApply("plain");
            }}
            className="block w-full px-3 py-1.5 text-left text-[11.5px] hover:bg-coal-500"
          >
            <div className="text-chalk-100">Apply</div>
            <div className="text-[10.5px] text-chalk-400">
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
            className="block w-full px-3 py-1.5 text-left text-[11.5px] hover:bg-coal-500"
          >
            <div className="text-chalk-100">Apply &amp; validate</div>
            <div className="text-[10.5px] text-chalk-400">
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
            className="block w-full border-t border-[color:var(--line)] px-3 py-1.5 text-left text-[11.5px] hover:bg-coal-500"
          >
            <div className="text-chalk-100">
              Apply, validate, revert if validation fails
            </div>
            <div className="text-[10.5px] text-amber-soft">
              If validation fails, Vibestrate will attempt to revert the patch in the
              run worktree (git apply -R, never push or merge).
            </div>
          </button>
        </div>
      ) : null}
    </div>
  );
}

import { useEffect, useState } from "react";
import { ArrowRight, Plus, RefreshCw } from "lucide-react";
import {
  api,
  type LedgerEntryDto,
  type LedgerStateDto,
  type ManualLedgerEntryInput,
} from "../../lib/api.js";
import { Chip, type ChipTone } from "../design/Chip.js";
import { Button } from "../design/Button.js";
import { FormField } from "../design/FormField.js";
import { Select, type SelectOption } from "../design/Select.js";
import { useToast, ToastView } from "../design/useToast.js";
import { Skeleton, SkeletonBlock } from "../design/Skeleton.js";
import { cn } from "../design/cn.js";

// Must match MANUAL_ENTRY_TAG in src/core/context/project-ledger.ts - the UI
// bundle can't import server-side code, so the literal is duplicated here.
const MANUAL_TAG = "manual";

/**
 * The Ledger view - the continuity ledger (`vibe ledger` / GET /api/ledger),
 * folded into the Board page as its "Ledger" tab. It renders the append-only
 * log as the sections a returning session needs: what shipped, what's still
 * open, the follow-ups left behind, what was mentioned but never done, and
 * the decisions on record. Machine-written on merge-ready completion, plus a
 * hand-add path (this view's "Add entry" form / `vibe ledger add`) for noting
 * something no run captured - always tagged and rendered as added-by-hand so
 * it's never mistaken for run-derived evidence.
 *
 * Shell-less by design: the Board provides the page shell + header. This owns
 * only the scrolling body so it works inside the Board's `fill` PageShell.
 */
export function LedgerView({ onOpenRun }: { onOpenRun: (runId: string) => void }) {
  const [state, setState] = useState<LedgerStateDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const { toast, showToast } = useToast();

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.getLedger();
      setState(r.state);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  // Shared by the header button and the empty state's CTA - both open the
  // same form; a successful submit closes it, toasts, and reloads.
  async function handleAdd(input: ManualLedgerEntryInput) {
    await api.addLedgerEntry(input);
    setShowAdd(false);
    showToast({ kind: "ok", text: "Ledger entry added." });
    await load();
  }

  const sections: { title: string; entries: LedgerEntryDto[]; tone: ChipTone; empty: string }[] =
    state
      ? [
          { title: "Flagged - needs investigation", entries: state.flags, tone: "rose", empty: "" },
          { title: "Recently shipped", entries: state.shipped, tone: "emerald", empty: "Nothing shipped yet." },
          { title: "Open intents", entries: state.intents, tone: "violet", empty: "No open intents." },
          { title: "Follow-ups left behind", entries: state.residuals, tone: "amber", empty: "No outstanding follow-ups." },
          { title: "Mentioned, never worked on", entries: state.mentions, tone: "sky", empty: "Nothing mentioned-but-untouched." },
          { title: "Decisions on record", entries: state.decisions, tone: "neutral", empty: "No decisions recorded." },
        ]
      : [];

  // Resolve a flag's linked entry title across all sections (the dup/conflict
  // it points at), so the "link between the dupes" reads as a name, not an id.
  const titleById = new Map<string, string>();
  if (state) {
    for (const list of [state.shipped, state.intents, state.residuals, state.mentions, state.decisions]) {
      for (const e of list) titleById.set(e.id, e.title);
    }
  }

  const total = state
    ? state.shipped.length +
      state.intents.length +
      state.residuals.length +
      state.mentions.length +
      state.decisions.length +
      state.flags.length
    : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* A contained header row for the ledger's own explainer + refresh - the
          page title (Board) + segmented control live above in the PageHeader. */}
      <div className="mb-4 flex shrink-0 items-start justify-between gap-3 rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-chalk-100">
            Where the project stands
          </h2>
          <p className="mt-1 max-w-[70ch] text-[13px] leading-[1.55] text-chalk-300">
            The project's continuity ledger - what shipped, what's still open,
            and what was decided - so a new session (or you, next week) can pick
            up the thread. Machine-written when a run reaches merge-ready, and
            hand-addable here. The same view backs{" "}
            <span className="mono text-chalk-100">vibe ledger</span>.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowAdd((v) => !v)}
            iconLeft={<Plus className="h-3.5 w-3.5" strokeWidth={2} />}
          >
            Add entry
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void load()}
            iconLeft={<RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} strokeWidth={1.9} />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {showAdd ? (
        <AddLedgerEntryForm onSubmit={handleAdd} onCancel={() => setShowAdd(false)} />
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {error ? (
          <div className="mb-4 rounded-[12px] border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-300">
            {error}
          </div>
        ) : null}

        {!state && !error ? (
          // The six sections are all derived from `state`, so a null state
          // rendered a page with nothing on it at all.
          <Skeleton label="Loading the ledger" className="flex flex-col gap-5">
            {[0, 1, 2].map((s) => (
              <div key={s}>
                <div className="mb-2 flex items-center gap-2">
                  <SkeletonBlock h={14} w={[112, 88, 132][s]} />
                  <SkeletonBlock h={16} w={26} radius={8} />
                </div>
                <div className="flex flex-col gap-2">
                  {[0, 1].map((r) => (
                    <div
                      key={r}
                      className="rounded-[14px] border border-[color:var(--line-soft)] bg-coal-600 px-3.5 py-2.5"
                    >
                      <SkeletonBlock tone="text" h={12} w={`${[74, 56][r]}%`} />
                      <SkeletonBlock className="mt-1.5" tone="text" h={11} w={`${[42, 58][r]}%`} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </Skeleton>
        ) : null}

        {state && total === 0 && !error ? (
          <div className="flex flex-col items-start gap-3 rounded-[18px] border border-[color:var(--line)] bg-coal-600 px-4 py-6 text-[12.5px] text-chalk-300">
            <p>
              The ledger is empty. It fills in automatically as runs reach
              merge-ready - each one records what it shipped (and any
              follow-ups it left).
            </p>
            {!showAdd ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowAdd(true)}
                iconLeft={<Plus className="h-3.5 w-3.5" strokeWidth={2} />}
              >
                Add the first entry
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-5">
          {sections
            .filter((s) => s.entries.length > 0)
            .map((s) => (
              <section key={s.title}>
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="text-[13.5px] font-bold text-chalk-100">{s.title}</h3>
                  <Chip tone={s.tone}>{s.entries.length}</Chip>
                </div>
                <ul className="space-y-2">
                  {s.entries.map((e) => (
                    <LedgerRow
                      key={e.id}
                      entry={e}
                      onOpenRun={onOpenRun}
                      linkedTitle={e.relatesTo ? titleById.get(e.relatesTo) ?? null : null}
                    />
                  ))}
                </ul>
              </section>
            ))}
        </div>
      </div>

      <ToastView
        toast={toast}
        prefix="word"
        className="fixed bottom-4 right-4 z-30 rounded-[12px] border px-3.5 py-2 text-[12.5px] shadow-2xl"
      />
    </div>
  );
}

const MANUAL_KIND_OPTIONS: SelectOption[] = [
  { value: "intent", label: "Intent - an open goal" },
  { value: "residual", label: "Follow-up - left behind by other work" },
  { value: "decision", label: "Decision" },
  { value: "mention", label: "Mention - noted, never acted on" },
  { value: "shipped", label: "Shipped" },
];

const FORM_INPUT_CLS =
  "w-full rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 px-3 py-2 text-[13px] text-chalk-100 placeholder:text-chalk-400 outline-none focus:border-violet-soft/50";

/** The inline "Add entry" form - kind, title, optional detail, optional tags.
 *  `status` is deliberately not exposed here (the service defaults it
 *  per-kind); the CLI's `--status` flag covers the rarer override. */
function AddLedgerEntryForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (input: ManualLedgerEntryInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<ManualLedgerEntryInput["kind"]>("intent");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Title is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        kind,
        title: trimmedTitle,
        detail: detail.trim() || undefined,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4">
      <h3 className="mb-3 text-[13px] font-semibold text-violet-vivid">
        Add a ledger entry
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Kind">
          <Select
            value={kind}
            onChange={(v) => setKind(v as ManualLedgerEntryInput["kind"])}
            options={MANUAL_KIND_OPTIONS}
            ariaLabel="Entry kind"
          />
        </FormField>
        <FormField label="Tags (optional)">
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="comma, separated, tags"
            className={FORM_INPUT_CLS}
          />
        </FormField>
        <div className="sm:col-span-2">
          <FormField label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What happened, or what's still open"
              className={FORM_INPUT_CLS}
              autoFocus
            />
          </FormField>
        </div>
        <div className="sm:col-span-2">
          <FormField label="Detail (optional)">
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Optional longer detail"
              rows={3}
              className={cn(FORM_INPUT_CLS, "resize-y")}
            />
          </FormField>
        </div>
      </div>
      {error ? (
        <div className="mt-3 rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
          {error}
        </div>
      ) : null}
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={() => void submit()} disabled={busy}>
          {busy ? "Adding..." : "Add entry"}
        </Button>
      </div>
    </div>
  );
}

function LedgerRow({
  entry,
  onOpenRun,
  linkedTitle,
}: {
  entry: LedgerEntryDto;
  onOpenRun: (runId: string) => void;
  /** For flag entries: the title of the entry this one links (relatesTo). */
  linkedTitle?: string | null;
}) {
  const date = formatDate(entry.createdAt);
  return (
    <li className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4">
      <div className="flex items-start gap-2">
        {entry.kind === "flag" && entry.relation ? (
          <Chip tone={entry.relation === "conflict" ? "rose" : "amber"}>{entry.relation}</Chip>
        ) : null}
        <span className="text-[12.5px] text-chalk-100">{entry.title}</span>
        {/* Not sourceRunId-derived - a hand-added claim, never presented as
            run-verified evidence (mirrors the "(added by hand)" marker the
            CLI brief renders for the same entries). */}
        {entry.sourceRunId === null && entry.tags.includes(MANUAL_TAG) ? (
          <Chip tone="violet" contained>
            added by hand
          </Chip>
        ) : null}
        {entry.status !== "open" && entry.status !== "shipped" ? (
          <Chip tone={entry.status === "abandoned" ? "rose" : "neutral"}>{entry.status}</Chip>
        ) : null}
        <span className="ml-auto shrink-0 text-meta text-chalk-400">{date}</span>
      </div>
      {entry.kind === "flag" && entry.relatesTo ? (
        <p className="mt-1 text-meta text-chalk-400">
          linked to: <span className="text-chalk-300">{linkedTitle ?? entry.relatesTo}</span>
        </p>
      ) : null}
      {entry.detail ? (
        <p className="mt-1 whitespace-pre-wrap text-meta text-chalk-300">{entry.detail}</p>
      ) : null}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {entry.tags
          .filter((t) => t !== MANUAL_TAG)
          .map((t) => (
            <span key={t} className="text-meta text-chalk-400">
              #{t}
            </span>
          ))}
        {entry.sourceRunId ? (
          <button
            type="button"
            onClick={() => onOpenRun(entry.sourceRunId!)}
            className="ml-auto inline-flex items-center gap-1 text-meta text-chalk-300 transition hover:text-violet-soft"
          >
            open run <ArrowRight className="h-3 w-3" strokeWidth={1.7} />
          </button>
        ) : null}
      </div>
    </li>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

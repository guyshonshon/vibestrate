import { useEffect, useState } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import { api, type LedgerEntryDto, type LedgerStateDto } from "../../lib/api.js";
import { Chip, type ChipTone } from "../design/Chip.js";
import { Button } from "../design/Button.js";
import { cn } from "../design/cn.js";

/**
 * The Ledger view - the read-only continuity ledger (`vibe ledger` /
 * GET /api/ledger), folded into the Board page as its "Ledger" tab. It renders
 * the append-only log as the sections a returning session needs: what shipped,
 * what's still open, the follow-ups left behind, what was mentioned but never
 * done, and the decisions on record. Read-only; the ledger is machine-written on
 * merge-ready completion + editable by hand under `.vibestrate/`.
 *
 * Shell-less by design: the Board provides the page shell + header. This owns
 * only the scrolling body so it works inside the Board's `fill` PageShell.
 */
export function LedgerView({ onOpenRun }: { onOpenRun: (runId: string) => void }) {
  const [state, setState] = useState<LedgerStateDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
            editable by hand. The same view backs{" "}
            <span className="mono text-chalk-100">vibe ledger</span>.
          </p>
        </div>
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

      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {error ? (
          <div className="mb-4 rounded-[12px] border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-300">
            {error}
          </div>
        ) : null}

        {state && total === 0 && !error ? (
          <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 px-4 py-6 text-[12.5px] text-chalk-300">
            The ledger is empty. It fills in as runs reach merge-ready - each one
            records what it shipped (and any follow-ups it left). You can also add
            entries by hand under <span className="mono text-chalk-100">.vibestrate/</span>.
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
        {entry.status !== "open" && entry.status !== "shipped" ? (
          <Chip tone={entry.status === "abandoned" ? "rose" : "neutral"}>{entry.status}</Chip>
        ) : null}
        <span className="ml-auto shrink-0 text-[10.5px] text-chalk-400">{date}</span>
      </div>
      {entry.kind === "flag" && entry.relatesTo ? (
        <p className="mt-1 text-[11px] text-chalk-400">
          linked to: <span className="text-chalk-300">{linkedTitle ?? entry.relatesTo}</span>
        </p>
      ) : null}
      {entry.detail ? (
        <p className="mt-1 whitespace-pre-wrap text-[11.5px] text-chalk-300">{entry.detail}</p>
      ) : null}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {entry.tags.map((t) => (
          <span key={t} className="text-[10.5px] text-chalk-400">
            #{t}
          </span>
        ))}
        {entry.sourceRunId ? (
          <button
            type="button"
            onClick={() => onOpenRun(entry.sourceRunId!)}
            className="ml-auto inline-flex items-center gap-1 text-[10.5px] text-chalk-300 transition hover:text-violet-soft"
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

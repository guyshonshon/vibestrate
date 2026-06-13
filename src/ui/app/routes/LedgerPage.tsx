import { useEffect, useState } from "react";
import { ArrowRight, BookMarked, RefreshCw } from "lucide-react";
import { api, type LedgerEntryDto, type LedgerStateDto } from "../../lib/api.js";
import { Chip, type ChipTone } from "../../components/design/Chip.js";
import { cn } from "../../components/design/cn.js";

/**
 * T9 Ledger page - the read-only dashboard surface of the project continuity
 * ledger (`vibe ledger` / GET /api/ledger). It folds the append-only log into
 * the five sections a returning session needs: what shipped, what's still open,
 * the follow-ups left behind, what was mentioned but never done, and the
 * decisions on record. Read-only; the ledger is machine-written on
 * merge-ready completion + editable by hand under `.vibestrate/`.
 */
export function LedgerPage({ onOpenRun }: { onOpenRun: (runId: string) => void }) {
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
          { title: "Recently shipped", entries: state.shipped, tone: "emerald", empty: "Nothing shipped yet." },
          { title: "Open intents", entries: state.intents, tone: "violet", empty: "No open intents." },
          { title: "Follow-ups left behind", entries: state.residuals, tone: "amber", empty: "No outstanding follow-ups." },
          { title: "Mentioned, never worked on", entries: state.mentions, tone: "sky", empty: "Nothing mentioned-but-untouched." },
          { title: "Decisions on record", entries: state.decisions, tone: "neutral", empty: "No decisions recorded." },
        ]
      : [];

  const total = state
    ? state.shipped.length +
      state.intents.length +
      state.residuals.length +
      state.mentions.length +
      state.decisions.length
    : 0;

  return (
    <div className="relative z-10 mx-auto max-w-4xl px-8 pt-6 pb-16 fade-up">
      <section className="mt-1 flex items-start justify-between gap-3">
        <div>
          <div className="eyebrow mb-1.5 flex items-center gap-1.5">
            <BookMarked className="h-3 w-3" strokeWidth={1.8} /> Ledger
          </div>
          <h1 className="text-display text-[21px] sm:text-[23px] leading-[1.2]">
            Where the project stands
          </h1>
          <p className="text-fog-300 text-[13px] mt-1.5 max-w-[70ch]">
            The project's continuity ledger - what shipped, what's still open,
            and what was decided - so a new session (or you, next week) can pick
            up the thread. Machine-written when a run reaches merge-ready, and
            editable by hand. The same view backs <span className="mono">vibe ledger</span>.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="mt-1 h-7 w-7 shrink-0 rounded-md border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] flex items-center justify-center disabled:opacity-50"
          aria-label="Refresh"
        >
          <RefreshCw className={cn("h-3.5 w-3.5 text-fog-300", busy && "animate-spin")} strokeWidth={1.7} />
        </button>
      </section>

      {error ? (
        <div className="mt-4 rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
          {error}
        </div>
      ) : null}

      {state && total === 0 && !error ? (
        <div className="mt-6 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-6 text-[12.5px] text-fog-400">
          The ledger is empty. It fills in as runs reach merge-ready - each one
          records what it shipped (and any follow-ups it left). You can also add
          entries by hand under <span className="mono">.vibestrate/</span>.
        </div>
      ) : null}

      <div className="mt-5 space-y-5">
        {sections
          .filter((s) => s.entries.length > 0)
          .map((s) => (
            <section key={s.title}>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-[13px] font-medium text-fog-100">{s.title}</h2>
                <Chip tone={s.tone}>{s.entries.length}</Chip>
              </div>
              <ul className="space-y-2">
                {s.entries.map((e) => (
                  <LedgerRow key={e.id} entry={e} onOpenRun={onOpenRun} />
                ))}
              </ul>
            </section>
          ))}
      </div>
    </div>
  );
}

function LedgerRow({
  entry,
  onOpenRun,
}: {
  entry: LedgerEntryDto;
  onOpenRun: (runId: string) => void;
}) {
  const date = formatDate(entry.createdAt);
  return (
    <li className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
      <div className="flex items-start gap-2">
        <span className="text-[12.5px] text-fog-100">{entry.title}</span>
        {entry.status !== "open" && entry.status !== "shipped" ? (
          <Chip tone={entry.status === "abandoned" ? "rose" : "neutral"}>{entry.status}</Chip>
        ) : null}
        <span className="ml-auto shrink-0 text-[10.5px] text-fog-600">{date}</span>
      </div>
      {entry.detail ? (
        <p className="mt-1 text-[11.5px] text-fog-400 whitespace-pre-wrap">{entry.detail}</p>
      ) : null}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {entry.tags.map((t) => (
          <span key={t} className="text-[10.5px] text-fog-500">
            #{t}
          </span>
        ))}
        {entry.sourceRunId ? (
          <button
            type="button"
            onClick={() => onOpenRun(entry.sourceRunId!)}
            className="ml-auto inline-flex items-center gap-1 text-[10.5px] text-fog-400 hover:text-violet-300"
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

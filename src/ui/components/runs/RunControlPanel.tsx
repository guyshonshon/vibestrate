import { useEffect, useState } from "react";
import { Layers, MessageSquarePlus, Send } from "lucide-react";
import { api } from "../../lib/api.js";
import type { RunControlDirective, RunStatus } from "../../lib/types.js";

const TERMINAL: ReadonlySet<RunStatus> = new Set([
  "merge_ready",
  "failed",
  "aborted",
]);

/**
 * Between-stage control surface for an active run. Lets the user:
 *   - inject a free-text note the next agent will see in its prompt
 *   - request a context compaction (next agent re-states understanding)
 *
 * Directives are queued and applied at the next stage boundary; the
 * `control.applied` event surfaces in the run replay. Disabled for
 * terminal runs (nothing left to influence).
 */
export function RunControlPanel({
  runId,
  status,
}: {
  runId: string;
  status: RunStatus;
}) {
  const [pending, setPending] = useState<RunControlDirective[]>([]);
  const [history, setHistory] = useState<RunControlDirective[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"note" | "compact" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const disabled = TERMINAL.has(status);

  async function refresh() {
    try {
      const r = await api.listRunControl(runId);
      setPending(r.pending);
      setHistory(
        r.directives.filter((d) => d.consumedAt).slice(-5).reverse(),
      );
    } catch {
      /* best-effort */
    }
  }

  useEffect(() => {
    // Skip polling entirely on terminal runs — nothing can change,
    // and a stale runId would otherwise spam 404s into the console.
    if (disabled) {
      void refresh();
      return;
    }
    void refresh();
    const id = window.setInterval(refresh, 3000);
    return () => window.clearInterval(id);
  }, [runId, disabled]);

  async function submitNote() {
    const body = note.trim();
    if (!body) return;
    setBusy("note");
    setError(null);
    setOk(null);
    try {
      await api.sendRunControl(runId, { kind: "inject-note", body });
      setNote("");
      setOk("Note queued. The next agent will see it in its prompt.");
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function submitCompact() {
    setBusy("compact");
    setError(null);
    setOk(null);
    try {
      await api.sendRunControl(runId, { kind: "compact" });
      setOk(
        "Compaction queued. The next agent will re-state its understanding before continuing.",
      );
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      aria-label="Run controls"
      className="rounded border border-vibestrate-border bg-vibestrate-panel p-3"
    >
      <header className="mb-2 flex items-center gap-2">
        <Layers
          className="h-3.5 w-3.5 text-vibestrate-accent"
          strokeWidth={1.5}
          aria-hidden
        />
        <span className="vibestrate-mono text-[10.5px] uppercase tracking-[0.14em] text-vibestrate-fg-muted">
          run control
        </span>
        {pending.length > 0 ? (
          <span
            className="vibestrate-mono rounded border border-vibestrate-accent/40 bg-vibestrate-accent/10 px-1.5 py-0.5 text-[10px] text-vibestrate-accent"
            title="Directives queued, waiting for next stage"
          >
            {pending.length} queued
          </span>
        ) : null}
      </header>

      <p className="mb-2 text-[11.5px] text-vibestrate-fg-muted">
        These controls apply at the next stage boundary — providers like
        Claude Code <code className="vibestrate-mono">-p</code> don't have a
        live REPL we can pipe commands into mid-flight.
      </p>

      {/* Inject-note */}
      <div className="flex flex-col gap-1.5">
        <label className="vibestrate-mono text-[10.5px] uppercase tracking-[0.12em] text-vibestrate-fg-muted">
          inject note
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (
              (e.metaKey || e.ctrlKey) &&
              e.key === "Enter" &&
              note.trim().length > 0
            ) {
              e.preventDefault();
              void submitNote();
            }
          }}
          disabled={disabled || busy !== null}
          rows={3}
          placeholder="A constraint, hint, or course-correction the next agent should respect…"
          className="resize-y rounded border border-vibestrate-border bg-vibestrate-panel-2 px-2 py-1.5 text-[12px] text-vibestrate-fg placeholder:text-vibestrate-fg-muted focus:border-vibestrate-accent focus:outline-none disabled:opacity-50"
          aria-label="Note for the next agent"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={submitNote}
            disabled={disabled || busy !== null || note.trim().length === 0}
            className="inline-flex items-center gap-1 rounded border border-vibestrate-accent/40 bg-vibestrate-accent/10 px-2 py-1 text-[11.5px] font-medium text-vibestrate-accent hover:bg-vibestrate-accent/20 disabled:opacity-50"
          >
            <MessageSquarePlus className="h-3 w-3" strokeWidth={1.8} aria-hidden />
            {busy === "note" ? "Queueing…" : "Queue note"}
          </button>
          <button
            type="button"
            onClick={submitCompact}
            disabled={disabled || busy !== null}
            className="inline-flex items-center gap-1 rounded border border-vibestrate-warn/40 bg-vibestrate-warn/10 px-2 py-1 text-[11.5px] font-medium text-vibestrate-warn hover:bg-vibestrate-warn/20 disabled:opacity-50"
            title="Ask the next agent to re-state its understanding before continuing"
          >
            <Send className="h-3 w-3" strokeWidth={1.8} aria-hidden />
            {busy === "compact" ? "Queueing…" : "Compact context"}
          </button>
          <span className="vibestrate-mono ml-auto text-[10px] text-vibestrate-fg-muted">
            ⌘↵ to queue note
          </span>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-2 rounded border border-vibestrate-fail/40 bg-vibestrate-fail/10 px-2 py-1 text-[11px] text-vibestrate-fail"
        >
          {error}
        </div>
      ) : null}
      {ok ? (
        <div
          role="status"
          className="mt-2 rounded border border-vibestrate-success/40 bg-vibestrate-success/10 px-2 py-1 text-[11px] text-vibestrate-success"
        >
          {ok}
        </div>
      ) : null}

      {/* Queued + recent applied */}
      {pending.length > 0 ? (
        <details open className="mt-3">
          <summary className="cursor-pointer text-[10.5px] uppercase tracking-[0.12em] text-vibestrate-fg-muted">
            queued ({pending.length})
          </summary>
          <ul className="mt-1 space-y-1">
            {pending.map((d) => (
              <DirectiveRow key={d.id} d={d} />
            ))}
          </ul>
        </details>
      ) : null}
      {history.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-[10.5px] uppercase tracking-[0.12em] text-vibestrate-fg-muted">
            recently applied ({history.length})
          </summary>
          <ul className="mt-1 space-y-1">
            {history.map((d) => (
              <DirectiveRow key={d.id} d={d} />
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function DirectiveRow({ d }: { d: RunControlDirective }) {
  const tone =
    d.kind === "compact"
      ? "border-vibestrate-warn/40 bg-vibestrate-warn/5 text-vibestrate-warn"
      : "border-vibestrate-accent/30 bg-vibestrate-accent/5 text-vibestrate-fg";
  return (
    <li
      className={`rounded border px-2 py-1 text-[11.5px] ${tone}`}
      title={`Created ${new Date(d.createdAt).toLocaleString()}${
        d.consumedAt
          ? ` · applied to ${d.consumedByRole ?? "?"} at ${new Date(d.consumedAt).toLocaleString()}`
          : ""
      }`}
    >
      <span className="vibestrate-mono mr-2 text-[10px] uppercase tracking-[0.08em] opacity-70">
        {d.kind}
      </span>
      {d.kind === "inject-note" ? (
        <span className="whitespace-pre-wrap break-words">{d.body}</span>
      ) : (
        <span>{d.note ?? "Re-state understanding before continuing."}</span>
      )}
      {d.consumedAt ? (
        <span className="vibestrate-mono ml-2 text-[10px] opacity-70">
          ↳ {d.consumedByRole}
        </span>
      ) : null}
    </li>
  );
}

import { useState } from "react";
import { AlertTriangle, ArrowRight, FileText, MessagesSquare, Send } from "lucide-react";
import { api } from "../../lib/api.js";
import type { ConsultResult } from "../../lib/types.js";
import { Button } from "../../components/design/Button.js";
import { cn } from "../../components/design/cn.js";

const CONFIDENCE_TONE: Record<ConsultResult["answer"]["confidence"], string> = {
  high: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
  medium: "border-amber-400/30 bg-amber-500/10 text-amber-200",
  low: "border-white/15 bg-white/[0.04] text-fog-300",
};

export function ConsultPage({
  taskId,
  onOpenTask,
}: {
  taskId: string | null;
  onOpenTask: (taskId: string) => void;
}) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConsultResult | null>(null);

  async function ask() {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.consult({ question: q, taskId: taskId ?? undefined });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  const answer = result?.answer;

  return (
    <div className="relative z-10 mx-auto max-w-[860px] px-8 pt-6 pb-20 fade-up">
      <section className="mt-1">
        <div className="eyebrow mb-1.5 flex items-center gap-1.5">
          <MessagesSquare className="h-3 w-3" strokeWidth={1.8} /> Consult
        </div>
        <h1 className="text-display text-[21px] sm:text-[23px] leading-[1.2]">
          Ask the project orchestrator
        </h1>
        <p className="text-fog-300 text-[13px] mt-1.5 max-w-[70ch]">
          A read-only, project-aware advisor. It answers only from controlled context
          - your <span className="mono">VIBESTRATE.md</span>, config, recent runs, and
          annotations - and is honest about what it could not verify. It recommends;
          it never acts.
        </p>
        {taskId ? (
          <button
            type="button"
            onClick={() => onOpenTask(taskId)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-ink-200/40 px-2 py-0.5 text-[11px] text-fog-300 hover:text-fog-100"
          >
            scoped to task <span className="mono">{taskId}</span>
          </button>
        ) : null}
      </section>

      <section className="mt-5 glass rounded-xl border border-white/[0.08] p-4">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void ask();
          }}
          placeholder="e.g. Should this auth refactor use a heavier review flow? Why did the last run block?"
          rows={3}
          className="w-full resize-y rounded-md border border-white/10 bg-ink-200/70 px-3 py-2 text-[13px] text-fog-100 outline-none focus:border-violet-soft/40"
        />
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <span className="text-[11px] text-fog-500">⌘/Ctrl + Enter to ask</span>
          <Button
            variant="primary"
            size="sm"
            disabled={!question.trim() || busy}
            onClick={() => void ask()}
            iconLeft={<Send className="h-3 w-3" />}
          >
            {busy ? "Consulting…" : "Consult"}
          </Button>
        </div>
      </section>

      {error ? (
        <div className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/5 px-3 py-2 text-[12.5px] text-rose-300">
          {error}
        </div>
      ) : null}

      {answer ? (
        <section className="mt-5 space-y-4">
          <div className="glass rounded-xl border border-white/[0.08] p-4">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <span className="eyebrow">Answer</span>
              <span
                className={cn(
                  "rounded-md border px-2 py-0.5 text-[11px]",
                  CONFIDENCE_TONE[answer.confidence],
                )}
              >
                confidence: {answer.confidence}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-[13.5px] leading-[1.6] text-fog-100">
              {answer.answer.trim()}
            </p>

            {answer.caveats.length ? (
              <div className="mt-3.5 rounded-lg border border-amber-400/20 bg-amber-500/[0.05] p-3">
                <div className="mb-1 flex items-center gap-1.5 text-[11.5px] text-amber-200">
                  <AlertTriangle className="h-3 w-3" strokeWidth={1.9} /> Could not verify
                </div>
                <ul className="space-y-1 text-[12.5px] text-fog-300">
                  {answer.caveats.map((c, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="text-fog-500">·</span> {c}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {answer.recommendedActions.length ? (
            <div className="glass rounded-xl border border-white/[0.08] p-4">
              <span className="eyebrow">Recommended</span>
              <ul className="mt-2 space-y-1.5">
                {answer.recommendedActions.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12.5px] text-fog-200">
                    <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-violet-soft" strokeWidth={1.9} />
                    <span>
                      <span className="mono text-[11.5px] text-violet-soft">{a.kind}</span>{" "}
                      {a.detail}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {answer.proposedManualUpdate ? (
            <div className="glass rounded-xl border border-violet-soft/25 p-4">
              <div className="mb-1.5 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-violet-soft" strokeWidth={1.7} />
                <span className="eyebrow">Proposed VIBESTRATE.md update</span>
                <span className="text-[10.5px] text-fog-500">(proposal - not applied)</span>
              </div>
              <p className="text-[12px] text-fog-400">{answer.proposedManualUpdate.rationale}</p>
              <p className="mt-0.5 text-[11.5px] text-fog-500">
                evidence: {answer.proposedManualUpdate.evidence}
              </p>
              <pre className="mt-2 overflow-x-auto rounded-md border border-white/10 bg-ink-200/60 p-3 text-[12px] text-fog-200 whitespace-pre-wrap">
                {answer.proposedManualUpdate.suggestedText.trim()}
              </pre>
            </div>
          ) : null}

          <p className="text-[11px] text-fog-500">
            Grounded in: {(answer.usedContext.length ? answer.usedContext : result.usedSources).join(", ") || "no project context"}
            {result.providerId ? ` · via ${result.providerId}` : ""}
          </p>
          {result.notes.length ? (
            <ul className="space-y-0.5 text-[11px] text-fog-600">
              {result.notes.map((n, i) => (
                <li key={i}>! {n}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

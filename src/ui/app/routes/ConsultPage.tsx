import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Cpu, FileText, MessagesSquare, Send } from "lucide-react";
import { api, type ProviderRow } from "../../lib/api.js";
import type { ConsultResult, ProviderCatalog } from "../../lib/types.js";
import { usePersistedState } from "../../lib/usePersistedState.js";
import { Button } from "../../components/design/Button.js";
import { cn } from "../../components/design/cn.js";

const SELECT_CLASS =
  "rounded-md border border-white/10 bg-ink-200/70 px-2 py-1 text-[11.5px] text-fog-200 outline-none focus:border-violet-soft/40";

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
  const [proposalState, setProposalState] = useState<"open" | "applied" | "rejected" | "busy">("open");
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [catalog, setCatalog] = useState<ProviderCatalog>({});
  // Model selection is separate from saved profiles: "" provider = the default
  // (the crew's read-only planner); otherwise an ad-hoc provider + model + effort.
  const [providerId, setProviderId] = usePersistedState<string>("vibestrate.consult.providerId", "");
  const [model, setModel] = usePersistedState<string>("vibestrate.consult.model", "");
  const [effort, setEffort] = usePersistedState<string>("vibestrate.consult.effort", "");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.listProviders().catch(() => ({ providers: [] as ProviderRow[] })),
      api.getProviderCatalog().catch(() => null),
    ]).then(([p, c]) => {
      if (cancelled) return;
      setProviders(p.providers);
      if (c) setCatalog(c.catalog);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Only offer providers actually wired into the project.
  const configuredProviders = providers.filter((p) => p.configured);
  const caps = providerId ? catalog[providerId] : undefined;
  const models = caps?.models ?? [];
  const efforts = caps?.powerLevels ?? [];
  const onProviderChange = (id: string) => {
    setProviderId(id);
    setModel("");
    setEffort("");
  };

  async function ask() {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    setProposalState("open");
    try {
      const res = await api.consult({
        question: q,
        taskId: taskId ?? undefined,
        // Ad-hoc provider/model/effort; fail closed - only send a model/effort the
        // provider's catalog actually supports.
        providerId: providerId || undefined,
        model: providerId && models.includes(model) ? model : undefined,
        effort: providerId && efforts.includes(effort) ? effort : undefined,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  async function decideProposal(action: "apply" | "reject") {
    const id = result?.proposalId;
    if (!id) return;
    setProposalState("busy");
    try {
      if (action === "apply") await api.applyManualProposal(id);
      else await api.rejectManualProposal(id);
      setProposalState(action === "apply" ? "applied" : "rejected");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setProposalState("open");
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
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-fog-400">
            <span className="flex items-center gap-1.5">
              <Cpu className="h-3 w-3 text-violet-soft" strokeWidth={1.9} /> Model
            </span>
            {/* Provider → Model → Effort, all from the real capability catalog. */}
            <select value={providerId} onChange={(e) => onProviderChange(e.target.value)} className={SELECT_CLASS}>
              <option value="">Default · planner (crew)</option>
              {configuredProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label || p.id}
                </option>
              ))}
            </select>
            {providerId ? (
              models.length > 0 ? (
                <select value={model} onChange={(e) => setModel(e.target.value)} className={SELECT_CLASS}>
                  <option value="">model: provider default</option>
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-[10.5px] text-fog-600">model: provider default</span>
              )
            ) : null}
            {providerId && efforts.length > 0 ? (
              <select value={effort} onChange={(e) => setEffort(e.target.value)} className={SELECT_CLASS}>
                <option value="">effort: default</option>
                {efforts.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    effort: {lvl}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
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
              {result.proposalId ? (
                proposalState === "applied" ? (
                  <p className="mt-3 text-[12px] text-emerald-300">
                    Applied to VIBESTRATE.md - review the diff before committing.
                  </p>
                ) : proposalState === "rejected" ? (
                  <p className="mt-3 text-[12px] text-fog-500">Dismissed.</p>
                ) : (
                  <div className="mt-3 flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={proposalState === "busy"}
                      onClick={() => void decideProposal("reject")}
                    >
                      Dismiss
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={proposalState === "busy"}
                      onClick={() => void decideProposal("apply")}
                    >
                      {proposalState === "busy" ? "Applying…" : "Apply to VIBESTRATE.md"}
                    </Button>
                  </div>
                )
              ) : null}
            </div>
          ) : null}

          <p className="text-[11px] text-fog-500">
            Grounded in: {(answer.usedContext.length ? answer.usedContext : result.usedSources).join(", ") || "no project context"}
            {" · answered by "}
            {result.providerId}
            {result.model ? `/${result.model}` : ""}
            {result.effort ? ` · effort ${result.effort}` : ""}
            {result.profileId && result.profileId !== "(ad-hoc)" ? ` · ${result.profileId}` : ""}
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

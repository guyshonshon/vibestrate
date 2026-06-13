import { useEffect, useRef, useState } from "react";
import { Cpu, Send, X } from "lucide-react";
import { api, type ProviderRow } from "../../lib/api.js";
import type { ConsultResult, ProviderCatalog } from "../../lib/types.js";
import { usePersistedState } from "../../lib/usePersistedState.js";
import { Button } from "../design/Button.js";
import { cn } from "../design/cn.js";
import { ConsultOrb } from "./ConsultOrb.js";
import { ConsultAnswerView, type ProposalState } from "./ConsultAnswerView.js";

const SELECT_CLASS =
  "rounded-md border border-white/10 bg-ink-200/70 px-2 py-1 text-[11.5px] text-fog-200 outline-none focus:border-violet-soft/40";

/**
 * Floating consult dock. A resting orb at the bottom-right of every screen
 * expands into a large chat panel; while a consult runs, the orb takes center
 * stage and morphs ("AI thinking"). Reuses the same read-only consult API and
 * answer rendering as the full Consult page - this is just a quicker way in
 * from anywhere, with no nav button.
 */
export function ConsultDock() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConsultResult | null>(null);
  const [asked, setAsked] = useState<string>("");
  const [proposalState, setProposalState] = useState<ProposalState>("open");

  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [catalog, setCatalog] = useState<ProviderCatalog>({});
  const [providerId, setProviderId] = usePersistedState<string>("vibestrate.consult.providerId", "");
  const [model, setModel] = usePersistedState<string>("vibestrate.consult.model", "");
  const [effort, setEffort] = usePersistedState<string>("vibestrate.consult.effort", "");
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  // Lazy-load provider catalog the first time the dock opens.
  useEffect(() => {
    if (!open || providers.length > 0) return;
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
  }, [open, providers.length]);

  useEffect(() => {
    if (open) textRef.current?.focus();
  }, [open]);

  // Esc closes the panel (but never mid-thought - let a run finish).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy]);

  const configuredProviders = providers.filter((p) => p.configured);
  const caps = providerId ? catalog[providerId] : undefined;
  const models = caps?.models ?? [];
  const efforts = caps?.powerLevels ?? [];

  async function ask() {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setAsked(q);
    setProposalState("open");
    try {
      const res = await api.consult({
        question: q,
        providerId: providerId || undefined,
        model: providerId && models.includes(model) ? model : undefined,
        effort: providerId && efforts.includes(effort) ? effort : undefined,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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

  return (
    <div className="fixed bottom-5 right-5 z-40 print:hidden">
      {open ? (
        <div
          className="flex w-[min(440px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-ink-50/95 shadow-2xl shadow-black/50 backdrop-blur-xl fade-up"
          style={{ height: "min(78vh, 720px)" }}
          role="dialog"
          aria-label="Consult the project orchestrator"
        >
          {/* Header */}
          <div className="flex items-center gap-2.5 border-b border-white/[0.07] px-4 py-3">
            <ConsultOrb state={busy ? "thinking" : "idle"} size={28} />
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-fog-100">Consult</div>
              <div className="truncate text-[10.5px] text-fog-500">read-only project advisor</div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-auto grid h-7 w-7 place-items-center rounded-md text-fog-400 hover:bg-white/[0.06] hover:text-fog-100"
              aria-label="Close consult"
            >
              <X className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </div>

          {/* Body (scrolls) */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {busy ? (
              <div className="flex h-full flex-col items-center justify-center gap-5 py-8 text-center">
                <ConsultOrb state="thinking" size={148} />
                <div>
                  <div className="text-[13px] text-fog-100">Thinking…</div>
                  <div className="mt-1 max-w-[28ch] text-[11.5px] text-fog-500">
                    reading your project context to answer
                  </div>
                </div>
                {asked ? (
                  <div className="max-w-[34ch] truncate text-[11px] italic text-fog-600" title={asked}>
                    "{asked}"
                  </div>
                ) : null}
              </div>
            ) : error ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-rose-400/30 bg-rose-500/5 px-3 py-2.5 text-[12.5px] leading-relaxed text-rose-200 whitespace-pre-wrap">
                  {error}
                </div>
                <p className="text-[11px] text-fog-500">
                  Tip: model and effort options are per-provider suggestions, not probed from your
                  install - if your CLI rejects one, pick the provider default or run{" "}
                  <span className="mono">vibe provider test</span>.
                </p>
              </div>
            ) : result ? (
              <ConsultAnswerView
                result={result}
                proposalState={proposalState}
                onDecideProposal={decideProposal}
                compact
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-4 py-10 text-center">
                <ConsultOrb state="idle" size={96} />
                <p className="max-w-[30ch] text-[12.5px] text-fog-400">
                  Ask about this project - why a run blocked, whether a change needs a heavier
                  review, what to do next. It answers only from your project context and never acts.
                </p>
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="border-t border-white/[0.07] p-3">
            <textarea
              ref={textRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void ask();
              }}
              placeholder="Ask the project orchestrator…"
              rows={2}
              disabled={busy}
              className="w-full resize-none rounded-md border border-white/10 bg-ink-200/70 px-3 py-2 text-[13px] text-fog-100 outline-none focus:border-violet-soft/40 disabled:opacity-60"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-fog-400">
                <Cpu className="h-3 w-3 shrink-0 text-violet-soft" strokeWidth={1.9} />
                <select
                  value={providerId}
                  onChange={(e) => {
                    setProviderId(e.target.value);
                    setModel("");
                    setEffort("");
                  }}
                  className={SELECT_CLASS}
                  disabled={busy}
                >
                  <option value="">Default · planner</option>
                  {configuredProviders.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label || p.id}
                    </option>
                  ))}
                </select>
                {providerId && models.length > 0 ? (
                  <select value={model} onChange={(e) => setModel(e.target.value)} className={SELECT_CLASS} disabled={busy}>
                    <option value="">model: default</option>
                    {models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : null}
                {providerId && efforts.length > 0 ? (
                  <select value={effort} onChange={(e) => setEffort(e.target.value)} className={SELECT_CLASS} disabled={busy}>
                    <option value="">effort: default</option>
                    {efforts.map((lvl) => (
                      <option key={lvl} value={lvl}>
                        effort: {lvl}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
              <Button
                variant="primary"
                size="sm"
                disabled={!question.trim() || busy}
                onClick={() => void ask()}
                iconLeft={<Send className="h-3 w-3" />}
              >
                {busy ? "…" : "Ask"}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group flex items-center gap-0 rounded-full border border-violet-soft/30 bg-ink-50/80 p-1.5 shadow-xl shadow-black/40 backdrop-blur-xl transition-all hover:border-violet-soft/50 hover:pr-4"
          aria-label="Open consult"
          title="Consult the project orchestrator"
        >
          <ConsultOrb state="idle" size={48} />
          <span className="max-w-0 overflow-hidden whitespace-nowrap text-[12.5px] font-medium text-fog-100 transition-all duration-300 group-hover:ml-2.5 group-hover:max-w-[120px]">
            Consult
          </span>
        </button>
      )}
    </div>
  );
}

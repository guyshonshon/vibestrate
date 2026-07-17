import { useEffect, useRef, useState } from "react";
import { Cpu, Send, X } from "lucide-react";
import { api, type ProviderRow } from "../../lib/api.js";
import type { ConsultResult, ProviderCatalog } from "../../lib/types.js";
import { usePersistedState } from "../../lib/usePersistedState.js";
import { getViewContext } from "../../lib/view-context.js";
import { Button } from "../design/Button.js";
import { Select } from "../design/Select.js";
import { ConsultOrb } from "./ConsultOrb.js";
import { ConsultAnswerView, type ProposalState } from "./ConsultAnswerView.js";

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

  // Broadcast open/closed so the CLI launcher (which stacks above the resting
  // orb) can step aside while the full panel is up and would otherwise overlap.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("vibestrate:consult-state", { detail: { open } }),
    );
  }, [open]);

  // Open from elsewhere (e.g. the composer's supervisor orb), optionally seeded
  // with a question to ask about.
  useEffect(() => {
    const onOpen = (e: Event) => {
      setOpen(true);
      const q = (e as CustomEvent<{ question?: string }>).detail?.question;
      if (typeof q === "string" && q.trim()) setQuestion(q.trim());
    };
    window.addEventListener("vibestrate:consult-open", onOpen);
    return () => window.removeEventListener("vibestrate:consult-open", onOpen);
  }, []);

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
        // Screen-aware: hand the orb a snapshot of whatever screen published one
        // (e.g. the spec-up questions + answers). Redacted server-side.
        viewContext: getViewContext(),
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
          className="flex w-[min(440px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-[20px] border border-[color:var(--line)] bg-coal-700 shadow-2xl shadow-black/50 fade-up"
          style={{ height: "min(78vh, 720px)" }}
          role="dialog"
          aria-label="Consult the project orchestrator"
        >
          {/* Header */}
          <div className="flex items-center gap-2.5 border-b border-[color:var(--line)] px-4 py-3">
            <ConsultOrb state={busy ? "thinking" : "idle"} size={28} />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-chalk-100">Consult</div>
              <div className="truncate text-[10.5px] font-medium text-violet-soft">
                read-only project advisor
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-auto grid h-7 w-7 place-items-center rounded-[9px] text-chalk-400 transition hover:bg-coal-500 hover:text-chalk-100"
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
                  <div className="text-[13px] text-chalk-100">Thinking…</div>
                  <div className="mt-1 max-w-[28ch] text-[11.5px] text-chalk-300">
                    reading your project context to answer
                  </div>
                </div>
                {asked ? (
                  <div className="max-w-[34ch] truncate text-[11px] italic text-chalk-400" title={asked}>
                    "{asked}"
                  </div>
                ) : null}
              </div>
            ) : error ? (
              <div className="space-y-3">
                <div className="rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-2.5 text-[12.5px] leading-relaxed text-rose-300 whitespace-pre-wrap">
                  {error}
                </div>
                <p className="text-[11px] text-chalk-300">
                  Tip: model and effort options are per-provider suggestions, not probed from your
                  install - if your CLI rejects one, pick the provider default or run{" "}
                  <span className="mono text-violet-soft">vibe provider test</span>.
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
                <p className="max-w-[30ch] text-[12.5px] text-chalk-300">
                  Ask about this project - why a run blocked, whether a change needs a heavier
                  review, what to do next. It answers only from your project context and never acts.
                </p>
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="border-t border-[color:var(--line)] p-3">
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
              className="w-full resize-none rounded-[12px] border border-[color:var(--line-strong)] bg-coal-800 px-3 py-2 text-[13px] text-chalk-100 placeholder:text-chalk-400 outline-none focus:border-violet-soft/50 disabled:opacity-60"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-chalk-300">
                <Cpu className="h-3 w-3 shrink-0 text-violet-soft" strokeWidth={1.9} />
                <Select
                  value={providerId}
                  ariaLabel="Consult provider"
                  className="min-w-[150px]"
                  disabled={busy}
                  onChange={(v) => {
                    setProviderId(v);
                    setModel("");
                    setEffort("");
                  }}
                  options={[
                    { value: "", label: "Default · planner" },
                    ...configuredProviders.map((p) => ({ value: p.id, label: p.label || p.id })),
                  ]}
                />
                {providerId && models.length > 0 ? (
                  <Select
                    value={model}
                    ariaLabel="Consult model"
                    className="min-w-[150px]"
                    disabled={busy}
                    onChange={(v) => setModel(v)}
                    options={[
                      { value: "", label: "model: default" },
                      ...models.map((m) => ({ value: m, label: m })),
                    ]}
                  />
                ) : null}
                {providerId && efforts.length > 0 ? (
                  <Select
                    value={effort}
                    ariaLabel="Consult effort"
                    className="min-w-[150px]"
                    disabled={busy}
                    onChange={(v) => setEffort(v)}
                    options={[
                      { value: "", label: "effort: default" },
                      ...efforts.map((lvl) => ({ value: lvl, label: `effort: ${lvl}` })),
                    ]}
                  />
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
          data-tour="consult-orb"
          onClick={() => setOpen(true)}
          className="group flex items-center gap-0 rounded-full border border-violet-soft/30 bg-coal-600 p-1.5 shadow-xl shadow-black/40 transition-all hover:border-violet-soft/50"
          aria-label="Open consult"
          title="Consult the project orchestrator"
        >
          <ConsultOrb state="idle" size={48} />
          <span className="max-w-0 overflow-hidden whitespace-nowrap text-[12.5px] font-medium text-chalk-100 transition-all duration-300 group-hover:ml-2.5 group-hover:mr-1.5 group-hover:max-w-[120px]">
            Consult
          </span>
        </button>
      )}
    </div>
  );
}

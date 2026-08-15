import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Cpu, Send, X } from "lucide-react";
import { api, type ProviderRow } from "../../lib/api.js";
import type { ConsultResult, ProviderCatalog } from "../../lib/types.js";
import { usePersistedState } from "../../lib/usePersistedState.js";
import { getViewContext } from "../../lib/view-context.js";
import { navigate } from "../../app/App.js";
import { AttachButton, AttachmentStrip, useAttachments } from "../design/Attachments.js";
import { Button } from "../design/Button.js";
import { IconBtn } from "../design/IconBtn.js";
import { Select } from "../design/Select.js";
import { launchGuide } from "../onboarding/TourOverlay.js";
import { SupervisorControl } from "../supervisor/SupervisorControl.js";
import { findGuide, matchGuide } from "../../lib/guides/guides.js";
import { ConsultOrb } from "./ConsultOrb.js";
import { ConsultAnswerView, type ProposalState } from "./ConsultAnswerView.js";
import {
  ConsultModeChooser,
  GuideDetail,
  GuideList,
  GuideOffer,
  type ConsultMode,
} from "./ConsultGuides.js";

const MODE_TITLE: Record<ConsultMode, string> = {
  choose: "Consult",
  project: "Ask about this project",
  vibestrate: "Work in Vibestrate",
};

/** Questions only this project can answer, which is the line between the two
 *  sides: none of these has an authored walkthrough, and none ever will. */
const PROJECT_EXAMPLES = [
  "Why did the last run block?",
  "What is waiting on me?",
  "Does this change need a heavier review?",
];

/**
 * Floating consult dock. A resting orb at the bottom-right of every screen
 * opens two different conversations, and the difference between them is what
 * each one is ALLOWED to do:
 *
 *   project     the read-only consult. A model call over your files, config and
 *               runs. It answers, and the one thing it can leave behind is a
 *               VIBESTRATE.md proposal that does nothing until you apply it.
 *   vibestrate  working in Vibestrate itself rather than in your codebase:
 *               authored walkthroughs (lib/guides/guides.ts) that land you on
 *               the control, and the SUPERVISOR conversation, which can make a
 *               task, add TODOs or start a run when you ask it to.
 *
 * The supervisor half is `SupervisorControl` mounted as-is, not a second chat
 * client of our own. That is deliberate: it already carries the autonomy switch,
 * the pause kill-switch, the router/executor split and a broker-gated
 * `run.start`. A second composer wired straight to a model would be a second
 * privilege path with none of that, which is exactly the thing this product
 * exists to not have.
 */
export function ConsultDock() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = usePersistedState<ConsultMode>(
    "vibestrate.consult.mode",
    "choose",
  );
  /** The walkthrough opened on the Vibestrate side, if any. */
  const [guideId, setGuideId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const attachments = useAttachments();
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
    // Safe to degrade silently: these only populate the provider / model /
    // effort selectors. With them empty the dock still asks on the crew's
    // configured planner, and a failed ask surfaces its own error.
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
      if (typeof q === "string" && q.trim()) {
        // A seeded question is a project question by definition, so land on the
        // side that can ask it rather than on the chooser holding the text.
        setMode("project");
        setQuestion(q.trim());
      }
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
        // Attachments are named in the question itself; consult reads the repo,
        // so a name is what lets it open the file.
        question: `${q}${attachments.note}`,
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

  // The walkthrough rings and navigates to real elements, and a panel in the
  // corner covers them, so starting one closes the dock. `stepId` is what makes
  // "Take me there" land on the step you pressed rather than at step one.
  function startGuide(id: string, stepId?: string) {
    setOpen(false);
    launchGuide(id, stepId);
  }

  const offeredGuide = matchGuide(question);
  const openedGuide = guideId ? findGuide(guideId) : null;

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

  const showPanel = open && mode !== "choose";

  return (
    <div className="fixed bottom-5 right-5 z-40 print:hidden">
      {showPanel ? (
        <div
          className="flex w-[min(440px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-[20px] border border-[color:var(--line)] bg-coal-700 shadow-2xl shadow-black/50 fade-up"
          // Anchored `bottom-5`, so the panel grows UP out of the orb and can
          // never be cut off by the bottom of the window.
          style={{ height: "min(78vh, 720px)" }}
          role="dialog"
          aria-label={MODE_TITLE[mode]}
        >
          {/* Header. The title names the side you are on, and the arrow is the
              way back to the other one - the mode is carried by a control and a
              heading, never by a chip. */}
          <div className="flex items-center gap-2.5 border-b border-[color:var(--line)] px-4 py-3">
            <IconBtn
              variant="plain"
              title="Back to consult"
              disabled={busy}
              onClick={() => setMode("choose")}
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.8} aria-hidden />
            </IconBtn>
            <ConsultOrb state={busy ? "thinking" : "idle"} size={28} />
            <div className="min-w-0 truncate text-[13px] font-semibold text-chalk-100">
              {MODE_TITLE[mode]}
            </div>
            <div className="ml-auto">
              <IconBtn variant="plain" title="Close consult" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" strokeWidth={1.8} aria-hidden />
              </IconBtn>
            </div>
          </div>

          {mode === "vibestrate" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              {/* Walkthroughs sit above the conversation rather than replacing
                  it: the buttons here move you, the box below can act. */}
              <div className="max-h-[200px] shrink-0 overflow-y-auto border-b border-[color:var(--line)] px-4 py-3">
                {openedGuide ? (
                  <GuideDetail
                    guide={openedGuide}
                    onBack={() => setGuideId(null)}
                    onGoToStep={(step) => startGuide(openedGuide.id, step.id)}
                    onWalkThrough={() => startGuide(openedGuide.id)}
                  />
                ) : (
                  <GuideList onStart={(g) => setGuideId(g.id)} />
                )}
              </div>
              {/* SupervisorControl sizes itself for a page column, where it is
                  the tallest thing on screen. In the dock it is a region of a
                  panel that already has a height, so the child is made to fill
                  it and drop the card edge it would otherwise draw inside one. */}
              <div className="min-h-0 flex-1 [&>section]:h-full [&>section]:min-h-0 [&>section]:rounded-none [&>section]:border-0">
                <SupervisorControl runId={null} compact />
              </div>
            </div>
          ) : (
          /* Body (scrolls) */
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {busy ? (
              <div className="flex h-full flex-col items-center justify-center gap-5 py-8 text-center">
                <ConsultOrb state="thinking" size={148} />
                <div>
                  <div className="text-[13px] text-chalk-100">Thinking…</div>
                  <div className="mt-1 max-w-[28ch] text-meta text-chalk-300">
                    reading your project context to answer
                  </div>
                </div>
                {asked ? (
                  <div className="max-w-[34ch] truncate text-meta italic text-chalk-400" title={asked}>
                    "{asked}"
                  </div>
                ) : null}
              </div>
            ) : error ? (
              <div className="space-y-3">
                <div className="rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-2.5 text-[12.5px] leading-relaxed text-rose-300 whitespace-pre-wrap">
                  {error}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-meta text-chalk-300">
                    Tip: model and effort options are per-provider suggestions, not probed
                    from your install - if your CLI rejects one, pick the provider default or
                    test the connection.
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="shrink-0"
                    onClick={() => navigate({ kind: "providers" })}
                  >
                    Open Providers
                  </Button>
                </div>
              </div>
            ) : result ? (
              <ConsultAnswerView
                result={result}
                proposalState={proposalState}
                onDecideProposal={decideProposal}
                compact
              />
            ) : (
              // Examples rather than a paragraph about the surface: each one is
              // a control that fills the box, so the empty state teaches by
              // being usable. Same idiom as the maker's assistant panel.
              <div className="flex h-full flex-col items-center justify-center gap-4 py-8">
                <ConsultOrb state="idle" size={88} />
                <div className="flex w-full flex-col gap-1.5">
                  {PROJECT_EXAMPLES.map((ex) => (
                    <Button
                      key={ex}
                      variant="outline"
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => {
                        setQuestion(ex);
                        textRef.current?.focus();
                      }}
                    >
                      {ex}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
          )}

          {/* The project side's composer. The Vibestrate side has one too - the
              supervisor's, mounted above with the permissions that belong to a
              box that can act. */}
          {mode === "project" ? (
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
            {offeredGuide && !busy ? (
              <GuideOffer
                className="mt-2"
                guide={offeredGuide}
                onStart={() => startGuide(offeredGuide.id)}
              />
            ) : null}
            <AttachmentStrip
              items={attachments.items}
              onRemove={attachments.remove}
              className="mt-2"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-meta text-chalk-300">
                <AttachButton onAdd={attachments.add} disabled={busy} />
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
          ) : null}
        </div>
      ) : (
        <div className="relative">
          {/* The chooser is not a panel: it is the two cards, hanging off the
              orb that was pressed. `bottom-full` pins them to the TOP edge of
              the button, so they can only ever open upward - at any window
              height, there is nothing below the orb for them to be cut off by. */}
          {open ? (
            <div
              className="absolute bottom-full right-0 mb-2.5 w-[320px] max-w-[calc(100vw-2.5rem)] fade-up"
              role="dialog"
              aria-label="Consult"
            >
              <ConsultModeChooser elevated onChoose={(m) => setMode(m)} />
            </div>
          ) : null}
          <button
            type="button"
            data-tour="consult-orb"
            onClick={() => setOpen((v) => !v)}
            className="group flex items-center gap-0 rounded-full border border-violet-soft/30 bg-coal-600 p-1.5 shadow-xl shadow-black/40 transition-all hover:border-violet-soft/50"
            aria-label="Open consult"
            aria-expanded={open}
            title="Ask about this project, or work in Vibestrate"
          >
            <ConsultOrb state="idle" size={48} />
            <span className="max-w-0 overflow-hidden whitespace-nowrap text-[12.5px] font-medium text-chalk-100 transition-all duration-300 group-hover:ml-2.5 group-hover:mr-1.5 group-hover:max-w-[120px]">
              Consult
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

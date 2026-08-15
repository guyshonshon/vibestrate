import { useEffect, useState } from "react";
import { Cpu, Send } from "lucide-react";
import { api, type ProviderRow } from "../../lib/api.js";
import type { ConsultResult, ProviderCatalog } from "../../lib/types.js";
import { usePersistedState } from "../../lib/usePersistedState.js";
import {
  AttachButton,
  AttachmentStrip,
  useAttachments,
} from "../../components/design/Attachments.js";
import { Button } from "../../components/design/Button.js";
import { SegmentedControl } from "../../components/design/SegmentedControl.js";
import { Select } from "../../components/design/Select.js";
import { PageShell } from "../../components/layout/PageShell.js";
import { Deck, Cell } from "../../components/layout/Deck.js";
import { PageHero } from "../../components/layout/PageHero.js";
import {
  Skeleton,
  SkeletonBlock,
  SkeletonRows,
  SkeletonText,
} from "../../components/design/Skeleton.js";
import { ErrorView } from "../../lib/error-view.js";
import {
  ConsultAnswerView,
  type ProposalState,
} from "../../components/consult/ConsultAnswerView.js";
import { launchGuide } from "../../components/onboarding/TourOverlay.js";
import { SupervisorControl } from "../../components/supervisor/SupervisorControl.js";
import { findGuide, matchGuide } from "../../lib/guides/guides.js";
import {
  GuideDetail,
  GuideList,
  GuideOffer,
} from "../../components/consult/ConsultGuides.js";

type PageMode = "project" | "vibestrate";

/**
 * Consult, full size. Two sides, and what separates them is what each one may
 * do: asking about THIS project is a read-only model call over your files,
 * config and runs, and the most it leaves behind is a VIBESTRATE.md proposal
 * you apply yourself. Working IN Vibestrate is authored walkthroughs
 * (lib/guides/guides.ts) that move you to the control, plus the supervisor
 * conversation, which can make a task, add TODOs or start a run - under its own
 * permission switch, its pause, and the broker.
 *
 * The dock is the quick way in and shows one side at a time. This is where the
 * whole catalog fits, itinerary and all.
 */
export function ConsultPage({
  taskId,
  onOpenTask,
}: {
  taskId: string | null;
  onOpenTask: (taskId: string) => void;
}) {
  const [mode, setMode] = usePersistedState<PageMode>(
    "vibestrate.consult.pageMode",
    "project",
  );
  const [question, setQuestion] = useState("");
  /** The walkthrough opened on the Vibestrate side, if any. */
  const [guideId, setGuideId] = useState<string | null>(null);
  const attachments = useAttachments();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConsultResult | null>(null);
  const [proposalState, setProposalState] = useState<ProposalState>("open");
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [catalog, setCatalog] = useState<ProviderCatalog>({});
  // Model selection is separate from saved profiles: "" provider = the default
  // (the crew's read-only planner); otherwise an ad-hoc provider + model + effort.
  const [providerId, setProviderId] = usePersistedState<string>("vibestrate.consult.providerId", "");
  const [model, setModel] = usePersistedState<string>("vibestrate.consult.model", "");
  const [effort, setEffort] = usePersistedState<string>("vibestrate.consult.effort", "");

  useEffect(() => {
    let cancelled = false;
    // Safe to degrade silently: these only populate the provider / model /
    // effort selectors. With them empty the consult still runs on the crew's
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
        // Attachments are named in the question itself; consult reads the repo,
        // so a name is what lets it open the file.
        question: `${q}${attachments.note}`,
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
  const offeredGuide = matchGuide(question);
  const openedGuide = guideId ? findGuide(guideId) : null;

  return (
    <PageShell>
      <Deck>
      <Cell size="full" reason="masthead">
      {/* One state register, not four. The hero used to say "read-only" as a
          value, a caption, a note and a footer; the fact only needs saying once
          - and only on the side it is true of. The Vibestrate side carries a
          surface that can act, and its permission is a live control on that
          panel, so the hero does not restate it and risk saying the opposite. */}
      <PageHero
        state={
          mode === "project"
            ? { value: "Advises", caption: "You apply the changes", tone: "emerald" }
            : undefined
        }
        title="Consult"
        purpose={
          mode === "project"
            ? "Answers about this project, from your files, config and runs."
            : "Walkthroughs of the product, and the supervisor that works the project with you."
        }
        actions={
          <div className="flex items-center gap-2">
            {taskId ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onOpenTask(taskId)}
              >
                Scoped to task <span className="mono ml-1">{taskId}</span>
              </Button>
            ) : null}
            <SegmentedControl<PageMode>
              value={mode}
              onChange={(m) => setMode(m)}
              options={[
                { value: "project", label: "This project" },
                { value: "vibestrate", label: "Work in Vibestrate" },
              ]}
            />
          </div>
        }
      />
      </Cell>

      {mode === "vibestrate" ? (
        // Walkthroughs and a conversation, side by side: the walkthrough moves
        // you to the control, the supervisor does the work you ask it for. Two
        // halves rather than a full row each, because they are read together -
        // you take a walkthrough, then ask about the step you are standing on.
        <>
          <Cell size="half">
            {openedGuide ? (
              <GuideDetail
                guide={openedGuide}
                onBack={() => setGuideId(null)}
                onGoToStep={(step) => launchGuide(openedGuide.id, step.id)}
                onWalkThrough={() => launchGuide(openedGuide.id)}
              />
            ) : (
              <GuideList onStart={(g) => setGuideId(g.id)} />
            )}
          </Cell>
          <Cell size="half">
            <SupervisorControl runId={null} />
          </Cell>
        </>
      ) : (
      <>
      <Cell size="full" reason="masthead">
      <section className="rounded-[16px] border border-[color:var(--line)] bg-coal-600 p-4">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void ask();
          }}
          placeholder="e.g. Should this auth refactor use a heavier review flow? Why did the last run block?"
          rows={3}
          className="w-full resize-y rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 px-3 py-2 text-[13px] text-chalk-100 outline-none focus:border-violet-soft/50"
        />
        {offeredGuide && !busy ? (
          <GuideOffer
            className="mt-2.5"
            guide={offeredGuide}
            onStart={() => launchGuide(offeredGuide.id)}
          />
        ) : null}
        <AttachmentStrip
          items={attachments.items}
          onRemove={attachments.remove}
          className="mt-2.5"
        />
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-meta text-chalk-300">
            <AttachButton onAdd={attachments.add} disabled={busy} />
            <span className="flex items-center gap-1.5">
              <Cpu className="h-3 w-3 text-violet-soft" strokeWidth={1.9} /> Model
            </span>
            {/* Provider → Model → Effort, all from the real capability catalog. */}
            <Select
              value={providerId}
              ariaLabel="Provider"
              className="min-w-[150px]"
              onChange={(v) => onProviderChange(v)}
              options={[
                { value: "", label: "Default · planner (crew)" },
                ...configuredProviders.map((p) => ({ value: p.id, label: p.label || p.id })),
              ]}
            />
            {providerId ? (
              models.length > 0 ? (
                <Select
                  value={model}
                  ariaLabel="Model"
                  className="min-w-[150px]"
                  onChange={(v) => setModel(v)}
                  options={[
                    { value: "", label: "model: provider default" },
                    ...models.map((m) => ({ value: m, label: m })),
                  ]}
                />
              ) : (
                <span className="text-meta text-chalk-400">model: provider default</span>
              )
            ) : null}
            {providerId && efforts.length > 0 ? (
              <Select
                value={effort}
                ariaLabel="Effort"
                className="min-w-[150px]"
                onChange={(v) => setEffort(v)}
                options={[
                  { value: "", label: "effort: default" },
                  ...efforts.map((lvl) => ({ value: lvl, label: `effort: ${lvl}` })),
                ]}
              />
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-meta text-chalk-400">⌘/Ctrl + Enter to ask</span>
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
      </Cell>

      {error ? (
        <Cell size="full" reason="masthead">
          <ErrorView compact err={error} onRetry={() => void ask()} />
        </Cell>
      ) : null}

      {/* A consult is a model call, so the wait is long enough that a page with
       * nothing under the composer reads as a button that did nothing. */}
      {busy ? (
        <Cell size="full" reason="nested-deck">
          <Skeleton label="Waiting for the answer" className="flex flex-col gap-4">
            <div className="rounded-[16px] border border-[color:var(--line)] bg-coal-600 p-4">
              <SkeletonBlock h={13} w={72} className="mb-2.5" />
              <SkeletonText lines={5} size={13} />
            </div>
            <div className="rounded-[16px] border border-[color:var(--line)] bg-coal-600 p-4">
              <SkeletonBlock h={13} w={96} />
              <SkeletonRows className="mt-2" rows={3} lead="icon" />
            </div>
          </Skeleton>
        </Cell>
      ) : answer && result ? (
        <Cell size="full" reason="nested-deck">
          <ConsultAnswerView
            result={result}
            proposalState={proposalState}
            onDecideProposal={(a) => void decideProposal(a)}
          />
        </Cell>
      ) : null}
      </>
      )}
      </Deck>
    </PageShell>
  );
}

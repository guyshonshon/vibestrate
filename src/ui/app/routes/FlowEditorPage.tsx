// The Flow Editor: create a flow from scratch, or open a project flow and edit
// it. One page, one draft, one save.
//
// What separates this from the Flow Builder next door is WHEN the flow is
// judged. Every keystroke re-runs the real `flowDefinitionSchema` over the whole
// draft (see components/flow-builder/flow-draft.ts), and each violation is
// pinned to the step, seat, or field that caused it. Save is disabled while any
// violation stands, and what it posts is the schema's own parsed output - so a
// flow that looked valid in the form cannot be rejected on the way to disk.
//
// Writes go through POST /api/flows (`api.createFlow`), the same flow-creator
// endpoint the CLI and the supervisor's draft-accept use, with `overwrite` set
// only when the user is editing a flow that already exists.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Copy, Save } from "lucide-react";
import { api } from "../../lib/api.js";
import { ErrorView } from "../../lib/error-view.js";
import { AssistantPanel } from "../../components/design/AssistantPanel.js";
import { Button } from "../../components/design/Button.js";
import {
  Skeleton,
  SkeletonBlock,
  SkeletonRows,
  SkeletonStats,
} from "../../components/design/Skeleton.js";
import { StatTile } from "../../components/design/StatTile.js";
import { ToastView, useToast } from "../../components/design/useToast.js";
import { useConfirm } from "../../components/design/ConfirmDialog.js";
import { Breadcrumbs } from "../../components/layout/Breadcrumbs.js";
import { Stack } from "../../components/layout/Deck.js";
import { PageHeader, PageShell } from "../../components/layout/PageShell.js";
import { EditorSplit } from "../../components/flow-builder/EditorSplit.js";
// The currency report is the same trust signal the draft panels show, so the
// assistant reuses it rather than presenting the model's self-report a second
// way. It lives in DraftFlowPanel until someone promotes it to design/.
import { AssistCurrencyReport } from "../../components/flow-builder/DraftFlowPanel.js";
import {
  IdentityCard,
  LoopCard,
  SeatsCard,
} from "../../components/flow-builder/FlowIdentityEditor.js";
import {
  StepFields,
  StepList,
} from "../../components/flow-builder/FlowStepEditor.js";
import {
  draftFromDefinition,
  draftToCandidate,
  draftsDiffer,
  editorKey,
  emptyDraft,
  isGraphDraft,
  moveStep,
  newSeat,
  newStep,
  validateDraft,
  type EditorSeat,
  type EditorStep,
  type FlowEditorDraft,
} from "../../components/flow-builder/flow-draft.js";
import type { DiscoveredFlow, FlowDefinition } from "../../lib/types.js";
import type { FlowRevision } from "../../lib/types/flows.js";

type Load =
  | { phase: "loading" }
  | { phase: "failed"; error: unknown }
  | { phase: "ready"; flow: DiscoveredFlow | null };

export function FlowEditorPage({
  flowId,
  onBack,
  onSaved,
}: {
  /** null opens a blank flow; an id opens that flow for editing. */
  flowId: string | null;
  onBack: () => void;
  onSaved: (flowId: string) => void;
}) {
  const [load, setLoad] = useState<Load>(
    flowId ? { phase: "loading" } : { phase: "ready", flow: null },
  );
  const [draft, setDraft] = useState<FlowEditorDraft>(() => emptyDraft());
  // The draft as last written to disk, so "dirty" is a comparison and not a
  // flag someone has to remember to set.
  const [saved, setSaved] = useState<FlowEditorDraft>(() => emptyDraft());
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [forking, setForking] = useState(false);
  const { toast, showToast } = useToast(4000);
  const { confirm } = useConfirm();

  const loadFlow = useCallback(async (): Promise<void> => {
    if (!flowId) return;
    setLoad({ phase: "loading" });
    setSaveError(null);
    try {
      const r = await api.listFlows();
      const found = r.flows.find((f) => f.id === flowId) ?? null;
      setLoad({ phase: "ready", flow: found });
      if (found) {
        const next = draftFromDefinition(found.definition);
        setDraft(next);
        setSaved(next);
        setActiveKey(next.steps[0]?.key ?? null);
      }
    } catch (err) {
      setLoad({ phase: "failed", error: err });
    }
  }, [flowId]);

  useEffect(() => {
    if (flowId) {
      void loadFlow();
      return;
    }
    const next = emptyDraft();
    setLoad({ phase: "ready", flow: null });
    setDraft(next);
    setSaved(next);
    setSaveError(null);
    setActiveKey(next.steps[0]?.key ?? null);
  }, [flowId, loadFlow]);

  const validation = useMemo(() => validateDraft(draft), [draft]);
  // What the supervisor is asked about: the same object the save would post,
  // built whether or not it currently parses.
  const candidate = useMemo(() => draftToCandidate(draft), [draft]);
  const graphMode = useMemo(() => isGraphDraft(draft), [draft]);
  const dirty = useMemo(() => draftsDiffer(draft, saved), [draft, saved]);

  const activeIndex = draft.steps.findIndex((s) => s.key === activeKey);
  const activeStep = activeIndex >= 0 ? draft.steps[activeIndex] : undefined;

  const patchDraft = (part: Partial<FlowEditorDraft>): void =>
    setDraft((cur) => ({ ...cur, ...part }));

  function patchStep(key: string, next: EditorStep): void {
    setDraft((cur) => ({
      ...cur,
      steps: cur.steps.map((s) => (s.key === key ? next : s)),
    }));
  }

  // The new step's id is minted INSIDE the updater, against the list React
  // actually holds - two adds in one tick would otherwise both read the pre-add
  // list and mint the same id. The React key is minted outside and passed in, so
  // the key handed to `setActiveKey` is the one the committed row carries.
  function addStep(): void {
    const key = editorKey("step");
    setDraft((cur) => ({ ...cur, steps: [...cur.steps, newStep(cur.steps, key)] }));
    setActiveKey(key);
  }

  function removeStep(key: string): void {
    setDraft((cur) => {
      if (cur.steps.length <= 1) return cur;
      // A step id vanishing takes its dependents with it, else the flow would
      // sit on "needs unknown step" errors nobody asked for.
      const gone = cur.steps.find((s) => s.key === key)?.id;
      const steps = cur.steps
        .filter((s) => s.key !== key)
        .map((s) => (gone ? { ...s, needs: s.needs.filter((n) => n !== gone) } : s));
      return { ...cur, steps };
    });
    // Selection follows the list. A removal only ever shrinks it, so resolving
    // the next selection against the rendered list is safe.
    if (key === activeKey) {
      setActiveKey(draft.steps.find((s) => s.key !== key)?.key ?? null);
    }
  }

  function reorder(from: number, to: number): void {
    setDraft((cur) => ({ ...cur, steps: moveStep(cur.steps, from, to) }));
  }

  function patchSeat(key: string, part: Partial<EditorSeat>): void {
    setDraft((cur) => ({
      ...cur,
      seats: cur.seats.map((s) => (s.key === key ? { ...s, ...part } : s)),
    }));
  }

  function addSeat(): void {
    const key = editorKey("seat");
    setDraft((cur) => ({ ...cur, seats: [...cur.seats, newSeat(cur.seats, key)] }));
  }

  function removeSeat(key: string): void {
    setDraft((cur) => {
      const seats = cur.seats.filter((s) => s.key !== key);
      if (seats.length === 0) return cur;
      return { ...cur, seats };
    });
  }

  /**
   * Take a proposed revision as the working draft. Same lift `loadFlow` uses,
   * deliberately without `setSaved`: dirty is draft-vs-saved, so rebaselining
   * here would claim a proposal nobody has written is already on disk. Applying
   * touches no file - the Save button is still the only writer.
   *
   * `draftFromDefinition` mints fresh React keys for every row, so the selected
   * step's key stops existing; the selection follows the step id across.
   *
   * A revision is the WHOLE flow, so the top-level keys the form does not
   * surface survive only because the definition carries them - `passthrough` is
   * rebuilt from what arrives, not merged with what was there. Keeping them is
   * the assist prompt's job; merging them in here would hide a revision that
   * dropped one behind a value the owner never re-approved.
   */
  function applyRevision(flow: FlowDefinition): void {
    const keepId = draft.steps.find((s) => s.key === activeKey)?.id;
    const next = draftFromDefinition(flow);
    setDraft(next);
    setActiveKey(
      (keepId ? next.steps.find((s) => s.id === keepId)?.key : null) ??
        next.steps[0]?.key ??
        null,
    );
  }

  const savedFlow = load.phase === "ready" ? load.flow : null;
  const editingExisting = savedFlow !== null;

  async function save(overwrite: boolean): Promise<void> {
    const definition = validation.definition;
    if (!definition) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await api.createFlow(definition, overwrite);
      setSaved(draft);
      showToast({
        kind: "ok",
        text: `Saved ${result.flowId} to ${result.definitionPath}`,
      });
      onSaved(result.flowId);
    } catch (err) {
      setSaveError(err);
    } finally {
      setSaving(false);
    }
  }

  async function fork(): Promise<void> {
    if (!savedFlow) return;
    setForking(true);
    try {
      await api.forkFlowToProject(savedFlow.id);
      await loadFlow();
      showToast({ kind: "ok", text: `${savedFlow.id} now lives in the project` });
    } catch (err) {
      setSaveError(err);
    } finally {
      setForking(false);
    }
  }

  async function leave(): Promise<void> {
    if (!dirty) {
      onBack();
      return;
    }
    const ok = await confirm({
      title: "Leave without saving?",
      message: "This flow has unsaved changes. Leaving discards them.",
      confirmLabel: "Discard changes",
      danger: true,
    });
    if (ok) onBack();
  }

  const crumbs = (
    <Breadcrumbs
      className="mb-3"
      items={[
        { label: "Flows", onClick: () => void leave() },
        {
          label: editingExisting ? (savedFlow?.label ?? draft.id) : "New flow",
          muted: true,
        },
      ]}
    />
  );

  if (load.phase === "loading") {
    return (
      <PageShell className="fade-up">
        {crumbs}
        <Skeleton label="Loading flow" className="flex flex-col gap-4">
          <SkeletonBlock h={26} w="30%" radius={8} />
          <div className="flex flex-wrap items-center gap-3 rounded-[20px] border border-[color:var(--line)] bg-coal-600 p-5">
            <SkeletonStats count={4} size="lg" />
            <div className="ml-auto flex gap-1.5 rounded-[14px] border border-[color:var(--line)] p-1.5">
              <SkeletonBlock w={72} h={30} />
              <SkeletonBlock w={104} h={30} />
            </div>
          </div>
          {/* The editor's two panes: identity + step list on the left, the
           * selected step's fields and the seats card on the right. */}
          <div className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {[0, 1].map((pane) => (
              <div key={pane} className="flex flex-col gap-4">
                <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4">
                  <SkeletonBlock h={16} w={112} />
                  <SkeletonRows className="mt-3" rows={3} meta />
                </div>
                <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4">
                  <SkeletonBlock h={16} w={88} />
                  <SkeletonRows className="mt-3" rows={6} lead="icon" meta trailing />
                </div>
              </div>
            ))}
          </div>
        </Skeleton>
      </PageShell>
    );
  }

  if (load.phase === "failed") {
    return (
      <PageShell className="fade-up">
        {crumbs}
        <ErrorView
          err={load.error}
          onRetry={() => void loadFlow()}
          actions={[{ label: "Back to flows", onClick: onBack, variant: "secondary" }]}
        />
      </PageShell>
    );
  }

  // Asked for a flow the catalog doesn't have.
  if (flowId && !savedFlow) {
    return (
      <PageShell className="fade-up">
        {crumbs}
        <ErrorView
          err={new Error(`No flow with the id "${flowId}"`)}
          override={{
            kicker: "Not found",
            title: "That flow isn't in the catalog",
            hint: "It may have been deleted or renamed. Open the catalog to pick another, or start a new flow.",
            retryable: true,
          }}
          onRetry={() => void loadFlow()}
          actions={[
            { label: "Back to flows", onClick: onBack, variant: "secondary" },
          ]}
        />
      </PageShell>
    );
  }

  // Built-in flows are read-only on disk. Forking is the real way in, so the
  // page offers it rather than showing a form whose every control is dead.
  if (savedFlow && savedFlow.source.kind !== "project") {
    return (
      <PageShell className="fade-up">
        {crumbs}
        <ErrorView
          err={new Error(`${savedFlow.label} is a ${savedFlow.source.kind} flow`)}
          override={{
            kicker: "Read-only",
            title: `${savedFlow.label} ships with vibestrate`,
            hint: "Forking copies it into .vibestrate/flows/ under your project, where it becomes editable. The original stays where it is.",
            retryable: false,
          }}
          actions={[
            {
              label: forking ? "Forking…" : "Fork into the project",
              onClick: () => void fork(),
              variant: "primary",
              iconLeft: <Copy className="h-3.5 w-3.5" strokeWidth={1.9} />,
            },
            { label: "Back to flows", onClick: onBack, variant: "secondary" },
          ]}
        />
        <ToastView toast={toast} variant="inline" prefix="glyph" className="mt-4" />
      </PageShell>
    );
  }

  const problems = validation.issues.length;
  const conflict = isConflict(saveError);

  // `fill` rather than the scrolling page canvas: the editor is a two-pane app
  // view, so the flow header and the save action stay put and each pane scrolls
  // its own contents.
  return (
    <PageShell variant="fill" className="fade-up">
      {crumbs}
      <PageHeader
        className="mb-4"
        title={
          editingExisting ? (
            <span className="flex items-baseline gap-2.5">
              {draft.label || draft.id}
              <span className="mono text-[12px] font-medium text-chalk-300">
                {draft.id}
              </span>
            </span>
          ) : (
            "New flow"
          )
        }
      />

      <section className="shrink-0 rounded-[20px] border border-[color:var(--line)] bg-coal-600 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-stretch gap-2">
            <StatTile size="lg" value={draft.steps.length} label="steps" />
            <StatTile size="lg" value={draft.seats.length} label="seats" />
            <StatTile
              size="lg"
              value={graphMode ? "graph" : "linear"}
              label="shape"
            />
            <StatTile
              size="lg"
              tone={problems > 0 ? "rose" : "emerald"}
              value={problems > 0 ? problems : "valid"}
              label={problems > 0 ? "problems" : "against the schema"}
            />
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-1.5 rounded-[14px] border border-[color:var(--line)] bg-coal-700 p-1.5">
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.8} />}
              onClick={() => void leave()}
            >
              Flows
            </Button>
            <Button
              variant="primary"
              size="sm"
              data-tour="flow-editor-save"
              disabled={saving || problems > 0 || (editingExisting && !dirty)}
              iconLeft={<Save className="h-3.5 w-3.5" strokeWidth={1.8} />}
              title={
                problems > 0
                  ? "The schema rejects this flow as it stands"
                  : editingExisting && !dirty
                    ? "Nothing has changed since the last save"
                    : "Write this flow to .vibestrate/flows/"
              }
              onClick={() => void save(editingExisting)}
            >
              {saving
                ? "Saving…"
                : editingExisting
                  ? "Save changes"
                  : "Create flow"}
            </Button>
          </div>
        </div>
      </section>

      {saveError ? (
        <ErrorView
          compact
          className="mt-4"
          err={saveError}
          actions={
            conflict
              ? [
                  {
                    label: "Replace the existing flow",
                    variant: "danger",
                    onClick: () => {
                      void (async () => {
                        const ok = await confirm({
                          title: "Replace that flow?",
                          message: `A project flow with the id "${draft.id}" already exists. Saving overwrites .vibestrate/flows/${draft.id}/flow.yml.`,
                          confirmLabel: "Replace it",
                          danger: true,
                        });
                        if (ok) await save(true);
                      })();
                    },
                  },
                ]
              : []
          }
        />
      ) : null}

      <ToastView
        toast={toast}
        variant="inline"
        prefix="glyph"
        className="mt-4 rounded-[12px] border px-3 py-2 text-[12.5px]"
      />

      <EditorSplit
        storageKey="vibestrate.flowEditor.split"
        className="mt-6 pb-5"
        left={
          <Stack>
            {/* The walkthrough rings these two cards, and the ring is drawn over
                the element's box - so the anchor sits on a wrapper here rather
                than inside the shared card components, which the Flow Builder
                renders too and which have no business carrying this page's
                tour. A bare wrapper is layout-neutral inside a Stack. */}
            <div data-tour="flow-editor-identity">
              <IdentityCard
                id={draft.id}
                version={draft.version}
                label={draft.label}
                description={draft.description}
                idLocked={editingExisting}
                issues={validation.flowIssues}
                onChange={patchDraft}
              />
            </div>
            <div data-tour="flow-editor-steps">
              <StepList
                steps={draft.steps}
                activeKey={activeKey}
                issuesByIndex={validation.stepIssues}
                onSelect={setActiveKey}
                onMove={reorder}
                onRemove={removeStep}
                onAdd={addStep}
              />
            </div>
          </Stack>
        }
        right={
          <Stack>
            {activeStep ? (
              <StepFields
                step={activeStep}
                index={activeIndex}
                steps={draft.steps}
                seats={draft.seats}
                issues={validation.stepIssues.get(activeIndex) ?? []}
                graphMode={graphMode}
                onChange={(next) => patchStep(activeStep.key, next)}
              />
            ) : null}
            <SeatsCard
              seats={draft.seats}
              issuesBySeat={validation.seatIssues}
              onChange={patchSeat}
              onAdd={addSeat}
              onRemove={removeSeat}
            />
            <LoopCard
              loop={draft.loop}
              steps={draft.steps}
              issues={validation.loopIssues}
              graphMode={graphMode}
              onChange={(loop) => patchDraft({ loop })}
            />
            {/* Last in the inspector column so a proposal never pushes the step
                being edited off screen. It sends the candidate - the shape the
                schema parses - whether or not it currently parses, which is
                what makes "this flow never validates, fix that" answerable. */}
            <AssistantPanel<FlowRevision>
              endpoint="/api/flows/revise"
              // The panel posts `{ ...draft, instruction }` and the route body
              // is strict, so the flow has to arrive under its own key rather
              // than spread across the top level. `problems` is clipped to the
              // route's caps here: a flow whose every step is broken exceeds
              // both, which is precisely when someone asks it to fix them.
              draft={{
                flow: candidate,
                problems: validation.issues
                  .slice(0, 40)
                  .map((issue) => issue.message.slice(0, 400)),
              }}
              parseReply={(raw) => {
                const { revision } = raw as { revision: FlowRevision };
                // A question comes back as a revision with a null flow. Nulling
                // it here is what puts the panel in its answer state instead of
                // offering Apply against an edit that was never proposed.
                return {
                  answer: revision.answer,
                  revision: revision.flow ? revision : null,
                };
              }}
              purpose="One instruction, and the supervisor proposes it on this flow or answers a question about it."
              placeholder="e.g. this flow never validates - fix that"
              examples={[
                "Add a second reviewer",
                "Split the build step in two",
                "Why is a seat uncovered?",
              ]}
              renderChange={(revision) => <RevisionChanges revision={revision} />}
              onApply={(revision) => {
                if (revision.flow) applyRevision(revision.flow);
              }}
            />
          </Stack>
        }
      />
    </PageShell>
  );
}

/**
 * What a proposed revision would change, as computed from the two definitions
 * server-side. Deliberately not the model's own account of what it did: an
 * assistant that claims it added a reviewer while adding none is the failure
 * this surface exists to catch.
 */
function RevisionChanges({ revision }: { revision: FlowRevision }) {
  return (
    <div>
      {revision.changes.length === 0 ? (
        <p className="text-[12.5px] leading-[1.5] text-chalk-200">
          {revision.flow === null
            ? "The supervisor proposed no edit."
            : "The revision came back identical to the flow on screen."}
        </p>
      ) : (
        <ul className="rounded-[12px] border border-[color:var(--line-soft)] bg-coal-600 px-3 py-1">
          {revision.changes.map((change, i) => (
            <li
              key={`${change.target}:${change.id ?? "loop"}:${i}`}
              className="border-b border-[color:var(--line-soft)] py-1.5 last:border-0"
            >
              <div className="text-[12.5px] leading-[1.45] text-chalk-100">
                {change.summary}
              </div>
              {/* The summary names the fields an edit touched but not their
                  values, so only an edit gets the before/after lines. */}
              {change.op === "edited" && change.fields.length > 0 ? (
                <ul className="mt-1 space-y-0.5">
                  {change.fields.map((field) => (
                    <li
                      key={field.name}
                      className="flex flex-wrap items-baseline gap-1.5 text-meta"
                    >
                      <span className="mono text-violet-soft">{field.name}</span>
                      <span className="line-clamp-2 text-chalk-200">
                        {field.before ?? "not set"}
                      </span>
                      <ArrowRight
                        className="h-3 w-3 shrink-0 text-chalk-200"
                        strokeWidth={1.8}
                        aria-hidden
                      />
                      <span className="line-clamp-2 text-chalk-100">
                        {field.after ?? "not set"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <AssistCurrencyReport currency={revision.currency} className="mt-3" />
    </div>
  );
}

/** The flow-creator refuses an existing id with 409 unless overwrite is set. */
function isConflict(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    (err as { status: unknown }).status === 409
  );
}

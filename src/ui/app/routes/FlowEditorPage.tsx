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
import { ArrowLeft, Copy, Save } from "lucide-react";
import { api } from "../../lib/api.js";
import { ErrorView } from "../../lib/error-view.js";
import { Button } from "../../components/design/Button.js";
import { LoadingState } from "../../components/design/ErrorState.js";
import { StatTile } from "../../components/design/StatTile.js";
import { ToastView, useToast } from "../../components/design/useToast.js";
import { useConfirm } from "../../components/design/ConfirmDialog.js";
import { Breadcrumbs } from "../../components/layout/Breadcrumbs.js";
import { Cell, Deck, Stack } from "../../components/layout/Deck.js";
import { PageHeader, PageShell } from "../../components/layout/PageShell.js";
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
import type { DiscoveredFlow } from "../../lib/types.js";

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
        <LoadingState title="Opening the flow" detail="Reading the flow catalog." />
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

  return (
    <PageShell className="fade-up">
      {crumbs}
      <PageHeader
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

      <section className="rounded-[20px] border border-[color:var(--line)] bg-coal-600 p-5">
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

      <Deck className="mt-6">
        <Cell size="wide">
          <Stack>
            <IdentityCard
              id={draft.id}
              version={draft.version}
              label={draft.label}
              description={draft.description}
              idLocked={editingExisting}
              issues={validation.flowIssues}
              onChange={patchDraft}
            />
            <StepList
              steps={draft.steps}
              activeKey={activeKey}
              issuesByIndex={validation.stepIssues}
              onSelect={setActiveKey}
              onMove={reorder}
              onRemove={removeStep}
              onAdd={addStep}
            />
          </Stack>
        </Cell>
        <Cell size="card">
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
          </Stack>
        </Cell>
      </Deck>
    </PageShell>
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

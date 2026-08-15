// The Flow Builder route: edit one flow definition (label, steps, adaptive
// loop) and save it to .vibestrate/flows/<id>/flow.yml. Built-in flows load
// here read-only: the save, delete, and add/remove/reorder handlers return
// early unless `selected.source.kind === "project"`, and the way to edit a
// built-in is "Fork to project" first.
//
// The draft model is the part to understand before changing anything:
//  - Field edits on a step accumulate in `draftSteps`, keyed by step id, and
//    save as the `steps` patch (only the changed fields, per step).
//  - The moment a step is added, removed, or reordered we give up on that patch
//    model: `draftStepList` captures the whole list and the save switches to
//    `replaceSteps`, folding any per-step field drafts back in by step id
//    (which is why a reorder keeps each step's in-progress edits).
//  - `pendingPatch` derives whichever of those two applies. It is also the
//    dirty flag. A field-only draft that diffs to nothing reads as clean; once
//    `draftStepList` exists the patch always carries `replaceSteps`, so a
//    structural edit that nets back to the saved list still reads dirty.
//
// Undo/redo keeps its snapshot stack in a ref (`histRef`); the `histVer` state
// exists only to re-render the toolbar when the pointer moves, and
// `applyingHist` keeps an undo/redo apply from being recorded as a new entry.
//
// The reset effect keys on `selected?.id`, so anything that replaces a flow's
// definition without changing its id (the raw-YAML save does exactly that) has
// to resync the drafts by hand or the form view shows stale fields.
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Code, Copy, Eye, Flag, Plus, Save } from "lucide-react";
import {
  api,
  type FlowPatch,
  type FlowStepFull,
  type FlowStepPatch,
} from "../../lib/api.js";
import { Button } from "../../components/design/Button.js";
import { EntityIcon } from "../../components/design/EntityIcon.js";
import { FlowCardMenu } from "../../components/design/FlowCard.js";
import { Select } from "../../components/design/Select.js";
import { StepKindLegend } from "../../components/design/StepKindLegend.js";
import { Skeleton, SkeletonText } from "../../components/design/Skeleton.js";
import { cn } from "../../components/design/cn.js";
import { useToast, ToastView } from "../../components/design/useToast.js";
import { useConfirm } from "../../components/design/ConfirmDialog.js";
import { PageShell } from "../../components/layout/PageShell.js";
import { PageHero } from "../../components/layout/PageHero.js";
import { PageHeroSkeleton } from "./page-skeletons.js";
import { EditorSplit } from "../../components/flow-builder/EditorSplit.js";
import { extractFlowFromYaml, renderFlowYaml } from "../../lib/flow-yaml.js";
import { DryRunModal } from "../../components/flow-builder/DryRunModal.js";
import { StepInspector, StepRow } from "../../components/flow-builder/StepInspector.js";
import { YamlGraphPreview } from "../../components/flow-builder/YamlGraphPreview.js";
import {
  LoopCard,
  PolicyCard,
  PreviewCard,
} from "../../components/flow-builder/previews.js";
import {
  applyDraftToFullStep,
  diffStep,
  foldStepDraftForDisplay,
  freshStepId,
  sameDraftSnap,
  stepOrderWarning,
  toFlowStepDefinition,
  toFlowStepFull,
  type DraftSnap,
  type StepDraft,
} from "../../components/flow-builder/transforms.js";

// CodeMirror is heavy (~140kB gzip); lazy-load it so it only ships when the
// Flow Builder's YAML mode is actually opened, not on every dashboard load.
const YamlEditor = lazy(() =>
  import("../../components/workflow/YamlEditor.js").then((m) => ({
    default: m.YamlEditor,
  })),
);
import type {
  DiscoveredFlow,
  FlowStepDefinition,
  FlowLoop,
  ResolvedFlowSnapshot,
} from "../../lib/types.js";

/**
 * The flow's identity mark: the shared flow glyph (the same one the catalog
 * cards and the sidebar draw, so a flow looks the same everywhere) carrying the
 * flag that marks the flow a task gets when it names none.
 *
 * The flag is the entire indicator. Being the default is a property of the
 * flow, and it used to be spelled out as a word in the breadcrumb, the title,
 * the picker and a pill - five renderings of one boolean.
 */
function FlowMark({
  runsByDefault,
  className,
}: {
  runsByDefault: boolean;
  className?: string;
}) {
  return (
    <span className="relative inline-flex">
      <EntityIcon entity="flow" size={40} className={className} />
      {runsByDefault ? (
        // Top-left: the glyph's bars ascend to the right, so that corner is the
        // one the badge can sit in without covering a bar.
        <span
          role="img"
          aria-label="Runs by default"
          title="Runs by default"
          className="absolute -left-2.5 -top-2 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-coal-600 text-emerald-400 ring-1 ring-emerald-400/45"
        >
          <Flag className="h-3 w-3" strokeWidth={2.4} aria-hidden />
        </span>
      ) : null}
    </span>
  );
}

export function FlowBuilderPage({
  initialFlowId,
  onBack,
}: {
  initialFlowId: string | null;
  onBack: () => void;
}) {
  const [flows, setFlows] = useState<DiscoveredFlow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialFlowId);
  const [activeStepIdx, setActiveStepIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState<string>("");
  const [draftSteps, setDraftSteps] = useState<Record<string, StepDraft>>({});
  // When the user adds / removes / reorders steps we abandon the
  // per-step `draftSteps` patch model and capture the full list here.
  // Saving the flow swaps to the `replaceSteps` patch operation.
  const [draftStepList, setDraftStepList] = useState<FlowStepFull[] | null>(
    null,
  );
  // The adaptive loop draft (null = no loop). Reset on flow switch + save.
  const [draftLoop, setDraftLoop] = useState<FlowLoop | null>(null);
  const [saving, setSaving] = useState(false);
  const [forking, setForking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { toast, showToast } = useToast(4000);
  // Dry-run preview: resolve the saved flow into the snapshot a real run
  // would instantiate (provider per slot, enabled steps, gates) - no run.
  const [dryRun, setDryRun] = useState<ResolvedFlowSnapshot | null>(null);
  const [dryRunBusy, setDryRunBusy] = useState(false);
  const [dryRunErr, setDryRunErr] = useState<string | null>(null);
  // Raw-YAML escape hatch: edit the flow's source directly (mirrors the
  // Providers page). View-only for builtins; saving a project flow's YAML goes
  // through the existing import writer (full schema + secret/size guards).
  const [yamlMode, setYamlMode] = useState(false);
  const [yamlText, setYamlText] = useState("");
  const [yamlError, setYamlError] = useState<string | null>(null);
  const [yamlSaving, setYamlSaving] = useState(false);
  // The project's persisted default flow (null = the built-in "default").
  const [defaultFlowId, setDefaultFlowId] = useState<string | null>(null);
  const [settingDefault, setSettingDefault] = useState(false);
  // Drag-to-reorder: the row being dragged and the row it's hovering over, so we
  // can dim the source (the browser draws the translucent ghost) and draw an
  // insertion line at the target.
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  // Undo/redo history over the whole draft tuple. One snapshot stack per loaded
  // flow; `applyingHist` guards the record effect from re-recording an undo/redo
  // apply. `histVer` only exists to re-render the toolbar's enabled state.
  const histRef = useRef<{ snaps: DraftSnap[]; idx: number }>({
    snaps: [],
    idx: -1,
  });
  const applyingHist = useRef(false);
  const [histVer, setHistVer] = useState(0);
  // Themed confirm dialog for the destructive / discard actions.
  // Consent for the destructive/discard actions goes through the shared
  // dialog (design/ConfirmDialog) rather than a second copy of the same
  // component living in this file.
  const { confirm } = useConfirm();

  const askDelete = async (): Promise<void> => {
    const ok = await confirm({
      title: "Delete this flow?",
      message: `Delete the project flow "${selected?.label ?? ""}"? This removes .vibestrate/flows/${selected?.id ?? ""}/ and can't be undone.`,
      confirmLabel: "Delete flow",
      danger: true,
    });
    if (ok) await handleDelete();
  };

  const askRestore = async (): Promise<void> => {
    const ok = await confirm({
      title: "Restore the saved flow?",
      message:
        "Discard all unsaved edits and restore this flow to its last saved state. You can still undo the restore afterwards.",
      confirmLabel: "Restore",
    });
    if (ok) restore();
  };

  useEffect(() => {
    let cancelled = false;
    void api
      .listFlows()
      .then((r) => {
        if (cancelled) return;
        setFlows(r.flows);
        setDefaultFlowId(r.defaultFlow ?? null);
        setSelectedId((cur) => cur ?? r.flows[0]?.id ?? null);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(
    () => flows.find((g) => g.id === selectedId) ?? flows[0] ?? null,
    [flows, selectedId],
  );

  async function runDryRun(): Promise<void> {
    if (!selected) return;
    setDryRunBusy(true);
    setDryRunErr(null);
    setDryRun(null);
    try {
      setDryRun(await api.resolveFlow(selected.id, { task: "Dry-run preview" }));
    } catch (err) {
      setDryRunErr(err instanceof Error ? err.message : String(err));
    } finally {
      setDryRunBusy(false);
    }
  }

  // Reset the draft buffers any time the selected flow changes - the
  // draft mirrors the on-disk flow until the user actually edits a
  // field. We diff against `selected` on save to figure out which fields
  // changed.
  useEffect(() => {
    if (!selected) return;
    setDraftLabel(selected.label);
    setDraftSteps({});
    setDraftStepList(null);
    setDraftLoop(selected.definition.loop ?? null);
    setActiveStepIdx(0);
    setYamlMode(false);
    setYamlError(null);
    // Reset the undo history to the saved flow as the baseline (index 0).
    histRef.current = {
      snaps: [
        {
          label: selected.label,
          steps: {},
          stepList: null,
          loop: selected.definition.loop ?? null,
        },
      ],
      idx: 0,
    };
    applyingHist.current = true; // the draft resets above must not record
    setHistVer((v) => v + 1);
  }, [selected?.id]);

  // Record a new history entry whenever the draft changes - unless the change
  // came from an undo/redo apply (guarded) or matches the current entry.
  useEffect(() => {
    if (!selected) return;
    if (applyingHist.current) {
      applyingHist.current = false;
      return;
    }
    const cur: DraftSnap = {
      label: draftLabel,
      steps: draftSteps,
      stepList: draftStepList,
      loop: draftLoop,
    };
    const h = histRef.current;
    const last = h.snaps[h.idx];
    if (last && sameDraftSnap(last, cur)) return;
    const snaps = [...h.snaps.slice(0, h.idx + 1), cur].slice(-50);
    histRef.current = { snaps, idx: snaps.length - 1 };
    setHistVer((v) => v + 1);
  }, [draftLabel, draftSteps, draftStepList, draftLoop, selected?.id]);


  // The list we render: the structural draft (if any) or the saved list, with
  // each step's in-progress field draft folded in so edits (label, kind,
  // optional, ...) show live in the rows - not only after a Save.
  const displayedSteps: FlowStepDefinition[] = useMemo(() => {
    if (!selected) return [];
    const list = draftStepList
      ? draftStepList.map(toFlowStepDefinition)
      : selected.definition.steps;
    return list.map((def) => foldStepDraftForDisplay(def, draftSteps[def.id]));
  }, [selected, draftStepList, draftSteps]);
  const activeStep =
    displayedSteps[Math.min(activeStepIdx, displayedSteps.length - 1)] ?? null;

  const isProjectFlow = selected?.source.kind === "project";

  // Patch we'd send for the *current* draft - also drives the dirty
  // indicator on the Save button. Pure derivation; recomputed on every
  // render (cheap, never touches state).
  const pendingPatch: FlowPatch | null = useMemo(() => {
    if (!selected) return null;
    const patch: FlowPatch = {};
    if (draftLabel !== selected.label) patch.label = draftLabel;
    if (draftStepList) {
      // Structural changes were made - ship the entire list (folding
      // any per-step field drafts in by step id) via `replaceSteps`.
      patch.replaceSteps = draftStepList.map((s) => {
        const draft = draftSteps[s.id];
        return applyDraftToFullStep(s, draft);
      });
    } else {
      const steps: FlowStepPatch[] = [];
      for (const [id, draft] of Object.entries(draftSteps)) {
        const cur = selected.definition.steps.find((s) => s.id === id);
        if (!cur) continue;
        const entry = diffStep(cur, draft);
        if (entry) steps.push({ id, ...entry });
      }
      if (steps.length > 0) patch.steps = steps;
    }
    const currentLoop = selected.definition.loop ?? null;
    if (JSON.stringify(draftLoop) !== JSON.stringify(currentLoop)) {
      patch.loop = draftLoop;
    }
    if (
      patch.label === undefined &&
      patch.steps === undefined &&
      patch.replaceSteps === undefined &&
      patch.loop === undefined
    )
      return null;
    return patch;
  }, [selected, draftLabel, draftSteps, draftStepList, draftLoop]);

  const dirty = pendingPatch !== null;

  async function handleSave(): Promise<void> {
    if (!selected || !pendingPatch || !isProjectFlow) return;
    setSaving(true);
    try {
      const result = await api.patchFlow(selected.id, pendingPatch);
      setFlows((cur) =>
        cur.map((g) => (g.id === result.flow.id ? result.flow : g)),
      );
      setDraftLabel(result.flow.label);
      setDraftSteps({});
      setDraftStepList(null);
      setDraftLoop(result.flow.definition.loop ?? null);
      showToast({
        kind: "ok",
        text: `Saved ${result.flow.label} (${result.definitionPath})`,
      });
    } catch (err) {
      showToast({
        kind: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }

  // Flip into raw-YAML mode, seeding the editor from the saved definition. We
  // refuse the flip when there are unsaved structured edits so the two editors
  // can't silently diverge (the user saves or discards first).
  function toggleYamlMode(): void {
    if (!selected) return;
    setYamlMode((on) => {
      if (!on) {
        setYamlText(renderFlowYaml(selected.definition));
        setYamlError(null);
      }
      return !on;
    });
  }

  async function handleSaveYaml(): Promise<void> {
    if (!selected || !isProjectFlow) return;
    setYamlError(null);
    // Light client check first: valid YAML + an id that matches THIS flow
    // (editing the id here would create a different flow, not edit this one).
    const parsed = extractFlowFromYaml(yamlText);
    if (parsed.error) {
      setYamlError(parsed.error);
      return;
    }
    if (parsed.id !== selected.id) {
      setYamlError(
        `The YAML \`id\` ("${parsed.id}") must match the flow being edited ("${selected.id}"). Use Flows -> Import to create a new flow.`,
      );
      return;
    }
    setYamlSaving(true);
    try {
      // The import writer re-validates the full schema and runs the size /
      // control-char / secret guards server-side, then atomically overwrites
      // .vibestrate/flows/<id>/flow.yml.
      const result = await api.importFlow({ yaml: yamlText, overwrite: true });
      setFlows((cur) =>
        cur.map((g) => (g.id === result.flow.id ? result.flow : g)),
      );
      setYamlText(renderFlowYaml(result.flow.definition));
      // A YAML save is a full replace; resync the structured drafts to the new
      // definition (the reset effect keys on flow id, which didn't change) so
      // flipping back to the form view doesn't show stale fields / spurious dirty.
      setDraftLabel(result.flow.label);
      setDraftSteps({});
      setDraftStepList(null);
      setDraftLoop(result.flow.definition.loop ?? null);
      showToast({
        kind: "ok",
        text: `Saved ${result.flow.label} (${result.definitionPath})`,
      });
    } catch (err) {
      setYamlError(err instanceof Error ? err.message : String(err));
    } finally {
      setYamlSaving(false);
    }
  }

  async function handleFork(): Promise<void> {
    if (!selected) return;
    setForking(true);
    try {
      const result = await api.forkFlowToProject(selected.id);
      setFlows((cur) =>
        cur.map((g) => (g.id === result.flow.id ? result.flow : g)),
      );
      showToast({
        kind: "ok",
        text: result.alreadyForked
          ? `${result.flowId} already lives in .vibestrate/flows/`
          : `Forked to ${result.definitionPath} - now editable`,
      });
    } catch (err) {
      showToast({
        kind: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setForking(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!selected || !isProjectFlow) return;
    setDeleting(true);
    try {
      await api.deleteFlow(selected.id);
      setFlows((cur) => cur.filter((g) => g.id !== selected.id));
      setSelectedId(null);
      showToast({ kind: "ok", text: `Deleted ${selected.id}` });
    } catch (err) {
      showToast({
        kind: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setDeleting(false);
    }
  }

  function patchStepDraft(stepId: string, patch: StepDraft) {
    setDraftSteps((cur) => ({
      ...cur,
      [stepId]: { ...(cur[stepId] ?? {}), ...patch },
    }));
  }

  function ensureStepList(): FlowStepFull[] {
    if (draftStepList) return draftStepList;
    if (!selected) return [];
    const list = selected.definition.steps.map((s) =>
      toFlowStepFull(s, draftSteps[s.id]),
    );
    return list;
  }

  function addStep(): void {
    if (!selected || !isProjectFlow) return;
    const list = ensureStepList();
    const id = freshStepId(list, "step");
    const next: FlowStepFull = {
      id,
      label: "New step",
      kind: "agent-turn",
      seat: Object.keys(selected.definition.seats)[0] ?? "",
      inputs: [],
      outputs: [],
      optional: false,
    };
    setDraftStepList([...list, next]);
    setActiveStepIdx(list.length);
  }

  function removeStep(stepId: string): void {
    if (!selected || !isProjectFlow) return;
    const list = ensureStepList();
    if (list.length <= 1) {
      showToast({
        kind: "err",
        text: "A flow must have at least one step.",
      });
      return;
    }
    const idx = list.findIndex((s) => s.id === stepId);
    if (idx < 0) return;
    setDraftStepList(list.filter((s) => s.id !== stepId));
    setActiveStepIdx(Math.max(0, Math.min(idx, list.length - 2)));
  }

  // Move the step at `from` to land at `to` (driven by drag-and-drop). Saves
  // through the same `draftStepList` / `replaceSteps` path as any other edit.
  function reorderStep(from: number, to: number): void {
    if (!selected || !isProjectFlow) return;
    const list = ensureStepList();
    if (from < 0 || from >= list.length) return;
    const target = Math.max(0, Math.min(to, list.length - 1));
    if (target === from) return;
    const next = list.slice();
    const [step] = next.splice(from, 1);
    next.splice(target, 0, step!);
    setDraftStepList(next);
    setActiveStepIdx(target);
  }

  // ── Undo / redo / restore over the draft history ──────────────────────────
  function applySnap(s: DraftSnap): void {
    applyingHist.current = true;
    setDraftLabel(s.label);
    setDraftSteps(s.steps);
    setDraftStepList(s.stepList);
    setDraftLoop(s.loop);
  }
  void histVer; // referenced only to re-render when the history pointer moves
  const canUndo = histRef.current.idx > 0;
  const canRedo = histRef.current.idx < histRef.current.snaps.length - 1;
  function undo(): void {
    const h = histRef.current;
    if (h.idx <= 0) return;
    h.idx -= 1;
    setHistVer((v) => v + 1);
    applySnap(h.snaps[h.idx]!);
  }
  function redo(): void {
    const h = histRef.current;
    if (h.idx >= h.snaps.length - 1) return;
    h.idx += 1;
    setHistVer((v) => v + 1);
    applySnap(h.snaps[h.idx]!);
  }
  // Restore = discard all unsaved edits back to the saved flow. Recorded as a
  // normal history entry (so the restore itself is undoable).
  function restore(): void {
    if (!selected) return;
    setDraftLabel(selected.label);
    setDraftSteps({});
    setDraftStepList(null);
    setDraftLoop(selected.definition.loop ?? null);
  }

  // The YAML view reads the *saved* definition, so unsaved structured edits
  // would be silently dropped by the flip. The refusal says which two controls
  // clear it rather than leaving a control that does nothing.
  function openYaml(): void {
    if (!yamlMode && dirty) {
      showToast({
        kind: "err",
        text: "Save or restore your edits first - the YAML view reads the saved flow.",
      });
      return;
    }
    toggleYamlMode();
  }

  const isDefaultFlow = !!selected && selected.id === (defaultFlowId ?? "default");
  // Counted off the draft list, so the header tracks what a save would write
  // rather than what is currently on disk.
  const gateCount = displayedSteps.filter(
    (s) => s.kind === "approval-gate" || !!s.approval,
  ).length;
  const seatIds = selected ? Object.keys(selected.definition.seats) : [];
  // Switching flow is a jump, not a value: offering the flow already open would
  // restate the title in a control that then does nothing.
  const otherFlowOptions = flows
    .filter((g) => g.id !== selected?.id)
    .map((g) => ({ value: g.id, label: g.label }));

  // One fact in the state column, in severity order: a flow this page cannot
  // save, then work that is not on disk yet, then which flow a task gets when
  // it names none. The mark carries the default flag in every case.
  const heroState = !selected
    ? undefined
    : !isProjectFlow
      ? {
          value: <FlowMark runsByDefault={isDefaultFlow} className="text-amber-soft" />,
          caption: "Built in",
          note: "Its steps are fixed. Forking makes a copy you can edit.",
          tone: "amber" as const,
        }
      : dirty
        ? {
            value: <FlowMark runsByDefault={isDefaultFlow} className="text-violet-vivid" />,
            caption: "Unsaved edits",
            tone: "violet" as const,
          }
        : isDefaultFlow
          ? {
              value: <FlowMark runsByDefault className="text-emerald-400" />,
              caption: "The one that runs",
              note: "Runs unless a task picks another flow.",
              tone: "emerald" as const,
            }
          : {
              value: <FlowMark runsByDefault={false} className="text-violet-vivid" />,
              caption: "Runs when picked",
              tone: "violet" as const,
            };

  // `fill` rather than the scrolling page canvas: this is a two-pane app view,
  // so the header and the save action stay put while each pane scrolls its own
  // contents.
  return (
    <PageShell variant="fill" className="fade-up">
      {/* One header: the flow's mark and its state on the left, the name itself
          as the page title (it is the editable field, so the title is the
          input), the facts as one divided strip, and the actions on the title
          row. The name is printed once - the picker, the breadcrumb leaf and
          the slug all restated it. */}
      {selected ? (
        <PageHero
          className="shrink-0"
          state={heroState}
          title={
            <>
              {/* The title is the name field, so the heading itself has no text
                  of its own - this gives the h1 back its accessible name. */}
              <span className="sr-only">{selected.label}</span>
              <input
                value={draftLabel}
                onChange={(e) => setDraftLabel(e.target.value)}
                readOnly={!isProjectFlow || yamlMode}
                aria-label="Flow name"
                spellCheck={false}
                title={
                  !isProjectFlow
                    ? "Fork this flow into your project to rename it"
                    : yamlMode
                      ? "The YAML below is the source while it is open"
                      : "Rename this flow"
                }
                className={cn(
                  "t-page w-[420px] min-w-0 max-w-full border-b border-transparent bg-transparent text-chalk-100 outline-none transition",
                  isProjectFlow && !yamlMode
                    ? "hover:border-[color:var(--line-strong)] focus:border-violet-soft/60"
                    : "cursor-default",
                )}
              />
            </>
          }
          purpose={
            selected.definition.description ||
            "A flow is the steps a run follows, and who runs each one."
          }
          actions={
            <>
              <Button
                variant="ghost"
                size="sm"
                iconLeft={<ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.9} />}
                onClick={onBack}
              >
                All flows
              </Button>
              {otherFlowOptions.length > 0 ? (
                <Select
                  value=""
                  placeholder="Switch flow"
                  ariaLabel="Open another flow"
                  /* The trigger is a jump control, not a filled field, so its
                   * text reads at label weight instead of placeholder grey. */
                  className="w-[128px] [&>button>span]:text-chalk-300"
                  options={otherFlowOptions}
                  onChange={(v) => {
                    setSelectedId(v);
                    setActiveStepIdx(0);
                  }}
                />
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                disabled={dryRunBusy}
                iconLeft={<Eye className="h-3.5 w-3.5" strokeWidth={1.8} />}
                onClick={() => void runDryRun()}
                title="Resolve this flow into the run it would create - no run starts"
              >
                {dryRunBusy ? "Resolving…" : "Dry run"}
              </Button>
              {yamlMode ? (
                <Button
                  variant="secondary"
                  size="sm"
                  iconLeft={<Code className="h-3.5 w-3.5" strokeWidth={1.8} />}
                  onClick={openYaml}
                  title="Back to the structured editor"
                >
                  Form view
                </Button>
              ) : null}
              {/* A builtin has nothing this page can write, so the fork - the
                  action that makes it writable - takes the primary slot. */}
              {isProjectFlow ? (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={yamlMode ? yamlSaving : !dirty || saving}
                  iconLeft={<Save className="h-3.5 w-3.5" strokeWidth={2} />}
                  title={
                    yamlMode
                      ? "Validate + save this YAML to .vibestrate/flows/"
                      : !dirty
                        ? "No changes to save"
                        : "Save changes to .vibestrate/flows/"
                  }
                  onClick={() => void (yamlMode ? handleSaveYaml() : handleSave())}
                >
                  {yamlMode
                    ? yamlSaving
                      ? "Saving…"
                      : "Save YAML"
                    : saving
                      ? "Saving…"
                      : "Save changes"}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={forking}
                  iconLeft={<Copy className="h-3.5 w-3.5" strokeWidth={1.9} />}
                  onClick={() => void handleFork()}
                  title="Copy this flow into .vibestrate/flows/<id>/flow.yml so you can edit it"
                >
                  {forking ? "Forking…" : "Fork to project"}
                </Button>
              )}
              {/* Edit history, the YAML escape hatch, the default and the
                  destructive action are demoted, not dropped: each stays one
                  click away and is offered only while it can do something. The
                  action that SETS the default keeps its verb (the same one the
                  catalog card's menu uses); the flag on the mark is what says
                  it is already done, so no control reports its own success. */}
              <FlowCardMenu
                items={[
                  canUndo ? { label: "Undo", onClick: undo } : null,
                  canRedo ? { label: "Redo", onClick: redo } : null,
                  dirty && isProjectFlow
                    ? { label: "Restore saved flow", onClick: () => void askRestore() }
                    : null,
                  yamlMode ? null : { label: "Edit as YAML", onClick: openYaml },
                  isDefaultFlow
                    ? null
                    : {
                        label: settingDefault ? "Setting…" : "Use as default",
                        onClick: () => {
                          setSettingDefault(true);
                          void api
                            .setDefaultFlow(selected.id)
                            .then(() => {
                              setDefaultFlowId(selected.id);
                              showToast({
                                kind: "ok",
                                text: `"${selected.label}" now runs by default.`,
                              });
                            })
                            .catch((err) =>
                              showToast({
                                kind: "err",
                                text: err instanceof Error ? err.message : String(err),
                              }),
                            )
                            .finally(() => setSettingDefault(false));
                        },
                      },
                  isProjectFlow
                    ? {
                        label: deleting ? "Deleting…" : "Delete flow",
                        onClick: () => void askDelete(),
                        danger: true,
                      }
                    : null,
                ]}
              />
            </>
          }
          metrics={[
            {
              value: displayedSteps.length,
              label: displayedSteps.length === 1 ? "step" : "steps",
            },
            { value: seatIds.length, label: seatIds.length === 1 ? "seat" : "seats" },
            { value: gateCount, label: gateCount === 1 ? "gate" : "gates" },
            { value: `v${selected.version}`, label: "version" },
          ]}
          footer={
            <span className="mono min-w-0 truncate text-chalk-300">
              {seatIds.join(" · ")}
            </span>
          }
        />
      ) : (
        <PageHeroSkeleton label="Loading the flow" />
      )}

      {error ? (
        <div className="mt-4 rounded-[12px] border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-300">
          {error}
        </div>
      ) : null}
      <ToastView
        toast={toast}
        variant="inline"
        prefix="glyph"
        className="mt-4 rounded-[12px] border px-3 py-2 text-[12.5px]"
      />

      {selected && yamlMode ? (
        <section className="mt-6 min-h-0 flex-1 overflow-y-auto pb-5">
          <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-5 fade-up">
            <div className="mb-3">
              <div className="text-[12px] font-semibold text-violet-vivid">Raw YAML</div>
              <div className="mt-0.5 text-[12.5px] text-chalk-300">
                The flow's source. Saving validates the full schema and runs the
                secret / size guards server-side.
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div
                className={cn(
                  "min-w-0 rounded-[12px] border bg-coal-900",
                  yamlError
                    ? "border-rose-400/40"
                    : "border-violet-soft/30",
                  !isProjectFlow ? "opacity-80" : "",
                )}
              >
                <Suspense
                  fallback={
                    <Skeleton
                      label="Loading the YAML editor"
                      className="flex flex-col gap-2 px-3 py-2.5"
                    >
                      {/* Mono lines at the editor's own rhythm, so the pane does
                       * not collapse to one row and snap open on arrival. */}
                      <SkeletonText lines={12} width="full" size={11} gap={7} />
                    </Skeleton>
                  }
                >
                  <YamlEditor
                    value={yamlText}
                    onChange={setYamlText}
                    readOnly={!isProjectFlow}
                  />
                </Suspense>
              </div>
              <div className="min-w-0">
                <YamlGraphPreview yamlText={yamlText} />
              </div>
            </div>
            {yamlError ? (
              <div className="mt-2 rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300 whitespace-pre-wrap">
                {yamlError}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {selected && !yamlMode ? (
        <EditorSplit
          storageKey="vibestrate.flowBuilder.split"
          className="mt-6 pb-5"
          left={
            <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-5 fade-up">
              {/* The flow's name is the page title now; this card owns the
                  steps, so its header is the step legend. */}
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-[12px] font-semibold text-violet-vivid">Steps</div>
                <StepKindLegend />
              </div>

              <ol className="relative space-y-2.5 pl-8">
                <span className="absolute left-[14px] top-3 bottom-3 w-px bg-[color:var(--line-soft)]" />
                {displayedSteps.map((step, i) => (
                  <StepRow
                    key={step.id}
                    step={step}
                    idx={i}
                    active={i === activeStepIdx}
                    onClick={() => setActiveStepIdx(i)}
                    editable={isProjectFlow}
                    canRemove={displayedSteps.length > 1}
                    onRemove={() => removeStep(step.id)}
                    warning={stepOrderWarning(displayedSteps, i)}
                    dragging={dragIdx === i}
                    dropBelow={dragOverIdx === i && dragIdx !== null && dragIdx < i}
                    dropAbove={dragOverIdx === i && dragIdx !== null && dragIdx > i}
                    onDragStart={() => setDragIdx(i)}
                    onDragOverRow={() => setDragOverIdx(i)}
                    onDropRow={() => {
                      if (dragIdx !== null) reorderStep(dragIdx, i);
                      setDragIdx(null);
                      setDragOverIdx(null);
                    }}
                    onDragEnd={() => {
                      setDragIdx(null);
                      setDragOverIdx(null);
                    }}
                  />
                ))}
                {isProjectFlow ? (
                  <li className="relative pl-1">
                    <span className="absolute -left-[27px] top-[12px] w-3.5 h-3.5 rounded-full border border-dashed border-[color:var(--line-soft)]" />
                    <button
                      type="button"
                      onClick={addStep}
                      className="rounded-[12px] border border-dashed border-[color:var(--line)] hover:border-violet-soft/40 hover:bg-violet-soft/10 px-3 py-2.5 text-[12.5px] text-chalk-300 hover:text-chalk-100 flex items-center gap-2 w-full transition"
                    >
                      <Plus className="h-3 w-3" strokeWidth={1.7} /> Add step
                    </button>
                  </li>
                ) : null}
              </ol>
            </div>
          }
          right={
            <div className="space-y-4">
              <StepInspector
                step={activeStep}
                flow={selected}
                editable={isProjectFlow}
                warning={stepOrderWarning(
                  displayedSteps,
                  Math.min(activeStepIdx, displayedSteps.length - 1),
                )}
                draft={activeStep ? draftSteps[activeStep.id] ?? {} : {}}
                onPatchDraft={(patch) =>
                  activeStep && patchStepDraft(activeStep.id, patch)
                }
              />
              <LoopCard
                steps={displayedSteps}
                loop={draftLoop}
                editable={isProjectFlow}
                onChange={setDraftLoop}
              />
              <PolicyCard />
              <PreviewCard steps={displayedSteps} />
            </div>
          }
        />
      ) : null}

      {dryRun || dryRunBusy || dryRunErr ? (
        <DryRunModal
          snapshot={dryRun}
          busy={dryRunBusy}
          error={dryRunErr}
          flowId={selected?.id ?? ""}
          onClose={() => {
            setDryRun(null);
            setDryRunErr(null);
          }}
        />
      ) : null}

    </PageShell>
  );
}


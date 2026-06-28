import { Fragment, Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Book,
  Bolt,
  Bug,
  ChevronLeft,
  ChevronRight,
  Code,
  Copy,
  Cpu,
  Eye,
  FileCheck,
  Flag,
  GripVertical,
  Layers,
  Lock,
  Plus,
  Redo2,
  Rocket,
  RotateCcw,
  Save,
  Scale,
  ShieldCheck,
  Shuffle,
  Trash2,
  Undo2,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  api,
  type FlowApprovalGatePatch,
  type FlowApprovalRiskLevel,
  type FlowPatch,
  type FlowStepFull,
  type FlowStepKind,
  type FlowStepPatch,
} from "../../lib/api.js";
import { Button } from "../../components/design/Button.js";
import { Chip } from "../../components/design/Chip.js";
import { StatTile } from "../../components/design/StatTile.js";
import { HelpHint } from "../../components/design/HelpHint.js";
import { Select } from "../../components/design/Select.js";
import { StepKindLegend } from "../../components/design/StepKindLegend.js";
import {
  STEP_GROUP_TONE,
  stepKindGroup,
} from "../../components/design/stepKind.js";
import { cn } from "../../components/design/cn.js";
import { FlowGraph, isGraphSteps } from "../../components/workflow/FlowGraph.js";
import { extractFlowFromYaml, renderFlowYaml } from "../../lib/flow-yaml.js";

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
  ResolvedFlowStep,
} from "../../lib/types.js";

/**
 * Per-step draft. Each field mirrors the YAML's optional shape with the
 * dashboard's "null means clear, undefined means leave alone" contract
 * from the API. Built lazily when the user first edits a step so the
 * diff-against-source is straightforward.
 */
type StepDraft = {
  label?: string;
  optional?: boolean;
  kind?: FlowStepKind;
  // null = clear; undefined = no change; string = set
  seat?: string | null;
  approval?: FlowApprovalGatePatch | null;
  // Per-step skills (P2): undefined = no change; array = set the whole list.
  skills?: string[];
  // Free-form per-step prompt instructions: undefined = no change; null = clear;
  // string = set.
  instructions?: string | null;
};

// A snapshot of the whole editable draft, for undo/redo. The four pieces mirror
// the draft* state in FlowBuilderPage. Snapshots are immutable (every mutation
// replaces the object/array rather than mutating it), so storing references is
// safe.
type DraftSnap = {
  label: string;
  steps: Record<string, StepDraft>;
  stepList: FlowStepFull[] | null;
  loop: FlowLoop | null;
};

function sameDraftSnap(a: DraftSnap, b: DraftSnap): boolean {
  return (
    a.label === b.label &&
    JSON.stringify(a.steps) === JSON.stringify(b.steps) &&
    JSON.stringify(a.stepList) === JSON.stringify(b.stepList) &&
    JSON.stringify(a.loop) === JSON.stringify(b.loop)
  );
}

const STEP_KINDS: FlowStepKind[] = [
  "agent-turn",
  "review-turn",
  "response-turn",
  "validation",
  "approval-gate",
  "summary-turn",
];

// What each step kind actually does, so the picker isn't six unexplained
// labels. `phase` is the run status the step drives (the orchestrator maps each
// kind to one); it's the clearest way to tell the turn kinds apart. Sourced from
// docs/content/extending/add-flow.md + core/orchestrator.ts (flowStatusForStep).
const KIND_INFO: Record<
  FlowStepKind,
  { title: string; phase: string; blurb: string; icon: LucideIcon }
> = {
  "agent-turn": {
    title: "Agent turn",
    phase: "plan / architect / build",
    icon: Cpu,
    blurb:
      "One seat does primary work - plans, architects, or writes the change. These are the build steps.",
  },
  "review-turn": {
    title: "Review turn",
    phase: "reviewing",
    icon: Eye,
    blurb:
      "A different seat critiques a prior step's work and raises findings. Who reviews (and with what lens) is the seat you bind below, filled by the crew at run time.",
  },
  "response-turn": {
    title: "Response turn",
    phase: "fixing",
    icon: Wrench,
    blurb:
      "The original seat answers the review's findings - applies fixes or pushes back.",
  },
  validation: {
    title: "Validation",
    phase: "validating",
    icon: ShieldCheck,
    blurb:
      "Runs the project's validate commands (build / test / lint). No agent - a pass/fail check.",
  },
  "approval-gate": {
    title: "Approval gate",
    phase: "waiting for approval",
    icon: Lock,
    blurb:
      "Pauses the run for a person to sign off before it continues - they review the work so far (the diff + the prior step's output) and Approve or Reject. No agent runs.",
  },
  "summary-turn": {
    title: "Summary turn",
    phase: "verifying",
    icon: FileCheck,
    blurb:
      "A final seat verifies the result and writes the run's summary. The closing step.",
  },
};

const RISK_LEVELS: FlowApprovalRiskLevel[] = ["low", "medium", "high"];

const ICON_FOR_NAME: { match: RegExp; icon: LucideIcon }[] = [
  { match: /quality|arbitr/i, icon: Scale },
  { match: /ship.?fast/i, icon: Rocket },
  { match: /deep|refactor/i, icon: Layers },
  { match: /bug|loop/i, icon: Bug },
  { match: /doc/i, icon: Book },
  { match: /migr|move|shuffle/i, icon: Shuffle },
];

// Builder-side sanity check (warn-only, never blocks): a step that acts on prior
// work - a review, a response, a final summary, or an approval gate - makes no
// sense before any agent-turn has actually produced something. Returns a
// human-readable warning, or null when the step is fine where it sits.
const ACTS_ON_PRIOR: ReadonlySet<FlowStepKind> = new Set([
  "review-turn",
  "response-turn",
  "summary-turn",
  "approval-gate",
]);
function stepOrderWarning(
  steps: FlowStepDefinition[],
  index: number,
): string | null {
  const kind = steps[index]?.kind;
  if (!kind || !ACTS_ON_PRIOR.has(kind)) return null;
  const hasPriorWork = steps
    .slice(0, index)
    .some((s) => s.kind === "agent-turn");
  if (hasPriorWork) return null;
  const what =
    kind === "approval-gate"
      ? "An approval gate here has nothing to approve"
      : kind === "summary-turn"
        ? "A summary-turn here has nothing to summarize"
        : kind === "response-turn"
          ? "A response-turn here has no findings to answer"
          : "A review-turn here has nothing to review";
  return `${what} - no agent-turn produces work before it. Add an agent-turn first.`;
}

function flowIcon(label: string): LucideIcon {
  for (const row of ICON_FOR_NAME) if (row.match.test(label)) return row.icon;
  return Layers;
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
  const [toast, setToast] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);
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
  const [confirm, setConfirm] = useState<"delete" | "restore" | null>(null);

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

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

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
      // any per-step field drafts into the right index) via
      // `replaceSteps`.
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
      setToast({
        kind: "ok",
        text: `Saved ${result.flow.label} (${result.definitionPath})`,
      });
    } catch (err) {
      setToast({
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
      setToast({
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
      setToast({
        kind: "ok",
        text: result.alreadyForked
          ? `${result.flowId} already lives in .vibestrate/flows/`
          : `Forked to ${result.definitionPath} - now editable`,
      });
    } catch (err) {
      setToast({
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
      setToast({ kind: "ok", text: `Deleted ${selected.id}` });
    } catch (err) {
      setToast({
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
      setToast({
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

  return (
    <div className="font-jakarta px-10 py-7 fade-up">
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-[12.5px] text-chalk-300 hover:text-chalk-100"
        >
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.7} /> Flows
        </button>
        <span className="text-chalk-400">/</span>
        <span className="text-[12.5px] text-chalk-300 truncate max-w-[200px]">
          {selected?.label ?? "Editor"}
        </span>
      </header>

      {/* Contained flow header: the picker, the flow's facts as stat tiles, the
          read-only state, and a carded action toolbar - one framed block, so no
          fact reads as a grey meta line and no action is stranded at the far
          right of the page. */}
      <section className="mt-5 rounded-[20px] border border-[color:var(--line)] bg-coal-600 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={selected?.id ?? ""}
            ariaLabel="Select flow"
            className="max-w-[320px]"
            onChange={(v) => {
              setSelectedId(v);
              setActiveStepIdx(0);
            }}
            options={flows.map((g) => ({
              value: g.id,
              label: g.label,
              hint: g.source.kind === "project" ? "project" : g.source.kind,
            }))}
          />
          {selected && !isProjectFlow ? (
            <span className="inline-flex items-center gap-1.5 rounded-[10px] border border-amber-soft/25 bg-amber-soft/10 px-2.5 py-1 text-[11.5px] font-medium text-amber-soft">
              <Lock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.9} aria-hidden />
              Read-only - fork into the project to edit it.
            </span>
          ) : null}

          {/* Carded action toolbar - the page's flow actions, contained in one
              framed group instead of floating buttons. */}
          <div className="ml-auto flex flex-wrap items-center gap-1.5 rounded-[14px] border border-[color:var(--line)] bg-coal-700 p-1.5">
            {/* Edit history - undo / redo / restore the draft (project flows). */}
            {isProjectFlow ? (
              <div className="flex items-center gap-1.5 border-r border-[color:var(--line)] pr-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!canUndo}
                  onClick={undo}
                  title="Undo the last edit"
                  aria-label="Undo"
                  className="!px-2"
                >
                  <Undo2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!canRedo}
                  onClick={redo}
                  title="Redo"
                  aria-label="Redo"
                  className="!px-2"
                >
                  <Redo2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!dirty}
                  onClick={() => setConfirm("restore")}
                  title="Discard all unsaved edits and restore the saved flow"
                  iconLeft={<RotateCcw className="h-3.5 w-3.5" strokeWidth={1.8} />}
                >
                  Restore
                </Button>
              </div>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              disabled={!selected || dryRunBusy}
              iconLeft={<Eye className="h-3 w-3" strokeWidth={1.7} />}
              onClick={() => void runDryRun()}
              title="Resolve this flow into the run it would create - no run starts"
            >
              {dryRunBusy ? "Resolving…" : "Dry-run preview"}
            </Button>
            {selected && !isProjectFlow ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={forking}
                iconLeft={<Copy className="h-3 w-3" strokeWidth={1.7} />}
                onClick={() => void handleFork()}
                title="Copy this flow into .vibestrate/flows/<id>/flow.yml so you can edit it"
              >
                {forking ? "Forking…" : "Fork to project"}
              </Button>
            ) : null}
            {selected && isProjectFlow ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={deleting}
                iconLeft={<Trash2 className="h-3 w-3" strokeWidth={1.7} />}
                onClick={() => setConfirm("delete")}
                title="Delete this project flow"
                className="!text-rose-300/90 hover:!text-rose-200"
              >
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            ) : null}
            {selected ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={!yamlMode && dirty}
                title={
                  yamlMode
                    ? "Back to the structured editor"
                    : dirty
                      ? "Save or discard your structured edits first"
                      : "Edit the flow's raw YAML"
                }
                iconLeft={<Code className="h-3 w-3" strokeWidth={1.7} />}
                onClick={toggleYamlMode}
              >
                {yamlMode ? "Form view" : "Edit as YAML"}
              </Button>
            ) : null}
            {/* Read-only builtins get no Save button at all - a permanently
             * disabled Save next to "Fork to project" just restated the card's
             * own "read-only" note. */}
            {!isProjectFlow ? null : yamlMode ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={yamlSaving}
                title="Validate + save this YAML to .vibestrate/flows/"
                iconLeft={<Save className="h-3 w-3" strokeWidth={1.7} />}
                onClick={() => void handleSaveYaml()}
              >
                {yamlSaving ? "Saving…" : "Save YAML"}
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                disabled={!dirty || saving}
                title={
                  !dirty ? "No changes to save" : "Save changes to .vibestrate/flows/"
                }
                iconLeft={<Save className="h-3 w-3" strokeWidth={1.7} />}
                onClick={() => void handleSave()}
              >
                {saving ? "Saving…" : "Save changes"}
              </Button>
            )}
            {/* "Use this flow" used to be a primary button that only navigated
             * back - it set nothing. This one performs the real action (same
             * API as the Flows page) or honestly reports it's already done. */}
            {selected && selected.id === (defaultFlowId ?? "default") ? (
              <span className="inline-flex items-center gap-1.5 rounded-[10px] border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11.5px] font-semibold text-emerald-400">
                <Flag className="h-3 w-3" strokeWidth={1.9} aria-hidden /> Runs by default
              </span>
            ) : (
              <Button
                variant="primary"
                size="sm"
                disabled={!selected || settingDefault}
                iconLeft={<Flag className="h-3 w-3" strokeWidth={1.7} />}
                title="Make this the project's default flow"
                onClick={() => {
                  if (!selected) return;
                  setSettingDefault(true);
                  void api
                    .setDefaultFlow(selected.id)
                    .then(() => {
                      setDefaultFlowId(selected.id);
                      setToast({
                        kind: "ok",
                        text: `"${selected.label}" now runs by default.`,
                      });
                    })
                    .catch((err) =>
                      setToast({
                        kind: "err",
                        text: err instanceof Error ? err.message : String(err),
                      }),
                    )
                    .finally(() => setSettingDefault(false));
                }}
              >
                {settingDefault ? "Setting…" : "Use as default"}
              </Button>
            )}
          </div>
        </div>

        {/* The flow's facts as stat tiles - full width below the picker row, so
            they read horizontally instead of stacking when the toolbar is wide. */}
        {selected ? (
          <div className="mt-4 flex flex-wrap items-stretch gap-2">
            <StatTile size="lg" value={selected.definition.steps.length} label="steps" />
            <StatTile size="lg" value={Object.keys(selected.definition.seats).length} label="seats" />
            <StatTile size="lg" value={`v${selected.version}`} label="version" />
            <StatTile size="lg" value={selected.source.kind} label="source" />
          </div>
        ) : null}
      </section>

      {error ? (
        <div className="mt-4 rounded-[12px] border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-300">
          {error}
        </div>
      ) : null}
      {toast ? (
        <div
          role="status"
          className={
            toast.kind === "ok"
              ? "mt-4 rounded-[12px] border px-3 py-2 text-[12.5px] border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
              : "mt-4 rounded-[12px] border px-3 py-2 text-[12.5px] border-rose-400/30 bg-rose-500/10 text-rose-300"
          }
        >
          {toast.kind === "ok" ? "✓ " : "✗ "}
          {toast.text}
        </div>
      ) : null}

      {selected && yamlMode ? (
        <section className="mt-8">
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
                    <div className="px-3 py-2.5 text-[11.5px] text-chalk-400">
                      Loading editor…
                    </div>
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
        <section className="mt-8 grid grid-cols-12 gap-5">
          <div className="col-span-12 xl:col-span-7">
            <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-5 fade-up">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-[12px] bg-violet-soft/15 text-violet-soft ring-1 ring-violet-soft/20 flex items-center justify-center shrink-0">
                  {(() => {
                    const Icon = flowIcon(selected.label);
                    return <Icon className="h-4 w-4" strokeWidth={1.7} />;
                  })()}
                </div>
                <input
                  value={draftLabel}
                  onChange={(e) => setDraftLabel(e.target.value)}
                  disabled={!isProjectFlow}
                  aria-label="Flow name"
                  className={
                    "min-w-0 flex-1 bg-transparent border-b border-transparent transition outline-none text-[20px] font-semibold tracking-tight text-chalk-100 " +
                    (isProjectFlow
                      ? "hover:border-[color:var(--line-strong)] focus:border-violet-soft/40"
                      : "opacity-70 cursor-not-allowed")
                  }
                />
              </div>

              <StepKindLegend className="mb-3" />

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
          </div>

          <div className="col-span-12 xl:col-span-5 space-y-4">
            <StepInspector
              step={activeStep}
              flow={selected}
              editable={isProjectFlow}
              warning={stepOrderWarning(
                displayedSteps,
                Math.min(activeStepIdx, displayedSteps.length - 1),
              )}
              draft={
                activeStep ? draftSteps[activeStep.id] ?? {} : {}
              }
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
        </section>
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

      {confirm === "delete" ? (
        <ConfirmDialog
          title="Delete this flow?"
          message={`Delete the project flow "${selected?.label ?? ""}"? This removes .vibestrate/flows/${selected?.id ?? ""}/ and can't be undone.`}
          confirmLabel="Delete flow"
          danger
          onConfirm={() => {
            setConfirm(null);
            void handleDelete();
          }}
          onCancel={() => setConfirm(null)}
        />
      ) : confirm === "restore" ? (
        <ConfirmDialog
          title="Restore the saved flow?"
          message="Discard all unsaved edits and restore this flow to its last saved state. You can still undo the restore afterwards."
          confirmLabel="Restore"
          onConfirm={() => {
            setConfirm(null);
            restore();
          }}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
    </div>
  );
}

// A small themed confirm dialog - the in-app replacement for window.confirm,
// used to gate the destructive (Delete) and discard (Restore) actions.
// Portaled to <body> so its fixed overlay is relative to the viewport, not the
// transformed `.fade-up` page root (which would push it off-screen).
function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-[420px] rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[15px] font-bold text-chalk-100">{title}</h2>
        <p className="mt-2 text-[12.5px] leading-[1.55] text-chalk-300">{message}</p>
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            size="sm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function DryRunModal({
  snapshot,
  busy,
  error,
  flowId,
  onClose,
}: {
  snapshot: ResolvedFlowSnapshot | null;
  busy: boolean;
  error: string | null;
  flowId: string;
  onClose: () => void;
}) {
  // Which step's prompt-composition is expanded (one at a time).
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/80 px-4 py-10"
      onClick={onClose}
    >
      <div
        className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 w-full max-w-[640px] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[12px] font-semibold text-violet-vivid">Dry-run · resolved, not started</div>
            <h2 className="text-[18px] font-bold text-chalk-100 mt-0.5">{snapshot?.label ?? "Resolving…"}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] border border-[color:var(--line-strong)] px-2 py-1 text-[12px] text-chalk-300 hover:text-chalk-100 transition"
          >
            Close
          </button>
        </div>

        {busy ? (
          <div className="mt-4 text-[13px] text-chalk-400">Resolving the flow…</div>
        ) : error ? (
          <div className="mt-4 rounded-[12px] border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-300">
            {error}
          </div>
        ) : snapshot ? (
          <>
            <div className="mt-4">
              <div className="text-[12px] font-semibold text-violet-vivid mb-1.5">
                Seats · crew {snapshot.crewId}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {snapshot.seats.map((s) => (
                  <span
                    key={s.id}
                    className="rounded-[10px] border border-[color:var(--line-soft)] bg-coal-500 px-2 py-1 text-[11.5px] text-chalk-300"
                    title={s.description ?? undefined}
                  >
                    <span className="text-chalk-100">{s.label}</span>{" "}
                    <span className="mono text-chalk-400">({s.id})</span>
                  </span>
                ))}
              </div>
            </div>
            {isGraphSteps(snapshot.steps) ? (
              <div className="mt-3">
                <FlowGraph
                  title="Graph · steps in a dashed box run in parallel"
                  checklistSegment={snapshot.checklistSegment ?? null}
                  steps={snapshot.steps
                    .filter((s) => s.enabled)
                    .map((s) => ({
                      id: s.id,
                      label: s.label,
                      kind: s.kind,
                      seat: s.seat,
                      needs: s.needs,
                      instructions: s.instructions,
                    }))}
                />
              </div>
            ) : null}
            <div className="mt-3">
              <div className="text-[12px] font-semibold text-violet-vivid mb-1.5">
                Steps · {snapshot.steps.filter((s) => s.enabled).length} enabled
                <span className="ml-1.5 font-normal text-chalk-400">
                  - open a step to see how its prompt is composed
                </span>
              </div>
              <ol className="space-y-1">
                {snapshot.steps.map((s, i) => {
                  const rowKey = `${s.id}-${i}`;
                  const canPreview = s.enabled && !!s.seat;
                  const open = expanded === rowKey;
                  return (
                    <li
                      key={rowKey}
                      className={cn(
                        "rounded-[10px] border border-[color:var(--line-soft)] bg-coal-500 text-[12px]",
                        s.enabled ? "" : "opacity-45",
                      )}
                    >
                      <div
                        className={cn(
                          "flex items-center gap-2 px-2.5 py-1.5",
                          canPreview && "cursor-pointer",
                        )}
                        onClick={
                          canPreview ? () => setExpanded(open ? null : rowKey) : undefined
                        }
                        title={canPreview ? "Show how this step's prompt is composed" : undefined}
                      >
                        <span className="mono w-5 shrink-0 text-right text-[11px] text-chalk-400">{i + 1}</span>
                        <span className="truncate text-chalk-100">{s.label}</span>
                        <span className="mono text-[10.5px] text-chalk-400">{s.kind}</span>
                        {s.resolvedRoleLabel ? (
                          <span className="mono text-[10.5px] text-chalk-300">
                            → {s.resolvedRoleLabel}
                          </span>
                        ) : null}
                        {s.profileId ? (
                          <span className="mono text-[10.5px] text-violet-soft">
                            {s.profileId}
                            {s.providerId ? ` · ${s.providerId}` : ""}
                          </span>
                        ) : null}
                        {!s.enabled ? (
                          <span className="ml-auto text-[10.5px] text-chalk-400">skipped</span>
                        ) : s.approval ? (
                          <span className="ml-auto text-[10.5px] text-amber-soft">approval gate</span>
                        ) : null}
                        {canPreview ? (
                          <ChevronRight
                            className={cn(
                              "h-3.5 w-3.5 shrink-0 text-chalk-400 transition-transform",
                              s.approval ? "" : "ml-auto",
                              open && "rotate-90",
                            )}
                            strokeWidth={1.9}
                            aria-hidden
                          />
                        ) : null}
                      </div>
                      {open ? (
                        <div className="border-t border-[color:var(--line-soft)] px-2.5 pb-2.5">
                          <PromptComposition snapshot={snapshot} step={s} />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </div>
            <p className="mt-3 text-[11.5px] text-chalk-400">
              No run started. This is what{" "}
              <code className="text-chalk-300">vibe run "…" --flow {flowId}</code>{" "}
              would instantiate (reflects the saved flow).
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}

function StepRow({
  step,
  idx,
  active,
  onClick,
  editable,
  canRemove,
  onRemove,
  warning,
  dragging,
  dropAbove,
  dropBelow,
  onDragStart,
  onDragOverRow,
  onDropRow,
  onDragEnd,
}: {
  step: FlowStepDefinition;
  idx: number;
  active: boolean;
  onClick: () => void;
  editable: boolean;
  canRemove: boolean;
  onRemove: () => void;
  warning: string | null;
  dragging: boolean;
  dropAbove: boolean;
  dropBelow: boolean;
  onDragStart: () => void;
  onDragOverRow: () => void;
  onDropRow: () => void;
  onDragEnd: () => void;
}) {
  const tone = STEP_GROUP_TONE[stepKindGroup(step.kind)];
  return (
    <li
      onClick={onClick}
      draggable={editable}
      onDragStart={(e) => {
        if (!editable) return;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(idx));
        onDragStart();
      }}
      onDragOver={(e) => {
        if (!editable) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOverRow();
      }}
      onDrop={(e) => {
        if (!editable) return;
        e.preventDefault();
        onDropRow();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "relative rounded-[12px] border transition px-3.5 py-3 flex items-center gap-3",
        editable ? "cursor-pointer" : "cursor-default",
        dragging && "opacity-40",
        active
          ? "border-violet-soft/40 bg-violet-soft/10 ring-1 ring-violet-soft/25"
          : "border-[color:var(--line)] bg-coal-500 hover:bg-coal-400",
      )}
    >
      {/* Insertion indicator while dragging another row onto this one. */}
      {dropAbove ? (
        <span className="absolute -top-[5px] left-2 right-2 h-0.5 rounded-full bg-violet-soft" aria-hidden />
      ) : null}
      {dropBelow ? (
        <span className="absolute -bottom-[5px] left-2 right-2 h-0.5 rounded-full bg-violet-soft" aria-hidden />
      ) : null}
      <span className="absolute -left-[27px] top-[16px] w-3.5 h-3.5 rounded-full ring-2 ring-[color:var(--card)]">
        <span
          className={cn(
            "absolute inset-0 rounded-full",
            tone === "violet" && "bg-violet-soft",
            tone === "sky" && "bg-sky-glow",
            tone === "amber" && "bg-amber-soft",
            tone === "emerald" && "bg-emerald-400",
          )}
        />
      </span>
      {editable ? (
        <span
          className="shrink-0 -ml-1 text-chalk-400 cursor-grab active:cursor-grabbing"
          title="Drag to reorder"
          aria-hidden
        >
          <GripVertical className="h-4 w-4" strokeWidth={1.7} />
        </span>
      ) : null}
      <span className="mono text-[10.5px] text-chalk-400 num-tabular w-5 text-center">
        {String(idx + 1).padStart(2, "0")}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13.5px] font-medium text-chalk-100">
            {step.label}
          </span>
          <Chip tone={tone}>{step.kind}</Chip>
          {step.approval ? (
            <Chip tone="amber">
              <Lock className="h-3 w-3" strokeWidth={1.7} /> approval gate
            </Chip>
          ) : null}
          {step.optional ? (
            <span className="inline-flex items-center rounded-[6px] border border-[color:var(--line-soft)] bg-coal-600 px-1.5 py-px text-[10px] font-medium text-chalk-300">
              optional
            </span>
          ) : null}
          {warning ? (
            <span title={warning} className="inline-flex items-center text-amber-soft">
              <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.9} aria-label="Order warning" />
            </span>
          ) : null}
        </div>
        <div className="text-[11.5px] text-chalk-300 mt-0.5 flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1 whitespace-nowrap">
            <Cpu className="h-3 w-3 text-chalk-400" strokeWidth={1.7} />{" "}
            {step.seat ?? "-"}
          </span>
          {step.inputs.length > 0 ? (
            <>
              <span>·</span>
              <span className="flex items-center gap-1 whitespace-nowrap">
                <Bolt className="h-3 w-3 text-amber-soft" strokeWidth={1.7} />
                {step.inputs.length} inputs
              </span>
            </>
          ) : null}
          {step.needs && step.needs.length > 0 ? (
            <>
              <span>·</span>
              <span className="mono whitespace-nowrap text-chalk-400">
                needs {step.needs.join(", ")}
              </span>
            </>
          ) : null}
        </div>
      </div>
      {editable ? (
        <div
          className="flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <IconBtn
            title={canRemove ? "Remove step" : "A flow must have at least one step"}
            disabled={!canRemove}
            onClick={onRemove}
            danger
          >
            <Trash2 className="h-3 w-3" strokeWidth={1.7} />
          </IconBtn>
        </div>
      ) : null}
      <ChevronRight className="h-3.5 w-3.5 text-chalk-300" strokeWidth={1.7} />
    </li>
  );
}

function IconBtn({
  children,
  title,
  disabled,
  danger,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-6 w-6 inline-flex items-center justify-center rounded-[10px] border transition",
        disabled
          ? "border-[color:var(--line-soft)] text-chalk-400 cursor-not-allowed"
          : danger
            ? "border-rose-300/20 text-rose-300/80 hover:bg-rose-500/10 hover:text-rose-200"
            : "border-[color:var(--line-strong)] text-chalk-300 hover:bg-coal-500 hover:text-chalk-100",
      )}
    >
      {children}
    </button>
  );
}

// A visual of how a step's prompt is composed: the ordered layers that blend
// into the prompt the agent receives. Shown in the Dry-run (where the flow is
// resolved, so the real role + step context are known); run-time layers (your
// task, prior outputs' content, the review lens) are dashed and marked. It's a
// faithful map of the composition, not a byte-exact dump - the literal text only
// exists per run (flows/<step>/prompt.md).
function PromptComposition({
  snapshot,
  step,
}: {
  snapshot: ResolvedFlowSnapshot;
  step: ResolvedFlowStep;
}) {
  const seatLabel =
    step.resolvedRoleLabel ??
    (step.seat
      ? snapshot.seats.find((s) => s.id === step.seat)?.label ?? step.seat
      : null);
  const inputs = step.inputs ?? [];
  const isReview = step.kind === "review-turn" || step.kind === "response-turn";
  const trimmed = (step.instructions ?? "").trim();

  type Layer = {
    label: string;
    content: string;
    runtime?: boolean;
    accent?: boolean;
    empty?: boolean;
  };
  const layers: Layer[] = [
    {
      label: "Role",
      content: seatLabel
        ? `You are the ${seatLabel} for this step.`
        : "The step's role brief.",
    },
    { label: "Your task", content: "The run brief you start with.", runtime: true },
    {
      label: "Step context",
      content: `${snapshot.label} - ${step.label} (${step.kind})${
        step.outputs && step.outputs.length > 0
          ? `; expected output: ${step.outputs.join(", ")}`
          : ""
      }`,
    },
    ...(inputs.length > 0
      ? [
          {
            label: "Prior outputs",
            content: `The handoff packet: ${inputs.join(", ")}.`,
            runtime: true,
          } as Layer,
        ]
      : []),
    {
      label: "Step instructions",
      content: trimmed || "None set for this step.",
      accent: true,
      empty: !trimmed,
    },
    ...(isReview
      ? [
          {
            label: "Review lens",
            content: "The supervisor's review lens (the active persona).",
            runtime: true,
          } as Layer,
        ]
      : []),
  ];

  return (
    <div className="mt-2">
      <div className="flex flex-col">
        {layers.map((l, i) => (
          <Fragment key={l.label}>
            {i > 0 ? (
              <div className="my-0.5 text-center text-[11px] font-bold leading-none text-chalk-400">
                +
              </div>
            ) : null}
            <div
              className={cn(
                "rounded-[10px] border px-3 py-1.5",
                l.accent
                  ? "border-violet-soft/45 bg-violet-soft/10"
                  : l.runtime
                    ? "border-dashed border-[color:var(--line)] bg-coal-800/40"
                    : "border-[color:var(--line-soft)] bg-coal-800",
              )}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "text-[10px] font-semibold",
                    l.accent ? "text-violet-soft" : "text-chalk-300",
                  )}
                >
                  {l.label}
                </span>
                {l.runtime ? (
                  <span className="rounded-[5px] bg-coal-500 px-1 py-px text-[9px] font-medium text-chalk-400">
                    at run time
                  </span>
                ) : null}
              </div>
              <div
                className={cn(
                  "mt-0.5 text-[11px] leading-snug",
                  l.empty
                    ? "italic text-chalk-400"
                    : l.accent
                      ? "text-chalk-100"
                      : "text-chalk-300",
                )}
              >
                {l.content}
              </div>
            </div>
          </Fragment>
        ))}
      </div>
      <div className="flex justify-center py-0.5 text-chalk-400">
        <ChevronRight className="h-4 w-4 rotate-90" strokeWidth={2} aria-hidden />
      </div>
      <div className="rounded-[10px] border border-[color:var(--line-strong)] bg-coal-600 px-3 py-2">
        <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-chalk-100">
          <Code className="h-3.5 w-3.5 text-violet-soft" strokeWidth={1.9} aria-hidden />
          The prompt {seatLabel ? `the ${seatLabel}` : "this step's agent"} receives
        </div>
        <div className="mt-0.5 text-[10.5px] leading-snug text-chalk-400">
          Assembled per run and saved as{" "}
          <span className="mono text-chalk-300">flows/{step.id}/prompt.md</span> -
          run a Dry-run or open a run to read the exact text.
        </div>
      </div>
    </div>
  );
}

function StepInspector({
  step,
  flow,
  editable,
  warning,
  draft,
  onPatchDraft,
}: {
  step: FlowStepDefinition | null;
  flow: DiscoveredFlow;
  editable: boolean;
  warning: string | null;
  draft: StepDraft;
  onPatchDraft: (patch: StepDraft) => void;
}) {
  // The project's discovered skills (for the per-step skills picker). Fetched
  // once; failures degrade to "only the already-selected ids are shown".
  const [availableSkills, setAvailableSkills] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    void api
      .listSkills()
      .then((r) => {
        if (alive) setAvailableSkills(r.skills.map((s) => s.name));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  if (!step) return null;

  // Effective values fold the draft over the saved step so the inputs
  // are always controlled by what the user is actively editing.
  const label = draft.label ?? step.label;
  const optional = draft.optional ?? step.optional;
  const kind = draft.kind ?? step.kind;
  const seatId = resolveNullable(draft.seat, step.seat ?? null);
  const approval = resolveNullable(draft.approval, step.approval ?? null);

  const seatOptions = Object.entries(flow.definition.seats);
  const requiresSeat = TURN_KINDS.has(kind);
  const requiresApproval = kind === "approval-gate";

  return (
    <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4 fade-up fade-up-delay-1">
      <div className="mb-3 text-[12px] font-semibold text-violet-vivid">
        Step inspector · {step.label}
      </div>

      {warning ? (
        <div className="mb-3 flex items-start gap-2 rounded-[10px] border border-amber-soft/30 bg-amber-soft/10 px-3 py-2 text-[11.5px] leading-[1.5] text-amber-soft">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.9} aria-hidden />
          <span>{warning}</span>
        </div>
      ) : null}

      <Field label="Step name">
        <input
          value={label}
          onChange={(e) => onPatchDraft({ label: e.target.value })}
          disabled={!editable}
          className={cn(
            "w-full rounded-[12px] bg-coal-800 border border-[color:var(--line-strong)] transition h-9 px-3 text-[13px] text-chalk-100 outline-none",
            editable
              ? "focus:border-violet-soft/50"
              : "opacity-70 cursor-not-allowed",
          )}
        />
      </Field>

      <Field label="Kind" help={{ slug: "extending/add-flow", label: "Step kinds" }}>
        <div className="flex flex-wrap gap-1.5">
          {STEP_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              disabled={!editable}
              title={`${KIND_INFO[k].title} - ${KIND_INFO[k].blurb}`}
              onClick={() => onPatchDraft({ kind: k })}
              className={cn(
                "text-[11.5px] px-2 py-1 rounded-[10px] border whitespace-nowrap transition",
                k === kind
                  ? "border-violet-soft/45 bg-violet-soft/10 text-violet-soft"
                  : "border-[color:var(--line)] bg-coal-500 text-chalk-300 hover:text-chalk-100",
                !editable && "opacity-60 cursor-not-allowed",
              )}
            >
              {k}
            </button>
          ))}
        </div>
        {/* What the selected kind actually does - so the picker isn't six
            unexplained labels. The phase chip is the run status this kind drives,
            the clearest way to tell the turn kinds apart. */}
        <div className="mt-2 rounded-[12px] border border-[color:var(--line-soft)] bg-coal-800 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] bg-violet-soft/15 text-violet-soft">
              {(() => {
                const KindIcon = KIND_INFO[kind].icon;
                return <KindIcon className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden />;
              })()}
            </span>
            <span className="text-[12px] font-semibold text-chalk-100">
              {KIND_INFO[kind].title}
            </span>
            <span className="rounded-[8px] bg-violet-soft/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-soft">
              {KIND_INFO[kind].phase}
            </span>
          </div>
          <p className="mt-1.5 text-[11.5px] leading-[1.5] text-chalk-300">
            {KIND_INFO[kind].blurb}
          </p>
        </div>
      </Field>

      <Field
        label={requiresSeat ? "Seat (required)" : "Seat (optional)"}
        help={{ slug: "concepts/seat", label: "Seats" }}
      >
        <Select
          value={seatId ?? ""}
          ariaLabel="Seat for this step"
          disabled={!editable || seatOptions.length === 0}
          className="w-full"
          onChange={(v) => {
            onPatchDraft({ seat: v === "" ? null : v });
          }}
          options={[
            { value: "", label: "- no seat -" },
            ...seatOptions.map(([id, def]) => ({
              value: id,
              label: def.label,
              hint: id,
            })),
          ]}
        />
        {requiresSeat && !seatId ? (
          <div className="text-[11px] text-amber-soft mt-1">
            {kind} steps need a seat.
          </div>
        ) : null}
        <div className="text-[11px] text-chalk-400 mt-1">
          Which Role fills this seat - and on which Profile - is decided by the
          Crew at run time, not here. Flows stay shareable.
        </div>
      </Field>

      {requiresSeat ? (
        <Field label="Skills (this step)" help={{ slug: "concepts/skill", label: "Skills" }}>
          {(() => {
            const stepSkills = draft.skills ?? step.skills ?? [];
            const all = Array.from(
              new Set([...availableSkills, ...stepSkills]),
            ).sort();
            const toggle = (name: string) => {
              const next = stepSkills.includes(name)
                ? stepSkills.filter((s) => s !== name)
                : [...stepSkills, name];
              onPatchDraft({ skills: next });
            };
            if (all.length === 0) {
              return (
                <div className="text-[11px] text-chalk-400">
                  No skills found in this project (.vibestrate/skills or
                  .claude/skills).
                </div>
              );
            }
            return (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {all.map((name) => {
                    const on = stepSkills.includes(name);
                    return (
                      <button
                        key={name}
                        type="button"
                        disabled={!editable}
                        onClick={() => toggle(name)}
                        className={cn(
                          "text-[11.5px] px-2 py-1 rounded-[10px] border whitespace-nowrap transition",
                          on
                            ? "border-violet-soft/45 bg-violet-soft/10 text-violet-soft"
                            : "border-[color:var(--line)] bg-coal-500 text-chalk-300 hover:text-chalk-100",
                          !editable && "opacity-60 cursor-not-allowed",
                        )}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
                <div className="text-[11px] text-chalk-400 mt-1">
                  Knowledge injected into this step's prompt (merged with run-level
                  skills). Portable - the flow carries them, not a separate
                  primitive.
                </div>
              </>
            );
          })()}
        </Field>
      ) : null}

      {requiresSeat ? (
        <Field label="Instructions" help={{ slug: "extending/add-flow", label: "Step instructions" }}>
          {(() => {
            const stepInstr = draft.instructions ?? step.instructions ?? "";
            return (
              <>
                <textarea
                  value={stepInstr}
                  disabled={!editable}
                  maxLength={800}
                  onChange={(e) =>
                    onPatchDraft({
                      instructions: e.target.value === "" ? null : e.target.value,
                    })
                  }
                  placeholder="Extra instructions for this step's agent (optional). e.g. Focus on error handling and add a test for each edge case."
                  rows={3}
                  className={cn(
                    "w-full resize-y rounded-[12px] bg-coal-800 border border-[color:var(--line-strong)] px-3 py-2 text-[12.5px] leading-[1.5] text-chalk-100 outline-none placeholder:text-chalk-400",
                    editable
                      ? "focus:border-violet-soft/50"
                      : "opacity-70 cursor-not-allowed",
                  )}
                />
                <div className="mt-1 flex items-center justify-between gap-2 text-[10.5px] text-chalk-400">
                  <span>
                    Folded into the step&apos;s prompt - preview the full
                    composition in Dry-run.
                  </span>
                  <span className="num-tabular shrink-0">{stepInstr.length}/800</span>
                </div>
              </>
            );
          })()}
        </Field>
      ) : null}

      <Field
        label={
          requiresApproval ? "Approval gate (required)" : "Approval gate"
        }
        help={{ slug: "concepts/safety", label: "Approval gates & policies" }}
      >
        <ApprovalEditor
          editable={editable}
          requiresApproval={requiresApproval}
          value={approval}
          onChange={(next) => onPatchDraft({ approval: next })}
        />
        <div className="mt-2 rounded-[10px] border border-[color:var(--line-soft)] bg-coal-800 px-3 py-2 text-[11px] leading-[1.5] text-chalk-400">
          When the run reaches this step it pauses (no agent runs) and waits for a
          person. They see your reason and message, the risk level, and the prior
          step's output, and review the run's diff so far - then{" "}
          <span className="text-emerald-400">Approve</span> to continue or{" "}
          <span className="text-rose-300">Reject</span> to stop. They sign off on
          the work up to here, not every line in an editor.
        </div>
      </Field>

      <Field label="Optional step">
        <button
          type="button"
          disabled={!editable}
          onClick={() => onPatchDraft({ optional: !optional })}
          className="flex items-center gap-2.5 text-[12.5px] text-chalk-300 disabled:opacity-60"
        >
          <span
            className={cn(
              "w-9 h-5 rounded-full p-0.5 transition",
              optional ? "bg-violet-soft" : "bg-coal-400",
            )}
          >
            <span
              className={cn(
                "block w-4 h-4 rounded-full bg-white shadow-sm transition-transform",
                optional ? "translate-x-4" : "translate-x-0",
              )}
            />
          </span>
          <span>
            {optional ? "Skippable (won't block the run)" : "Required"}
          </span>
        </button>
      </Field>

      <Field label="Inputs / outputs (read-only)">
        <div className="space-y-1.5 text-[12px]">
          <Row label="Inputs" items={step.inputs} />
          <Row label="Outputs" items={step.outputs} />
        </div>
      </Field>
    </div>
  );
}

const TURN_KINDS = new Set<FlowStepKind>([
  "agent-turn",
  "review-turn",
  "response-turn",
  "summary-turn",
]);

function ApprovalEditor({
  editable,
  requiresApproval,
  value,
  onChange,
}: {
  editable: boolean;
  requiresApproval: boolean;
  value: FlowApprovalGatePatch | null;
  onChange: (next: FlowApprovalGatePatch | null) => void;
}) {
  // When the kind requires approval but the draft cleared it, show an
  // empty editor pre-seeded with sensible defaults so a single save can
  // produce a valid patch.
  const effective: FlowApprovalGatePatch | null =
    value ??
    (requiresApproval
      ? {
          reason: "User approval required",
          requestedAction: "Approve before continuing",
          riskLevel: "medium",
        }
      : null);

  if (!effective) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[12.5px] text-chalk-300">Auto-continue.</span>
        {editable ? (
          <button
            type="button"
            onClick={() =>
              onChange({
                reason: "User approval required",
                requestedAction: "Approve before continuing",
                riskLevel: "medium",
              })
            }
            className="text-[11.5px] text-violet-soft hover:text-violet-soft/80 flex items-center gap-1"
          >
            <Plus className="h-3 w-3" strokeWidth={1.7} /> Add approval gate
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        value={effective.reason}
        disabled={!editable}
        onChange={(e) =>
          onChange({ ...effective, reason: e.target.value })
        }
        placeholder="Reason - why this gate exists (shown to the approver)"
        className={cn(
          "w-full rounded-[12px] bg-coal-800 border border-[color:var(--line-strong)] h-8 px-3 text-[12.5px] text-chalk-100 outline-none",
          editable
            ? "focus:border-violet-soft/50"
            : "opacity-70 cursor-not-allowed",
        )}
      />
      <input
        value={effective.requestedAction}
        disabled={!editable}
        onChange={(e) =>
          onChange({ ...effective, requestedAction: e.target.value })
        }
        placeholder="Requested action - what to approve (e.g. 'Approve the plan before building')"
        className={cn(
          "w-full rounded-[12px] bg-coal-800 border border-[color:var(--line-strong)] h-8 px-3 text-[12.5px] text-chalk-100 outline-none",
          editable
            ? "focus:border-violet-soft/50"
            : "opacity-70 cursor-not-allowed",
        )}
      />
      <input
        value={effective.userMessage ?? ""}
        disabled={!editable}
        onChange={(e) => {
          const v = e.target.value;
          onChange({
            ...effective,
            userMessage: v === "" ? undefined : v,
          });
        }}
        placeholder="Optional message shown in the approval card"
        className={cn(
          "w-full rounded-[12px] bg-coal-800 border border-[color:var(--line-strong)] h-8 px-3 text-[12.5px] text-chalk-100 outline-none",
          editable
            ? "focus:border-violet-soft/50"
            : "opacity-70 cursor-not-allowed",
        )}
      />
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-violet-soft">
            Risk
          </span>
          {RISK_LEVELS.map((r) => (
            <button
              key={r}
              type="button"
              disabled={!editable}
              onClick={() => onChange({ ...effective, riskLevel: r })}
              className={cn(
                "text-[11.5px] px-2 py-0.5 rounded-[10px] border transition",
                r === effective.riskLevel
                  ? r === "high"
                    ? "border-rose-400/40 bg-rose-500/10 text-rose-300"
                    : r === "low"
                      ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
                      : "border-amber-soft/40 bg-amber-soft/10 text-amber-soft"
                  : "border-[color:var(--line)] bg-coal-500 text-chalk-300 hover:text-chalk-100",
                !editable && "opacity-60 cursor-not-allowed",
              )}
            >
              {r}
            </button>
          ))}
        </div>
        {!requiresApproval && editable ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[11.5px] text-rose-300/80 hover:text-rose-300"
          >
            Remove gate
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Reduce a step draft to the minimal patch payload - fields that are
 * absent or match the current saved value get dropped, so the patch
 * surface only carries actual changes (cleaner network + clearer
 * server-side audit).
 */
function diffStep(
  cur: FlowStepDefinition,
  draft: StepDraft,
): Omit<FlowStepPatch, "id"> | null {
  const out: Omit<FlowStepPatch, "id"> = {};
  if (draft.label !== undefined && draft.label !== cur.label)
    out.label = draft.label;
  if (draft.optional !== undefined && draft.optional !== cur.optional)
    out.optional = draft.optional;
  if (draft.kind !== undefined && draft.kind !== cur.kind)
    out.kind = draft.kind;

  if (draft.seat !== undefined) {
    const currentSeat = cur.seat ?? null;
    if (draft.seat !== currentSeat) out.seat = draft.seat;
  }
  if (draft.approval !== undefined) {
    const currentApproval = cur.approval ?? null;
    if (!approvalEqual(draft.approval, currentApproval))
      out.approval = draft.approval;
  }
  if (draft.skills !== undefined) {
    const curSkills = cur.skills ?? [];
    if (
      draft.skills.length !== curSkills.length ||
      draft.skills.some((s, i) => s !== curSkills[i])
    )
      out.skills = draft.skills;
  }
  if (draft.instructions !== undefined) {
    const curInstr = cur.instructions ?? null;
    if (draft.instructions !== curInstr) out.instructions = draft.instructions;
  }
  return Object.keys(out).length === 0 ? null : out;
}

/**
 * Lift the saved step shape into the API's `FlowStepFull` payload so
 * we can carry it through a `replaceSteps` patch. Folds in any field
 * draft so structural ops don't drop simultaneous field edits.
 */
function toFlowStepFull(
  step: FlowStepDefinition,
  draft?: StepDraft,
): FlowStepFull {
  const base: FlowStepFull = {
    id: step.id,
    label: step.label,
    kind: step.kind,
    inputs: step.inputs.length ? [...step.inputs] : [],
    outputs: step.outputs.length ? [...step.outputs] : [],
    optional: step.optional,
  };
  if (step.seat !== undefined) base.seat = step.seat;
  if (step.stage !== undefined) base.stage = step.stage;
  if (step.skipWhenReadOnly !== undefined)
    base.skipWhenReadOnly = step.skipWhenReadOnly;
  if (step.approval !== undefined) base.approval = step.approval;
  if (step.repeat !== undefined) base.repeat = step.repeat;
  // Preserve per-step skills through structural (replaceSteps) edits - else a
  // reorder/add/remove in the builder would silently wipe YAML-authored skills.
  if (step.skills !== undefined && step.skills.length > 0)
    base.skills = step.skills;
  if (step.instructions !== undefined && step.instructions !== null)
    base.instructions = step.instructions;
  return applyDraftToFullStep(base, draft);
}

/** Project a `FlowStepFull` back into the display shape used by row UI. */
function toFlowStepDefinition(step: FlowStepFull): FlowStepDefinition {
  const out: FlowStepDefinition = {
    id: step.id,
    label: step.label,
    kind: step.kind,
    inputs: step.inputs ?? [],
    outputs: step.outputs ?? [],
    optional: step.optional ?? false,
  };
  if (step.seat !== undefined) out.seat = step.seat;
  if (step.stage !== undefined) out.stage = step.stage;
  if (step.skipWhenReadOnly !== undefined)
    out.skipWhenReadOnly = step.skipWhenReadOnly;
  if (step.approval !== undefined) out.approval = step.approval;
  if (step.repeat !== undefined) out.repeat = step.repeat;
  if (step.skills !== undefined) out.skills = step.skills;
  if (step.instructions !== undefined) out.instructions = step.instructions;
  return out;
}

// Shallow-merge a per-step field draft onto a display step so the row reflects
// in-progress edits. Only the draft's display fields are merged; everything else
// (needs, inputs, outputs, stage, ...) is preserved from the original, unlike a
// toFlowStepFull round-trip which would drop fields it doesn't carry.
function foldStepDraftForDisplay(
  def: FlowStepDefinition,
  draft?: StepDraft,
): FlowStepDefinition {
  if (!draft) return def;
  const next: FlowStepDefinition = { ...def };
  if (draft.label !== undefined) next.label = draft.label;
  if (draft.kind !== undefined) next.kind = draft.kind;
  if (draft.optional !== undefined) next.optional = draft.optional;
  if (draft.seat !== undefined) next.seat = draft.seat ?? undefined;
  if (draft.approval !== undefined) next.approval = draft.approval ?? undefined;
  if (draft.skills !== undefined) next.skills = draft.skills;
  if (draft.instructions !== undefined)
    next.instructions = draft.instructions ?? undefined;
  return next;
}

/** Apply a per-step draft (tri-state for nullables) over a full step. */
function applyDraftToFullStep(
  step: FlowStepFull,
  draft?: StepDraft,
): FlowStepFull {
  if (!draft) return step;
  const next: FlowStepFull = { ...step };
  if (draft.label !== undefined) next.label = draft.label;
  if (draft.kind !== undefined) next.kind = draft.kind;
  if (draft.optional !== undefined) next.optional = draft.optional;
  if (draft.seat !== undefined) {
    if (draft.seat === null) delete next.seat;
    else next.seat = draft.seat;
  }
  if (draft.approval !== undefined) {
    if (draft.approval === null) delete next.approval;
    else next.approval = draft.approval;
  }
  if (draft.skills !== undefined) next.skills = draft.skills;
  if (draft.instructions !== undefined) {
    if (draft.instructions === null) delete next.instructions;
    else next.instructions = draft.instructions;
  }
  return next;
}

/** Generate a step id that doesn't collide with the current list. */
function freshStepId(list: FlowStepFull[], prefix: string): string {
  const seen = new Set(list.map((s) => s.id));
  for (let i = 1; i < 1000; i++) {
    const candidate = `${prefix}-${i}`;
    if (!seen.has(candidate)) return candidate;
  }
  return `${prefix}-${Date.now()}`;
}

function approvalEqual(
  a: FlowApprovalGatePatch | null,
  b: FlowApprovalGatePatch | null,
): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return (
    a.reason === b.reason &&
    a.requestedAction === b.requestedAction &&
    a.riskLevel === b.riskLevel &&
    (a.userMessage ?? "") === (b.userMessage ?? "")
  );
}

/**
 * Apply a draft's tri-state value (undefined | null | string) over the
 * source value, returning the effective value for display in a controlled
 * input.
 */
function resolveNullable<T>(draft: T | null | undefined, current: T | null): T | null {
  if (draft === undefined) return current;
  return draft;
}

// A framed fact tile - bold value over a violet unit label, content-width. The
// same tile the flow cards use, so a flow's facts read as data, not a grey
// `8 steps · 6 seats · v1` meta line.
function Row({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-[10.5px] font-medium text-violet-soft w-16 shrink-0 pt-0.5">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5 min-w-0">
        {items.length === 0 ? (
          <span className="text-chalk-400 text-[11.5px]">-</span>
        ) : (
          items.map((it) => (
            <span
              key={it}
              className="mono text-[11px] px-1.5 py-0.5 rounded-[8px] border border-[color:var(--line-soft)] bg-coal-500 text-chalk-300"
            >
              {it}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  /** Optional "?" that deep-links to the docs for configs that aren't obvious. */
  help?: { slug: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3.5 last:mb-0">
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="text-[11px] font-semibold text-violet-soft">{label}</span>
        {help ? <HelpHint slug={help.slug} label={help.label} /> : null}
      </div>
      {children}
    </div>
  );
}

function PolicyCard() {
  const lines = [
    { label: "Forbid writes to main branch", on: true },
    { label: "Require approval at arbitrate", on: true },
    { label: "Block secret-like file access", on: true },
    { label: "Auto-merge on green CI", on: false },
  ];
  return (
    <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4 fade-up fade-up-delay-2">
      <div className="mb-3 text-[12px] font-semibold text-violet-vivid">Policies</div>
      <ul className="space-y-2.5 text-[12.5px]">
        {lines.map((p) => (
          <li key={p.label} className="flex items-center justify-between">
            <span className="text-chalk-300">{p.label}</span>
            <span
              className={cn(
                "text-[11px] mono px-2 py-0.5 rounded-[8px] border",
                p.on
                  ? "bg-emerald-500/10 text-emerald-300 border-emerald-400/25"
                  : "bg-coal-500 text-chalk-400 border-[color:var(--line-soft)]",
              )}
            >
              {p.on ? "enforced" : "off"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PreviewCard({ steps }: { steps: FlowStepDefinition[] }) {
  return (
    <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4 fade-up fade-up-delay-3">
      <div className="mb-3 text-[12px] font-semibold text-violet-vivid">Flow preview</div>
      <div className="flex flex-wrap items-center gap-1.5 mono text-[11px]">
        {steps.map((s, i) => (
          <Fragment key={s.id}>
            <span
              className={cn(
                "px-2 py-1 rounded-[8px] border whitespace-nowrap",
                s.approval
                  ? "border-amber-soft/35 bg-amber-soft/10 text-amber-soft"
                  : "border-violet-soft/30 bg-violet-soft/10 text-violet-soft",
              )}
            >
              {s.label}
            </span>
            {i < steps.length - 1 ? (
              <span className="text-chalk-400">→</span>
            ) : null}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function LoopCard({
  steps,
  loop,
  editable,
  onChange,
}: {
  steps: FlowStepDefinition[];
  loop: FlowLoop | null;
  editable: boolean;
  onChange: (loop: FlowLoop | null) => void;
}) {
  const numCls = cn(
    "w-full rounded-[12px] bg-coal-800 border border-[color:var(--line-strong)] h-9 px-2.5 text-[12.5px] text-chalk-100 outline-none",
    editable ? "focus:border-violet-soft/50" : "opacity-70 cursor-not-allowed",
  );
  const idx = (id: string): number => steps.findIndex((s) => s.id === id);
  const fromI = loop ? idx(loop.from) : -1;
  const toI = loop ? idx(loop.to) : -1;
  const reviewsInRange = steps.filter(
    (s, i) =>
      s.kind === "review-turn" && fromI >= 0 && toI >= 0 && i >= fromI && i <= toI,
  );
  const rangeOk = !!loop && fromI >= 0 && toI >= 0 && fromI <= toI;
  const decisionOk =
    !!loop && reviewsInRange.some((s) => s.id === loop.decisionStep);

  function enable(): void {
    const from = steps[0];
    const lastReview = [...steps].reverse().find((s) => s.kind === "review-turn");
    const to = lastReview ?? steps[steps.length - 1];
    if (!from || !to) return;
    onChange({
      from: from.id,
      to: to.id,
      decisionStep: (lastReview ?? to).id,
      maxIterations: 3,
    });
  }
  function update(patch: Partial<FlowLoop>): void {
    if (loop) onChange({ ...loop, ...patch });
  }

  return (
    <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4 fade-up fade-up-delay-2">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-1.5">
          <span className="text-[12px] font-semibold text-violet-vivid">Loop</span>
          <HelpHint slug="extending/add-flow" label="Adaptive loops" />
        </span>
        {editable ? (
          <button
            type="button"
            onClick={() => (loop ? onChange(null) : enable())}
            className="text-[11px] font-semibold text-violet-soft hover:text-violet-soft/80"
          >
            {loop ? "remove loop" : "+ add loop"}
          </button>
        ) : loop ? (
          <span className="text-[11px] text-chalk-400">on</span>
        ) : null}
      </div>
      {!loop ? (
        <p className="text-[12px] text-chalk-400">
          No loop. A loop repeats a contiguous range of steps while a review keeps
          asking for changes - e.g. coder → reviewer → coder.
        </p>
      ) : (
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="From step">
              <Select
                className="w-full"
                ariaLabel="Loop start step"
                disabled={!editable}
                value={loop.from}
                onChange={(v) => update({ from: v })}
                options={steps.map((s) => ({ value: s.id, label: s.label }))}
              />
            </Field>
            <Field label="To step">
              <Select
                className="w-full"
                ariaLabel="Loop end step"
                disabled={!editable}
                value={loop.to}
                onChange={(v) => update({ to: v })}
                options={steps.map((s) => ({ value: s.id, label: s.label }))}
              />
            </Field>
          </div>
          <Field label="Decision step - a review in the range">
            <Select
              className="w-full"
              ariaLabel="Loop decision step"
              disabled={!editable}
              value={loop.decisionStep}
              onChange={(v) => update({ decisionStep: v })}
              options={[
                ...(!decisionOk
                  ? [
                      {
                        value: loop.decisionStep,
                        label: `${loop.decisionStep} (not a review in range)`,
                      },
                    ]
                  : []),
                ...reviewsInRange.map((s) => ({ value: s.id, label: s.label })),
              ]}
            />
          </Field>
          <Field label="Max iterations">
            <input
              type="number"
              min={1}
              max={8}
              className={numCls}
              disabled={!editable}
              value={loop.maxIterations}
              onChange={(e) =>
                update({
                  maxIterations: Math.max(1, Math.min(8, Number(e.target.value) || 1)),
                })
              }
            />
          </Field>
          {!rangeOk || !decisionOk ? (
            <p className="text-[11px] text-amber-soft">
              {!rangeOk ? "“From” must come at or before “To”. " : ""}
              {!decisionOk
                ? "Pick a review-turn inside the range as the decision step."
                : ""}
            </p>
          ) : (
            <p className="text-[11px] text-chalk-400">
              Repeats {loop.from} → {loop.to} until {loop.decisionStep} isn’t
              “changes requested”, up to {loop.maxIterations}×.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Live, read-only preview of the flow the YAML currently describes, shown beside
 * the code editor: the dependency graph when it's a DAG, an ordered step list
 * otherwise. YAML is the single source of truth here, so the preview is derived
 * and never edits back - no round-trip churn. A parse error pauses the preview
 * rather than throwing, so a half-typed line never breaks the editor.
 */
function YamlGraphPreview({ yamlText }: { yamlText: string }) {
  const parsed = extractFlowFromYaml(yamlText);
  const steps = parsed.definition?.steps;
  if (parsed.error) {
    return (
      <div className="rounded-[12px] border border-amber-soft/25 bg-amber-soft/10 px-3 py-2 text-[12px] text-amber-soft">
        Live preview paused while the YAML doesn't parse.
      </div>
    );
  }
  if (!Array.isArray(steps) || steps.length === 0) {
    return (
      <div className="rounded-[12px] border border-[color:var(--line-soft)] bg-coal-800 px-3 py-2 text-[12px] text-chalk-400">
        No steps to preview yet.
      </div>
    );
  }
  const graphSteps = steps.map((s) => ({
    id: s.id,
    label: s.label ?? s.id,
    kind: s.kind,
    seat: s.seat ?? null,
    needs: s.needs ?? [],
    instructions: s.instructions ?? null,
  }));
  if (isGraphSteps(graphSteps)) {
    return <FlowGraph title="Live preview" steps={graphSteps} />;
  }
  return (
    <div className="rounded-[12px] border border-[color:var(--line-soft)] bg-coal-800 p-3">
      <div className="mb-2 text-[12px] font-semibold text-violet-vivid">Live preview</div>
      <ol className="space-y-1">
        {graphSteps.map((s, i) => (
          <li
            key={s.id}
            className="flex items-baseline gap-2 text-[12px] text-chalk-300"
          >
            <span className="mono text-chalk-400">{i + 1}.</span>
            <span className="text-chalk-100">{s.label}</span>
            <span className="mono text-[10.5px] text-chalk-400">{s.kind}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

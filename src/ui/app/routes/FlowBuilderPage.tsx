import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Book,
  Bug,
  ChevronLeft,
  Code,
  Copy,
  Eye,
  Flag,
  Layers,
  Lock,
  Plus,
  Redo2,
  Rocket,
  RotateCcw,
  Save,
  Scale,
  Shuffle,
  Trash2,
  Undo2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  api,
  type FlowPatch,
  type FlowStepFull,
  type FlowStepPatch,
} from "../../lib/api.js";
import { Button } from "../../components/design/Button.js";
import { StatTile } from "../../components/design/StatTile.js";
import { Select } from "../../components/design/Select.js";
import { StepKindLegend } from "../../components/design/StepKindLegend.js";
import { cn } from "../../components/design/cn.js";
import { useToast, ToastView } from "../../components/design/useToast.js";
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

const ICON_FOR_NAME: { match: RegExp; icon: LucideIcon }[] = [
  { match: /quality|arbitr/i, icon: Scale },
  { match: /ship.?fast/i, icon: Rocket },
  { match: /deep|refactor/i, icon: Layers },
  { match: /bug|loop/i, icon: Bug },
  { match: /doc/i, icon: Book },
  { match: /migr|move|shuffle/i, icon: Shuffle },
];

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
      <ToastView
        toast={toast}
        variant="inline"
        prefix="glyph"
        className="mt-4 rounded-[12px] border px-3 py-2 text-[12.5px]"
      />

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

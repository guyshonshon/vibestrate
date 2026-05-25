import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Book,
  Bolt,
  Bug,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Eye,
  Layers,
  Lock,
  Play,
  Plus,
  Rocket,
  Save,
  Scale,
  Shuffle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  api,
  type GuideApprovalGatePatch,
  type GuideApprovalRiskLevel,
  type GuidePatch,
  type GuideStepKind,
  type GuideStepPatch,
} from "../../lib/api.js";
import { Button } from "../../components/design/Button.js";
import { Chip } from "../../components/design/Chip.js";
import { SectionEyebrow } from "../../components/design/SectionEyebrow.js";
import { cn } from "../../components/design/cn.js";
import type {
  DiscoveredGuide,
  GuideStepDefinition,
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
  kind?: GuideStepKind;
  // null = clear; undefined = no change; string = set
  slot?: string | null;
  agentId?: string | null;
  approval?: GuideApprovalGatePatch | null;
};

const STEP_KINDS: GuideStepKind[] = [
  "agent-turn",
  "review-turn",
  "response-turn",
  "validation",
  "approval-gate",
  "summary-turn",
];

const RISK_LEVELS: GuideApprovalRiskLevel[] = ["low", "medium", "high"];

const ICON_FOR_NAME: { match: RegExp; icon: LucideIcon }[] = [
  { match: /quality|arbitr/i, icon: Scale },
  { match: /ship.?fast/i, icon: Rocket },
  { match: /deep|refactor/i, icon: Layers },
  { match: /bug|loop/i, icon: Bug },
  { match: /doc/i, icon: Book },
  { match: /migr|move|shuffle/i, icon: Shuffle },
];

function guideIcon(label: string): LucideIcon {
  for (const row of ICON_FOR_NAME) if (row.match.test(label)) return row.icon;
  return Layers;
}

export function FlowBuilderPage({
  initialGuideId,
  onBack,
}: {
  initialGuideId: string | null;
  onBack: () => void;
}) {
  const [guides, setGuides] = useState<DiscoveredGuide[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialGuideId);
  const [activeStepIdx, setActiveStepIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState<string>("");
  const [draftSteps, setDraftSteps] = useState<Record<string, StepDraft>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .listGuides()
      .then((r) => {
        if (cancelled) return;
        setGuides(r.guides);
        setSelectedId((cur) => cur ?? r.guides[0]?.id ?? null);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(
    () => guides.find((g) => g.id === selectedId) ?? guides[0] ?? null,
    [guides, selectedId],
  );

  // Reset the draft buffers any time the selected guide changes — the
  // draft mirrors the on-disk guide until the user actually edits a
  // field. We diff against `selected` on save to figure out which fields
  // changed.
  useEffect(() => {
    if (!selected) return;
    setDraftLabel(selected.label);
    setDraftSteps({});
    setActiveStepIdx(0);
  }, [selected?.id]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const steps: GuideStepDefinition[] = selected?.definition.steps ?? [];
  const activeStep = steps[Math.min(activeStepIdx, steps.length - 1)] ?? null;

  const isProjectGuide = selected?.source.kind === "project";

  // Patch we'd send for the *current* draft — also drives the dirty
  // indicator on the Save button. Pure derivation; recomputed on every
  // render (cheap, never touches state).
  const pendingPatch: GuidePatch | null = useMemo(() => {
    if (!selected) return null;
    const patch: GuidePatch = {};
    if (draftLabel !== selected.label) patch.label = draftLabel;
    const steps: GuideStepPatch[] = [];
    for (const [id, draft] of Object.entries(draftSteps)) {
      const cur = selected.definition.steps.find((s) => s.id === id);
      if (!cur) continue;
      const entry = diffStep(cur, draft);
      if (entry) steps.push({ id, ...entry });
    }
    if (steps.length > 0) patch.steps = steps;
    if (!patch.label && !patch.steps) return null;
    return patch;
  }, [selected, draftLabel, draftSteps]);

  const dirty = pendingPatch !== null;

  async function handleSave(): Promise<void> {
    if (!selected || !pendingPatch || !isProjectGuide) return;
    setSaving(true);
    try {
      const result = await api.patchGuide(selected.id, pendingPatch);
      setGuides((cur) =>
        cur.map((g) => (g.id === result.guide.id ? result.guide : g)),
      );
      setDraftLabel(result.guide.label);
      setDraftSteps({});
      setToast({
        kind: "ok",
        text: `Saved ${result.guide.label} (${result.definitionPath})`,
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

  function patchStepDraft(stepId: string, patch: StepDraft) {
    setDraftSteps((cur) => ({
      ...cur,
      [stepId]: { ...(cur[stepId] ?? {}), ...patch },
    }));
  }

  return (
    <div className="relative z-10 mx-auto max-w-[1480px] px-8 pt-6 pb-12">
      <header
        className="flex flex-wrap items-center justify-between gap-3"
        data-screen-label="00 Header"
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-[12.5px] text-fog-300 hover:text-fog-100"
          >
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.7} /> Mission
          </button>
          <span className="text-fog-500">/</span>
          <span className="text-[12.5px] text-fog-300">Flows</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<Eye className="h-3 w-3" strokeWidth={1.7} />}
          >
            Dry-run preview
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!dirty || saving || !isProjectGuide}
            title={
              !isProjectGuide
                ? "Builtin guides are read-only — fork into .amaco/guides/ to edit."
                : !dirty
                  ? "No changes to save"
                  : "Save changes to .amaco/guides/"
            }
            iconLeft={<Save className="h-3 w-3" strokeWidth={1.7} />}
            onClick={() => void handleSave()}
          >
            {saving ? "Saving…" : "Save as guide"}
          </Button>
          <Button
            variant="primary"
            size="sm"
            iconLeft={<Play className="h-3 w-3" strokeWidth={1.7} />}
            onClick={onBack}
          >
            Use this flow
          </Button>
        </div>
      </header>

      <section className="mt-8 fade-up" data-screen-label="01 Hero">
        <div className="eyebrow mb-2">Flow Builder</div>
        <h1 className="text-display text-[40px] leading-[1.05] max-w-[760px]">
          Design how your{" "}
          <em className="text-display italic text-violet-soft">agents</em> work
          together.
        </h1>
        <p className="text-fog-300 text-[14px] mt-3 max-w-[640px]">
          Start from a discovered guide, then customize each step: pick the
          agent, attach skills, decide what needs your approval.
        </p>
      </section>

      {error ? (
        <div className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/5 px-3 py-1.5 text-[12.5px] text-rose-300">
          {error}
        </div>
      ) : null}
      {toast ? (
        <div
          role="status"
          className={
            toast.kind === "ok"
              ? "mt-4 rounded-lg border px-3 py-1.5 text-[12.5px] border-emerald-400/30 bg-emerald-500/5 text-emerald-300"
              : "mt-4 rounded-lg border px-3 py-1.5 text-[12.5px] border-rose-400/30 bg-rose-500/5 text-rose-300"
          }
        >
          {toast.kind === "ok" ? "✓ " : "✗ "}
          {toast.text}
        </div>
      ) : null}

      <section className="mt-8" data-screen-label="02 Templates">
        <SectionEyebrow className="mb-3">
          <span>Guides · {guides.length} discovered</span>
        </SectionEyebrow>
        {guides.length === 0 ? (
          <div className="glass p-6 text-[13px] text-fog-400">
            No guides discovered. Add a guide YAML to{" "}
            <span className="mono">.amaco/guides/</span> in the project root,
            or use one of the built-ins.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {guides.map((g) => {
              const Icon = guideIcon(g.label);
              const selected = g.id === selectedId;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(g.id);
                    setActiveStepIdx(0);
                  }}
                  className={cn(
                    "relative text-left rounded-2xl border surface-ink-100-55 backdrop-blur-xl px-4 py-4 card-hover overflow-hidden",
                    selected
                      ? "border-violet-soft/45 ring-1 ring-violet-soft/30"
                      : "border-white/[0.07]",
                  )}
                >
                  {selected ? (
                    <div className="absolute -top-16 -right-10 w-40 h-40 rounded-full bg-violet-soft/[0.18] blur-3xl pointer-events-none" />
                  ) : null}
                  <div
                    className={cn(
                      "relative w-9 h-9 rounded-lg flex items-center justify-center mb-3",
                      selected
                        ? "bg-violet-soft/15 ring-1 ring-violet-soft/30 text-violet-soft"
                        : "bg-white/[0.05] text-fog-300",
                    )}
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.7} />
                  </div>
                  <div className="relative">
                    <div
                      className={cn(
                        "text-[13.5px] font-medium",
                        selected ? "text-fog-100" : "text-fog-200",
                      )}
                    >
                      {g.label}
                    </div>
                    <div className="text-[11.5px] text-fog-400 mt-0.5 line-clamp-2">
                      {g.description || "—"}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {selected ? (
        <section className="mt-8 grid grid-cols-12 gap-5" data-screen-label="03 Builder">
          <div className="col-span-12 xl:col-span-7">
            <div className="glass p-5 fade-up">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-mid to-violet-deep ring-1 ring-violet-soft/30 flex items-center justify-center text-white shrink-0">
                  <Scale className="h-4 w-4" strokeWidth={1.7} />
                </div>
                <div className="flex-1 min-w-0">
                  <input
                    value={draftLabel}
                    onChange={(e) => setDraftLabel(e.target.value)}
                    disabled={!isProjectGuide}
                    className={
                      "bg-transparent border-b border-transparent transition outline-none text-[20px] font-semibold tracking-tight w-full " +
                      (isProjectGuide
                        ? "hover:border-white/10 focus:border-violet-soft/40"
                        : "opacity-70 cursor-not-allowed")
                    }
                  />
                  <div className="text-[11.5px] text-fog-400 mt-1">
                    {steps.length} steps · source{" "}
                    <span className="text-fog-200">{selected.source.kind}</span>
                    {!isProjectGuide ? (
                      <span className="ml-2 text-amber-300">
                        read-only — fork into the project to edit
                      </span>
                    ) : null}
                  </div>
                </div>
                <Chip tone={isProjectGuide ? "violet" : "neutral"}>
                  {isProjectGuide ? "Editable" : "Read-only"}
                </Chip>
              </div>

              <ol className="relative space-y-2.5 pl-8">
                <span className="absolute left-[14px] top-3 bottom-3 w-px bg-white/[0.08]" />
                {steps.map((step, i) => (
                  <StepRow
                    key={step.id}
                    step={step}
                    idx={i}
                    active={i === activeStepIdx}
                    onClick={() => setActiveStepIdx(i)}
                  />
                ))}
                <li className="relative pl-1">
                  <span className="absolute -left-[27px] top-[12px] w-3.5 h-3.5 rounded-full border border-dashed border-white/15" />
                  <button
                    type="button"
                    className="rounded-xl border border-dashed border-white/[0.12] hover:border-violet-soft/40 hover:bg-violet-500/[0.04] px-3 py-2.5 text-[12.5px] text-fog-300 hover:text-fog-100 flex items-center gap-2 w-full"
                  >
                    <Plus className="h-3 w-3" strokeWidth={1.7} /> Add step
                  </button>
                </li>
              </ol>
            </div>
          </div>

          <div className="col-span-12 xl:col-span-5 space-y-4">
            <StepInspector
              step={activeStep}
              guide={selected}
              editable={isProjectGuide}
              draft={
                activeStep ? draftSteps[activeStep.id] ?? {} : {}
              }
              onPatchDraft={(patch) =>
                activeStep && patchStepDraft(activeStep.id, patch)
              }
            />
            <PolicyCard />
            <PreviewCard steps={steps} />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function StepRow({
  step,
  idx,
  active,
  onClick,
}: {
  step: GuideStepDefinition;
  idx: number;
  active: boolean;
  onClick: () => void;
}) {
  const tone =
    step.kind === "validation"
      ? "emerald"
      : step.kind === "approval-gate"
        ? "amber"
        : step.kind === "review-turn"
          ? "sky"
          : "violet";
  return (
    <li
      onClick={onClick}
      className={cn(
        "relative rounded-xl border cursor-pointer transition px-3.5 py-3 flex items-center gap-3",
        active
          ? "border-violet-soft/40 bg-violet-500/[0.06] ring-1 ring-violet-soft/25"
          : "border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04]",
      )}
    >
      <span className="absolute -left-[27px] top-[16px] w-3.5 h-3.5 rounded-full ring-2 ring-ink-50">
        <span
          className={cn(
            "absolute inset-0 rounded-full",
            tone === "violet" && "bg-violet-soft",
            tone === "sky" && "bg-sky-glow",
            tone === "amber" && "bg-amber-300",
            tone === "emerald" && "bg-emerald-400",
          )}
        />
      </span>
      <span className="mono text-[10.5px] text-fog-500 num-tabular w-5 text-center">
        {String(idx + 1).padStart(2, "0")}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13.5px] font-medium text-fog-100">
            {step.label}
          </span>
          <Chip tone={tone}>{step.kind}</Chip>
          {step.approval ? (
            <Chip tone="amber">
              <Lock className="h-3 w-3" strokeWidth={1.7} /> approval gate
            </Chip>
          ) : null}
          {step.optional ? <Chip tone="neutral">optional</Chip> : null}
        </div>
        <div className="text-[11.5px] text-fog-400 mt-0.5 flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1 whitespace-nowrap">
            <Cpu className="h-3 w-3 text-fog-500" strokeWidth={1.7} />{" "}
            {step.agentId ?? step.slot ?? "auto"}
          </span>
          {step.inputs.length > 0 ? (
            <>
              <span>·</span>
              <span className="flex items-center gap-1 whitespace-nowrap">
                <Bolt className="h-3 w-3 text-amber-300" strokeWidth={1.7} />
                {step.inputs.length} inputs
              </span>
            </>
          ) : null}
        </div>
      </div>
      <ChevronRight className="h-3.5 w-3.5 text-fog-400" strokeWidth={1.7} />
    </li>
  );
}

function StepInspector({
  step,
  guide,
  editable,
  draft,
  onPatchDraft,
}: {
  step: GuideStepDefinition | null;
  guide: DiscoveredGuide;
  editable: boolean;
  draft: StepDraft;
  onPatchDraft: (patch: StepDraft) => void;
}) {
  if (!step) return null;

  // Effective values fold the draft over the saved step so the inputs
  // are always controlled by what the user is actively editing.
  const label = draft.label ?? step.label;
  const optional = draft.optional ?? step.optional;
  const kind = draft.kind ?? step.kind;
  const slotId = resolveNullable(draft.slot, step.slot ?? null);
  const agentId = resolveNullable(draft.agentId, step.agentId ?? null);
  const approval = resolveNullable(draft.approval, step.approval ?? null);

  const slotOptions = Object.entries(guide.definition.slots);
  const requiresSlot = TURN_KINDS.has(kind);
  const requiresApproval = kind === "approval-gate";

  return (
    <div className="glass p-4 fade-up fade-up-delay-1">
      <SectionEyebrow className="mb-3">
        <span>Step inspector · {step.label}</span>
      </SectionEyebrow>

      <Field label="Step name">
        <input
          value={label}
          onChange={(e) => onPatchDraft({ label: e.target.value })}
          disabled={!editable}
          className={cn(
            "w-full bg-white/[0.03] border border-white/10 transition rounded-lg h-9 px-3 text-[13px] text-fog-100 outline-none",
            editable
              ? "focus:border-violet-soft/40"
              : "opacity-70 cursor-not-allowed",
          )}
        />
      </Field>

      <Field label="Kind">
        <div className="flex flex-wrap gap-1.5">
          {STEP_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              disabled={!editable}
              onClick={() => onPatchDraft({ kind: k })}
              className={cn(
                "text-[11.5px] px-2 py-1 rounded-md border whitespace-nowrap transition",
                k === kind
                  ? "border-violet-soft/45 bg-violet-soft/10 text-violet-soft"
                  : "border-white/[0.08] bg-white/[0.02] text-fog-300 hover:text-fog-100",
                !editable && "opacity-60 cursor-not-allowed",
              )}
            >
              {k}
            </button>
          ))}
        </div>
      </Field>

      <Field
        label={requiresSlot ? "Slot (required)" : "Slot (optional)"}
      >
        <select
          value={slotId ?? ""}
          disabled={!editable || slotOptions.length === 0}
          onChange={(e) => {
            const v = e.target.value;
            onPatchDraft({ slot: v === "" ? null : v });
          }}
          className={cn(
            "w-full bg-white/[0.03] border border-white/10 rounded-lg h-9 px-3 text-[13px] text-fog-100 outline-none",
            editable
              ? "focus:border-violet-soft/40"
              : "opacity-70 cursor-not-allowed",
          )}
        >
          <option value="">— no slot —</option>
          {slotOptions.map(([id, def]) => (
            <option key={id} value={id}>
              {def.label} ({id})
            </option>
          ))}
        </select>
        {requiresSlot && !slotId ? (
          <div className="text-[11px] text-amber-300 mt-1">
            {kind} steps need a slot.
          </div>
        ) : null}
      </Field>

      <Field label="Agent override (optional)">
        <input
          value={agentId ?? ""}
          placeholder={
            slotId
              ? `default: ${guide.definition.slots[slotId]?.defaultAgent ?? "—"}`
              : "leave blank to use the slot default"
          }
          disabled={!editable}
          onChange={(e) => {
            const v = e.target.value.trim();
            onPatchDraft({ agentId: v === "" ? null : v });
          }}
          className={cn(
            "w-full bg-white/[0.03] border border-white/10 rounded-lg h-9 px-3 text-[13px] text-fog-100 outline-none font-mono",
            editable
              ? "focus:border-violet-soft/40"
              : "opacity-70 cursor-not-allowed",
          )}
        />
      </Field>

      <Field label="Optional step">
        <button
          type="button"
          disabled={!editable}
          onClick={() => onPatchDraft({ optional: !optional })}
          className="flex items-center gap-2.5 text-[12.5px] text-fog-200 disabled:opacity-60"
        >
          <span
            className={cn(
              "w-9 h-5 rounded-full p-0.5 transition",
              optional ? "bg-violet-deep" : "bg-white/10",
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

      <Field
        label={
          requiresApproval ? "Approval gate (required)" : "Approval gate"
        }
      >
        <ApprovalEditor
          editable={editable}
          requiresApproval={requiresApproval}
          value={approval}
          onChange={(next) => onPatchDraft({ approval: next })}
        />
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

const TURN_KINDS = new Set<GuideStepKind>([
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
  value: GuideApprovalGatePatch | null;
  onChange: (next: GuideApprovalGatePatch | null) => void;
}) {
  // When the kind requires approval but the draft cleared it, show an
  // empty editor pre-seeded with sensible defaults so a single save can
  // produce a valid patch.
  const effective: GuideApprovalGatePatch | null =
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
        <span className="text-[12.5px] text-fog-300">Auto-continue.</span>
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
        placeholder="Why is this gate here?"
        className={cn(
          "w-full bg-white/[0.03] border border-white/10 rounded-lg h-8 px-3 text-[12.5px] text-fog-100 outline-none",
          editable
            ? "focus:border-violet-soft/40"
            : "opacity-70 cursor-not-allowed",
        )}
      />
      <input
        value={effective.requestedAction}
        disabled={!editable}
        onChange={(e) =>
          onChange({ ...effective, requestedAction: e.target.value })
        }
        placeholder="What is the user being asked to do?"
        className={cn(
          "w-full bg-white/[0.03] border border-white/10 rounded-lg h-8 px-3 text-[12.5px] text-fog-100 outline-none",
          editable
            ? "focus:border-violet-soft/40"
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
        placeholder="Optional message to surface in the approval card"
        className={cn(
          "w-full bg-white/[0.03] border border-white/10 rounded-lg h-8 px-3 text-[12.5px] text-fog-100 outline-none",
          editable
            ? "focus:border-violet-soft/40"
            : "opacity-70 cursor-not-allowed",
        )}
      />
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-[0.14em] text-fog-500">
            Risk
          </span>
          {RISK_LEVELS.map((r) => (
            <button
              key={r}
              type="button"
              disabled={!editable}
              onClick={() => onChange({ ...effective, riskLevel: r })}
              className={cn(
                "text-[11.5px] px-2 py-0.5 rounded-full border transition",
                r === effective.riskLevel
                  ? r === "high"
                    ? "border-rose-400/40 bg-rose-500/10 text-rose-300"
                    : r === "low"
                      ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
                      : "border-amber-400/40 bg-amber-500/10 text-amber-300"
                  : "border-white/[0.08] bg-white/[0.02] text-fog-300 hover:text-fog-100",
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
 * Reduce a step draft to the minimal patch payload — fields that are
 * absent or match the current saved value get dropped, so the patch
 * surface only carries actual changes (cleaner network + clearer
 * server-side audit).
 */
function diffStep(
  cur: GuideStepDefinition,
  draft: StepDraft,
): Omit<GuideStepPatch, "id"> | null {
  const out: Omit<GuideStepPatch, "id"> = {};
  if (draft.label !== undefined && draft.label !== cur.label)
    out.label = draft.label;
  if (draft.optional !== undefined && draft.optional !== cur.optional)
    out.optional = draft.optional;
  if (draft.kind !== undefined && draft.kind !== cur.kind)
    out.kind = draft.kind;

  if (draft.slot !== undefined) {
    const currentSlot = cur.slot ?? null;
    if (draft.slot !== currentSlot) out.slot = draft.slot;
  }
  if (draft.agentId !== undefined) {
    const currentAgent = cur.agentId ?? null;
    if (draft.agentId !== currentAgent) out.agentId = draft.agentId;
  }
  if (draft.approval !== undefined) {
    const currentApproval = cur.approval ?? null;
    if (!approvalEqual(draft.approval, currentApproval))
      out.approval = draft.approval;
  }
  return Object.keys(out).length === 0 ? null : out;
}

function approvalEqual(
  a: GuideApprovalGatePatch | null,
  b: GuideApprovalGatePatch | null,
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

function Row({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-[10.5px] uppercase tracking-[0.14em] text-fog-500 w-16 shrink-0 pt-0.5">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5 min-w-0">
        {items.length === 0 ? (
          <span className="text-fog-500 text-[11.5px]">—</span>
        ) : (
          items.map((it) => (
            <span
              key={it}
              className="mono text-[11px] px-1.5 py-0.5 rounded border border-white/[0.07] bg-white/[0.02] text-fog-300"
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
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3.5 last:mb-0">
      <div className="text-[11px] uppercase tracking-[0.14em] text-fog-500 mb-1.5">
        {label}
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
    <div className="glass p-4 fade-up fade-up-delay-2">
      <SectionEyebrow className="mb-3">
        <span>Policies</span>
      </SectionEyebrow>
      <ul className="space-y-2.5 text-[12.5px]">
        {lines.map((p) => (
          <li key={p.label} className="flex items-center justify-between">
            <span className="text-fog-200">{p.label}</span>
            <span
              className={cn(
                "text-[11px] mono px-2 py-0.5 rounded-full border",
                p.on
                  ? "bg-emerald-500/10 text-emerald-300 border-emerald-400/25"
                  : "bg-white/[0.04] text-fog-400 border-white/10",
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

function PreviewCard({ steps }: { steps: GuideStepDefinition[] }) {
  return (
    <div className="glass p-4 fade-up fade-up-delay-3">
      <SectionEyebrow className="mb-3">
        <span>Flow preview</span>
      </SectionEyebrow>
      <div className="flex flex-wrap items-center gap-1.5 mono text-[11px]">
        {steps.map((s, i) => (
          <Fragment key={s.id}>
            <span
              className={cn(
                "px-2 py-1 rounded-md border whitespace-nowrap",
                s.approval
                  ? "border-amber-400/35 bg-amber-500/[0.06] text-amber-200"
                  : "border-violet-soft/30 bg-violet-soft/[0.06] text-violet-soft",
              )}
            >
              {s.label}
            </span>
            {i < steps.length - 1 ? (
              <span className="text-fog-500">→</span>
            ) : null}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

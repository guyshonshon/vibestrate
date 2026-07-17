// The Flow Builder's per-step editing cluster: the step list row, the
// inspector panel with its kind/seat/skills/approval editors, and the
// prompt-composition visual the Dry-run modal embeds. All state stays in
// FlowBuilderPage; these components receive drafts and patch callbacks.
import { Fragment, useEffect, useState } from "react";
import {
  AlertTriangle,
  Bolt,
  ChevronRight,
  Code,
  Cpu,
  Eye,
  FileCheck,
  GripVertical,
  Lock,
  Plus,
  ShieldCheck,
  Trash2,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  api,
  type FlowApprovalGatePatch,
  type FlowApprovalRiskLevel,
  type FlowStepKind,
} from "../../lib/api.js";
import { Chip } from "../design/Chip.js";
import { HelpHint } from "../design/HelpHint.js";
import { Select } from "../design/Select.js";
import { STEP_GROUP_TONE, stepKindGroup } from "../design/stepKind.js";
import { cn } from "../design/cn.js";
import { IconBtn } from "../design/IconBtn.js";
import type {
  DiscoveredFlow,
  FlowStepDefinition,
  ResolvedFlowSnapshot,
  ResolvedFlowStep,
} from "../../lib/types.js";
import { resolveNullable, type StepDraft } from "./transforms.js";

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

export function StepRow({
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

// A visual of how a step's prompt is composed: the ordered layers that blend
// into the prompt the agent receives. Shown in the Dry-run (where the flow is
// resolved, so the real role + step context are known); run-time layers (your
// task, prior outputs' content, the review lens) are dashed and marked. It's a
// faithful map of the composition, not a byte-exact dump - the literal text only
// exists per run (flows/<step>/prompt.md).
export function PromptComposition({
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

export function StepInspector({
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

// Label + mono value chips for a step's read-only inputs/outputs lists.
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

// Shared by the inspector and the LoopCard so every labeled config block reads
// the same. Exported for the sibling previews module.
export function Field({
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

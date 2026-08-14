// The Flow Editor's step surfaces: the ordered list (add / reorder / remove)
// and the per-step field editor. Which controls a step shows comes from
// `stepFieldGate`, which mirrors the schema's refinements; whether the step is
// VALID comes from `validateDraft`, which is the schema itself. Every violation
// reaching here is already anchored to the step that caused it.
import {
  ArrowDown,
  ArrowUp,
  Circle,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "../design/Button.js";
import { Chip } from "../design/Chip.js";
import { HelpHint } from "../design/HelpHint.js";
import { IconBtn } from "../design/IconBtn.js";
import { Select } from "../design/Select.js";
import { StepKindLegend } from "../design/StepKindLegend.js";
import { STEP_GROUP_TONE, stepKindGroup } from "../design/stepKind.js";
import { cn } from "../design/cn.js";
import { KIND_INFO } from "./StepInspector.js";
import {
  EditorCard,
  IssueList,
  NumberField,
  TextField,
  ToggleField,
  TokenListField,
} from "./FlowEditorFields.js";
import {
  FLOW_STAGES,
  STEP_KINDS,
  applyKindChange,
  stepFieldGate,
  type EditorSeat,
  type EditorStep,
  type FlowIssue,
} from "./flow-draft.js";

/** Fields an issue anchors to, so a control can tint itself rose. */
function hasFieldIssue(issues: FlowIssue[], field: string): boolean {
  return issues.some(
    (i) => i.anchor.kind === "step" && i.anchor.field === field,
  );
}

export function StepList({
  steps,
  activeKey,
  issuesByIndex,
  onSelect,
  onMove,
  onRemove,
  onAdd,
}: {
  steps: EditorStep[];
  activeKey: string | null;
  issuesByIndex: Map<number, FlowIssue[]>;
  onSelect: (key: string) => void;
  onMove: (from: number, to: number) => void;
  onRemove: (key: string) => void;
  onAdd: () => void;
}) {
  return (
    <EditorCard
      title="Steps"
      action={
        <Button
          size="sm"
          variant="secondary"
          iconLeft={<Plus className="h-3.5 w-3.5" strokeWidth={1.9} />}
          onClick={onAdd}
        >
          Add step
        </Button>
      }
    >
      <StepKindLegend className="mb-3" />
      <ol className="space-y-1.5">
        {steps.map((step, i) => {
          const issues = issuesByIndex.get(i) ?? [];
          const tone = STEP_GROUP_TONE[stepKindGroup(step.kind)];
          const active = step.key === activeKey;
          return (
            <li key={step.key}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => onSelect(step.key)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  onSelect(step.key);
                }}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-[12px] border px-2.5 py-2 transition",
                  active
                    ? "border-violet-soft/45 bg-violet-soft/10"
                    : issues.length > 0
                      ? "border-rose-400/35 bg-rose-500/5 hover:border-rose-400/50"
                      : "border-[color:var(--line-soft)] bg-coal-700/50 hover:border-[color:var(--line-strong)]",
                )}
              >
                <span className="num-tabular w-5 shrink-0 text-[11px] font-bold text-chalk-300">
                  {i + 1}
                </span>
                <Circle
                  className={cn(
                    "h-2.5 w-2.5 shrink-0",
                    tone === "violet"
                      ? "fill-violet-soft text-violet-soft"
                      : tone === "sky"
                        ? "fill-sky-glow text-sky-glow"
                        : tone === "emerald"
                          ? "fill-emerald-400 text-emerald-400"
                          : "fill-amber-soft text-amber-soft",
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-chalk-100">
                    {step.label || step.id || "Untitled step"}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <Chip tone={tone}>{step.id}</Chip>
                    <Chip tone="neutral">{KIND_INFO[step.kind].title}</Chip>
                    {step.seat ? <Chip tone="neutral">{step.seat}</Chip> : null}
                    {step.needs.length > 0 ? (
                      <Chip tone="neutral">after {step.needs.join(", ")}</Chip>
                    ) : null}
                  </span>
                </span>
                {issues.length > 0 ? (
                  <span className="num-tabular shrink-0 rounded-[7px] bg-rose-400/14 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300">
                    {issues.length}
                  </span>
                ) : null}
                <span className="flex shrink-0 items-center gap-1">
                  <IconBtn
                    variant="plain"
                    title="Move up"
                    disabled={i === 0}
                    onClick={() => onMove(i, i - 1)}
                  >
                    <ArrowUp className="h-3.5 w-3.5" strokeWidth={1.9} />
                  </IconBtn>
                  <IconBtn
                    variant="plain"
                    title="Move down"
                    disabled={i === steps.length - 1}
                    onClick={() => onMove(i, i + 1)}
                  >
                    <ArrowDown className="h-3.5 w-3.5" strokeWidth={1.9} />
                  </IconBtn>
                  <IconBtn
                    danger
                    title="Remove step"
                    disabled={steps.length <= 1}
                    onClick={() => onRemove(step.key)}
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.9} />
                  </IconBtn>
                </span>
              </div>
              {issues.length > 0 && !active ? (
                <IssueList issues={issues} className="ml-7 mt-1" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </EditorCard>
  );
}

export function StepFields({
  step,
  index,
  steps,
  seats,
  issues,
  graphMode,
  onChange,
}: {
  step: EditorStep;
  index: number;
  steps: EditorStep[];
  seats: EditorSeat[];
  issues: FlowIssue[];
  graphMode: boolean;
  onChange: (next: EditorStep) => void;
}) {
  const gate = stepFieldGate(step.kind, { graphMode });
  const kind = KIND_INFO[step.kind];
  const patch = (part: Partial<EditorStep>): void => onChange({ ...step, ...part });

  // `needs` may only point at steps declared EARLIER: the schema requires the
  // array order to be a valid topological sort, which is also what makes the
  // graph acyclic by construction.
  const earlier = steps.slice(0, index).filter((s) => s.id.length > 0);

  return (
    <EditorCard
      title="Step"
      action={
        <span className="text-[11px] text-chalk-300">
          {kind.title} runs at {kind.phase}
        </span>
      }
    >
      <IssueList issues={issues} className="mb-3" />

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2.5">
          <TextField
            label="Step id"
            mono
            value={step.id}
            invalid={hasFieldIssue(issues, "id")}
            onChange={(v) => patch({ id: v })}
            placeholder="review"
          />
          <TextField
            label="Name"
            value={step.label}
            invalid={hasFieldIssue(issues, "label")}
            onChange={(v) => patch({ label: v })}
            placeholder="Review the change"
          />
        </div>

        <div>
          <div className="mb-1 flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-violet-soft">Kind</span>
            <HelpHint slug="extending/add-flow" label="Step kinds" />
          </div>
          <Select
            className="w-full"
            ariaLabel="Step kind"
            value={step.kind}
            onChange={(v) =>
              onChange(
                applyKindChange(step, v as EditorStep["kind"], { graphMode }),
              )
            }
            options={STEP_KINDS.map((k) => ({
              value: k,
              label: KIND_INFO[k].title,
              hint: KIND_INFO[k].phase,
            }))}
          />
          <p className="mt-1 text-[11px] leading-[1.45] text-chalk-300">{kind.blurb}</p>
        </div>

        {gate.seat ? (
          <div>
            <div className="mb-1 text-[11px] font-semibold text-violet-soft">Seat</div>
            <Select
              className="w-full"
              ariaLabel="Step seat"
              value={step.seat}
              placeholder="Pick a seat"
              onChange={(v) => patch({ seat: v })}
              options={seats.map((s) => ({
                value: s.id,
                label: s.label || s.id,
                hint: s.id,
              }))}
            />
          </div>
        ) : null}

        {earlier.length > 0 ? (
          <div>
            <div className="mb-1 flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-violet-soft">Needs</span>
              <HelpHint slug="extending/add-flow" label="Step dependencies" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {earlier.map((s) => {
                const on = step.needs.includes(s.id);
                return (
                  <Button
                    key={s.key}
                    size="sm"
                    variant={on ? "primary" : "outline"}
                    onClick={() =>
                      patch({
                        needs: on
                          ? step.needs.filter((n) => n !== s.id)
                          : [...step.needs, s.id],
                      })
                    }
                    title={s.label}
                    className="mono !text-[11px]"
                  >
                    {s.id}
                  </Button>
                );
              })}
            </div>
            <p className="mt-1 text-[11px] leading-[1.45] text-chalk-300">
              Steps that share the same Needs run at the same time. Leaving this
              empty everywhere keeps the flow linear.
            </p>
          </div>
        ) : null}

        {gate.instructions ? (
          <TextField
            label="Instructions"
            multiline
            value={step.instructions}
            invalid={hasFieldIssue(issues, "instructions")}
            onChange={(v) => patch({ instructions: v })}
            placeholder="Focus on error paths and boundary conditions."
            hint="Injected into this step's prompt, so two steps on one seat can take different angles."
          />
        ) : null}

        <div className="grid grid-cols-2 gap-2.5">
          <TokenListField
            label="Inputs"
            values={step.inputs}
            invalid={hasFieldIssue(issues, "inputs")}
            onChange={(v) => patch({ inputs: v })}
            placeholder="plan"
          />
          <TokenListField
            label="Outputs"
            values={step.outputs}
            invalid={hasFieldIssue(issues, "outputs")}
            onChange={(v) => patch({ outputs: v })}
            placeholder="findings"
          />
        </div>

        {gate.skills ? (
          <TokenListField
            label="Skills"
            values={step.skills}
            invalid={hasFieldIssue(issues, "skills")}
            onChange={(v) => patch({ skills: v })}
            placeholder="skill-id"
            hint="Attached to this turn's prompt on top of the role's own skills."
          />
        ) : null}

        <div>
          <div className="mb-1 text-[11px] font-semibold text-violet-soft">Stage</div>
          <Select
            className="w-full"
            ariaLabel="Resume stage"
            value={step.stage}
            placeholder="No resume boundary"
            onChange={(v) => patch({ stage: v as EditorStep["stage"] })}
            options={[
              { value: "", label: "No resume boundary" },
              ...FLOW_STAGES.map((s) => ({ value: s, label: s })),
            ]}
          />
        </div>

        {gate.approval ? (
          <div className="space-y-2.5 rounded-[12px] border border-amber-soft/25 bg-amber-soft/5 p-2.5">
            <div className="text-[11px] font-semibold text-amber-soft">
              Approval gate
            </div>
            <TextField
              label="Reason"
              value={step.approval?.reason ?? ""}
              invalid={hasFieldIssue(issues, "approval")}
              onChange={(v) =>
                patch({
                  approval: {
                    ...(step.approval ?? blankApproval()),
                    reason: v,
                  },
                })
              }
              placeholder="The change touches the payment path."
            />
            <TextField
              label="Requested action"
              value={step.approval?.requestedAction ?? ""}
              onChange={(v) =>
                patch({
                  approval: {
                    ...(step.approval ?? blankApproval()),
                    requestedAction: v,
                  },
                })
              }
              placeholder="Approve the migration before it runs."
            />
            <TextField
              label="Message to the approver"
              multiline
              value={step.approval?.userMessage ?? ""}
              onChange={(v) =>
                patch({
                  approval: {
                    ...(step.approval ?? blankApproval()),
                    userMessage: v,
                  },
                })
              }
            />
            <div>
              <div className="mb-1 text-[11px] font-semibold text-violet-soft">
                Risk level
              </div>
              <Select
                className="w-full"
                ariaLabel="Approval risk level"
                value={step.approval?.riskLevel ?? "medium"}
                onChange={(v) =>
                  patch({
                    approval: {
                      ...(step.approval ?? blankApproval()),
                      riskLevel: v as "low" | "medium" | "high",
                    },
                  })
                }
                options={[
                  { value: "low", label: "low" },
                  { value: "medium", label: "medium" },
                  { value: "high", label: "high" },
                ]}
              />
            </div>
          </div>
        ) : null}

        {gate.repeat ? (
          <div className="grid grid-cols-2 items-end gap-2.5">
            <ToggleField
              label="Repeat a fixed number of times"
              checked={step.repeatTimes !== null}
              onChange={(on) => patch({ repeatTimes: on ? 2 : null })}
            />
            {step.repeatTimes !== null ? (
              <NumberField
                label="Times"
                min={2}
                max={8}
                value={step.repeatTimes}
                invalid={hasFieldIssue(issues, "repeat")}
                onChange={(v) => patch({ repeatTimes: v })}
              />
            ) : null}
          </div>
        ) : null}

        {gate.retries ? (
          <NumberField
            label="Retries"
            min={0}
            max={5}
            value={step.retries}
            invalid={hasFieldIssue(issues, "retries")}
            onChange={(v) => patch({ retries: v })}
          />
        ) : null}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <ToggleField
            label="Optional"
            note="The run can skip it."
            checked={step.optional}
            onChange={(v) => patch({ optional: v })}
          />
          <ToggleField
            label="Skip on a read-only run"
            note="For steps that write code, or only make sense once code changed."
            checked={step.skipWhenReadOnly}
            onChange={(v) => patch({ skipWhenReadOnly: v })}
          />
          {gate.instructions ? (
            <ToggleField
              label="Clean room"
              note="This seat gets the declared inputs and the task, not the story of how the work got here."
              checked={step.cleanRoom}
              onChange={(v) => patch({ cleanRoom: v })}
            />
          ) : null}
          {gate.continueOnError ? (
            <ToggleField
              label="Continue on error"
              note="A hard failure marks the step failed and lets the rest of the fan-out finish."
              checked={step.continueOnError}
              onChange={(v) => patch({ continueOnError: v })}
            />
          ) : null}
          {gate.skipWhen ? (
            <ToggleField
              label="Skip when the diff is prose only"
              note="Skipped when the run's actual diff touches only docs and no protected path."
              checked={step.skipWhen === "inert_diff"}
              onChange={(v) => patch({ skipWhen: v ? "inert_diff" : "" })}
            />
          ) : null}
        </div>
      </div>
    </EditorCard>
  );
}

function blankApproval(): NonNullable<EditorStep["approval"]> {
  return {
    reason: "",
    requestedAction: "",
    userMessage: "",
    riskLevel: "medium",
  };
}

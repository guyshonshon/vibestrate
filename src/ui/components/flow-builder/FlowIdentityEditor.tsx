// The Flow Editor's non-step surfaces: the flow's identity, its seats, and the
// adaptive loop. Same contract as the step editor - controls are affordances,
// `flowDefinitionSchema` is the judge, and every violation arrives anchored.
import { Plus, Trash2 } from "lucide-react";
import { Button } from "../design/Button.js";
import { HelpHint } from "../design/HelpHint.js";
import { IconBtn } from "../design/IconBtn.js";
import { Select } from "../design/Select.js";
import {
  EditorCard,
  IssueList,
  NumberField,
  TextField,
} from "./FlowEditorFields.js";
import type {
  EditorLoop,
  EditorSeat,
  EditorStep,
  FlowIssue,
} from "./flow-draft.js";

export function IdentityCard({
  id,
  version,
  label,
  description,
  idLocked,
  issues,
  onChange,
}: {
  id: string;
  version: number;
  label: string;
  description: string;
  /** True when editing a saved flow: the id is the folder it lives in. */
  idLocked: boolean;
  issues: FlowIssue[];
  onChange: (part: {
    id?: string;
    version?: number;
    label?: string;
    description?: string;
  }) => void;
}) {
  const field = (name: string): boolean =>
    issues.some((i) => i.anchor.kind === "flow" && i.anchor.field === name);
  return (
    <EditorCard title="Flow">
      <IssueList issues={issues} className="mb-3" />
      <div className="space-y-3">
        <div className="grid grid-cols-[1fr_88px] gap-2.5">
          <TextField
            label="Flow id"
            mono
            disabled={idLocked}
            value={id}
            invalid={field("id")}
            onChange={(v) => onChange({ id: v })}
            placeholder="deep-review"
            hint={
              idLocked
                ? "Fixed once saved. It names the folder under .vibestrate/flows/."
                : "Names the folder under .vibestrate/flows/ and how you launch the flow."
            }
          />
          <NumberField
            label="Version"
            min={1}
            max={9999}
            value={version}
            invalid={field("version")}
            onChange={(v) => onChange({ version: v })}
          />
        </div>
        <TextField
          label="Name"
          value={label}
          invalid={field("label")}
          onChange={(v) => onChange({ label: v })}
          placeholder="Deep review"
        />
        <TextField
          label="Description"
          multiline
          value={description}
          invalid={field("description")}
          onChange={(v) => onChange({ description: v })}
          placeholder="Plans, builds, then puts the change through a two-reviewer panel."
        />
      </div>
    </EditorCard>
  );
}

export function SeatsCard({
  seats,
  issuesBySeat,
  onChange,
  onAdd,
  onRemove,
}: {
  seats: EditorSeat[];
  issuesBySeat: Map<string, FlowIssue[]>;
  onChange: (key: string, part: Partial<EditorSeat>) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
}) {
  return (
    <EditorCard
      title="Seats"
      action={
        <Button
          size="sm"
          variant="secondary"
          iconLeft={<Plus className="h-3.5 w-3.5" strokeWidth={1.9} />}
          onClick={onAdd}
        >
          Add seat
        </Button>
      }
    >
      <p className="mb-3 text-meta leading-[1.45] text-chalk-300">
        A seat is a job the flow needs filled. The crew you run with supplies the
        role, so the flow stays portable.
      </p>
      <div className="space-y-2.5">
        {seats.map((seat) => {
          const issues = issuesBySeat.get(seat.id) ?? [];
          return (
            <div
              key={seat.key}
              className="rounded-[12px] border border-[color:var(--line-soft)] bg-coal-700/50 p-2.5"
            >
              <div className="mb-2 flex items-start gap-2">
                <div className="grid min-w-0 flex-1 grid-cols-2 gap-2.5">
                  <TextField
                    label="Seat id"
                    mono
                    value={seat.id}
                    invalid={issues.length > 0}
                    onChange={(v) => onChange(seat.key, { id: v })}
                    placeholder="reviewer"
                  />
                  <TextField
                    label="Name"
                    value={seat.label}
                    onChange={(v) => onChange(seat.key, { label: v })}
                    placeholder="Reviewer"
                  />
                </div>
                <span className="pt-[18px]">
                  <IconBtn
                    danger
                    title="Remove seat"
                    disabled={seats.length <= 1}
                    onClick={() => onRemove(seat.key)}
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.9} />
                  </IconBtn>
                </span>
              </div>
              <TextField
                label="Description"
                value={seat.description}
                onChange={(v) => onChange(seat.key, { description: v })}
                placeholder="Critiques the change without writing code."
              />
              <IssueList issues={issues} className="mt-2" />
            </div>
          );
        })}
      </div>
    </EditorCard>
  );
}

export function LoopCard({
  loop,
  steps,
  issues,
  graphMode,
  onChange,
}: {
  loop: EditorLoop | null;
  steps: EditorStep[];
  issues: FlowIssue[];
  graphMode: boolean;
  onChange: (next: EditorLoop | null) => void;
}) {
  const stepOptions = steps
    .filter((s) => s.id.length > 0)
    .map((s) => ({ value: s.id, label: s.label || s.id, hint: s.id }));

  // The schema requires the decision step to be a review-turn inside from..to,
  // so those are the ones offered. A decision step that has drifted out of range
  // stays selectable, else changing `to` would silently blank the field.
  const fromI = loop ? steps.findIndex((s) => s.id === loop.from) : -1;
  const toI = loop ? steps.findIndex((s) => s.id === loop.to) : -1;
  const reviewsInRange =
    loop && fromI >= 0 && toI >= fromI
      ? steps.slice(fromI, toI + 1).filter((s) => s.kind === "review-turn")
      : [];
  const decisionOptions = [
    ...(loop && !reviewsInRange.some((s) => s.id === loop.decisionStep)
      ? [{ value: loop.decisionStep, label: loop.decisionStep || "Not set" }]
      : []),
    ...reviewsInRange.map((s) => ({ value: s.id, label: s.label || s.id, hint: s.id })),
  ];

  function enable(): void {
    const first = steps[0];
    const lastReview = [...steps].reverse().find((s) => s.kind === "review-turn");
    const last = lastReview ?? steps[steps.length - 1];
    if (!first || !last) return;
    onChange({
      from: first.id,
      to: last.id,
      decisionStep: (lastReview ?? last).id,
      maxIterations: 3,
    });
  }

  return (
    <EditorCard
      title="Loop"
      action={
        <span className="flex items-center gap-2">
          <HelpHint slug="extending/add-flow" label="Adaptive loops" />
          <Button
            size="sm"
            variant={loop ? "ghost" : "secondary"}
            disabled={!loop && graphMode}
            title={
              !loop && graphMode
                ? "A flow with step dependencies can't also loop"
                : undefined
            }
            onClick={() => (loop ? onChange(null) : enable())}
          >
            {loop ? "Remove" : "Add loop"}
          </Button>
        </span>
      }
    >
      <IssueList issues={issues} className="mb-3" />
      {!loop ? (
        <p className="text-meta leading-[1.45] text-chalk-300">
          A loop repeats a run of steps while a review keeps asking for changes.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <div className="mb-1 text-meta font-semibold text-violet-soft">
                From
              </div>
              <Select
                className="w-full"
                ariaLabel="Loop first step"
                value={loop.from}
                onChange={(v) => onChange({ ...loop, from: v })}
                options={stepOptions}
              />
            </div>
            <div>
              <div className="mb-1 text-meta font-semibold text-violet-soft">To</div>
              <Select
                className="w-full"
                ariaLabel="Loop last step"
                value={loop.to}
                onChange={(v) => onChange({ ...loop, to: v })}
                options={stepOptions}
              />
            </div>
          </div>
          <div>
            <div className="mb-1 text-meta font-semibold text-violet-soft">
              Decision step
            </div>
            <Select
              className="w-full"
              ariaLabel="Loop decision step"
              value={loop.decisionStep}
              placeholder="Pick a review in the range"
              onChange={(v) => onChange({ ...loop, decisionStep: v })}
              options={decisionOptions}
            />
            <p className="mt-1 text-meta text-chalk-300">
              The loop exits when this review stops requesting changes.
            </p>
          </div>
          <NumberField
            label="Max iterations"
            min={1}
            max={8}
            value={loop.maxIterations}
            onChange={(v) => onChange({ ...loop, maxIterations: v })}
          />
        </div>
      )}
    </EditorCard>
  );
}

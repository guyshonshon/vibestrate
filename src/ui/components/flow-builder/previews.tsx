// The Flow Builder's sidebar cards: the adaptive-loop editor, the static
// policies card, and the compact step-chain preview. State stays in
// FlowBuilderPage; LoopCard edits through the onChange it's handed.
import { Fragment } from "react";
import { HelpHint } from "../design/HelpHint.js";
import { Select } from "../design/Select.js";
import { cn } from "../design/cn.js";
import type { FlowLoop, FlowStepDefinition } from "../../lib/types.js";
import { Field } from "./StepInspector.js";

export function PolicyCard() {
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

export function PreviewCard({ steps }: { steps: FlowStepDefinition[] }) {
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

export function LoopCard({
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

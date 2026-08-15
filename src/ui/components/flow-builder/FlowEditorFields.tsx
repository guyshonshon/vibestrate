// Shared controls for the Flow Editor: the text/number fields, the token-list
// editor behind `inputs` / `outputs` / `skills`, the toggle row, and the
// violation list. Nothing here validates - `flow-draft.ts` owns that, and these
// render what it produced.
import type { ReactNode } from "react";
import { AlertTriangle, Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "../design/Button.js";
import { IconBtn } from "../design/IconBtn.js";
import { cn } from "../design/cn.js";
import type { FlowIssue } from "./flow-draft.js";

/** The dashboard's input skin, shared so a field can't drift from its neighbour. */
export const INPUT_CLASS =
  "w-full rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 px-2.5 py-1.5 text-[12.5px] text-chalk-100 outline-none placeholder:text-chalk-400 focus:border-violet-soft/50 disabled:opacity-50";

/** Same skin, tinted rose when the schema flagged this exact field. */
export function fieldClass(invalid: boolean): string {
  return cn(INPUT_CLASS, invalid && "border-rose-400/50 focus:border-rose-400/70");
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  mono,
  invalid,
  disabled,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** What the field is for. Omit when the label already says it. */
  hint?: string;
  mono?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  multiline?: boolean;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-meta font-semibold text-violet-soft">{label}</div>
      {multiline ? (
        <textarea
          rows={3}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={cn(fieldClass(invalid === true), "resize-y leading-[1.5]")}
        />
      ) : (
        <input
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={cn(fieldClass(invalid === true), mono && "mono")}
        />
      )}
      {hint ? <p className="mt-1 text-meta text-chalk-300">{hint}</p> : null}
    </label>
  );
}

export function NumberField({
  label,
  value,
  min,
  max,
  onChange,
  invalid,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  invalid?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-meta font-semibold text-violet-soft">{label}</div>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) ? n : min);
        }}
        className={cn(fieldClass(invalid === true), "num-tabular")}
      />
    </label>
  );
}

/** A labelled checkbox row. The label carries the colour; the note explains why. */
export function ToggleField({
  label,
  note,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  note?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2 rounded-[10px] border border-[color:var(--line-soft)] bg-coal-700/60 px-2.5 py-2",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-[3px] accent-[color:var(--violet-soft,#a78bfa)]"
      />
      <span className="min-w-0">
        <span className="block text-[12px] font-semibold text-chalk-100">{label}</span>
        {note ? (
          <span className="mt-0.5 block text-meta leading-[1.45] text-chalk-300">
            {note}
          </span>
        ) : null}
      </span>
    </label>
  );
}

/**
 * A list of short tokens (`inputs`, `outputs`, `skills`). Free text on purpose:
 * these name artifacts a flow author invents, so there is no closed vocabulary
 * to offer. The schema's token rules decide what survives; this only collects.
 */
export function TokenListField({
  label,
  hint,
  values,
  onChange,
  placeholder,
  invalid,
  disabled,
}: {
  label: string;
  hint?: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState("");
  const commit = (): void => {
    const token = pending.trim();
    if (!token || values.includes(token)) {
      setPending("");
      return;
    }
    onChange([...values, token]);
    setPending("");
  };
  return (
    <div>
      <div className="mb-1 text-meta font-semibold text-violet-soft">{label}</div>
      {values.length > 0 ? (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {values.map((token) => (
            <span
              key={token}
              className="inline-flex items-center gap-1 rounded-[7px] bg-violet-soft/14 py-0.5 pl-2 pr-0.5 text-meta font-semibold text-violet-soft"
            >
              <span className="mono">{token}</span>
              <IconBtn
                variant="plain"
                title={`Remove ${token}`}
                disabled={disabled}
                onClick={() => onChange(values.filter((v) => v !== token))}
              >
                <X className="h-3 w-3" strokeWidth={2} />
              </IconBtn>
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex items-center gap-1.5">
        <input
          value={pending}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => setPending(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            commit();
          }}
          className={cn(fieldClass(invalid === true), "mono")}
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || pending.trim().length === 0}
          onClick={commit}
          title={`Add to ${label}`}
          className="!px-2"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.9} />
        </Button>
      </div>
      {hint ? <p className="mt-1 text-meta text-chalk-300">{hint}</p> : null}
    </div>
  );
}

/**
 * Violations, verbatim from `flowDefinitionSchema`. The schema's messages
 * already name the step and say what to do, so they are not rewritten here -
 * a paraphrase would be a second copy of a rule that lives in one place.
 */
export function IssueList({
  issues,
  className,
}: {
  issues: FlowIssue[];
  className?: string;
}) {
  if (issues.length === 0) return null;
  return (
    <ul className={cn("space-y-1.5", className)}>
      {issues.map((issue, i) => (
        <li
          key={i}
          className="flex items-start gap-1.5 rounded-[10px] bg-rose-500/10 px-2.5 py-1.5 text-meta leading-[1.45] text-rose-300"
        >
          <AlertTriangle
            className="mt-[2px] h-3.5 w-3.5 shrink-0"
            strokeWidth={1.9}
            aria-hidden
          />
          <span className="min-w-0">{issue.message}</span>
        </li>
      ))}
    </ul>
  );
}

/** A framed editor region, matching Mission Control's contained card. */
export function EditorCard({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4",
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[12px] font-semibold text-violet-vivid">{title}</span>
        {action ?? null}
      </div>
      {children}
    </div>
  );
}

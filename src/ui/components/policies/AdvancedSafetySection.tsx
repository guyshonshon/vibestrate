import type { SafetyPoliciesConfig } from "../../lib/types.js";
import { Section } from "../layout/PageShell.js";
import { cn } from "../design/cn.js";

type ToggleKey = keyof Omit<SafetyPoliciesConfig, "requireApprovalAtStages">;

type Props = {
  safety: SafetyPoliciesConfig;
  onToggle: (key: ToggleKey, value: boolean) => void;
};

/** `hint` is present only where the control's own label cannot carry the fact. */
type Row = { key: ToggleKey; label: string; hint?: string };
type Group = { title: string; rows: Row[] };

/**
 * Three intents, not one undifferentiated list of nine switches: the hard guards
 * are the fail-closed security invariants, execution changes how write seats
 * run, posture is the opt-in escalation.
 *
 * Exported so the loading skeleton can mirror the real row counts - a skeleton
 * that guesses its own row count is what makes the page jump when data lands.
 */
export const SAFETY_GROUPS: Group[] = [
  {
    title: "Hard guards",
    rows: [
      { key: "forbidMainBranchWrites", label: "Forbid main-branch writes" },
      {
        key: "forbidSecretsAccess",
        label: "Forbid secrets access",
        hint: "Covers .env and key files.",
      },
      { key: "forbidAutoPush", label: "Forbid auto-push" },
      { key: "forbidAutoMerge", label: "Forbid auto-merge" },
    ],
  },
  {
    title: "Execution",
    rows: [
      {
        key: "strictApplyOnly",
        label: "Strict apply-only mode",
        hint: "Write roles propose a diff instead of writing to disk.",
      },
      {
        key: "hardenReadOnlySeats",
        label: "Harden read-only seats",
        hint: "claude runs --permission-mode plan; codex confines via execution.isolation.",
      },
      {
        key: "allowInteractiveTerminal",
        label: "Interactive terminal",
        hint: "Scoped to a run worktree.",
      },
    ],
  },
  {
    title: "Supervisor posture",
    rows: [
      {
        key: "autoApplySandbox",
        label: "Auto-apply sandbox",
        hint: "A provider with no host sandbox degrades per-seat.",
      },
      {
        key: "autoApplyApproval",
        label: "Auto-apply approval gate",
        hint: "Suppressed when unattended; an explicit --permission-mode wins.",
      },
    ],
  },
];

/**
 * One border around a whole group with hairline-divided rows, so a group of four
 * reads as one control list rather than four washes floating on the page canvas.
 *
 * `GROUP_FRAME` is the same card without `divide-y`, for a skeleton: the
 * Skeleton root puts a `display:contents` wrapper between the card and its
 * bones, and `divide-y`'s child selector matches that wrapper instead of the
 * rows, so a skeleton draws its own row borders.
 */
export const GROUP_FRAME =
  "flex flex-col overflow-hidden rounded-[18px] border border-[color:var(--line)] bg-coal-600";

export const GROUP_CARD = `${GROUP_FRAME} divide-y divide-[color:var(--line-soft)]`;

function Switch({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="text-meta text-chalk-200">{on ? "on" : "off"}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition",
          on
            ? "border-violet-soft/50 bg-violet-soft/30"
            : "border-[color:var(--line-strong)] bg-coal-800",
        )}
      >
        <span
          className={cn(
            "absolute h-4 w-4 rounded-full transition",
            on ? "left-6 bg-violet-vivid" : "left-1 bg-chalk-300",
          )}
        />
      </button>
    </div>
  );
}

function ToggleRow({
  row,
  on,
  onToggle,
}: {
  row: Row;
  on: boolean;
  onToggle: (k: ToggleKey, v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-chalk-100">{row.label}</div>
        {row.hint ? (
          <p className="mt-1 max-w-[52ch] text-meta leading-[1.55] text-chalk-400">
            {row.hint}
          </p>
        ) : null}
      </div>
      <Switch on={on} label={row.label} onChange={(v) => onToggle(row.key, v)} />
    </div>
  );
}

/**
 * Safety gates - the editable `policies.*` / `posture.*` toggles. Mirrors
 * `vibe policies config` (UI<->CLI parity). The hard security gates (action-broker
 * deny, secret refusal) live in the engine itself and are not weakened by
 * anything here.
 */
export function AdvancedSafetySection({ safety, onToggle }: Props) {
  return (
    <>
      {SAFETY_GROUPS.map((group) => (
        <Section flush key={group.title} title={group.title}>
          <div className={GROUP_CARD}>
            {group.rows.map((row) => (
              <ToggleRow
                key={row.key}
                row={row}
                on={safety[row.key]}
                onToggle={onToggle}
              />
            ))}
          </div>
        </Section>
      ))}
    </>
  );
}

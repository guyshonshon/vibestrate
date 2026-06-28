import type { SafetyPoliciesConfig } from "../../lib/types.js";
import { cn } from "../design/cn.js";

type ToggleKey = keyof Omit<SafetyPoliciesConfig, "requireApprovalAtStages">;

type Props = {
  safety: SafetyPoliciesConfig;
  onToggle: (key: ToggleKey, value: boolean) => void;
};

type Row = { key: ToggleKey; label: string; hint: string };
type Group = { title: string; blurb: string; rows: Row[] };

// Grouped so the surface reads as three intents, not one undifferentiated list of
// nine switches. The hard guards are the fail-closed security invariants; the
// execution group changes how write seats run; posture is the opt-in escalation.
const GROUPS: Group[] = [
  {
    title: "Hard guards",
    blurb: "Fail-closed invariants. Leave these on unless you have a reason.",
    rows: [
      { key: "forbidMainBranchWrites", label: "Forbid main-branch writes", hint: "Refuse any change targeting the main branch." },
      { key: "forbidSecretsAccess", label: "Forbid secrets access", hint: "Refuse reads/writes of secret-shaped files (.env, keys)." },
      { key: "forbidAutoPush", label: "Forbid auto-push", hint: "Never push to a remote automatically." },
      { key: "forbidAutoMerge", label: "Forbid auto-merge", hint: "Never merge to main automatically." },
    ],
  },
  {
    title: "Execution",
    blurb: "How write-capable seats run.",
    rows: [
      { key: "strictApplyOnly", label: "Strict apply-only mode", hint: "Write roles run read-only and propose a diff applied through the gateway. No direct disk writes." },
      { key: "hardenReadOnlySeats", label: "Harden read-only seats", hint: "Read-only claude seats run --permission-mode plan; codex seats confine via execution.isolation." },
      { key: "allowInteractiveTerminal", label: "Interactive terminal", hint: "Enable the dashboard's live terminal panel (scoped to a run worktree)." },
    ],
  },
  {
    title: "Supervisor posture",
    blurb: "Let a supervisor's suggested posture take effect (opt-in; can only raise confinement).",
    rows: [
      { key: "autoApplySandbox", label: "Auto-apply sandbox", hint: "Run a sandbox-suggested task OS-sandboxed; a provider with no host sandbox degrades per-seat." },
      { key: "autoApplyApproval", label: "Auto-apply approval gate", hint: "Hold each change for your approval; suppressed when unattended, and an explicit --permission-mode wins." },
    ],
  },
];

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn(
        "relative inline-flex h-[20px] w-[34px] shrink-0 items-center rounded-full transition-colors",
        on ? "bg-violet-soft" : "bg-coal-400",
      )}
    >
      <span
        className={cn(
          "inline-block h-[15px] w-[15px] transform rounded-full bg-chalk-100 transition-transform",
          on ? "translate-x-[16px]" : "translate-x-[3px]",
        )}
      />
    </button>
  );
}

function ToggleRow({ row, on, onToggle }: { row: Row; on: boolean; onToggle: (k: ToggleKey, v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-[14px] bg-coal-500/50 px-3.5 py-2.5">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-chalk-100">{row.label}</div>
        <p className="mt-0.5 text-[11.5px] leading-snug text-chalk-300">{row.hint}</p>
      </div>
      <Toggle on={on} label={row.label} onChange={(v) => onToggle(row.key, v)} />
    </div>
  );
}

/**
 * Safety gates - the editable `policies.*` / `posture.*` toggles, grouped by
 * intent. Mirrors `vibe policies config` (UI<->CLI parity). The hard security
 * gates (action-broker deny, secret refusal) live in the engine itself and are
 * not weakened by anything here.
 */
export function AdvancedSafetySection({ safety, onToggle }: Props) {
  return (
    <div className="space-y-5">
      {GROUPS.map((group) => (
        <section key={group.title}>
          <h3 className="text-[13px] font-semibold text-chalk-100">{group.title}</h3>
          <p className="mt-0.5 text-[11.5px] text-chalk-300">{group.blurb}</p>
          <div className="mt-2.5 space-y-1.5">
            {group.rows.map((row) => (
              <ToggleRow key={row.key} row={row} on={safety[row.key]} onToggle={onToggle} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

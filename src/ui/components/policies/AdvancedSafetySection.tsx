import type { SafetyPoliciesConfig } from "../../lib/types.js";

type ToggleKey = keyof Omit<SafetyPoliciesConfig, "requireApprovalAtStages">;

type Props = {
  safety: SafetyPoliciesConfig;
  /** Number of action policies loaded (for the live preview). */
  actionCount: number;
  onToggle: (key: ToggleKey, value: boolean) => void;
};

type Row = {
  key: ToggleKey;
  label: string;
  hint: string;
  badge?: string;
};

const ROWS: Row[] = [
  {
    key: "strictApplyOnly",
    label: "Strict apply-only mode",
    hint: "Write roles run read-only and propose a diff; Vibestrate applies it through the gateway. No direct disk writes.",
    badge: "high-assurance",
  },
  {
    key: "hardenReadOnlySeats",
    label: "Harden read-only seats",
    hint: "Read-only claude seats run with --permission-mode plan, so the CLI itself refuses writes (the agent won't attempt them). codex seats use execution.isolation instead.",
  },
  {
    key: "allowInteractiveTerminal",
    label: "Interactive terminal",
    hint: "Enable the dashboard's live terminal panel (scoped to a run worktree).",
  },
  {
    key: "forbidMainBranchWrites",
    label: "Forbid main-branch writes",
    hint: "Refuse any change targeting the main branch.",
  },
  {
    key: "forbidSecretsAccess",
    label: "Forbid secrets access",
    hint: "Refuse reads/writes of secret-shaped files (.env, keys, …).",
  },
  { key: "forbidAutoPush", label: "Forbid auto-push", hint: "Never push automatically." },
  { key: "forbidAutoMerge", label: "Forbid auto-merge", hint: "Never merge automatically." },
];

// Posture auto-apply (Slice 2b). A distinct category from the hard guards above:
// these let the supervisor's *suggested* posture take effect. Both default off.
const POSTURE_ROWS: Row[] = [
  {
    key: "autoApplySandbox",
    label: "Auto-apply sandbox",
    hint: "When the supervisor suggests it, run the task OS-sandboxed (execution.isolation). A provider with no host sandbox degrades per-seat - never a false claim.",
  },
  {
    key: "autoApplyApproval",
    label: "Auto-apply approval gate",
    hint: "When the supervisor suggests it, hold each change for your approval (permission mode: ask). Suppressed for unattended runs; an explicit --permission-mode always wins.",
  },
];

function ToggleRow({
  row,
  on,
  onToggle,
}: {
  row: Row;
  on: boolean;
  onToggle: (key: ToggleKey, value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-vibestrate-border bg-vibestrate-panel-2 px-2.5 py-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11.5px] font-medium text-vibestrate-fg">{row.label}</span>
          {row.badge ? (
            <span className="rounded bg-emerald-500/15 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-300">
              {row.badge}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-[10.5px] leading-snug text-vibestrate-fg-muted">{row.hint}</p>
      </div>
      <Switch on={on} label={row.label} onChange={(v) => onToggle(row.key, v)} />
    </div>
  );
}

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
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-[18px] w-[32px] shrink-0 items-center rounded-full transition-colors ${
        on ? "bg-vibestrate-accent" : "bg-vibestrate-border"
      }`}
    >
      <span
        className={`inline-block h-[14px] w-[14px] transform rounded-full bg-white transition-transform ${
          on ? "translate-x-[16px]" : "translate-x-[2px]"
        }`}
      />
    </button>
  );
}

/** Live, plain-language preview of how runs behave under the current toggles. */
function BehaviorPreview({
  safety,
  actionCount,
}: {
  safety: SafetyPoliciesConfig;
  actionCount: number;
}) {
  const lines: { tone: "on" | "info"; text: string }[] = [];

  if (safety.strictApplyOnly) {
    lines.push({
      tone: "on",
      text: "Write roles run read-only - they propose a unified diff that Vibestrate applies through the Action Broker gateway (secret/path safety → policy → audited git apply). Nothing reaches disk un-gated.",
    });
  } else {
    lines.push({
      tone: "info",
      text: "Agents write to the worktree directly; every write-capable turn is snapshotted and its diff reviewed by the post-turn gate before the run continues.",
    });
  }

  lines.push({
    tone: safety.hardenReadOnlySeats ? "on" : "info",
    text: safety.hardenReadOnlySeats
      ? "Read-only claude seats run under --permission-mode plan - the CLI refuses writes outright (codex seats confine via execution.isolation)."
      : "Read-only seats rely on the provider's default no-write behavior (worktree + diff gate still apply).",
  });

  lines.push({
    tone: actionCount > 0 ? "on" : "info",
    text:
      actionCount > 0
        ? `${actionCount} action policy(ies) loaded - matching effects are denied or held for approval.`
        : "No action policies loaded - effects are recorded (default-allow). Add policies in .vibestrate/policies/*.yml.",
  });

  const guards = [
    safety.forbidMainBranchWrites && "main-branch writes",
    safety.forbidSecretsAccess && "secrets access",
    safety.forbidAutoPush && "auto-push",
    safety.forbidAutoMerge && "auto-merge",
  ].filter(Boolean) as string[];
  if (guards.length > 0) {
    lines.push({ tone: "on", text: `Hard guards: ${guards.join(", ")} are blocked.` });
  }

  lines.push({
    tone: safety.allowInteractiveTerminal ? "on" : "info",
    text: safety.allowInteractiveTerminal
      ? "The dashboard terminal panel is enabled."
      : "The dashboard terminal panel is disabled.",
  });

  lines.push({
    tone: safety.autoApplySandbox ? "on" : "info",
    text: safety.autoApplySandbox
      ? "A sandbox-suggested run is auto-applied OS-sandboxed (codex confines; claude degrades per-seat)."
      : "A suggested sandbox posture stays advisory - shown, not applied.",
  });

  lines.push({
    tone: safety.autoApplyApproval ? "on" : "info",
    text: safety.autoApplyApproval
      ? "An approval-suggested run holds each change for your sign-off (skipped when unattended)."
      : "A suggested approval gate stays advisory - shown, not applied.",
  });

  return (
    <div className="mt-3 rounded-lg border border-vibestrate-accent/30 bg-vibestrate-accent/[0.06] p-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.14em] text-vibestrate-accent">
          Preview
        </span>
        <span className="text-[10.5px] text-vibestrate-fg-muted">
          what a run will do with these settings
        </span>
      </div>
      <ul className="mt-2 space-y-1.5">
        {lines.map((l, i) => (
          <li key={i} className="flex gap-2 text-[11px] leading-snug">
            <span
              className={
                l.tone === "on"
                  ? "text-vibestrate-accent"
                  : "text-vibestrate-fg-muted"
              }
            >
              ●
            </span>
            <span className="text-vibestrate-fg-dim">{l.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Advanced - Safety behavior. The highlighted, editable surface for the
 * `policies.*` toggles, with a live preview of resulting run behavior. Mirrors
 * `vibe policies config` (UI⇄CLI parity).
 */
export function AdvancedSafetySection({ safety, actionCount, onToggle }: Props) {
  return (
    <section className="rounded-xl border border-vibestrate-accent/40 bg-vibestrate-accent/[0.04] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-vibestrate-accent/20 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-vibestrate-accent">
          Advanced
        </span>
        <h3 className="text-[12px] font-medium text-vibestrate-fg">
          Safety behavior
        </h3>
        <span className="text-[10.5px] text-vibestrate-fg-muted">
          how the Action Broker gates this project's runs
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {ROWS.map((row) => (
          <ToggleRow key={row.key} row={row} on={safety[row.key]} onToggle={onToggle} />
        ))}
      </div>

      <div className="mt-4 border-t border-vibestrate-border pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <h4 className="text-[11.5px] font-medium text-vibestrate-fg">
            Posture auto-apply
          </h4>
          <span className="text-[10px] text-vibestrate-fg-muted">opt-in, off by default</span>
        </div>
        <p className="mt-0.5 text-[10.5px] leading-snug text-vibestrate-fg-muted">
          Let the supervisor's suggested posture take effect for a run instead of
          only being shown. A suggestion can only raise confinement, never lower it.
        </p>
        <div className="mt-2 space-y-2">
          {POSTURE_ROWS.map((row) => (
            <ToggleRow key={row.key} row={row} on={safety[row.key]} onToggle={onToggle} />
          ))}
        </div>
      </div>

      <BehaviorPreview safety={safety} actionCount={actionCount} />
    </section>
  );
}

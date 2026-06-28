import { useState } from "react";
import { Plus, Check, X, Trash2 } from "lucide-react";
import { api } from "../../lib/api.js";
import type { ProjectPolicy } from "../../lib/types.js";
import { Button } from "../design/Button.js";
import { Select } from "../design/Select.js";
import { cn } from "../design/cn.js";

const INPUT =
  "w-full rounded-[12px] border border-[color:var(--line-strong)] bg-coal-800 px-3 py-2 text-[13px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none";

/**
 * Project policies (docs/design/policy-consolidation.md): the owner authors both
 * tiers here - an `advise` rule the reviewer checks, or a `block` rule with a
 * deterministic matcher that caps the merge. The composer hides behind one button
 * so the resting view is just the list. Pending (supervisor-proposed) rules show
 * Confirm/Reject; active rules show Remove.
 */
export function ProjectPoliciesSection({
  policies,
  onChanged,
}: {
  policies: ProjectPolicy[];
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [statement, setStatement] = useState("");
  const [fix, setFix] = useState("");
  const [tier, setTier] = useState<"advise" | "block">("advise");
  const [matcher, setMatcher] = useState("");

  function slugId(text: string): string {
    return (
      text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 50) ||
      `policy-${Date.now()}`
    );
  }

  async function mutate(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const s = statement.trim();
    if (!s) return;
    if (tier === "block" && !matcher.trim()) {
      setError("A block policy needs a matcher (regex).");
      return;
    }
    await mutate(async () => {
      await api.addProjectPolicy({
        id: slugId(s),
        statement: s,
        correction: tier === "advise" ? fix.trim() || null : null,
        tier,
        matcher: tier === "block" ? matcher.trim() : null,
      });
      setStatement("");
      setFix("");
      setMatcher("");
      setTier("advise");
      setAdding(false);
    });
  }

  const pending = policies.filter((p) => !p.confirmedAt);
  const active = policies.filter((p) => p.confirmedAt);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="max-w-[60ch] text-[12.5px] leading-snug text-chalk-300">
          Owner-authored rules enforced under any supervisor.{" "}
          <span className="text-chalk-100">Advise</span> rules the reviewer checks;{" "}
          <span className="text-chalk-100">block</span> rules cap the merge with a
          deterministic matcher.
        </p>
        {!adding ? (
          <Button
            variant="primary"
            size="sm"
            iconLeft={<Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
            onClick={() => {
              setError(null);
              setAdding(true);
            }}
          >
            New policy
          </Button>
        ) : null}
      </div>

      {adding ? (
        <div className="space-y-2.5 rounded-[16px] border border-[color:var(--line)] bg-coal-700 p-3.5">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              placeholder="Rule, e.g. use a hyphen, not an em-dash"
              className={cn(INPUT, "flex-1")}
            />
            <Select
              value={tier}
              ariaLabel="policy tier"
              onChange={(v) => setTier(v as "advise" | "block")}
              options={[
                { value: "advise", label: "advise" },
                { value: "block", label: "block" },
              ]}
            />
          </div>
          {tier === "advise" ? (
            <input
              value={fix}
              onChange={(e) => setFix(e.target.value)}
              placeholder="Fix the reviewer should name (optional)"
              className={INPUT}
            />
          ) : (
            <input
              value={matcher}
              onChange={(e) => setMatcher(e.target.value)}
              placeholder="Matcher regex, e.g. SectionEyebrow (required for block)"
              className={cn(INPUT, "font-mono")}
            />
          )}
          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" disabled={busy || !statement.trim()} onClick={() => void add()}>
              Add policy
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-[11.5px] text-rose-300">
          {error}
        </div>
      ) : null}

      {policies.length === 0 && !adding ? (
        <div className="rounded-[16px] border border-dashed border-[color:var(--line)] px-4 py-8 text-center">
          <p className="text-[13px] text-chalk-300">No project policies yet.</p>
          <p className="mt-1 text-[12px] text-chalk-400">
            Optional - a plain run needs none.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {pending.map((p) => (
            <PolicyRow
              key={p.id}
              policy={p}
              busy={busy}
              onConfirm={() => void mutate(() => api.confirmProjectPolicy(p.id))}
              onReject={() => void mutate(() => api.rejectProjectPolicy(p.id))}
            />
          ))}
          {active.map((p) => (
            <PolicyRow
              key={p.id}
              policy={p}
              busy={busy}
              onRemove={() => void mutate(() => api.removeProjectPolicy(p.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TierChip({ tier }: { tier: "advise" | "block" }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-[8px] px-2 py-0.5 text-[10.5px] font-semibold",
        tier === "block"
          ? "bg-amber-soft/12 text-amber-soft"
          : "bg-violet-soft/12 text-violet-soft",
      )}
    >
      {tier}
    </span>
  );
}

function PolicyRow({
  policy: p,
  busy,
  onConfirm,
  onReject,
  onRemove,
}: {
  policy: ProjectPolicy;
  busy: boolean;
  onConfirm?: () => void;
  onReject?: () => void;
  onRemove?: () => void;
}) {
  const proposed = !p.confirmedAt;
  return (
    <div className="flex items-center gap-3 rounded-[14px] border border-[color:var(--line)] bg-coal-600 px-3.5 py-2.5">
      <TierChip tier={p.tier} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-chalk-100">{p.statement}</span>
          {proposed ? (
            <span className="shrink-0 text-[11px] font-medium text-amber-soft">proposed</span>
          ) : null}
        </div>
        {p.tier === "block" && p.matcher ? (
          <p className="mt-0.5 truncate font-mono text-[11px] text-chalk-400">/{p.matcher}/</p>
        ) : p.correction ? (
          <p className="mt-0.5 truncate text-[11.5px] text-chalk-300">Fix: {p.correction}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {onConfirm ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            className="text-emerald-400 hover:bg-emerald-500/10"
            iconLeft={<Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
            onClick={onConfirm}
          >
            Confirm
          </Button>
        ) : null}
        {onReject ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            className="text-chalk-400 hover:bg-rose-500/10 hover:text-rose-300"
            iconLeft={<X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
            onClick={onReject}
          >
            Reject
          </Button>
        ) : null}
        {onRemove ? (
          <button
            type="button"
            disabled={busy}
            onClick={onRemove}
            aria-label={`Remove ${p.id}`}
            className="rounded-[8px] p-1.5 text-chalk-400 transition hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  );
}

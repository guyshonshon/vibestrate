import { useState } from "react";
import { Plus, Check, X, Trash2, Wand2, Sparkles, ChevronDown, ChevronRight, FlaskConical } from "lucide-react";
import { api, ApiError } from "../../lib/api.js";
import type { ProjectPolicy, PolicyDraft } from "../../lib/types.js";
import { Button } from "../design/Button.js";
import { Select } from "../design/Select.js";
import { cn } from "../design/cn.js";
import { MatcherTestPanel } from "./MatcherTestPanel.js";

const INPUT =
  "w-full rounded-[12px] border border-[color:var(--line-strong)] bg-coal-800 px-3 py-2 text-[13px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none";

/**
 * Project policies (docs/design/policy-consolidation.md): the owner authors both
 * tiers here - an `advise` rule the reviewer checks, or a `block` rule with a
 * deterministic matcher that caps the merge.
 *
 * Powerful authoring, safe by construction:
 *  - "Draft with the supervisor" turns an English rule into a PREFILLED, editable
 *    add-form. The owner still clicks Save - the draft is only a suggestion.
 *  - "Suggested policies" proposes candidates from recent runs (on demand); Adopt
 *    prefills the same form. Never auto-saved.
 *  - A read-only Test panel (in the form and per matcher-bearing policy) dry-runs a
 *    matcher through the merge-gate engine so the owner sees what it would flag.
 * A model may SUGGEST a tier/matcher, but committing a block is always the owner's
 * explicit Save (addProjectPolicy) - the load-bearing owner-only-block invariant.
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
  const [matcherFlags, setMatcherFlags] = useState("");
  const [prefilled, setPrefilled] = useState(false);
  const [showTest, setShowTest] = useState(false);

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
      setError(e instanceof ApiError || e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  /** Prefill the add-form from a model draft. Editable; nothing is saved yet. */
  function adoptDraft(d: PolicyDraft) {
    setStatement(d.statement);
    setFix(d.suggestedTier === "advise" ? d.message || "" : "");
    setTier(d.suggestedTier);
    setMatcher(d.matcher?.regex ?? "");
    setMatcherFlags(d.matcher?.flags ?? "");
    setPrefilled(true);
    setShowTest(!!d.matcher);
    setAdding(true);
    setError(null);
  }

  function resetForm() {
    setStatement("");
    setFix("");
    setMatcher("");
    setMatcherFlags("");
    setTier("advise");
    setPrefilled(false);
    setShowTest(false);
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
      resetForm();
      setAdding(false);
    });
  }

  const pending = policies.filter((p) => !p.confirmedAt);
  const active = policies.filter((p) => p.confirmedAt);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
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
              resetForm();
              setAdding(true);
            }}
          >
            New policy
          </Button>
        ) : null}
      </div>

      {!adding ? (
        <DraftWithSupervisor
          onDraft={adoptDraft}
          onError={(m) => setError(m)}
        />
      ) : null}

      {adding ? (
        <div className="space-y-2.5 rounded-[16px] border border-[color:var(--line)] bg-coal-700 p-3.5">
          {prefilled ? (
            <div className="flex items-center gap-1.5 rounded-[10px] border border-violet-soft/25 bg-violet-soft/10 px-2.5 py-1.5 text-[11px] text-violet-soft">
              <Wand2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Supervisor draft - review and edit; nothing is saved until you click Add.
            </div>
          ) : null}
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
            <>
              <div className="flex items-center gap-2">
                <input
                  value={matcher}
                  onChange={(e) => setMatcher(e.target.value)}
                  placeholder="Matcher regex, e.g. — (required for block)"
                  className={cn(INPUT, "flex-1 font-mono")}
                />
                <input
                  value={matcherFlags}
                  onChange={(e) => setMatcherFlags(e.target.value)}
                  placeholder="flags"
                  aria-label="regex flags"
                  className={cn(INPUT, "w-[84px] font-mono")}
                />
              </div>
              <div className="flex items-center gap-1.5 rounded-[10px] border border-amber-soft/25 bg-amber-soft/10 px-2.5 py-1.5 text-[11px] text-amber-soft">
                Hard gate - a block deterministically caps the merge at fork-point when
                this matcher hits an added line. Owner-committed only.
              </div>
            </>
          )}

          <button
            type="button"
            onClick={() => setShowTest((v) => !v)}
            className="flex items-center gap-1.5 text-[11.5px] font-medium text-violet-soft hover:text-violet-vivid"
          >
            <FlaskConical className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {showTest ? "Hide test" : "Test this rule before saving"}
          </button>
          {showTest ? (
            <MatcherTestPanel regex={tier === "block" ? matcher : undefined} flags={matcherFlags} />
          ) : null}

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
                resetForm();
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

      {!adding ? <SuggestedPolicies onAdopt={adoptDraft} onError={(m) => setError(m)} /> : null}
    </div>
  );
}

/** English-rule -> editable draft. Prefills the add-form; never saves. */
function DraftWithSupervisor({
  onDraft,
  onError,
}: {
  onDraft: (d: PolicyDraft) => void;
  onError: (m: string) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function draft() {
    const d = text.trim();
    if (!d) return;
    setBusy(true);
    try {
      const res = await api.draftPolicy(d);
      onDraft(res.draft);
      setText("");
    } catch (err) {
      onError(err instanceof ApiError || err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[16px] border border-violet-soft/20 bg-violet-soft/[0.06] p-3.5">
      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-violet-soft">
        <Wand2 className="h-4 w-4" strokeWidth={2} aria-hidden />
        Draft with the supervisor
      </div>
      <p className="mt-1 text-[11.5px] leading-snug text-chalk-300">
        Describe a rule in plain English. The supervisor drafts an editable policy -
        you review, tweak, and save it. Nothing is committed automatically.
      </p>
      <div className="mt-2.5 flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) void draft();
          }}
          placeholder="e.g. never commit a raw AWS access key"
          className={cn(INPUT, "flex-1")}
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={busy || !text.trim()}
          iconLeft={<Wand2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
          onClick={() => void draft()}
        >
          {busy ? "Drafting…" : "Draft"}
        </Button>
      </div>
    </div>
  );
}

/** On-demand candidate policies from recent runs. Collapsed by default (hits the
 *  model). Adopt prefills the add-form; never auto-saved. */
function SuggestedPolicies({
  onAdopt,
  onError,
}: {
  onAdopt: (d: PolicyDraft) => void;
  onError: (m: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<PolicyDraft[] | null>(null);
  const [scanned, setScanned] = useState(0);

  async function load() {
    setBusy(true);
    try {
      const res = await api.suggestPolicies();
      setDrafts(res.drafts);
      setScanned(res.runsScanned);
    } catch (err) {
      onError(err instanceof ApiError || err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[16px] border border-[color:var(--line)] bg-coal-700">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-chalk-400" strokeWidth={2} aria-hidden />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-chalk-400" strokeWidth={2} aria-hidden />
        )}
        <Sparkles className="h-3.5 w-3.5 text-violet-soft" strokeWidth={2} aria-hidden />
        <span className="text-[12.5px] font-semibold text-chalk-100">Suggested policies</span>
        <span className="text-[11px] text-chalk-400">from recent runs</span>
      </button>
      {open ? (
        <div className="border-t border-[color:var(--line)] px-3.5 py-3">
          {drafts == null ? (
            <div className="flex flex-col items-start gap-2">
              <p className="text-[11.5px] text-chalk-300">
                Scan recent runs and let the supervisor propose reusable policies. Read-only;
                nothing is saved.
              </p>
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => void load()}>
                {busy ? "Scanning…" : "Suggest from recent runs"}
              </Button>
            </div>
          ) : drafts.length === 0 ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-[12px] text-chalk-300">
                No suggestions ({scanned} run{scanned === 1 ? "" : "s"} scanned).
              </p>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void load()}>
                {busy ? "Scanning…" : "Rescan"}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {drafts.map((d, i) => (
                <div
                  key={i}
                  className="rounded-[12px] border border-[color:var(--line)] bg-coal-600 px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <TierChip tier={d.suggestedTier} />
                        <span className="truncate text-[12.5px] font-medium text-chalk-100">
                          {d.statement}
                        </span>
                      </div>
                      {d.matcher ? (
                        <p className="mt-0.5 truncate font-mono text-[11px] text-chalk-400">
                          /{d.matcher.regex}/{d.matcher.flags}
                        </p>
                      ) : d.message ? (
                        <p className="mt-0.5 truncate text-[11.5px] text-chalk-300">{d.message}</p>
                      ) : null}
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => onAdopt(d)}>
                      Adopt
                    </Button>
                  </div>
                </div>
              ))}
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void load()}>
                {busy ? "Scanning…" : "Rescan"}
              </Button>
            </div>
          )}
        </div>
      ) : null}
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
  const [showTest, setShowTest] = useState(false);
  const hasMatcher = p.tier === "block" && !!p.matcher;
  return (
    <div className="rounded-[14px] border border-[color:var(--line)] bg-coal-600 px-3.5 py-2.5">
      <div className="flex items-center gap-3">
        <TierChip tier={p.tier} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-medium text-chalk-100">{p.statement}</span>
            {proposed ? (
              <span className="shrink-0 text-[11px] font-medium text-amber-soft">proposed</span>
            ) : null}
          </div>
          {hasMatcher ? (
            <p className="mt-0.5 truncate font-mono text-[11px] text-chalk-400">/{p.matcher}/</p>
          ) : p.correction ? (
            <p className="mt-0.5 truncate text-[11.5px] text-chalk-300">Fix: {p.correction}</p>
          ) : null}
          {p.tier === "block" ? (
            <p className="mt-1 text-[10.5px] text-amber-soft/90">
              Hard gate - deterministic, caps the merge at fork-point; owner-only.
            </p>
          ) : (
            <p className="mt-1 text-[10.5px] text-chalk-400">Reviewer-checked; advisory.</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {hasMatcher ? (
            <button
              type="button"
              onClick={() => setShowTest((v) => !v)}
              aria-label={`Test ${p.id}`}
              className={cn(
                "rounded-[8px] p-1.5 transition hover:bg-violet-soft/10",
                showTest ? "text-violet-soft" : "text-chalk-400 hover:text-violet-soft",
              )}
            >
              <FlaskConical className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden />
            </button>
          ) : null}
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
      {showTest && hasMatcher ? (
        <div className="mt-2.5">
          <MatcherTestPanel regex={p.matcher ?? undefined} appliesTo={["suggestion-apply", "bundle-apply"]} />
        </div>
      ) : null}
    </div>
  );
}

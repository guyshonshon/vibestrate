import { useState } from "react";
import { Plus, Check, X, Trash2, Wand2, FlaskConical } from "lucide-react";
import { api, ApiError } from "../../lib/api.js";
import type { ProjectPolicy, PolicyDraft } from "../../lib/types.js";
import { Button } from "../design/Button.js";
import { IconBtn } from "../design/IconBtn.js";
import { Chip } from "../design/Chip.js";
import { Select } from "../design/Select.js";
import { Section } from "../layout/PageShell.js";
import { cn } from "../design/cn.js";
import { GROUP_CARD } from "./AdvancedSafetySection.js";
import { MatcherTestPanel } from "./MatcherTestPanel.js";

const INPUT =
  "w-full rounded-[12px] border border-[color:var(--line-strong)] bg-coal-800 px-3 py-2 text-[13px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none";

/**
 * Project policies: the owner authors both tiers here - an `advise` rule the
 * reviewer checks, or a `block` rule with a deterministic matcher that caps the
 * merge.
 *
 * ONE authoring surface, opened by the page's single "New policy" action. The
 * page used to carry three simultaneous ways to create the same object (a
 * button, an always-open supervisor draft box, and a collapsible suggestion
 * scanner), which is what made an empty project open on twenty-three controls.
 * All three paths survive as affordances of this one form:
 *  - type a rule and Add it;
 *  - type it in English and Draft prefills tier + matcher from the supervisor;
 *  - Suggest from recent runs proposes candidates, and Adopt prefills the form.
 * A model may SUGGEST a tier/matcher, but committing a block is always the
 * owner's explicit Add (addProjectPolicy) - the load-bearing owner-only-block
 * invariant.
 */
export function ProjectPoliciesSection({
  policies,
  adding,
  onAdding,
  onChanged,
}: {
  policies: ProjectPolicy[];
  adding: boolean;
  onAdding: (v: boolean) => void;
  onChanged: () => void;
}) {
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

  /** Prefill the form from a model draft. Editable; nothing is saved yet. */
  function adoptDraft(d: PolicyDraft) {
    setStatement(d.statement);
    setFix(d.suggestedTier === "advise" ? d.message || "" : "");
    setTier(d.suggestedTier);
    setMatcher(d.matcher?.regex ?? "");
    setMatcherFlags(d.matcher?.flags ?? "");
    setPrefilled(true);
    setShowTest(!!d.matcher);
    onAdding(true);
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
      onAdding(false);
    });
  }

  const pending = policies.filter((p) => !p.confirmedAt);
  const active = policies.filter((p) => p.confirmedAt);

  return (
    <Section flush title="Your policies">
      {adding ? (
        <PolicyForm
          statement={statement}
          setStatement={setStatement}
          fix={fix}
          setFix={setFix}
          tier={tier}
          setTier={setTier}
          matcher={matcher}
          setMatcher={setMatcher}
          matcherFlags={matcherFlags}
          setMatcherFlags={setMatcherFlags}
          prefilled={prefilled}
          showTest={showTest}
          setShowTest={setShowTest}
          busy={busy}
          onAdd={() => void add()}
          onAdopt={adoptDraft}
          onError={setError}
          onCancel={() => {
            onAdding(false);
            resetForm();
            setError(null);
          }}
        />
      ) : null}

      {error ? (
        <div className="mb-2 rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-meta text-rose-300">
          {error}
        </div>
      ) : null}

      {policies.length === 0 ? (
        adding ? null : (
          <div className="flex items-center justify-between gap-3 rounded-[18px] border border-dashed border-[color:var(--line)] px-4 py-4">
            <span className="text-[13px] text-chalk-300">No policies yet.</span>
            <Button
              variant="primary"
              size="sm"
              iconLeft={<Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
              onClick={() => {
                setError(null);
                resetForm();
                onAdding(true);
              }}
            >
              New policy
            </Button>
          </div>
        )
      ) : (
        <div className={cn(GROUP_CARD, adding && "mt-3")}>
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
    </Section>
  );
}

/** The single authoring surface. Draft and Suggest both prefill it; nothing saves without Add. */
function PolicyForm({
  statement,
  setStatement,
  fix,
  setFix,
  tier,
  setTier,
  matcher,
  setMatcher,
  matcherFlags,
  setMatcherFlags,
  prefilled,
  showTest,
  setShowTest,
  busy,
  onAdd,
  onAdopt,
  onError,
  onCancel,
}: {
  statement: string;
  setStatement: (v: string) => void;
  fix: string;
  setFix: (v: string) => void;
  tier: "advise" | "block";
  setTier: (v: "advise" | "block") => void;
  matcher: string;
  setMatcher: (v: string) => void;
  matcherFlags: string;
  setMatcherFlags: (v: string) => void;
  prefilled: boolean;
  showTest: boolean;
  setShowTest: (v: boolean) => void;
  busy: boolean;
  onAdd: () => void;
  onAdopt: (d: PolicyDraft) => void;
  onError: (m: string) => void;
  onCancel: () => void;
}) {
  const [drafting, setDrafting] = useState(false);

  async function draft() {
    const d = statement.trim();
    if (!d) return;
    setDrafting(true);
    try {
      const res = await api.draftPolicy(d);
      onAdopt(res.draft);
    } catch (err) {
      onError(err instanceof ApiError || err instanceof Error ? err.message : String(err));
    } finally {
      setDrafting(false);
    }
  }

  return (
    <div className="space-y-3 rounded-[18px] border border-[color:var(--line)] bg-coal-700 p-4">
      {prefilled ? (
        <Chip tone="violet">
          <Wand2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          Supervisor draft
        </Chip>
      ) : null}

      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy && !drafting) onAdd();
          }}
          placeholder="Rule in plain English, e.g. use a hyphen, not an em-dash"
          className={cn(INPUT, "flex-1")}
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={drafting || !statement.trim()}
          iconLeft={<Wand2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
          onClick={() => void draft()}
        >
          {drafting ? "Drafting…" : "Draft"}
        </Button>
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
          // Pairs with the rule field's own example above it, so the two read
          // as one sentence: "use a hyphen, not an em-dash" / "replace it with
          // a hyphen". The schema calls this `correction` - what the reviewer
          // suggests when it flags the rule.
          placeholder="Suggested fix, e.g. replace it with a hyphen (optional)"
          className={INPUT}
        />
      ) : (
        <>
          {/* Widths live on the wrappers, not the inputs: the shared INPUT recipe
            * carries `w-full`, and cn() is clsx without twMerge, so a `w-[84px]`
            * bolted onto it fought `w-full` in the stylesheet and won - which
            * collapsed the matcher field to a 20px stub and stretched the flags
            * field across the row. */}
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <input
                value={matcher}
                onChange={(e) => setMatcher(e.target.value)}
                // The example matcher IS an em-dash, and this repo bans the
                // literal character in source - so it is escaped, not typed.
                placeholder={"Matcher regex, e.g. \u2014 (required for block)"}
                className={cn(INPUT, "font-mono")}
              />
            </div>
            <div className="w-[96px] shrink-0">
              <input
                value={matcherFlags}
                onChange={(e) => setMatcherFlags(e.target.value)}
                placeholder="flags"
                aria-label="regex flags"
                className={cn(INPUT, "font-mono")}
              />
            </div>
          </div>
          <p className="text-meta leading-[1.55] text-amber-soft">
            Caps the merge when this matcher hits an added line.
          </p>
        </>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" disabled={busy || !statement.trim()} onClick={onAdd}>
          Add policy
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="ghost"
          size="sm"
          iconLeft={<FlaskConical className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
          onClick={() => setShowTest(!showTest)}
        >
          {showTest ? "Hide test" : "Test"}
        </Button>
      </div>

      {showTest ? (
        <MatcherTestPanel regex={tier === "block" ? matcher : undefined} flags={matcherFlags} />
      ) : null}

      <SuggestedPolicies onAdopt={onAdopt} onError={onError} />
    </div>
  );
}

/**
 * On-demand candidates from recent runs. Demoted into the authoring form: it
 * hits the model, so it stays a deliberate click, and it is only reachable
 * while the owner is actually writing a policy. Adopt prefills the form above;
 * never auto-saved.
 */
function SuggestedPolicies({
  onAdopt,
  onError,
}: {
  onAdopt: (d: PolicyDraft) => void;
  onError: (m: string) => void;
}) {
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
    <div className="border-t border-[color:var(--line-soft)] pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void load()}>
          {busy ? "Scanning…" : drafts ? "Rescan recent runs" : "Suggest from recent runs"}
        </Button>
        {drafts && drafts.length === 0 ? (
          <span className="text-meta text-chalk-400">
            No suggestions in {scanned} run{scanned === 1 ? "" : "s"}.
          </span>
        ) : null}
      </div>

      {drafts && drafts.length > 0 ? (
        <div className="mt-2 space-y-1.5">
          {drafts.map((d, i) => (
            <div
              key={i}
              className="flex items-start justify-between gap-3 rounded-[12px] border border-[color:var(--line)] bg-coal-600 px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <TierChip tier={d.suggestedTier} />
                  <span className="min-w-0 truncate text-[13px] font-medium text-chalk-100">
                    {d.statement}
                  </span>
                </div>
                {d.matcher ? (
                  <p className="mt-1 truncate font-mono text-meta text-chalk-400">
                    /{d.matcher.regex}/{d.matcher.flags}
                  </p>
                ) : d.message ? (
                  <p className="mt-1 truncate text-meta text-chalk-300">{d.message}</p>
                ) : null}
              </div>
              <Button variant="secondary" size="sm" onClick={() => onAdopt(d)}>
                Adopt
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Flat tinted mono label - the tier is a rank, and a rank does not need a pill. */
function TierChip({ tier }: { tier: "advise" | "block" }) {
  return (
    <Chip tone={tier === "block" ? "amber" : "violet"} className="shrink-0">
      {tier}
    </Chip>
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
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* The tier label aligns to the statement's own line, not to the middle
           * of the whole row: centred against a multi-line stack it floated away
           * from the sentence it labels. */}
          <div className="flex items-center gap-2">
            <TierChip tier={p.tier} />
            <span className="min-w-0 truncate text-[13px] font-medium text-chalk-100">
              {p.statement}
            </span>
            {proposed ? (
              <Chip tone="amber" className="shrink-0">
                proposed
              </Chip>
            ) : null}
          </div>
          {hasMatcher ? (
            <p className="mt-1 truncate font-mono text-meta text-chalk-400">/{p.matcher}/</p>
          ) : p.correction ? (
            <p className="mt-1 truncate text-meta text-chalk-300">Fix: {p.correction}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {hasMatcher ? (
            <IconBtn title={`Test ${p.id}`} onClick={() => setShowTest(!showTest)}>
              <FlaskConical className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden />
            </IconBtn>
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
            <IconBtn danger disabled={busy} title={`Remove ${p.id}`} onClick={onRemove}>
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden />
            </IconBtn>
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

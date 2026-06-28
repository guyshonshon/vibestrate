import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import type { ProjectPolicy } from "../../lib/types.js";
import { Select } from "../design/Select.js";

/**
 * Project policies authoring (docs/design/policy-consolidation.md): the owner
 * creates BOTH tiers here - an `advise` rule the reviewer checks, or a `block` rule
 * with a deterministic matcher that caps the merge. This is the project-level rule
 * surface (not the Supervisors cards); it closes the M2 UI parity gap (a block's
 * matcher had no UI before). Pending (supervisor-proposed) rules show Confirm/Reject;
 * active rules show Remove. Optional by design - a plain run needs none.
 */
export function ProjectPoliciesSection() {
  const [policies, setPolicies] = useState<ProjectPolicy[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [statement, setStatement] = useState("");
  const [fix, setFix] = useState("");
  const [tier, setTier] = useState<"advise" | "block">("advise");
  const [matcher, setMatcher] = useState("");

  async function load() {
    try {
      const r = await api.listProjectPolicies();
      setPolicies(r.policies);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => {
    void load();
  }, []);

  function slugId(text: string): string {
    const base = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 50);
    return base || `policy-${Date.now()}`;
  }

  async function mutate(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
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
    });
  }

  const pending = policies.filter((p) => !p.confirmedAt);
  const active = policies.filter((p) => p.confirmedAt);

  return (
    <section className="border border-vibestrate-border bg-vibestrate-panel-2 p-2">
      <h3 className="text-[11px] uppercase tracking-[0.1em] text-vibestrate-fg-dim">
        Project policies
      </h3>
      <p className="mt-0.5 text-[10.5px] text-vibestrate-fg-dim">
        Owner-authored, project-scoped rules enforced under any supervisor.{" "}
        <span className="text-vibestrate-fg">advise</span> = the reviewer checks it;{" "}
        <span className="text-vibestrate-warn">block</span> = a deterministic matcher
        caps the merge.
      </p>

      {error ? (
        <div className="mt-1.5 border border-vibestrate-fail/40 bg-vibestrate-fail/10 px-2 py-1 text-[10.5px] text-vibestrate-fail">
          {error}
        </div>
      ) : null}

      {policies.length === 0 ? (
        <p className="mt-2 text-[10.5px] text-vibestrate-fg-dim">
          None yet. Optional - a plain run needs none.
        </p>
      ) : (
        <div className="mt-2 space-y-1.5">
          {pending.map((p) => (
            <div key={p.id} className="flex items-start gap-2 text-[11px]">
              <span className="mt-0.5 shrink-0 text-vibestrate-warn">proposed</span>
              <span className="flex-1 text-vibestrate-fg">
                {p.statement}
                {p.correction ? <span className="text-vibestrate-fg-dim"> &rarr; {p.correction}</span> : null}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void mutate(() => api.confirmProjectPolicy(p.id))}
                className="shrink-0 border border-vibestrate-success/40 px-1.5 text-[10.5px] text-vibestrate-success disabled:opacity-40"
              >
                Confirm
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void mutate(() => api.rejectProjectPolicy(p.id))}
                className="shrink-0 text-vibestrate-fg-dim hover:text-vibestrate-fail disabled:opacity-40"
              >
                Reject
              </button>
            </div>
          ))}
          {active.map((p) => (
            <div key={p.id} className="flex items-start gap-2 text-[11px]">
              <span className={`mt-0.5 shrink-0 ${p.tier === "block" ? "text-vibestrate-warn" : "text-vibestrate-fg-dim"}`}>
                {p.tier}
              </span>
              <span className="flex-1 text-vibestrate-fg">
                {p.statement}
                {p.tier === "block" && p.matcher ? (
                  <span className="vibestrate-mono text-vibestrate-fg-dim"> /{p.matcher}/</span>
                ) : p.correction ? (
                  <span className="text-vibestrate-fg-dim"> &rarr; {p.correction}</span>
                ) : null}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void mutate(() => api.removeProjectPolicy(p.id))}
                className="shrink-0 text-vibestrate-fg-dim hover:text-vibestrate-fail disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2.5 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            placeholder="Rule, e.g. use a hyphen, not an em-dash"
            className="min-w-[200px] flex-1 border border-vibestrate-border bg-vibestrate-panel px-2 py-1 text-[11px] text-vibestrate-fg"
          />
          <Select
            value={tier}
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
            className="w-full border border-vibestrate-border bg-vibestrate-panel px-2 py-1 text-[11px] text-vibestrate-fg"
          />
        ) : (
          <input
            value={matcher}
            onChange={(e) => setMatcher(e.target.value)}
            placeholder="Matcher regex, e.g. SectionEyebrow (required for block)"
            className="vibestrate-mono w-full border border-vibestrate-border bg-vibestrate-panel px-2 py-1 text-[11px] text-vibestrate-fg"
          />
        )}
        <button
          type="button"
          onClick={() => void add()}
          disabled={busy || !statement.trim()}
          className="border border-vibestrate-border bg-vibestrate-panel px-2 py-1 text-[11px] text-vibestrate-fg disabled:opacity-40"
        >
          Add policy
        </button>
      </div>
    </section>
  );
}

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { ErrorView } from "../../lib/error-view.js";
import type {
  PolicyStoreSnapshot,
  SafetyPoliciesConfig,
  ProjectPolicy,
} from "../../lib/types.js";
import { AdvancedSafetySection } from "./AdvancedSafetySection.js";
import { ProjectPoliciesSection } from "./ProjectPoliciesSection.js";
import { EngineToolsPanel } from "./EngineToolsPanel.js";
import { PageShell } from "../layout/PageShell.js";
import { Deck, Cell } from "../layout/Deck.js";
import { PageHero } from "../layout/PageHero.js";

/**
 * The project's rule surface, laid out on the Deck.
 *
 * This page used to hide two thirds of itself behind tabs, which existed only
 * because a single full-width column had nowhere else to put anything: the
 * safety toggles in particular rendered a label and a switch at opposite ends
 * of a 1610px row. On the grid all three regions are visible at once, so the
 * tabs are gone rather than restyled.
 */
export function PoliciesPanel() {
  const [policies, setPolicies] = useState<ProjectPolicy[] | null>(null);
  const [snap, setSnap] = useState<PolicyStoreSnapshot | null>(null);
  const [safety, setSafety] = useState<SafetyPoliciesConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The one path both the initial mount and manual retry share, so a retry
  // after a failed load re-runs exactly what mount would have done.
  const loadPolicies = useCallback(async () => {
    try {
      const r = await api.listProjectPolicies();
      setPolicies(r.policies);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadPolicies();
    // Safe to degrade silently: the safety-gate config and the read-only engine
    // snapshot are secondary enrichments whose sections hold their loading
    // state rather than claiming a policy is off, and the primary policies list
    // above reports its own failures.
    api
      .getPolicies()
      .then((s) => {
        if (!cancelled) setSnap(s);
      })
      .catch(() => undefined);
    // Safe to degrade silently: see above - the safety section stays unrendered
    // rather than showing every gate as disabled.
    api
      .getSafetyConfig()
      .then((sf) => {
        if (!cancelled) setSafety(sf);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [loadPolicies]);

  async function toggleSafety(
    key: keyof Omit<SafetyPoliciesConfig, "requireApprovalAtStages">,
    value: boolean,
  ) {
    if (!safety) return;
    const prev = safety;
    setSafety({ ...safety, [key]: value }); // optimistic
    try {
      setSafety(await api.updateSafetyConfig({ [key]: value }));
      setError(null);
    } catch (err) {
      setSafety(prev);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const list = policies ?? [];
  const advise = list.filter((p) => p.confirmedAt && p.tier === "advise").length;
  const block = list.filter((p) => p.confirmedAt && p.tier === "block").length;
  const pending = list.filter((p) => !p.confirmedAt).length;
  const guards = safety
    ? [safety.forbidMainBranchWrites, safety.forbidSecretsAccess, safety.forbidAutoPush, safety.forbidAutoMerge].filter(Boolean).length
    : 0;

  const engineCount = snap ? snap.rules.length + snap.actions.length : 0;

  return (
    <PageShell className="fade-up">
      <Deck>
        <Cell size="full" reason="masthead">
          <PageHero
            state={{
              value: safety ? `${guards}/4` : "-",
              caption: guards === 4 ? "Guards on" : "Guards off",
              note:
                guards === 4
                  ? "Every fail-closed gate is active. No policy can weaken one."
                  : "A fail-closed gate is off. Policies cannot make up the difference.",
              tone: guards === 4 ? "emerald" : "amber",
            }}
            title="Policies"
            purpose="Owner-authored rules the reviewer and the merge gate enforce on every run. A plain run needs none of this."
            metrics={[
              { value: advise, label: "advise" },
              { value: block, label: "block", tone: block > 0 ? "warn" : "default" },
              { value: pending, label: "pending", tone: pending > 0 ? "warn" : "default" },
              { value: engineCount, label: "engine rules" },
              { value: safety ? `${guards}/4` : "-", label: "guards", tone: guards === 4 ? "good" : "warn" },
            ]}
            footer={
              list.length === 0
                ? "No policies yet. The reviewer still runs every fail-closed guard on every diff."
                : `${list.length} policy${list.length === 1 ? "" : "s"} enforced on every run.`
            }
          />
        </Cell>

        {error ? (
          <Cell size="full" reason="masthead">
            <ErrorView compact err={error} onRetry={() => void loadPolicies()} />
          </Cell>
        ) : null}

        {error ? null : (
          <>
            <Cell size="wide">
              {policies == null ? (
                <Loading />
              ) : (
                <ProjectPoliciesSection policies={policies} onChanged={() => void loadPolicies()} />
              )}
            </Cell>

            <Cell size="card">
              {safety == null ? (
                <Loading />
              ) : (
                <AdvancedSafetySection safety={safety} onToggle={(k, v) => void toggleSafety(k, v)} />
              )}
            </Cell>

            <Cell size="wide">
              {snap == null ? <Loading /> : <EngineToolsPanel snap={snap} />}
            </Cell>
          </>
        )}
      </Deck>
    </PageShell>
  );
}

function Loading() {
  return <div className="px-1 py-6 text-[12.5px] text-chalk-400">Loading…</div>;
}

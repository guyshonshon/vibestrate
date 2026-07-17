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
import { StatTile } from "../design/StatTile.js";
import { cn } from "../design/cn.js";

type TabId = "policies" | "safety" | "engine";

/**
 * The project's rule surface as a focused, tabbed page (design: primitives-contract
 * + docs/design/policy-consolidation.md). A contained header with at-a-glance stat
 * tiles, then three tabs so the surface is scannable instead of one long dump:
 *   - Policies: owner-authored tiered rules (advise + block) - the daily surface.
 *   - Safety gates: the fail-closed `policies.*` / `posture.*` toggles.
 *   - Engine & tools: the read-only .yml engine + the check-patch tool.
 */
export function PoliciesPanel() {
  const [policies, setPolicies] = useState<ProjectPolicy[] | null>(null);
  const [snap, setSnap] = useState<PolicyStoreSnapshot | null>(null);
  const [safety, setSafety] = useState<SafetyPoliciesConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("policies");

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
    // The safety-gate config and the read-only engine snapshot are secondary
    // enrichments the Policies tab can still render without (their sections
    // just show a loading state) - a failed fetch degrades quietly instead of
    // blocking the primary policies list above.
    api
      .getPolicies()
      .then((s) => {
        if (!cancelled) setSnap(s);
      })
      .catch(() => undefined);
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

  const TABS: { id: TabId; label: string; count?: number }[] = [
    { id: "policies", label: "Policies", count: list.length || undefined },
    { id: "safety", label: "Safety gates" },
    { id: "engine", label: "Engine & tools", count: snap ? snap.rules.length + snap.actions.length || undefined : undefined },
  ];

  return (
    <div className="font-jakarta px-10 py-7 fade-up">
      <div className="rounded-[20px] border border-[color:var(--line)] bg-coal-600 p-5">
        <h1 className="text-[24px] font-extrabold tracking-[-0.02em] text-chalk-100">Policies</h1>
        <p className="mt-1 max-w-[72ch] text-[12.5px] leading-snug text-chalk-300">
          The project's rule surface. Owner-authored policies are enforced under any
          supervisor; the fail-closed security gates are never weakened by them. A
          plain run needs none of this.
        </p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          <StatTile value={advise} label="advise" />
          <StatTile value={block} label="block" tone={block > 0 ? "amber" : "default"} />
          <StatTile value={pending} label="pending" tone={pending > 0 ? "amber" : "default"} />
          <StatTile value={safety ? `${guards}/4` : "-"} label="guards" tone={guards === 4 ? "emerald" : "amber"} />
        </div>
      </div>

      {error ? (
        <ErrorView className="mt-4" compact err={error} onRetry={() => void loadPolicies()} />
      ) : null}

      <div className="mt-5 inline-flex items-center gap-1 rounded-[12px] border border-[color:var(--line)] bg-coal-700 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-[9px] px-3 py-1.5 text-[12.5px] font-semibold transition",
              tab === t.id ? "bg-coal-500 text-chalk-100" : "text-chalk-400 hover:text-chalk-100",
            )}
          >
            {t.label}
            {t.count != null ? <span className="ml-1.5 num-tabular text-chalk-400">{t.count}</span> : null}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "policies" ? (
          policies == null ? (
            <Loading />
          ) : (
            <ProjectPoliciesSection policies={policies} onChanged={() => void loadPolicies()} />
          )
        ) : tab === "safety" ? (
          safety == null ? (
            <Loading />
          ) : (
            <AdvancedSafetySection safety={safety} onToggle={(k, v) => void toggleSafety(k, v)} />
          )
        ) : snap == null ? (
          <Loading />
        ) : (
          <EngineToolsPanel snap={snap} />
        )}
      </div>
    </div>
  );
}

function Loading() {
  return <div className="px-1 py-6 text-[12.5px] text-chalk-400">Loading…</div>;
}

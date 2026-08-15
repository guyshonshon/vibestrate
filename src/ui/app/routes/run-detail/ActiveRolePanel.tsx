import type {
  VibestrateEvent,
  ApprovalRequest,
  EngagementEntry,
  PerItemVerdict,
  RunAssurance,
  RunAudit,
  RunState,
  RuntimeMetrics,
  SpecUpQuestion,
  WorkflowSelectionView,
} from "../../../lib/types.js";
import { AlertTriangle, Bolt, Cpu, FolderTree, Scale, ShieldCheck } from "lucide-react";
import { RunStatusBadge } from "../../../components/runs/RunStatusBadge.js";
import { StatTile } from "../../../components/design/StatTile.js";

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}


/** Per-gate status color: a passed gate is emerald, a failed/blocked one rose,
 *  a missing/not-run one stays muted, an environment skip is amber. */

export function ActiveRolePanel({
  run,
  metrics,
}: {
  run: RunState;
  metrics: RuntimeMetrics | null;
}) {
  const agents = metrics?.roles ?? [];
  const agent =
    agents.find((a) => !a.endedAt) ?? agents.slice(-1)[0] ?? null;
  // Live totals accumulate as each step finishes - unlike the running agent's
  // own metrics, which only resolve when it exits (CLIs in -p mode buffer).
  const totalTokens = agents.reduce(
    (n, a) => n + (a.tokenUsage?.input ?? 0) + (a.tokenUsage?.output ?? 0),
    0,
  );
  const totalToolCalls = agents.reduce((n, a) => n + (a.toolCallCount ?? 0), 0);
  const anyCost = agents.some((a) => a.totalCostUsd !== null);
  const totalCost =
    metrics?.totalCostUsd ??
    (anyCost ? agents.reduce((n, a) => n + (a.totalCostUsd ?? 0), 0) : null);
  const costEstimated = agents.some((a) => a.costEstimated);
  const tokensEstimated = agents.some((a) => a.tokensEstimated);
  const stepsDone = agents.filter((a) => a.endedAt).length;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[18px] font-bold text-violet-vivid">Live metrics</h2>
        <span className="text-[12px] font-medium text-chalk-300 whitespace-nowrap">
          {stepsDone} step{stepsDone === 1 ? "" : "s"} done
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-violet-soft/15 text-violet-soft ring-1 ring-violet-soft/30">
          <Cpu className="h-4 w-4" strokeWidth={1.9} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-medium text-chalk-100">
            {agent?.providerId ??
              run.profileOverride ?? run.crewId ??
              "auto"}
          </div>
          <div className="truncate text-meta text-chalk-300">
            {agent?.flowSeat ?? agent?.stageId ?? "-"}
          </div>
        </div>
        <RunStatusBadge status={run.status} compact />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[color:var(--line-soft)] pt-3">
        <StatTile
          label={tokensEstimated ? "Tokens (est)" : "Tokens"}
          value={
            totalTokens > 0
              ? `${tokensEstimated ? "~" : ""}${fmtTokens(totalTokens)}`
              : "-"
          }
        />
        <StatTile
          label={costEstimated ? "Cost (est)" : "Cost"}
          value={
            totalCost !== null
              ? `${costEstimated ? "~" : ""}$${totalCost.toFixed(4)}`
              : "-"
          }
        />
        <StatTile
          label="Tool calls"
          value={totalToolCalls > 0 ? String(totalToolCalls) : "-"}
        />
        <StatTile
          label="Provider calls"
          value={String(metrics?.totalProviderCalls ?? 0)}
        />
      </div>
    </div>
  );
}

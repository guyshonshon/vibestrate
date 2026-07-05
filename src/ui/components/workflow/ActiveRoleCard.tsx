import type { RoleMetrics, RunStatus } from "../../lib/types.js";
import { StatTile } from "../design/StatTile.js";

const STAGE_TO_ROLE: Partial<Record<RunStatus, string>> = {
  planning: "planner",
  architecting: "architect",
  executing: "executor",
  reviewing: "reviewer",
  fixing: "fixer",
  verifying: "verifier",
};

export function ActiveRoleCard({
  status,
  roles,
}: {
  status: RunStatus;
  roles: RoleMetrics[];
}) {
  const expectedRole = STAGE_TO_ROLE[status];
  const lastForRole = expectedRole
    ? roles.filter((a) => a.roleId === expectedRole).slice(-1)[0]
    : roles.slice(-1)[0];
  const inFlight =
    expectedRole !== undefined &&
    (status === "planning" ||
      status === "architecting" ||
      status === "executing" ||
      status === "reviewing" ||
      status === "fixing" ||
      status === "verifying");

  return (
    <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4">
      <div className="flex items-center justify-between">
        <div className="text-[12.5px] font-semibold text-chalk-300">
          {inFlight ? "Active agent" : "Last agent"}
        </div>
        {inFlight ? (
          <span className="text-[11.5px] font-semibold text-violet-soft">
            running
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-3">
        <span className="text-[15px] font-semibold text-chalk-100">
          {expectedRole ?? lastForRole?.roleId ?? "-"}
        </span>
        {lastForRole ? (
          <span className="font-mono text-[12px] text-chalk-300">
            {lastForRole.providerType}:{lastForRole.providerId}
          </span>
        ) : (
          <span className="text-[12px] text-chalk-400">
            No agent metrics yet.
          </span>
        )}
      </div>
      {lastForRole ? (
        <div className="mt-3 flex flex-wrap items-stretch gap-1">
          <StatTile value={`${lastForRole.durationMs}ms`} label="duration" />
          <StatTile
            value={lastForRole.exitCode}
            label="exit"
            tone={lastForRole.exitCode === 0 ? "emerald" : "rose"}
          />
        </div>
      ) : null}
      {lastForRole && lastForRole.skillsAttached.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
          {lastForRole.skillsAttached.map((s) => (
            <span
              key={s}
              className="rounded-[8px] border border-[color:var(--line)] bg-coal-500/60 px-1.5 py-0.5 font-mono text-chalk-300"
            >
              skill: {s}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

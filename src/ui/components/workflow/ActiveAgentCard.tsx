import type { AgentMetrics, RunStatus } from "../../lib/types.js";

const STAGE_TO_AGENT: Partial<Record<RunStatus, string>> = {
  planning: "planner",
  architecting: "architect",
  executing: "executor",
  reviewing: "reviewer",
  fixing: "fixer",
  verifying: "verifier",
};

export function ActiveAgentCard({
  status,
  agents,
}: {
  status: RunStatus;
  agents: AgentMetrics[];
}) {
  const expectedAgent = STAGE_TO_AGENT[status];
  const lastForAgent = expectedAgent
    ? agents.filter((a) => a.agentId === expectedAgent).slice(-1)[0]
    : agents.slice(-1)[0];
  const inFlight =
    expectedAgent !== undefined &&
    (status === "planning" ||
      status === "architecting" ||
      status === "executing" ||
      status === "reviewing" ||
      status === "fixing" ||
      status === "verifying");

  return (
    <div className="rounded border border-amaco-border bg-amaco-panel p-3">
      <div className="flex items-center justify-between">
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
          {inFlight ? "active agent" : "last agent"}
        </div>
        {inFlight ? (
          <span className="amaco-mono text-[10.5px] text-amaco-accent">
            running
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-3">
        <span className="text-[15px] font-medium text-amaco-fg">
          {expectedAgent ?? lastForAgent?.agentId ?? "—"}
        </span>
        {lastForAgent ? (
          <>
            <span className="amaco-mono text-[12px] text-amaco-fg-dim">
              {lastForAgent.providerType}:{lastForAgent.providerId}
            </span>
            <span className="amaco-mono text-[12px] text-amaco-fg-muted">
              {lastForAgent.durationMs}ms · exit {lastForAgent.exitCode}
            </span>
          </>
        ) : (
          <span className="text-[12px] text-amaco-fg-muted">
            (no agent metrics yet)
          </span>
        )}
      </div>
      {lastForAgent && lastForAgent.skillsAttached.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
          {lastForAgent.skillsAttached.map((s) => (
            <span
              key={s}
              className="amaco-mono rounded border border-amaco-border bg-amaco-panel-2 px-1.5 py-0.5 text-amaco-fg-dim"
            >
              skill: {s}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

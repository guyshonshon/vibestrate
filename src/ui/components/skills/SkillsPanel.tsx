import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import type {
  DiscoveredSkill,
  SkillAssignmentSummary,
} from "../../lib/types.js";

const DEFAULT_AGENTS = [
  "planner",
  "architect",
  "executor",
  "fixer",
  "reviewer",
  "verifier",
] as const;

export function SkillsPanel() {
  const [skills, setSkills] = useState<DiscoveredSkill[]>([]);
  const [assignments, setAssignments] = useState<SkillAssignmentSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openSkillId, setOpenSkillId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      const r = await api.listSkills();
      setSkills(r.skills);
      setAssignments(r.assignments);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function isAssigned(skillName: string, agentId: string): boolean {
    return (
      assignments.find((a) => a.agentId === agentId)?.skills.includes(skillName) ??
      false
    );
  }

  async function toggle(skill: DiscoveredSkill, agentId: string) {
    const key = `${skill.id}:${agentId}`;
    setBusy(key);
    setError(null);
    try {
      if (isAssigned(skill.name, agentId)) {
        const r = await api.unassignSkill({
          skillId: skill.id,
          agentId,
        });
        setAssignments(r.assignments);
      } else {
        const r = await api.assignSkill({
          skillId: skill.id,
          agentId,
        });
        setAssignments(r.assignments);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  if (error)
    return (
      <div className="space-y-2">
        <div className="text-[12px] text-amaco-fail">{error}</div>
        <button
          onClick={() => void load()}
          className="rounded border border-amaco-border bg-amaco-panel-2 px-2 py-1 text-[11.5px] text-amaco-fg-dim"
        >
          Retry
        </button>
      </div>
    );

  if (skills.length === 0) {
    return (
      <div className="space-y-2 text-[12.5px] text-amaco-fg-dim">
        <div className="text-amaco-fg">No skills discovered.</div>
        <div className="text-[11.5px] text-amaco-fg-muted">
          Drop a folder with{" "}
          <code className="amaco-mono">SKILL.md</code> into{" "}
          <code className="amaco-mono">.amaco/skills/</code> or{" "}
          <code className="amaco-mono">.claude/skills/</code>.
        </div>
        <div className="text-[11.5px] text-amaco-fg-muted">
          Skills are reusable instructions Amaco loads at run time. They do
          not train the model.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[11.5px] text-amaco-fg-muted">
        Skills are reusable instructions Amaco can attach to agents. They do
        not train the model — Amaco loads them as run-time guidance and
        records which agents had which skills attached.
      </p>
      <ol className="space-y-2">
        {skills.map((s) => {
          const assignedAgents = assignments
            .filter((a) => a.skills.includes(s.name))
            .map((a) => a.agentId);
          return (
            <li
              key={s.id}
              className="rounded border border-amaco-border bg-amaco-panel-2 p-2"
            >
              <button
                onClick={() => setOpenSkillId(openSkillId === s.id ? null : s.id)}
                className="block w-full text-left"
              >
                <div className="flex items-center gap-2 text-[12.5px]">
                  <span className="amaco-mono rounded border border-amaco-border bg-amaco-panel px-1 text-[10.5px] text-amaco-fg-muted">
                    {s.source}
                  </span>
                  <span className="font-medium text-amaco-fg">{s.name}</span>
                </div>
                {s.description ? (
                  <div className="mt-1 text-[11.5px] text-amaco-fg-dim">
                    {s.description}
                  </div>
                ) : null}
                <div className="mt-1 flex flex-wrap gap-1.5 text-[10.5px] text-amaco-fg-muted">
                  <span className="amaco-mono truncate">{s.filePath}</span>
                  {assignedAgents.length > 0 ? (
                    <span>· assigned to {assignedAgents.join(", ")}</span>
                  ) : (
                    <span>· not assigned to any agent</span>
                  )}
                  {Object.keys(s.mcpServers).length > 0 ? (
                    <span
                      className="rounded border border-amaco-border bg-amaco-panel px-1 text-amaco-fg-dim"
                      title={`MCP servers: ${Object.keys(s.mcpServers).join(", ")}`}
                    >
                      {Object.keys(s.mcpServers).length} MCP
                    </span>
                  ) : null}
                  {s.mcpError ? (
                    <span
                      className="rounded border border-amaco-warn/40 bg-amaco-warn/10 px-1 text-amaco-warn"
                      title={s.mcpError}
                    >
                      .mcp.json error
                    </span>
                  ) : null}
                </div>
              </button>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {DEFAULT_AGENTS.map((agentId) => {
                  const on = isAssigned(s.name, agentId);
                  const key = `${s.id}:${agentId}`;
                  return (
                    <button
                      key={agentId}
                      onClick={() => toggle(s, agentId)}
                      disabled={busy !== null}
                      className={`amaco-mono rounded border px-1.5 py-0.5 text-[11px] transition-colors ${
                        on
                          ? "border-amaco-accent text-amaco-accent"
                          : "border-amaco-border text-amaco-fg-dim hover:text-amaco-fg"
                      } ${busy === key ? "opacity-60" : ""}`}
                    >
                      {on ? "✓ " : ""}
                      {agentId}
                    </button>
                  );
                })}
              </div>

              {openSkillId === s.id ? (
                <pre className="amaco-mono mt-2 max-h-48 overflow-y-auto rounded border border-amaco-border bg-amaco-canvas p-2 text-[11.5px] text-amaco-fg-dim">
                  {s.bodyPreview}
                  {s.bodyPreview.length >= 240 ? "\n…" : ""}
                </pre>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

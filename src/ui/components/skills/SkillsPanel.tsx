import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import type {
  DiscoveredSkill,
  SkillAssignmentSummary,
} from "../../lib/types.js";

export function SkillsPanel() {
  const [skills, setSkills] = useState<DiscoveredSkill[]>([]);
  const [assignments, setAssignments] = useState<SkillAssignmentSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openSkillId, setOpenSkillId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await api.listSkills();
        if (!cancelled) {
          setSkills(r.skills);
          setAssignments(r.assignments);
          setError(null);
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
  }, []);

  if (error) return <div className="text-[12px] text-amaco-fail">{error}</div>;

  if (skills.length === 0) {
    return (
      <div className="text-[12px] text-amaco-fg-muted">
        No skills discovered. Drop SKILL.md folders under{" "}
        <code className="amaco-mono">.amaco/skills/</code> or{" "}
        <code className="amaco-mono">.claude/skills/</code>.
      </div>
    );
  }

  function agentsFor(name: string): string[] {
    return assignments
      .filter((a) => a.skills.includes(name))
      .map((a) => a.agentId);
  }

  return (
    <ol className="space-y-2">
      {skills.map((s) => (
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
              <span className="amaco-mono">{s.filePath}</span>
              {agentsFor(s.name).length > 0 ? (
                <span>· assigned to {agentsFor(s.name).join(", ")}</span>
              ) : null}
            </div>
          </button>
          {openSkillId === s.id ? (
            <pre className="amaco-mono mt-2 max-h-48 overflow-y-auto rounded border border-amaco-border bg-amaco-canvas p-2 text-[11.5px] text-amaco-fg-dim">
              {s.bodyPreview}
              {s.bodyPreview.length >= 240 ? "\n…" : ""}
            </pre>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

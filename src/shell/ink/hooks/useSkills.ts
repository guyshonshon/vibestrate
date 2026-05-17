import { useEffect, useRef, useState, useCallback } from "react";
import {
  discoverSkills,
  type DiscoveredSkill,
} from "../../../skills/skill-discovery.js";
import {
  listAgentSkillAssignments,
  type SkillAssignmentSummary,
} from "../../../skills/skill-assignment-service.js";

export function useSkills(projectRoot: string, refreshMs = 3000) {
  const [skills, setSkills] = useState<DiscoveredSkill[]>([]);
  const [assignments, setAssignments] = useState<SkillAssignmentSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([
        discoverSkills(projectRoot),
        listAgentSkillAssignments(projectRoot).catch(() => []),
      ]);
      if (!mounted.current) return;
      setSkills(s);
      setAssignments(a);
      setError(null);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [projectRoot]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const id = setInterval(() => void refresh(), refreshMs);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [refresh, refreshMs]);

  return { skills, assignments, error, refresh };
}

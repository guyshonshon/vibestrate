import { useEffect, useRef, useState, useCallback } from "react";
import { getWorktreeContext } from "../../../git/git.js";

export type GitContext = { branch: string | null; isLinkedWorktree: boolean };

/**
 * Reads the current git branch + whether we're in a linked worktree, for the
 * status bar. Polls slowly (branch changes are rare) and never throws -
 * non-git dirs just yield nulls.
 */
export function useGitContext(cwd: string, refreshMs = 5000) {
  const [git, setGit] = useState<GitContext | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    const ctx = await getWorktreeContext(cwd);
    if (!mounted.current) return;
    setGit(ctx);
  }, [cwd]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const id = setInterval(() => void refresh(), refreshMs);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [refresh, refreshMs]);

  return { git, refresh };
}

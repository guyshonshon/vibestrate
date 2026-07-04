/**
 * Pure client-side graph math over the bounded commit topology the server
 * ships (`GitGraph.commits`, edges implicit in `parents`). Everything here is
 * derived - no extra git calls: reachability, the "where did this land on
 * main" lookup that powers selection highlighting, and the ancestor test the
 * merge planner uses to call a pair already-merged before predicting.
 */
import type { GitGraphCommit } from "../../lib/types.js";

export type GraphIndex = {
  byHash: Map<string, GitGraphCommit>;
  /** parent hash -> child hashes (within the bounded set). */
  childrenOf: Map<string, string[]>;
};

export function buildIndex(commits: GitGraphCommit[]): GraphIndex {
  const byHash = new Map<string, GitGraphCommit>();
  for (const c of commits) byHash.set(c.hash, c);
  const childrenOf = new Map<string, string[]>();
  for (const c of commits) {
    for (const p of c.parents) {
      if (!byHash.has(p)) continue;
      const arr = childrenOf.get(p) ?? [];
      arr.push(c.hash);
      childrenOf.set(p, arr);
    }
  }
  return { byHash, childrenOf };
}

/** All commits reachable from `start` via parents, including `start`. */
export function ancestorsOf(idx: GraphIndex, start: string): Set<string> {
  const seen = new Set<string>();
  const queue = [start];
  while (queue.length > 0) {
    const h = queue.pop()!;
    if (seen.has(h)) continue;
    const c = idx.byHash.get(h);
    if (!c) continue;
    seen.add(h);
    for (const p of c.parents) if (!seen.has(p)) queue.push(p);
  }
  return seen;
}

/** All commits that can reach `start` via parents (descendants), including `start`. */
export function descendantsOf(idx: GraphIndex, start: string): Set<string> {
  const seen = new Set<string>();
  const queue = [start];
  while (queue.length > 0) {
    const h = queue.pop()!;
    if (seen.has(h)) continue;
    if (!idx.byHash.has(h)) continue;
    seen.add(h);
    for (const child of idx.childrenOf.get(h) ?? []) {
      if (!seen.has(child)) queue.push(child);
    }
  }
  return seen;
}

/** True when `maybeAncestor` is reachable from `from` (or equal). */
export function isAncestor(
  idx: GraphIndex,
  maybeAncestor: string,
  from: string,
): boolean {
  return ancestorsOf(idx, from).has(maybeAncestor);
}

/** The main branch's first-parent chain, tip first. */
export function firstParentChain(idx: GraphIndex, tip: string): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();
  let cur: string | undefined = tip;
  while (cur && idx.byHash.has(cur) && !seen.has(cur)) {
    chain.push(cur);
    seen.add(cur);
    cur = idx.byHash.get(cur)!.parents[0];
  }
  return chain;
}

/**
 * Where a commit landed on main: the OLDEST commit on main's first-parent
 * chain that is a descendant of (or is) the commit. For a branch commit that
 * is the merge commit that brought it in; for a commit made directly on main
 * it is the commit itself. Null when the commit hasn't reached main (yet), or
 * when main's tip is outside the bounded set.
 */
export function landingOnMain(
  idx: GraphIndex,
  mainTip: string | null,
  commit: string,
): string | null {
  if (!mainTip || !idx.byHash.has(mainTip) || !idx.byHash.has(commit)) return null;
  const desc = descendantsOf(idx, commit);
  const chain = firstParentChain(idx, mainTip);
  // Tip-first chain: the LAST chain entry inside desc is the oldest = landing.
  let landing: string | null = null;
  for (const h of chain) {
    if (desc.has(h)) landing = h;
  }
  return landing;
}

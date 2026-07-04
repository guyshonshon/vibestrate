/**
 * GitDag - the commit graph as a lane rail + rich rows.
 *
 * Layout: same topology math as before (depth rows via topo sort; lanes walk
 * first-parent chains, main first). What changed is the rendering: the SVG now
 * draws ONLY the rail (edges + nodes) and each commit is an HTML row - subject
 * in chalk-100, branch tips as contained chips, +/- shortstat, author + time -
 * so the graph reads like history, not a column of grey hashes.
 *
 * Selection lights the story of a commit: its ancestry stays lit, the commit
 * on main's first-parent chain where it landed gets a "merged here" mark, and
 * unrelated commits dim.
 */
import { useMemo } from "react";
import { GitMerge } from "lucide-react";
import type { GitGraph, GitGraphCommit } from "../../lib/types.js";
import { cn } from "../design/cn.js";
import { relTime } from "../design/format.js";
import {
  ancestorsOf,
  buildIndex,
  descendantsOf,
  landingOnMain,
} from "./graph-math.js";

const ROW_H = 46; // px per row - two text lines
const LANE_W = 18; // px per lane
const NODE_R = 4.5;
const TIP_R = 6; // branch tips render bigger than plain commits
const PADDING_LEFT = 12;

// Lane colours cycle through the token palette so they flip with the theme.
// Lane 0 is always main = the violet spine.
const LANE_COLORS = [
  "var(--color-violet-soft)",
  "var(--color-sky-glow)",
  "var(--color-emerald)",
  "var(--color-amber-soft)",
  "var(--color-violet-vivid)",
  "var(--color-chalk-300)",
];

function laneColor(lane: number): string {
  return LANE_COLORS[lane % LANE_COLORS.length] ?? LANE_COLORS[0]!;
}

type NodeLayout = {
  commit: GitGraphCommit;
  row: number;
  lane: number;
  x: number;
  y: number;
};

function computeLayout(
  commits: GitGraphCommit[],
  mainBranch: string,
  source: string | null,
  target: string | null,
  branchHeadMap: Map<string, string[]>,
): NodeLayout[] {
  if (commits.length === 0) return [];

  const hashSet = new Set(commits.map((c) => c.hash));
  const byHash = new Map(commits.map((c) => [c.hash, c]));
  const childrenOf = new Map<string, string[]>();
  for (const c of commits) {
    for (const p of c.parents) {
      if (hashSet.has(p)) {
        const arr = childrenOf.get(p) ?? [];
        arr.push(c.hash);
        childrenOf.set(p, arr);
      }
    }
  }

  // Topological sort (Kahn, oldest first).
  const inDegree = new Map<string, number>();
  for (const c of commits) inDegree.set(c.hash, 0);
  for (const c of commits) {
    for (const p of c.parents) {
      if (hashSet.has(p)) inDegree.set(c.hash, (inDegree.get(c.hash) ?? 0) + 1);
    }
  }
  const queue: string[] = [];
  for (const [hash, deg] of inDegree) if (deg === 0) queue.push(hash);
  const topoOrder: string[] = [];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const h = queue.shift()!;
    if (visited.has(h)) continue;
    visited.add(h);
    topoOrder.push(h);
    for (const child of childrenOf.get(h) ?? []) {
      const d = (inDegree.get(child) ?? 1) - 1;
      inDegree.set(child, d);
      if (d === 0) queue.push(child);
    }
  }
  for (const c of commits) if (!visited.has(c.hash)) topoOrder.push(c.hash);

  // Depths: root = 0, commit = max(parent depth) + 1.
  const depthMap = new Map<string, number>();
  for (const hash of topoOrder) {
    const c = byHash.get(hash);
    if (!c) continue;
    let maxParentDepth = -1;
    for (const p of c.parents) {
      if (hashSet.has(p)) {
        maxParentDepth = Math.max(maxParentDepth, depthMap.get(p) ?? 0);
      }
    }
    depthMap.set(hash, maxParentDepth + 1);
  }

  const sorted = [...commits].sort((a, b) => {
    const da = depthMap.get(a.hash) ?? 0;
    const db = depthMap.get(b.hash) ?? 0;
    return db - da;
  });
  const rowMap = new Map<string, number>();
  sorted.forEach((c, i) => rowMap.set(c.hash, i));

  // Lanes: main's first-parent chain first (lane 0 = violet spine), then the
  // planner's source/target, then remaining tips, then stragglers.
  const laneMap = new Map<string, number>();
  let nextLane = 0;
  const headHashesByPriority: string[] = [];
  const seenHead = new Set<string>();
  const pushHead = (pred: (names: string[]) => boolean) => {
    for (const [hash, names] of branchHeadMap) {
      if (seenHead.has(hash)) continue;
      if (pred(names)) {
        headHashesByPriority.push(hash);
        seenHead.add(hash);
      }
    }
  };
  pushHead((names) => names.includes(mainBranch));
  pushHead((names) => names.includes(source ?? ""));
  pushHead((names) => names.includes(target ?? ""));
  pushHead(() => true);
  const branchOrder = [...headHashesByPriority];
  for (const c of sorted) {
    if (!seenHead.has(c.hash)) branchOrder.push(c.hash);
  }

  for (const startHash of branchOrder) {
    if (laneMap.has(startHash)) continue;
    let cur: string | undefined = startHash;
    const lane = nextLane++;
    while (cur && !laneMap.has(cur) && hashSet.has(cur)) {
      laneMap.set(cur, lane);
      const cObj = byHash.get(cur);
      if (!cObj) break;
      cur = cObj.parents.find((p) => hashSet.has(p));
    }
  }
  for (const c of commits) {
    if (!laneMap.has(c.hash)) laneMap.set(c.hash, nextLane++);
  }

  return sorted.map((c) => {
    const row = rowMap.get(c.hash) ?? 0;
    const lane = laneMap.get(c.hash) ?? 0;
    return {
      commit: c,
      row,
      lane,
      x: PADDING_LEFT + lane * LANE_W + TIP_R,
      y: row * ROW_H + ROW_H / 2,
    };
  });
}

type Props = {
  graph: GitGraph;
  selectedHash: string | null;
  onSelectCommit: (hash: string) => void;
  source: string | null;
  target: string | null;
};

export function GitDag({ graph, selectedHash, onSelectCommit, source, target }: Props) {
  const { commits, branchHeads, mainBranch } = graph;

  const branchHeadMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const bh of branchHeads) {
      const arr = m.get(bh.hash) ?? [];
      arr.push(bh.name);
      m.set(bh.hash, arr);
    }
    return m;
  }, [branchHeads]);

  const mergedBranches = useMemo(
    () => new Set(branchHeads.filter((b) => b.mergedIntoMain).map((b) => b.name)),
    [branchHeads],
  );

  const layout = useMemo(
    () => computeLayout(commits, mainBranch, source, target, branchHeadMap),
    [commits, mainBranch, source, target, branchHeadMap],
  );

  const nodeByHash = useMemo(() => {
    const m = new Map<string, NodeLayout>();
    for (const n of layout) m.set(n.commit.hash, n);
    return m;
  }, [layout]);

  const idx = useMemo(() => buildIndex(commits), [commits]);
  const mainTip = useMemo(
    () => branchHeads.find((b) => b.isMain)?.hash ?? null,
    [branchHeads],
  );

  // Selection story: the commit's history stays lit, the corridor up to where
  // it landed on main stays lit, everything else dims.
  const highlight = useMemo(() => {
    if (!selectedHash || !idx.byHash.has(selectedHash)) return null;
    const lit = ancestorsOf(idx, selectedHash);
    const landed = landingOnMain(idx, mainTip, selectedHash);
    if (landed) {
      const corridor = descendantsOf(idx, selectedHash);
      const landedAncestors = ancestorsOf(idx, landed);
      for (const h of corridor) if (landedAncestors.has(h)) lit.add(h);
    }
    return { lit, landed };
  }, [selectedHash, idx, mainTip]);

  const numLanes = layout.reduce((max, n) => Math.max(max, n.lane + 1), 1);
  const railW = PADDING_LEFT + numLanes * LANE_W + TIP_R * 2 + 6;
  const svgH = layout.length * ROW_H;
  const hashSet = useMemo(() => new Set(commits.map((c) => c.hash)), [commits]);

  if (commits.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-[12px] text-chalk-300">
        No commits loaded - refresh once the repository has history.
      </div>
    );
  }

  const rowDim = (hash: string) =>
    highlight !== null && !highlight.lit.has(hash) && hash !== selectedHash;

  return (
    <div className="relative" style={{ height: svgH }}>
      {/* Lane rail - edges + nodes only; text lives in the HTML rows. */}
      <svg
        width={railW}
        height={svgH}
        viewBox={`0 0 ${railW} ${svgH}`}
        className="absolute left-0 top-0 block"
        aria-hidden
      >
        {layout.map((node) =>
          node.commit.parents.map((parentHash) => {
            const parentNode = nodeByHash.get(parentHash);
            const dim =
              rowDim(node.commit.hash) ||
              (parentNode ? rowDim(parentNode.commit.hash) : false);
            const edgeOpacity = dim ? 0.12 : 0.55;
            if (!parentNode) {
              if (hashSet.has(parentHash)) return null;
              return (
                <line
                  key={`stub-${node.commit.hash}-${parentHash}`}
                  x1={node.x}
                  y1={node.y + NODE_R}
                  x2={node.x}
                  y2={node.y + NODE_R + ROW_H * 0.5}
                  stroke={laneColor(node.lane)}
                  strokeWidth={1.4}
                  strokeDasharray="3 3"
                  strokeOpacity={dim ? 0.1 : 0.35}
                />
              );
            }
            const x1 = node.x;
            const y1 = node.y + NODE_R;
            const x2 = parentNode.x;
            const y2 = parentNode.y - NODE_R;
            if (node.lane === parentNode.lane) {
              return (
                <line
                  key={`edge-${node.commit.hash}-${parentHash}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={laneColor(node.lane)}
                  strokeWidth={1.4}
                  strokeOpacity={edgeOpacity}
                />
              );
            }
            const midY = (y1 + y2) / 2;
            return (
              <path
                key={`edge-${node.commit.hash}-${parentHash}`}
                d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                fill="none"
                stroke={laneColor(node.lane)}
                strokeWidth={1.4}
                strokeOpacity={dim ? 0.1 : 0.4}
              />
            );
          }),
        )}
        {layout.map((node) => {
          const isTip = branchHeadMap.has(node.commit.hash);
          const isSelected = selectedHash === node.commit.hash;
          const isLanded = highlight?.landed === node.commit.hash;
          const dim = rowDim(node.commit.hash);
          const color = isLanded
            ? "var(--color-emerald)"
            : laneColor(node.lane);
          return (
            <g key={node.commit.hash} opacity={dim ? 0.25 : 1}>
              {isSelected || isLanded ? (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={(isTip ? TIP_R : NODE_R) + 3}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.5}
                  strokeOpacity={0.8}
                />
              ) : null}
              {/* Branch tips are rings, plain commits are dots - the shape
                  tells them apart before colour does. */}
              {isTip ? (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={TIP_R}
                  fill="var(--color-coal-600)"
                  stroke={color}
                  strokeWidth={2}
                />
              ) : (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={NODE_R}
                  fill={color}
                  fillOpacity={isSelected ? 1 : 0.85}
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* Commit rows. */}
      {layout.map((node) => {
        const c = node.commit;
        const names = branchHeadMap.get(c.hash) ?? [];
        const isSelected = selectedHash === c.hash;
        const isLanded = highlight?.landed === c.hash;
        const isMerge = c.parents.length > 1;
        const dim = rowDim(c.hash);
        return (
          <button
            key={c.hash}
            type="button"
            onClick={() => onSelectCommit(c.hash)}
            className={cn(
              "absolute flex flex-col justify-center gap-0.5 rounded-[10px] px-2.5 text-left transition",
              isSelected
                ? "bg-violet-soft/10"
                : "hover:bg-coal-500/60",
              dim && "opacity-35",
            )}
            style={{
              left: railW,
              top: node.row * ROW_H + 3,
              height: ROW_H - 6,
              width: `calc(100% - ${railW}px)`,
            }}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              {isMerge ? (
                <GitMerge
                  className="h-3 w-3 shrink-0 text-chalk-400"
                  strokeWidth={1.9}
                  aria-hidden
                />
              ) : null}
              {names.map((n) => (
                <span
                  key={n}
                  className={cn(
                    "mono shrink-0 rounded-[6px] px-1.5 py-px text-[10px] font-semibold",
                    n === mainBranch
                      ? "bg-violet-soft text-coal-900"
                      : n === source
                        ? "bg-sky-glow/15 text-sky-glow"
                        : n === target
                          ? "bg-emerald-500/15 text-emerald-400"
                          : mergedBranches.has(n)
                            ? "bg-coal-500 text-chalk-300"
                            : "bg-violet-soft/12 text-violet-soft",
                  )}
                  title={
                    mergedBranches.has(n) && n !== mainBranch
                      ? `${n} - already merged into ${mainBranch}`
                      : n
                  }
                >
                  {n}
                </span>
              ))}
              <span
                className={cn(
                  "min-w-0 truncate text-[12.5px] font-semibold",
                  dim ? "text-chalk-300" : "text-chalk-100",
                )}
              >
                {c.subject || c.shortHash}
              </span>
              {isLanded && c.hash !== selectedHash ? (
                <span className="shrink-0 rounded-[6px] bg-emerald-500/15 px-1.5 py-px text-[10px] font-semibold text-emerald-400">
                  merged here
                </span>
              ) : null}
              <span className="ml-auto flex shrink-0 items-center gap-2 pl-2">
                {c.stats ? (
                  <span className="num-tabular text-[11px] font-semibold">
                    <span className="text-emerald-400">+{c.stats.insertions}</span>{" "}
                    <span className="text-rose-300">-{c.stats.deletions}</span>
                  </span>
                ) : isMerge ? (
                  <span className="text-[10.5px] font-medium text-chalk-400">merge</span>
                ) : null}
              </span>
            </span>
            <span className="flex min-w-0 items-center gap-2 text-[10.5px]">
              <span className="mono shrink-0 text-violet-soft/90">{c.shortHash}</span>
              <span className="truncate text-chalk-300">{c.author}</span>
              <span className="shrink-0 text-chalk-400">{relTime(c.date)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

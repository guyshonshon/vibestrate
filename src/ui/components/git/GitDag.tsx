/**
 * GitDag - SVG commit graph.
 *
 * Layout strategy:
 *   - Each commit gets a "depth" row = 1 + max(parent depths). Root commits = 0.
 *   - We invert so newest (smallest depth) is at the top.
 *   - Horizontal lanes are assigned greedily: each branch head gets its own
 *     lane; child commits inherit the lane of their first parent.
 *   - Edges are drawn as straight lines (or elbow paths for cross-lane edges).
 */
import { useMemo } from "react";
import type { GitGraph, GitGraphCommit } from "../../lib/types.js";
import { cn } from "../design/cn.js";

const ROW_H = 36;    // px per row
const LANE_W = 28;   // px per lane
const NODE_R = 5;    // circle radius
const LABEL_X_OFF = 10; // px from circle centre to label start
const PADDING_LEFT = 16;
const PADDING_TOP = 24;
const PADDING_BOTTOM = 16;

// Lane colours cycle through the token palette so they flip with the theme.
// Violet is the single-hue accent; emerald/amber/sky carry their status meaning
// (target/attention/source) so the eye reads them consistently. `var(--color-*)`
// resolves the same token a Tailwind class would, and re-resolves under
// `:root.light`, so the DAG stays legible in both themes without hardcoded hex.
const LANE_COLORS = [
  "var(--color-violet-soft)", // main accent
  "var(--color-sky-glow)",
  "var(--color-emerald)",
  "var(--color-amber-soft)",
  "var(--color-violet-vivid)",
  "var(--color-chalk-300)",
];

function laneColor(lane: number): string {
  return LANE_COLORS[lane % LANE_COLORS.length] ?? LANE_COLORS[0]!;
}

// Semantic node/label colours (theme-flipping tokens).
const COLOR_MAIN = "var(--color-violet-soft)";
const COLOR_SOURCE = "var(--color-sky-glow)";
const COLOR_TARGET = "var(--color-emerald)";
const COLOR_LABEL_DIM = "var(--color-chalk-400)";

type NodeLayout = {
  commit: GitGraphCommit;
  row: number;   // 0 = newest
  lane: number;  // 0 = leftmost
  x: number;
  y: number;
};

function computeLayout(
  commits: GitGraphCommit[],
  source: string | null,
  target: string | null,
  branchHeadMap: Map<string, string[]>, // hash -> branch names
): NodeLayout[] {
  if (commits.length === 0) return [];

  const hashSet = new Set(commits.map((c) => c.hash));
  // Build a depth map: start from roots (no parents in set), BFS upward.
  const depthMap = new Map<string, number>();
  // Parent -> list of children
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

  // Topological sort (Kahn's algorithm, oldest first)
  const inDegree = new Map<string, number>();
  for (const c of commits) {
    inDegree.set(c.hash, 0);
  }
  for (const c of commits) {
    for (const p of c.parents) {
      if (hashSet.has(p)) {
        inDegree.set(c.hash, (inDegree.get(c.hash) ?? 0) + 1);
      }
    }
  }
  const queue: string[] = [];
  for (const [hash, deg] of inDegree) {
    if (deg === 0) queue.push(hash);
  }
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
  // Any unreachable commits (cycles shouldn't exist in git but just in case)
  for (const c of commits) {
    if (!visited.has(c.hash)) topoOrder.push(c.hash);
  }

  // Assign depths: root = 0, each commit = max(parent depth) + 1
  for (const hash of topoOrder) {
    const c = commits.find((x) => x.hash === hash)!;
    if (!c) continue;
    let maxParentDepth = -1;
    for (const p of c.parents) {
      if (hashSet.has(p)) {
        maxParentDepth = Math.max(maxParentDepth, depthMap.get(p) ?? 0);
      }
    }
    depthMap.set(hash, maxParentDepth + 1);
  }

  // Sort commits newest-first by depth descending (newer = higher depth)
  const sorted = [...commits].sort((a, b) => {
    const da = depthMap.get(a.hash) ?? 0;
    const db = depthMap.get(b.hash) ?? 0;
    return db - da; // deeper = newer = top
  });

  // Row assignment: row 0 = top = newest
  const rowMap = new Map<string, number>();
  sorted.forEach((c, i) => rowMap.set(c.hash, i));

  // Lane assignment: branch tips get dedicated lanes; first parent inherits lane
  const laneMap = new Map<string, number>();
  let nextLane = 0;

  // Prioritise: main branch first, then source, then target, then others
  const branchOrder: string[] = [];
  // collect hashes for special branches
  const allHeadHashes = new Set<string>();
  for (const [hash, names] of branchHeadMap) {
    allHeadHashes.add(hash);
    if (names.some((n) => n === "main" || n === "master")) branchOrder.unshift(hash);
    else if (names.some((n) => n === source)) branchOrder.push(hash);
    else if (names.some((n) => n === target)) branchOrder.push(hash);
    else branchOrder.push(hash);
  }
  // Add rest in sorted row order
  for (const c of sorted) {
    if (!allHeadHashes.has(c.hash)) branchOrder.push(c.hash);
  }

  for (const startHash of branchOrder) {
    if (laneMap.has(startHash)) continue;
    // Walk first-parent chain from this commit
    let cur: string | undefined = startHash;
    const lane = nextLane++;
    while (cur && !laneMap.has(cur) && hashSet.has(cur)) {
      laneMap.set(cur, lane);
      const cObj = commits.find((x) => x.hash === cur);
      if (!cObj) break;
      const firstParent = cObj.parents.find((p) => hashSet.has(p));
      cur = firstParent;
    }
  }
  // Assign any remaining (should be none normally)
  for (const c of commits) {
    if (!laneMap.has(c.hash)) laneMap.set(c.hash, nextLane++);
  }

  const numLanes = nextLane || 1;

  return sorted.map((c) => {
    const row = rowMap.get(c.hash) ?? 0;
    const lane = laneMap.get(c.hash) ?? 0;
    const x = PADDING_LEFT + lane * LANE_W + NODE_R + 2;
    const y = PADDING_TOP + row * ROW_H;
    return { commit: c, row, lane, x, y };
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
  const { commits, branchHeads } = graph;

  // Map hash -> branch names
  const branchHeadMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const bh of branchHeads) {
      const arr = m.get(bh.hash) ?? [];
      arr.push(bh.name);
      m.set(bh.hash, arr);
    }
    return m;
  }, [branchHeads]);

  const layout = useMemo(
    () => computeLayout(commits, source, target, branchHeadMap),
    [commits, source, target, branchHeadMap],
  );

  const nodeByHash = useMemo(() => {
    const m = new Map<string, NodeLayout>();
    for (const n of layout) m.set(n.commit.hash, n);
    return m;
  }, [layout]);

  const hashSet = useMemo(() => new Set(commits.map((c) => c.hash)), [commits]);

  const numRows = layout.length;
  const numLanes = layout.reduce((max, n) => Math.max(max, n.lane + 1), 1);

  // Compute a reasonable label area - we leave some space for branch names
  const LABEL_AREA = 120;
  const svgW = PADDING_LEFT + numLanes * LANE_W + NODE_R * 2 + LABEL_AREA + 8;
  const svgH = PADDING_TOP + numRows * ROW_H + PADDING_BOTTOM;

  if (commits.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-[12px] text-chalk-300">
        No commits loaded - refresh once the repository has history.
      </div>
    );
  }

  return (
    <svg
      width={svgW}
      height={svgH}
      viewBox={`0 0 ${svgW} ${svgH}`}
      className="block overflow-visible"
      aria-label="Commit graph"
    >
      {/* ── Edges ─────────────────────────────────────────────────────── */}
      {layout.map((node) =>
        node.commit.parents.map((parentHash) => {
          const parentNode = nodeByHash.get(parentHash);
          if (!parentNode) {
            // Boundary stub - parent not in set: draw a short downward stub
            if (hashSet.has(parentHash)) return null; // safety
            const stubLen = ROW_H * 0.55;
            return (
              <line
                key={`stub-${node.commit.hash}-${parentHash}`}
                x1={node.x}
                y1={node.y + NODE_R}
                x2={node.x}
                y2={node.y + NODE_R + stubLen}
                stroke={laneColor(node.lane)}
                strokeWidth={1.4}
                strokeDasharray="3 3"
                strokeOpacity={0.35}
              />
            );
          }
          // Draw edge from child to parent
          const x1 = node.x;
          const y1 = node.y + NODE_R;
          const x2 = parentNode.x;
          const y2 = parentNode.y - NODE_R;
          const sameLane = node.lane === parentNode.lane;
          const edgeColor = laneColor(node.lane);
          if (sameLane) {
            return (
              <line
                key={`edge-${node.commit.hash}-${parentHash}`}
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={edgeColor}
                strokeWidth={1.4}
                strokeOpacity={0.6}
              />
            );
          }
          // Elbow path for cross-lane edges
          const midY = (y1 + y2) / 2;
          const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
          return (
            <path
              key={`edge-${node.commit.hash}-${parentHash}`}
              d={d}
              fill="none"
              stroke={edgeColor}
              strokeWidth={1.4}
              strokeOpacity={0.45}
            />
          );
        }),
      )}

      {/* ── Nodes ─────────────────────────────────────────────────────── */}
      {layout.map((node) => {
        const isSelected = selectedHash === node.commit.hash;
        const branchNames = branchHeadMap.get(node.commit.hash) ?? [];
        const isMain = branchNames.some(
          (n) => graph.mainBranch === n,
        );
        const isSource = branchNames.includes(source ?? "");
        const isTarget = branchNames.includes(target ?? "");
        const nodeColor = isMain
          ? COLOR_MAIN
          : isSource
            ? COLOR_SOURCE
            : isTarget
              ? COLOR_TARGET
              : laneColor(node.lane);

        return (
          <g
            key={node.commit.hash}
            onClick={() => onSelectCommit(node.commit.hash)}
            style={{ cursor: "pointer" }}
            role="button"
            aria-label={node.commit.subject}
          >
            {/* selection ring */}
            {isSelected ? (
              <circle
                cx={node.x}
                cy={node.y}
                r={NODE_R + 3}
                fill="none"
                stroke={nodeColor}
                strokeWidth={1.5}
                strokeOpacity={0.7}
              />
            ) : null}
            <circle
              cx={node.x}
              cy={node.y}
              r={NODE_R}
              fill={nodeColor}
              fillOpacity={isSelected ? 1 : 0.75}
              stroke={nodeColor}
              strokeWidth={isMain ? 1.5 : 1}
            />

            {/* Branch head labels next to tip commits */}
            {branchNames.length > 0 ? (
              <text
                x={node.x + NODE_R + LABEL_X_OFF}
                y={node.y + 4}
                fontSize={10}
                fill={isMain ? COLOR_MAIN : isSource ? COLOR_SOURCE : isTarget ? COLOR_TARGET : COLOR_LABEL_DIM}
                fontFamily="monospace"
                fontWeight={isMain || isSource || isTarget ? "600" : "400"}
                className="select-none"
              >
                {branchNames.join(", ")}
              </text>
            ) : (
              /* short hash for non-tip commits */
              <text
                x={node.x + NODE_R + LABEL_X_OFF}
                y={node.y + 4}
                fontSize={9.5}
                fill={COLOR_LABEL_DIM}
                fontFamily="monospace"
                className="select-none"
              >
                {node.commit.shortHash}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Git tree page - interactive commit DAG + inspector + merge planner.
 *
 * Three regions:
 *   LEFT  - scrollable SVG DAG (GitDag)
 *   MIDDLE - commit/branch inspector (selected node detail)
 *   RIGHT  - merge planner (MergePlannerPanel + ConflictResolver)
 *
 * Loads api.getProjectGitGraph() on mount; re-loads after apply/undo.
 */
import { useEffect, useState } from "react";
import { GitMerge, RefreshCw } from "lucide-react";
import { api } from "../../lib/api.js";
import type { GitGraph, GitGraphCommit, GitBranchHead } from "../../lib/types.js";
import { cn } from "../../components/design/cn.js";
import { relTime } from "../../components/design/format.js";
import { GitDag } from "../../components/git/GitDag.js";
import { MergePlannerPanel } from "../../components/git/MergePlannerPanel.js";

export function GitTreePage() {
  const [graph, setGraph] = useState<GitGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [sourceBranch, setSourceBranch] = useState<string | null>(null);
  const [targetBranch, setTargetBranch] = useState<string | null>(null);

  async function load() {
    setRefreshing(true);
    try {
      const g = await api.getProjectGitGraph();
      setGraph(g);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // When the graph loads, pre-select the main branch head as selected hash.
  useEffect(() => {
    if (!graph || selectedHash) return;
    const mainHead = graph.branchHeads.find((b) => b.isMain);
    if (mainHead) setSelectedHash(mainHead.hash);
  }, [graph, selectedHash]);

  const selectedCommit: GitGraphCommit | null =
    selectedHash && graph
      ? (graph.commits.find((c) => c.hash === selectedHash) ?? null)
      : null;

  const branchesForHash = (hash: string): GitBranchHead[] =>
    graph ? graph.branchHeads.filter((b) => b.hash === hash) : [];

  return (
    <div className="deep-scene relative z-10 mx-auto max-w-[1520px] px-6 pt-5 pb-12">
      {/* Page header */}
      <section className="flex items-center justify-between gap-4 mb-4">
        <h1 className="text-[15px] font-semibold tracking-tight text-fog-100 flex items-center gap-2">
          <GitMerge className="h-4 w-4 text-violet-soft" strokeWidth={1.6} />
          Git tree
        </h1>
        <button
          type="button"
          onClick={() => void load()}
          disabled={refreshing}
          className="h-8 px-2.5 border border-white/10 bg-ink-200 hover:bg-ink-100 text-[12px] text-fog-300 flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
            strokeWidth={1.6}
          />
          Refresh
        </button>
      </section>

      {error ? (
        <div className="mb-4 border border-rose-400/30 bg-rose-500/5 px-3 py-1.5 text-[12.5px] text-rose-300">
          {error}
        </div>
      ) : null}

      {!graph ? (
        <div className="text-[12.5px] text-fog-300">Loading graph…</div>
      ) : !graph.available ? (
        <div className="slab px-6 py-10 text-center text-[12.5px] text-fog-300">
          Git is not available in this project.
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-4">
          {/* LEFT - DAG */}
          <div className="col-span-12 lg:col-span-4 slab p-3 overflow-auto" style={{ maxHeight: "calc(100vh - 200px)" }}>
            <div className="text-[11.5px] text-fog-500 mb-2">
              {graph.commits.length} commit{graph.commits.length === 1 ? "" : "s"}
              {graph.bounded ? " (truncated)" : ""}
            </div>
            <GitDag
              graph={graph}
              selectedHash={selectedHash}
              onSelectCommit={setSelectedHash}
              source={sourceBranch}
              target={targetBranch}
            />
          </div>

          {/* MIDDLE - inspector */}
          <div className="col-span-12 lg:col-span-4 slab p-4 space-y-4">
            <div className="text-[13px] font-medium text-fog-100">Inspector</div>
            {selectedCommit ? (
              <CommitDetail
                commit={selectedCommit}
                branches={branchesForHash(selectedCommit.hash)}
                mainBranch={graph.mainBranch}
              />
            ) : (
              <div className="text-[12px] text-fog-400">
                Click a commit in the graph to inspect it.
              </div>
            )}
          </div>

          {/* RIGHT - merge planner */}
          <div className="col-span-12 lg:col-span-4 slab p-4">
            <MergePlannerPanel
              branchHeads={graph.branchHeads}
              source={sourceBranch}
              target={targetBranch}
              onSourceChange={setSourceBranch}
              onTargetChange={setTargetBranch}
              onMergeApplied={() => void load()}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function CommitDetail({
  commit,
  branches,
  mainBranch,
}: {
  commit: GitGraphCommit;
  branches: GitBranchHead[];
  mainBranch: string;
}) {
  return (
    <div className="space-y-3">
      <div>
        <div className="text-[12.5px] text-fog-100 leading-snug">{commit.subject}</div>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[11.5px]">
        <dt className="text-fog-500">hash</dt>
        <dd className="mono text-fog-200 truncate">{commit.hash}</dd>

        <dt className="text-fog-500">author</dt>
        <dd className="text-fog-200 truncate">{commit.author}</dd>

        <dt className="text-fog-500">when</dt>
        <dd className="text-fog-200">{relTime(commit.date)}</dd>

        {commit.parents.length > 0 ? (
          <>
            <dt className="text-fog-500">parent{commit.parents.length > 1 ? "s" : ""}</dt>
            <dd className="mono text-fog-400 truncate">
              {commit.parents.map((p) => p.slice(0, 8)).join(", ")}
            </dd>
          </>
        ) : null}
      </dl>

      {branches.length > 0 ? (
        <div className="space-y-0.5">
          {branches.map((b) => (
            <div
              key={b.name}
              className={cn(
                "mono text-[11px] px-1.5 py-0.5 inline-block mr-1",
                b.isMain || b.name === mainBranch
                  ? "text-violet-soft bg-violet-soft/10 border border-violet-soft/20"
                  : "text-fog-300 bg-white/[0.04] border border-white/[0.07]",
              )}
            >
              {b.name}
            </div>
          ))}
        </div>
      ) : null}

      {commit.refs.length > 0 ? (
        <div className="text-[10.5px] mono text-fog-500 truncate">
          {commit.refs.join(", ")}
        </div>
      ) : null}
    </div>
  );
}

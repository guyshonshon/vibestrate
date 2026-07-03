/**
 * Git tree page - interactive commit DAG + inspector + merge planner.
 *
 * Three regions (a PageShell `fill` app view - each region scrolls its own body):
 *   LEFT   - scrollable SVG DAG (GitDag)
 *   MIDDLE - commit/branch inspector (selected node detail)
 *   RIGHT  - merge planner (MergePlannerPanel + ConflictResolver)
 *
 * Loads api.getProjectGitGraph() on mount; re-loads after apply/undo.
 */
import { useEffect, useState } from "react";
import { GitCommitHorizontal, GitMerge, MousePointerClick, RefreshCw } from "lucide-react";
import { api } from "../../lib/api.js";
import type { GitGraph, GitGraphCommit, GitBranchHead } from "../../lib/types.js";
import { cn } from "../../components/design/cn.js";
import { relTime } from "../../components/design/format.js";
import { Button } from "../../components/design/Button.js";
import { StatTile } from "../../components/design/StatTile.js";
import { PageShell, PageHeader } from "../../components/layout/PageShell.js";
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
    <PageShell variant="fill">
      <PageHeader
        className="mb-4"
        title={
          <span className="flex items-baseline gap-2.5">
            Diffs
            {graph?.available ? (
              <span className="text-[14px] font-semibold tabular-nums text-chalk-400">
                {graph.commits.length}
              </span>
            ) : null}
          </span>
        }
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void load()}
            disabled={refreshing}
            iconLeft={
              <RefreshCw
                className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
                strokeWidth={1.9}
              />
            }
          >
            {refreshing ? "Refreshing" : "Refresh"}
          </Button>
        }
      >
        {error ? (
          <div className="mt-3 rounded-[12px] border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-[13px] text-rose-300">
            {error} - refresh to retry, or check that git is available in this project.
          </div>
        ) : null}
      </PageHeader>

      {!graph ? (
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-[16px] border border-[color:var(--line)] bg-coal-700 text-[13px] text-chalk-300">
          Loading the commit graph...
        </div>
      ) : !graph.available ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-[16px] border border-[color:var(--line)] bg-coal-700 px-6 text-center">
          <div className="text-[15px] font-semibold text-chalk-100">
            Git is not available in this project.
          </div>
          <p className="max-w-[420px] text-[12.5px] text-chalk-300">
            The commit graph, inspector, and merge planner need a git repository.
            Initialise git in the project root, then refresh.
          </p>
          <div className="mt-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void load()}
              iconLeft={<RefreshCw className="h-3.5 w-3.5" strokeWidth={1.9} />}
            >
              Refresh
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-12 gap-4 pb-5">
          {/* LEFT - DAG */}
          <section className="col-span-12 flex min-h-0 flex-col overflow-hidden rounded-[16px] border border-[color:var(--line)] bg-coal-700 lg:col-span-4">
            <header className="flex items-center gap-2 border-b border-[color:var(--line-soft)] px-4 py-3">
              <GitCommitHorizontal className="h-4 w-4 text-violet-soft" strokeWidth={1.9} />
              <span className="text-[13px] font-semibold text-chalk-100">Commit graph</span>
              <span className="ml-auto text-[11.5px] font-semibold text-violet-soft tabular-nums">
                {graph.commits.length} commit{graph.commits.length === 1 ? "" : "s"}
                {graph.bounded ? (
                  <span className="ml-1 font-medium text-amber-soft">truncated</span>
                ) : null}
              </span>
            </header>
            <div className="min-h-0 flex-1 overflow-auto p-3">
              <GitDag
                graph={graph}
                selectedHash={selectedHash}
                onSelectCommit={setSelectedHash}
                source={sourceBranch}
                target={targetBranch}
              />
            </div>
          </section>

          {/* MIDDLE - inspector */}
          <section className="col-span-12 flex min-h-0 flex-col overflow-hidden rounded-[16px] border border-[color:var(--line)] bg-coal-700 lg:col-span-4">
            <header className="flex items-center gap-2 border-b border-[color:var(--line-soft)] px-4 py-3">
              <span className="text-[13px] font-semibold text-chalk-100">Inspector</span>
            </header>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {selectedCommit ? (
                <CommitDetail
                  commit={selectedCommit}
                  branches={branchesForHash(selectedCommit.hash)}
                  mainBranch={graph.mainBranch}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                  <MousePointerClick className="h-5 w-5 text-violet-soft" strokeWidth={1.7} />
                  <div className="text-[13px] font-semibold text-chalk-100">
                    Nothing selected yet.
                  </div>
                  <p className="max-w-[260px] text-[12px] text-chalk-300">
                    Click any commit in the graph to inspect its author, parents,
                    and branch tips here.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* RIGHT - merge planner */}
          <section className="col-span-12 flex min-h-0 flex-col overflow-hidden rounded-[16px] border border-[color:var(--line)] bg-coal-700 lg:col-span-4">
            <header className="flex items-center gap-2 border-b border-[color:var(--line-soft)] px-4 py-3">
              <GitMerge className="h-4 w-4 text-violet-soft" strokeWidth={1.9} />
              <span className="text-[13px] font-semibold text-chalk-100">Merge planner</span>
            </header>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              <MergePlannerPanel
                branchHeads={graph.branchHeads}
                source={sourceBranch}
                target={targetBranch}
                onSourceChange={setSourceBranch}
                onTargetChange={setTargetBranch}
                onMergeApplied={() => void load()}
              />
            </div>
          </section>
        </div>
      )}
    </PageShell>
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
    <div className="space-y-4">
      <div className="text-[13.5px] font-semibold leading-snug text-chalk-100">
        {commit.subject}
      </div>

      {/* Facts as content-width stat tiles (violet unit labels). */}
      <div className="flex flex-wrap items-stretch gap-1">
        <StatTile value={<span className="mono">{commit.hash.slice(0, 8)}</span>} label="hash" />
        <StatTile value={commit.author} label="author" />
        <StatTile value={relTime(commit.date)} label="when" />
        {commit.parents.length > 0 ? (
          <StatTile
            value={
              <span className="mono">
                {commit.parents.map((p) => p.slice(0, 8)).join(", ")}
              </span>
            }
            label={commit.parents.length > 1 ? "parents" : "parent"}
          />
        ) : (
          <StatTile value="root" label="parent" tone="violet" />
        )}
      </div>

      {branches.length > 0 ? (
        <div className="space-y-2">
          <div className="text-[11.5px] font-semibold text-violet-soft">
            Branch tips here
          </div>
          <div className="flex flex-wrap gap-1.5">
            {branches.map((b) => {
              const isMain = b.isMain || b.name === mainBranch;
              return (
                <span
                  key={b.name}
                  className={cn(
                    "mono rounded-[8px] border px-2 py-1 text-[11px]",
                    isMain
                      ? "border-violet-soft/25 bg-violet-soft/10 text-violet-soft"
                      : "border-[color:var(--line)] bg-coal-500/60 text-chalk-300",
                  )}
                >
                  {b.name}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}

      {commit.refs.length > 0 ? (
        <div className="rounded-[10px] border border-[color:var(--line-soft)] bg-coal-500/50 px-2.5 py-1.5">
          <div className="mb-0.5 text-[10.5px] font-medium text-violet-soft">refs</div>
          <div className="mono truncate text-[10.5px] text-chalk-300">
            {commit.refs.join(", ")}
          </div>
        </div>
      ) : null}
    </div>
  );
}

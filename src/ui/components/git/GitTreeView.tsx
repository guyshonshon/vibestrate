/**
 * Git "Tree" view - interactive commit DAG + inspector + merge planner.
 *
 * Three regions (each region scrolls its own body):
 *   LEFT   - scrollable SVG DAG (GitDag)
 *   MIDDLE - commit/branch inspector (selected node detail)
 *   RIGHT  - merge planner (MergePlannerPanel + ConflictResolver)
 *
 * Loads api.getProjectGitGraph() on mount; re-loads after apply/undo.
 *
 * Shell-less: SourcePage owns the PageShell(fill)/PageHeader; this returns a
 * `flex-1 min-h-0` column with a compact tool row + the three regions.
 * Extracted verbatim from the former GitTreePage.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  MousePointerClick,
  RefreshCw,
} from "lucide-react";
import { api } from "../../lib/api.js";
import type {
  GitGraph,
  GitGraphCommit,
  GitBranchHead,
  GitBranchOverview,
  GitBranchesOverview,
  GitCommitDetail,
} from "../../lib/types.js";
import { cn } from "../design/cn.js";
import { relTime } from "../design/format.js";
import { Button } from "../design/Button.js";
import { HeroCard, type HeroTone } from "../design/HeroCard.js";
import { GitDag } from "./GitDag.js";
import { BranchesPanel } from "./BranchesPanel.js";
import { MergePlannerPanel } from "./MergePlannerPanel.js";
import { buildIndex, landingOnMain } from "./graph-math.js";

type LeftTab = "graph" | "branches";

export function GitTreeView() {
  const [graph, setGraph] = useState<GitGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [sourceBranch, setSourceBranch] = useState<string | null>(null);
  const [targetBranch, setTargetBranch] = useState<string | null>(null);
  const [leftTab, setLeftTab] = useState<LeftTab>("graph");
  const [branches, setBranches] = useState<GitBranchesOverview | null>(null);
  const [branchesLoading, setBranchesLoading] = useState(false);

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
    void loadBranches();
  }

  async function loadBranches() {
    setBranchesLoading(true);
    try {
      setBranches(await api.getProjectGitBranches());
    } catch {
      setBranches(null);
    } finally {
      setBranchesLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // Selecting a branch focuses its tip in the graph and stages it as the
  // merge source, so "see each branch" flows straight into "merge this one".
  const onSelectBranch = (b: GitBranchOverview) => {
    setSelectedHash(b.hash);
    if (!b.isMain) setSourceBranch(b.name);
    setLeftTab("graph");
  };

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

  // Full detail (message body + per-file numstat) follows the selection.
  const [detail, setDetail] = useState<GitCommitDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  useEffect(() => {
    if (!selectedHash) {
      setDetail(null);
      return;
    }
    let alive = true;
    setDetailLoading(true);
    void api
      .getProjectGitCommit(selectedHash)
      .then((d) => {
        if (alive) setDetail(d);
      })
      .catch(() => {
        if (alive) setDetail(null);
      })
      .finally(() => {
        if (alive) setDetailLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [selectedHash]);

  // Where the selected commit landed on main - shared with the graph's
  // highlight so the inspector and the rail tell the same story.
  const idx = useMemo(
    () => (graph ? buildIndex(graph.commits) : null),
    [graph],
  );
  const mainTip = graph?.branchHeads.find((b) => b.isMain)?.hash ?? null;
  const landedAt = useMemo(() => {
    if (!idx || !selectedHash) return null;
    return landingOnMain(idx, mainTip, selectedHash);
  }, [idx, mainTip, selectedHash]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Compact tool row: commit count + refresh. */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold text-chalk-100">
          Commit graph
          {graph?.available ? (
            <span className="ml-2 text-[13px] font-semibold tabular-nums text-chalk-400">
              {graph.commits.length}
            </span>
          ) : null}
        </span>
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
      </div>
      {error ? (
        <div className="mb-4 rounded-[12px] border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-[13px] text-rose-300">
          {error} - refresh to retry, or check that git is available in this project.
        </div>
      ) : null}

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
          {/* LEFT - Graph / Branches (the widest region) */}
          <section className="col-span-12 flex min-h-0 flex-col overflow-hidden rounded-[16px] border border-[color:var(--line)] bg-coal-700 lg:col-span-5">
            <header className="flex items-center gap-2 border-b border-[color:var(--line-soft)] px-3 py-2">
              {/* Segmented tab control - graph vs a flat list of every branch. */}
              <div className="inline-flex items-center gap-0.5 rounded-[10px] border border-[color:var(--line)] bg-coal-800 p-0.5">
                <TabButton
                  active={leftTab === "graph"}
                  onClick={() => setLeftTab("graph")}
                  icon={<GitCommitHorizontal className="h-3.5 w-3.5" strokeWidth={1.9} />}
                  label="Graph"
                />
                <TabButton
                  active={leftTab === "branches"}
                  onClick={() => setLeftTab("branches")}
                  icon={<GitBranch className="h-3.5 w-3.5" strokeWidth={1.9} />}
                  label="Branches"
                  count={branches?.branches.length}
                />
              </div>
              <span className="ml-auto text-[11.5px] font-semibold text-violet-soft tabular-nums">
                {leftTab === "graph" ? (
                  <>
                    {graph.commits.length} commit{graph.commits.length === 1 ? "" : "s"}
                    {graph.bounded ? (
                      <span className="ml-1 font-medium text-amber-soft">truncated</span>
                    ) : null}
                  </>
                ) : null}
              </span>
            </header>
            <div className="min-h-0 flex-1 overflow-auto">
              {leftTab === "graph" ? (
                <div className="p-3">
                  <GitDag
                    graph={graph}
                    selectedHash={selectedHash}
                    onSelectCommit={setSelectedHash}
                    source={sourceBranch}
                    target={targetBranch}
                  />
                </div>
              ) : (
                <BranchesPanel
                  overview={branches}
                  loading={branchesLoading}
                  selectedBranch={sourceBranch}
                  onSelectBranch={onSelectBranch}
                  onRetry={() => void loadBranches()}
                />
              )}
            </div>
          </section>

          {/* MIDDLE - inspector */}
          <section className="col-span-12 flex min-h-0 flex-col overflow-hidden rounded-[16px] border border-[color:var(--line)] bg-coal-700 lg:col-span-4">
            <header className="flex items-center gap-2 border-b border-[color:var(--line-soft)] px-4 py-3">
              <span className="text-[13px] font-semibold text-chalk-100">Inspector</span>
            </header>
            <div className="min-h-0 flex-1 overflow-auto p-3">
              {selectedCommit ? (
                <CommitInspector
                  commit={selectedCommit}
                  branches={branchesForHash(selectedCommit.hash)}
                  mainBranch={graph.mainBranch}
                  landedAt={landedAt}
                  landedCommit={
                    landedAt
                      ? (graph.commits.find((c) => c.hash === landedAt) ?? null)
                      : null
                  }
                  detail={detail?.hash === selectedCommit.hash ? detail : null}
                  detailLoading={detailLoading}
                  onJump={setSelectedHash}
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
          <section className="col-span-12 flex min-h-0 flex-col overflow-hidden rounded-[16px] border border-[color:var(--line)] bg-coal-700 lg:col-span-3">
            <header className="flex items-center gap-2 border-b border-[color:var(--line-soft)] px-4 py-3">
              <GitMerge className="h-4 w-4 text-violet-soft" strokeWidth={1.9} />
              <span className="text-[13px] font-semibold text-chalk-100">Merge planner</span>
            </header>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              <MergePlannerPanel
                branchHeads={graph.branchHeads}
                branchesOverview={branches}
                commits={graph.commits}
                mainBranch={graph.mainBranch}
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
    </div>
  );
}

/**
 * The commit inspector - a HeroCard whose tonal column answers the question
 * the old grey facts never did: IS this commit on main? Everything below is
 * interactive: parents jump the selection, branch tips select their tip, the
 * "landed on main" row jumps to the merge commit, and the file list comes
 * from the commit-detail endpoint.
 */
function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[12px] font-semibold transition",
        active
          ? "bg-coal-600 text-chalk-100 shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
          : "text-chalk-300 hover:text-chalk-100",
      )}
    >
      <span className={active ? "text-violet-soft" : ""}>{icon}</span>
      {label}
      {typeof count === "number" ? (
        <span className="num-tabular text-[10.5px] text-chalk-400">{count}</span>
      ) : null}
    </button>
  );
}

function CommitInspector({
  commit,
  branches,
  mainBranch,
  landedAt,
  landedCommit,
  detail,
  detailLoading,
  onJump,
}: {
  commit: GitGraphCommit;
  branches: GitBranchHead[];
  mainBranch: string;
  landedAt: string | null;
  landedCommit: GitGraphCommit | null;
  detail: GitCommitDetail | null;
  detailLoading: boolean;
  onJump: (hash: string) => void;
}) {
  const onMainDirectly = landedAt === commit.hash;
  const isMerge = commit.parents.length > 1;
  const tone: HeroTone = onMainDirectly
    ? "violet"
    : landedAt
      ? "emerald"
      : "amber";
  const status = onMainDirectly ? "on main" : landedAt ? "merged" : "unmerged";
  const statusSub = onMainDirectly
    ? mainBranch
    : landedAt
      ? `into ${mainBranch}`
      : `not on ${mainBranch} yet`;
  const stats = detail?.stats ?? commit.stats;

  return (
    <div className="space-y-3">
      <HeroCard
        size="md"
        tone={tone}
        overline={isMerge ? "Merge commit" : "Commit"}
        status={status}
        statusSub={statusSub}
        title={commit.subject || commit.shortHash}
        sub={
          <>
            <span className="mono text-violet-soft/90">{commit.shortHash}</span>{" "}
            · {commit.author} · {relTime(commit.date)}
          </>
        }
        metrics={
          stats
            ? [
                {
                  value: `+${stats.insertions}`,
                  label: "added",
                  valueClass: "text-emerald-400",
                },
                {
                  value: `-${stats.deletions}`,
                  label: "removed",
                  valueClass: "text-rose-300",
                },
                { value: stats.filesChanged, label: "files" },
              ]
            : undefined
        }
      />

      {/* Where it landed - jump to the merge commit; or the honest gap. */}
      {landedAt && !onMainDirectly ? (
        <button
          type="button"
          onClick={() => onJump(landedAt)}
          className="flex w-full items-center gap-2 rounded-[12px] border border-emerald-500/25 bg-emerald-500/[0.07] px-3 py-2 text-left transition hover:bg-emerald-500/[0.12]"
        >
          <GitMerge className="h-3.5 w-3.5 shrink-0 text-emerald-400" strokeWidth={1.9} />
          <span className="min-w-0 flex-1">
            <span className="block text-[10.5px] font-medium text-emerald-400">
              landed on {mainBranch} at
            </span>
            <span className="block truncate text-[11.5px] font-semibold text-chalk-100">
              <span className="mono">{landedAt.slice(0, 8)}</span>
              {landedCommit ? ` ${landedCommit.subject}` : ""}
            </span>
          </span>
          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-emerald-400" strokeWidth={1.9} />
        </button>
      ) : null}
      {!landedAt ? (
        <div className="rounded-[12px] border border-amber-soft/25 bg-amber-500/[0.07] px-3 py-2 text-[11.5px] text-amber-soft">
          Not reachable from {mainBranch} - merge its branch in the planner to
          land it.
        </div>
      ) : null}

      {/* Parents - jump the selection. */}
      {commit.parents.length > 0 ? (
        <div>
          <div className="mb-1.5 text-[11px] font-semibold text-violet-soft">
            {commit.parents.length > 1 ? "Parents" : "Parent"}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {commit.parents.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onJump(p)}
                className="mono rounded-[8px] border border-[color:var(--line)] bg-coal-500/60 px-2 py-1 text-[11px] text-chalk-100 transition hover:border-violet-soft/40 hover:text-violet-soft"
              >
                {p.slice(0, 8)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Branch tips here - click selects the tip commit. */}
      {branches.length > 0 ? (
        <div>
          <div className="mb-1.5 text-[11px] font-semibold text-violet-soft">
            Branch tips here
          </div>
          <div className="flex flex-wrap gap-1.5">
            {branches.map((b) => {
              const isMain = b.isMain || b.name === mainBranch;
              return (
                <button
                  key={b.name}
                  type="button"
                  onClick={() => onJump(b.hash)}
                  className={cn(
                    "mono rounded-[8px] border px-2 py-1 text-[11px] transition",
                    isMain
                      ? "border-violet-soft/25 bg-violet-soft/10 text-violet-soft hover:bg-violet-soft/20"
                      : b.mergedIntoMain
                        ? "border-[color:var(--line)] bg-coal-500/60 text-chalk-300 hover:text-chalk-100"
                        : "border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-400 hover:bg-emerald-500/[0.12]",
                  )}
                  title={
                    isMain
                      ? mainBranch
                      : b.mergedIntoMain
                        ? `${b.name} - already merged into ${mainBranch}`
                        : `${b.name} - open (not merged)`
                  }
                >
                  {b.name}
                  {!isMain ? (
                    <span
                      className={cn(
                        "ml-1.5 font-sans text-[9.5px] font-semibold",
                        b.mergedIntoMain ? "text-chalk-400" : "text-emerald-400",
                      )}
                    >
                      {b.mergedIntoMain ? "merged" : "open"}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Message body, when the commit has one. */}
      {detail?.body ? (
        <div className="rounded-[10px] border border-[color:var(--line-soft)] bg-coal-500/50 px-2.5 py-2">
          <div className="mb-1 text-[10.5px] font-medium text-violet-soft">message</div>
          <pre className="mono max-h-40 overflow-auto whitespace-pre-wrap text-[10.5px] leading-[1.5] text-chalk-200">
            {detail.body}
          </pre>
        </div>
      ) : null}

      {/* Files changed - per-file numstat from the detail endpoint. */}
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-[11px] font-semibold text-violet-soft">
            Files changed
          </span>
          {detail && detail.files.length > 0 ? (
            <span className="num-tabular text-[10.5px] text-chalk-300">
              {detail.files.length}
            </span>
          ) : null}
        </div>
        {detailLoading && !detail ? (
          <div className="text-[11.5px] text-chalk-300">Loading files…</div>
        ) : !detail || detail.files.length === 0 ? (
          <div className="text-[11.5px] text-chalk-300">
            {isMerge
              ? "A merge commit - its changes live in the merged commits."
              : "No file changes recorded."}
          </div>
        ) : (
          <ul className="space-y-0.5">
            {detail.files.map((f) => (
              <li
                key={f.path}
                className="flex items-center gap-2 rounded-[8px] px-2 py-1 hover:bg-coal-500/60"
                title={f.path}
              >
                <span className="mono min-w-0 flex-1 truncate text-[11px] text-chalk-100">
                  {f.path}
                </span>
                <span className="num-tabular shrink-0 text-[10.5px] font-semibold">
                  {f.insertions === null ? (
                    <span className="text-chalk-400">binary</span>
                  ) : (
                    <>
                      <span className="text-emerald-400">+{f.insertions}</span>{" "}
                      <span className="text-rose-300">-{f.deletions}</span>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

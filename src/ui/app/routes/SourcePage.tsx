/**
 * Source page - the single git surface. One PageShell(fill) + PageHeader
 * ("Source") with a [ Changes | Tree | Merge ] segmented control; the body
 * swaps between the three shell-less views. This is a pure information-
 * architecture wrapper: every hook, handler, and mutating flow lives inside
 * the views unchanged.
 *
 * - changes -> GitChangesView (project working tree + per-run worktrees)
 * - tree    -> GitTreeView    (commit DAG + inspector + merge planner)
 * - merge   -> MergeView      (per-run integrate/finish advice)
 *
 * Legacy #/git, #/git-tree, #/merge deep-links still parse and resolve here
 * (see route.ts + App.tsx), so old links keep working.
 */
import { PageShell, PageHeader } from "../../components/layout/PageShell.js";
import { SegmentedControl } from "../../components/design/SegmentedControl.js";
import { GitChangesView } from "../../components/git/GitChangesView.js";
import { GitTreeView } from "../../components/git/GitTreeView.js";
import { MergeView } from "../../components/git/MergeView.js";

export type SourceTab = "changes" | "tree" | "merge";

type Props = {
  tab: SourceTab;
  runId: string | null;
  onSwitchTab: (tab: SourceTab) => void;
  onSelectRun: (runId: string) => void;
  onOpenMergeRun: (runId: string | null) => void;
  onOpenRun: (runId: string) => void;
};

export function SourcePage({
  tab,
  runId,
  onSwitchTab,
  onSelectRun,
  onOpenMergeRun,
  onOpenRun,
}: Props) {
  return (
    <PageShell variant="fill">
      <PageHeader
        className="mb-4"
        title="Source"
        actions={
          <SegmentedControl<SourceTab>
            options={[
              { value: "changes", label: "Changes" },
              { value: "tree", label: "Tree" },
              { value: "merge", label: "Merge" },
            ]}
            value={tab}
            onChange={onSwitchTab}
          />
        }
      />

      {/* Body region - fills the remaining height. Changes/Merge are
          scroll-style bodies, so they get their own overflow container; Tree
          is already a flex-fill column that scrolls its own three regions. */}
      <div className="flex min-h-0 flex-1 flex-col">
        {tab === "tree" ? (
          <GitTreeView />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === "changes" ? (
              <GitChangesView initialRunId={runId} onSelectRun={onSelectRun} />
            ) : (
              <MergeView
                runId={runId}
                onOpenMergeRun={onOpenMergeRun}
                onOpenRun={onOpenRun}
              />
            )}
          </div>
        )}
      </div>
    </PageShell>
  );
}

import { writeText } from "../utils/fs.js";
import { roadmapTaskReportFile } from "../utils/paths.js";
import type { Comment, RoadmapItem, Task } from "./roadmap-types.js";

export type TaskReportInput = {
  task: Task;
  parent: RoadmapItem | null;
  comments: Comment[];
  proposalId?: string | null;
  allTasks?: readonly Task[];
};

export function renderTaskReport(input: TaskReportInput): string {
  const { task, parent, comments } = input;
  const open = comments.filter((c) => !c.resolved);
  const resolved = comments.filter((c) => c.resolved);
  const others = input.allTasks ?? [];

  const lines: string[] = [];
  lines.push(`# Task Report — ${task.title}`);
  lines.push("");
  lines.push(`- Task ID: \`${task.id}\``);
  lines.push(`- Status: ${task.status}`);
  lines.push(`- Priority: ${task.priority}`);
  lines.push(`- Risk: ${task.riskLevel}`);
  if (parent) {
    lines.push(`- Roadmap item: ${parent.title} (\`${parent.id}\`)`);
  }
  if (task.dependencies.length > 0) {
    lines.push(`- Depends on: ${task.dependencies.map((d) => `\`${d}\``).join(", ")}`);
  }
  if (task.requiredSkills.length > 0) {
    lines.push(`- Skills: ${task.requiredSkills.join(", ")}`);
  }
  if (task.touchedFiles.length > 0) {
    lines.push(`- Likely touched files: ${task.touchedFiles.join(", ")}`);
  }
  lines.push(`- Created: ${task.createdAt}`);
  lines.push(`- Updated: ${task.updatedAt}`);
  lines.push("");

  if (task.description) {
    lines.push(`## Description`);
    lines.push("");
    lines.push(task.description);
    lines.push("");
  }

  lines.push(`## Runs`);
  lines.push("");
  if (task.runIds.length === 0) {
    lines.push(`_No runs yet._`);
  } else {
    for (const r of task.runIds) {
      lines.push(`- \`${r}\` — see \`.amaco/runs/${r}/artifacts/12-final-report.md\``);
    }
    if (task.currentRunId) {
      lines.push(`- Current run: \`${task.currentRunId}\``);
    }
  }
  lines.push("");

  if (task.branchName) {
    lines.push(`## Branch / Worktree`);
    lines.push("");
    lines.push(`- Branch: \`${task.branchName}\``);
    if (task.worktreePath) lines.push(`- Worktree: \`${task.worktreePath}\``);
    lines.push("");
  }

  if (input.proposalId) {
    lines.push(`## Source proposal`);
    lines.push("");
    lines.push(`- Proposal id: \`${input.proposalId}\``);
    lines.push(
      `- Audit: \`.amaco/roadmap/proposals/${input.proposalId}-accepted.json\``,
    );
    lines.push("");
  }

  // Dependencies (blocked by + unlocks). Best-effort given the supplied tasks
  // list — the CLI command always passes the full list.
  const titleStatus = (id: string): { title: string; status: string } | null => {
    const t = others.find((x) => x.id === id);
    if (!t) return null;
    return { title: t.title, status: t.status };
  };
  const blockers = task.dependencies;
  const unlocks = others.filter((t) => t.dependencies.includes(task.id));
  const openBlockers = blockers.filter((id) => {
    const ts = titleStatus(id);
    return !ts || (ts.status !== "done" && ts.status !== "cancelled");
  });

  if (blockers.length > 0 || unlocks.length > 0) {
    lines.push(`## Dependencies`);
    lines.push("");
    if (blockers.length > 0) {
      lines.push(`### Blocked by (${blockers.length})`);
      lines.push("");
      for (const id of blockers) {
        const ts = titleStatus(id);
        if (ts) {
          lines.push(`- \`${id}\` — ${ts.title} _(${ts.status})_`);
        } else {
          lines.push(`- \`${id}\` — _missing_`);
        }
      }
      lines.push("");
      if (openBlockers.length > 0 && task.status !== "done") {
        lines.push(
          `_This task cannot start until ${openBlockers.length} blocker(s) reach done._`,
        );
        lines.push("");
      }
    }
    if (unlocks.length > 0) {
      lines.push(`### Unlocks (${unlocks.length})`);
      lines.push("");
      for (const u of unlocks) {
        lines.push(`- \`${u.id}\` — ${u.title} _(${u.status})_`);
      }
      lines.push("");
    }
  }

  lines.push(`## Comments`);
  lines.push("");
  if (comments.length === 0) {
    lines.push(`_No comments._`);
  } else {
    if (open.length > 0) {
      lines.push(`### Open (${open.length})`);
      lines.push("");
      for (const c of open) {
        lines.push(`- \`${c.target}\`${c.targetRef ? `:\`${c.targetRef}\`` : ""} — ${c.body}`);
      }
      lines.push("");
    }
    if (resolved.length > 0) {
      lines.push(`### Resolved (${resolved.length})`);
      lines.push("");
      for (const c of resolved) {
        lines.push(`- \`${c.target}\` — ${c.body} _(resolved ${c.resolvedAt ?? "?"})_`);
      }
      lines.push("");
    }
  }

  lines.push(`## Final Recommendation`);
  lines.push("");
  if (task.status === "done") {
    lines.push("- The task completed and reached the merge-ready state of its run.");
    lines.push("- Inspect the worktree, review the diff, then merge manually.");
  } else if (task.status === "blocked" || task.status === "failed") {
    lines.push("- The task did not complete cleanly.");
    lines.push("- Read the run's final report and resolve the blocker before re-running.");
  } else if (task.status === "cancelled") {
    lines.push("- The task was cancelled. The worktree (if any) is preserved.");
  } else {
    lines.push("- The task has not reached a terminal state yet.");
  }
  lines.push("");

  return lines.join("\n");
}

export async function writeTaskReport(
  projectRoot: string,
  input: TaskReportInput,
): Promise<string> {
  const target = roadmapTaskReportFile(projectRoot, input.task.id);
  await writeText(target, renderTaskReport(input));
  return target;
}

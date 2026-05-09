import { randomUUID } from "node:crypto";
import { ensureDir, pathExists, readText, writeText } from "../utils/fs.js";
import { schedulerConflictsFile, schedulerDir } from "../utils/paths.js";
import { nowIso } from "../utils/time.js";
import {
  conflictsFileSchema,
  type ConflictsFile,
  type ConflictWarning,
} from "./scheduler-types.js";
import { getDiffSnapshot } from "../core/diff-service.js";
import type { Task } from "../roadmap/roadmap-types.js";

/**
 * Best-effort overlap check. We compare:
 *   - candidate task's declared touchedFiles
 *   - already-running tasks' declared touchedFiles
 *   - already-running tasks' git-diff file lists from their worktrees
 *
 * The result lists overlapping path strings. Globs and prefixes are NOT
 * resolved — V0 does plain substring/equality matching to keep the policy
 * predictable and explainable.
 */
export async function detectConflicts(input: {
  candidate: Task;
  runningTasks: Task[];
}): Promise<{ overlappingFiles: string[]; conflictsWith: string[] }> {
  const candidateFiles = new Set<string>(input.candidate.touchedFiles);

  const overlapping = new Set<string>();
  const conflictsWith = new Set<string>();

  for (const running of input.runningTasks) {
    if (running.id === input.candidate.id) continue;
    const runningFiles = new Set<string>(running.touchedFiles);

    // Pull live diff file list when a worktree exists.
    if (running.worktreePath) {
      try {
        const snap = await getDiffSnapshot({ worktreePath: running.worktreePath });
        for (const f of snap.files) runningFiles.add(f.path);
      } catch {
        // best-effort
      }
    }

    let touched = false;
    for (const f of candidateFiles) {
      if (runningFiles.has(f)) {
        overlapping.add(f);
        touched = true;
      }
    }
    if (touched) conflictsWith.add(running.id);
  }

  return {
    overlappingFiles: [...overlapping].sort(),
    conflictsWith: [...conflictsWith].sort(),
  };
}

export class ConflictsStore {
  constructor(private readonly projectRoot: string) {}

  async read(): Promise<ConflictsFile> {
    const file = schedulerConflictsFile(this.projectRoot);
    if (!(await pathExists(file))) return { warnings: [] };
    const text = await readText(file);
    if (!text.trim()) return { warnings: [] };
    try {
      return conflictsFileSchema.parse(JSON.parse(text));
    } catch {
      return { warnings: [] };
    }
  }

  async write(file: ConflictsFile): Promise<void> {
    const validated = conflictsFileSchema.parse(file);
    await ensureDir(schedulerDir(this.projectRoot));
    await writeText(
      schedulerConflictsFile(this.projectRoot),
      `${JSON.stringify(validated, null, 2)}\n`,
    );
  }

  async record(input: {
    taskId: string;
    conflictsWith: string[];
    overlappingFiles: string[];
    policy: "warn" | "block";
    blocked: boolean;
  }): Promise<ConflictWarning> {
    const warning: ConflictWarning = {
      id: randomUUID(),
      taskId: input.taskId,
      conflictsWith: input.conflictsWith,
      overlappingFiles: input.overlappingFiles,
      policy: input.policy,
      blocked: input.blocked,
      createdAt: nowIso(),
    };
    const file = await this.read();
    file.warnings.push(warning);
    await this.write(file);
    return warning;
  }

  async clearForTask(taskId: string): Promise<void> {
    const file = await this.read();
    file.warnings = file.warnings.filter((w) => w.taskId !== taskId);
    await this.write(file);
  }
}

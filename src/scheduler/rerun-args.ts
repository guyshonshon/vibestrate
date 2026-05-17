// Pure helper: take a persisted run record and derive the `amaco run`
// argv that re-runs the same task with the same options. Used by the
// panel's R-key handler and the `POST /api/runs/:id/retry` route so
// both surfaces stay byte-identical.
//
// The original run state stays on disk untouched — the retry gets a
// fresh runId so the failure trail is preserved for inspection.

export type RerunInput = {
  task: string;
  taskId?: string | null;
  effort?: "low" | "medium" | "high" | null;
  providerOverride?: string | null;
  readOnly?: boolean;
  runtimeSkills?: string[];
  concise?: boolean;
};

export function deriveRerunArgs(run: RerunInput): string[] {
  const argv: string[] = ["run"];
  if (run.taskId) argv.push("--task", run.taskId);
  if (run.effort) argv.push("--effort", run.effort);
  if (run.providerOverride) argv.push("--provider", run.providerOverride);
  if (run.readOnly) argv.push("--read-only");
  if (run.runtimeSkills && run.runtimeSkills.length > 0) {
    argv.push("--skills", run.runtimeSkills.join(","));
  }
  if (run.concise) argv.push("--concise");
  argv.push(run.task);
  return argv;
}

/** Pretty-print argv for toasts / logs. Quotes args with spaces. */
export function formatArgv(argv: string[]): string {
  return argv.map((a) => (a.includes(" ") ? JSON.stringify(a) : a)).join(" ");
}

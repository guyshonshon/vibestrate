// Shared skip decision for a checking step, used by BOTH execution paths.
//
// The linear walk had its own inline `inert_diff` check and the graph frontier
// had none at all, so a derived flow - which is always a graph - could not use
// conditions. One entry point now serves both, which is also the only way the
// two paths cannot drift on a decision about whether a review happens.
//
// Failure direction, restated because it is the whole safety property: a step
// is skipped ONLY on positive evidence that its subject is absent. An
// unreadable diff, an empty change set, a read-only run, or an owner force all
// mean the step RUNS.
import { getWorktreeDiffText, getDiffSnapshot } from "../diff-service.js";
import { extractAddedLines } from "../../policies/policy-engine.js";
import { getCurrentBranch } from "../../git/git.js";
import {
  diffFactsFromPatch,
  evaluateStepCondition,
  type StepCondition,
} from "./step-conditions.js";
import { evaluateReviewDescent } from "./review-descent.js";
import type { ProtectedPathsConfig } from "../../supervisor/protected-paths.js";

export type StepSkipOutcome =
  | { skip: false; because: string }
  | { skip: true; reason: string; files: string[]; message: string };

const CHECKING_KINDS = new Set(["review-turn", "summary-turn"]);

/**
 * Decide whether a step may be skipped on diff evidence.
 *
 * `forcedStepIds` is the owner's control surface (`--flow-force`). It can only
 * ever ADD work back: forcing a step runs it, and there is deliberately no
 * inverse here that could disarm a review the condition wanted to keep.
 */
export async function evaluateStepSkip(input: {
  step: { id: string; kind: string; skipWhen?: string | null };
  worktreePath: string | null;
  projectRoot: string;
  readOnly: boolean;
  policies: ProtectedPathsConfig | undefined;
  forcedStepIds?: ReadonlySet<string>;
}): Promise<StepSkipOutcome> {
  const { step } = input;
  if (!step.skipWhen) return { skip: false, because: "no condition declared" };
  if (!CHECKING_KINDS.has(step.kind)) {
    return { skip: false, because: "only a checking step may be skipped" };
  }
  if (input.readOnly) {
    // A read-only run has no diff, so "absence" would be vacuously true of
    // everything and every check would descend.
    return { skip: false, because: "read-only run has no diff to prove absence with" };
  }
  if (input.forcedStepIds?.has(step.id)) {
    return { skip: false, because: "forced on by the owner (--flow-force)" };
  }
  if (!input.worktreePath) {
    return { skip: false, because: "no worktree, so no evidence" };
  }

  try {
    // Resolved once, above the branch: both readers below must judge the SAME
    // change. The snapshot used to default to HEAD, so an agent that committed
    // its work inside its own worktree emptied the file list and the descent
    // read the leftover dirty file as positive evidence of a prose-only change.
    const baseBranch = await getCurrentBranch(input.projectRoot);
    if (step.skipWhen === "inert_diff") {
      const snapshot = await getDiffSnapshot({
        worktreePath: input.worktreePath,
        baseBranch,
      });
      const descent = evaluateReviewDescent(
        snapshot.files.map((f) => f.path),
        input.policies,
      );
      return descent.skip
        ? {
            skip: true,
            reason: "inert_diff",
            files: descent.files,
            message: `${descent.files.length} strict-prose, unprotected file(s) changed`,
          }
        : { skip: false, because: "the change is not strict prose" };
    }

    const [patch, snapshot] = await Promise.all([
      getWorktreeDiffText({ worktreePath: input.worktreePath, baseBranch }),
      getDiffSnapshot({ worktreePath: input.worktreePath, baseBranch }),
    ]);
    const facts = diffFactsFromPatch(
      patch,
      snapshot.files.map((f) => f.path),
      extractAddedLines,
    );
    const decision = evaluateStepCondition(step.skipWhen as StepCondition, facts);
    return decision.skip
      ? {
          skip: true,
          reason: step.skipWhen,
          files: decision.evidence.files,
          message: decision.evidence.reason,
        }
      : { skip: false, because: decision.because };
  } catch (err) {
    // A diff we cannot read is uncertainty, and uncertainty runs the step.
    return {
      skip: false,
      because: `diff unreadable, so the step runs: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }
}

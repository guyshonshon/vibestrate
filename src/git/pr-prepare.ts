// Everything needed to open a pull request, except the two commands that leave
// the machine.
//
// WHY THIS IS A PREPARER AND NOT `gh pr create`
//
// Opening a PR strictly requires pushing: GitHub's compare needs the head ref
// to exist on the remote, so "create the PR without pushing" is not a thing.
// That makes it a straight trade, and the trade is bad.
//
// The Action Broker already calls `git.merge` "the most irreversible effect"
// and fails it closed (src/safety/action-broker.ts). A push is strictly worse
// than that: CI fires, reviewers are notified, secret scanners index the diff,
// forks and mirrors copy it. A force-push rewrites the ref, not the fact.
//
// And a confirmation token would not be the gate it looks like. A code-writing
// seat runs with `allowShell: true` on the host by default, so the agent has a
// shell, the repo's remotes and the user's credentials - and any token this
// command required would be published in `--help`, in docs/content, and in the
// compiled consult corpus. The password would ship with the lock.
//
// So Vibestrate still never pushes. What it does instead is the part that is
// actually tedious: work out the branch and base, write the PR body from what
// the run recorded, sweep the whole outgoing diff for secrets, and hand over one
// line to paste. The manual logistics were the pain; the nine characters were
// not.
//
// THE SECRET SWEEP IS THE REAL WIN. `checkPatchSafety` runs per-turn on
// incremental diffs and its patterns are deliberately underfit to avoid
// false-positive patch blocks. A secret that slips that is harmless on a local
// branch and unrecoverable the instant it reaches a repo GitHub scans. This
// reuses the publish-grade set (`assertNoHardSecrets`), over the FULL branch
// diff against the base - the exact bytes that would leave.
import { assertNoHardSecrets } from "../flows/hub/publish-guards.js";

export type PrPreparation = {
  runId: string;
  branch: string;
  base: string;
  title: string;
  body: string;
  /** Reasons the outgoing diff must not be pushed as-is. Non-empty = refuse. */
  secretFindings: string[];
  /** The command the user runs, if they choose to. */
  command: string;
};

export type AssuranceSummary = {
  verdict: string;
  summary?: string;
  validation?: { status: string; passed: number; total: number };
  review?: { status: string; independence?: "cross-model" | "single-profile" };
};

/** First line of the task, trimmed to a sane PR title length. */
export function prTitleFrom(task: string): string {
  const line = task.split("\n")[0]?.trim() ?? "";
  const clean = line.replace(/\s+/g, " ");
  return clean.length > 72 ? `${clean.slice(0, 69)}...` : clean || "Vibestrate change";
}

/**
 * The PR body, written from what the run actually recorded.
 *
 * This is the value: a reviewer opening the PR learns which models ran, whether
 * the review was independent, and which checks actually passed - the questions
 * they would otherwise ask in a comment. `single-profile` is stated plainly
 * rather than dressed up, because a self-check presented as review is the one
 * thing this product exists to stop.
 */
export function prBodyFrom(input: {
  runId: string;
  task: string;
  assurance: AssuranceSummary | null;
  filesTouched: number | null;
}): string {
  const lines: string[] = [];
  lines.push(input.task.trim(), "");
  lines.push("---", "");
  const a = input.assurance;
  if (!a) {
    lines.push("_No assurance record for this run - it was not produced, or was pruned._");
  } else {
    lines.push(`**Verdict:** ${a.verdict}`);
    if (a.summary) lines.push("", a.summary);
    lines.push("");
    if (a.validation) {
      lines.push(
        `**Checks:** ${a.validation.status} (${a.validation.passed}/${a.validation.total} passed)`,
      );
    }
    if (a.review) {
      const independence =
        a.review.independence === "cross-model"
          ? "reviewed by a different model than wrote it"
          : a.review.independence === "single-profile"
            ? "**self-check only** - one model wrote and reviewed this"
            : null;
      lines.push(`**Review:** ${a.review.status}${independence ? ` - ${independence}` : ""}`);
    }
  }
  if (input.filesTouched !== null) lines.push("", `**Files touched:** ${input.filesTouched}`);
  lines.push("", `<sub>Prepared by Vibestrate from run \`${input.runId}\`.</sub>`);
  return lines.join("\n");
}

/**
 * Prepare, and refuse loudly on a secret.
 *
 * `secretFindings` being non-empty is a refusal, not a warning: the caller must
 * not print a push command next to "this diff contains what looks like a live
 * key". Recoverable to fix, unrecoverable to push.
 */
export function preparePr(input: {
  runId: string;
  task: string;
  branch: string;
  base: string;
  /** The full diff of `branch` against `base` - the exact bytes that would leave. */
  diff: string;
  assurance: AssuranceSummary | null;
  filesTouched: number | null;
}): PrPreparation {
  const title = prTitleFrom(input.task);
  const body = prBodyFrom({
    runId: input.runId,
    task: input.task,
    assurance: input.assurance,
    filesTouched: input.filesTouched,
  });
  // The whole outgoing diff, not the incremental per-turn one the run already
  // checked. This is the last point before those bytes could become public.
  const secretFindings = assertNoHardSecrets(input.diff);
  return {
    runId: input.runId,
    branch: input.branch,
    base: input.base,
    title,
    body,
    secretFindings,
    command: `gh pr create --base ${input.base} --head ${input.branch} --title ${JSON.stringify(title)} --body-file .vibestrate/runs/${input.runId}/pr-body.md`,
  };
}

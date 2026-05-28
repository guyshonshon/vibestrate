import { Command } from "commander";
import { detectProject } from "../../project/project-detector.js";
import { buildRunReplay, RunReplayError } from "../../core/run-replay-service.js";
import { color, header, indent } from "../ui/format.js";
import { isVibestrateError } from "../../utils/errors.js";

/**
 * `vibe replay <runId>` — read-only inspector for a persisted run. Calls
 * the same projection the dashboard's Replay tab uses (no shared mutation,
 * no provider calls, no worktree writes). Default output is a short text
 * summary; `--json` dumps the full projection for piping into jq or saving
 * to a file. Mirrors the read-only posture of the UI surface.
 */
export function buildReplayCommand(): Command {
  const cmd = new Command("replay")
    .description(
      "Read-only inspector for a persisted run (mirrors the Replay tab in the dashboard).",
    )
    .argument("<runId>", "id of the run to replay")
    .option("--json", "emit the full replay projection as JSON")
    .action(async (runId: string, opts: { json?: boolean }) => {
      const exit = await runReplay(runId, opts);
      process.exit(exit);
    });
  return cmd;
}

async function runReplay(
  runId: string,
  opts: { json?: boolean },
): Promise<number> {
  const detected = await detectProject(process.cwd());
  let replay;
  try {
    replay = await buildRunReplay(detected.projectRoot, runId);
  } catch (err) {
    if (err instanceof RunReplayError) {
      console.error(color.red(err.message));
      return err.statusCode === 404 ? 1 : 2;
    }
    if (isVibestrateError(err)) {
      console.error(color.red(err.message));
      return 2;
    }
    throw err;
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify(replay, null, 2));
    process.stdout.write("\n");
    return 0;
  }

  console.log(
    header(
      `Run ${replay.runId}${replay.task ? ` — ${replay.task}` : ""}`,
    ),
  );
  console.log(color.dim(`  status: ${replay.finalStatus}`));
  if (replay.branchName)
    console.log(color.dim(`  branch: ${replay.branchName}`));
  if (replay.worktreePath)
    console.log(color.dim(`  worktree: ${replay.worktreePath}`));
  console.log(
    color.dim(
      `  ${replay.events.length} event(s)${
        replay.truncation.truncated
          ? color.yellow(
              ` (truncated from ${replay.truncation.totalEventCount})`,
            )
          : ""
      }`,
    ),
  );
  console.log("");

  const phasesWithEvents = replay.phases.filter(
    (p) => p.eventIndices.length > 0,
  );
  if (phasesWithEvents.length > 0) {
    console.log(header("Phases"));
    for (const p of phasesWithEvents) {
      console.log(
        indent(`${p.label.padEnd(18)} ${color.dim(String(p.eventIndices.length))}`),
      );
    }
    console.log("");
  }

  if (replay.approvals.length > 0) {
    console.log(header(`Approvals (${replay.approvals.length})`));
    for (const a of replay.approvals) {
      console.log(
        indent(
          `${a.status.padEnd(9)} ${a.stageId} · ${a.roleId} · risk ${a.riskLevel} · ${a.source}`,
        ),
      );
    }
    console.log("");
  }

  if (replay.suggestions.length > 0) {
    console.log(header(`Suggestions (${replay.suggestions.length})`));
    for (const s of replay.suggestions) {
      console.log(
        indent(`${s.status.padEnd(18)} ${s.title} ${color.dim(`(${s.source})`)}`),
      );
    }
    console.log("");
  }

  if (replay.bundles.length > 0) {
    console.log(header(`Review bundles (${replay.bundles.length})`));
    for (const b of replay.bundles) {
      console.log(
        indent(
          `${b.status.padEnd(18)} ${b.title} ${color.dim(`(${b.suggestionIds.length} suggestions)`)}`,
        ),
      );
    }
    console.log("");
  }

  if (replay.policyRefusals.length > 0) {
    console.log(
      header(`Policy refusals (${replay.policyRefusals.length})`),
    );
    for (const r of replay.policyRefusals) {
      console.log(
        indent(`${r.ruleId.padEnd(20)} ${r.surface} · ${r.message}`),
      );
    }
    console.log("");
  }

  if (replay.notifications.length > 0) {
    console.log(
      header(`Notifications (${replay.notifications.length})`),
    );
    for (const n of replay.notifications) {
      console.log(
        indent(`${n.severity.padEnd(9)} ${n.title} ${color.dim(`(${n.category})`)}`),
      );
    }
    console.log("");
  }

  if (replay.terminalSessions.length > 0) {
    console.log(
      header(`Terminal sessions (${replay.terminalSessions.length})`),
    );
    for (const t of replay.terminalSessions) {
      const closed = t.closedAt
        ? `closed (exit ${t.exitCode ?? "?"})`
        : "open";
      console.log(indent(`${t.id.padEnd(20)} ${closed} · ${t.cwd}`));
    }
    console.log(
      indent(
        color.dim(
          "Metadata only — Vibestrate never persists terminal stdout/stderr.",
        ),
      ),
    );
    console.log("");
  }

  if (replay.metrics) {
    console.log(header("Runtime metrics"));
    console.log(
      indent(
        color.dim(
          `duration ${replay.metrics.totalDurationMs} ms · provider calls ${replay.metrics.totalProviderCalls} · review loops ${replay.metrics.reviewLoopCount}`,
        ),
      ),
    );
    if (
      replay.metrics.filesChanged !== null ||
      replay.metrics.diffInsertions !== null
    ) {
      console.log(
        indent(
          color.dim(
            `files changed ${replay.metrics.filesChanged ?? "?"} · +${
              replay.metrics.diffInsertions ?? "?"
            } -${replay.metrics.diffDeletions ?? "?"}`,
          ),
        ),
      );
    }
    console.log("");
  }

  if (replay.missingOrMalformed.length > 0) {
    console.log(
      color.yellow(
        `Skipped ${replay.missingOrMalformed.length} file(s) while building replay:`,
      ),
    );
    for (const m of replay.missingOrMalformed) {
      console.log(indent(color.dim(`${m.file}: ${m.reason}`)));
    }
    console.log("");
  }

  console.log(
    color.dim(
      `Hint: open this run in the dashboard at #/runs/${replay.runId}?tab=replay for the scrubbable timeline.`,
    ),
  );

  return 0;
}

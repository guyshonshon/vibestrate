import { detectProject } from "../../../project/project-detector.js";
import { ApprovalService } from "../../../core/approval-service.js";
import { EventLog } from "../../../core/event-log.js";
import { color, indent, symbol } from "../../ui/format.js";

type DecideKind = "approve" | "reject" | "request-changes";

export async function runApprovalsDecide(
  kind: DecideKind,
  runId: string,
  approvalId: string,
  opts: { note?: string; guidance?: string },
): Promise<number> {
  if (!runId || !approvalId) {
    console.error(`${symbol.fail()} Both run id and approval id are required.`);
    return 1;
  }
  const detected = await detectProject(process.cwd());
  const svc = new ApprovalService(detected.projectRoot, runId);
  const before = await svc.get(approvalId);
  if (!before) {
    console.error(
      `${symbol.fail()} No approval ${color.bold(approvalId)} on run ${color.bold(runId)}.`,
    );
    return 1;
  }
  if (before.status !== "pending") {
    console.error(
      `${symbol.fail()} Approval is already ${color.bold(before.status)}; not changing it.`,
    );
    return 1;
  }
  if (kind === "request-changes") {
    // Only an agent-requested gate has a turn to re-run with the guidance; a
    // policy gate has none, so fail closed (approve or reject it instead).
    if (before.source === "policy") {
      console.error(
        `${symbol.fail()} Request-changes is only for agent-requested gates; approve or reject this policy gate.`,
      );
      return 1;
    }
    if (!opts.guidance || !opts.guidance.trim()) {
      console.error(
        `${symbol.fail()} Request-changes needs guidance: pass --guidance "what to change".`,
      );
      return 1;
    }
  }
  try {
    const updated =
      kind === "approve"
        ? await svc.approve({ approvalId, note: opts.note ?? null })
        : kind === "reject"
          ? await svc.reject({ approvalId, note: opts.note ?? null })
          : await svc.requestChanges({ approvalId, guidance: opts.guidance! });

    // Log to event stream so the running orchestrator (and dashboard SSE) sees it.
    // The raw guidance is never logged - the orchestrator redacts it before use.
    const log = new EventLog(detected.projectRoot, runId);
    await log.append({
      type:
        kind === "approve"
          ? "approval.approved"
          : kind === "reject"
            ? "approval.rejected"
            : "approval.changes_requested",
      message: `Approval ${approvalId} ${kind === "request-changes" ? "returned for changes" : `${kind}d`} via CLI.`,
      data: { approvalId, decisionNote: opts.note ?? null },
    });

    const verb =
      kind === "approve" ? "Approved" : kind === "reject" ? "Rejected" : "Returned for changes";
    console.log(`${symbol.ok()} ${verb} approval ${color.bold(approvalId)}.`);
    console.log(indent(`stage: ${updated.stageId} · agent: ${updated.roleId}`));
    if (updated.decisionNote)
      console.log(indent(color.dim(`note: ${updated.decisionNote}`)));
    if (kind === "approve") {
      console.log(
        indent(
          color.dim("If `vibe run` is still attached, the run will resume automatically."),
        ),
      );
    } else if (kind === "request-changes") {
      console.log(
        indent(
          color.dim(
            "If `vibe run` is still attached, the stage re-runs with your guidance.",
          ),
        ),
      );
    } else {
      console.log(
        indent(color.dim("The run will be marked `blocked` and stop at the current stage.")),
      );
    }
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}

import { detectProject } from "../../../project/project-detector.js";
import { ApprovalService } from "../../../core/approval-service.js";
import { EventLog } from "../../../core/event-log.js";
import { color, indent, symbol } from "../../ui/format.js";

type DecideKind = "approve" | "reject";

export async function runApprovalsDecide(
  kind: DecideKind,
  runId: string,
  approvalId: string,
  opts: { note?: string },
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
  try {
    const updated =
      kind === "approve"
        ? await svc.approve({ approvalId, note: opts.note ?? null })
        : await svc.reject({ approvalId, note: opts.note ?? null });

    // Log to event stream so the running orchestrator (and dashboard SSE) sees it.
    const log = new EventLog(detected.projectRoot, runId);
    await log.append({
      type: kind === "approve" ? "approval.approved" : "approval.rejected",
      message: `Approval ${approvalId} ${kind === "approve" ? "approved" : "rejected"} via CLI.`,
      data: { approvalId, decisionNote: opts.note ?? null },
    });

    const verb = kind === "approve" ? "Approved" : "Rejected";
    console.log(`${symbol.ok()} ${verb} approval ${color.bold(approvalId)}.`);
    console.log(
      indent(`stage: ${updated.stageId} · agent: ${updated.agentId}`),
    );
    if (updated.decisionNote)
      console.log(indent(color.dim(`note: ${updated.decisionNote}`)));
    if (kind === "approve") {
      console.log(
        indent(
          color.dim(
            "If `amaco run` is still attached, the run will resume automatically.",
          ),
        ),
      );
    } else {
      console.log(
        indent(
          color.dim(
            "The run will be marked `blocked` and stop at the current stage.",
          ),
        ),
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

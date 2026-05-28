import { detectProject } from "../../../project/project-detector.js";
import { ApprovalService } from "../../../core/approval-service.js";
import { color, header, indent, symbol } from "../../ui/format.js";

export async function runApprovalsShow(
  runId: string,
  approvalId: string,
  opts: { json?: boolean },
): Promise<number> {
  if (!runId || !approvalId) {
    console.error(`${symbol.fail()} Both run id and approval id are required.`);
    return 1;
  }
  const detected = await detectProject(process.cwd());
  const svc = new ApprovalService(detected.projectRoot, runId);
  const a = await svc.get(approvalId);
  if (!a) {
    console.error(
      `${symbol.fail()} No approval ${color.bold(approvalId)} on run ${color.bold(runId)}.`,
    );
    return 1;
  }
  if (opts.json) {
    console.log(JSON.stringify(a, null, 2));
    return 0;
  }
  console.log(header(`Approval ${a.id}`));
  console.log(indent(`status: ${color.bold(a.status)}`));
  console.log(indent(`stage: ${a.stageId}`));
  console.log(indent(`agent: ${a.roleId}`));
  console.log(indent(`risk: ${a.riskLevel}`));
  if (a.reason) console.log(indent(`reason: ${a.reason}`));
  if (a.requestedAction)
    console.log(indent(`requested action: ${a.requestedAction}`));
  if (a.sourceArtifactPath)
    console.log(indent(color.dim(`source artifact: ${a.sourceArtifactPath}`)));
  if (a.decisionNote)
    console.log(indent(color.dim(`decision note: ${a.decisionNote}`)));
  console.log(indent(color.dim(`created: ${a.createdAt}`)));
  if (a.resolvedAt)
    console.log(
      indent(
        color.dim(
          `resolved: ${a.resolvedAt} by ${a.resolvedBy ?? "local-user"}`,
        ),
      ),
    );
  if (a.status === "pending") {
    console.log("");
    console.log(
      `${symbol.arrow()} Approve: ${color.bold(`vibe approvals approve ${runId} ${a.id} --note "..."`)}`,
    );
    console.log(
      `${symbol.arrow()} Reject:  ${color.bold(`vibe approvals reject ${runId} ${a.id} --note "..."`)}`,
    );
  }
  return 0;
}

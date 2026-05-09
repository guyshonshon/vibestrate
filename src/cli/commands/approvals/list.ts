import { detectProject } from "../../../project/project-detector.js";
import { ApprovalService } from "../../../core/approval-service.js";
import { color, header, indent, symbol } from "../../ui/format.js";

export async function runApprovalsList(
  runId: string,
  opts: { json?: boolean },
): Promise<number> {
  if (!runId) {
    console.error(`${symbol.fail()} Run id is required.`);
    console.error(
      `  ${symbol.arrow()} ${color.bold("amaco approvals list <runId>")}`,
    );
    return 1;
  }
  const detected = await detectProject(process.cwd());
  const svc = new ApprovalService(detected.projectRoot, runId);
  const all = await svc.list();

  if (opts.json) {
    console.log(JSON.stringify(all, null, 2));
    return 0;
  }

  if (all.length === 0) {
    console.log(`No approval requests for run ${color.dim(runId)}.`);
    return 0;
  }

  console.log(header(`Approvals for ${runId}`));
  console.log("");
  for (const a of all) {
    const sym =
      a.status === "pending"
        ? symbol.warn()
        : a.status === "approved"
          ? symbol.ok()
          : symbol.fail();
    console.log(`${sym} ${color.bold(a.id)}  ${color.dim(a.status)}`);
    console.log(indent(`stage: ${a.stageId} · agent: ${a.agentId}`));
    if (a.reason) console.log(indent(`reason: ${a.reason}`));
    if (a.requestedAction)
      console.log(indent(color.dim(`requested: ${a.requestedAction}`)));
    if (a.decisionNote)
      console.log(indent(color.dim(`note: ${a.decisionNote}`)));
    console.log(
      indent(
        color.dim(
          `created: ${a.createdAt}${a.resolvedAt ? ` · resolved: ${a.resolvedAt}` : ""}`,
        ),
      ),
    );
    console.log("");
  }
  return 0;
}

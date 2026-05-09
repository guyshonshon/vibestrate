import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { ApprovalService } from "../../core/approval-service.js";
import { EventLog } from "../../core/event-log.js";
import { assertSafeRunId, HttpError } from "../security.js";

const decideBody = z.object({ note: z.string().optional() });

export type ApprovalsRoutesDeps = {
  projectRoot: string;
};

export async function registerApprovalsRoutes(
  app: FastifyInstance,
  deps: ApprovalsRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;

  app.get<{ Params: { runId: string } }>(
    "/api/runs/:runId/approvals",
    async (req) => {
      assertSafeRunId(req.params.runId);
      const svc = new ApprovalService(projectRoot, req.params.runId);
      const approvals = await svc.list();
      return { approvals };
    },
  );

  app.get<{ Params: { runId: string; approvalId: string } }>(
    "/api/runs/:runId/approvals/:approvalId",
    async (req) => {
      assertSafeRunId(req.params.runId);
      const svc = new ApprovalService(projectRoot, req.params.runId);
      const a = await svc.get(req.params.approvalId);
      if (!a) throw new HttpError(404, "Approval not found.");
      return { approval: a };
    },
  );

  app.post<{
    Params: { runId: string; approvalId: string };
    Body: unknown;
  }>("/api/runs/:runId/approvals/:approvalId/approve", async (req) => {
    assertSafeRunId(req.params.runId);
    const parsed = decideBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new HttpError(400, "Invalid body for approval decision.");
    }
    const svc = new ApprovalService(projectRoot, req.params.runId);
    let updated;
    try {
      updated = await svc.approve({
        approvalId: req.params.approvalId,
        decidedBy: "local-user",
        note: parsed.data.note ?? null,
      });
    } catch (err) {
      throw new HttpError(409, err instanceof Error ? err.message : String(err));
    }
    const log = new EventLog(projectRoot, req.params.runId);
    await log.append({
      type: "approval.approved",
      message: `Approval ${updated.id} approved via dashboard.`,
      data: { approvalId: updated.id, decisionNote: updated.decisionNote },
    });
    return { approval: updated };
  });

  app.post<{
    Params: { runId: string; approvalId: string };
    Body: unknown;
  }>("/api/runs/:runId/approvals/:approvalId/reject", async (req) => {
    assertSafeRunId(req.params.runId);
    const parsed = decideBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new HttpError(400, "Invalid body for approval decision.");
    }
    const svc = new ApprovalService(projectRoot, req.params.runId);
    let updated;
    try {
      updated = await svc.reject({
        approvalId: req.params.approvalId,
        decidedBy: "local-user",
        note: parsed.data.note ?? null,
      });
    } catch (err) {
      throw new HttpError(409, err instanceof Error ? err.message : String(err));
    }
    const log = new EventLog(projectRoot, req.params.runId);
    await log.append({
      type: "approval.rejected",
      message: `Approval ${updated.id} rejected via dashboard.`,
      data: { approvalId: updated.id, decisionNote: updated.decisionNote },
    });
    return { approval: updated };
  });
}

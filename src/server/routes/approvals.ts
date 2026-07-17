import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { ApprovalService } from "../../core/run/approval-service.js";
import { EventLog } from "../../core/stores/event-log.js";
import { assertSafeRunId, HttpError } from "../security.js";

const decideBody = z.object({ note: z.string().optional() });
const requestChangesBody = z.object({ guidance: z.string() });

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

  // Request changes: the human returns free-form guidance and the run re-runs
  // the gated stage forward with it. Only agent-requested gates have a turn to
  // re-run, so a policy gate is REFUSED (fail closed) - approve or reject it.
  // The raw guidance never enters the event log; the orchestrator redacts it
  // before it reaches any prompt.
  app.post<{
    Params: { runId: string; approvalId: string };
    Body: unknown;
  }>("/api/runs/:runId/approvals/:approvalId/request-changes", async (req) => {
    assertSafeRunId(req.params.runId);
    const parsed = requestChangesBody.safeParse(req.body ?? {});
    if (!parsed.success || !parsed.data.guidance.trim()) {
      throw new HttpError(400, "Request-changes needs non-empty guidance.");
    }
    const svc = new ApprovalService(projectRoot, req.params.runId);
    const existing = await svc.get(req.params.approvalId);
    if (!existing) throw new HttpError(404, "Approval not found.");
    if (existing.source === "policy") {
      throw new HttpError(
        400,
        "Request-changes is only available for agent-requested gates; approve or reject a policy gate.",
      );
    }
    let updated;
    try {
      updated = await svc.requestChanges({
        approvalId: req.params.approvalId,
        guidance: parsed.data.guidance,
        decidedBy: "local-user",
      });
    } catch (err) {
      throw new HttpError(409, err instanceof Error ? err.message : String(err));
    }
    const log = new EventLog(projectRoot, req.params.runId);
    await log.append({
      type: "approval.changes_requested",
      message: `Approval ${updated.id} returned for changes via dashboard.`,
      data: { approvalId: updated.id },
    });
    return { approval: updated };
  });
}

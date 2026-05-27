import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { ApprovalService } from "../src/core/approval-service.js";
import { detectApprovalRequest } from "../src/core/approval-types.js";

async function tempProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "amaco-approval-"));
  await fs.mkdir(path.join(dir, ".amaco", "runs", "r1"), { recursive: true });
  return dir;
}

describe("detectApprovalRequest", () => {
  it("returns required=true for HUMAN_APPROVAL: REQUIRED", () => {
    const r = detectApprovalRequest("some text\n\nHUMAN_APPROVAL: REQUIRED\n");
    expect(r.required).toBe(true);
  });
  it("captures optional reason on next line", () => {
    const r = detectApprovalRequest(
      "HUMAN_APPROVAL: REQUIRED\nHUMAN_APPROVAL_REASON: touches auth boundary\n",
    );
    expect(r.required).toBe(true);
    expect(r.reason).toBe("touches auth boundary");
  });
  it("does not match unrelated mentions", () => {
    const r = detectApprovalRequest(
      "Discussion of HUMAN_APPROVAL is not the marker line.",
    );
    expect(r.required).toBe(false);
  });
  it("returns required=false for empty input", () => {
    expect(detectApprovalRequest("").required).toBe(false);
  });
});

describe("ApprovalService", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await tempProject();
  });

  it("create + list + get returns the same record", async () => {
    const svc = new ApprovalService(projectRoot, "r1");
    const a = await svc.create({
      stageId: "architecting",
      roleId: "architect",
      reason: "needs human eyes",
      prompt: null,
      sourceArtifactPath: "artifacts/04-architecture.md",
      requestedAction: "continue past architecting stage",
    });
    expect(a.status).toBe("pending");
    const list = await svc.list();
    expect(list).toHaveLength(1);
    expect((await svc.get(a.id))?.id).toBe(a.id);
    expect((await svc.firstPending())?.id).toBe(a.id);
  });

  it("approve transitions pending → approved with note + resolvedBy", async () => {
    const svc = new ApprovalService(projectRoot, "r1");
    const a = await svc.create({
      stageId: "reviewing",
      roleId: "reviewer",
      reason: null,
      prompt: null,
      sourceArtifactPath: null,
      requestedAction: null,
    });
    const updated = await svc.approve({
      approvalId: a.id,
      note: "looked at it",
    });
    expect(updated.status).toBe("approved");
    expect(updated.resolvedBy).toBe("local-user");
    expect(updated.decisionNote).toBe("looked at it");
    expect(updated.resolvedAt).toBeTruthy();
  });

  it("reject transitions pending → rejected", async () => {
    const svc = new ApprovalService(projectRoot, "r1");
    const a = await svc.create({
      stageId: "reviewing",
      roleId: "reviewer",
      reason: null,
      prompt: null,
      sourceArtifactPath: null,
      requestedAction: null,
    });
    const updated = await svc.reject({ approvalId: a.id, note: "not now" });
    expect(updated.status).toBe("rejected");
    expect(updated.decisionNote).toBe("not now");
  });

  it("refuses to approve an already approved request", async () => {
    const svc = new ApprovalService(projectRoot, "r1");
    const a = await svc.create({
      stageId: "x",
      roleId: "y",
      reason: null,
      prompt: null,
      sourceArtifactPath: null,
      requestedAction: null,
    });
    await svc.approve({ approvalId: a.id });
    await expect(svc.approve({ approvalId: a.id })).rejects.toThrow();
  });

  it("refuses to reject an already rejected request", async () => {
    const svc = new ApprovalService(projectRoot, "r1");
    const a = await svc.create({
      stageId: "x",
      roleId: "y",
      reason: null,
      prompt: null,
      sourceArtifactPath: null,
      requestedAction: null,
    });
    await svc.reject({ approvalId: a.id });
    await expect(svc.reject({ approvalId: a.id })).rejects.toThrow();
  });

  it("persists to approvals.json so a fresh service instance sees the record", async () => {
    const a = await new ApprovalService(projectRoot, "r1").create({
      stageId: "x",
      roleId: "y",
      reason: null,
      prompt: null,
      sourceArtifactPath: null,
      requestedAction: null,
    });
    const fresh = new ApprovalService(projectRoot, "r1");
    const round = await fresh.get(a.id);
    expect(round?.id).toBe(a.id);
    const fileBody = await fs.readFile(
      path.join(projectRoot, ".amaco", "runs", "r1", "approvals.json"),
      "utf8",
    );
    expect(fileBody).toContain(a.id);
  });

  it("waitForResolution returns immediately if already resolved", async () => {
    const svc = new ApprovalService(projectRoot, "r1");
    const a = await svc.create({
      stageId: "x",
      roleId: "y",
      reason: null,
      prompt: null,
      sourceArtifactPath: null,
      requestedAction: null,
    });
    await svc.approve({ approvalId: a.id });
    const r = await svc.waitForResolution(a.id, { pollMs: 50 });
    expect(r.status).toBe("approved");
  });

  it("waitForResolution polls and returns when approved out-of-band", async () => {
    const svc = new ApprovalService(projectRoot, "r1");
    const a = await svc.create({
      stageId: "x",
      roleId: "y",
      reason: null,
      prompt: null,
      sourceArtifactPath: null,
      requestedAction: null,
    });
    setTimeout(() => {
      void svc.approve({ approvalId: a.id, note: "lgtm" });
    }, 50);
    const r = await svc.waitForResolution(a.id, { pollMs: 25 });
    expect(r.status).toBe("approved");
    expect(r.decisionNote).toBe("lgtm");
  });

  it("waitForResolution honours timeout by marking expired", async () => {
    const svc = new ApprovalService(projectRoot, "r1");
    const a = await svc.create({
      stageId: "x",
      roleId: "y",
      reason: null,
      prompt: null,
      sourceArtifactPath: null,
      requestedAction: null,
    });
    const r = await svc.waitForResolution(a.id, {
      pollMs: 25,
      timeoutMs: 80,
    });
    expect(r.status).toBe("expired");
  });
});

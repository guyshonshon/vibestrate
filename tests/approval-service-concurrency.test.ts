import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { ApprovalService } from "../src/core/run/approval-service.js";

async function makeRun(): Promise<{ dir: string; svc: ApprovalService }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-appr-conc-"));
  await fs.mkdir(path.join(dir, ".vibestrate", "runs", "run1"), { recursive: true });
  return { dir, svc: new ApprovalService(dir, "run1") };
}

describe("ApprovalService concurrency", () => {
  it("serializes concurrent decisions on one approval: exactly one wins", async () => {
    const { dir, svc } = await makeRun();
    try {
      const req = await svc.create({
        stageId: "architecting",
        roleId: "architect",
        reason: null,
        prompt: null,
        sourceArtifactPath: null,
        requestedAction: null,
      });

      // Five deciders race on the same pending approval (e.g. dashboard + CLI +
      // retries). The check-then-write in resolve() must be atomic, so exactly
      // one resolution takes effect and the rest fail loudly - never a silent
      // last-writer-wins that clobbers the winner's decision/guidance.
      const results = await Promise.allSettled([
        svc.approve({ approvalId: req.id, note: "approve" }),
        svc.reject({ approvalId: req.id, note: "reject" }),
        svc.requestChanges({ approvalId: req.id, guidance: "change A" }),
        svc.requestChanges({ approvalId: req.id, guidance: "change B" }),
        svc.approve({ approvalId: req.id, note: "approve 2" }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(4);

      // The persisted record matches the single winner (not a torn mix).
      const persisted = await svc.get(req.id);
      expect(persisted).not.toBeNull();
      expect(persisted!.status).not.toBe("pending");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

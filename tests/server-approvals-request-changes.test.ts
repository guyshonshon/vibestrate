import { describe, it, expect, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";
import { ApprovalService } from "../src/core/run/approval-service.js";

const noProvider: ProviderDetectionRunner = async () => ({ exitCode: 127, stdout: "", stderr: "" });

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-appr-rc-http-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  return dir;
}

async function seedApproval(dir: string, runId: string, source: "agent" | "policy") {
  await fs.mkdir(path.join(dir, ".vibestrate", "runs", runId), { recursive: true });
  const svc = new ApprovalService(dir, runId);
  return svc.create({
    stageId: "architecting",
    stepId: "architect",
    roleId: "architect",
    reason: "needs clarification",
    prompt: null,
    sourceArtifactPath: null,
    requestedAction: "clarify",
    source,
  });
}

let server: StartedServer | null = null;
afterEach(async () => {
  if (server) await server.close();
  server = null;
});

const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("server: request-changes route", () => {
  it("records changes_requested with guidance for an agent-requested gate", async () => {
    const dir = await makeProject();
    const req = await seedApproval(dir, "run1", "agent");
    server = await startServer({ projectRoot: dir, port: 0, host: "127.0.0.1" });

    const res = await post(
      `${server.url}/api/runs/run1/approvals/${req.id}/request-changes`,
      { guidance: "use approach B, not A" },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { approval: { status: string; guidance: string } };
    expect(body.approval.status).toBe("changes_requested");
    expect(body.approval.guidance).toBe("use approach B, not A");
  });

  it("refuses request-changes on a POLICY gate (fail closed)", async () => {
    const dir = await makeProject();
    const req = await seedApproval(dir, "run1", "policy");
    server = await startServer({ projectRoot: dir, port: 0, host: "127.0.0.1" });

    const res = await post(
      `${server.url}/api/runs/run1/approvals/${req.id}/request-changes`,
      { guidance: "change it" },
    );
    expect(res.status).toBe(400);
    // Unchanged - still pending.
    const after = await new ApprovalService(dir, "run1").get(req.id);
    expect(after!.status).toBe("pending");
  });

  it("rejects empty guidance with 400", async () => {
    const dir = await makeProject();
    const req = await seedApproval(dir, "run1", "agent");
    server = await startServer({ projectRoot: dir, port: 0, host: "127.0.0.1" });

    const res = await post(
      `${server.url}/api/runs/run1/approvals/${req.id}/request-changes`,
      { guidance: "   " },
    );
    expect(res.status).toBe(400);
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import {
  startServer,
  type StartedServer,
} from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";
import { ApprovalService } from "../src/core/approval-service.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "amaco-server-appr-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  return dir;
}

async function startTestServer(projectRoot: string): Promise<StartedServer> {
  return startServer({ projectRoot, port: 0, host: "127.0.0.1" });
}

let project: string;
let server: StartedServer | null = null;

afterEach(async () => {
  if (server) await server.close();
  server = null;
});

describe("server: skill assign/unassign", () => {
  beforeEach(async () => {
    project = await makeProject();
    // Add a discoverable skill.
    const dir = path.join(project, ".claude", "skills", "test-skill");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "SKILL.md"),
      "---\nname: test-skill\ndescription: t\n---\n# body\n",
    );
    server = await startTestServer(project);
  });

  it("POST /api/skills/:id/assign attaches a skill to an agent", async () => {
    const list = await fetch(`${server!.url}/api/skills`).then((r) => r.json());
    // skillId of "claude:test-skill"
    const skillId = (list as { skills: { id: string; name: string }[] })
      .skills[0]!.id;
    const res = await fetch(
      `${server!.url}/api/skills/${encodeURIComponent(skillId)}/assign`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId: "executor" }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { skills: string[] };
    expect(body.skills).toContain("test-skill");

    // Re-fetch and confirm.
    const after = (await fetch(`${server!.url}/api/skills`).then((r) =>
      r.json(),
    )) as { assignments: { agentId: string; skills: string[] }[] };
    const exec = after.assignments.find((a) => a.agentId === "executor")!;
    expect(exec.skills).toContain("test-skill");
  });

  it("POST /api/skills/:id/unassign removes a skill", async () => {
    const list = (await fetch(`${server!.url}/api/skills`).then((r) =>
      r.json(),
    )) as { skills: { id: string }[] };
    const skillId = list.skills[0]!.id;
    await fetch(`${server!.url}/api/skills/${encodeURIComponent(skillId)}/assign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId: "executor" }),
    });
    const res = await fetch(
      `${server!.url}/api/skills/${encodeURIComponent(skillId)}/unassign`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId: "executor" }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { skills: string[] };
    expect(body.skills).not.toContain("test-skill");
  });

  it("returns 404 for unknown skill id", async () => {
    const res = await fetch(
      `${server!.url}/api/skills/${encodeURIComponent("amaco:no-such")}/assign`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId: "executor" }),
      },
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for unknown agent", async () => {
    const list = (await fetch(`${server!.url}/api/skills`).then((r) =>
      r.json(),
    )) as { skills: { id: string }[] };
    const skillId = list.skills[0]!.id;
    const res = await fetch(
      `${server!.url}/api/skills/${encodeURIComponent(skillId)}/assign`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId: "ghost" }),
      },
    );
    expect(res.status).toBe(400);
  });
});

describe("server: approvals API", () => {
  beforeEach(async () => {
    project = await makeProject();
    // seed one approval directly via service.
    await fs.mkdir(path.join(project, ".amaco", "runs", "r1"), {
      recursive: true,
    });
    const svc = new ApprovalService(project, "r1");
    await svc.create({
      stageId: "reviewing",
      agentId: "reviewer",
      reason: "needs eyes",
      prompt: null,
      sourceArtifactPath: "artifacts/09-review.md",
      requestedAction: "continue past reviewing stage",
    });
    server = await startTestServer(project);
  });

  it("GET /api/runs/:runId/approvals lists pending", async () => {
    const r = await fetch(`${server!.url}/api/runs/r1/approvals`);
    expect(r.status).toBe(200);
    const body = (await r.json()) as { approvals: { status: string }[] };
    expect(body.approvals).toHaveLength(1);
    expect(body.approvals[0]!.status).toBe("pending");
  });

  it("POST approve transitions pending → approved", async () => {
    const list = (await fetch(`${server!.url}/api/runs/r1/approvals`).then(
      (r) => r.json(),
    )) as { approvals: { id: string }[] };
    const id = list.approvals[0]!.id;
    const res = await fetch(
      `${server!.url}/api/runs/r1/approvals/${id}/approve`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: "lgtm" }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { approval: { status: string; decisionNote: string } };
    expect(body.approval.status).toBe("approved");
    expect(body.approval.decisionNote).toBe("lgtm");
  });

  it("POST approve again returns 409", async () => {
    const list = (await fetch(`${server!.url}/api/runs/r1/approvals`).then(
      (r) => r.json(),
    )) as { approvals: { id: string }[] };
    const id = list.approvals[0]!.id;
    await fetch(`${server!.url}/api/runs/r1/approvals/${id}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const second = await fetch(
      `${server!.url}/api/runs/r1/approvals/${id}/approve`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    expect(second.status).toBe(409);
  });

  it("POST reject transitions pending → rejected", async () => {
    const list = (await fetch(`${server!.url}/api/runs/r1/approvals`).then(
      (r) => r.json(),
    )) as { approvals: { id: string }[] };
    const id = list.approvals[0]!.id;
    const res = await fetch(
      `${server!.url}/api/runs/r1/approvals/${id}/reject`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: "no" }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { approval: { status: string } };
    expect(body.approval.status).toBe("rejected");
  });

  it("rejects path traversal in approval routes", async () => {
    const res = await fetch(`${server!.url}/api/runs/..%2Fother/approvals`);
    expect(res.status).toBe(400);
  });
});

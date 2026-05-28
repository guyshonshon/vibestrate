import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import { ProposalService } from "../src/roadmap/proposal-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

const happy = `VIBESTRATE_ROADMAP_ITEM:
TITLE: Build onboarding
PRIORITY: medium

VIBESTRATE_TASK:
TITLE: Wizard
ROADMAP: Build onboarding
RISK: medium

VIBESTRATE_TASK:
TITLE: Wizard tests
ROADMAP: Build onboarding
DEPENDS_ON: Wizard
`;

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-srv-prop-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  const ps = new ProposalService(dir);
  await ps.init();
  await ps.writeProposalText("demo", happy);
  return dir;
}

let project: string;
let server: StartedServer | null = null;

afterEach(async () => {
  if (server) await server.close();
  server = null;
});

describe("server: proposals routes", () => {
  beforeEach(async () => {
    project = await makeProject();
    server = await startServer({
      projectRoot: project,
      port: 0,
      host: "127.0.0.1",
    });
  });

  it("GET /api/roadmap/proposals lists drafts", async () => {
    const r = await fetch(`${server!.url}/api/roadmap/proposals`);
    expect(r.status).toBe(200);
    const body = (await r.json()) as { proposals: { id: string }[] };
    expect(body.proposals.map((p) => p.id)).toContain("demo");
  });

  it("GET /api/roadmap/proposals/:id returns body and accepted=null", async () => {
    const r = await fetch(`${server!.url}/api/roadmap/proposals/demo`);
    const body = (await r.json()) as {
      proposalId: string;
      body: string;
      accepted: unknown;
    };
    expect(body.proposalId).toBe("demo");
    expect(body.body).toContain("VIBESTRATE_ROADMAP_ITEM");
    expect(body.accepted).toBeNull();
  });

  it("GET parse returns drafts + dependency edges", async () => {
    const r = await fetch(`${server!.url}/api/roadmap/proposals/demo/parse`);
    const body = (await r.json()) as {
      tasks: { title: string }[];
      dependencyEdges: { from: string; to: string }[];
    };
    expect(body.tasks.map((t) => t.title)).toEqual(["Wizard", "Wizard tests"]);
    expect(body.dependencyEdges).toEqual([
      { from: "Wizard", to: "Wizard tests" },
    ]);
  });

  it("POST accept dryRun returns preview without writing", async () => {
    const r = await fetch(
      `${server!.url}/api/roadmap/proposals/demo/accept`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dryRun: true }),
      },
    );
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      dryRun: boolean;
      willCreate: { tasks: unknown[] };
    };
    expect(body.dryRun).toBe(true);
    expect(body.willCreate.tasks).toHaveLength(2);
    // no tasks/ files exist
    const tasksDir = path.join(project, ".vibestrate", "roadmap", "tasks");
    const list = (await fs.readdir(tasksDir).catch(() => [])) as string[];
    expect(list).toEqual([]);
  });

  it("POST accept (real) writes roadmap+tasks and the audit file", async () => {
    const r = await fetch(
      `${server!.url}/api/roadmap/proposals/demo/accept`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      result: { createdTaskIds: string[]; auditFilePath: string };
    };
    expect(body.result.createdTaskIds.length).toBe(2);
    expect(
      await fs.readFile(body.result.auditFilePath, "utf8"),
    ).toContain("demo");
  });

  it("rejects path traversal in proposal id", async () => {
    const r = await fetch(
      `${server!.url}/api/roadmap/proposals/${encodeURIComponent("../etc")}`,
    );
    expect(r.status).toBe(400);
  });
});

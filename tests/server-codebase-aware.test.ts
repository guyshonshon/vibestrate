import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import { writeJson } from "../src/utils/json.js";
import { runStatePath, runDir } from "../src/utils/paths.js";
import { ensureDir } from "../src/utils/fs.js";
import { runStateSchema } from "../src/core/state-machine.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "amaco-codeawsrv-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await fs.mkdir(path.join(dir, "src"), { recursive: true });
  await fs.writeFile(path.join(dir, "src", "example.ts"), "export const x=1\n");
  await fs.writeFile(path.join(dir, ".env"), "SECRET=v\n");
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({
    options: { projectRoot: dir },
    detectionRunner: noProvider,
  });
  return dir;
}

let project: string;
let server: StartedServer | null = null;

afterEach(async () => {
  if (server) await server.close();
  server = null;
});

describe("server: project / codebase / git / agent-work routes", () => {
  beforeEach(async () => {
    project = await makeProject();
    server = await startServer({
      projectRoot: project,
      port: 0,
      host: "127.0.0.1",
    });
  });

  it("GET /api/project/metadata returns project metadata", async () => {
    const r = await fetch(`${server!.url}/api/project/metadata`).then((r) => r.json()) as {
      metadata: {
        projectName: string;
        projectRoot: string;
        git: { isGitRepo: boolean; currentBranch: string | null };
        validationCommands: string[];
      };
    };
    expect(r.metadata.projectRoot).toBe(project);
    expect(r.metadata.git.isGitRepo).toBe(true);
    expect(r.metadata.git.currentBranch).toBe("main");
  });

  it("GET /api/project/tree shows src/example.ts and excludes node_modules", async () => {
    await fs.mkdir(path.join(project, "node_modules"), { recursive: true });
    await fs.writeFile(path.join(project, "node_modules", "noise.ts"), "x");
    const r = await fetch(`${server!.url}/api/project/tree`).then((r) => r.json()) as {
      tree: { tree: { children?: { name: string }[] } };
    };
    const top = r.tree.tree.children ?? [];
    expect(top.find((c) => c.name === "src")).toBeDefined();
    expect(top.find((c) => c.name === "node_modules")).toBeUndefined();
  });

  it("GET /api/project/file?path=src/example.ts returns numbered lines", async () => {
    const r = await fetch(
      `${server!.url}/api/project/file?path=src%2Fexample.ts`,
    ).then((r) => r.json()) as {
      file: { path: string; lines: { number: number; text: string }[]; isSecretLike: boolean };
    };
    expect(r.file.path).toBe("src/example.ts");
    expect(r.file.lines[0]!.number).toBe(1);
    expect(r.file.lines[0]!.text).toContain("export const");
    expect(r.file.isSecretLike).toBe(false);
  });

  it("GET /api/project/file?path=.env redacts contents", async () => {
    const r = await fetch(
      `${server!.url}/api/project/file?path=.env`,
    ).then((r) => r.json()) as {
      file: { lines: unknown[]; isSecretLike: boolean; notice?: string };
    };
    expect(r.file.lines).toHaveLength(0);
    expect(r.file.isSecretLike).toBe(true);
    expect(r.file.notice ?? "").toMatch(/secret/i);
  });

  it("GET /api/project/file rejects ../ traversal with 400", async () => {
    const res = await fetch(
      `${server!.url}/api/project/file?path=..%2Fetc%2Fpasswd`,
    );
    expect(res.status).toBe(400);
  });

  it("GET /api/project/git/status reports branch + head", async () => {
    const r = (await fetch(`${server!.url}/api/project/git/status`).then((r) =>
      r.json(),
    )) as {
      status: {
        available: boolean;
        branch: string;
        headSubject: string | null;
      };
    };
    expect(r.status.available).toBe(true);
    expect(r.status.branch).toBe("main");
    expect(r.status.headSubject).toBe("init");
  });

  it("GET /api/project/git/history returns at least one commit", async () => {
    const r = (await fetch(`${server!.url}/api/project/git/history?limit=5`).then(
      (r) => r.json(),
    )) as { history: { commits: { subject: string }[] } };
    expect(r.history.commits.length).toBeGreaterThan(0);
    expect(r.history.commits[0]!.subject).toBe("init");
  });

  it("GET /api/runs/:runId/agent-work returns 404 for unknown run", async () => {
    const res = await fetch(`${server!.url}/api/runs/nope/agent-work`);
    expect(res.status).toBe(404);
  });

  it("GET /api/runs/:runId/agent-work returns rows for a fixture run", async () => {
    const runId = "fixture-1";
    await ensureDir(runDir(project, runId));
    const state = runStateSchema.parse({
      runId,
      task: "fixture",
      status: "merge_ready",
      projectRoot: project,
      worktreePath: null,
      branchName: null,
      reviewLoopCount: 0,
      maxReviewLoops: 2,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      finalDecision: "APPROVED",
      verification: "PASSED",
      error: null,
    });
    await writeJson(runStatePath(project, runId), state);
    // Empty metrics first — endpoint should return available=false.
    const empty = await fetch(
      `${server!.url}/api/runs/${runId}/agent-work`,
    ).then((r) => r.json()) as { report: { available: boolean } };
    expect(empty.report.available).toBe(false);
  });

  it("POST /api/code-references parses references and annotates existence", async () => {
    const res = await fetch(`${server!.url}/api/code-references`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: "fix src/example.ts:2 and src/missing.ts:1",
      }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      references: { file: string; existsInProject?: boolean }[];
    };
    const real = json.references.find((r) => r.file === "src/example.ts");
    const missing = json.references.find((r) => r.file === "src/missing.ts");
    expect(real?.existsInProject).toBe(true);
    expect(missing?.existsInProject).toBe(false);
  });
});

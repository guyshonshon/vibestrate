import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

// Route-level checks for the health surface the Setup page is built on
// (CLAUDE.md §3: dashboard/server APIs need route-level checks).
//
// `/api/setup/doctor/fix` is the only write-side route here, and the property
// that matters is that its repair lands inside the server's own project root
// and nowhere else - it takes no input from the request, so there is nothing to
// aim, and this asserts that stays true.

const noProvider: ProviderDetectionRunner = async () => ({ exitCode: 127, stdout: "", stderr: "" });

async function makeProject(): Promise<string> {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-doctorroute-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: project });
  await execa("git", ["config", "user.email", "x@x"], { cwd: project });
  await execa("git", ["config", "user.name", "x"], { cwd: project });
  await fs.writeFile(path.join(project, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: project });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: project });
  await applySetup({ options: { projectRoot: project }, detectionRunner: noProvider });
  return project;
}

let server: StartedServer | null = null;
afterEach(async () => {
  if (server) await server.close();
  server = null;
});

type Report = {
  projectRoot: string;
  inGitRepo: boolean;
  findings: { id: string; severity: string; title: string; fixable: boolean }[];
  recommendedNextSteps: string[];
};

describe("setup health routes", () => {
  it("GET /api/setup/doctor returns the same report shape the CLI prints", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await fetch(`${server.url}/api/setup/doctor`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Report;

    // endsWith, not equality: macOS resolves /var to /private/var, and this is
    // asserting the report is about this project, not a symlink policy.
    expect(body.projectRoot.endsWith(path.basename(project))).toBe(true);
    expect(body.inGitRepo).toBe(true);
    // The Setup page groups findings by id, so an empty report would render as
    // five "nothing checked yet" steps rather than as a failure.
    expect(body.findings.length).toBeGreaterThan(0);
    for (const finding of body.findings) {
      expect(typeof finding.id).toBe("string");
      expect(["ok", "warn", "fail"]).toContain(finding.severity);
      expect(typeof finding.fixable).toBe("boolean");
    }
    expect(body.findings.some((f) => f.id === "git-repo")).toBe(true);
  });

  it("POST /api/setup/doctor/fix repairs, and answers with the report as it stands after", async () => {
    const project = await makeProject();
    // A missing `.vibestrate/` subdirectory is what the repair pass exists for.
    await fs.rm(path.join(project, ".vibestrate", "skills"), { recursive: true, force: true });

    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const before = (await (await fetch(`${server.url}/api/setup/doctor`)).json()) as Report;
    const gap = before.findings.find((f) => f.id === "dir-skills");
    expect(gap, "doctor should notice the deleted directory").toBeTruthy();
    expect(gap!.fixable).toBe(true);

    const res = await fetch(`${server.url}/api/setup/doctor/fix`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      applied: string[];
      skipped: string[];
      report: Report;
    };

    expect(body.applied.some((line) => line.includes("skills"))).toBe(true);
    await expect(fs.stat(path.join(project, ".vibestrate", "skills"))).resolves.toBeTruthy();

    // The returned report has to be re-run, not the caller's stale one: the
    // page renders it directly, and echoing the pre-repair state would show the
    // problem still present immediately after fixing it.
    expect(body.report.findings.some((f) => f.id === "dir-skills")).toBe(false);
  });

  it("keeps the repair inside the server's own project root", async () => {
    const project = await makeProject();
    const outsider = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-untouched-"));
    await fs.rm(path.join(project, ".vibestrate", "skills"), { recursive: true, force: true });

    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    // The route reads no path, id or root from the request, so a body naming
    // another directory is data it never looks at.
    const res = await fetch(`${server.url}/api/setup/doctor/fix`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectRoot: outsider, path: "../../etc" }),
    });
    expect(res.status).toBe(200);

    await expect(fs.stat(path.join(project, ".vibestrate", "skills"))).resolves.toBeTruthy();
    expect(await fs.readdir(outsider)).toEqual([]);
  });
});

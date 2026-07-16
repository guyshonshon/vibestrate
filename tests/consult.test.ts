import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { loadProjectManual } from "../src/project/project-manual.js";
import { assembleConsultContext } from "../src/consult/consult-context.js";
import { runConsult, ConsultError } from "../src/consult/consult.js";
import { readActionLog } from "../src/safety/action-broker.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";
import type { AssistProviderRunner } from "../src/core/assist/assist-runner.js";

const noProvider: ProviderDetectionRunner = async () => ({ exitCode: 127, stdout: "", stderr: "" });

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-consult-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  return dir;
}

/** Fake assist runner: replays a canned response. */
function fakeRunner(response: string, exitCode = 0): AssistProviderRunner {
  return async () => ({
    exitCode,
    normalized: { responseText: response, metrics: null },
  });
}

const GOOD_ANSWER = JSON.stringify({
  answer: "Use the default flow; the change touches application code only.",
  confidence: "medium",
  caveats: ["No tests exist for this module, so correctness is unverified."],
  usedContext: ["project config"],
  recommendedActions: [{ kind: "run", detail: "Run with the default flow." }],
  proposedManualUpdate: null,
});

describe("loadProjectManual", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await makeProject();
  });

  it("reports absent when there's no VIBESTRATE.md", async () => {
    const m = await loadProjectManual(projectRoot);
    expect(m.present).toBe(false);
    expect(m.content).toBeNull();
  });

  it("loads a present manual", async () => {
    await fs.writeFile(path.join(projectRoot, "VIBESTRATE.md"), "# VIBESTRATE.md\n\nA demo project.\n");
    const m = await loadProjectManual(projectRoot);
    expect(m.present).toBe(true);
    expect(m.content).toContain("A demo project");
  });

  it("redacts secret-shaped content", async () => {
    await fs.writeFile(
      path.join(projectRoot, "VIBESTRATE.md"),
      "# VIBESTRATE.md\n\nkey: AKIAIOSFODNN7EXAMPLE in here.\n",
    );
    const m = await loadProjectManual(projectRoot);
    expect(m.present).toBe(true);
    expect(m.redactionCount).toBeGreaterThan(0);
    expect(m.content).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });
});

describe("assembleConsultContext", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await makeProject();
  });

  it("includes the project config summary and notes a missing manual", async () => {
    const ctx = await assembleConsultContext({ projectRoot });
    expect(ctx.usedSources).toContain("project config");
    expect(ctx.text).toMatch(/Validation commands|Providers|Default crew/);
    expect(ctx.notes.some((n) => /No VIBESTRATE\.md/.test(n))).toBe(true);
  });

  it("includes VIBESTRATE.md when present", async () => {
    await fs.writeFile(path.join(projectRoot, "VIBESTRATE.md"), "# VIBESTRATE.md\n\nUnique marker XYZZY.\n");
    const ctx = await assembleConsultContext({ projectRoot });
    expect(ctx.usedSources).toContain("VIBESTRATE.md");
    expect(ctx.text).toContain("XYZZY");
  });

  it("notes an unknown task instead of throwing", async () => {
    const ctx = await assembleConsultContext({ projectRoot, taskId: "does-not-exist" });
    expect(ctx.notes.some((n) => /not found/.test(n))).toBe(true);
  });
});

describe("runConsult", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await makeProject();
  });

  it("returns a validated, structured answer", async () => {
    const res = await runConsult({
      projectRoot,
      question: "Should this use a heavier review?",
      runner: fakeRunner(GOOD_ANSWER),
    });
    expect(res.answer.confidence).toBe("medium");
    expect(res.answer.caveats.length).toBeGreaterThan(0);
    expect(res.usedSources).toContain("project config");
  });

  it("stays read-only - the audit log has only provider.spawn", async () => {
    await runConsult({
      projectRoot,
      question: "anything",
      runner: fakeRunner(GOOD_ANSWER),
    });
    const log = await readActionLog(projectRoot, "consult");
    expect(log.length).toBeGreaterThan(0);
    expect(log.every((r) => r.request.kind === "provider.spawn")).toBe(true);
    expect(log.find((r) => r.request.kind === "provider.spawn")!.evidence?.ok).toBe(true);
  });

  it("rejects an empty question", async () => {
    await expect(
      runConsult({ projectRoot, question: "   ", runner: fakeRunner(GOOD_ANSWER) }),
    ).rejects.toBeInstanceOf(ConsultError);
  });
});

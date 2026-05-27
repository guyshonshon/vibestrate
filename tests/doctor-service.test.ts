import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import {
  applyDoctorFixes,
  runDoctor,
  type DoctorFinding,
} from "../src/setup/doctor-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeGitProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "amaco-doctor-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["-c", "user.email=x@x", "-c", "user.name=x", "commit", "--allow-empty", "-q", "-m", "init"], { cwd: dir });
  return dir;
}

function ids(findings: DoctorFinding[]): string[] {
  return findings.map((f) => f.id);
}

function severityFor(findings: DoctorFinding[], id: string): string | undefined {
  return findings.find((f) => f.id === id)?.severity;
}

describe("doctor service", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await makeGitProject();
  });

  it("reports config-present=fail before init", async () => {
    const r = await runDoctor({ cwd: projectRoot });
    expect(r.inGitRepo).toBe(true);
    expect(severityFor(r.findings, "config-present")).toBe("fail");
    expect(r.recommendedNextSteps.join(" ")).toContain("amaco init");
  });

  it("reports config-valid=ok after init", async () => {
    await fs.writeFile(path.join(projectRoot, "package.json"), '{"name":"demo"}');
    await applySetup({ options: { projectRoot }, detectionRunner: noProvider });
    const r = await runDoctor({ cwd: projectRoot });
    expect(severityFor(r.findings, "config-present")).toBe("ok");
    expect(severityFor(r.findings, "config-valid")).toBe("ok");
    // No validation commands → warn
    expect(severityFor(r.findings, "validation-empty")).toBe("warn");
  });

  it("flags missing prompt files", async () => {
    await applySetup({ options: { projectRoot }, detectionRunner: noProvider });
    await fs.unlink(path.join(projectRoot, ".amaco", "roles", "planner.md"));
    const r = await runDoctor({ cwd: projectRoot });
    const find = r.findings.find((f) => f.id === "prompt-files");
    expect(find?.severity).toBe("fail");
    expect(find?.fixable).toBe(true);
  });

  it("flags agent referencing missing provider", async () => {
    await applySetup({ options: { projectRoot }, detectionRunner: noProvider });
    await setConfigValue(projectRoot, "roles.planner.provider", "nonexistent");
    const r = await runDoctor({ cwd: projectRoot });
    expect(severityFor(r.findings, "agent-provider-refs")).toBe("fail");
  });

  it("doctor --fix restores missing prompts and skills README", async () => {
    await applySetup({ options: { projectRoot }, detectionRunner: noProvider });
    await fs.unlink(path.join(projectRoot, ".amaco", "roles", "planner.md"));
    await fs.unlink(path.join(projectRoot, ".amaco", "skills", "README.md"));

    const outcome = await applyDoctorFixes({ projectRoot });
    expect(outcome.applied.join("\n")).toContain("planner.md");
    expect(outcome.applied.join("\n")).toContain("skills/README.md");

    expect(
      await fs.readFile(path.join(projectRoot, ".amaco", "roles", "planner.md"), "utf8"),
    ).toContain("# Planner Agent");
  });

  it("doctor --fix never deletes existing files", async () => {
    await applySetup({ options: { projectRoot }, detectionRunner: noProvider });
    const customPlanner = path.join(projectRoot, ".amaco", "roles", "planner.md");
    await fs.writeFile(customPlanner, "# CUSTOM\nDo not overwrite.");
    await applyDoctorFixes({ projectRoot });
    const after = await fs.readFile(customPlanner, "utf8");
    expect(after).toBe("# CUSTOM\nDo not overwrite.");
  });

  it("findings are JSON-serializable (UI-friendly)", async () => {
    await applySetup({ options: { projectRoot }, detectionRunner: noProvider });
    const r = await runDoctor({ cwd: projectRoot });
    const json = JSON.stringify(r);
    expect(typeof json).toBe("string");
    expect(ids(r.findings)).toContain("git-repo");
    expect(ids(r.findings)).toContain("config-valid");
  });
});

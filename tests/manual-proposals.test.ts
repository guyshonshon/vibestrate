import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import {
  loadProjectManual,
  writeProjectManual,
  ManualWriteError,
} from "../src/project/project-manual.js";
import {
  saveManualProposal,
  applyManualProposal,
  rejectManualProposal,
  listManualProposals,
  ManualProposalError,
} from "../src/project/manual-proposals.js";
import { readActionLog } from "../src/safety/action-broker.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({ exitCode: 127, stdout: "", stderr: "" });

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-manual-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  return dir;
}

describe("writeProjectManual (guarded)", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await makeProject();
  });

  it("writes a manual and records a file.write in the broker log", async () => {
    await writeProjectManual(projectRoot, "# VIBESTRATE.md\n\nHello.\n", { reason: "test" });
    const reloaded = await loadProjectManual(projectRoot);
    expect(reloaded.present).toBe(true);
    expect(reloaded.content).toContain("Hello");
    const log = await readActionLog(projectRoot, "manual");
    expect(log.some((r) => r.request.kind === "file.write")).toBe(true);
  });

  it("refuses secret-shaped content (does not write)", async () => {
    await expect(
      writeProjectManual(projectRoot, "# Manual\n\nkey AKIAIOSFODNN7EXAMPLE\n"),
    ).rejects.toBeInstanceOf(ManualWriteError);
    expect((await loadProjectManual(projectRoot)).present).toBe(false);
  });
});

describe("manual proposals lifecycle", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await makeProject();
  });

  it("saves, lists, applies (appends to the manual), and blocks double-apply", async () => {
    const saved = await saveManualProposal(projectRoot, {
      id: "mp-test-1",
      createdAt: "2026-06-03T00:00:00.000Z",
      rationale: "tests need a server command",
      evidence: "runs A/B/C failed until run",
      suggestedText: "## Lessons\n- Run pnpm test:server after touching src/server/**.",
    });
    expect(saved.status).toBe("open");

    const open = await listManualProposals(projectRoot, { status: "open" });
    expect(open).toHaveLength(1);

    const { created } = await applyManualProposal(projectRoot, "mp-test-1");
    expect(created).toBe(true); // scaffolded from the starter
    const manual = await loadProjectManual(projectRoot);
    expect(manual.content).toContain("pnpm test:server");

    // Applied is no longer open; re-applying is refused.
    expect(await listManualProposals(projectRoot, { status: "open" })).toHaveLength(0);
    await expect(applyManualProposal(projectRoot, "mp-test-1")).rejects.toBeInstanceOf(
      ManualProposalError,
    );
  });

  it("rejects a proposal without touching the manual", async () => {
    await saveManualProposal(projectRoot, {
      id: "mp-test-2",
      suggestedText: "noise",
      rationale: "nope",
    });
    await rejectManualProposal(projectRoot, "mp-test-2");
    expect(await listManualProposals(projectRoot, { status: "open" })).toHaveLength(0);
    expect((await loadProjectManual(projectRoot)).present).toBe(false);
  });
});

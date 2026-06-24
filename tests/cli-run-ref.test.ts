import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { runDir, runStatePath } from "../src/utils/paths.js";
import { writeJson } from "../src/utils/json.js";
import { runStateSchema } from "../src/core/state-machine.js";
import { ensureDir } from "../src/utils/fs.js";
import { resolveRunRef } from "../src/cli/run-ref.js";

async function makeProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-runref-"));
}

async function writeRun(
  project: string,
  runId: string,
  displayName: string | null,
): Promise<void> {
  await ensureDir(runDir(project, runId));
  const ts = new Date("2026-06-24T00:00:00Z").toISOString();
  await writeJson(
    runStatePath(project, runId),
    runStateSchema.parse({
      runId,
      task: "fixture",
      displayName,
      status: "merge_ready",
      projectRoot: project,
      worktreePath: null,
      branchName: null,
      reviewLoopCount: 0,
      maxReviewLoops: 2,
      startedAt: ts,
      updatedAt: ts,
      finalDecision: null,
      verification: null,
      error: null,
    }),
  );
}

describe("resolveRunRef", () => {
  it("resolves a real run id directly (fast path)", async () => {
    const project = await makeProject();
    await writeRun(project, "bold-lovelace", "My auth fix");
    const r = await resolveRunRef(project, "bold-lovelace");
    expect(r).toEqual({ ok: true, runId: "bold-lovelace" });
  });

  it("resolves a unique displayName to its run id", async () => {
    const project = await makeProject();
    await writeRun(project, "bold-lovelace", "My auth fix");
    await writeRun(project, "calm-turing", "Other work");
    const r = await resolveRunRef(project, "My auth fix");
    expect(r).toEqual({ ok: true, runId: "bold-lovelace" });
  });

  it("matches a displayName case-insensitively when no exact match exists", async () => {
    const project = await makeProject();
    await writeRun(project, "bold-lovelace", "My Auth Fix");
    const r = await resolveRunRef(project, "my auth fix");
    expect(r).toEqual({ ok: true, runId: "bold-lovelace" });
  });

  it("prefers an exact displayName match over a case-insensitive one", async () => {
    const project = await makeProject();
    await writeRun(project, "exact-one", "Build");
    await writeRun(project, "ci-one", "build");
    const r = await resolveRunRef(project, "Build");
    expect(r).toEqual({ ok: true, runId: "exact-one" });
  });

  it("refuses an ambiguous displayName and lists the candidates", async () => {
    const project = await makeProject();
    await writeRun(project, "run-a", "Dup");
    await writeRun(project, "run-b", "Dup");
    const r = await resolveRunRef(project, "Dup");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("ambiguous");
      expect(r.reason).toContain("run-a");
      expect(r.reason).toContain("run-b");
    }
  });

  it("reports not found for an unknown ref", async () => {
    const project = await makeProject();
    await writeRun(project, "bold-lovelace", "My auth fix");
    const r = await resolveRunRef(project, "nope");
    expect(r).toEqual({ ok: false, reason: "Run nope not found." });
  });
});

import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { resolveResumeFrom, RunLaunchError } from "../src/core/run/run-launcher.js";

/** A temp project with a source run that has the start artifact. */
async function mkProjectWithSourceRun(runId: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-rw2-"));
  const artifacts = path.join(root, ".vibestrate", "runs", runId, "artifacts");
  await fs.mkdir(artifacts, { recursive: true });
  await fs.writeFile(path.join(artifacts, "00-idea.md"), "# idea\n");
  return root;
}

async function writeSnapshotManifest(root: string, runId: string) {
  const file = path.join(root, ".vibestrate", "runs", runId, "phase-snapshots.json");
  await fs.writeFile(
    file,
    JSON.stringify({
      version: 1,
      snapshots: [
        { seq: 0, stage: "executing", treeSha: "tree0", commitSha: "c0", ref: "r0", at: "t" },
      ],
    }),
  );
}

describe("resolveResumeFrom - Rewind phase 2 snapshot gate", () => {
  it("allows upstream stages without a snapshot (back-compat)", async () => {
    const root = await mkProjectWithSourceRun("src");
    const r = await resolveResumeFrom(root, { sourceRunId: "src", fromStage: "executing" });
    expect(r.fromStage).toBe("executing");
  });

  it("refuses a downstream resume when the source run has no snapshot", async () => {
    const root = await mkProjectWithSourceRun("src");
    await expect(
      resolveResumeFrom(root, { sourceRunId: "src", fromStage: "reviewing" }),
    ).rejects.toMatchObject({ code: "resume_no_snapshot" });
  });

  it("allows a downstream resume once a snapshot exists", async () => {
    const root = await mkProjectWithSourceRun("src");
    await writeSnapshotManifest(root, "src");
    for (const fromStage of ["reviewing", "fixing", "verifying"] as const) {
      const r = await resolveResumeFrom(root, { sourceRunId: "src", fromStage });
      expect(r.fromStage).toBe(fromStage);
    }
  });

  it("still refuses a missing source run", async () => {
    const root = await mkProjectWithSourceRun("src");
    await expect(
      resolveResumeFrom(root, { sourceRunId: "ghost", fromStage: "reviewing" }),
    ).rejects.toBeInstanceOf(RunLaunchError);
  });
});

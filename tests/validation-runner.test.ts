import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { ArtifactStore } from "../src/core/artifact-store.js";
import { runValidationCommands } from "../src/core/validation-runner.js";

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-validation-"));
}

describe("validation runner", () => {
  let projectRoot: string;
  let workdir: string;
  beforeEach(async () => {
    projectRoot = await tempProject();
    workdir = await tempProject();
  });

  it("returns no-commands result when configured empty", async () => {
    const store = new ArtifactStore(projectRoot, "r");
    await store.init();
    const r = await runValidationCommands({ commands: [], cwd: workdir, store });
    expect(r.summary.total).toBe(0);
    expect(r.note).toMatch(/No validation/);
  });

  it("captures pass and fail; continues after failure; writes stdout/stderr", async () => {
    const store = new ArtifactStore(projectRoot, "r");
    await store.init();
    const r = await runValidationCommands({
      commands: [
        "node -e \"console.log('ok')\"",
        "node -e \"console.error('boom'); process.exit(1)\"",
        "node -e \"console.log('also ok')\"",
      ],
      cwd: workdir,
      store,
    });
    expect(r.summary.total).toBe(3);
    expect(r.summary.passed).toBe(2);
    expect(r.summary.failed).toBe(1);
    expect(r.commands[0]!.status).toBe("passed");
    expect(r.commands[1]!.status).toBe("failed");
    expect(r.commands[2]!.status).toBe("passed");

    const stdout0 = await fs.readFile(
      path.join(store.artifactsDir, r.commands[0]!.stdoutPath.replace(/^artifacts\//, "")),
      "utf8",
    );
    expect(stdout0).toMatch(/ok/);
    const stderr1 = await fs.readFile(
      path.join(store.artifactsDir, r.commands[1]!.stderrPath.replace(/^artifacts\//, "")),
      "utf8",
    );
    expect(stderr1).toMatch(/boom/);
  });
});

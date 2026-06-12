import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { ArtifactStore } from "../src/core/artifact-store.js";
import {
  isEnvironmentFailure,
  runValidationCommands,
} from "../src/core/validation-runner.js";

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

  it("classifies a missing toolchain as environment, not failed (the P8c false-block)", async () => {
    const store = new ArtifactStore(projectRoot, "r");
    await store.init();
    const r = await runValidationCommands({
      commands: [
        "node -e \"console.log('ok')\"",
        // The shell can't find this binary - exit 127 / "command not found".
        "definitely-not-a-real-command-xyz --version",
        // The observed real-run shape: a wrapper masks 127 as exit 1 but
        // stderr still says command not found.
        "sh -c 'echo \"sh: tsc: command not found\" 1>&2; exit 1'",
      ],
      cwd: workdir,
      store,
    });
    expect(r.summary.total).toBe(3);
    expect(r.summary.passed).toBe(1);
    expect(r.summary.failed).toBe(0);
    expect(r.summary.environment).toBe(2);
    expect(r.commands[1]!.status).toBe("environment");
    expect(r.commands[2]!.status).toBe("environment");
    expect(r.note).toMatch(/environment, not a code failure/);
  });

  it("isEnvironmentFailure: real failures with noisy stderr stay failures", () => {
    expect(isEnvironmentFailure(0, "command not found")).toBe(false);
    expect(isEnvironmentFailure(127, "")).toBe(true);
    expect(isEnvironmentFailure(1, "sh: tsc: command not found")).toBe(true);
    expect(isEnvironmentFailure(1, "zsh:1: command not found: tsc")).toBe(true);
    expect(
      isEnvironmentFailure(1, "AssertionError: expected 1 to be 2"),
    ).toBe(false);
    // Adversarial review: the phrase EMBEDDED in test output must not flip a
    // real failure to environment - vitest writes failures to stderr.
    expect(
      isEnvironmentFailure(
        1,
        "FAIL src/x.test.ts > prints command not found when binary missing\nAssertionError: expected 'command not found' to contain 'tsc'",
      ),
    ).toBe(false);
    expect(
      isEnvironmentFailure(1, "Error: the string \"command not found\" was unexpected here"),
    ).toBe(false);
  });
});

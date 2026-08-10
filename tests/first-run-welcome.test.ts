// A bare `vibe` is the first thing someone types after installing, and for a
// while it answered with an empty panel or, off a terminal, one sentence about
// TTYs and nothing else. These drive the built bundle rather than the exported
// function, because the wiring is the part that was missing - the message
// itself was never the hard bit.
//
// Mutation-checked: removing the uninitialized branch in cli/index.ts fails the
// first case, and restoring the bare TTY string in shell/ink/runtime.tsx fails
// the second.

import { describe, it, expect, beforeAll } from "vitest";
import { execa } from "execa";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { firstRunMessage, isProjectInitialized } from "../src/cli/first-run.js";

const distEntry = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist/index.js",
);

describe("first run", () => {
  beforeAll(() => {
    if (!existsSync(distEntry)) {
      throw new Error(`dist/index.js not found - run \`pnpm build\` first (${distEntry})`);
    }
  });

  it("greets instead of opening an empty panel in an uninitialized project", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-firstrun-"));
    const r = await execa("node", [distEntry], { cwd: dir, reject: false });
    expect(r.exitCode).toBe(0);
    // Every line here is a way forward; the failure this guards against is a
    // greeting that says what is wrong and not what to do.
    expect(r.stdout).toContain("vibe welcome");
    expect(r.stdout).toContain("vibe init");
    expect(r.stdout).toContain("vibe --help");
    expect(r.stdout).toContain("https://vibestrate.com/docs");
  });

  it("points somewhere when the panel cannot open off a terminal", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-firstrun-tty-"));
    // An initialized project, so the uninitialized branch above is not what
    // answers - this has to reach the panel's own TTY guard.
    await fs.mkdir(path.join(dir, ".vibestrate"), { recursive: true });
    await fs.writeFile(path.join(dir, ".vibestrate", "project.yml"), 'project:\n  name: "x"\n');
    const r = await execa("node", [distEntry], { cwd: dir, reject: false });
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("interactive terminal");
    expect(r.stdout).toContain("vibe welcome");
    expect(r.stdout).toContain("vibe ui");
  });

  it("knows an initialized project from an empty directory", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-firstrun-init-"));
    expect(await isProjectInitialized(dir)).toBe(false);
    await fs.mkdir(path.join(dir, ".vibestrate"), { recursive: true });
    await fs.writeFile(path.join(dir, ".vibestrate", "project.yml"), "project:\n");
    expect(await isProjectInitialized(dir)).toBe(true);
  });

  it("offers the same ways forward whichever way it was reached", () => {
    for (const reason of ["uninitialized", "no-tty"] as const) {
      const msg = firstRunMessage(reason);
      for (const cmd of ["vibe welcome", "vibe init", "vibe doctor", "vibe ui", "vibe --help"]) {
        expect(msg, reason).toContain(cmd);
      }
    }
  });
});

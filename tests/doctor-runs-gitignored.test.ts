import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { runDoctor } from "../src/setup/doctor-service.js";
import { applySetup } from "../src/setup/setup-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

/**
 * `.vibestrate/runs/` must not end up in the repository.
 *
 * The rest of `.vibestrate/` is committed on purpose - crews, flows, policies
 * and rules are the point of the folder. `runs/` is not: it grows without
 * bound and a run's `state.json` carries the raw text of anything steered onto
 * it, because steer notes are redacted on the way into a prompt rather than at
 * rest. The docs told the reader to add the line by hand, which is a step the
 * product can take itself.
 *
 * Asked of git rather than by parsing `.gitignore`, so the three states are
 * exercised against a real repository.
 */
const noProvider: ProviderDetectionRunner = async () => ({ exitCode: 127, stdout: "", stderr: "" });

async function repo(gitignore: string | null): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-runs-ignore-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"x"}');
  if (gitignore !== null) await fs.writeFile(path.join(dir, ".gitignore"), gitignore);
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  await fs.mkdir(path.join(dir, ".vibestrate", "runs", "run-1"), { recursive: true });
  await fs.writeFile(
    path.join(dir, ".vibestrate", "runs", "run-1", "state.json"),
    '{"runId":"run-1"}',
  );
  return dir;
}

const finding = async (dir: string) =>
  (await runDoctor({ cwd: dir })).findings.find((f) => f.id === "runs-gitignored");

describe("doctor: run history stays out of the repository", () => {
  it("is happy when the path is ignored", async () => {
    const dir = await repo(".vibestrate/runs/\n");
    expect((await finding(dir))?.severity).toBe("ok");
    await fs.rm(dir, { recursive: true, force: true });
  }, 60_000);

  it("warns when nothing ignores it yet", async () => {
    const dir = await repo("node_modules/\n");
    const f = await finding(dir);
    expect(f?.severity).toBe("warn");
    expect(f?.title).toContain("not ignored");
    await fs.rm(dir, { recursive: true, force: true });
  }, 60_000);

  it("warns harder when run files are already committed", async () => {
    const dir = await repo("node_modules/\n");
    await execa("git", ["add", "-A"], { cwd: dir });
    await execa("git", ["commit", "-q", "-m", "oops"], { cwd: dir });
    const f = await finding(dir);
    expect(f?.severity).toBe("warn");
    expect(f?.title).toContain("committed");
    // The already-tracked case needs the extra step, or the files stay in the
    // index however the .gitignore changes.
    expect(f?.fixHint).toContain("git rm -r --cached");
    await fs.rm(dir, { recursive: true, force: true });
  }, 60_000);

  it("is never applied by `Fix what's safe` - a .gitignore is the author's", async () => {
    const dir = await repo("node_modules/\n");
    expect((await finding(dir))?.fixable).toBe(false);
    await fs.rm(dir, { recursive: true, force: true });
  }, 60_000);
});

describe("a scaffolded repository ignores run history from the start", () => {
  it("writes the line when Vibestrate creates the repository", async () => {
    // NOT pre-initialised: `initGitRepository` refuses to nest inside an
    // existing repo, so the starter .gitignore only ever lands on a greenfield
    // folder. Every other project reaches this through the doctor check above,
    // which is why both exist.
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-scaffold-"));
    const { initGitRepository } = await import("../src/git/git-init.js");
    const res = await initGitRepository({ projectRoot: dir, commit: false });
    expect(res.ok, res.error ?? "").toBe(true);
    expect(res.gitignoreWritten).toBe(true);
    const gi = await fs.readFile(path.join(dir, ".gitignore"), "utf8");
    expect(gi).toContain(".vibestrate/runs/");
    // The rest of the folder is committed on purpose - crews, flows, policies.
    expect(gi.split("\n")).not.toContain(".vibestrate/");
    await fs.rm(dir, { recursive: true, force: true });
  }, 60_000);
});

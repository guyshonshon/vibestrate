import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { loadConfig } from "../src/project/config-loader.js";
import { buildConfigView } from "../src/setup/config-view.js";

const noProvider = async () => ({ exitCode: 127, stdout: "", stderr: "" });

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-config-view-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  return dir;
}

describe("buildConfigView", () => {
  it("groups the resolved config into editable-aware sections", async () => {
    const dir = await makeProject();
    const { config } = await loadConfig(dir);
    const view = buildConfigView(config);

    expect(view.project.name.length).toBeGreaterThan(0);

    const ids = view.sections.map((s) => s.id);
    for (const expected of [
      "providers",
      "profiles",
      "crews",
      "git",
      "workflow",
      "execution",
      "commands",
      "budget",
      "policies",
      "permissions",
      "scheduler",
      "editor",
    ]) {
      expect(ids).toContain(expected);
    }

    // Live-editable sections deep-link to a dedicated editor route.
    const profiles = view.sections.find((s) => s.id === "profiles")!;
    expect(profiles.editable.live).toBe(true);
    expect(profiles.editable.route).toBe("profiles");
    // The default crew ships a balanced claude profile.
    expect(profiles.rows.some((r) => r.label === "claude-balanced")).toBe(true);

    const providers = view.sections.find((s) => s.id === "providers")!;
    expect(providers.editable.route).toBe("providers");

    // Static sections point at the CLI path, not a UI editor.
    const git = view.sections.find((s) => s.id === "git")!;
    expect(git.editable.live).toBe(false);
    expect(git.editable.cli.length).toBeGreaterThan(0);
    expect(git.rows.find((r) => r.label === "main branch")?.value).toBe("main");

    // Safety policies render as on/off with the right tone.
    const policies = view.sections.find((s) => s.id === "policies")!;
    const forbidMain = policies.rows.find(
      (r) => r.label === "forbid main-branch writes",
    )!;
    expect(forbidMain.value).toBe("on");
    expect(forbidMain.tone).toBe("on");
  }, 30_000);
});

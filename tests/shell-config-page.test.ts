import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { loadConfig } from "../src/project/config-loader.js";
import { ConfigPage } from "../src/shell/ink/pages/ConfigPage.js";

const noProvider = async () => ({ exitCode: 127, stdout: "", stderr: "" });
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-shell-config-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  return dir;
}

describe("shell Config page", () => {
  it("renders grouped sections + where each is editable", async () => {
    const dir = await makeProject();
    const { config } = await loadConfig(dir);

    const { lastFrame } = render(
      React.createElement(ConfigPage, {
        config,
        selectedIndex: 0,
        setSelectedIndex: () => {},
        active: true,
      }),
    );
    await delay(50);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("CONFIG");
    // The section list (first section is Providers).
    expect(frame).toContain("Providers");
    expect(frame).toContain("Profiles");
    // The selected section's "edit" pointer - the whole point of the view.
    expect(frame).toContain("edit");
    expect(frame).toContain("live");
  }, 30_000);

  it("renders a loading hint when config is null", async () => {
    const { lastFrame } = render(
      React.createElement(ConfigPage, {
        config: null,
        selectedIndex: 0,
        setSelectedIndex: () => {},
        active: false,
      }),
    );
    await delay(20);
    expect(lastFrame() ?? "").toContain("loading");
  });
});

import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { loadConfig } from "../src/project/config-loader.js";
import type { ProjectConfig } from "../src/project/config-schema.js";
import type { CatalogOverlay } from "../src/providers/provider-catalog-overlay.js";
import { ProfilesPage } from "../src/shell/ink/pages/ProfilesPage.js";

const noProvider = async () => ({ exitCode: 127, stdout: "", stderr: "" });
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-shell-prof-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  return dir;
}

// Holds config state like the real App: refreshConfig reloads + re-renders.
function Harness({
  dir,
  initial,
  overlay,
}: {
  dir: string;
  initial: ProjectConfig;
  overlay?: CatalogOverlay;
}) {
  const [config, setConfig] = React.useState<ProjectConfig>(initial);
  const refreshConfig = React.useCallback(async () => {
    setConfig((await loadConfig(dir)).config);
  }, [dir]);
  return React.createElement(ProfilesPage, {
    projectRoot: dir,
    config,
    overlay,
    refreshConfig,
    onToast: () => {},
    selectedIndex: 0,
    setSelectedIndex: () => {},
    active: true,
  });
}

describe("shell Profiles page", () => {
  it("renders the profiles and edits effort from a keypress", async () => {
    const dir = await makeProject();
    const initial = (await loadConfig(dir)).config;
    // sanity: the default claude profile ships at effort medium
    expect(initial.profiles["claude-balanced"]?.power).toBe("medium");

    const { lastFrame, stdin } = render(
      React.createElement(Harness, { dir, initial }),
    );
    await delay(50);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("PROFILES");
    expect(frame).toContain("claude-balanced");
    expect(frame).toContain("medium"); // effort detail

    // Press 'e' -> cycle effort up (medium -> high), applied via setProfileFields.
    stdin.write("e");
    await delay(400);
    const after = (await loadConfig(dir)).config;
    expect(after.profiles["claude-balanced"]?.power).toBe("high");
  }, 30_000);

  it("flags an active overlay and the provider's catalog source (UI/CLI parity)", async () => {
    const dir = await makeProject();
    const initial = (await loadConfig(dir)).config;
    const overlay: CatalogOverlay = {
      cli: {
        claude: {
          effort: { levels: ["x", "y"], apply: { kind: "flag", flag: "--e" } },
        },
      },
    };
    const { lastFrame } = render(
      React.createElement(Harness, { dir, initial, overlay }),
    );
    await delay(50);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("overlay active"); // status line
    expect(frame).toContain("catalog"); // the source KV label
    expect(frame).toContain("overlay"); // selected provider's source value
  }, 30_000);
});

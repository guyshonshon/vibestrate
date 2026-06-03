import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { saveManualProposal } from "../src/project/manual-proposals.js";
import { ConsultPage } from "../src/shell/ink/pages/ConsultPage.js";

const noProvider = async () => ({ exitCode: 127, stdout: "", stderr: "" });
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-shell-consult-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  return dir;
}

describe("shell Consult page", () => {
  it("shows the ask hint and an open proposal", async () => {
    const dir = await makeProject();
    await saveManualProposal(dir, {
      id: "mp-x",
      rationale: "tests need a server command",
      suggestedText: "## Lessons\n- run pnpm test:server",
    });

    const { lastFrame } = render(
      React.createElement(ConsultPage, {
        projectRoot: dir,
        onToast: () => {},
        selectedIndex: 0,
        setSelectedIndex: () => {},
        active: true,
      }),
    );
    await delay(60);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("consult");
    expect(frame).toContain("Proposed VIBESTRATE.md updates");
    expect(frame).toContain("mp-x");
    expect(frame).toContain("apply");
  }, 30_000);
});

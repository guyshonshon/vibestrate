import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";
import { buildVibestrateProgram } from "../src/cli/index.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

// ── `vibe tasks show` has to show what the card's run will actually be given ──
// The dashboard renders a card's context sources in ContextSourcesSection, so a
// human there can see what a run off this card is seeded with. The CLI printed
// title, status, description, runs, checklist and comments - and nothing about
// context - so `specRef` (the approved spec-up spec) and any attached files were
// invisible from the terminal. That matters most for the spec: it is set by
// `vibe roadmap accept` without the user doing anything, so the only way to know
// a card carries one was to read the JSON.

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127, stdout: "", stderr: "",
});

async function project(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-taskshow-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  return dir;
}

/** Run `vibe tasks show <id>` and return everything it printed. */
async function tasksShow(dir: string, id: string, args: string[] = []): Promise<string> {
  const lines: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((...a) => {
    lines.push(a.map(String).join(" "));
  });
  const exit = vi
    .spyOn(process, "exit")
    .mockImplementation(((): never => undefined as never));
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    await buildVibestrateProgram().parseAsync(["node", "vibe", "tasks", "show", id, ...args]);
  } finally {
    process.chdir(cwd);
    log.mockRestore();
    exit.mockRestore();
  }
  return lines.join("\n");
}

describe("vibe tasks show surfaces the card's context", () => {
  let dir: string;
  let svc: RoadmapService;

  beforeEach(async () => {
    dir = await project();
    svc = new RoadmapService(dir);
    await svc.init();
  });
  afterEach(() => vi.restoreAllMocks());

  it("names the approved spec a card carries", async () => {
    const t = await svc.addTask({
      title: "Add team billing",
      specRef: ".vibestrate/roadmap/proposals/specs/spec-up-keen-magpie.md",
    });
    const out = await tasksShow(dir, t.id);
    expect(out).toContain("spec-up-keen-magpie.md");
  });

  it("lists the files and urls attached to the card", async () => {
    const t = await svc.addTask({ title: "Add team billing" });
    await svc.setContextSources(t.id, [
      { kind: "file", ref: "NOTES.md", label: "Owner note" },
      { kind: "url", ref: "https://example.com/rfc" },
    ]);
    const out = await tasksShow(dir, t.id);
    expect(out).toContain("NOTES.md");
    expect(out).toContain("https://example.com/rfc");
  });

  it("says nothing about context for a card that has none", async () => {
    const t = await svc.addTask({ title: "Plain card" });
    const out = await tasksShow(dir, t.id);
    expect(out).not.toMatch(/context/i);
  });

  it("leaves --json alone", async () => {
    const t = await svc.addTask({ title: "Add team billing", specRef: "a/b.md" });
    const parsed = JSON.parse(await tasksShow(dir, t.id, ["--json"])) as {
      task: { specRef: string | null };
    };
    expect(parsed.task.specRef).toBe("a/b.md");
  });
});

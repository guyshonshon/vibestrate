import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";
import { buildVibestrateProgram } from "../src/cli/index.js";
import { cmdShow } from "../src/cli/commands/tasks.js";
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

/** Run `vibe tasks show <id>` against `dir` and return everything it printed.
 *
 *  The handler is called directly with an explicit `cwd` rather than through
 *  `program.parseAsync`, because commander can only hand the handler the
 *  process-wide cwd - and pointing that at a temp project means
 *  process.chdir, which every other caller in this process sees too. The
 *  commander wiring these tests used to reach through is asserted separately
 *  below. See tests/no-chdir-in-tests.test.ts. */
async function tasksShow(
  dir: string,
  id: string,
  opts: { json?: boolean } = {},
): Promise<string> {
  const lines: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((...a) => {
    lines.push(a.map(String).join(" "));
  });
  try {
    await cmdShow(id, { ...opts, cwd: dir });
  } finally {
    log.mockRestore();
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
    const parsed = JSON.parse(await tasksShow(dir, t.id, { json: true })) as {
      task: { specRef: string | null };
    };
    expect(parsed.task.specRef).toBe("a/b.md");
  });

  // The tests above call cmdShow directly, so this is what still proves the
  // printing they assert on is reachable as `vibe tasks show <id> [--json]`.
  it("is reachable as `vibe tasks show <id> [--json]`", () => {
    const tasks = buildVibestrateProgram().commands.find((c) => c.name() === "tasks");
    const show = tasks?.commands.find((c) => c.name() === "show");
    expect(show, "`tasks show` is not registered").toBeDefined();
    expect(show!.registeredArguments.map((a) => a.name())).toEqual(["id"]);
    expect(show!.options.map((o) => o.long)).toContain("--json");
  });
});

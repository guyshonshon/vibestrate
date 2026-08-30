import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { runLearn } from "../src/cli/commands/learn.js";
import { loadCodebaseMap, codebaseMapMarkdownPath } from "../src/project/codebase-map.js";
import { loadTodoHarvest } from "../src/project/todo-harvest.js";
import { roadmapTodosHarvestFile } from "../src/utils/paths.js";

async function makeGitProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-learn-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo","scripts":{"test":"vitest"}}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  return dir;
}

async function commitFile(root: string, rel: string, body: string): Promise<void> {
  const abs = path.join(root, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, body);
  await execa("git", ["add", "."], { cwd: root });
  await execa("git", ["commit", "-q", "-m", `add ${rel}`], { cwd: root });
}

describe("runLearn", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await makeGitProject();
  });

  it("writes both artifacts and returns ok for a git project", async () => {
    const result = await runLearn(projectRoot, new Date().toISOString());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.scan.markdownPath).toBe(codebaseMapMarkdownPath(projectRoot));
    expect(result.scan.map.project.name).toBe("demo");
    expect(result.scan.map.totalTrackedFiles).toBeGreaterThan(0);

    const markdown = await fs.readFile(codebaseMapMarkdownPath(projectRoot), "utf8");
    expect(markdown).toContain("Codebase map");

    const loaded = await loadCodebaseMap(projectRoot);
    expect(loaded.present).toBe(true);
  });

  it("re-running succeeds as a refresh", async () => {
    const first = await runLearn(projectRoot, new Date().toISOString());
    expect(first.ok).toBe(true);

    await commitFile(projectRoot, "extra.ts", "export const x = 1;\n");

    const second = await runLearn(projectRoot, new Date().toISOString());
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("expected ok");
    expect(
      second.scan.map.entryPoints.length + second.scan.map.totalTrackedFiles,
    ).toBeGreaterThan(0);
  });

  // Not a git repo, no package.json: writeCodebaseMap degrades honestly here
  // (empty layout/routes + a "not a git repository" note) rather than
  // throwing, so runLearn's real success path is "ok: true" with a note -
  // asserting that instead of an invented failure case.
  it("still succeeds (with a degradation note) on an empty non-git directory", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-learn-empty-"));
    try {
      const result = await runLearn(dir, new Date().toISOString());
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected ok");
      expect(
        result.scan.map.notes.some((n) => n.toLowerCase().includes("git repository")),
      ).toBe(true);
      expect(result.scan.map.totalTrackedFiles).toBe(0);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("returns a typed failure (never throws) when the project root cannot be written to", async () => {
    // A regular FILE where a directory is expected: mkdir(".vibestrate", {recursive:true})
    // under it hits ENOTDIR, a real fs failure runLearn must surface as `ok: false`.
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-learn-blocked-"));
    const blockedRoot = path.join(dir, "not-a-directory");
    await fs.writeFile(blockedRoot, "not a directory");

    const result = await runLearn(blockedRoot, new Date().toISOString());
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(typeof result.error).toBe("string");
    expect(result.error.length).toBeGreaterThan(0);
  });
});

describe("runLearn TODO harvest", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await makeGitProject();
  });

  it("harvests real TODO comments and ignores non-comment markers", async () => {
    await commitFile(
      projectRoot,
      "src/app.ts",
      [
        "// TODO: wire the retry budget into the client",
        'const label = "TODO";',
        "export function go() { return label; } // FIXME: this returns the wrong thing",
        "const TODO_LIMIT = 3;",
      ].join("\n") + "\n",
    );

    const result = await runLearn(projectRoot, new Date().toISOString());
    if (!result.ok) throw new Error("expected ok");

    const harvest = result.scan.harvest;
    expect(harvest).not.toBeNull();
    const texts = harvest!.items.map((t) => t.text);
    expect(texts).toContain("wire the retry budget into the client");
    expect(texts).toContain("this returns the wrong thing");
    // The string literal and the identifier must never become candidate work.
    expect(harvest!.items).toHaveLength(2);
    expect(harvest!.counts).toEqual({ TODO: 1, FIXME: 1 });
    expect(result.scan.promotable).toBe(2);
  });

  it("writes the harvest under roadmap/todos, not at the .vibestrate root", async () => {
    await commitFile(projectRoot, "src/a.ts", "// TODO: something substantial here\n");
    await runLearn(projectRoot, new Date().toISOString());

    const onDisk = await fs.readFile(roadmapTodosHarvestFile(projectRoot), "utf8");
    expect(JSON.parse(onDisk).schemaVersion).toBe(1);

    // The root sibling is where it must NOT be - it is an internal component of
    // the roadmap subsystem, not a top-level project artifact.
    await expect(
      fs.access(path.join(projectRoot, ".vibestrate", "todos.json")),
    ).rejects.toThrow();
  });

  it("round-trips through the schema on load", async () => {
    await commitFile(projectRoot, "src/a.ts", "// FIXME: handle the timeout properly\n");
    const result = await runLearn(projectRoot, new Date().toISOString());
    if (!result.ok) throw new Error("expected ok");

    const loaded = await loadTodoHarvest(projectRoot);
    expect(loaded.present).toBe(true);
    expect(loaded.harvest).toEqual(result.scan.harvest);
  });

  it("treats a corrupt harvest as absent rather than throwing", async () => {
    await commitFile(projectRoot, "src/a.ts", "// TODO: something substantial here\n");
    await runLearn(projectRoot, new Date().toISOString());
    await fs.writeFile(roadmapTodosHarvestFile(projectRoot), "{ not json");

    const loaded = await loadTodoHarvest(projectRoot);
    expect(loaded.present).toBe(false);
    expect(loaded.harvest).toBeNull();
  });

  it("treats a schema-version mismatch as absent", async () => {
    await commitFile(projectRoot, "src/a.ts", "// TODO: something substantial here\n");
    await runLearn(projectRoot, new Date().toISOString());
    const file = roadmapTodosHarvestFile(projectRoot);
    const parsed = JSON.parse(await fs.readFile(file, "utf8"));
    parsed.schemaVersion = 99;
    await fs.writeFile(file, JSON.stringify(parsed));

    expect((await loadTodoHarvest(projectRoot)).present).toBe(false);
  });

  it("counts low-signal markers but never offers them for promotion", async () => {
    await commitFile(
      projectRoot,
      "src/a.ts",
      ["// TODO", "// TODO: fix", "// TODO: rewrite the pagination logic"].join("\n") + "\n",
    );

    const result = await runLearn(projectRoot, new Date().toISOString());
    if (!result.ok) throw new Error("expected ok");

    expect(result.scan.harvest!.total).toBe(3);
    expect(result.scan.promotable).toBe(1);
  });

  it("redacts a secret that appears inside a TODO comment", async () => {
    await commitFile(
      projectRoot,
      "src/a.ts",
      '// TODO: stop hardcoding api_key = "sk_live_ABCDEF1234567890" in the client\n',
    );

    await runLearn(projectRoot, new Date().toISOString());
    const onDisk = await fs.readFile(roadmapTodosHarvestFile(projectRoot), "utf8");
    expect(onDisk).not.toContain("sk_live_ABCDEF1234567890");
    expect(onDisk).toContain("REDACTED");
  });

  it("folds counts into the codebase map without carrying the entries", async () => {
    await commitFile(projectRoot, "src/a.ts", "// TODO: rewrite the pagination logic\n");
    const result = await runLearn(projectRoot, new Date().toISOString());
    if (!result.ok) throw new Error("expected ok");

    expect(result.scan.map.todos).toEqual({
      counts: { TODO: 1 },
      total: 1,
      truncated: false,
    });
    // The map must stay lean: it is fetched on every Codebase page load and its
    // projection is prompt-adjacent, so entries belong in the harvest only.
    const mapJson = await fs.readFile(
      path.join(projectRoot, ".vibestrate", "codebase-map.json"),
      "utf8",
    );
    expect(mapJson).not.toContain("rewrite the pagination logic");

    const markdown = await fs.readFile(codebaseMapMarkdownPath(projectRoot), "utf8");
    expect(markdown).toContain("## TODOs");
    expect(markdown).toContain("1 marker: 1 TODO");
    expect(markdown).not.toContain("rewrite the pagination logic");
  });
});

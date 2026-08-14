import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { runLearn } from "../src/cli/commands/learn.js";
import {
  TodoPromoteService,
  TodoPromoteError,
  buildTodoView,
  boardFingerprintsOf,
  readDismissals,
} from "../src/roadmap/todo-promote-service.js";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";
import { roadmapTodosDismissedFile } from "../src/utils/paths.js";
import type { TodosFile } from "../src/project/todo-harvest.js";

async function makeProject(files: Record<string, string>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-todos-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, body);
  }
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await runLearn(dir, new Date().toISOString());
  return dir;
}

const THREE_TODOS = {
  "src/a.ts": [
    "// TODO: rewrite the pagination logic",
    "// FIXME: the retry budget is never applied",
  ].join("\n"),
  "src/b.ts": "// TODO: cache the provider catalog lookup\n",
};

async function fingerprintsOf(root: string): Promise<Record<string, string>> {
  const svc = new TodoPromoteService(root);
  const out: Record<string, string> = {};
  for (const item of (await svc.overview()).items) out[item.text] = item.fingerprint;
  return out;
}

describe("TodoPromoteService.overview", () => {
  let root: string;
  beforeEach(async () => {
    root = await makeProject(THREE_TODOS);
  });

  it("reports every harvested TODO as promotable on a fresh board", async () => {
    const view = await new TodoPromoteService(root).overview();
    expect(view.present).toBe(true);
    expect(view.items).toHaveLength(3);
    expect(view.counts.promotable).toBe(3);
    expect(view.counts.onBoard).toBe(0);
    expect(view.counts.dismissed).toBe(0);
  });

  it("is empty (not an error) before any scan has run", async () => {
    const bare = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-todos-bare-"));
    try {
      const view = await new TodoPromoteService(bare).overview();
      expect(view.present).toBe(false);
      expect(view.items).toEqual([]);
    } finally {
      await fs.rm(bare, { recursive: true, force: true });
    }
  });
});

describe("the board is the ledger", () => {
  let root: string;
  beforeEach(async () => {
    root = await makeProject(THREE_TODOS);
  });

  it("moves a promoted TODO to on_board and links the card", async () => {
    const svc = new TodoPromoteService(root);
    const fp = (await fingerprintsOf(root))["rewrite the pagination logic"]!;

    const result = await svc.promote({ selections: [{ fingerprint: fp }] });
    expect(result.promoted).toHaveLength(1);

    const view = await svc.overview();
    const item = view.items.find((t) => t.fingerprint === fp)!;
    expect(item.state).toBe("on_board");
    expect(item.taskId).toBe(result.promoted[0]!.taskId);
    expect(view.counts.promotable).toBe(2);
  });

  it("survives a re-scan without re-offering the promoted TODO", async () => {
    const svc = new TodoPromoteService(root);
    const fp = (await fingerprintsOf(root))["rewrite the pagination logic"]!;
    await svc.promote({ selections: [{ fingerprint: fp }] });

    // The harvest is regenerated wholesale; the board is what remembers.
    await runLearn(root, new Date().toISOString());

    const view = await svc.overview();
    expect(view.items.find((t) => t.fingerprint === fp)!.state).toBe("on_board");
    expect(view.counts.promotable).toBe(2);
  });

  it("returns the TODO to promotable when its card is deleted (self-healing)", async () => {
    const svc = new TodoPromoteService(root);
    const roadmap = new RoadmapService(root);
    const fp = (await fingerprintsOf(root))["rewrite the pagination logic"]!;

    const result = await svc.promote({ selections: [{ fingerprint: fp }] });
    await roadmap.deleteTask(result.promoted[0]!.taskId);

    const view = await svc.overview();
    expect(view.items.find((t) => t.fingerprint === fp)!.state).toBe("promotable");
    expect(view.counts.promotable).toBe(3);
  });

  it("survives line drift: editing above a TODO does not orphan its card", async () => {
    const svc = new TodoPromoteService(root);
    const fp = (await fingerprintsOf(root))["cache the provider catalog lookup"]!;
    await svc.promote({ selections: [{ fingerprint: fp }] });

    await fs.writeFile(
      path.join(root, "src/b.ts"),
      "const a = 1;\nconst b = 2;\nconst c = 3;\n// TODO: cache the provider catalog lookup\n",
    );
    await execa("git", ["add", "."], { cwd: root });
    await execa("git", ["commit", "-q", "-m", "drift"], { cwd: root });
    await runLearn(root, new Date().toISOString());

    const view = await svc.overview();
    const item = view.items.find((t) => t.fingerprint === fp)!;
    expect(item.line).toBe(4);
    expect(item.state).toBe("on_board");
  });
});

describe("promote", () => {
  let root: string;
  beforeEach(async () => {
    root = await makeProject(THREE_TODOS);
  });

  it("records provenance on the created card", async () => {
    const svc = new TodoPromoteService(root);
    const fp = (await fingerprintsOf(root))["the retry budget is never applied"]!;
    const result = await svc.promote({ selections: [{ fingerprint: fp }] });

    const task = await new RoadmapService(root).getTask(result.promoted[0]!.taskId);
    expect(task!.source).toEqual({
      kind: "code-todo",
      path: "src/a.ts",
      line: 2,
      marker: "FIXME",
      fingerprint: fp,
    });
    expect(task!.priority).toBe("high");
    expect(task!.touchedFiles).toEqual(["src/a.ts"]);
    expect(task!.description).toContain("src/a.ts:2");
  });

  it("applies title and priority overrides to the card, never to the harvest", async () => {
    const svc = new TodoPromoteService(root);
    const fp = (await fingerprintsOf(root))["rewrite the pagination logic"]!;
    const before = await fs.readFile(
      path.join(root, ".vibestrate/roadmap/todos/harvest.json"),
      "utf8",
    );

    const result = await svc.promote({
      selections: [
        { fingerprint: fp, overrides: { title: "Paginate the runs list", priority: "high" } },
      ],
    });

    const task = await new RoadmapService(root).getTask(result.promoted[0]!.taskId);
    expect(task!.title).toBe("Paginate the runs list");
    expect(task!.priority).toBe("high");

    const after = await fs.readFile(
      path.join(root, ".vibestrate/roadmap/todos/harvest.json"),
      "utf8",
    );
    expect(after).toBe(before);
  });

  it("skips a fingerprint already on the board instead of duplicating it", async () => {
    const svc = new TodoPromoteService(root);
    const fp = (await fingerprintsOf(root))["rewrite the pagination logic"]!;
    await svc.promote({ selections: [{ fingerprint: fp }] });

    const second = await svc.promote({ selections: [{ fingerprint: fp }] });
    expect(second.promoted).toHaveLength(0);
    expect(second.skipped).toEqual([{ fingerprint: fp, reason: "already_on_board" }]);
    expect(await new RoadmapService(root).listTasks()).toHaveLength(1);
  });

  it("skips an unknown fingerprint", async () => {
    const result = await new TodoPromoteService(root).promote({
      selections: [{ fingerprint: "deadbeefdeadbeef" }],
    });
    expect(result.skipped).toEqual([
      { fingerprint: "deadbeefdeadbeef", reason: "unknown" },
    ]);
  });

  it("throws a typed error when no harvest exists", async () => {
    const bare = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-todos-none-"));
    try {
      await expect(
        new TodoPromoteService(bare).promote({ selections: [{ fingerprint: "x" }] }),
      ).rejects.toBeInstanceOf(TodoPromoteError);
    } finally {
      await fs.rm(bare, { recursive: true, force: true });
    }
  });

  // THE DOCTRINE TEST. Per-item isolation, not all-or-nothing: one bad item must
  // degrade to a reported failure while the rest of the batch still lands.
  // Reintroducing a transactional rollback has to fail this.
  it("lands the good items when one selection fails", async () => {
    const svc = new TodoPromoteService(root);
    const fps = await fingerprintsOf(root);

    const result = await svc.promote({
      selections: [
        { fingerprint: fps["rewrite the pagination logic"]! },
        // An empty override title is rejected by addTask - a real per-item failure.
        { fingerprint: fps["the retry budget is never applied"]!, overrides: { title: "   " } },
        { fingerprint: fps["cache the provider catalog lookup"]! },
      ],
    });

    expect(result.promoted).toHaveLength(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.fingerprint).toBe(fps["the retry budget is never applied"]);
    // The two good cards exist. All-or-nothing would have created zero.
    expect(await new RoadmapService(root).listTasks()).toHaveLength(2);
  });
});

describe("dismissal", () => {
  let root: string;
  beforeEach(async () => {
    root = await makeProject(THREE_TODOS);
  });

  it("hides a dismissed TODO and survives a re-scan", async () => {
    const svc = new TodoPromoteService(root);
    const fp = (await fingerprintsOf(root))["rewrite the pagination logic"]!;

    await svc.dismiss([fp]);
    expect((await svc.overview()).counts.promotable).toBe(2);

    // The harvest is clobbered on every scan; the dismissal file is what makes
    // "not this one" stick.
    await runLearn(root, new Date().toISOString());
    const view = await svc.overview();
    expect(view.items.find((t) => t.fingerprint === fp)!.state).toBe("dismissed");
    expect(view.counts.promotable).toBe(2);
    expect(view.counts.dismissed).toBe(1);
  });

  it("is reversible", async () => {
    const svc = new TodoPromoteService(root);
    const fp = (await fingerprintsOf(root))["rewrite the pagination logic"]!;
    await svc.dismiss([fp]);
    await svc.undismiss([fp]);

    const view = await svc.overview();
    expect(view.items.find((t) => t.fingerprint === fp)!.state).toBe("promotable");
    expect(view.counts.promotable).toBe(3);
  });

  it("is idempotent and keeps the first timestamp", async () => {
    const svc = new TodoPromoteService(root);
    const fp = (await fingerprintsOf(root))["rewrite the pagination logic"]!;
    const first = await svc.dismiss([fp]);
    const second = await svc.dismiss([fp]);
    expect(second.dismissed).toHaveLength(1);
    expect(second.dismissed[0]!.dismissedAt).toBe(first.dismissed[0]!.dismissedAt);
  });

  it("refuses to promote a dismissed TODO", async () => {
    const svc = new TodoPromoteService(root);
    const fp = (await fingerprintsOf(root))["rewrite the pagination logic"]!;
    await svc.dismiss([fp]);

    const result = await svc.promote({ selections: [{ fingerprint: fp }] });
    expect(result.promoted).toHaveLength(0);
    expect(result.skipped).toEqual([{ fingerprint: fp, reason: "dismissed" }]);
  });

  it("writes its lock as a sibling, never over the decisions themselves", async () => {
    const svc = new TodoPromoteService(root);
    const fp = (await fingerprintsOf(root))["rewrite the pagination logic"]!;
    await svc.dismiss([fp]);

    // Locking the data file itself would leave lock metadata (pid/host/token)
    // where the dismissals should be.
    const onDisk = JSON.parse(
      await fs.readFile(roadmapTodosDismissedFile(root), "utf8"),
    );
    expect(onDisk.schemaVersion).toBe(1);
    expect(onDisk.dismissed[0].fingerprint).toBe(fp);
    expect(onDisk.pid).toBeUndefined();
  });

  // A dismissal cannot be recomputed from anything, so unlike the harvest it
  // must NOT be silently treated as empty when damaged - that would resurrect
  // every TODO the user already rejected.
  it("fails loudly on a corrupt dismissal file", async () => {
    await fs.writeFile(roadmapTodosDismissedFile(root), "{ not json");
    await expect(readDismissals(root)).rejects.toBeInstanceOf(TodoPromoteError);
    await expect(new TodoPromoteService(root).overview()).rejects.toThrow();
  });
});

describe("view derivation", () => {
  const harvest = {
    schemaVersion: 1,
    generatedAt: "2026-08-14T00:00:00.000Z",
    rev: null,
    counts: { TODO: 1 },
    total: 1,
    truncated: false,
    notes: [],
    items: [
      {
        fingerprint: "aaaa1111",
        marker: "TODO" as const,
        path: "src/a.ts",
        line: 1,
        raw: "// TODO: x",
        text: "do the thing properly",
        suggestedTitle: "Do the thing properly",
        suggestedPriority: "medium" as const,
        area: "src",
        lowSignal: false,
      },
    ],
  } satisfies TodosFile;

  it("lets an existing card win over a dismissal", () => {
    // Dismissed, then promoted anyway: it must read as on_board rather than
    // hiding in the dismissed tab where the card cannot be reached.
    const view = buildTodoView(
      harvest,
      new Map([["aaaa1111", "task-1"]]),
      new Map([["aaaa1111", "2026-08-14T00:00:00.000Z"]]),
    );
    expect(view[0]!.state).toBe("on_board");
    expect(view[0]!.taskId).toBe("task-1");
  });

  it("ignores tasks with no source or a foreign source kind", () => {
    const map = boardFingerprintsOf([
      { id: "t1", source: null },
      { id: "t2", source: { kind: "something-else", fingerprint: "aaaa1111" } },
      { id: "t3", source: { kind: "code-todo", fingerprint: "bbbb2222" } },
    ]);
    expect(map.get("aaaa1111")).toBeUndefined();
    expect(map.get("bbbb2222")).toBe("t3");
  });
});

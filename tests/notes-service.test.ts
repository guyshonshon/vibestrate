import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  addNote,
  listNotes,
  resolveNote,
} from "../src/notes/notes-service.js";

async function tempProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "amaco-notes-"));
  await fs.mkdir(path.join(dir, ".amaco", "runs", "r1"), { recursive: true });
  return dir;
}

describe("notes service", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await tempProject();
  });

  it("adds a note and lists it", async () => {
    const note = await addNote(projectRoot, "r1", {
      scope: "run",
      target: "r1",
      message: "ping",
    });
    expect(note.id).toBeTruthy();
    const list = await listNotes(projectRoot, "r1");
    expect(list).toHaveLength(1);
    expect(list[0]!.message).toBe("ping");
    expect(list[0]!.resolved).toBe(false);
  });

  it("resolve marks resolved=true and resolvedAt", async () => {
    const n = await addNote(projectRoot, "r1", {
      scope: "run",
      target: "r1",
      message: "fixme",
    });
    const updated = await resolveNote(projectRoot, "r1", n.id);
    expect(updated?.resolved).toBe(true);
    expect(updated?.resolvedAt).toBeTruthy();
  });

  it("listNotes filters resolved by default and sorts unresolved first", async () => {
    const a = await addNote(projectRoot, "r1", {
      scope: "run",
      target: "r1",
      message: "first",
    });
    await addNote(projectRoot, "r1", {
      scope: "stage",
      target: "executing",
      message: "second",
    });
    await resolveNote(projectRoot, "r1", a.id);

    const onlyOpen = await listNotes(projectRoot, "r1");
    expect(onlyOpen).toHaveLength(1);
    expect(onlyOpen[0]!.message).toBe("second");

    const all = await listNotes(projectRoot, "r1", { includeResolved: true });
    expect(all).toHaveLength(2);
    expect(all[0]!.resolved).toBe(false);
    expect(all[1]!.resolved).toBe(true);
  });

  it("rejects empty messages", async () => {
    await expect(
      addNote(projectRoot, "r1", { scope: "run", target: "r1", message: "" }),
    ).rejects.toThrow();
  });

  it("returns null when resolving an unknown id", async () => {
    const n = await resolveNote(projectRoot, "r1", "ghost");
    expect(n).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  addAnnotation,
  AnnotationError,
  deleteAnnotation,
  listAnnotations,
  renderAnnotationsForPrompt,
  updateAnnotation,
} from "../src/core/annotations-service.js";

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-annotations-"));
  await fs.mkdir(path.join(root, ".vibestrate"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("annotations service", () => {
  it("adds and lists a file-level annotation", async () => {
    const a = await addAnnotation(root, {
      path: "src/index.ts",
      body: "Entry point — keep the bin shim in sync.",
    });
    expect(a.line).toBeNull();
    expect(a.endLine).toBeNull();
    expect(a.shareWithRoles).toBe(true);
    expect(a.status).toBe("open");

    const list = await listAnnotations(root, { path: "src/index.ts" });
    expect(list).toHaveLength(1);
    expect(list[0]!.body).toContain("Entry point");
  });

  it("supports line and range anchors; collapses a one-line range", async () => {
    const line = await addAnnotation(root, { path: "a.ts", line: 12, body: "this fn" });
    expect(line.line).toBe(12);
    expect(line.endLine).toBeNull();

    const range = await addAnnotation(root, {
      path: "a.ts",
      line: 5,
      endLine: 9,
      body: "this block",
    });
    expect(range.line).toBe(5);
    expect(range.endLine).toBe(9);

    const collapsed = await addAnnotation(root, {
      path: "a.ts",
      line: 7,
      endLine: 7,
      body: "single",
    });
    expect(collapsed.endLine).toBeNull();
  });

  it("rejects a secret-like path", async () => {
    await expect(
      addAnnotation(root, { path: ".env", body: "note" }),
    ).rejects.toBeInstanceOf(AnnotationError);
  });

  it("rejects path traversal", async () => {
    await expect(
      addAnnotation(root, { path: "../../etc/passwd", body: "note" }),
    ).rejects.toBeInstanceOf(AnnotationError);
  });

  it("refuses a body containing a secret-shaped token", async () => {
    await expect(
      addAnnotation(root, {
        path: "a.ts",
        body: "the key is AKIAIOSFODNN7EXAMPLE do not commit",
      }),
    ).rejects.toBeInstanceOf(AnnotationError);
  });

  it("rejects an end line before the start line", async () => {
    await expect(
      addAnnotation(root, { path: "a.ts", line: 10, endLine: 4, body: "x" }),
    ).rejects.toBeInstanceOf(AnnotationError);
  });

  it("resolves, reopens, and deletes", async () => {
    const a = await addAnnotation(root, { path: "a.ts", body: "x" });
    const resolved = await updateAnnotation(root, a.id, { status: "resolved" });
    expect(resolved.status).toBe("resolved");
    await deleteAnnotation(root, a.id);
    expect(await listAnnotations(root)).toHaveLength(0);
    await expect(deleteAnnotation(root, a.id)).rejects.toBeInstanceOf(AnnotationError);
  });

  it("renders only shared, open notes for the prompt with correct anchors", async () => {
    await addAnnotation(root, { path: "a.ts", line: 3, body: "shared line note" });
    await addAnnotation(root, {
      path: "b.ts",
      line: 5,
      endLine: 8,
      body: "shared range note",
    });
    const priv = await addAnnotation(root, {
      path: "c.ts",
      body: "private note",
      shareWithRoles: false,
    });
    const done = await addAnnotation(root, { path: "d.ts", body: "resolved note" });
    await updateAnnotation(root, done.id, { status: "resolved" });

    const section = renderAnnotationsForPrompt(await listAnnotations(root));
    expect(section).toContain("# Human Annotations");
    expect(section).toContain("a.ts:3");
    expect(section).toContain("b.ts:5-8");
    expect(section).toContain("shared range note");
    expect(section).not.toContain("private note");
    expect(section).not.toContain("resolved note");
    expect(priv.shareWithRoles).toBe(false);
  });

  it("renders empty string when nothing is shared", async () => {
    await addAnnotation(root, { path: "a.ts", body: "x", shareWithRoles: false });
    expect(renderAnnotationsForPrompt(await listAnnotations(root))).toBe("");
  });
});

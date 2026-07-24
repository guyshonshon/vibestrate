import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { materializeContextSources } from "../src/core/context/context-sources.js";
import type { FetchImpl } from "../src/flows/runtime/flow-portability.js";

function okFetch(body: string): FetchImpl {
  return async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => body,
  });
}

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-ctx-"));
}

describe("materializeContextSources - files", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await tempProject();
  });

  it("reads a project file into a prompt artifact", async () => {
    await fs.writeFile(path.join(dir, "notes.md"), "# Spec\nThe widget must spin.");
    const r = await materializeContextSources({
      sources: [{ kind: "file", ref: "notes.md", label: "spec" }],
      projectRoot: dir,
      worktreePath: null,
      allowUrlFetch: false,
    });
    expect(r.artifacts).toHaveLength(1);
    expect(r.artifacts[0]!.label).toBe("Context - spec");
    expect(r.artifacts[0]!.content).toContain("The widget must spin.");
    expect(r.notes).toEqual([]);
  });

  it("refuses traversal and outside-root paths (skips with a note)", async () => {
    const r = await materializeContextSources({
      sources: [{ kind: "file", ref: "../../etc/passwd" }],
      projectRoot: dir,
      worktreePath: null,
      allowUrlFetch: false,
    });
    expect(r.artifacts).toHaveLength(0);
    expect(r.notes[0]).toMatch(/Refused|outside|'\.\.'/);
  });

  it("refuses a secret-like file path (e.g. .env)", async () => {
    await fs.writeFile(path.join(dir, ".env"), "SECRET=hunter2");
    const r = await materializeContextSources({
      sources: [{ kind: "file", ref: ".env" }],
      projectRoot: dir,
      worktreePath: null,
      allowUrlFetch: false,
    });
    expect(r.artifacts).toHaveLength(0);
    expect(r.notes[0]).toMatch(/secret-like/);
  });

  it("redacts secret-shaped content inside an allowed file", async () => {
    await fs.writeFile(
      path.join(dir, "config.md"),
      "key: AKIAIOSFODNN7EXAMPLE\nrest of doc",
    );
    const r = await materializeContextSources({
      sources: [{ kind: "file", ref: "config.md" }],
      projectRoot: dir,
      worktreePath: null,
      allowUrlFetch: false,
    });
    expect(r.artifacts[0]!.content).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(r.artifacts[0]!.content).toContain("[REDACTED:");
    expect(r.artifacts[0]!.content).toContain("redacted)");
  });

  it("notes a missing file rather than failing", async () => {
    const r = await materializeContextSources({
      sources: [{ kind: "file", ref: "nope.md" }],
      projectRoot: dir,
      worktreePath: null,
      allowUrlFetch: false,
    });
    expect(r.artifacts).toHaveLength(0);
    expect(r.notes[0]).toMatch(/not found|unreadable/);
  });

  it("refuses a .pdf context source by extension - content never reaches the prompt", async () => {
    // Not a real PDF, just binary-ish bytes; the extension denylist should
    // refuse it before any content-based sniff even runs.
    await fs.writeFile(path.join(dir, "spec.pdf"), Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0x01, 0x02]));
    const r = await materializeContextSources({
      sources: [{ kind: "file", ref: "spec.pdf" }],
      projectRoot: dir,
      worktreePath: null,
      allowUrlFetch: false,
    });
    expect(r.artifacts).toHaveLength(0);
    expect(r.notes[0]).toMatch(/Refused context file "spec\.pdf"/);
    expect(r.notes[0]).toMatch(/\.pdf/);
    expect(r.notes[0]).toMatch(/not supported/);
  });

  it("refuses a binary file with a NUL byte even without a binary extension", async () => {
    await fs.writeFile(
      path.join(dir, "weird.txt"),
      Buffer.from([0x68, 0x69, 0x00, 0x01, 0x02, 0x03, 0xff, 0xfe]),
    );
    const r = await materializeContextSources({
      sources: [{ kind: "file", ref: "weird.txt" }],
      projectRoot: dir,
      worktreePath: null,
      allowUrlFetch: false,
    });
    expect(r.artifacts).toHaveLength(0);
    expect(r.notes[0]).toMatch(/Refused context file "weird\.txt"/);
    expect(r.notes[0]).toMatch(/binary/);
  });

  it("still reads legitimate UTF-8 text with emoji and CJK", async () => {
    await fs.writeFile(
      path.join(dir, "i18n.md"),
      "Status update: shipped the widget! \u{1F389}\u{1F680}\nChinese: 你好世界\nJapanese: こんにちは",
    );
    const r = await materializeContextSources({
      sources: [{ kind: "file", ref: "i18n.md" }],
      projectRoot: dir,
      worktreePath: null,
      allowUrlFetch: false,
    });
    expect(r.artifacts).toHaveLength(1);
    expect(r.notes).toEqual([]);
    expect(r.artifacts[0]!.content).toContain("shipped the widget");
    expect(r.artifacts[0]!.content).toContain("你好世界");
  });

  it("still reads a .json and a minified .js file unchanged", async () => {
    await fs.writeFile(path.join(dir, "data.json"), JSON.stringify({ a: 1, b: [1, 2, 3] }));
    await fs.writeFile(path.join(dir, "bundle.min.js"), "!function(){var a=1,b=2;console.log(a+b)}();");
    const r = await materializeContextSources({
      sources: [
        { kind: "file", ref: "data.json" },
        { kind: "file", ref: "bundle.min.js" },
      ],
      projectRoot: dir,
      worktreePath: null,
      allowUrlFetch: false,
    });
    expect(r.notes).toEqual([]);
    expect(r.artifacts).toHaveLength(2);
    expect(r.artifacts[0]!.content).toContain('"a":1');
    expect(r.artifacts[1]!.content).toContain("console.log(a+b)");
  });

  it("refusing one binary source does not block other valid sources in the same run", async () => {
    await fs.writeFile(path.join(dir, "good.md"), "# Real notes\nThis is readable.");
    await fs.writeFile(path.join(dir, "bad.pdf"), Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00]));
    const r = await materializeContextSources({
      sources: [
        { kind: "file", ref: "bad.pdf" },
        { kind: "file", ref: "good.md" },
      ],
      projectRoot: dir,
      worktreePath: null,
      allowUrlFetch: false,
    });
    expect(r.artifacts).toHaveLength(1);
    expect(r.artifacts[0]!.content).toContain("This is readable.");
    expect(r.notes).toHaveLength(1);
    expect(r.notes[0]).toMatch(/bad\.pdf/);
  });
});

describe("materializeContextSources - urls", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await tempProject();
  });

  it("skips URL sources when fetch is not enabled (opt-in)", async () => {
    const r = await materializeContextSources({
      sources: [{ kind: "url", ref: "https://example.com/x" }],
      projectRoot: dir,
      worktreePath: null,
      allowUrlFetch: false,
    });
    expect(r.artifacts).toHaveLength(0);
    expect(r.notes[0]).toMatch(/opt-in/);
  });

  it("blocks SSRF (localhost / private) even when fetch is enabled", async () => {
    const r = await materializeContextSources({
      sources: [{ kind: "url", ref: "http://localhost:8080/secret" }],
      projectRoot: dir,
      worktreePath: null,
      allowUrlFetch: true,
      fetchImpl: okFetch("should never be read"),
    });
    expect(r.artifacts).toHaveLength(0);
    expect(r.notes[0]).toMatch(/SSRF|private\/loopback/);
  });

  it("fetches a public URL, redacting secrets before the prompt", async () => {
    const r = await materializeContextSources({
      sources: [{ kind: "url", ref: "https://example.com/doc", label: "doc" }],
      projectRoot: dir,
      worktreePath: null,
      allowUrlFetch: true,
      fetchImpl: okFetch("body with sk-ant-" + "a".repeat(50) + " token"),
    });
    expect(r.artifacts).toHaveLength(1);
    expect(r.artifacts[0]!.content).toContain("body with");
    expect(r.artifacts[0]!.content).not.toContain("sk-ant-aaaa");
    expect(r.artifacts[0]!.content).toContain("[REDACTED:");
  });
});

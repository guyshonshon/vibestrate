import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { materializeContextSources } from "../src/core/context-sources.js";
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

describe("materializeContextSources — files", () => {
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
    expect(r.artifacts[0]!.label).toBe("Context — spec");
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
});

describe("materializeContextSources — urls", () => {
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

import { describe, it, expect } from "vitest";
import { listDocs, readDoc } from "../src/shell/ink/docs-source.js";

describe("docs-source", () => {
  it("lists topics from the bundled _nav.json", async () => {
    const topics = await listDocs();
    expect(topics.length).toBeGreaterThan(0);
    expect(topics.every((t) => t.slug && t.label && t.section)).toBe(true);
    expect(topics.some((t) => t.slug === "cli/shell")).toBe(true);
  });

  // The bug this exists for: listDocs returned every entry in _nav.json,
  // including the 7 `generated` ones that are rendered by the website from
  // docs/generated/*.json and have no markdown file anywhere. Selecting one in
  // `vibe shell` failed with a raw ENOENT that printed the absolute path at the
  // reader. Reading one hand-picked slug could never catch that - the listed
  // topics and the readable ones have to be the same set.
  it("returns only topics that can actually be read", async () => {
    const topics = await listDocs();
    const broken: string[] = [];
    for (const t of topics) {
      try {
        await readDoc(t.slug);
      } catch {
        broken.push(t.slug);
      }
    }
    expect({ broken }).toEqual({ broken: [] });
  });

  it("reads a doc by slug", async () => {
    const md = await readDoc("cli/shell");
    expect(md).toContain("Interactive shell");
  });

  it("refuses slugs that escape the docs directory", async () => {
    await expect(readDoc("../../package")).rejects.toThrow();
  });
});

import { describe, it, expect } from "vitest";
import { listDocs, readDoc } from "../src/shell/ink/docs-source.js";

describe("docs-source", () => {
  it("lists topics from the bundled _nav.json", async () => {
    const topics = await listDocs();
    expect(topics.length).toBeGreaterThan(0);
    expect(topics.every((t) => t.slug && t.label && t.section)).toBe(true);
    expect(topics.some((t) => t.slug === "cli/shell")).toBe(true);
  });

  it("reads a doc by slug", async () => {
    const md = await readDoc("cli/shell");
    expect(md).toContain("Interactive shell");
  });

  it("refuses slugs that escape the docs directory", async () => {
    await expect(readDoc("../../package")).rejects.toThrow();
  });
});

// The composed project ruleset: rules.md plus .vibestrate/rules/*.md.
//
// The safety tests here are not ceremony. This text goes into EVERY role turn
// of every run and into every assist call, so a secret pasted into a rule file
// reaches more prompts than a secret anywhere else in the product, and a
// silently truncated ruleset means agents are working from instructions the
// owner believes they have.

import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  loadProjectRuleset,
  rulesetWarnings,
} from "../src/project/project-rules.js";

const FALLBACK = "(built-in default rules)";

let root: string;

async function project(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-rules-"));
  await fs.mkdir(path.join(dir, ".vibestrate"), { recursive: true });
  return dir;
}

async function writeRule(dir: string, rel: string, body: string) {
  const abs = path.join(dir, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, body);
}

beforeEach(async () => {
  root = await project();
});

describe("composing the ruleset", () => {
  it("falls back to the built-in default when the project has no rules", async () => {
    const rs = await loadProjectRuleset(root, FALLBACK);
    expect(rs.text).toBe(FALLBACK);
    expect(rs.sources).toEqual([]);
  });

  it("uses rules.md alone, unheaded, when there is no directory", async () => {
    await writeRule(root, ".vibestrate/rules.md", "Always write tests.");
    const rs = await loadProjectRuleset(root, FALLBACK);
    expect(rs.text).toBe("Always write tests.");
    // A single-file ruleset gets no "## .vibestrate/rules.md" heading - there is
    // nothing to disambiguate, and the heading would just be prompt overhead.
    expect(rs.text).not.toContain("##");
    expect(rs.sources.map((s) => s.relativePath)).toEqual([".vibestrate/rules.md"]);
  });

  it("composes the directory after rules.md, sorted, each attributed", async () => {
    await writeRule(root, ".vibestrate/rules.md", "Root rule.");
    await writeRule(root, ".vibestrate/rules/20-testing.md", "Test rule.");
    await writeRule(root, ".vibestrate/rules/10-style.md", "Style rule.");
    const rs = await loadProjectRuleset(root, FALLBACK);

    expect(rs.sources.map((s) => s.relativePath)).toEqual([
      ".vibestrate/rules.md",
      ".vibestrate/rules/10-style.md",
      ".vibestrate/rules/20-testing.md",
    ]);
    // Attribution: a rule can be traced back to the file carrying it.
    expect(rs.text).toContain("## .vibestrate/rules/10-style.md");
    expect(rs.text.indexOf("Root rule.")).toBeLessThan(rs.text.indexOf("Style rule."));
    expect(rs.text.indexOf("Style rule.")).toBeLessThan(rs.text.indexOf("Test rule."));
  });

  it("is reproducible: the same project composes to the same text twice", async () => {
    await writeRule(root, ".vibestrate/rules/b.md", "B");
    await writeRule(root, ".vibestrate/rules/a.md", "A");
    const first = await loadProjectRuleset(root, FALLBACK);
    const second = await loadProjectRuleset(root, FALLBACK);
    expect(first.text).toBe(second.text);
  });

  it("works with the directory alone (no rules.md)", async () => {
    await writeRule(root, ".vibestrate/rules/only.md", "The only rule.");
    const rs = await loadProjectRuleset(root, FALLBACK);
    expect(rs.text).toContain("The only rule.");
    expect(rs.text).not.toContain(FALLBACK);
  });

  it("ignores non-markdown files, subdirectories and empty files", async () => {
    await writeRule(root, ".vibestrate/rules/keep.md", "Kept.");
    await writeRule(root, ".vibestrate/rules/notes.txt", "Ignored.");
    await writeRule(root, ".vibestrate/rules/blank.md", "   \n  ");
    await writeRule(root, ".vibestrate/rules/nested/deep.md", "Not walked.");
    const rs = await loadProjectRuleset(root, FALLBACK);
    expect(rs.sources.map((s) => s.relativePath)).toEqual([
      ".vibestrate/rules/keep.md",
    ]);
    expect(rs.text).not.toContain("Ignored.");
    expect(rs.text).not.toContain("Not walked.");
  });
});

describe("what protects every prompt", () => {
  it("redacts secret-shaped values before they can reach a prompt", async () => {
    await writeRule(
      root,
      ".vibestrate/rules/creds.md",
      "Use this key: sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    );
    const rs = await loadProjectRuleset(root, FALLBACK);
    expect(rs.text).not.toContain("sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    expect(rs.sources[0]!.redactionCount).toBeGreaterThan(0);
    // And it says so, because a silent redaction leaves the owner believing a
    // rule is in force that no longer reads the way they wrote it.
    expect(rulesetWarnings(rs).join(" ")).toContain("redacted");
  });

  it("truncates a ruleset over budget and says so out loud", async () => {
    await writeRule(root, ".vibestrate/rules.md", "x".repeat(200 * 1024));
    const rs = await loadProjectRuleset(root, FALLBACK);
    expect(rs.sources[0]!.truncated).toBe(true);
    expect(rs.text).toContain("truncated");
    const warned = rulesetWarnings(rs).join(" ");
    expect(warned).toContain("truncated");
  });

  it("caps how many files the directory may contribute, and names the rest", async () => {
    for (let i = 0; i < 30; i++) {
      await writeRule(root, `.vibestrate/rules/${String(i).padStart(2, "0")}.md`, `rule ${i}`);
    }
    const rs = await loadProjectRuleset(root, FALLBACK);
    expect(rs.sources.length).toBe(24);
    expect(rs.skipped.length).toBe(6);
    // Dropped files are reported rather than silently missing - the whole
    // failure mode here is an owner who thinks a rule is in force.
    expect(rulesetWarnings(rs).join(" ")).toContain("ceiling");
  });

  // Two DIFFERENT mechanisms refuse an escaping symlink, depending on how the
  // file is reached, and it is worth keeping them apart: a test that credits
  // the wrong one passes while the guard it names is gone. Verified by removing
  // each in turn - the directory case survives losing the path guard entirely,
  // because the dirent filter has already dropped the link.
  it("never enumerates a symlink in the rules directory (dirent filter)", async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-outside-"));
    await fs.writeFile(path.join(outside, "secrets.md"), "EXFILTRATED");
    await fs.mkdir(path.join(root, ".vibestrate", "rules"), { recursive: true });
    await fs.symlink(
      path.join(outside, "secrets.md"),
      path.join(root, ".vibestrate", "rules", "link.md"),
    );
    const rs = await loadProjectRuleset(root, FALLBACK);
    expect(rs.text).not.toContain("EXFILTRATED");
    expect(rs.sources.map((s) => s.relativePath)).not.toContain(
      ".vibestrate/rules/link.md",
    );
  });

  it("the path guard refuses rules.md itself pointing outside the project", async () => {
    // rules.md is reached by name, not by readdir, so no dirent filter stands
    // between it and the reader. This is the case the path guard actually holds.
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-outside-"));
    await fs.writeFile(path.join(outside, "secrets.md"), "EXFILTRATED");
    await fs.symlink(
      path.join(outside, "secrets.md"),
      path.join(root, ".vibestrate", "rules.md"),
    );
    const rs = await loadProjectRuleset(root, FALLBACK);
    expect(rs.text).not.toContain("EXFILTRATED");
    expect(rs.text).toBe(FALLBACK);
    expect(rs.skipped.map((s) => s.relativePath)).toContain(".vibestrate/rules.md");
  });

  it("never throws on an unreadable rules directory", async () => {
    await writeRule(root, ".vibestrate/rules.md", "Root rule.");
    // A file where the directory is expected: readdir fails, and the ruleset
    // must still compose. A broken rules dir cannot be allowed to fail a run.
    await fs.writeFile(path.join(root, ".vibestrate", "rules"), "not a directory");
    const rs = await loadProjectRuleset(root, FALLBACK);
    expect(rs.text).toBe("Root rule.");
  });
});

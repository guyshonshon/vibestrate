import { describe, it, expect } from "vitest";
import {
  stripCommandExamples,
  asksAboutCommands,
} from "../src/consult/handbook/handbook-retrieval.js";

/**
 * The defects an adversarial review found in the surface rule after it shipped
 * green. Each one passed the original suite, because that suite verified the
 * negative ("no `vibe` in the prompt") on one hand-picked question and never
 * asked the positive: does the surviving text still answer anything, and does
 * the escape hatch fire on questions that are not about the command line?
 */

describe("stripping only removes real command examples", () => {
  it("keeps a fence of markdown headings", () => {
    // Every line starts with '#', which the old matcher read as a shell
    // comment, so a documentation example was deleted wholesale.
    const md = "```md\n# Title\n## Sub\n```";
    expect(stripCommandExamples(md)).toContain("# Title");
  });

  it("keeps a fence of diff removals", () => {
    // Every line starts with '-', which the old matcher read as a flag. When
    // this fence was the whole body, the entry was dropped entirely.
    const diff = "```diff\n-const a = 1\n-const b = 2\n```";
    expect(stripCommandExamples(diff)).toContain("const a = 1");
  });

  it("keeps a fence naming a config file in a comment", () => {
    const yaml = "```\n# .vibestrate/project.yml\n```";
    expect(stripCommandExamples(yaml)).toContain(".vibestrate/project.yml");
  });

  it("still removes a genuine command example", () => {
    const cmd = "```bash\nvibe flows list\nvibe flows show default\n```";
    expect(stripCommandExamples(cmd)).toBe("");
  });

  it("still removes a command example that carries flags and comments", () => {
    const cmd = "```\n# list them\nvibe flows list \\\n  --json\n```";
    expect(stripCommandExamples(cmd)).toBe("");
  });

  it("keeps a fence that mixes a command with its output", () => {
    const mixed = "```\nvibe flows list\ndefault  Deep review\n```";
    expect(stripCommandExamples(mixed)).toContain("Deep review");
  });
});

describe("the CLI escape hatch fires on command-line questions only", () => {
  it.each([
    "why does my run say command not found",
    "how do I open the terminal?",
    "how do I flag a run for review",
    "which flags does the reviewer set",
  ])("does not fire on %j", (q) => {
    // Each of these restored the entire CLI reference into a browser answer.
    // "command not found" is the canonical phrase of someone stuck.
    expect(asksAboutCommands(q)).toBe(false);
  });

  it.each([
    "what does vibe flows draft do",
    "is there a cli for this",
    "how do I run it from the terminal",
    "what is the command-line equivalent",
    "can I do this with npx",
  ])("fires on %j", (q) => {
    expect(asksAboutCommands(q)).toBe(true);
  });
});

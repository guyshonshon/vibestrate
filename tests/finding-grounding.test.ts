import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { groundFindings, describeGrounding } from "../src/flows/runtime/finding-grounding.js";

/**
 * Measuring the one hallucination a reviewer commits that can be checked
 * exactly: citing a file that is not there.
 *
 * The backlog gated RAG grounding on measuring hallucination first. This is
 * that measurement, and it needs no retrieval - the filesystem answers the
 * question precisely, where an embedding score would answer it fuzzily.
 */
let wt: string;

beforeAll(async () => {
  wt = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-ground-"));
  await fs.mkdir(path.join(wt, "src"), { recursive: true });
  await fs.writeFile(path.join(wt, "src", "index.ts"), "export {};");
  await fs.writeFile(path.join(wt, "README.md"), "# x");
});

afterAll(async () => {
  await fs.rm(wt, { recursive: true, force: true });
});

describe("grounding a finding's citation", () => {
  it("counts a citation that resolves", async () => {
    const r = await groundFindings(wt, [{ file: "src/index.ts" }]);
    expect(r).toEqual({ checked: 1, ungrounded: 0, missing: [] });
  });

  it("catches a file that is not there", async () => {
    const r = await groundFindings(wt, [{ file: "src/does-not-exist.ts" }]);
    expect(r.ungrounded).toBe(1);
    expect(r.missing).toEqual(["src/does-not-exist.ts"]);
  });

  it("does not count a finding that cites nothing", async () => {
    // A general remark is not a claim about a file, so it cannot be wrong
    // about one. Counting it would dilute the measure.
    const r = await groundFindings(wt, [{ file: null }, { file: "  " }]);
    expect(r.checked).toBe(0);
    expect(r.ungrounded).toBe(0);
  });

  it("forgives a leading slash or dot-slash", async () => {
    // A model writing "/src/index.ts" means the repo-relative one often enough
    // that counting it as a hallucination would inflate the number this exists
    // to measure.
    expect((await groundFindings(wt, [{ file: "/src/index.ts" }])).ungrounded).toBe(0);
    expect((await groundFindings(wt, [{ file: "./README.md" }])).ungrounded).toBe(0);
  });

  it("treats an escape from the worktree as ungrounded rather than following it", async () => {
    // A review is about the copy it read. Resolving `../..` would give a wrong
    // answer AND read outside the boundary.
    const r = await groundFindings(wt, [{ file: "../../../etc/passwd" }]);
    expect(r.ungrounded).toBe(1);
  });

  it("reports mixed findings accurately", async () => {
    const r = await groundFindings(wt, [
      { file: "src/index.ts" },
      { file: "src/ghost.ts" },
      { file: null },
      { file: "also-missing.ts" },
    ]);
    expect(r).toEqual({
      checked: 3,
      ungrounded: 2,
      missing: ["src/ghost.ts", "also-missing.ts"],
    });
  });
});

describe("what it says", () => {
  it("says nothing when every citation resolved", () => {
    // A line reading "0 ungrounded" on every run trains people to skip it, and
    // then they skip it on the run where it is not zero.
    expect(describeGrounding({ checked: 4, ungrounded: 0, missing: [] })).toBeNull();
    expect(describeGrounding({ checked: 0, ungrounded: 0, missing: [] })).toBeNull();
  });

  it("names the paths, because the reader has to go look at them", () => {
    const line = describeGrounding({
      checked: 3,
      ungrounded: 2,
      missing: ["a.ts", "b.ts"],
    });
    expect(line).toContain("2 of 3");
    expect(line).toContain("a.ts");
    expect(line).toContain("b.ts");
  });

  it("caps a long list rather than printing forty paths", () => {
    const missing = Array.from({ length: 9 }, (_, i) => `f${i}.ts`);
    const line = describeGrounding({ checked: 9, ungrounded: 9, missing })!;
    expect(line).toContain("+4 more");
    expect(line).not.toContain("f8.ts");
  });

  it("is advisory in its wording - it never claims the finding is wrong", () => {
    const line = describeGrounding({ checked: 1, ungrounded: 1, missing: ["x.ts"] })!;
    // A reviewer may legitimately name a file the change should CREATE, so this
    // points the reader at the finding rather than dismissing it.
    expect(line).toContain("Read those findings closely");
    expect(line.toLowerCase()).not.toContain("invalid");
  });
});

describe("the measurement reaches both walks", () => {
  it("is called from the linear walk as well as the graph frontier", async () => {
    // The orchestrator handles a review result in TWO places: runGraphFrontier
    // and runFlowSequence. Every built-in flow takes the LINEAR one, so
    // anything wired into the frontier alone is dead on everything that ships.
    // That has now cost two features - this and the steer drain - so it gets a
    // check rather than another comment.
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/core/orchestrator.ts", "utf8");
    const calls = src.match(/recordFindingGrounding\(\{/g) ?? [];
    expect(
      calls.length,
      "a review-result handler is missing the grounding call - it is dead on the walk it was omitted from",
    ).toBe(2);
  });

  it("never fails a run: the call site swallows its own errors", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/core/orchestrator.ts", "utf8");
    const fn = src.slice(src.indexOf("async function recordFindingGrounding"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    // A measurement that can fail a run is worse than no measurement.
    expect(body).toContain("catch");
  });
});

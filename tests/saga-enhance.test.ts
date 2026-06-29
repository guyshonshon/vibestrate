import { describe, it, expect } from "vitest";
import {
  parseStepDiff,
  classifyAuthority,
  applyStepDiff,
  buildEnhancePrompt,
  type EnhanceStep,
} from "../src/feature/enhance.js";

const step = (
  id: string,
  text: string,
  provenance: "owner" | "conductor" = "owner",
  extra: Partial<EnhanceStep> = {},
): EnhanceStep => ({
  id,
  text,
  objective: "",
  acceptanceCheck: "",
  fileHints: [],
  provenance,
  ...extra,
});

describe("parseStepDiff", () => {
  it("parses a fenced json diff block", () => {
    const out = parseStepDiff(
      'Here is the revision:\n```json\n{"refine":[{"id":"ci-2","text":"do x cleanly"}],"remove":["ci-3"],"reorder":["ci-2","ci-4"]}\n```\nDone.',
    );
    expect(out.diff).not.toBeNull();
    expect(out.diff!.refine).toEqual([{ id: "ci-2", text: "do x cleanly" }]);
    expect(out.diff!.remove).toEqual(["ci-3"]);
    expect(out.diff!.reorder).toEqual(["ci-2", "ci-4"]);
    expect(out.diff!.add).toEqual([]);
  });

  it("parses a bare json object (no fence)", () => {
    const out = parseStepDiff('{"remove":["ci-9"]}');
    expect(out.diff!.remove).toEqual(["ci-9"]);
  });

  it("returns a null diff (not a throw) on unparseable text", () => {
    const out = parseStepDiff("the plan looks fine, no changes");
    expect(out.diff).toBeNull();
    expect(out.reason).toBeTruthy();
  });

  it("returns an empty diff for an explicit empty object", () => {
    const out = parseStepDiff("```json\n{}\n```");
    expect(out.diff).not.toBeNull();
    expect(out.diff!.refine).toEqual([]);
    expect(out.diff!.remove).toEqual([]);
    expect(out.diff!.add).toEqual([]);
    expect(out.diff!.reorder).toBeNull();
  });
});

describe("classifyAuthority", () => {
  const pending = [
    step("ci-1", "owner step", "owner"),
    step("ci-2", "conductor step", "conductor"),
  ];

  it("conductor mode: refine/reorder is auto", () => {
    const diff = parseStepDiff('{"refine":[{"id":"ci-1","text":"x"}],"reorder":["ci-2","ci-1"]}').diff!;
    expect(classifyAuthority(diff, pending, "conductor")).toBe("auto");
  });

  it("conductor mode: removing a conductor-authored step is auto", () => {
    const diff = parseStepDiff('{"remove":["ci-2"]}').diff!;
    expect(classifyAuthority(diff, pending, "conductor")).toBe("auto");
  });

  it("conductor mode: removing an owner-authored step escalates", () => {
    const diff = parseStepDiff('{"remove":["ci-1"]}').diff!;
    expect(classifyAuthority(diff, pending, "conductor")).toBe("escalate");
  });

  it("conductor mode: any add escalates (autonomous add is out of scope)", () => {
    const diff = parseStepDiff('{"add":[{"text":"new step"}]}').diff!;
    expect(classifyAuthority(diff, pending, "conductor")).toBe("escalate");
  });

  it("manual mode: add + remove-owner are both allowed (owner reviews)", () => {
    const diff = parseStepDiff('{"add":[{"text":"new"}],"remove":["ci-1"]}').diff!;
    expect(classifyAuthority(diff, pending, "manual")).toBe("auto");
  });
});

describe("applyStepDiff (pure transform, existing ids only)", () => {
  const pending = [
    step("ci-1", "first", "owner"),
    step("ci-2", "second", "conductor"),
    step("ci-3", "third", "owner"),
  ];

  it("refines a step's fields in place", () => {
    const diff = parseStepDiff(
      '{"refine":[{"id":"ci-2","text":"second refined","objective":"do it well"}]}',
    ).diff!;
    const out = applyStepDiff(pending, diff);
    expect(out.map((s) => s.text)).toEqual(["first", "second refined", "third"]);
    expect(out[1]!.objective).toBe("do it well");
  });

  it("removes a step by id", () => {
    const diff = parseStepDiff('{"remove":["ci-2"]}').diff!;
    expect(applyStepDiff(pending, diff).map((s) => s.id)).toEqual(["ci-1", "ci-3"]);
  });

  it("reorders, appending ids the reorder list omits", () => {
    const diff = parseStepDiff('{"reorder":["ci-3","ci-1"]}').diff!;
    // ci-2 omitted from the reorder -> kept, after the listed ones, original order
    expect(applyStepDiff(pending, diff).map((s) => s.id)).toEqual(["ci-3", "ci-1", "ci-2"]);
  });

  it("ignores unknown ids in refine/remove/reorder", () => {
    const diff = parseStepDiff(
      '{"refine":[{"id":"nope","text":"x"}],"remove":["ghost"],"reorder":["ci-1","phantom","ci-2","ci-3"]}',
    ).diff!;
    const out = applyStepDiff(pending, diff);
    expect(out.map((s) => s.id)).toEqual(["ci-1", "ci-2", "ci-3"]);
  });

  it("applies remove then reorder then refine together", () => {
    const diff = parseStepDiff(
      '{"remove":["ci-1"],"reorder":["ci-3","ci-2"],"refine":[{"id":"ci-3","text":"third!"}]}',
    ).diff!;
    const out = applyStepDiff(pending, diff);
    expect(out.map((s) => [s.id, s.text])).toEqual([
      ["ci-3", "third!"],
      ["ci-2", "second"],
    ]);
  });

  it("does NOT add steps (add is the caller's job, not the pure transform)", () => {
    const diff = parseStepDiff('{"add":[{"text":"new step"}]}').diff!;
    expect(applyStepDiff(pending, diff).map((s) => s.id)).toEqual(["ci-1", "ci-2", "ci-3"]);
  });
});

describe("buildEnhancePrompt", () => {
  const args = {
    goal: "Add structured JSON logging",
    doneOutcomes: [{ text: "add logger", summary: "added a logger module" }],
    pending: [step("ci-2", "wire the logger into the http handler")],
    diff: "diff --git a/log.ts b/log.ts\n+export const log = ...",
    freshRead: "// current http handler bytes",
    invariants: ["all logs are JSON"],
    mode: "conductor" as const,
  };

  it("includes the goal, pending step ids, invariants, and the fresh read", () => {
    const p = buildEnhancePrompt(args);
    expect(p).toContain("Add structured JSON logging");
    expect(p).toContain("ci-2");
    expect(p).toContain("all logs are JSON");
    expect(p).toContain("current http handler bytes");
  });

  it("redacts secret-shaped tokens in model-prose sections", () => {
    const p = buildEnhancePrompt({
      ...args,
      goal: "use the key sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    });
    expect(p).not.toContain("sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  });

  it("tells the conductor it may NOT add steps", () => {
    const p = buildEnhancePrompt(args);
    expect(p.toLowerCase()).toContain("refine");
    // conductor mode forbids add
    expect(p.toLowerCase()).toMatch(/not add|no new steps|may not add/);
  });
});

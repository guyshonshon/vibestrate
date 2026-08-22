import { describe, it, expect } from "vitest";
import {
  compileFlowFromShape,
  selectLenses,
  FlowDeriveError,
} from "../src/flows/runtime/flow-derive.js";
import { flowShapeOutputSchema, FLOW_SHAPE_CONTRACT } from "../src/flows/schemas/flow-output-contracts.js";
import { isGraphFlow } from "../src/flows/schemas/flow-schema.js";

const shape = (units: unknown[], extra: Record<string, unknown> = {}) =>
  flowShapeOutputSchema.parse({
    contract: FLOW_SHAPE_CONTRACT,
    units,
    rationale: "test decomposition",
    ...extra,
  });
const compile = (units: unknown[], extra = {}) =>
  compileFlowFromShape(shape(units, extra), { id: "derived-test" });

const stepById = (f: { steps: readonly { id: string }[] }, id: string) =>
  f.steps.find((s) => s.id === id) as any;

describe("compileFlowFromShape - 'c depends on b'", () => {
  it("wires each unit's implement step to its declared dependencies", () => {
    const { flow } = compile([
      { id: "a", title: "schema" },
      { id: "b", title: "api", dependsOn: ["a"] },
      { id: "c", title: "frontend", dependsOn: ["b"] },
    ]);
    expect(stepById(flow, "implement-b").needs).toEqual(["implement-a"]);
    expect(stepById(flow, "implement-c").needs).toEqual(["implement-b"]);
    // a has no prerequisite unit, so it hangs off the design step
    expect(stepById(flow, "implement-a").needs).toEqual(["architecture"]);
    expect(isGraphFlow(flow)).toBe(true);
  });

  it("chains independent units - they share one worktree and would race on the diff", () => {
    const { flow } = compile([
      { id: "a", title: "one" },
      { id: "b", title: "two" },
    ]);
    expect(stepById(flow, "implement-a").needs).toEqual(["architecture"]);
    expect(stepById(flow, "implement-b").needs).toEqual(["implement-a"]);
  });

  it("keeps the declared edge visible alongside the chain edge", () => {
    const { flow } = compile([
      { id: "a", title: "one" },
      { id: "b", title: "two" },
      { id: "c", title: "three", dependsOn: ["a"] },
    ]);
    // c declared a dependency on a, and follows b in the chain: both are shown.
    expect(stepById(flow, "implement-c").needs.sort()).toEqual(["implement-a", "implement-b"]);
  });
});

describe("compileFlowFromShape - 'testing only once a, b and c are made'", () => {
  it("gates validation behind every unit", () => {
    const { flow } = compile([
      { id: "a", title: "one" },
      { id: "b", title: "two", dependsOn: ["a"] },
      { id: "c", title: "three" },
    ]);
    expect(stepById(flow, "validation").needs.sort()).toEqual([
      "implement-a",
      "implement-b",
      "implement-c",
    ]);
  });
});

describe("compileFlowFromShape - 'how does it know when to review, and what'", () => {
  it("aims a lens at each declared risk, and says why", () => {
    const r = compile([
      { id: "a", title: "login", risk: ["auth"] },
      { id: "b", title: "import", risk: ["untrusted-input"] },
    ]);
    expect(r.lenses.map((l) => l.lens).sort()).toEqual(["authz", "injection"]);
    expect(r.notes.some((n) => n.includes('lens "authz" because a unit is tagged auth'))).toBe(true);
  });

  it("reviews correctness as the floor when nothing is risky - never zero review", () => {
    const r = compile([{ id: "a", title: "rename a label" }]);
    expect(r.lenses.map((l) => l.lens)).toEqual(["correctness"]);
    expect(stepById(r.flow, "review-correctness")).toBeTruthy();
  });

  it("collapses several tags onto one lens without duplicating the step", () => {
    const r = compile([{ id: "a", title: "billing", risk: ["money", "data-integrity"] }]);
    expect(r.lenses).toHaveLength(1);
    expect(r.lenses[0]!.because).toEqual(["data-integrity", "money"]);
  });

  it("joins several lenses at an arbiter, and skips the arbiter for a single lens", () => {
    const many = compile([{ id: "a", title: "x", risk: ["auth", "untrusted-input"] }]).flow;
    expect(stepById(many, "arbiter").needs.sort()).toEqual(["review-authz", "review-injection"]);
    expect(stepById(many, "fix").needs).toEqual(["arbiter"]);

    const one = compile([{ id: "a", title: "x", risk: ["auth"] }]).flow;
    expect(stepById(one, "arbiter")).toBeUndefined();
    // the single lens becomes the decision, so it must emit one
    expect(stepById(one, "review-authz").outputs).toContain("review-decision");
    expect(stepById(one, "review-authz").instructions).toContain("DECISION: APPROVED");
    expect(stepById(one, "fix").needs).toEqual(["review-authz"]);
  });
});

describe("compileFlowFromShape - a decomposition that cannot be a graph", () => {
  it("rejects a cycle and names it", () => {
    expect(() =>
      compile([
        { id: "a", title: "a", dependsOn: ["b"] },
        { id: "b", title: "b", dependsOn: ["a"] },
      ]),
    ).toThrowError(/cycle among: a, b/);
  });

  it("rejects a dangling dependency", () => {
    expect(() => compile([{ id: "a", title: "a", dependsOn: ["ghost"] }])).toThrowError(
      /depends on "ghost", which is not a unit/,
    );
  });

  it("rejects self-dependency", () => {
    try {
      compile([{ id: "a", title: "a", dependsOn: ["a"] }]);
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as FlowDeriveError).code).toBe("self-dependency");
    }
  });

  it("rejects duplicate unit ids", () => {
    try {
      compile([{ id: "a", title: "one" }, { id: "a", title: "two" }]);
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as FlowDeriveError).code).toBe("duplicate-unit");
    }
  });
});

describe("compileFlowFromShape - determinism and validity", () => {
  it("compiles byte-identically for the same decomposition", () => {
    const units = [
      { id: "b", title: "two", dependsOn: ["a"], risk: ["auth"] },
      { id: "a", title: "one", risk: ["performance"] },
    ];
    expect(JSON.stringify(compile(units).flow)).toEqual(JSON.stringify(compile(units).flow));
  });

  it("always produces a schema-valid flow with a terminal verify", () => {
    const { flow } = compile([
      { id: "a", title: "one", risk: ["auth", "money", "ui"] },
      { id: "b", title: "two", dependsOn: ["a"] },
    ]);
    expect(stepById(flow, "verify").needs).toEqual(["revalidation"]);
    expect(stepById(flow, "revalidation").needs).toEqual(["fix"]);
    expect(flow.seats.arbiter).toBeTruthy();
  });

  it("does not declare an arbiter seat it will not use", () => {
    const { flow } = compile([{ id: "a", title: "one" }]);
    expect(flow.seats.arbiter).toBeUndefined();
  });
});

describe("compileFlowFromShape - decomposition is not free", () => {
  it("warns when a decomposition multiplies the implementation cost", () => {
    const r = compile([
      { id: "a", title: "a" }, { id: "b", title: "b" },
      { id: "c", title: "c" }, { id: "d", title: "d" },
    ]);
    expect(r.notes.some((n) => n.startsWith("COST: 4 implement turns"))).toBe(true);
  });

  it("stays quiet for a small decomposition", () => {
    const r = compile([{ id: "a", title: "a" }, { id: "b", title: "b" }]);
    expect(r.notes.some((n) => n.startsWith("COST:"))).toBe(false);
  });
});

describe("compileFlowFromShape - the owner's cost guard", () => {
  const four = [
    { id: "a", title: "a" }, { id: "b", title: "b" },
    { id: "c", title: "c" }, { id: "d", title: "d" },
  ];
  it("refuses a decomposition over the limit, and says what it would cost", () => {
    expect(() =>
      compileFlowFromShape(shape(four), { id: "x", maxUnits: 2 }),
    ).toThrowError(/4 units but the limit is 2.*about 4x/s);
  });

  it("accepts one at the limit", () => {
    expect(compileFlowFromShape(shape(four), { id: "x", maxUnits: 4 }).flow.id).toBe("x");
  });

  it("is unlimited when no limit is given", () => {
    expect(compileFlowFromShape(shape(four), { id: "x" }).flow.id).toBe("x");
  });
});

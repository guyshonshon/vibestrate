import { describe, it, expect } from "vitest";
import { resolveLoopMaxIterations } from "../src/flows/runtime/flow-resolver.js";

// Precedence: explicit crew override > explicit global ceiling > the flow's own
// budget. The global is OPT-IN (null = no cap), so the default never regresses a
// flow's chosen budget.
describe("resolveLoopMaxIterations", () => {
  it("uses the flow's own budget when nothing overrides it (no regression)", () => {
    expect(resolveLoopMaxIterations({ flowMax: 3, crewMax: undefined, globalCeiling: null })).toBe(3);
  });

  it("an explicit crew override wins outright (not capped by the global)", () => {
    expect(resolveLoopMaxIterations({ flowMax: 3, crewMax: 4, globalCeiling: 2 })).toBe(4);
    expect(resolveLoopMaxIterations({ flowMax: 3, crewMax: 1, globalCeiling: 5 })).toBe(1);
  });

  it("an explicit global acts as a CEILING - it lowers but never raises", () => {
    expect(resolveLoopMaxIterations({ flowMax: 3, crewMax: undefined, globalCeiling: 2 })).toBe(2);
    expect(resolveLoopMaxIterations({ flowMax: 2, crewMax: undefined, globalCeiling: 5 })).toBe(2);
  });

  it("crew override of 0 is honored (an explicit 'no review loops')", () => {
    expect(resolveLoopMaxIterations({ flowMax: 3, crewMax: 0, globalCeiling: null })).toBe(0);
  });
});

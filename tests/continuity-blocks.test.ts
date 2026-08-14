// Four run-level prompt blocks share two one-shot guards, and getting the
// sharing wrong fails silently: a planner simply arrives without the context it
// was supposed to have, and the run still completes.
//
// Each test is named after the invariant, not the implementation.

import { describe, it, expect } from "vitest";
import { resolveContinuityBlocks } from "../src/core/run-engine/continuity-blocks.js";
import { createRunTurnState } from "../src/core/run-engine/run-turn-state.js";

const LEDGER = "## Where the project stands\n";
const FLAGS = "## Continuity flags\n";
const METHOD = "## Methodology\n";
const MAP = "## Codebase map\n";

function call(over: Partial<Parameters<typeof resolveContinuityBlocks>[0]> = {}) {
  return resolveContinuityBlocks({
    roleId: "planner",
    cleanRoom: false,
    turnState: createRunTurnState(),
    codebaseMapRoles: ["planner"],
    methodologyRoles: ["planner"],
    codebaseMapBlock: MAP,
    hasStagedCodebaseMapContext: false,
    ledgerPromptBlock: LEDGER,
    ledgerFlagsBlock: FLAGS,
    methodologyBlock: METHOD,
    ...over,
  });
}

describe("resolveContinuityBlocks", () => {
  it("gives the planner all four on its first turn", () => {
    const r = call();
    expect(r.projectLedger).toBe(LEDGER);
    expect(r.continuityFlags).toBe(FLAGS);
    expect(r.methodologyGuidance).toBe(METHOD);
    expect(r.projectMemory).toBe(MAP);
  });

  it("defaults to the planner alone for the codebase map", () => {
    for (const roleId of ["implementer", "reviewer", "verifier", "arbiter"]) {
      expect(call({ roleId }).projectMemory, roleId).toBe("");
    }
  });

  it("sends the map to a role the project configured", () => {
    const r = call({ roleId: "implementer", codebaseMapRoles: ["planner", "implementer"] });
    expect(r.projectMemory).toBe(MAP);
  });

  // THE regression this refactor exists for. The map and the ledger used to
  // share `ledgerInjected`; widening the map's audience would then have let
  // whichever configured role ran first consume the planner's ledger, and the
  // planner would have arrived with no continuity context and no error.
  it("a role taking the map does not consume the planner's ledger", () => {
    const turnState = createRunTurnState();
    const first = call({ roleId: "builder", codebaseMapRoles: ["builder"], turnState });
    expect(first.projectMemory, "builder should get the map").toBe(MAP);
    expect(first.projectLedger, "builder is not a planner").toBe("");

    const planner = call({ roleId: "planner", turnState });
    expect(planner.projectLedger, "planner still gets its ledger").toBe(LEDGER);
    expect(planner.continuityFlags).toBe(FLAGS);
    expect(planner.methodologyGuidance).toBe(METHOD);
  });

  // A builder takes three turns in quality-arbitration. Orientation is worth
  // paying for once, not once per turn.
  it("does not resend the map to a role that already has it", () => {
    const turnState = createRunTurnState();
    const roles = ["builder"];
    expect(call({ roleId: "builder", codebaseMapRoles: roles, turnState }).projectMemory).toBe(MAP);
    expect(call({ roleId: "builder", codebaseMapRoles: roles, turnState }).projectMemory).toBe("");
    expect(call({ roleId: "builder", codebaseMapRoles: roles, turnState }).projectMemory).toBe("");
  });

  it("orients each configured role separately", () => {
    const turnState = createRunTurnState();
    const roles = ["planner", "implementer"];
    expect(call({ roleId: "planner", codebaseMapRoles: roles, turnState }).projectMemory).toBe(MAP);
    expect(call({ roleId: "implementer", codebaseMapRoles: roles, turnState }).projectMemory).toBe(
      MAP,
    );
  });

  // express / scaffold / quality-arbitration have no planner seat, so a
  // methodology set on the project used to reach nobody on those flows.
  it("sends the methodology to a code-writing role when configured", () => {
    expect(call({ roleId: "implementer" }).methodologyGuidance, "default is planner-only").toBe("");
    const opted = call({ roleId: "implementer", methodologyRoles: ["implementer"] });
    expect(opted.methodologyGuidance).toBe(METHOD);
    expect(opted.projectLedger, "the ledger stays planner-only").toBe("");
  });

  it("does not resend the methodology to a role that already has it", () => {
    const turnState = createRunTurnState();
    const roles = ["implementer"];
    expect(
      call({ roleId: "implementer", methodologyRoles: roles, turnState }).methodologyGuidance,
    ).toBe(METHOD);
    expect(
      call({ roleId: "implementer", methodologyRoles: roles, turnState }).methodologyGuidance,
    ).toBe("");
  });

  it("a role taking the methodology does not consume the planner's ledger", () => {
    const turnState = createRunTurnState();
    const first = call({ roleId: "builder", methodologyRoles: ["builder"], turnState });
    expect(first.methodologyGuidance).toBe(METHOD);
    expect(turnState.ledgerInjected, "the ledger guard must be intact").toBe(false);
    expect(call({ roleId: "planner", turnState }).projectLedger).toBe(LEDGER);
  });

  it("stays quiet when a context source already staged the map", () => {
    expect(call({ hasStagedCodebaseMapContext: true }).projectMemory).toBe("");
  });

  // A clean-room judge receives none of these blocks - the caller discards them
  // so the judge is not anchored to how the producer framed things. The subtle
  // part is the guard: spending it here would deny the role the map for the
  // WHOLE run, because the second turn would see the slot already taken. That
  // is the shape a reviewer seat would hit the moment anyone widened the map to
  // it, which is the likely configuration rather than a corner case.
  it("a clean-room turn takes nothing and spends nothing", () => {
    const turnState = createRunTurnState();
    const roles = ["reviewer"];
    const judged = call({ roleId: "reviewer", codebaseMapRoles: roles, cleanRoom: true, turnState });
    expect(judged.projectMemory).toBe("");
    expect(turnState.codebaseMapSentTo.has("reviewer"), "guard must be intact").toBe(false);

    const later = call({ roleId: "reviewer", codebaseMapRoles: roles, turnState });
    expect(later.projectMemory, "a normal turn still gets the map").toBe(MAP);
  });

  it("a clean-room planner keeps its ledger for a later turn", () => {
    const turnState = createRunTurnState();
    expect(call({ cleanRoom: true, turnState }).projectLedger).toBe("");
    expect(turnState.ledgerInjected, "guard must be intact").toBe(false);
    expect(call({ turnState }).projectLedger, "the real planner turn still gets it").toBe(LEDGER);
  });

  // An empty block must not burn the one chance a later turn had at a real one.
  it("does not spend a guard on a block that was empty", () => {
    const turnState = createRunTurnState();
    call({ codebaseMapBlock: "", turnState });
    expect(turnState.codebaseMapSentTo.has("planner")).toBe(false);

    const later = call({ turnState });
    expect(later.projectMemory, "a real map still arrives afterwards").toBe(MAP);
  });

  it("gives the ledger to one planner turn only", () => {
    const turnState = createRunTurnState();
    expect(call({ turnState }).projectLedger).toBe(LEDGER);
    expect(call({ turnState }).projectLedger).toBe("");
  });

  // express and quality-arbitration ship without a planner seat, so they see no
  // ledger at all - and no map either until a role they DO use is configured.
  it("leaves a planner-less flow with nothing until the map is configured for it", () => {
    const bare = call({ roleId: "implementer" });
    expect(bare.projectLedger).toBe("");
    expect(bare.projectMemory).toBe("");

    const opted = call({ roleId: "implementer", codebaseMapRoles: ["implementer"] });
    expect(opted.projectMemory).toBe(MAP);
    expect(opted.projectLedger, "the ledger stays planner-only").toBe("");
  });
});

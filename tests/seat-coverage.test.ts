import { describe, it, expect } from "vitest";
import {
  computeFlowSeatCoverage,
  type FlowCoverage,
} from "../src/flows/runtime/seat-coverage.js";
import type { FlowDefinition } from "../src/flows/schemas/flow-schema.js";
import type { CrewConfig } from "../src/crews/crew-schema.js";

// Minimal fixtures: the helper only reads flow.seats / flow.steps[].seat and
// crew.roles[].seats, so typed literals (cast) are enough.
function flow(
  seats: Record<string, string>,
  stepSeats: (string | undefined)[],
): FlowDefinition {
  return {
    seats: Object.fromEntries(
      Object.entries(seats).map(([id, label]) => [id, { label }]),
    ),
    steps: stepSeats.map((seat, i) => ({ id: `s${i}`, seat })),
  } as unknown as FlowDefinition;
}

function crew(roles: Record<string, string[]>): CrewConfig {
  return {
    roles: Object.fromEntries(
      Object.entries(roles).map(([id, seats]) => [id, { profile: "p", seats }]),
    ),
  } as unknown as CrewConfig;
}

function byId(cov: FlowCoverage, seatId: string) {
  return cov.seats.find((s) => s.seatId === seatId)!;
}

describe("computeFlowSeatCoverage", () => {
  it("marks every used seat filled -> runnable", () => {
    const cov = computeFlowSeatCoverage({
      crewId: "default",
      flow: flow({ builder: "Builder", reviewer: "Reviewer" }, ["builder", "reviewer"]),
      crew: crew({ dev: ["builder"], qa: ["reviewer"] }),
    });
    expect(cov.runnable).toBe(true);
    expect(byId(cov, "builder").status).toBe("filled");
    expect(byId(cov, "builder").resolvedRoleId).toBe("dev");
  });

  it("flags a gap on a used seat with no filler -> not runnable", () => {
    const cov = computeFlowSeatCoverage({
      crewId: "default",
      flow: flow({ builder: "Builder", reviewer: "Reviewer" }, ["builder", "reviewer"]),
      crew: crew({ dev: ["builder"] }),
    });
    expect(byId(cov, "reviewer").status).toBe("gap");
    expect(byId(cov, "reviewer").resolvedRoleId).toBeNull();
    expect(cov.runnable).toBe(false);
  });

  it("flags ambiguity when >1 role fills a seat; an override resolves it", () => {
    const f = flow({ builder: "Builder" }, ["builder"]);
    const c = crew({ dev1: ["builder"], dev2: ["builder"] });
    const ambiguous = computeFlowSeatCoverage({ crewId: "default", flow: f, crew: c });
    expect(byId(ambiguous, "builder").status).toBe("ambiguous");
    expect(byId(ambiguous, "builder").candidateRoleIds.sort()).toEqual(["dev1", "dev2"]);
    expect(ambiguous.runnable).toBe(false);

    const resolved = computeFlowSeatCoverage({
      crewId: "default",
      flow: f,
      crew: c,
      seatRoleOverrides: { builder: "dev2" },
    });
    expect(byId(resolved, "builder").status).toBe("filled");
    expect(byId(resolved, "builder").resolvedRoleId).toBe("dev2");
    expect(resolved.runnable).toBe(true);
  });

  it("a declared-but-unused seat with a gap does not block runnability", () => {
    const cov = computeFlowSeatCoverage({
      crewId: "default",
      flow: flow({ builder: "Builder", extra: "Unused" }, ["builder"]),
      crew: crew({ dev: ["builder"] }),
    });
    expect(byId(cov, "extra").status).toBe("gap");
    expect(byId(cov, "extra").usedByStep).toBe(false);
    expect(cov.runnable).toBe(true);
  });
});

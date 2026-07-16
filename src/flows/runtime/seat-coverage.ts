// ── Flow seat coverage ──────────────────────────────────────────────────────
//
// A Flow declares seats; a Crew's roles fill them. `resolveFlow` binds them and
// throws on the first gap/ambiguity. This computes the full per-seat picture
// WITHOUT throwing, so a UI/CLI can show "is this flow crewed and runnable?"
// before committing to a run. Shared by the shell, the web dashboard, and the
// CLI (parity).

import type { ProjectConfig } from "../../project/config-schema.js";
import type { CrewConfig } from "../../agents/crew-schema.js";
import type { FlowDefinition } from "../schemas/flow-schema.js";
import { getCrew, rolesFillingSeat } from "../../agents/crew-registry.js";

export type SeatCoverageStatus = "filled" | "gap" | "ambiguous";

export type SeatCoverage = {
  seatId: string;
  label: string;
  status: SeatCoverageStatus;
  /** Role ids in the crew that can fill this seat. */
  candidateRoleIds: string[];
  /** The single role that fills it (one candidate, or disambiguated by an
   *  override). Null when gap or still-ambiguous. */
  resolvedRoleId: string | null;
  /** Whether a step uses this seat. A declared-but-unused seat can't block a
   *  run, so it doesn't count against `runnable`. */
  usedByStep: boolean;
};

export type FlowCoverage = {
  crewId: string;
  seats: SeatCoverage[];
  /** True when every seat a step uses is filled (or disambiguated). */
  runnable: boolean;
};

/** Per-seat coverage of a flow against a specific crew. Never throws. */
export function computeFlowSeatCoverage(input: {
  flow: FlowDefinition;
  crew: CrewConfig;
  crewId: string;
  seatRoleOverrides?: Record<string, string>;
}): FlowCoverage {
  const usedSeatIds = new Set(
    input.flow.steps
      .map((s) => s.seat)
      .filter((s): s is string => typeof s === "string" && s.length > 0),
  );

  const seats: SeatCoverage[] = Object.entries(input.flow.seats).map(
    ([seatId, seat]) => {
      const candidateRoleIds = rolesFillingSeat(input.crew, seatId).map(
        (c) => c.roleId,
      );
      const override = input.seatRoleOverrides?.[seatId];
      let status: SeatCoverageStatus;
      let resolvedRoleId: string | null = null;
      if (override && candidateRoleIds.includes(override)) {
        status = "filled";
        resolvedRoleId = override;
      } else if (candidateRoleIds.length === 0) {
        status = "gap";
      } else if (candidateRoleIds.length > 1) {
        status = "ambiguous";
      } else {
        status = "filled";
        resolvedRoleId = candidateRoleIds[0]!;
      }
      return {
        seatId,
        label: seat.label,
        status,
        candidateRoleIds,
        resolvedRoleId,
        usedByStep: usedSeatIds.has(seatId),
      };
    },
  );

  const runnable = seats
    .filter((s) => s.usedByStep)
    .every((s) => s.status === "filled");

  return { crewId: input.crewId, seats, runnable };
}

/** Resolve the crew (explicit or `config.defaultCrew`) then compute coverage.
 *  Throws only if the crew id doesn't exist (via `getCrew`). */
export function computeFlowCoverageForConfig(input: {
  config: ProjectConfig;
  flow: FlowDefinition;
  crewId?: string | null;
  seatRoleOverrides?: Record<string, string>;
}): FlowCoverage {
  const { crewId, crew } = getCrew(input.config, input.crewId);
  return computeFlowSeatCoverage({
    flow: input.flow,
    crew,
    crewId,
    seatRoleOverrides: input.seatRoleOverrides,
  });
}

import { describe, expect, it } from "vitest";
import {
  prepareFlowParticipantTurn,
  flowParticipantLedgerSchema,
} from "../../src/flows/runtime/flow-participant-ledger.js";

const ts = "2026-06-06T00:00:00.000Z";

function turn(sessionId: string) {
  return {
    stepId: "s",
    roleId: "planner",
    providerId: "claude",
    contextMode: "reused" as const,
    contextPacketPath: "p",
    promptArtifactPath: "pr",
    outputArtifactPath: "o",
    sessionId,
    completedAt: ts,
  };
}

// A ledger with one resume-capable participant on `sessionId`, with `turnsOn`
// turns already recorded against it.
function ledgerWith(turnsOn: number, sessionId: string | null = "S1") {
  return flowParticipantLedgerSchema.parse({
    schemaVersion: 1,
    flowId: "f",
    flowVersion: 1,
    createdAt: ts,
    updatedAt: ts,
    participants: [
      {
        seat: "planner",
        label: "Planner",
        providerId: "claude",
        capabilities: {
          providerType: "claude-code",
          sessionReuse: "resume",
          interactiveSessions: true,
          reportsSessionId: true,
          reportsTokenUsage: true,
        },
        sessionId,
        turns: sessionId ? Array.from({ length: turnsOn }, () => turn(sessionId)) : [],
      },
    ],
  });
}

describe("session-reuse lifetime cap (U7)", () => {
  it("reuses the session while under the cap", () => {
    const p = prepareFlowParticipantTurn(ledgerWith(2), "planner", 3);
    expect(p.contextMode).toBe("reused");
    expect(p.sessionRequest?.action).toBe("resume");
    expect(p.sessionRequest?.sessionId).toBe("S1");
  });

  it("re-opens a fresh session once the cap is reached (re-seed from artifacts)", () => {
    const p = prepareFlowParticipantTurn(ledgerWith(3), "planner", 3);
    expect(p.contextMode).toBe("opened");
    expect(p.sessionRequest?.action).toBe("open");
    expect(p.sessionRequest?.sessionId).not.toBe("S1");
    expect(p.fallbackReason).toMatch(/capped at 3/);
  });

  it("treats 0 as unlimited (always reuse)", () => {
    const p = prepareFlowParticipantTurn(ledgerWith(50), "planner", 0);
    expect(p.contextMode).toBe("reused");
  });

  it("opens the first session normally (no prior session)", () => {
    const p = prepareFlowParticipantTurn(ledgerWith(0, null), "planner", 3);
    expect(p.contextMode).toBe("opened");
    expect(p.sessionRequest?.action).toBe("open");
  });
});

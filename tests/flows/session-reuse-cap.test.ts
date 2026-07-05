import { describe, expect, it } from "vitest";
import {
  prepareFlowParticipantTurn,
  createFlowParticipantLedger,
  flowParticipantLedgerSchema,
} from "../../src/flows/runtime/flow-participant-ledger.js";
import type { ProviderCapabilities } from "../../src/providers/provider-types.js";

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
    fallbackReason: null,
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

// ── The Seat-keying invariant: same provider, different seat -> independent ──
// Guards Decision 2 of docs/design/fast-track-and-session-policy.md. If anyone
// re-keys the ledger on profile/model, these break: a same-profile reviewer
// would collapse into the writer's participant and inherit its session.

describe("participant keying is per-Seat, not per-profile", () => {
  const resumeCaps: ProviderCapabilities = {
    providerType: "claude-code",
    sessionReuse: "resume",
    interactiveSessions: true,
    reportsSessionId: true,
    reportsTokenUsage: true,
  };

  // Two seats, IDENTICAL provider (and therefore identical model/effort/profile
  // in the real resolver) - a writer and a reviewer both on "claude".
  const snapshot = {
    flowId: "f",
    flowVersion: 1,
    seats: [
      { id: "writer", label: "Writer" },
      { id: "reviewer", label: "Reviewer" },
    ],
    steps: [
      { seat: "writer", providerId: "claude", resolvedRoleLabel: "Writer" },
      { seat: "reviewer", providerId: "claude", resolvedRoleLabel: "Reviewer" },
    ],
  } as never;

  it("builds one participant per seat even when the provider is shared", () => {
    const ledger = createFlowParticipantLedger({
      snapshot,
      capabilities: () => resumeCaps,
    });
    expect(ledger.participants.map((p) => p.seat).sort()).toEqual([
      "reviewer",
      "writer",
    ]);
    // Each starts with its own, null session - no shared handle.
    for (const p of ledger.participants) expect(p.sessionId).toBeNull();
  });

  it("the reviewer never inherits the writer's session", () => {
    const ledger = createFlowParticipantLedger({
      snapshot,
      capabilities: () => resumeCaps,
    });
    // Writer has been running and holds a live session.
    const writer = ledger.participants.find((p) => p.seat === "writer")!;
    writer.sessionId = "WRITER-SESSION";
    writer.turns = [turn("WRITER-SESSION")];

    // The reviewer's turn opens a FRESH session - it must not resume the writer's.
    const rev = prepareFlowParticipantTurn(ledger, "reviewer", 0);
    expect(rev.contextMode).toBe("opened");
    expect(rev.sessionRequest?.action).toBe("open");
    expect(rev.sessionRequest?.sessionId).not.toBe("WRITER-SESSION");
  });
});

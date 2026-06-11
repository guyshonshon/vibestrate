import { describe, it, expect } from "vitest";
import {
  deriveSeatBoard,
  activeSeatCard,
} from "../src/ui/lib/seat-board.js";
import type { FlowRunState, RuntimeMetrics } from "../src/ui/lib/types.js";

function mkStep(o: Partial<FlowRunState["steps"][number]>): FlowRunState["steps"][number] {
  return {
    id: "s1",
    label: "Step",
    kind: "agent-turn",
    status: "pending",
    optional: false,
    stage: null,
    seat: "implementer",
    resolvedRoleId: "implementer",
    resolvedRoleLabel: "Implementer",
    profileId: "default",
    providerId: "claude",
    promptArtifactPath: "flows/s1/prompt.md",
    outputArtifactPath: null,
    contextPacketPath: null,
    validationArtifactPath: null,
    startedAt: null,
    endedAt: null,
    error: null,
    ...o,
  } as FlowRunState["steps"][number];
}

function mkFlow(steps: FlowRunState["steps"]): FlowRunState {
  return {
    flowId: "f",
    flowVersion: 1,
    label: "F",
    snapshotPath: "x",
    participantLedgerPath: null,
    participants: [],
    currentStepId: null,
    steps,
  };
}

describe("deriveSeatBoard", () => {
  it("maps step statuses to card states + stream names", () => {
    const cards = deriveSeatBoard(
      mkFlow([
        mkStep({ id: "plan", status: "passed" }),
        mkStep({ id: "implement", status: "running" }),
        mkStep({ id: "review", status: "pending" }),
      ]),
      null,
    );
    expect(cards.map((c) => c.state)).toEqual(["done", "working", "waiting"]);
    expect(cards[1]!.streamName).toBe("flows/s1/prompt");
  });

  it("rolls up step tokens from metrics by stageId", () => {
    const metrics = {
      roles: [
        { stageId: "implement", tokenUsage: { input: 100, output: 50 } },
        { stageId: "implement", tokenUsage: { input: 10, output: 5 } },
        { stageId: "plan", tokenUsage: null },
      ],
    } as unknown as RuntimeMetrics;
    const cards = deriveSeatBoard(
      mkFlow([mkStep({ id: "implement", status: "passed" })]),
      metrics,
    );
    expect(cards[0]!.tokens).toBe(165);
  });

  it("groups parallel fan-out members by their needs set", () => {
    const cards = deriveSeatBoard(
      mkFlow([
        mkStep({ id: "implement" }),
        mkStep({ id: "r1", needs: ["implement"] }),
        mkStep({ id: "r2", needs: ["implement"] }),
        mkStep({ id: "join", needs: ["r1", "r2"] }),
      ] as FlowRunState["steps"]),
      null,
    );
    expect(cards[1]!.groupKey).toBe(cards[2]!.groupKey);
    expect(cards[1]!.groupKey).not.toBe(cards[3]!.groupKey);
  });

  it("activeSeatCard prefers working, then last finished", () => {
    const working = deriveSeatBoard(
      mkFlow([
        mkStep({ id: "a", status: "passed" }),
        mkStep({ id: "b", status: "running" }),
      ]),
      null,
    );
    expect(activeSeatCard(working)?.stepId).toBe("b");
    const done = deriveSeatBoard(
      mkFlow([
        mkStep({ id: "a", status: "passed" }),
        mkStep({ id: "b", status: "failed" }),
        mkStep({ id: "c", status: "pending" }),
      ]),
      null,
    );
    expect(activeSeatCard(done)?.stepId).toBe("b");
  });

  it("handles a missing flow honestly", () => {
    expect(deriveSeatBoard(null, null)).toEqual([]);
    expect(activeSeatCard([])).toBeNull();
  });
});

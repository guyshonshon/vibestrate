import { describe, expect, it } from "vitest";
import {
  buildFlowRunArgs,
  formatFlowRunCommand,
} from "../../src/cli/wizards/flow-run-wizard.js";

describe("Phase 7 Flow CLI wizard command summary", () => {
  it("emits a deterministic scriptable Flow run from wizard choices", () => {
    expect(
      buildFlowRunArgs({
        flowId: "quality-arbitration",
        task: "add audit logging",
        brief: "keep migrations reversible",
        contextPolicy: "compact",
        stepProfiles: {
          "implementation-review": "codex-balanced",
          implement: "claude-balanced",
          "decision-summary": "opus-deep",
        },
        skippedOptionalSteps: ["plan-review"],
      }),
    ).toEqual([
      "run",
      "--flow",
      "quality-arbitration",
      "--flow-brief",
      "keep migrations reversible",
      "--flow-context",
      "compact",
      "--step-profile",
      "decision-summary=opus-deep",
      "--step-profile",
      "implement=claude-balanced",
      "--step-profile",
      "implementation-review=codex-balanced",
      "--flow-skip",
      "plan-review",
      "add audit logging",
    ]);
  });

  it("prints the same run as a vibe command", () => {
    expect(
      formatFlowRunCommand({
        flowId: "quality-arbitration",
        task: "ship it",
        brief: null,
        contextPolicy: "balanced",
        stepProfiles: { implement: "claude-balanced" },
        skippedOptionalSteps: [],
      }),
    ).toBe(
      "vibe run --flow quality-arbitration --flow-context balanced --step-profile implement=claude-balanced \"ship it\"",
    );
  });
});

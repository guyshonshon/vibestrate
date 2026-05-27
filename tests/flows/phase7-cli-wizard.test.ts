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
        slotProviders: {
          challenger: "codex",
          builder: "claude",
          arbiter: "amaco",
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
      "--flow-slot",
      "arbiter=amaco",
      "--flow-slot",
      "builder=claude",
      "--flow-slot",
      "challenger=codex",
      "--flow-skip",
      "plan-review",
      "add audit logging",
    ]);
  });

  it("prints the same run as an amaco command", () => {
    expect(
      formatFlowRunCommand({
        flowId: "quality-arbitration",
        task: "ship it",
        brief: null,
        contextPolicy: "balanced",
        slotProviders: { builder: "claude" },
        skippedOptionalSteps: [],
      }),
    ).toBe(
      "amaco run --flow quality-arbitration --flow-context balanced --flow-slot builder=claude \"ship it\"",
    );
  });
});

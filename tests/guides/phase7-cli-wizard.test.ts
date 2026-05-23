import { describe, expect, it } from "vitest";
import {
  buildGuideRunArgs,
  formatGuideRunCommand,
} from "../../src/cli/wizards/guide-run-wizard.js";

describe("Phase 7 Guide CLI wizard command summary", () => {
  it("emits a deterministic scriptable Guide run from wizard choices", () => {
    expect(
      buildGuideRunArgs({
        guideId: "quality-arbitration",
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
      "--guide",
      "quality-arbitration",
      "--guide-brief",
      "keep migrations reversible",
      "--guide-context",
      "compact",
      "--guide-slot",
      "arbiter=amaco",
      "--guide-slot",
      "builder=claude",
      "--guide-slot",
      "challenger=codex",
      "--guide-skip",
      "plan-review",
      "add audit logging",
    ]);
  });

  it("prints the same run as an amaco command", () => {
    expect(
      formatGuideRunCommand({
        guideId: "quality-arbitration",
        task: "ship it",
        brief: null,
        contextPolicy: "balanced",
        slotProviders: { builder: "claude" },
        skippedOptionalSteps: [],
      }),
    ).toBe(
      "amaco run --guide quality-arbitration --guide-context balanced --guide-slot builder=claude \"ship it\"",
    );
  });
});

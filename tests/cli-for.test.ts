import { describe, it, expect } from "vitest";
import { cliFor } from "../src/ui/lib/cliFor.js";

describe("cliFor", () => {
  it("maps queue + cancel + run task actions", () => {
    expect(cliFor({ kind: "queue-task", taskId: "task-1" })).toBe(
      "vibestrate queue add task-1",
    );
    expect(cliFor({ kind: "cancel-task", taskId: "task-1" })).toBe(
      "vibestrate tasks cancel task-1",
    );
    expect(cliFor({ kind: "run-task", taskId: "task-1" })).toBe(
      "vibestrate tasks run task-1",
    );
  });

  it("maps run lifecycle actions", () => {
    expect(cliFor({ kind: "status-run", runId: "run-abc" })).toBe(
      "vibestrate status run-abc",
    );
    expect(cliFor({ kind: "pause-run", runId: "run-abc" })).toBe(
      "vibestrate pause run-abc",
    );
    expect(cliFor({ kind: "abort-run", runId: "run-abc" })).toBe(
      "vibestrate abort run-abc",
    );
  });

  it("quotes spawn-run tasks that contain whitespace + forwards flags in stable order", () => {
    expect(
      cliFor({
        kind: "spawn-run",
        task: "add health check",
        provider: "claude",
        effort: "high",
        readOnly: true,
        skills: ["sec", "logs"],
      }),
    ).toBe(
      'vibestrate run --provider claude --effort high --read-only --skills sec,logs "add health check"',
    );
  });

  it("returns null for actions that have no CLI parity yet", () => {
    expect(
      cliFor({ kind: "approve-approval", runId: "r", approvalId: "a" }),
    ).toBeNull();
    expect(cliFor({ kind: "open-task", taskId: "t" })).toBeNull();
  });
});

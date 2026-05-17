import { describe, it, expect } from "vitest";
import { deriveRerunArgs, formatArgv } from "../src/scheduler/rerun-args.js";

describe("deriveRerunArgs", () => {
  it("emits just `run <task>` for a bare run", () => {
    expect(deriveRerunArgs({ task: "say hello" })).toEqual([
      "run",
      "say hello",
    ]);
  });

  it("forwards taskId, effort, providerOverride, readOnly in stable order", () => {
    expect(
      deriveRerunArgs({
        task: "ship it",
        taskId: "task-ship-1",
        effort: "high",
        providerOverride: "claude",
        readOnly: true,
      }),
    ).toEqual([
      "run",
      "--task",
      "task-ship-1",
      "--effort",
      "high",
      "--provider",
      "claude",
      "--read-only",
      "ship it",
    ]);
  });

  it("ignores null / undefined / false fields", () => {
    expect(
      deriveRerunArgs({
        task: "x",
        taskId: null,
        effort: null,
        providerOverride: null,
        readOnly: false,
      }),
    ).toEqual(["run", "x"]);
  });

  it("formatArgv quotes args with spaces", () => {
    expect(formatArgv(["run", "say hello", "--effort", "low"])).toBe(
      'run "say hello" --effort low',
    );
  });
});

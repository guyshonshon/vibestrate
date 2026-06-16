import { describe, it, expect } from "vitest";
import { deriveRerunArgs, formatArgv } from "../src/scheduler/rerun-args.js";

describe("deriveRerunArgs", () => {
  it("emits just `run <task>` for a bare run", () => {
    expect(deriveRerunArgs({ task: "say hello" })).toEqual([
      "run",
      "say hello",
    ]);
  });

  it("forwards taskId, providerOverride, readOnly in stable order", () => {
    expect(
      deriveRerunArgs({
        task: "ship it",
        taskId: "task-ship-1",
        providerOverride: "claude",
        readOnly: true,
      }),
    ).toEqual([
      "run",
      "--task",
      "task-ship-1",
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
        providerOverride: null,
        readOnly: false,
      }),
    ).toEqual(["run", "x"]);
  });

  it("forwards runtimeSkills via --skills <csv>", () => {
    expect(
      deriveRerunArgs({
        task: "audit auth",
        runtimeSkills: ["security-review", "logs-101"],
      }),
    ).toEqual(["run", "--skills", "security-review,logs-101", "audit auth"]);
  });

  it("forwards --concise when set", () => {
    expect(
      deriveRerunArgs({ task: "tidy", concise: true }),
    ).toEqual(["run", "--concise", "tidy"]);
  });

  it("formatArgv quotes args with spaces", () => {
    expect(formatArgv(["run", "say hello", "--provider", "claude"])).toBe(
      'run "say hello" --provider claude',
    );
  });
});

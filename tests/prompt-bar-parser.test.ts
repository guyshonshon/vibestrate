import { describe, it, expect } from "vitest";
import { parsePromptInput } from "../src/ui/components/PromptBar.js";

const defaults = { effort: "" as const, readOnly: false };

describe("parsePromptInput", () => {
  it("treats free text as a run", () => {
    expect(parsePromptInput("fix the login bug", defaults)).toEqual({
      kind: "run",
      task: "fix the login bug",
      effort: "",
      readOnly: false,
    });
  });

  it("forwards effort + readOnly from the toolbar", () => {
    expect(
      parsePromptInput("ship it", { effort: "high", readOnly: true }),
    ).toEqual({
      kind: "run",
      task: "ship it",
      effort: "high",
      readOnly: true,
    });
  });

  it("/task <title> creates a backlog task", () => {
    expect(parsePromptInput("/task add CSV export", defaults)).toEqual({
      kind: "create-task",
      title: "add CSV export",
    });
  });

  it("/queue <id> enqueues, /queue alone navigates", () => {
    expect(parsePromptInput("/queue task-abc", defaults)).toEqual({
      kind: "queue-task",
      taskId: "task-abc",
    });
    expect(parsePromptInput("/queue", defaults)).toEqual({
      kind: "nav",
      target: "queue",
    });
  });

  it("nav commands route to pages", () => {
    expect(parsePromptInput("/board", defaults)).toEqual({
      kind: "nav",
      target: "board",
    });
    expect(parsePromptInput("/runs", defaults)).toEqual({
      kind: "nav",
      target: "runs",
    });
    expect(parsePromptInput("/settings", defaults)).toEqual({
      kind: "nav",
      target: "settings",
    });
  });

  it("/help returns help", () => {
    expect(parsePromptInput("/help", defaults)).toEqual({ kind: "help" });
  });

  it("empty input is an error", () => {
    expect(parsePromptInput("   ", defaults)).toMatchObject({ kind: "error" });
  });

  it("unknown slash command is an error", () => {
    expect(parsePromptInput("/wat", defaults)).toMatchObject({
      kind: "error",
      message: expect.stringMatching(/Unknown/),
    });
  });

  it("/run without arg errors; /run with arg runs", () => {
    expect(parsePromptInput("/run", defaults)).toMatchObject({ kind: "error" });
    expect(parsePromptInput("/run ship it", defaults)).toEqual({
      kind: "run",
      task: "ship it",
      effort: "",
      readOnly: false,
    });
  });
});

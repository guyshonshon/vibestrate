import { describe, it, expect } from "vitest";
import { buildSagaCommand } from "../src/cli/commands/saga.js";

describe("vibe saga command wiring", () => {
  it("registers create, add-step, list, show", () => {
    const names = buildSagaCommand().commands.map((c) => c.name());
    expect(names).toEqual(expect.arrayContaining(["create", "add-step", "list", "show"]));
  });

  it("create accepts --description and --json", () => {
    const create = buildSagaCommand().commands.find((c) => c.name() === "create");
    expect(create?.options.map((o) => o.long)).toEqual(
      expect.arrayContaining(["--description", "--json"]),
    );
  });

  it("add-step accepts --objective, --acceptance, --files", () => {
    const addStep = buildSagaCommand().commands.find((c) => c.name() === "add-step");
    expect(addStep?.options.map((o) => o.long)).toEqual(
      expect.arrayContaining(["--objective", "--acceptance", "--files"]),
    );
  });

  it("registers edit-step and reorder", () => {
    const names = buildSagaCommand().commands.map((c) => c.name());
    expect(names).toEqual(expect.arrayContaining(["edit-step", "reorder"]));
  });

  it("edit-step accepts --objective, --acceptance, --files, --text", () => {
    const editStep = buildSagaCommand().commands.find((c) => c.name() === "edit-step");
    expect(editStep?.options.map((o) => o.long)).toEqual(
      expect.arrayContaining(["--objective", "--acceptance", "--files", "--text"]),
    );
  });
});

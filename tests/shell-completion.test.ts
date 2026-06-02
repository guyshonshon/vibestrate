import { describe, it, expect } from "vitest";
import {
  applyCompletion,
  completeInput,
  specFromProgram,
  type CommandNode,
} from "../src/shell/ink/completion.js";
import { buildVibestrateProgram } from "../src/cli/index.js";
import {
  initialUiState,
  reduceShellUi,
} from "../src/shell/ink/ui-state.js";

const spec = specFromProgram(buildVibestrateProgram());

function values(input: string): string[] {
  return completeInput(input, spec).items.map((i) => i.value);
}

describe("completion engine", () => {
  it("walks the real program into a tree (config -> view/show, with flags)", () => {
    const config = spec.subcommands.find((s) => s.name === "config");
    expect(config).toBeDefined();
    const subs = config!.subcommands.map((s) => s.name);
    expect(subs).toContain("view");
    expect(subs).toContain("show");
    // --help is surfaced on every node.
    expect(config!.flags.some((f) => f.value === "--help")).toBe(true);
  });

  it("completes top-level commands by prefix", () => {
    expect(values("con")).toContain("config");
    expect(completeInput("con", spec).query).toBe("con");
  });

  it("lists subcommands after a command + space", () => {
    const out = values("config ");
    for (const s of ["view", "show", "get", "set", "validate"]) {
      expect(out).toContain(s);
    }
  });

  it("prefix-filters subcommands", () => {
    const out = values("config v");
    expect(out).toContain("view");
    expect(out).toContain("validate");
    expect(out).not.toContain("show");
  });

  it("completes flags only once a dash is typed", () => {
    // A word token never offers flags...
    expect(values("config show ").every((v) => !v.startsWith("-"))).toBe(true);
    // ...but a dash does.
    expect(values("config show -")).toContain("--json");
    expect(values("config show --j")).toContain("--json");
  });

  it("returns nothing for an unknown command prefix", () => {
    expect(values("zzzznope")).toEqual([]);
  });

  it("applyCompletion replaces the active token and adds a trailing space", () => {
    expect(applyCompletion("config sh", "sh", "show")).toBe("config show ");
    expect(applyCompletion("config ", "", "view")).toBe("config view ");
    expect(applyCompletion("config show --j", "--j", "--json")).toBe(
      "config show --json ",
    );
  });
});

describe("completion + output reducer state", () => {
  const emptySpec: CommandNode = { name: "vibe", subcommands: [], flags: [] };
  void emptySpec;

  it("editing the input re-arms the overlay (dismissed -> false)", () => {
    let s = reduceShellUi(initialUiState, { type: "completion.dismiss" });
    expect(s.completion.dismissed).toBe(true);
    s = reduceShellUi(s, { type: "runner.input", value: "config" });
    expect(s.completion.dismissed).toBe(false);
    expect(s.completion.index).toBe(0);
  });

  it("completion.move clamps within [0, max]", () => {
    let s = reduceShellUi(initialUiState, {
      type: "completion.move",
      delta: 5,
      max: 2,
    });
    expect(s.completion.index).toBe(2);
    s = reduceShellUi(s, { type: "completion.move", delta: -10, max: 2 });
    expect(s.completion.index).toBe(0);
  });

  it("a finished run auto-expands output when it's verbose", () => {
    const verbose = Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n");
    let s = reduceShellUi(initialUiState, { type: "runner.started" });
    expect(s.outputExpanded).toBe(false);
    s = reduceShellUi(s, { type: "runner.append", chunk: verbose });
    s = reduceShellUi(s, { type: "runner.finished", exitCode: 0 });
    expect(s.outputExpanded).toBe(true);
  });

  it("a finished run with short output stays in the narrow pane", () => {
    let s = reduceShellUi(initialUiState, { type: "runner.started" });
    s = reduceShellUi(s, { type: "runner.append", chunk: "ok\n" });
    s = reduceShellUi(s, { type: "runner.finished", exitCode: 0 });
    expect(s.outputExpanded).toBe(false);
  });
});

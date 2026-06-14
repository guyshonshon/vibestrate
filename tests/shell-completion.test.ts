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

  it("completes config keys from the schema after `config set ` (T8)", () => {
    const out = values("config set ");
    expect(out).toContain("workflow.maxReviewLoops");
    expect(out).toContain("commands.validate");
    // prefix-filtered
    expect(values("config set git.")).toContain("git.mainBranch");
    expect(values("config set git.")).not.toContain("workflow.maxReviewLoops");
  });

  it("shows each key's current value inline (= V) + tip as detail", () => {
    const items = completeInput("config set git.main", spec, {
      configValues: { "git.mainBranch": "develop" },
    }).items;
    const item = items.find((i) => i.value === "git.mainBranch");
    expect(item).toBeDefined();
    expect(item!.description).toBe("= develop");
    // The tip (schema .describe()) rides on `detail`, shown on its own line.
    expect(item!.detail).toBeTruthy();
  });

  it("also completes config keys for `config get` (read side)", () => {
    expect(values("config get git.")).toContain("git.mainBranch");
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

describe("value completion", () => {
  function vals(input: string, ctx = {}): string[] {
    return completeInput(input, spec, ctx).items.map((i) => i.value);
  }

  it("completes a flag's static enum after a space", () => {
    const out = vals("run x --effort ");
    expect(out).toEqual(["low", "medium", "high"]);
  });

  it("prefix-filters the flag enum", () => {
    expect(vals("run x --effort hi")).toEqual(["high"]);
    expect(completeInput("run x --effort hi", spec).query).toBe("hi");
  });

  it("completes the inline --flag=value form", () => {
    expect(vals("run x --effort=me")).toEqual(["--effort=medium"]);
  });

  it("completes live ids for --crew / --flow / --profile from context", () => {
    expect(vals("run x --crew ", { crew: ["alpha", "beta"] })).toEqual([
      "alpha",
      "beta",
    ]);
    expect(vals("run x --flow al", { flow: ["alpha", "alembic", "zeta"] })).toEqual([
      "alpha",
      "alembic",
    ]);
    expect(
      vals("run x --profile cl", { profile: ["claude-balanced", "codex"] }),
    ).toEqual(["claude-balanced"]);
  });

  it("completes a runId placeholder flag (--resume-from <runId>)", () => {
    expect(vals("run x --resume-from ", { run: ["run-1", "run-2"] })).toEqual([
      "run-1",
      "run-2",
    ]);
  });

  it("completes an explicit <runId> positional (replay <runId>)", () => {
    expect(vals("replay ", { run: ["run-1", "run-2"] })).toEqual(["run-1", "run-2"]);
  });

  it("completes a generic <id> positional from the command domain", () => {
    // tasks show <id> -> task ids; flows show <id> -> flow ids.
    expect(vals("tasks show ", { task: ["task-7"], flow: ["f-1"] })).toEqual([
      "task-7",
    ]);
    expect(vals("flows show ", { task: ["task-7"], flow: ["f-1"] })).toEqual(["f-1"]);
  });

  it("never completes a free-text positional (run's [task...], tasks add <title>)", () => {
    expect(vals("run ", { task: ["task-7"] })).not.toContain("task-7");
    expect(vals("tasks add ", { task: ["task-7"] })).not.toContain("task-7");
  });
});

describe("completion + output reducer state", () => {
  const emptySpec: CommandNode = {
    name: "vibe",
    subcommands: [],
    flags: [],
    arguments: [],
  };
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

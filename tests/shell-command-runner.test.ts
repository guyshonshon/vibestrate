import { describe, it, expect } from "vitest";
import {
  parseArgs,
  runVibestrateCommand,
} from "../src/shell/ink/runner/command-runner.js";

describe("parseArgs", () => {
  it("splits on whitespace", () => {
    expect(parseArgs("status --json")).toEqual(["status", "--json"]);
    expect(parseArgs("   tasks   list   ")).toEqual(["tasks", "list"]);
  });

  it("treats quoted strings as a single arg", () => {
    expect(parseArgs('tasks add "fix login"')).toEqual([
      "tasks",
      "add",
      "fix login",
    ]);
    expect(parseArgs("tasks add 'fix login'")).toEqual([
      "tasks",
      "add",
      "fix login",
    ]);
  });

  it("returns [] for an empty / whitespace-only string", () => {
    expect(parseArgs("")).toEqual([]);
    expect(parseArgs("   \t  ")).toEqual([]);
  });

  it("does not perform shell expansion on $VAR, |, &, ;, *", () => {
    expect(parseArgs("run $HOME")).toEqual(["run", "$HOME"]);
    expect(parseArgs("queue add foo; rm -rf /")).toEqual([
      "queue",
      "add",
      "foo;",
      "rm",
      "-rf",
      "/",
    ]);
  });
});

describe("runVibestrateCommand", () => {
  it("invokes the vibe binary and captures output", async () => {
    const chunks: string[] = [];
    const r = await runVibestrateCommand({
      projectRoot: process.cwd(),
      argv: ["--version"],
      onChunk: (c) => chunks.push(c),
    });
    expect(r.exitCode).toBe(0);
    expect(r.output).toMatch(/\d+\.\d+\.\d+/);
    expect(chunks.join("")).toBe(r.output);
  });
});

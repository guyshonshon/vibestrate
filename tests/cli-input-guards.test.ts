import { describe, it, expect, vi, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { buildVibestrateProgram } from "../src/cli/index.js";
import { resolvePickupFlow } from "../src/cli/commands/tasks.js";
import * as welcomeState from "../src/cli/welcome/welcome-state.js";

function subcommand(name: string) {
  const found = buildVibestrateProgram().commands.find((c) => c.name() === name);
  if (!found) throw new Error(`command "${name}" is not registered`);
  return found;
}

function portOption(commandName: string, long: string): (value: string) => number {
  const opt = subcommand(commandName).options.find((o) => o.long === long);
  if (!opt?.parseArg) throw new Error(`${commandName} ${long} has no coercer`);
  // Commander types parseArg generically over the accumulated value; the port
  // coercer ignores it and always yields a number.
  return opt.parseArg as unknown as (value: string) => number;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("port options reject bad values at the flag boundary", () => {
  // Both `run --ui-port` and `ui --port` share one coercer.
  for (const [command, long] of [
    ["run", "--ui-port"],
    ["ui", "--port"],
  ] as const) {
    it(`${command} ${long} rejects non-numeric, zero, and out-of-range`, () => {
      const parse = portOption(command, long);
      for (const bad of ["abc", "", "0", "99999", "-1", "80.5", "8080abc"]) {
        expect(() => parse(bad), `expected "${bad}" rejected`).toThrow(
          /1 and 65535/,
        );
      }
    });

    it(`${command} ${long} accepts a valid port as a number`, () => {
      expect(portOption(command, long)("4317")).toBe(4317);
    });
  }

  it("commander surfaces the flag name and exits non-zero on a bad port", () => {
    const ui = subcommand("ui");
    ui.exitOverride();
    // Silence commander's own stderr write.
    ui.configureOutput({ writeErr: () => {} });
    let thrown: unknown;
    try {
      ui.parse(["--port", "abc"], { from: "user" });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    const err = thrown as Error & { exitCode?: number; code?: string };
    expect(err.code).toBe("commander.invalidArgument");
    expect(err.exitCode).not.toBe(0);
    expect(err.message).toContain("--port");
    expect(err.message).toContain("1 and 65535");
  });
});

describe("tasks pickup --flow", () => {
  it("registers the --flow option", () => {
    const pickup = subcommand("tasks").commands.find((c) => c.name() === "pickup");
    expect(pickup?.options.map((o) => o.long)).toEqual(
      expect.arrayContaining(["--step", "--flow"]),
    );
  });

  it("accepts a checklist-aware flow", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-pickup-"));
    await expect(resolvePickupFlow(root, "pickup-review")).resolves.toBe(
      "pickup-review",
    );
  });

  it("fails closed on a flow with no per-item segment, naming the valid ones", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-pickup-"));
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((msg?: unknown) => {
      errors.push(String(msg));
    });
    // `default` is a real, resolvable flow - it just has no checklistSegment,
    // so it must be refused rather than handed to the child run.
    await expect(resolvePickupFlow(root, "default")).resolves.toBeNull();
    expect(errors.join("\n")).toMatch(/not checklist-aware/);
    expect(errors.join("\n")).toMatch(/pickup-review/);
  });

  it("fails closed on an unknown flow id", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-pickup-"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(resolvePickupFlow(root, "no-such-flow")).resolves.toBeNull();
  });
});

describe("retired surfaces stay retired", () => {
  it("does not register a top-level `saga` command", () => {
    const names = buildVibestrateProgram().commands.map((c) => c.name());
    expect(names).not.toContain("saga");
    // Saga authoring lives under `vibe tasks` (create with --supervised).
    expect(names).toContain("tasks");
  });

  it("keeps welcome-state persistence module-private", () => {
    expect(Object.keys(welcomeState)).not.toContain("writeWelcomeState");
    expect(Object.keys(welcomeState)).toContain("recordWelcomeStep");
  });
});

import { describe, expect, it } from "vitest";
import { InvalidArgumentError } from "commander";
import { buildVibestrateProgram } from "../src/cli/index.js";

/**
 * `--ui-port` / `--port` used to be parsed with a bare `parseInt`, so
 * `--ui-port abc` started the dashboard on `NaN` and only failed later, deep in
 * the bind. Rejection has to happen at the boundary, on the way in.
 *
 * The table is the point: each row is a shape that coerces to something
 * plausible if you check it the lazy way. `""` and `"3000.5"` both survive a
 * bare `Number()`, and `"0"` and `"65536"` are perfectly good integers that are
 * not ports.
 *
 * This was written in a run worktree against a second implementation of the
 * same fix and never committed; it is rescued here against the one on main.
 */
const INVALID: readonly (readonly [string, string])[] = [
  ["non-numeric", "abc"],
  ["empty", ""],
  ["floating-point", "3000.5"],
  ["zero", "0"],
  ["above 65535", "65536"],
  ["mixed numeric and text", "3000abc"],
];

/** Reach the option's own parser, so the test binds to the CLI wiring rather
 *  than to a helper the command might not actually be using. */
function portParser(commandName: string, flag: string): (value: string) => number {
  const command = buildVibestrateProgram().commands.find(
    (candidate) => candidate.name() === commandName,
  );
  const option = command?.options.find((candidate) => candidate.long === flag);
  if (!option?.parseArg) {
    throw new Error(`Missing parser for ${commandName} ${flag}`);
  }
  return option.parseArg as unknown as (value: string) => number;
}

describe.each([
  ["run", "--ui-port"],
  ["ui", "--port"],
] as const)("vibe %s %s", (commandName, flag) => {
  const parse = portParser(commandName, flag);

  // Asserting the error TYPE, not its wording: Commander turns an
  // InvalidArgumentError into a usage error and exits, which is the behaviour
  // that matters. Pinning the sentence would make this fail on a copy edit.
  it.each(INVALID)("rejects %s input", (_shape, value) => {
    expect(() => parse(value)).toThrow(InvalidArgumentError);
  });

  it("accepts a valid port", () => {
    expect(parse("4317")).toBe(4317);
  });
});

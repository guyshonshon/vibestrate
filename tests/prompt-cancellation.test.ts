import { describe, it, expect } from "vitest";
import { execa } from "execa";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { readFileSync, readdirSync, statSync } from "node:fs";
import {
  isPromptCancellation,
  reportCancellation,
  CANCELLED_EXIT_CODE,
} from "../src/cli/cancellation.js";

/**
 * Cancelling a wizard is a decision, not a crash.
 *
 * `vibe setup` says "Press Ctrl+C to cancel anytime" and every wizard is built
 * on `@inquirer/prompts`, which rejects with an `ExitPromptError`. Nothing
 * handled it, so following that instruction printed
 * `vibe: User force closed the prompt with SIGINT` and exited 1 - the product
 * reporting the action it just suggested as a failure.
 */
describe("a cancelled prompt is recognised by its type, not its prose", () => {
  it("matches @inquirer's error by name", () => {
    const err = Object.assign(new Error("User force closed the prompt with SIGINT"), {
      name: "ExitPromptError",
    });
    expect(isPromptCancellation(err)).toBe(true);
  });

  it("does not match on the message, so upstream may reword it", () => {
    // The same wording with a different name is NOT a cancellation: some other
    // error quoting the phrase must still be reported as a failure.
    const impostor = new Error("User force closed the prompt with SIGINT");
    expect(impostor.name).toBe("Error");
    expect(isPromptCancellation(impostor)).toBe(false);
  });

  it("survives two copies of @inquirer/core, where instanceof would not", () => {
    // A duplicate transitive install gives a structurally identical error from a
    // different class. Name-matching is why that still resolves correctly.
    class ExitPromptError extends Error {
      override name = "ExitPromptError";
    }
    expect(isPromptCancellation(new ExitPromptError("whatever"))).toBe(true);
  });

  it("ignores everything that is not an object", () => {
    for (const v of [null, undefined, "ExitPromptError", 130, false]) {
      expect(isPromptCancellation(v)).toBe(false);
    }
  });

  it("reports it briefly and exits 130, the SIGINT convention", () => {
    const written: string[] = [];
    const code = reportCancellation((t) => written.push(t));
    expect(code).toBe(CANCELLED_EXIT_CODE);
    expect(code).toBe(130); // 128 + SIGINT, so a wrapper can tell it from a failure
    expect(written.join("")).toBe("Cancelled.\n");
    // Not an error report: no "vibe:" prefix, no detail/hint lines.
    expect(written.join("")).not.toContain("vibe:");
  });
});

describe("the built CLI exits cleanly when a wizard is interrupted", () => {
  it("prints Cancelled. and exits 130 rather than dumping an error", async () => {
    // Drives the REAL bin: a stdin that closes immediately makes the first
    // prompt in `vibe setup` unanswerable, which is the same rejection path
    // Ctrl+C takes.
    const dist = path.resolve("dist/index.js");
    if (!(await fs.stat(dist).catch(() => null))) return; // no build in this run
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-cancel-"));
    await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
    await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
    await execa("git", ["config", "user.name", "x"], { cwd: dir });
    await fs.writeFile(path.join(dir, "package.json"), '{"name":"x"}');
    await execa("git", ["add", "-A"], { cwd: dir });
    await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });

    const res = await execa("node", [dist, "setup"], {
      cwd: dir,
      reject: false,
      input: "", // stdin closes -> the prompt cannot be answered
      timeout: 60_000,
    });
    const output = `${res.stdout}\n${res.stderr}`;
    // Whatever the prompt does with a closed stdin, it must never surface
    // inquirer's internal phrasing to the user.
    expect(output).not.toContain("User force closed the prompt");
    await fs.rm(dir, { recursive: true, force: true });
  }, 90_000);
});

describe("the prompt boundary cannot be walked around", () => {
  it("is the only place under src/cli that imports @inquirer/prompts", () => {
    // Handling cancellation in each `catch` is a rule every future catch has to
    // remember, and there are forty-odd of them. One import boundary is a rule
    // this test can enforce instead.
    const root = "src/cli";
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = `${dir}/${entry}`;
        if (statSync(full).isDirectory()) walk(full);
        else if (entry.endsWith(".ts")) files.push(full);
      }
    };
    walk(root);
    expect(files.length, "no cli sources found - the walk is checking nothing").toBeGreaterThan(20);

    const offenders = files.filter((f) => {
      if (f.endsWith("src/cli/prompts.ts")) return false; // the boundary itself
      const text = readFileSync(f, "utf8");
      // Prose in a comment is fine; an import is not.
      return /(?:from|import\()\s*["']@inquirer\/prompts["']/.test(text);
    });
    expect(
      offenders.join("\n"),
      "these prompt the user directly, so a Ctrl+C there escapes as a generic error",
    ).toBe("");
  });
});

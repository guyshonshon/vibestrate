import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Vibestrate never pushes. This is the test that makes that a fact rather than
 * a sentence in the docs.
 *
 * The claim appears verbatim in `getting-started/why-a-human.md`,
 * `getting-started/merging.md`, `concepts/safety.md`, `cli/dashboard.md`,
 * README.md and `.github/SECURITY.md` - where "anything that causes an
 * auto-push without explicit human action" is scoped as a REPORTABLE
 * VULNERABILITY. A published security policy resting on prose that nothing
 * checks is the gap this closes.
 *
 * `vibe integrate pr` was built as a preparer for exactly this reason: opening
 * a pull request requires a push, and the guarantee is worth more than the
 * convenience. It writes the body and prints the command; a human runs it.
  *
 * SCOPE, stated exactly: this walks `src/`, so it pins that VIBESTRATE never
 * spawns a push. It says nothing about an AGENT: a shell-capable seat holds a
 * real shell and could run `git push` itself. That is bounded by the command
 * grant a seat is given (safety/command-grants.ts, which never grants `git
 * push` by default) and by isolation, not by this test.
*/
const SRC = "src";

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sources(full));
    else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/**
 * Files allowed to contain the string `push` next to git, because they talk
 * ABOUT pushing rather than doing it. Anything else is a new push path.
 */
const MENTIONS_ALLOWED = new Set([
  // Declares "push" in a permission profile's forbidden-operations list.
  "src/safety/permission-profiles.ts",
  // Scaffolds that same list into a new project's config.
  "src/project/init-template.ts",
  // Renders the list into the agent's prompt.
  "src/core/context/prompt-builder.ts",
  // Prepares a PR without opening one - and says so.
  "src/git/pr-prepare.ts",
  // The compiled docs corpus quotes the guarantee.
  "src/consult/handbook/handbook-corpus.generated.ts",
]);

describe("no code path pushes to a remote", () => {
  const files = sources(SRC);

  it("finds the source tree at all", () => {
    expect(files.length).toBeGreaterThan(300);
  });

  it("never invokes `git push`", () => {
    // Every shape that would actually run it: an argv array, a shell string, or
    // a porcelain helper. `git.ts` has no push helper, so an argv is the only
    // way one could appear.
    const patterns = [
      /["'`]push["'`]\s*,/, //  execa("git", ["push", …])
      /\bgit\s+push\b/, //      a shell string, or `gh` doing it for us
      /["'`]--force-with-lease["'`]/,
    ];
    const offenders: string[] = [];
    for (const file of files) {
      const rel = file.replace(/\\/g, "/");
      if (MENTIONS_ALLOWED.has(rel)) continue;
      const text = readFileSync(file, "utf8");
      for (const re of patterns) {
        const m = re.exec(text);
        if (!m) continue;
        // A comment saying we do not push is not a push.
        const line = text.slice(0, m.index).split("\n").length;
        const source = text.split("\n")[line - 1] ?? "";
        if (/^\s*(\/\/|\*|\/\*)/.test(source)) continue;
        offenders.push(`${rel}:${line}: ${source.trim().slice(0, 100)}`);
      }
    }
    expect(
      offenders.join("\n"),
      "a push path now exists - the guarantee in why-a-human.md, safety.md, " +
        "dashboard.md and SECURITY.md is no longer true and must be rewritten",
    ).toBe("");
  });

  it("`gh pr create` is only ever printed, never executed", () => {
    // `gh pr create` pushes the head ref. The preparer builds that string for a
    // human to run; nothing may hand it to a subprocess.
    const offenders: string[] = [];
    for (const file of files) {
      const rel = file.replace(/\\/g, "/");
      if (rel === "src/consult/handbook/handbook-corpus.generated.ts") continue;
      const text = readFileSync(file, "utf8");
      if (!text.includes("gh pr create")) continue;
      // Executing it would mean passing "gh" as a command to a spawner.
      if (/execa\(\s*["'`]gh["'`]/.test(text) || /spawn\(\s*["'`]gh["'`]/.test(text)) {
        offenders.push(rel);
      }
    }
    expect(offenders.join("\n"), "`gh` is being spawned, which pushes").toBe("");
  });

  it("the preparer refuses rather than pushing when it finds a secret", async () => {
    const { preparePr } = await import("../src/git/pr-prepare.js");
    const leaked = ["sk", "-", "B".repeat(32)].join("");
    const out = preparePr({
      runId: "r",
      task: "t",
      branch: "b",
      base: "main",
      diff: `+ key = "${leaked}"\n`,
      assurance: null,
      filesTouched: 1,
    });
    expect(out.secretFindings.length).toBeGreaterThan(0);
  });
});

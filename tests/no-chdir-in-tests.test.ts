import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

// ── No test may change the process-wide working directory ────────────────────
//
// THE HAZARD. `process.cwd()` is per-PROCESS, not per-test. Eleven files here
// used to point a CLI command at a temp project by changing into it and
// restoring afterwards. That is safe only while nothing else in the process is
// looking at the cwd - and these are exactly the files that drive a real
// Orchestrator, which spawns provider subprocesses and leaves work in flight.
// Anything still finishing after its own test returned reads whatever cwd the
// CURRENT test set, so a run can end up resolving a different project than the
// one it was started against. Nothing fails at the call; it surfaces later as
// one test failing on a timing change somewhere else entirely. That is what
// was observed on 2026-08-28: saga-supervisor-e2e's PROCEED case returned 2
// ("the run threw") instead of 0 once, then passed on the next full run, after
// an unrelated change widened the pre-turn worktree snapshot.
//
// WHAT IS *NOT* THE HAZARD, so nobody re-derives it wrong: the cwd does not
// leak BETWEEN test files. Vitest 4's default `forks` pool with `isolate: true`
// gives every test file its own child process - measured here, distinct pids
// per file even under --no-file-parallelism. So "isolate the file to one
// worker" fixes nothing that is broken, and the blast radius is one file.
// Within that file it is still real, and `sequence.shuffle.tests` (see
// vitest.config.ts) reorders tests, so which project a straggler lands in is
// not even stable between runs.
//
// THE FIX. Every command these tests drive takes an explicit `cwd` that
// defaults to `process.cwd()`: runRunCommand, cmdSequence / cmdStatus /
// cmdPause / cmdResume, cmdRun, cmdShow, runWelcomeCommand, runInitCommand.
// Everything under src/core already takes an explicit `projectRoot` and never
// reads the cwd at all. If you need this for a command that has no `cwd`
// option yet, add one there.
//
// This guard bans the CALL, not the word - prose may name it as long as it
// does not write the open paren, which is why this file spells it out the long
// way throughout.

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The call, in any spacing. Deliberately dumb: it matches inside comments and
 *  strings too, so there is no comment-parsing hole to slip through. */
const CHDIR_CALL = /\bprocess\s*\.\s*chdir\s*\(/;

async function tsFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await tsFiles(full)));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("tests never change the process-wide working directory", () => {
  it("no file under tests/ calls it", async () => {
    // No exclusions, this file included - so the rule has no hole to grow one.
    const files = await tsFiles(HERE);
    expect(files.length, "the scan found no test sources - the walk is broken").toBeGreaterThan(50);

    const offenders: string[] = [];
    for (const file of files) {
      const src = await fs.readFile(file, "utf8");
      for (const [i, line] of src.split("\n").entries()) {
        if (CHDIR_CALL.test(line)) offenders.push(`${path.relative(HERE, file)}:${i + 1}`);
      }
    }

    expect(
      offenders,
      "Changing the working directory is process-wide: work still in flight from an earlier test in this file will read it. Pass an explicit `cwd` to the command instead (runRunCommand, cmdSequence, cmdRun, cmdShow, runWelcomeCommand, runInitCommand all take one), or add that option to the command you are calling. See the header of this file.",
    ).toEqual([]);
  });

  // Proves the assertion above is not vacuous: the matcher has to actually
  // fire on the shape it is meant to catch. Built by concatenation so these
  // probes are not themselves offenders in the scan above.
  it("the matcher catches the call it bans", () => {
    const call = `process.${"chdir"}(`;
    expect(CHDIR_CALL.test(`  ${call}dir);`)).toBe(true);
    expect(CHDIR_CALL.test(`  process . ${"chdir"} ( dir ) ;`)).toBe(true);
    expect(CHDIR_CALL.test("  const cwd = process.cwd();")).toBe(false);
  });
});

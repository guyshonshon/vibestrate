// Prompt-branch coverage for the CLI's interactive wizards.
//
// `vibe welcome` is the first command a freshly installed user runs, and every
// one of its decision points is a prompt: the init offer, and continue / skip /
// quit on each step. None of those branches were reachable from a headless test
// before, so this file mocks @inquirer/prompts, forces the TTY flags, and walks
// the real control flow. The wizards it stands in front of (provider setup,
// crew install, init) stay mocked - what is under test is welcome's own
// sequencing, consent, and persistence, not theirs.
//
// It also pins the one `--yes` consent rule the codebase states in writing:
// `vibe init --yes` must never imply consent to create a git repository.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runWelcomeCommand } from "../src/cli/commands/welcome.js";
import { welcomeStatePath } from "../src/utils/paths.js";
import { pathExists } from "../src/utils/fs.js";
import {
  firstIncompleteStep,
  loadWelcomeState,
} from "../src/cli/welcome/welcome-state.js";
import {
  ctrlC,
  forceInteractiveTTY,
  scriptAnswers,
  tempProjectDir,
  writeProjectConfig,
} from "./helpers/prompt-mock.js";

vi.mock("@inquirer/prompts", () => ({
  select: vi.fn(),
  confirm: vi.fn(),
  input: vi.fn(),
  checkbox: vi.fn(),
  password: vi.fn(),
}));

vi.mock("../src/cli/commands/provider/setup.js", () => ({
  runProviderSetup: vi.fn(),
}));

vi.mock("../src/setup/config-update-service.js", () => ({
  listCrewPresets: vi.fn(),
  installCrewPreset: vi.fn(),
}));

vi.mock("../src/cli/commands/init.js", () => ({
  runInitCommand: vi.fn(),
}));

vi.mock("../src/git/git-init.js", () => ({
  initGitRepository: vi.fn(),
}));

const { select, confirm } = await import("@inquirer/prompts");
const { runProviderSetup } = await import("../src/cli/commands/provider/setup.js");
const { listCrewPresets, installCrewPreset } = await import(
  "../src/setup/config-update-service.js"
);
const { runInitCommand } = await import("../src/cli/commands/init.js");
const { initGitRepository } = await import("../src/git/git-init.js");

// The `--yes` consent rule lives in the real init command, which the mock above
// replaces for welcome's sake. Import past that mock to get the genuine
// implementation; its own dependencies (@inquirer/prompts, git-init) still
// resolve to the mocks, which is exactly what lets the test assert that
// nothing was prompted and no repository was created.
const { runInitCommand: realRunInitCommand } = await vi.importActual<
  typeof import("../src/cli/commands/init.js")
>("../src/cli/commands/init.js");

type Captured = { out: string[]; err: string[] };

function joined(lines: string[]): string {
  return lines.join("\n");
}

describe("vibe welcome (prompt branches)", () => {
  let projectRoot: string;
  let prevCwd: string;
  let restoreTTY: () => void;
  let logs: Captured;

  beforeEach(async () => {
    projectRoot = await tempProjectDir("vibestrate-welcome-prompts-");
    prevCwd = process.cwd();
    process.chdir(projectRoot);
    restoreTTY = forceInteractiveTTY();

    logs = { out: [], err: [] };
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.out.push(args.map((a) => String(a)).join(" "));
    });
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logs.err.push(args.map((a) => String(a)).join(" "));
    });

    vi.mocked(runProviderSetup).mockResolvedValue(0);
    vi.mocked(listCrewPresets).mockResolvedValue([]);
    vi.mocked(runInitCommand).mockResolvedValue(0);
  });

  afterEach(() => {
    process.chdir(prevCwd);
    restoreTTY();
    vi.mocked(console.log).mockRestore();
    vi.mocked(console.error).mockRestore();
    vi.clearAllMocks();
  });

  describe("skip", () => {
    it("skipping every step records 'skipped' and runs none of the step work", async () => {
      await writeProjectConfig(projectRoot);
      const script = scriptAnswers(select, ["skip", "skip", "skip", "skip"]);

      const code = await runWelcomeCommand({});
      expect(code).toBe(0);

      // One prompt per step, and no step's own work was reached.
      expect(script.asked).toHaveLength(4);
      expect(runProviderSetup).not.toHaveBeenCalled();
      expect(listCrewPresets).not.toHaveBeenCalled();
      expect(installCrewPreset).not.toHaveBeenCalled();

      const state = await loadWelcomeState(projectRoot);
      expect(state.steps).toEqual({
        providers: "skipped",
        crew: "skipped",
        flows: "skipped",
        "first-run": "skipped",
      });
      expect(firstIncompleteStep(state)).toBeNull();
      expect(joined(logs.out)).toContain("Walkthrough complete.");
    });

    it("a skipped step is settled, so the next run does not offer it again", async () => {
      await writeProjectConfig(projectRoot);
      scriptAnswers(select, ["skip", "skip", "skip", "skip"]);
      await runWelcomeCommand({});

      logs.out.length = 0;
      const second = scriptAnswers(select, []);
      const code = await runWelcomeCommand({});

      expect(code).toBe(0);
      expect(second.asked).toEqual([]);
      expect(joined(logs.out)).toContain("already been through the welcome walkthrough");
    });
  });

  describe("quit", () => {
    it("quitting on the first step exits 0 and persists nothing", async () => {
      await writeProjectConfig(projectRoot);
      const script = scriptAnswers(select, ["quit"]);

      const code = await runWelcomeCommand({});
      expect(code).toBe(0);

      expect(script.asked).toHaveLength(1);
      expect(runProviderSetup).not.toHaveBeenCalled();
      // Nothing was decided, so nothing is written - a quit must not look like
      // progress on the next run.
      expect(await pathExists(welcomeStatePath(projectRoot))).toBe(false);

      const out = joined(logs.out);
      expect(out).toContain("Paused.");
      expect(out).toContain("Providers");
      expect(out).not.toContain("Walkthrough complete.");
    });

    it("quitting mid-walkthrough keeps earlier progress and resumes at the interrupted step", async () => {
      await writeProjectConfig(projectRoot);
      scriptAnswers(select, ["continue", "quit"]);

      expect(await runWelcomeCommand({})).toBe(0);
      expect(runProviderSetup).toHaveBeenCalledTimes(1);

      const state = await loadWelcomeState(projectRoot);
      expect(state.steps.providers).toBe("done");
      expect(state.steps.crew).toBeUndefined();
      expect(firstIncompleteStep(state)).toBe("crew");

      // Resume: the walkthrough must come back to Crew, not restart at
      // Providers and not skip past it.
      logs.out.length = 0;
      const resumed = scriptAnswers(select, ["skip", "skip", "skip"]);
      expect(await runWelcomeCommand({})).toBe(0);
      expect(resumed.asked).toHaveLength(3);
      expect(resumed.asked[0]).toContain("Crew");
      expect(runProviderSetup).toHaveBeenCalledTimes(1);
    });
  });

  describe("the init offer", () => {
    it("declining leaves the project untouched and never starts the tour", async () => {
      const script = scriptAnswers(confirm, [false]);
      const selectScript = scriptAnswers(select, []);

      const code = await runWelcomeCommand({});
      expect(code).toBe(0);

      expect(script.asked).toHaveLength(1);
      expect(script.asked[0]).toContain("vibe init");
      expect(runInitCommand).not.toHaveBeenCalled();
      expect(selectScript.asked).toEqual([]);
      expect(await pathExists(welcomeStatePath(projectRoot))).toBe(false);
      expect(joined(logs.out)).toContain("vibe init");
    });

    it("accepting runs init once and then walks the tour", async () => {
      scriptAnswers(confirm, [true]);
      const selectScript = scriptAnswers(select, ["skip", "skip", "skip", "skip"]);
      vi.mocked(runInitCommand).mockResolvedValue(0);

      const code = await runWelcomeCommand({});
      expect(code).toBe(0);

      expect(runInitCommand).toHaveBeenCalledTimes(1);
      expect(selectScript.asked).toHaveLength(4);
    });

    it("a failed init returns init's own exit code and does not walk the tour", async () => {
      scriptAnswers(confirm, [true]);
      const selectScript = scriptAnswers(select, []);
      vi.mocked(runInitCommand).mockResolvedValue(2);

      const code = await runWelcomeCommand({});
      expect(code).toBe(2);

      expect(selectScript.asked).toEqual([]);
      expect(await pathExists(welcomeStatePath(projectRoot))).toBe(false);
    });
  });

  describe("Ctrl-C", () => {
    // Ctrl-C at a prompt rejects with ExitPromptError. The command must absorb
    // it and return an exit code; letting it escape would surface as an
    // unhandled rejection from the top-level `.action()` handler, which prints
    // a stack trace at a user who simply pressed Ctrl-C.
    it("at the init offer resolves to an exit code instead of rejecting", async () => {
      scriptAnswers(confirm, [ctrlC()]);

      const code = await runWelcomeCommand({});
      expect(typeof code).toBe("number");

      expect(runInitCommand).not.toHaveBeenCalled();
      expect(await pathExists(welcomeStatePath(projectRoot))).toBe(false);
      // One line out, not a stack trace.
      expect(joined(logs.err)).not.toContain("    at ");
    });

    it("mid-walkthrough keeps completed steps and leaves the interrupted one unrecorded", async () => {
      await writeProjectConfig(projectRoot);
      scriptAnswers(select, ["continue", ctrlC()]);

      const code = await runWelcomeCommand({});
      expect(typeof code).toBe("number");

      const state = await loadWelcomeState(projectRoot);
      expect(state.steps.providers).toBe("done");
      expect(state.steps.crew).toBeUndefined();
      expect(firstIncompleteStep(state)).toBe("crew");
      expect(joined(logs.err)).not.toContain("    at ");
    });
  });

  describe("fail-closed resume", () => {
    // A step whose own wizard failed must stay unrecorded, so the next run
    // returns to exactly that step. Persisting a false "done" would be
    // undoable only with --reset, which wipes every step's progress.
    it("a failed step is not recorded and is where the next run resumes", async () => {
      await writeProjectConfig(projectRoot);
      vi.mocked(runProviderSetup).mockResolvedValue(1);
      scriptAnswers(select, ["continue", "skip", "skip", "skip"]);

      expect(await runWelcomeCommand({})).toBe(0);

      const state = await loadWelcomeState(projectRoot);
      expect(state.steps.providers).toBeUndefined();
      expect(state.steps.crew).toBe("skipped");
      expect(firstIncompleteStep(state)).toBe("providers");
      expect(joined(logs.out)).toContain("still needs a pass");

      // The next run comes back to Providers - and only Providers, since the
      // later steps are already settled.
      logs.out.length = 0;
      vi.mocked(runProviderSetup).mockResolvedValue(0);
      const resumed = scriptAnswers(select, ["continue"]);
      expect(await runWelcomeCommand({})).toBe(0);
      expect(resumed.asked).toHaveLength(1);
      expect(resumed.asked[0]).toContain("Providers");

      const finalState = await loadWelcomeState(projectRoot);
      expect(finalState.steps.providers).toBe("done");
      expect(firstIncompleteStep(finalState)).toBeNull();
      expect(joined(logs.out)).toContain("Walkthrough complete.");
    });
  });
});

// `vibe welcome` itself exposes no --yes flag, so the "--yes never implies
// consent" rule is pinned where the flag and the irreversible step actually
// meet: `vibe init` creating a git repository. Repo history is not a side
// effect of a convenience flag - only an interactive confirm or the explicit
// --git-init may authorize it.
describe("vibe init --yes (consent)", () => {
  let projectRoot: string;
  let prevCwd: string;
  let restoreTTY: () => void;

  beforeEach(async () => {
    projectRoot = await tempProjectDir("vibestrate-init-consent-");
    prevCwd = process.cwd();
    process.chdir(projectRoot);
    // A real TTY is the permissive case: if --yes leaked into consent, this is
    // where it would show.
    restoreTTY = forceInteractiveTTY();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    // Stops the mutated path dead if consent is ever wrongly granted, so the
    // test can never create a real repository or run a real setup.
    vi.mocked(initGitRepository).mockResolvedValue({
      ok: false,
      error: "guarded by test",
    } as unknown as Awaited<ReturnType<typeof initGitRepository>>);
  });

  afterEach(() => {
    process.chdir(prevCwd);
    restoreTTY();
    vi.mocked(console.log).mockRestore();
    vi.mocked(console.error).mockRestore();
    vi.clearAllMocks();
  });

  it("--yes does not imply consent to create a git repository", async () => {
    const script = scriptAnswers(confirm, []);

    const code = await realRunInitCommand({ yes: true });
    expect(code).toBe(1);

    // Neither asked nor assumed: --yes suppresses the prompt, and suppressing
    // the prompt must mean "no", not "yes".
    expect(script.asked).toEqual([]);
    expect(initGitRepository).not.toHaveBeenCalled();
  });

  it("--git-init is the explicit consent that does reach the repo creation", async () => {
    scriptAnswers(confirm, []);

    const code = await realRunInitCommand({ gitInit: true });

    // Proves the assertion above is not vacuous: the same wiring does call
    // through when consent is explicit.
    expect(initGitRepository).toHaveBeenCalledTimes(1);
    expect(code).toBe(1); // the mocked repo creation reports failure
  });

  it("declining the interactive repo confirm refuses instead of proceeding", async () => {
    const script = scriptAnswers(confirm, [false]);

    const code = await realRunInitCommand({});
    expect(code).toBe(1);

    expect(script.asked).toHaveLength(1);
    expect(script.asked[0]).toContain("not a git repository");
    expect(initGitRepository).not.toHaveBeenCalled();
  });
});

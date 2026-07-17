import { confirm, select } from "@inquirer/prompts";
import { detectProject } from "../../project/project-detector.js";
import { configExists } from "../../project/config-loader.js";
import { listCrewPresets, installCrewPreset } from "../../setup/config-update-service.js";
import { color, header, indent, isInteractiveTTY, symbol } from "../ui/format.js";
import { isVibestrateError } from "../../utils/errors.js";
import { runInitCommand } from "./init.js";
import { runProviderSetup } from "./provider/setup.js";
import {
  WELCOME_STEP_ORDER,
  type WelcomeStepId,
  firstIncompleteStep,
  loadWelcomeState,
  recordWelcomeStep,
  resetWelcomeState,
} from "../welcome/welcome-state.js";

export type WelcomeCommandOptions = {
  reset?: boolean;
};

type StepAction = "continue" | "skip" | "quit";

// One-paragraph concept openers, paraphrased tightly from each page's own
// opening line so the walkthrough reads like the written docs. Deepen in the
// docs, not here - this stays a pointer, not a copy.
const STEP_CONTENT: Record<WelcomeStepId, { title: string; concept: string }> = {
  providers: {
    title: "Providers",
    // source: docs/content/concepts/provider.md
    concept:
      "A provider is the AI model behind the work - Claude Code, Codex, Ollama, or a custom CLI. Vibestrate writes the prompt; the provider runs the model and hands back the change.",
  },
  crew: {
    title: "Crew",
    // source: docs/content/concepts/crew.md
    concept:
      "A crew is your set of AI workers. Each flow lists the kinds of worker it needs - a builder, a reviewer - and your crew decides who actually fills those spots, so the model that builds a change isn't the one that reviews it.",
  },
  flows: {
    title: "Flows",
    // source: docs/content/concepts/flow.md
    concept:
      "A flow is the list of steps Vibestrate works through to finish a task - plan, build, check, fix. Vibestrate ships a default flow, and the flows hub has more you can browse and install.",
  },
  "first-run": {
    title: "Your first run",
    // source: docs/content/getting-started/first-run.md
    concept:
      "A run takes one small, well-scoped task, works through it in its own git worktree, and stops at merge_ready, blocked, or failed - the call is always yours.",
  },
};

export async function runWelcomeCommand(opts: WelcomeCommandOptions): Promise<number> {
  if (!isInteractiveTTY()) {
    console.log(
      `${symbol.warn()} ${color.bold("vibe welcome")} is an interactive walkthrough and needs a terminal.`,
    );
    console.log(
      indent(
        `Jump straight in instead: ${color.bold("vibe init")}, ${color.bold("vibe provider setup")}, ${color.bold('vibe run "your task"')}.`,
      ),
    );
    return 0;
  }

  try {
    const detected = await detectProject(process.cwd());

    // Handle --reset against whatever project root we can already see, before
    // the init offer below - otherwise declining init returns early and
    // --reset silently does nothing (welcome-state.json lives under
    // .vibestrate/, independent of whether project.yml exists yet).
    if (opts.reset) {
      await resetWelcomeState(detected.projectRoot);
      console.log(`${symbol.ok()} Welcome progress reset.`);
      console.log("");
    }

    if (!(await configExists(detected.projectRoot))) {
      console.log(header("Welcome to Vibestrate"));
      console.log("");
      console.log("This project isn't initialized yet - welcome walks through setup right after.");
      const goInit = await confirm({ message: "Run `vibe init` now?", default: true });
      if (!goInit) {
        console.log(
          `${symbol.arrow()} Run ${color.bold("vibe init")}, then ${color.bold("vibe welcome")} to pick up the tour.`,
        );
        return 0;
      }
      const initCode = await runInitCommand({});
      if (initCode !== 0) return initCode;
      console.log("");
    }

    // Re-detect: init may have created the git repo / project root just now.
    const projectRoot = (await detectProject(process.cwd())).projectRoot;

    let state = await loadWelcomeState(projectRoot);
    const resumeAt = firstIncompleteStep(state);
    if (resumeAt === null) {
      console.log(`${symbol.ok()} You've already been through the welcome walkthrough.`);
      console.log(indent(`Run with ${color.bold("--reset")} to go through it again.`));
      console.log("");
      printClosingPanel();
      return 0;
    }

    console.log(header("Welcome to Vibestrate"));
    console.log("");
    if (Object.keys(state.steps).length > 0) {
      console.log(
        `${symbol.arrow()} Resuming at ${color.bold(STEP_CONTENT[resumeAt].title)} - previous progress kept.`,
      );
      console.log("");
    }

    const startIndex = WELCOME_STEP_ORDER.indexOf(resumeAt);
    for (const stepId of WELCOME_STEP_ORDER.slice(startIndex)) {
      // A failed step is left unrecorded so `vibe welcome` resumes at exactly
      // that step, but the walkthrough still walks past it into later steps
      // in the same run. If one of those later steps already has a recorded
      // result from an earlier pass, re-running it would re-prompt for (or
      // re-install) work the state already says is settled - skip it instead.
      if (state.steps[stepId]) continue;

      const { title, concept } = STEP_CONTENT[stepId];
      console.log(color.bold(title));
      console.log(indent(concept));
      console.log("");

      const action = await select<StepAction>({
        message: `${title}: continue, skip, or quit?`,
        choices: [
          { name: "Continue", value: "continue" },
          { name: "Skip this step", value: "skip" },
          { name: "Quit - resume later", value: "quit" },
        ],
        default: "continue",
      });

      if (action === "quit") {
        console.log("");
        console.log(
          `${symbol.arrow()} Paused. Run ${color.bold("vibe welcome")} again to resume at ${color.bold(title)}.`,
        );
        return 0;
      }

      console.log("");
      if (action === "skip") {
        state = await recordWelcomeStep(projectRoot, state, stepId, "skipped");
        continue;
      }

      const stepCode = await runStep(stepId, projectRoot);
      if (stepCode === 0) {
        state = await recordWelcomeStep(projectRoot, state, stepId, "done");
      } else {
        // Do not record this as done and do not abort the walkthrough - the
        // step's own wizard already reported its failure. Leaving it
        // unrecorded keeps `vibe welcome` resumable at exactly this step,
        // instead of persisting a false "done" that only --reset (wiping all
        // progress) could undo.
        console.log(
          indent(
            color.dim(`${title} didn't finish - run \`vibe welcome\` again to pick it back up.`),
          ),
        );
      }
      console.log("");
    }

    const pending = firstIncompleteStep(state);
    if (pending === null) {
      console.log(`${symbol.ok()} Walkthrough complete.`);
    } else {
      // The loop above walks past a failed step instead of stopping there, so
      // it can reach the end with a step still unrecorded. Say so - printing
      // an unconditional "complete" here would contradict the "didn't finish"
      // notice already shown for that step earlier in this same run.
      console.log(
        `${symbol.warn()} Walkthrough finished, but ${color.bold(STEP_CONTENT[pending].title)} still needs a pass - run ${color.bold("vibe welcome")} again.`,
      );
    }
    console.log("");
    printClosingPanel();
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isVibestrateError(err) ? err.message : err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}

/** Runs one walkthrough step and returns its exit code (0 = succeeded). The
 *  caller records "done" only on a zero code, so a step's own failure never
 *  gets persisted as success. */
async function runStep(stepId: WelcomeStepId, projectRoot: string): Promise<number> {
  switch (stepId) {
    case "providers":
      // Reuses the same interactive provider setup as `vibe provider setup` -
      // welcome frames it, it doesn't reimplement it. Its exit code decides
      // whether this step gets recorded as done (see the call site).
      return runProviderSetup();
    case "crew":
      await runCrewStep(projectRoot);
      return 0;
    case "flows":
      printFlowsIntro();
      return 0;
    case "first-run":
      printFirstRunIntro();
      return 0;
  }
}

async function runCrewStep(projectRoot: string): Promise<void> {
  const presets = await listCrewPresets(projectRoot);
  const installable = presets.filter((p) => p.available && !p.installed);
  if (installable.length === 0) {
    console.log(
      indent(
        color.dim(
          "No new crew presets to install here - see `vibe crew list` / `vibe crew presets`.",
        ),
      ),
    );
    return;
  }

  const SKIP = "__welcome_skip__" as const;
  const choice = await select<string>({
    message: "Install a ready-made crew?",
    choices: [
      ...installable.map((p) => ({
        name: `${p.label} - ${p.description}`,
        value: p.id,
      })),
      { name: "Not now", value: SKIP },
    ],
    default: SKIP,
  });
  if (choice === SKIP) return;

  const preset = installable.find((p) => p.id === choice);
  if (!preset) return;
  const result = await installCrewPreset(projectRoot, preset.id);
  console.log(
    `${symbol.ok()} Installed crew ${color.bold(result.crewId)} on profile ${color.bold(result.profileId)}.`,
  );
  console.log(
    indent(color.dim(`Switch to it anytime with \`vibe crew use ${result.crewId}\`.`)),
  );
}

function printFlowsIntro(): void {
  console.log(
    indent(
      `See what's available with ${color.bold("vibe flows list")}, or browse the shared flows hub with ${color.bold("vibe flows hub list")} and install one with ${color.bold("vibe flows hub install <ref>")}.`,
    ),
  );
}

function printFirstRunIntro(): void {
  console.log(
    indent(
      `Try: ${color.bold('vibe run "Add structured logging to the settings save handler"')}`,
    ),
  );
}

function printClosingPanel(): void {
  console.log(header("Three ways in:"));
  console.log(indent(`${symbol.arrow()} CLI - ${color.bold('vibe run "your task"')}`));
  console.log(indent(`${symbol.arrow()} TUI shell - ${color.bold("vibe")}`));
  console.log(indent(`${symbol.arrow()} Dashboard - ${color.bold("vibe ui")}`));
}

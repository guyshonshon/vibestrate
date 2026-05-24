import path from "node:path";
import { detectProject } from "../../project/project-detector.js";
import { applySetup } from "../../setup/setup-service.js";
import {
  describeProjectType,
} from "../../project/project-detector.js";
import { color, header, indent, isInteractiveTTY, symbol } from "../ui/format.js";
import { runInteractiveSetupWizard } from "../wizards/setup-wizard.js";
import { isAmacoError } from "../../utils/errors.js";

export type InitCommandOptions = {
  force?: boolean;
  yes?: boolean;
  interactive?: boolean;
};

export async function runInitCommand(opts: InitCommandOptions): Promise<number> {
  const cwd = process.cwd();
  const detected = await detectProject(cwd);

  if (!detected.isGitRepo) {
    console.error(
      `${symbol.fail()} ${cwd} is not inside a git repository.`,
    );
    console.error(
      `  ${symbol.arrow()} Run ${color.bold("git init")} in your project, then re-run ${color.bold("amaco init")}.`,
    );
    return 1;
  }

  const useInteractive =
    opts.interactive === true || (!opts.yes && isInteractiveTTY());

  let result;
  try {
    if (useInteractive) {
      result = await runInteractiveSetupWizard({
        projectRoot: detected.projectRoot,
        force: !!opts.force,
      });
    } else {
      result = await applySetup({
        options: { projectRoot: detected.projectRoot, force: !!opts.force },
      });
    }
  } catch (err) {
    console.error(
      `${symbol.fail()} ${
        isAmacoError(err) ? err.message : String(err)
      }`,
    );
    return 1;
  }

  const { plan, init } = result;

  // If nothing was created and config existed, hint --force.
  const onlySkipped = init.created.length === 0 && init.skipped.length > 0;
  if (onlySkipped) {
    console.log(
      `${color.bold("Amaco")} is already initialized in ${color.dim(detected.projectRoot)}.`,
    );
    console.log(
      `  ${symbol.arrow()} Re-run with ${color.bold("--force")} to overwrite templates (your runs are preserved).`,
    );
    console.log("");
    console.log(
      `Try: ${color.bold("amaco doctor")} or ${color.bold('amaco run "your task"')}`,
    );
    return 0;
  }

  // Friendly summary.
  console.log(`${symbol.ok()} ${color.bold("Amaco initialized")}.`);
  console.log("");

  console.log(color.bold("Project:"));
  console.log(indent(`Name: ${plan.project.name}`));
  console.log(
    indent(`Type: ${describeProjectType(plan.project.projectType)}`),
  );
  console.log(indent(`Package manager: ${plan.project.packageManager}`));
  console.log("");

  console.log(color.bold("Provider:"));
  if (plan.recommendedProvider) {
    console.log(
      indent(
        `${symbol.ok()} ${plan.recommendedProvider.label} detected: ${color.bold(
          plan.recommendedProvider.command,
        )}${plan.recommendedProvider.version ? ` (v${plan.recommendedProvider.version})` : ""}`,
      ),
    );
    console.log(
      indent(
        `Default agents will use: ${color.bold(`${plan.recommendedProvider.command} -p`)}`,
      ),
    );
  } else {
    console.log(
      indent(
        `${symbol.warn()} No local coding CLI was detected yet.`,
      ),
    );
    const needsSetup = plan.detections.filter(
      (d) => d.confidence === "detected-needs-setup",
    );
    if (needsSetup.length > 0) {
      console.log(
        indent(
          `Detected, but needs custom setup: ${needsSetup.map((d) => d.label).join(", ")}.`,
        ),
      );
    }
    const ollama = plan.detections.find((d) => d.id === "ollama");
    const ollamaInstall = ollama?.notes.find((n) =>
      n.toLowerCase().includes("install ollama"),
    );
    if (ollamaInstall) {
      console.log(indent(color.dim(ollamaInstall)));
    }
    console.log(
      indent(
        `Install a local CLI, or run ${color.bold("amaco provider setup")} to configure a custom command.`,
      ),
    );
  }
  console.log("");

  console.log(color.bold("Validation:"));
  if (plan.validationCommands.length > 0) {
    for (const cmd of plan.validationCommands) {
      console.log(indent(`${symbol.bullet()} ${cmd}`));
    }
    console.log(
      indent(
        color.dim(
          "Detected from your package.json scripts. Adjust later with `amaco config set commands.validate \"[...]\"`.",
        ),
      ),
    );
  } else {
    console.log(
      indent(
        `${symbol.warn()} No validation commands configured yet.`,
      ),
    );
    console.log(
      indent(
        color.dim(
          'Add later with `amaco config set commands.validate "[\\"pnpm typecheck\\",\\"pnpm test\\"]"` or run `amaco doctor --fix`.',
        ),
      ),
    );
  }
  console.log("");

  console.log(color.bold("Files:"));
  for (const f of init.created) {
    console.log(indent(`${symbol.ok()} ${path.relative(detected.projectRoot, f)}`));
  }
  if (init.skipped.length > 0) {
    console.log(
      indent(
        color.dim(
          `Kept ${init.skipped.length} existing file(s). Re-run with --force to overwrite.`,
        ),
      ),
    );
  }
  console.log("");

  console.log(header("Next:"));
  if (plan.recommendedProvider) {
    console.log(indent(`${symbol.arrow()} ${color.bold("amaco doctor")}`));
    console.log(
      indent(`${symbol.arrow()} ${color.bold('amaco run "your task"')}`),
    );
  } else {
    console.log(
      indent(`${symbol.arrow()} ${color.bold("amaco provider setup")}`),
    );
    console.log(indent(`${symbol.arrow()} ${color.bold("amaco doctor")}`));
    console.log(
      indent(`${symbol.arrow()} ${color.bold('amaco run "your task"')}`),
    );
  }
  return 0;
}

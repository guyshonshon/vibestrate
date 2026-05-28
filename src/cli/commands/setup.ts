import { detectProject } from "../../project/project-detector.js";
import { runStandaloneSetupWizard } from "../wizards/setup-wizard.js";
import { color, symbol } from "../ui/format.js";
import { isVibestrateError } from "../../utils/errors.js";

export async function runSetupCommand(): Promise<number> {
  const detected = await detectProject(process.cwd());
  if (!detected.isGitRepo) {
    console.error(
      `${symbol.fail()} ${color.bold("vibestrate setup")} must be run inside a git repository.`,
    );
    console.error(
      `  ${symbol.arrow()} Run ${color.bold("git init")} first, then ${color.bold("vibestrate init")}.`,
    );
    return 1;
  }

  try {
    await runStandaloneSetupWizard({ projectRoot: detected.projectRoot });
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${
        isVibestrateError(err) ? err.message : err instanceof Error ? err.message : String(err)
      }`,
    );
    return 1;
  }
}

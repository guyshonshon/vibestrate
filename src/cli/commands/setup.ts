import { detectProject } from "../../project/project-detector.js";
import { runStandaloneSetupWizard } from "../wizards/setup-wizard.js";
import { color, symbol } from "../ui/format.js";
import { isAmacoError } from "../../utils/errors.js";

export async function runSetupCommand(): Promise<number> {
  const detected = await detectProject(process.cwd());
  if (!detected.isGitRepo) {
    console.error(
      `${symbol.fail()} ${color.bold("amaco setup")} must be run inside a git repository.`,
    );
    console.error(
      `  ${symbol.arrow()} Run ${color.bold("git init")} first, then ${color.bold("amaco init")}.`,
    );
    return 1;
  }

  try {
    await runStandaloneSetupWizard({ projectRoot: detected.projectRoot });
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${
        isAmacoError(err) ? err.message : err instanceof Error ? err.message : String(err)
      }`,
    );
    return 1;
  }
}

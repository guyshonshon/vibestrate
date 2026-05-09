import path from "node:path";
import { runInit } from "../../project/init-template.js";

export type InitCommandOptions = {
  force?: boolean;
};

export async function runInitCommand(opts: InitCommandOptions): Promise<number> {
  const projectRoot = process.cwd();
  const result = await runInit({ projectRoot, force: !!opts.force });

  if (result.created.length === 0 && result.skipped.length > 0) {
    console.log(
      `Amaco config already exists. Pass --force to overwrite. (${result.skipped.length} files left untouched.)`,
    );
    return 0;
  }

  console.log(`Amaco initialized in ${projectRoot}`);
  console.log("");
  console.log("Created:");
  for (const f of result.created) console.log(`  ${path.relative(projectRoot, f)}`);
  if (result.skipped.length > 0) {
    console.log("");
    console.log("Skipped (already existed; use --force to overwrite):");
    for (const f of result.skipped) console.log(`  ${path.relative(projectRoot, f)}`);
  }
  console.log("");
  console.log("Next: edit .amaco/project.yml and .amaco/rules.md, then run:");
  console.log('  amaco run "Your task description"');
  return 0;
}

import path from "node:path";
import { detectProject } from "../../project/project-detector.js";
import { loadConfig } from "../../project/config-loader.js";
import { Orchestrator } from "../../core/orchestrator.js";
import { isAmacoError } from "../../utils/errors.js";

export async function runRunCommand(task: string): Promise<number> {
  if (!task || !task.trim()) {
    console.error("amaco run: a task description is required.");
    console.error('  amaco run "Your task description"');
    return 1;
  }

  const cwd = process.cwd();
  const detected = await detectProject(cwd);

  if (!detected.isGitRepo) {
    console.error(
      `amaco run: ${cwd} is not inside a git repository. Initialize one with "git init" first.`,
    );
    return 1;
  }

  let loaded;
  try {
    loaded = await loadConfig(detected.projectRoot);
  } catch (err) {
    console.error(
      isAmacoError(err) ? err.message : `Failed to load config: ${String(err)}`,
    );
    return 1;
  }

  const orchestrator = new Orchestrator({
    projectRoot: detected.projectRoot,
    config: loaded.config,
    rules: loaded.rules,
    task,
    isGitRepo: detected.isGitRepo,
    onProgress: (msg) => console.log(msg),
  });

  let result;
  try {
    result = await orchestrator.run();
  } catch (err) {
    console.error("");
    console.error(`Run failed: ${isAmacoError(err) ? err.message : String(err)}`);
    return 2;
  }

  console.log("");
  console.log(`Final status: ${result.state.status}`);
  if (result.state.finalDecision) {
    console.log(`Review decision: ${result.state.finalDecision}`);
  }
  if (result.state.verification) {
    console.log(`Verification: ${result.state.verification}`);
  }
  console.log(
    `Artifacts: ${path.relative(process.cwd(), path.dirname(result.finalReportPath))}`,
  );
  if (result.worktreePath) {
    console.log(`Worktree: ${result.worktreePath}`);
  }
  if (result.branchName) {
    console.log(`Branch: ${result.branchName}`);
  }
  if (result.policyWarnings.length > 0) {
    console.log("");
    console.log("Policy warnings:");
    for (const w of result.policyWarnings) console.log(`  - ${w.code}: ${w.message}`);
  }

  switch (result.state.status) {
    case "merge_ready":
      return 0;
    case "blocked":
    case "failed":
    case "aborted":
      return 3;
    default:
      return 0;
  }
}

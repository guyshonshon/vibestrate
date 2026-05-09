import path from "node:path";
import { detectProject } from "../../project/project-detector.js";
import { configExists, loadConfig } from "../../project/config-loader.js";
import { Orchestrator } from "../../core/orchestrator.js";
import { color, header, indent, symbol } from "../ui/format.js";
import { isAmacoError } from "../../utils/errors.js";
import { startServer, DEFAULT_AMACO_PORT } from "../../server/server.js";

function rewriteFriendly(message: string): string {
  // Worktree already exists.
  if (message.includes("Worktree path already exists")) {
    return [
      "Amaco could not create the isolated worktree for this run.",
      "The branch or folder may already exist from a previous run.",
      `${symbol.arrow()} Inspect: ${color.bold("amaco status")}`,
      `${symbol.arrow()} Remove an old worktree manually: ${color.bold("git worktree remove <path>")}`,
    ].join("\n");
  }
  if (message.includes("Branch already exists")) {
    return [
      "Amaco wanted to create a new branch but one with that name already exists.",
      `${symbol.arrow()} Delete the old branch with: ${color.bold("git branch -D <branch>")}`,
      `${symbol.arrow()} Or run again — Amaco generates a fresh run-id each time.`,
    ].join("\n");
  }
  if (message.includes("not configured")) {
    return [
      message,
      `${symbol.arrow()} Run ${color.bold("amaco provider setup")} to add a provider.`,
    ].join("\n");
  }
  if (message.includes("Failed to invoke provider command")) {
    return [
      message,
      `${symbol.arrow()} Verify the CLI is installed and on PATH: ${color.bold("amaco provider detect")}`,
      `${symbol.arrow()} Confirm prompt-flag setup: ${color.bold("amaco provider setup")}`,
    ].join("\n");
  }
  return message;
}

export type RunCommandOptions = {
  ui?: boolean;
  uiPort?: number;
};

export async function runRunCommand(
  task: string,
  options: RunCommandOptions = {},
): Promise<number> {
  if (!task || !task.trim()) {
    console.error(
      `${symbol.fail()} A task description is required.`,
    );
    console.error(
      `  ${symbol.arrow()} Try: ${color.bold('amaco run "Add dark mode to settings"')}`,
    );
    return 1;
  }

  const cwd = process.cwd();
  const detected = await detectProject(cwd);

  if (!detected.isGitRepo) {
    console.error(
      `${symbol.fail()} ${cwd} is not inside a git repository.`,
    );
    console.error(
      `  ${symbol.arrow()} Run ${color.bold("git init")} first, then ${color.bold("amaco init")}.`,
    );
    return 1;
  }

  if (!(await configExists(detected.projectRoot))) {
    console.error(
      `${symbol.fail()} Amaco is not initialized in this project.`,
    );
    console.error(
      `  ${symbol.arrow()} Run ${color.bold("amaco init")} to create ${color.bold(".amaco/project.yml")}.`,
    );
    return 1;
  }

  let loaded;
  try {
    loaded = await loadConfig(detected.projectRoot);
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isAmacoError(err) ? err.message : String(err)}`,
    );
    console.error(
      `  ${symbol.arrow()} Run ${color.bold("amaco config validate")} to see the exact issues.`,
    );
    return 1;
  }

  const missingProviderRefs: string[] = [];
  for (const [agentId, agent] of Object.entries(loaded.config.agents)) {
    if (!loaded.config.providers[agent.provider]) {
      missingProviderRefs.push(`${agentId} → ${agent.provider}`);
    }
  }
  if (missingProviderRefs.length > 0) {
    console.error(
      `${symbol.fail()} Some agents reference a provider that is not configured:`,
    );
    for (const m of missingProviderRefs) console.error(`  - ${m}`);
    console.error(
      `  ${symbol.arrow()} Run ${color.bold("amaco provider setup")} to add the missing provider, or ${color.bold("amaco provider set <id>")} to switch.`,
    );
    return 1;
  }

  // Optionally bring up the supervisor server alongside the run.
  let server: Awaited<ReturnType<typeof startServer>> | null = null;
  if (options.ui) {
    try {
      server = await startServer({
        projectRoot: detected.projectRoot,
        port: options.uiPort ?? DEFAULT_AMACO_PORT,
        host: "127.0.0.1",
      });
      console.log(
        `${symbol.ok()} Supervisor: ${color.bold(server.url)}${
          server.uiAvailable ? "" : color.dim(" (API only — UI bundle missing)")
        }`,
      );
    } catch (err) {
      console.error(
        `${symbol.warn()} Could not start supervisor: ${
          isAmacoError(err) ? err.message : String(err)
        }`,
      );
      console.error(
        `  ${symbol.arrow()} Continuing without UI. The run will still execute normally.`,
      );
      server = null;
    }
  }

  const orchestrator = new Orchestrator({
    projectRoot: detected.projectRoot,
    config: loaded.config,
    rules: loaded.rules,
    task,
    isGitRepo: detected.isGitRepo,
    onProgress: (msg) => {
      console.log(`${symbol.bullet()} ${msg}`);
      if (msg.startsWith("Pausing for human approval")) {
        const url = server?.url;
        if (url) {
          console.log(
            indent(
              `${symbol.arrow()} Open ${color.bold(url)} to approve or reject.`,
            ),
          );
        } else {
          console.log(
            indent(
              `${symbol.arrow()} Run ${color.bold("amaco approvals list <runId>")} (or ${color.bold("amaco ui")}) to decide.`,
            ),
          );
        }
      }
    },
  });

  let result;
  try {
    result = await orchestrator.run();
  } catch (err) {
    const raw = isAmacoError(err) ? err.message : err instanceof Error ? err.message : String(err);
    const friendly = rewriteFriendly(raw);
    console.error("");
    console.error(`${symbol.fail()} Run failed.`);
    console.error(indent(friendly));
    if (server) {
      console.error("");
      console.error(
        `${symbol.arrow()} Supervisor still running at ${color.bold(server.url)}.`,
      );
    }
    return 2;
  }

  console.log("");
  const statusLabel = (() => {
    switch (result.state.status) {
      case "merge_ready":
        return color.green(color.bold("merge_ready"));
      case "blocked":
        return color.yellow(color.bold("blocked"));
      case "failed":
        return color.red(color.bold("failed"));
      default:
        return color.bold(result.state.status);
    }
  })();
  console.log(`${header("Final status:")} ${statusLabel}`);
  if (result.state.finalDecision) {
    console.log(indent(`Review decision: ${result.state.finalDecision}`));
  }
  if (result.state.verification) {
    console.log(indent(`Verification: ${result.state.verification}`));
  }
  console.log(
    indent(
      `Artifacts: ${color.dim(
        path.relative(process.cwd(), path.dirname(result.finalReportPath)),
      )}`,
    ),
  );
  if (result.worktreePath) {
    console.log(indent(`Worktree: ${color.dim(result.worktreePath)}`));
  }
  if (result.branchName) {
    console.log(indent(`Branch: ${color.dim(result.branchName)}`));
  }
  if (result.policyWarnings.length > 0) {
    console.log("");
    console.log(`${symbol.warn()} ${color.bold("Policy warnings:")}`);
    for (const w of result.policyWarnings) {
      console.log(indent(`- ${w.code}: ${w.message}`));
    }
  }

  if (server) {
    console.log("");
    console.log(
      `${symbol.arrow()} Supervisor: ${color.bold(server.url)} (Ctrl+C to stop)`,
    );
    // Keep server alive so the user can inspect the run.
    let resolveExit: ((code: number) => void) | null = null;
    const exitPromise = new Promise<number>((resolve) => {
      resolveExit = resolve;
    });
    const shutdown = async (code: number) => {
      try {
        await server!.close();
      } catch {
        // ignore
      }
      if (resolveExit) resolveExit(code);
    };
    process.on("SIGINT", () => void shutdown(0));
    process.on("SIGTERM", () => void shutdown(0));
    return exitPromise;
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

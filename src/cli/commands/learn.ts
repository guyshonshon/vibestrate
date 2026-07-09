import { Command } from "commander";
import { detectProject } from "../../project/project-detector.js";
import {
  writeCodebaseMap,
  loadCodebaseMap,
  renderCodebaseMap,
  type CodebaseMap,
} from "../../project/codebase-map.js";
import { color, indent, symbol } from "../ui/format.js";

export type RunLearnResult =
  | { ok: true; map: CodebaseMap; markdownPath: string }
  | { ok: false; error: string };

/**
 * Regenerate `.vibestrate/CODEBASE.md` + `codebase-map.json`. Never throws:
 * `vibe init` calls this best-effort and a learn failure must not fail init,
 * so the caller always gets a typed result to branch on.
 */
export async function runLearn(projectRoot: string, generatedAt: string): Promise<RunLearnResult> {
  try {
    const { map, markdownPath } = await writeCodebaseMap(projectRoot, generatedAt);
    return { ok: true, map, markdownPath };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function printSummary(result: { ok: true; map: CodebaseMap; markdownPath: string }): void {
  const { map, markdownPath } = result;
  console.log(`${symbol.ok()} Learned the codebase -> ${color.bold(markdownPath)}`);
  console.log(indent(`Type: ${map.project.type}`));
  console.log(indent(`Package manager: ${map.project.packageManager ?? "unknown"}`));
  console.log(indent(`Tracked files: ${map.totalTrackedFiles}`));
  console.log(indent(`Routes detected: ${map.httpRoutes.detected.length}`));
  console.log(
    indent(`Tooling: ${map.tooling.length > 0 ? map.tooling.join(", ") : "none detected"}`),
  );
  for (const note of map.notes) {
    console.log(indent(`${symbol.warn()} ${note}`));
  }
}

export function buildLearnCommand(): Command {
  const cmd = new Command("learn").description(
    "Regenerate .vibestrate/CODEBASE.md, an auto-derived map of the project's stack, layout, and routes.",
  );

  cmd.action(async () => {
    const { projectRoot } = await detectProject(process.cwd());
    const result = await runLearn(projectRoot, new Date().toISOString());
    if (!result.ok) {
      console.error(`${symbol.fail()} ${result.error}`);
      process.exit(1);
    }
    printSummary(result);
  });

  cmd
    .command("show")
    .description("Print the current CODEBASE.md (run `vibe learn` first if there is none).")
    .action(async () => {
      const { projectRoot } = await detectProject(process.cwd());
      const loaded = await loadCodebaseMap(projectRoot);
      if (!loaded.present || !loaded.map) {
        console.error(
          `${symbol.fail()} No codebase map yet. Run ${color.bold("vibe learn")} first.`,
        );
        process.exit(1);
      }
      if (loaded.stale) {
        console.log(color.dim("(generated at an older commit - run `vibe learn` to refresh)"));
      }
      console.log(renderCodebaseMap(loaded.map));
    });

  return cmd;
}

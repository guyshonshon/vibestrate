import { Command } from "commander";
import { detectProject } from "../../project/project-detector.js";
import { loadCodebaseMap, renderCodebaseMap } from "../../project/codebase-map.js";
import {
  writeProjectScan,
  type ProjectScanResult,
} from "../../project/project-scan.js";
import {
  loadTodoHarvest,
  renderTodoSummaryLine,
  todoCountsOf,
} from "../../project/todo-harvest.js";
import { color, indent, symbol } from "../ui/format.js";

export type RunLearnResult =
  | { ok: true; scan: ProjectScanResult }
  | { ok: false; error: string };

/**
 * Regenerate `.vibestrate/CODEBASE.md` + `codebase-map.json`, and harvest the
 * codebase's TODO markers into `.vibestrate/roadmap/todos/harvest.json`.
 *
 * Never throws: `vibe init` calls this best-effort and a learn failure must not
 * fail init, so the caller always gets a typed result to branch on.
 */
export async function runLearn(
  projectRoot: string,
  generatedAt: string,
): Promise<RunLearnResult> {
  try {
    return { ok: true, scan: await writeProjectScan(projectRoot, generatedAt) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function printSummary(scan: ProjectScanResult): void {
  const { map, markdownPath } = scan;
  console.log(`${symbol.ok()} Learned the codebase -> ${color.bold(markdownPath)}`);
  console.log(indent(`Type: ${map.project.type}`));
  console.log(indent(`Package manager: ${map.project.packageManager ?? "unknown"}`));
  console.log(indent(`Tracked files: ${map.totalTrackedFiles}`));
  console.log(indent(`Routes detected: ${map.httpRoutes.detected.length}`));
  console.log(
    indent(`Tooling: ${map.tooling.length > 0 ? map.tooling.join(", ") : "none detected"}`),
  );
  // Counts, never a file path: the harvest is an internal component of the
  // roadmap subsystem, not an artifact anyone is meant to open by hand.
  if (map.todos) {
    console.log(indent(`TODOs: ${renderTodoSummaryLine(map.todos)}`));
    if (scan.promotable > 0) {
      console.log(
        indent(
          `${symbol.arrow()} ${scan.promotable} ready to review: ${color.bold("vibe todos")}`,
        ),
      );
    }
  }
  if (scan.harvestError) {
    console.log(indent(`${symbol.warn()} TODO scan failed: ${scan.harvestError}`));
  }
  for (const note of map.notes) {
    console.log(indent(`${symbol.warn()} ${note}`));
  }
}

export function buildLearnCommand(): Command {
  const cmd = new Command("learn").description(
    "Regenerate .vibestrate/CODEBASE.md, an auto-derived map of the project's stack, layout, and routes, and harvest the codebase's TODO markers.",
  );

  cmd.action(async () => {
    const { projectRoot } = await detectProject(process.cwd());
    const result = await runLearn(projectRoot, new Date().toISOString());
    if (!result.ok) {
      console.error(`${symbol.fail()} ${result.error}`);
      process.exit(1);
    }
    printSummary(result.scan);
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

  cmd
    .command("todos")
    .description(
      "Print the harvested TODO counts. `vibe todos` reviews and promotes them.",
    )
    .option("--json", "emit JSON")
    .action(async (opts: { json?: boolean }) => {
      const { projectRoot } = await detectProject(process.cwd());
      const loaded = await loadTodoHarvest(projectRoot);
      if (!loaded.present || !loaded.harvest) {
        if (opts.json) {
          console.log(JSON.stringify({ present: false }, null, 2));
          return;
        }
        console.error(
          `${symbol.fail()} No TODO harvest yet. Run ${color.bold("vibe learn")} first.`,
        );
        process.exit(1);
      }
      if (opts.json) {
        console.log(JSON.stringify(loaded.harvest, null, 2));
        return;
      }
      if (loaded.stale) {
        console.log(color.dim("(scanned at an older commit - run `vibe learn` to refresh)"));
      }
      console.log(renderTodoSummaryLine(todoCountsOf(loaded.harvest)));
      for (const note of loaded.harvest.notes) {
        console.log(indent(`${symbol.warn()} ${note}`));
      }
    });

  return cmd;
}

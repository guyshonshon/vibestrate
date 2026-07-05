import { Command } from "commander";
import { detectProject } from "../../project/project-detector.js";
import { configExists } from "../../project/config-loader.js";
import { runDocsBatch, type DocsBatchItem } from "../../core/docs-batch.js";
import { color, header, indent, symbol } from "../ui/format.js";
import { isVibestrateError } from "../../utils/errors.js";

async function cmdDocs(
  paths: string[],
  opts: { message?: string; concurrency?: string; json?: boolean },
): Promise<number> {
  const detected = await detectProject(process.cwd());
  if (!detected.isGitRepo) {
    console.error(`${symbol.fail()} Not inside a git repository.`);
    return 1;
  }
  if (!(await configExists(detected.projectRoot))) {
    console.error(
      `${symbol.fail()} Vibestrate is not initialized here. Run ${color.bold("vibe init")}.`,
    );
    return 1;
  }
  if (paths.length === 0) {
    console.error(`${symbol.fail()} Give at least one document path to revise.`);
    return 1;
  }

  const concurrency = opts.concurrency
    ? Number.parseInt(opts.concurrency, 10)
    : undefined;
  if (concurrency !== undefined && (!Number.isInteger(concurrency) || concurrency < 1)) {
    console.error(`${symbol.fail()} --concurrency must be a positive integer.`);
    return 1;
  }

  const instruction = opts.message ?? "Revise this documentation page.";
  const items: DocsBatchItem[] = paths.map((p) => ({
    task: `${instruction}\n\nTarget documentation file: ${p}`,
    targetPath: p,
  }));

  if (!opts.json) {
    console.log(
      header(`Docs batch: ${items.length} page(s), up to ${concurrency ?? 4} at once`),
    );
    console.log(color.dim("Each page is an isolated `docs` run with its own branch.\n"));
  }

  // Ctrl-C / SIGTERM aborts the batch and terminates in-flight child runs rather
  // than orphaning write-capable processes.
  const ac = new AbortController();
  const onSignal = (): void => ac.abort();
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  let outcomes;
  try {
    outcomes = await runDocsBatch({
      projectRoot: detected.projectRoot,
      items,
      concurrency,
      signal: ac.signal,
      onProgress: opts.json ? undefined : (m) => console.log(indent(color.dim(m))),
    });
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isVibestrateError(err) ? err.message : err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }

  if (opts.json) {
    console.log(JSON.stringify(outcomes, null, 2));
  } else {
    console.log("");
    console.log(header("Results"));
    for (const o of outcomes) {
      const ok = o.status === "merge_ready";
      const mark = ok ? symbol.ok() : symbol.warn();
      console.log(
        indent(
          `${mark} ${color.bold(o.targetPath ?? o.runId)} - ${ok ? color.green(o.status) : color.yellow(o.status)}${o.branchName ? color.dim(` (${o.branchName})`) : ""}${o.error ? color.yellow(` - ${o.error}`) : ""}`,
        ),
      );
    }
  }
  // Non-zero exit if any page did not reach merge_ready, so scripts can gate.
  return outcomes.every((o) => o.status === "merge_ready") ? 0 : 2;
}

export function buildDocsCommand(): Command {
  const cmd = new Command("docs")
    .description(
      "Revise several documentation pages concurrently - one isolated `docs` run per page. Best for prose edits to distinct pages; concurrent structural/nav changes may conflict at merge (each run is isolated, so nothing is corrupted).",
    )
    .argument("<paths...>", "documentation file paths to revise (distinct files)")
    .option(
      "-m, --message <text>",
      "instruction applied to every page (default: a generic revise prompt)",
    )
    .option("-c, --concurrency <n>", "max runs in flight at once (default 4)")
    .option("--json", "emit JSON results")
    .action(
      async (
        paths: string[],
        opts: { message?: string; concurrency?: string; json?: boolean },
      ) => {
        const code = await cmdDocs(paths, opts);
        process.exit(code);
      },
    );
  return cmd;
}

import { Command } from "commander";
import {
  SuggestionBundleError,
  SuggestionBundleService,
} from "../../reviews/suggestion-bundle-service.js";
import type { SuggestionBundle } from "../../reviews/suggestion-bundle-types.js";
import { color, symbol } from "../ui/format.js";
import { runStatePath } from "../../utils/paths.js";
import { pathExists } from "../../utils/fs.js";

/**
 * `amaco bundles ...` — internal name. UI copy says "review pass" but the CLI
 * uses the shorter convention to keep `amaco suggestion-bundles ...` from
 * sprawling. (Documented in the README.)
 */
export function buildBundlesCommand(): Command {
  const cmd = new Command("bundles").description(
    "Group reviewed suggestions into a review pass that applies, validates, and reverts as a unit.",
  );

  cmd
    .command("list <runId>")
    .description("List every bundle (review pass) attached to a run.")
    .option("--json", "emit JSON")
    .action(async (runId: string, opts: { json?: boolean }) => {
      await requireRun(runId);
      const items = await new SuggestionBundleService(
        process.cwd(),
        runId,
      ).list();
      if (opts.json) {
        console.log(JSON.stringify(items, null, 2));
        return;
      }
      if (items.length === 0) {
        console.log(color.dim("No review passes yet."));
        return;
      }
      for (const b of items) {
        console.log(
          `${renderStatus(b.status)}  ${color.bold(b.title)}  ${color.dim(`${b.id} · ${b.suggestionIds.length} suggestion${b.suggestionIds.length === 1 ? "" : "s"}`)}`,
        );
        if (b.errorMessage) {
          console.log(color.red(`    ${symbol.fail()} ${b.errorMessage}`));
        }
      }
    });

  cmd
    .command("create <runId>")
    .description("Create a new review pass (bundle) for a run.")
    .requiredOption("--title <text>", "human-readable title")
    .option("--description <text>", "optional longer description")
    .option(
      "--suggestion <ids...>",
      "initial suggestion ids to include (must belong to this run)",
    )
    .action(
      async (
        runId: string,
        opts: {
          title: string;
          description?: string;
          suggestion?: string[];
        },
      ) => {
        await requireRun(runId);
        try {
          const b = await new SuggestionBundleService(
            process.cwd(),
            runId,
          ).create({
            title: opts.title,
            description: opts.description,
            suggestionIds: opts.suggestion,
          });
          console.log(`${symbol.ok()} created ${b.id}.`);
        } catch (err) {
          handle(err);
        }
      },
    );

  cmd
    .command("add <runId> <bundleId> <suggestionId>")
    .description("Add a suggestion to a draft bundle.")
    .action(
      async (runId: string, bundleId: string, suggestionId: string) => {
        await requireRun(runId);
        try {
          await new SuggestionBundleService(
            process.cwd(),
            runId,
          ).addSuggestion(bundleId, suggestionId);
          console.log(`${symbol.ok()} added ${suggestionId} to ${bundleId}.`);
        } catch (err) {
          handle(err);
        }
      },
    );

  cmd
    .command("remove <runId> <bundleId> <suggestionId>")
    .description("Remove a suggestion from a draft bundle.")
    .action(
      async (runId: string, bundleId: string, suggestionId: string) => {
        await requireRun(runId);
        try {
          await new SuggestionBundleService(
            process.cwd(),
            runId,
          ).removeSuggestion(bundleId, suggestionId);
          console.log(`${symbol.ok()} removed.`);
        } catch (err) {
          handle(err);
        }
      },
    );

  cmd
    .command("approve <runId> <bundleId>")
    .option("--note <text>", "decision note")
    .description("Approve a review pass (gate before apply).")
    .action(
      async (runId: string, bundleId: string, opts: { note?: string }) => {
        await requireRun(runId);
        try {
          const b = await new SuggestionBundleService(
            process.cwd(),
            runId,
          ).approve(bundleId, opts.note ?? null);
          console.log(`${symbol.ok()} approved ${b.id}.`);
        } catch (err) {
          handle(err);
        }
      },
    );

  cmd
    .command("reject <runId> <bundleId>")
    .option("--note <text>", "decision note")
    .description("Reject a review pass.")
    .action(
      async (runId: string, bundleId: string, opts: { note?: string }) => {
        await requireRun(runId);
        try {
          const b = await new SuggestionBundleService(
            process.cwd(),
            runId,
          ).reject(bundleId, opts.note ?? null);
          console.log(`${symbol.ok()} rejected ${b.id}.`);
        } catch (err) {
          handle(err);
        }
      },
    );

  cmd
    .command("apply <runId> <bundleId>")
    .description(
      "Apply every suggestion in the review pass to the run worktree (all-or-nothing with rollback).",
    )
    .option("--validate", "after applying, run commands.validate")
    .action(
      async (
        runId: string,
        bundleId: string,
        opts: { validate?: boolean },
      ) => {
        await requireRun(runId);
        try {
          const svc = new SuggestionBundleService(process.cwd(), runId);
          const r = await svc.apply(bundleId);
          renderApplyResult(r.bundle);
          if (r.preflight.sameFileWarnings.length > 0) {
            console.log(
              color.yellow(
                `! ${r.preflight.sameFileWarnings.length} same-file warning(s):`,
              ),
            );
            for (const w of r.preflight.sameFileWarnings) {
              console.log(
                color.dim(`  ${w.file}: ${w.suggestionIds.join(", ")}`),
              );
            }
          }
          if (r.bundle.status !== "applied") {
            process.exit(1);
          }
          if (opts.validate) {
            await runBundleValidate(svc, bundleId);
          }
        } catch (err) {
          handle(err);
        }
      },
    );

  cmd
    .command("validate <runId> <bundleId>")
    .description(
      "Run commands.validate against the run worktree, attached to a bundle.",
    )
    .action(async (runId: string, bundleId: string) => {
      await requireRun(runId);
      try {
        const svc = new SuggestionBundleService(process.cwd(), runId);
        await runBundleValidate(svc, bundleId);
      } catch (err) {
        handle(err);
      }
    });

  cmd
    .command("revert <runId> <bundleId>")
    .description(
      "Revert every suggestion in the review pass via git apply -R (worktree only).",
    )
    .action(async (runId: string, bundleId: string) => {
      await requireRun(runId);
      try {
        const r = await new SuggestionBundleService(
          process.cwd(),
          runId,
        ).revert(bundleId);
        if (r.status === "reverted") {
          console.log(`${symbol.ok()} reverted ${r.id}.`);
        } else {
          console.error(
            color.red(
              `${symbol.fail()} revert failed: ${r.errorMessage ?? "unknown reason"}`,
            ),
          );
          process.exit(1);
        }
      } catch (err) {
        handle(err);
      }
    });

  cmd
    .command("preflight <runId> <bundleId>")
    .description("Run a static-only preflight without modifying the worktree.")
    .action(async (runId: string, bundleId: string) => {
      await requireRun(runId);
      try {
        const r = await new SuggestionBundleService(
          process.cwd(),
          runId,
        ).preflight(bundleId);
        if (r.ok) {
          console.log(`${symbol.ok()} preflight ok.`);
        } else {
          console.error(color.red(`${symbol.fail()} preflight failed:`));
          for (const f of r.findings.filter((f) => f.reason !== null)) {
            console.error(color.dim(`  ${f.suggestionId}: ${f.reason}`));
          }
        }
        if (r.sameFileWarnings.length > 0) {
          console.log(color.yellow("! same-file warnings:"));
          for (const w of r.sameFileWarnings) {
            console.log(
              color.dim(`  ${w.file}: ${w.suggestionIds.join(", ")}`),
            );
          }
        }
      } catch (err) {
        handle(err);
      }
    });

  return cmd;
}

function renderStatus(status: SuggestionBundle["status"]): string {
  switch (status) {
    case "draft":
      return color.cyan("[draft]            ");
    case "approved":
      return color.green("[approved]         ");
    case "applying":
      return color.yellow("[applying]         ");
    case "applied":
      return color.green("[applied]          ");
    case "validation_passed":
      return color.green("[validation_passed]");
    case "validation_failed":
      return color.red("[validation_failed]");
    case "partially_applied":
      return color.red("[partially_applied]");
    case "reverted":
      return color.dim("[reverted]         ");
    case "revert_failed":
      return color.red("[revert_failed]    ");
    case "rejected":
      return color.yellow("[rejected]         ");
    case "failed":
    default:
      return color.red(`[${status}]`.padEnd(20));
  }
}

function renderApplyResult(b: SuggestionBundle): void {
  if (b.status === "applied") {
    console.log(`${symbol.ok()} applied ${b.id}.`);
    return;
  }
  if (b.status === "partially_applied") {
    console.error(
      color.red(
        `${symbol.fail()} bundle partially applied — worktree may be modified. Reason: ${b.errorMessage}`,
      ),
    );
    return;
  }
  console.error(
    color.red(
      `${symbol.fail()} bundle ${b.status}: ${b.errorMessage ?? "no detail"}`,
    ),
  );
}

async function runBundleValidate(
  svc: SuggestionBundleService,
  bundleId: string,
): Promise<void> {
  const r = await svc.validate(bundleId);
  if (r.result.status === "passed") {
    console.log(
      `${symbol.ok()} validation passed: ${r.result.summary.passed}/${r.result.summary.total}.`,
    );
  } else if (r.result.status === "failed") {
    console.error(
      color.red(
        `${symbol.fail()} validation failed: ${r.result.summary.failed} of ${r.result.summary.total}.`,
      ),
    );
    for (const c of r.result.commands.filter((c) => c.status === "failed")) {
      console.error(color.dim(`  ${c.command} → exit ${c.exitCode}`));
    }
    process.exit(1);
  } else {
    console.log(
      color.yellow(
        '! No commands.validate configured. Try: amaco config set commands.validate \'["pnpm test"]\'',
      ),
    );
  }
}

function handle(err: unknown): never {
  if (err instanceof SuggestionBundleError) {
    console.error(color.red(`${symbol.fail()} ${err.message}`));
    process.exit(err.statusCode === 404 ? 2 : 1);
  }
  console.error(color.red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
}

async function requireRun(runId: string): Promise<void> {
  if (!(await pathExists(runStatePath(process.cwd(), runId)))) {
    console.error(color.red(`Run ${runId} not found in this project.`));
    process.exit(2);
  }
}

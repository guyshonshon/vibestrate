import { Command } from "commander";
import {
  ReviewSuggestionService,
  SuggestionServiceError,
} from "../../reviews/review-suggestion-service.js";
import { color, symbol } from "../ui/format.js";
import { runStatePath } from "../../utils/paths.js";
import { pathExists } from "../../utils/fs.js";

export function buildSuggestionsCommand(): Command {
  const cmd = new Command("suggestions").description(
    "Inspect and act on review suggestions captured for a run.",
  );

  cmd
    .command("list <runId>")
    .description("List every suggestion attached to a run.")
    .option("--json", "emit JSON instead of a human-readable table")
    .action(async (runId: string, opts: { json?: boolean }) => {
      await requireRun(runId);
      const items = await new ReviewSuggestionService(
        process.cwd(),
        runId,
      ).list();
      if (opts.json) {
        console.log(JSON.stringify(items, null, 2));
        return;
      }
      if (items.length === 0) {
        console.log(color.dim("No suggestions yet."));
        return;
      }
      for (const s of items) {
        const tag = renderStatus(s.status);
        const target = s.file
          ? `${s.file}${s.lineStart ? `:${s.lineStart}${s.lineEnd ? `-${s.lineEnd}` : ""}` : ""}`
          : "—";
        console.log(`${tag}  ${color.bold(s.title)}`);
        console.log(`    ${color.dim(`${s.id} · ${s.source} · ${target}`)}`);
        if (s.errorMessage) {
          console.log(color.red(`    ${symbol.fail()} ${s.errorMessage}`));
        }
      }
    });

  cmd
    .command("show <runId> <suggestionId>")
    .description("Show one suggestion in detail (including any proposed patch).")
    .action(async (runId: string, suggestionId: string) => {
      await requireRun(runId);
      const s = await new ReviewSuggestionService(
        process.cwd(),
        runId,
      ).get(suggestionId);
      if (!s) {
        console.error(color.red(`Suggestion ${suggestionId} not found.`));
        process.exit(2);
      }
      console.log(color.bold(s.title));
      console.log(
        color.dim(`${s.id} · ${s.source} · ${s.status}${s.file ? ` · ${s.file}` : ""}`),
      );
      if (s.body) console.log(`\n${s.body}`);
      if (s.proposedPatch) {
        console.log(`\n${color.dim("--- proposed patch ---")}`);
        console.log(s.proposedPatch);
      }
      if (s.errorMessage) {
        console.log(`\n${color.red(`error: ${s.errorMessage}`)}`);
      }
    });

  cmd
    .command("approve <runId> <suggestionId>")
    .description("Approve a suggestion (creates and resolves an approval record).")
    .option("--note <text>", "decision note recorded with the approval")
    .action(
      async (
        runId: string,
        suggestionId: string,
        opts: { note?: string },
      ) => {
        await requireRun(runId);
        try {
          const r = await new ReviewSuggestionService(
            process.cwd(),
            runId,
          ).approve(suggestionId, opts.note ?? null);
          console.log(`${symbol.ok()} approved ${r.id}.`);
        } catch (err) {
          handleErr(err);
        }
      },
    );

  cmd
    .command("reject <runId> <suggestionId>")
    .description("Reject a suggestion. Records a rejection in approvals.json.")
    .option("--note <text>", "decision note recorded with the approval")
    .action(
      async (
        runId: string,
        suggestionId: string,
        opts: { note?: string },
      ) => {
        await requireRun(runId);
        try {
          const r = await new ReviewSuggestionService(
            process.cwd(),
            runId,
          ).reject(suggestionId, opts.note ?? null);
          console.log(`${symbol.ok()} rejected ${r.id}.`);
        } catch (err) {
          handleErr(err);
        }
      },
    );

  cmd
    .command("apply <runId> <suggestionId>")
    .description(
      "Apply an approved suggestion's proposedPatch inside the run's worktree (git apply, never push/merge).",
    )
    .option(
      "--validate",
      "after applying, run commands.validate inside the worktree",
    )
    .option(
      "--auto-revert-on-fail",
      "if validation fails, revert the patch (only valid with --validate)",
    )
    .action(
      async (
        runId: string,
        suggestionId: string,
        opts: { validate?: boolean; autoRevertOnFail?: boolean },
      ) => {
        if (opts.autoRevertOnFail && !opts.validate) {
          console.error(
            color.red(
              "--auto-revert-on-fail requires --validate (auto-revert only fires after validation actually runs).",
            ),
          );
          process.exit(2);
        }
        await requireRun(runId);
        try {
          const svc = new ReviewSuggestionService(process.cwd(), runId);
          const r = await svc.apply(suggestionId, {
            validateAfterApply: opts.validate,
            autoRevertOnValidationFail: opts.autoRevertOnFail,
          });
          renderApplyResult(r);
          // Non-zero exit on anything that didn't end clean.
          if (
            r.status === "failed" ||
            r.status === "validation_failed" ||
            r.status === "validation_failed_revert_failed"
          ) {
            process.exit(1);
          }
        } catch (err) {
          handleErr(err);
        }
      },
    );

  cmd
    .command("validate <runId> <suggestionId>")
    .description(
      "Run the project's commands.validate inside the run's worktree against an applied suggestion.",
    )
    .action(async (runId: string, suggestionId: string) => {
      await requireRun(runId);
      try {
        const svc = new ReviewSuggestionService(process.cwd(), runId);
        await runValidationCli(svc, suggestionId);
      } catch (err) {
        handleErr(err);
      }
    });

  cmd
    .command("revert <runId> <suggestionId>")
    .description(
      "Revert a previously-applied suggestion using the captured patch (git apply -R).",
    )
    .action(async (runId: string, suggestionId: string) => {
      await requireRun(runId);
      try {
        const svc = new ReviewSuggestionService(process.cwd(), runId);
        const r = await svc.revert(suggestionId);
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
        handleErr(err);
      }
    });

  return cmd;
}

function renderApplyResult(s: import("../../reviews/review-suggestion-types.js").ReviewSuggestion): void {
  switch (s.status) {
    case "applied":
      console.log(`${symbol.ok()} applied ${s.id}.`);
      return;
    case "validation_passed":
      console.log(`${symbol.ok()} applied + validation passed (${s.id}).`);
      return;
    case "reverted_after_validation_failed":
      console.log(
        color.yellow(
          `! validation failed and the patch was auto-reverted (${s.id}).`,
        ),
      );
      return;
    case "validation_failed":
      console.error(
        color.red(
          `${symbol.fail()} validation failed (${s.id}). Patch is still applied; run "amaco suggestions revert" to roll it back.`,
        ),
      );
      return;
    case "validation_failed_revert_failed":
      console.error(
        color.red(
          `${symbol.fail()} validation failed AND auto-revert failed (${s.id}). Inspect the worktree.`,
        ),
      );
      return;
    case "failed":
    default:
      console.error(
        color.red(
          `${symbol.fail()} ${s.status}: ${s.errorMessage ?? "no detail"}`,
        ),
      );
  }
}

async function runValidationCli(
  svc: ReviewSuggestionService,
  suggestionId: string,
): Promise<void> {
  const r = await svc.validate(suggestionId);
  if (r.result.status === "passed") {
    console.log(
      `${symbol.ok()} validation passed: ${r.result.summary.passed}/${r.result.summary.total} commands.`,
    );
  } else if (r.result.status === "failed") {
    console.error(
      color.red(
        `${symbol.fail()} validation failed: ${r.result.summary.failed} of ${r.result.summary.total} commands failed.`,
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

function renderStatus(status: string): string {
  switch (status) {
    case "open":
      return color.cyan("[open]    ");
    case "approved":
      return color.green("[approved]");
    case "rejected":
      return color.yellow("[rejected]");
    case "applied":
      return color.green("[applied] ");
    case "failed":
      return color.red("[failed]  ");
    case "resolved":
      return color.dim("[resolved]");
    default:
      return color.dim(`[${status}]`);
  }
}

function handleErr(err: unknown): never {
  if (err instanceof SuggestionServiceError) {
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

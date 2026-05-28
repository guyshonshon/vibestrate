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
    .option(
      "--profile <name>",
      "validation profile to run after apply (only meaningful with --validate)",
    )
    .action(
      async (
        runId: string,
        suggestionId: string,
        opts: {
          validate?: boolean;
          autoRevertOnFail?: boolean;
          profile?: string;
        },
      ) => {
        if (opts.autoRevertOnFail && !opts.validate) {
          console.error(
            color.red(
              "--auto-revert-on-fail requires --validate (auto-revert only fires after validation actually runs).",
            ),
          );
          process.exit(2);
        }
        if (opts.profile && !opts.validate) {
          console.error(
            color.red(
              "--profile only applies when --validate is set (validation never runs from a plain apply).",
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
            profileName: opts.profile ?? null,
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
    .option(
      "--profile <name>",
      "named validation profile from commands.validationProfiles",
    )
    .action(async (runId: string, suggestionId: string, opts: { profile?: string }) => {
      await requireRun(runId);
      try {
        const svc = new ReviewSuggestionService(process.cwd(), runId);
        await runValidationCli(svc, suggestionId, opts.profile);
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

  // ─── suggestions profile ─────────────────────────────────────────────────
  const profile = cmd
    .command("profile")
    .description("Read or edit a suggestion's validation profile metadata.");

  profile
    .command("show <runId> <suggestionId>")
    .description("Print the suggestion's current validation profile (if any).")
    .action(async (runId: string, suggestionId: string) => {
      await requireRun(runId);
      const svc = new ReviewSuggestionService(process.cwd(), runId);
      const s = await svc.get(suggestionId);
      if (!s) {
        console.error(color.red(`Suggestion ${suggestionId} not found.`));
        process.exit(2);
      }
      if (s.validationProfile) {
        console.log(`${s.id}: ${color.cyan(s.validationProfile)}`);
      } else {
        console.log(`${s.id}: ${color.dim("default (commands.validate)")}`);
      }
    });

  profile
    .command("set <runId> <suggestionId> <profileName>")
    .description(
      "Set the suggestion's validation profile. Future validation runs use this profile. Does NOT re-run validation.",
    )
    .action(
      async (runId: string, suggestionId: string, profileName: string) => {
        await requireRun(runId);
        try {
          const svc = new ReviewSuggestionService(process.cwd(), runId);
          const r = await svc.updateValidationProfile(
            suggestionId,
            profileName,
          );
          console.log(
            `${symbol.ok()} suggestion ${r.id} validation profile set to ${color.cyan(r.validationProfile ?? "default")}.`,
          );
        } catch (err) {
          handleErr(err);
        }
      },
    );

  profile
    .command("clear <runId> <suggestionId>")
    .description(
      "Clear the suggestion's validation profile back to default (commands.validate).",
    )
    .action(async (runId: string, suggestionId: string) => {
      await requireRun(runId);
      try {
        const svc = new ReviewSuggestionService(process.cwd(), runId);
        const r = await svc.updateValidationProfile(suggestionId, null);
        console.log(
          `${symbol.ok()} suggestion ${r.id} validation profile cleared (uses default).`,
        );
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
          `${symbol.fail()} validation failed (${s.id}). Patch is still applied; run "vibe suggestions revert" to roll it back.`,
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
  profileName?: string,
): Promise<void> {
  const r = await svc.validate(suggestionId, {
    profileName: profileName ?? null,
  });
  const profileTag =
    r.result.profileName === "default"
      ? color.dim(`(default)`)
      : color.dim(`(profile: ${r.result.profileName} · ${r.result.profileSource})`);
  if (r.result.status === "passed") {
    console.log(
      `${symbol.ok()} validation passed: ${r.result.summary.passed}/${r.result.summary.total} commands ${profileTag}`,
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
        '! No commands.validate configured. Try: vibe config set commands.validate \'["pnpm test"]\'',
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

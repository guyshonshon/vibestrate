import { Command } from "commander";
import { color, symbol } from "../ui/format.js";
import { loadConfig } from "../../project/config-loader.js";
import {
  listValidationProfiles,
  resolveValidationProfile,
  ValidationProfileError,
} from "../../core/validation-profile-service.js";
import {
  applyMigration,
  listMigrations,
  previewMigration,
  ValidationProfileMigrationError,
  type MigrationPreview,
  type MigrationScope,
} from "../../core/validation-profile-migration-service.js";
import {
  applyRename,
  previewRename,
  ValidationProfileRenameError,
  type RenamePreview,
} from "../../core/validation-profile-rename-service.js";
import { readUsageReport } from "../../core/validation-profile-usage-service.js";

export function buildValidationCommand(): Command {
  const cmd = new Command("validation").description(
    "Inspect validation profiles configured under commands.validationProfiles.",
  );

  cmd
    .command("profiles")
    .description("List the implicit default + every named validation profile.")
    .option("--json", "emit JSON")
    .action(async (opts: { json?: boolean }) => {
      const cfg = await loadConfig(process.cwd()).catch(() => null);
      if (!cfg) {
        console.error(color.red("Project not initialised. Run `amaco init`."));
        process.exit(2);
      }
      const profiles = listValidationProfiles(cfg.config);
      if (opts.json) {
        console.log(JSON.stringify(profiles, null, 2));
        return;
      }
      for (const p of profiles) {
        const tag =
          p.source === "default"
            ? color.dim("default")
            : color.cyan(`named`);
        const ok = p.hasCommands ? symbol.ok() : color.yellow("!");
        console.log(`${ok} ${color.bold(p.profileName)} ${tag}`);
        if (p.description) console.log(color.dim(`    ${p.description}`));
        if (p.commands.length === 0) {
          console.log(color.dim("    (no commands)"));
        } else {
          for (const c of p.commands) {
            console.log(color.dim(`    ${c}`));
          }
        }
      }
    });

  cmd
    .command("profile show <name>")
    .description(
      "Show the resolved commands for a named profile (or 'default').",
    )
    .option("--json", "emit JSON")
    .action(async (name: string, opts: { json?: boolean }) => {
      const cfg = await loadConfig(process.cwd()).catch(() => null);
      if (!cfg) {
        console.error(color.red("Project not initialised. Run `amaco init`."));
        process.exit(2);
      }
      try {
        const resolved = resolveValidationProfile(cfg.config, name);
        if (opts.json) {
          console.log(JSON.stringify(resolved, null, 2));
          return;
        }
        console.log(`${color.bold(resolved.profileName)} ${color.dim(resolved.source)}`);
        if (resolved.description) {
          console.log(color.dim(resolved.description));
        }
        if (resolved.commands.length === 0) {
          console.log(
            color.yellow(
              '! No commands. The default profile is empty — set commands.validate \'["pnpm test"]\' or a named profile.',
            ),
          );
        } else {
          for (const c of resolved.commands) console.log(`  ${c}`);
        }
      } catch (err) {
        if (err instanceof ValidationProfileError) {
          console.error(color.red(`${symbol.fail()} ${err.message}`));
          process.exit(err.statusCode === 404 ? 2 : 1);
        }
        throw err;
      }
    });

  // ─── usage ────────────────────────────────────────────────────────────────
  cmd
    .command("usage")
    .description(
      "Show how often each validation profile has actually run (`commands.validate` use counts as 'default').",
    )
    .option("--json", "emit JSON")
    .action(async (opts: { json?: boolean }) => {
      const report = await readUsageReport(process.cwd());
      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }
      if (report.entries.length === 0) {
        console.log(color.dim("No validation runs recorded yet."));
        return;
      }
      for (const e of report.entries) {
        const src = e.source === "default" ? color.dim("default") : color.cyan("named");
        console.log(
          `${color.bold(e.profileName)} ${src}  uses=${e.totalUses}  last=${color.dim(e.lastUsedAt ?? "—")}`,
        );
      }
    });

  // ─── profile migrate ──────────────────────────────────────────────────────
  const profileSub = cmd
    .command("profile")
    .description("Manage and migrate validation profile references.");

  profileSub
    .command("migrate <fromProfile> <toProfile>")
    .description(
      "Rewrite suggestion and bundle records that reference <fromProfile> to point at <toProfile>. Use --clear to migrate to the default profile.",
    )
    .option("--dry-run", "preview affected records; write nothing")
    .option("--clear", "interpret <toProfile> as a placeholder for clear-to-default")
    .option("--all", "scan every run instead of the recent 50")
    .option("--run <runId>", "limit to a single run")
    .action(
      async (
        fromProfile: string,
        toProfile: string,
        opts: {
          dryRun?: boolean;
          clear?: boolean;
          all?: boolean;
          run?: string;
        },
      ) => {
        await runMigration({
          fromProfile,
          toProfile: opts.clear ? null : toProfile,
          dryRun: !!opts.dryRun,
          scope: pickScope(opts),
        });
      },
    );

  profileSub
    .command("clear-references <profileName>")
    .description(
      "Clear every suggestion/bundle that references <profileName> back to the default profile.",
    )
    .option("--dry-run", "preview affected records; write nothing")
    .option("--all", "scan every run instead of the recent 50")
    .option("--run <runId>", "limit to a single run")
    .action(
      async (
        profileName: string,
        opts: { dryRun?: boolean; all?: boolean; run?: string },
      ) => {
        await runMigration({
          fromProfile: profileName,
          toProfile: null,
          dryRun: !!opts.dryRun,
          scope: pickScope(opts),
        });
      },
    );

  profileSub
    .command("rename <fromProfile> <toProfile>")
    .description(
      "Rename a validation profile in project.yml AND migrate every suggestion/bundle reference in one atomic operation. Preserves the profile's description and commands. Refuses if <toProfile> already exists.",
    )
    .option(
      "--dry-run",
      "preview the project.yml rename + affected references; write nothing",
    )
    .option("--all", "scan every run instead of the recent 50")
    .option("--run <runId>", "limit the reference scan to a single run")
    .action(
      async (
        fromProfile: string,
        toProfile: string,
        opts: { dryRun?: boolean; all?: boolean; run?: string },
      ) => {
        await runRename({
          fromProfile,
          toProfile,
          dryRun: !!opts.dryRun,
          scope: pickScope(opts),
        });
      },
    );

  profileSub
    .command("migrations")
    .description("List previously-applied profile migrations.")
    .option("--json", "emit JSON")
    .action(async (opts: { json?: boolean }) => {
      const all = await listMigrations(process.cwd());
      if (opts.json) {
        console.log(JSON.stringify(all, null, 2));
        return;
      }
      if (all.length === 0) {
        console.log(color.dim("No migrations recorded."));
        return;
      }
      for (const m of all) {
        const to = m.toProfile ?? color.dim("default");
        const kind = m.kind ?? "migrate_references";
        const kindTag =
          kind === "rename_profile"
            ? color.cyan("rename")
            : kind === "clear_references"
              ? color.dim("clear")
              : color.dim("migrate");
        console.log(
          `${color.bold(m.id)}  ${kindTag}  ${m.fromProfile} → ${to}  ${color.dim(`${m.affectedSuggestions.length} suggestion(s), ${m.affectedBundles.length} bundle(s)`)}`,
        );
      }
    });

  return cmd;
}

function pickScope(opts: {
  all?: boolean;
  run?: string;
}): MigrationScope {
  if (opts.run) return { kind: "run", runId: opts.run };
  if (opts.all) return { kind: "all" };
  return { kind: "recent" };
}

async function runMigration(input: {
  fromProfile: string;
  toProfile: string | null;
  dryRun: boolean;
  scope: MigrationScope;
}): Promise<void> {
  const cfg = await loadConfig(process.cwd()).catch(() => null);
  if (!cfg) {
    console.error(color.red("Project not initialised. Run `amaco init`."));
    process.exit(2);
  }
  try {
    const preview: MigrationPreview = await previewMigration({
      projectRoot: process.cwd(),
      config: cfg.config,
      fromProfile: input.fromProfile,
      toProfile: input.toProfile,
      scope: input.scope,
    });
    renderPreview(preview, input.dryRun);
    if (input.dryRun) return;
    if (
      preview.affectedSuggestions.length === 0 &&
      preview.affectedBundles.length === 0
    ) {
      console.log(color.dim("Nothing to apply."));
      return;
    }
    const audit = await applyMigration({
      projectRoot: process.cwd(),
      config: cfg.config,
      fromProfile: input.fromProfile,
      toProfile: input.toProfile,
      scope: input.scope,
    });
    console.log(
      `${symbol.ok()} Applied. Audit: ${color.dim(`.amaco/validation-profile-migrations/${audit.id}.json`)}`,
    );
  } catch (err) {
    if (err instanceof ValidationProfileMigrationError) {
      console.error(color.red(`${symbol.fail()} ${err.message}`));
      process.exit(err.statusCode === 404 ? 2 : 1);
    }
    throw err;
  }
}

function renderPreview(preview: MigrationPreview, dryRun: boolean): void {
  const target = preview.toProfile ?? "default (clear)";
  console.log(
    `${color.bold(preview.fromProfile)} → ${color.bold(target)}  ${color.dim(`scope=${preview.scope.kind}, scanned=${preview.scannedRuns} run(s)`)}`,
  );
  console.log(
    `  suggestions: ${preview.affectedSuggestions.length}  bundles: ${preview.affectedBundles.length}  malformed: ${preview.malformedFiles.length}`,
  );
  const sample = [
    ...preview.affectedSuggestions.slice(0, 5).map(
      (r) => `    suggestion ${r.runId}/${r.id}`,
    ),
    ...preview.affectedBundles.slice(0, 5).map(
      (r) => `    bundle ${r.runId}/${r.id}`,
    ),
  ];
  for (const line of sample) console.log(color.dim(line));
  if (preview.malformedFiles.length > 0) {
    console.log(color.yellow(`! Skipped ${preview.malformedFiles.length} malformed file(s).`));
  }
  if (dryRun) {
    console.log(
      color.dim(
        "Dry run — wrote nothing. Re-run without --dry-run to apply.",
      ),
    );
  }
}

async function runRename(input: {
  fromProfile: string;
  toProfile: string;
  dryRun: boolean;
  scope: MigrationScope;
}): Promise<void> {
  const cfg = await loadConfig(process.cwd()).catch(() => null);
  if (!cfg) {
    console.error(color.red("Project not initialised. Run `amaco init`."));
    process.exit(2);
  }
  try {
    const preview = await previewRename({
      projectRoot: process.cwd(),
      config: cfg.config,
      fromProfile: input.fromProfile,
      toProfile: input.toProfile,
      scope: input.scope,
    });
    renderRenamePreview(preview, input.dryRun);
    if (input.dryRun) return;
    const audit = await applyRename({
      projectRoot: process.cwd(),
      config: cfg.config,
      fromProfile: input.fromProfile,
      toProfile: input.toProfile,
      scope: input.scope,
    });
    console.log(
      `${symbol.ok()} Renamed ${color.bold(preview.fromProfile)} → ${color.bold(preview.toProfile)}. Audit: ${color.dim(`.amaco/validation-profile-migrations/${audit.id}.json`)}`,
    );
  } catch (err) {
    if (err instanceof ValidationProfileRenameError) {
      console.error(color.red(`${symbol.fail()} ${err.message}`));
      process.exit(err.statusCode === 404 ? 2 : 1);
    }
    if (err instanceof ValidationProfileMigrationError) {
      console.error(color.red(`${symbol.fail()} ${err.message}`));
      process.exit(err.statusCode === 404 ? 2 : 1);
    }
    throw err;
  }
}

function renderRenamePreview(preview: RenamePreview, dryRun: boolean): void {
  console.log(
    `${color.bold(preview.fromProfile)} → ${color.bold(preview.toProfile)}  ${color.dim(`scope=${preview.scope.kind}, scanned=${preview.scannedRuns} run(s)`)}`,
  );
  console.log(
    `  project.yml: rename profile key (preserves ${preview.preservedCommandCount} command${preview.preservedCommandCount === 1 ? "" : "s"}${preview.preservedDescription ? `, description "${preview.preservedDescription}"` : ""})`,
  );
  console.log(
    `  references: ${preview.affectedSuggestions.length} suggestion(s), ${preview.affectedBundles.length} bundle(s), ${preview.malformedFiles.length} malformed`,
  );
  for (const w of preview.warnings) console.log(color.yellow(`  ! ${w}`));
  const sample = [
    ...preview.affectedSuggestions.slice(0, 5).map(
      (r) => `    suggestion ${r.runId}/${r.id}`,
    ),
    ...preview.affectedBundles.slice(0, 5).map(
      (r) => `    bundle ${r.runId}/${r.id}`,
    ),
  ];
  for (const line of sample) console.log(color.dim(line));
  if (dryRun) {
    console.log(
      color.dim(
        "Dry run — wrote nothing. Re-run without --dry-run to apply.",
      ),
    );
  }
}

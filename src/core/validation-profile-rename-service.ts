import path from "node:path";
import { ensureDir, writeText } from "../utils/fs.js";
import {
  readDocument,
  writeDocument,
} from "../setup/config-update-service.js";
import {
  VALIDATION_PROFILE_NAME_RE,
  type ProjectConfig,
} from "../project/config-schema.js";
import {
  applyMigration,
  migrationsDir,
  previewMigration,
  type AffectedRecord,
  type MigrationAuditRecord,
  type MigrationScope,
} from "./validation-profile-migration-service.js";

const RESERVED_PROFILE_NAMES = new Set(["default", "all", "none"]);

export class ValidationProfileRenameError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ValidationProfileRenameError";
  }
}

export type RenamePreview = {
  fromProfile: string;
  toProfile: string;
  /** Description that will be preserved on the renamed profile. */
  preservedDescription: string | null;
  /** Command count that will be preserved on the renamed profile. */
  preservedCommandCount: number;
  scope: MigrationScope;
  scannedRuns: number;
  affectedSuggestions: AffectedRecord[];
  affectedBundles: AffectedRecord[];
  malformedFiles: string[];
  /** Warnings worth surfacing in the CLI/UI but not hard failures. */
  warnings: string[];
};

function validateRenameInputs(
  fromProfile: string,
  toProfile: string,
  config: ProjectConfig,
): { description: string | null; commandCount: number } {
  const from = (fromProfile ?? "").trim();
  const to = (toProfile ?? "").trim();
  if (!from || !to) {
    throw new ValidationProfileRenameError(
      400,
      "fromProfile and toProfile are required.",
    );
  }
  if (RESERVED_PROFILE_NAMES.has(from)) {
    throw new ValidationProfileRenameError(
      400,
      `fromProfile cannot be "${from}". The implicit default cannot be renamed.`,
    );
  }
  if (RESERVED_PROFILE_NAMES.has(to)) {
    throw new ValidationProfileRenameError(
      400,
      `toProfile cannot be "${to}". That name is reserved.`,
    );
  }
  if (from === to) {
    throw new ValidationProfileRenameError(
      400,
      "fromProfile and toProfile are the same. Pick a different new name.",
    );
  }
  if (!VALIDATION_PROFILE_NAME_RE.test(to)) {
    throw new ValidationProfileRenameError(
      400,
      `toProfile "${to}" is not a valid profile id (letters, digits, dashes, underscores; max 40 chars).`,
    );
  }
  const profiles = config.commands.validationProfiles ?? {};
  const entry = profiles[from];
  if (!entry) {
    throw new ValidationProfileRenameError(
      404,
      `Profile "${from}" does not exist in commands.validationProfiles. To migrate references whose target was never declared, use \`amaco validation profile migrate ${from} <to> --dry-run\`.`,
    );
  }
  if (profiles[to]) {
    throw new ValidationProfileRenameError(
      409,
      `Profile "${to}" already exists. Rename refused to avoid overwriting it. Use \`amaco validation profile migrate ${from} ${to}\` if you only want to migrate references onto the existing profile.`,
    );
  }
  return {
    description: entry.description ?? null,
    commandCount: entry.commands.length,
  };
}

/**
 * Pure preview — validates the inputs, lists references that would be
 * migrated, and reports what would be preserved on the renamed profile.
 * Writes nothing. Tolerant of malformed records via the inner migration
 * preview.
 */
export async function previewRename(input: {
  projectRoot: string;
  config: ProjectConfig;
  fromProfile: string;
  toProfile: string;
  scope?: MigrationScope;
}): Promise<RenamePreview> {
  const from = (input.fromProfile ?? "").trim();
  const to = (input.toProfile ?? "").trim();
  const meta = validateRenameInputs(from, to, input.config);
  const scope: MigrationScope = input.scope ?? { kind: "recent" };

  // previewMigration() validates against the LIVE config; since toProfile
  // doesn't exist yet, feed it a synthetic config where the target already
  // exists so the preview path doesn't reject. The real project.yml is not
  // touched here.
  const profiles = { ...(input.config.commands.validationProfiles ?? {}) };
  profiles[to] = profiles[from] ?? { commands: ["true"] };
  const synthetic: ProjectConfig = {
    ...input.config,
    commands: {
      ...input.config.commands,
      validationProfiles: profiles,
    },
  };
  const refPreview = await previewMigration({
    projectRoot: input.projectRoot,
    config: synthetic,
    fromProfile: from,
    toProfile: to,
    scope,
  });

  const warnings: string[] = [];
  if (refPreview.malformedFiles.length > 0) {
    warnings.push(
      `${refPreview.malformedFiles.length} suggestion/bundle file(s) were skipped because they could not be parsed.`,
    );
  }
  if (meta.commandCount === 0) {
    warnings.push(
      "fromProfile has zero commands; the renamed profile will resolve to no_commands_configured at runtime.",
    );
  }

  return {
    fromProfile: from,
    toProfile: to,
    preservedDescription: meta.description,
    preservedCommandCount: meta.commandCount,
    scope,
    scannedRuns: refPreview.scannedRuns,
    affectedSuggestions: refPreview.affectedSuggestions,
    affectedBundles: refPreview.affectedBundles,
    malformedFiles: refPreview.malformedFiles,
    warnings,
  };
}

/**
 * Apply a rename atomically. Strategy:
 *   1. Validate inputs against the live config (throws if anything is off).
 *   2. Snapshot project.yml so we can restore it on failure.
 *   3. Rewrite the profile key inside commands.validationProfiles and write
 *      the new YAML. Schema validation happens inside writeDocument().
 *   4. Run the existing applyMigration() against the *new* config to rewrite
 *      every matching suggestion/bundle reference. If that throws, restore
 *      project.yml from the snapshot before re-throwing.
 *   5. Write a single audit record stamped kind="rename_profile" with both
 *      the rename metadata and the reference counts.
 *
 * Returns the audit. Never runs validation. Never touches historical
 * validation-result files. Never modifies usage telemetry.
 */
export async function applyRename(input: {
  projectRoot: string;
  config: ProjectConfig;
  fromProfile: string;
  toProfile: string;
  scope?: MigrationScope;
}): Promise<MigrationAuditRecord> {
  const from = (input.fromProfile ?? "").trim();
  const to = (input.toProfile ?? "").trim();
  const meta = validateRenameInputs(from, to, input.config);
  const scope: MigrationScope = input.scope ?? { kind: "recent" };

  // Snapshot project.yml so we can restore on partial failure.
  const { doc, configPath, text: originalYaml } = await readDocument(
    input.projectRoot,
  );

  // Rename the profile key inside commands.validationProfiles. Using
  // YAML.Document directly preserves comments and ordering.
  const fromPath = ["commands", "validationProfiles", from];
  const toPath = ["commands", "validationProfiles", to];
  const fromNode = doc.getIn(fromPath, true);
  if (fromNode === undefined) {
    throw new ValidationProfileRenameError(
      404,
      `Profile "${from}" disappeared from project.yml between validation and apply.`,
    );
  }
  doc.setIn(toPath, fromNode);
  doc.deleteIn(fromPath);

  let configWritten = false;
  try {
    // writeDocument validates against the schema before writing.
    await writeDocument(input.projectRoot, doc);
    configWritten = true;

    // Build a config snapshot that reflects the rename, so applyMigration
    // sees `to` as a known target.
    const profilesAfter = {
      ...(input.config.commands.validationProfiles ?? {}),
    };
    const fromEntry = profilesAfter[from];
    if (fromEntry) {
      profilesAfter[to] = fromEntry;
      delete profilesAfter[from];
    }
    const renamedConfig: ProjectConfig = {
      ...input.config,
      commands: {
        ...input.config.commands,
        validationProfiles: profilesAfter,
      },
    };

    // Reuse applyMigration for the reference rewrite. It writes a
    // migrate_references audit; we overwrite it below with a richer
    // rename_profile audit at the same path, so a single audit describes
    // the operation end-to-end.
    const migration = await applyMigration({
      projectRoot: input.projectRoot,
      config: renamedConfig,
      fromProfile: from,
      toProfile: to,
      scope,
    });

    const audit: MigrationAuditRecord = {
      ...migration,
      kind: "rename_profile",
      renamedProfile: true,
      preservedDescription: meta.description,
      preservedCommandCount: meta.commandCount,
    };
    await ensureDir(migrationsDir(input.projectRoot));
    await writeText(
      path.join(migrationsDir(input.projectRoot), `${migration.id}.json`),
      `${JSON.stringify(audit, null, 2)}\n`,
    );
    return audit;
  } catch (err) {
    if (configWritten) {
      try {
        await writeText(configPath, originalYaml);
      } catch {
        throw new ValidationProfileRenameError(
          500,
          `Rename partially applied: project.yml has been renamed but reference migration failed AND the rollback also failed. Restore project.yml manually. Underlying error: ${(err as Error)?.message ?? String(err)}`,
        );
      }
    }
    throw err;
  }
}

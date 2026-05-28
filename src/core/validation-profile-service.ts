import type { ProjectConfig } from "../project/config-schema.js";

export type ValidationProfileSource =
  | "default"
  | "named"
  | "suggestion"
  | "bundle"
  | "override";

export type ResolvedValidationProfile = {
  /** The profile name used. "default" when falling back to commands.validate. */
  profileName: string;
  /** Where the resolution chose its commands. */
  source: ValidationProfileSource;
  /** The exact command list that will run. May be empty for the default profile. */
  commands: string[];
  /** Optional description text from validationProfiles, when applicable. */
  description: string | null;
};

export type ValidationProfileSummary = {
  /** "default" for the implicit profile, otherwise the configured key. */
  profileName: string;
  source: ValidationProfileSource;
  commands: string[];
  description: string | null;
  /** False when the profile would resolve to zero commands. */
  hasCommands: boolean;
};

export class ValidationProfileError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ValidationProfileError";
  }
}

/**
 * Static, side-effect-free resolver. Takes a parsed ProjectConfig and returns
 * which command list to run.
 *
 * Resolution rules (per the phase brief):
 *   - profileName=null|undefined → default commands.validate (source="default")
 *   - profileName="default"      → same as above
 *   - profileName=<known>        → that named profile (source="named")
 *   - profileName=<missing>      → 404-style error
 *   - selected profile is empty  → 400-style error
 *   - default profile is empty   → returns commands=[] with source="default";
 *                                  callers preserve the existing
 *                                  "no_commands_configured" semantics.
 *
 * `sourceHint` lets callers tag the result with where the *intent* came from
 * (e.g. "suggestion" or "bundle") even when the resolved profile is the same
 * named one — useful for UI/persistence so we can distinguish "the user
 * picked quick" from "the suggestion declared quick".
 */
export function resolveValidationProfile(
  config: ProjectConfig,
  profileName: string | null | undefined,
  sourceHint?: ValidationProfileSource,
): ResolvedValidationProfile {
  const named = profileName?.trim() ?? "";
  if (!named || named === "default") {
    return {
      profileName: "default",
      source: sourceHint ?? "default",
      commands: [...config.commands.validate],
      description: null,
    };
  }
  const profiles = config.commands.validationProfiles ?? {};
  const entry = profiles[named];
  if (!entry) {
    throw new ValidationProfileError(
      404,
      `Validation profile "${named}" is not defined in commands.validationProfiles.`,
    );
  }
  if (!entry.commands || entry.commands.length === 0) {
    throw new ValidationProfileError(
      400,
      `Validation profile "${named}" has no commands. Add at least one entry to commands.validationProfiles.${named}.commands.`,
    );
  }
  return {
    profileName: named,
    source: sourceHint ?? "named",
    commands: [...entry.commands],
    description: entry.description ?? null,
  };
}

/**
 * Friendly listing of the implicit default + every named profile, suitable
 * for the dashboard / CLI / GET /api/validation/profiles endpoint. Never
 * executes anything; never reads files; pure projection over the config.
 */
export function listValidationProfiles(
  config: ProjectConfig,
): ValidationProfileSummary[] {
  const out: ValidationProfileSummary[] = [];
  out.push({
    profileName: "default",
    source: "default",
    commands: [...config.commands.validate],
    description:
      config.commands.validate.length === 0
        ? "No commands.validate configured. Set one with `vibestrate config set commands.validate '[\"<cmd>\"]'`."
        : "Implicit default — uses commands.validate.",
    hasCommands: config.commands.validate.length > 0,
  });
  const named = config.commands.validationProfiles ?? {};
  for (const [name, entry] of Object.entries(named)) {
    out.push({
      profileName: name,
      source: "named",
      commands: [...entry.commands],
      description: entry.description ?? null,
      hasCommands: entry.commands.length > 0,
    });
  }
  return out;
}

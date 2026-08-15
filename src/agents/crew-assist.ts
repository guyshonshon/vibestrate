// ── Crew assist: describe a crew in English, get an editable draft ───────────
//
// The Crew half of supervisor-assisted authoring, on the same seam as
// `flow-assist.ts`: one `runAssist` call, a Zod-validated result, and NOTHING
// written. A drafted crew is two artifacts - the `crews.<id>` block that lands
// in the committed `project.yml`, and one JSON role file per role - so the
// checks the schemas cannot express (profile ids, permission ids, one role per
// seat, a role file that already exists or is not written yet) are reported as
// `problems` rather than silently accepted.
//
// The drafter AUTHORS each role's instructions. The model returns `promptText`
// and never a path: the role file's location, its id, and the `prompt` pointer
// in the crew block are all derived here, so a role and its file cannot disagree
// and the model cannot aim a role at a file it did not write.
//
// SECURITY INVARIANTS (do not weaken):
//   1. NO WRITE, AND NO WRITER IN SCOPE. Nothing here touches `project.yml` or
//      the roles directory. Installing a drafted crew is a separate, explicit
//      owner action.
//   2. REDACTION BEFORE THE MODEL. `runAssist` redacts the whole assembled
//      prompt and is the single funnel for it. A second call here would only
//      cover the description, and a test pinned to it would pass with the real
//      guard deleted.
//   3. REFUSE, NEVER REDACT, ON THE WAY BACK. Scanned over the crew block AND
//      every role file, because a role's instructions are model-authored free
//      text and all of it would be committed.
//   4. NO OUTBOUND NETWORK CALL. Vibestrate opens no socket. A draft that leans
//      on a fact which changes over time is the AGENT's job to check with its
//      own tools; what it could not check comes back in `currency.unverified`.

import path from "node:path";
import { z } from "zod";
import YAML from "yaml";
import { VibestrateError } from "../utils/errors.js";
import { runAssist, type AssistProviderRunner } from "../core/assist/assist-runner.js";
import { scanTextForSecrets } from "../core/diff-service.js";
import { loadConfig } from "../project/config-loader.js";
import { pathExists, readDirSafe } from "../utils/fs.js";
import { projectRolesDir, ROLES_DIRNAME, VIBESTRATE_DIR } from "../utils/paths.js";
import { buildProjectRoots, resolveSafePath, PathGuardError } from "../core/path-guard.js";
import { builtinPermissionProfiles } from "../safety/permission-profiles.js";
import {
  crewRoleConfigSchema,
  parseRoleFile,
  seatTokenSchema,
  ROLE_FILE_SCHEMA_VERSION,
} from "./role-schema.js";
import { crewConfigSchema, type CrewConfig } from "./crew-schema.js";
// One definition of the currency contract, shared with the Flow drafter so both
// surfaces report "what I checked / what I could not" identically.
import { currencySchema } from "../flows/authoring/flow-assist.js";

export class CrewAssistError extends VibestrateError {
  constructor(message: string, cause?: unknown) {
    super("CREW_ASSIST_ERROR", message, cause);
    this.name = "CrewAssistError";
  }
}

const AUDIT_BUCKET = "crew-assist";

/** Same bound as the Flow drafter - one owner-typed description. */
const MAX_DESCRIPTION = 1_000;

/** A rejected draft comes back with the schema's own issues; a crew has enough
 *  per-role required fields that one retry is thin. */
const MAX_ATTEMPTS = 3;

/** A roster larger than this is not a crew, it is a misunderstanding. */
const MAX_ROLES = 12;

/** Bound on ONE role's drafted instructions. `roleFileSchema` deliberately
 *  leaves the stored text unbounded (a hand-written role may be long); this is
 *  the drafting-input bound, so a runaway generation cannot become a draft the
 *  owner has to scroll through to review. */
const MAX_PROMPT_CHARS = 20_000;

/**
 * One role as the MODEL returns it: the crew-scoped wiring from the real role
 * schema, minus the `prompt` pointer, plus the instructions themselves. Omitting
 * `prompt` is the fix for the whole bug class - the model cannot name a file,
 * so it cannot name a stale one.
 *
 * `mcpServers` is omitted for the same reason, one step further: an entry there
 * carries a `command` and `args` the provider CLI later spawns, and the review
 * surface does not render it - the owner would be approving a subprocess they
 * were never shown. Wiring MCP onto a role stays a deliberate config edit.
 */
const draftedRoleSchema = crewRoleConfigSchema.omit({ prompt: true, mcpServers: true }).extend({
  promptText: z
    .string()
    .min(1, "Write the role's instructions here; this is the text, not a file name.")
    .max(MAX_PROMPT_CHARS),
});

/**
 * The drafted crew as the MODEL returns it: the real crew schema with its roles
 * swapped for drafted ones, so every other crew-level key (label, review-loop
 * overrides) stays in sync with the schema for free.
 */
const draftedCrewSchema = crewConfigSchema.omit({ roles: true }).extend({
  roles: z
    .record(seatTokenSchema, draftedRoleSchema)
    .refine((roles) => Object.keys(roles).length > 0, "A crew needs at least one role.")
    .refine(
      (roles) => Object.keys(roles).length <= MAX_ROLES,
      `A crew takes at most ${MAX_ROLES} roles.`,
    ),
});

const crewDraftAssistSchema = z
  .object({
    crewId: z
      .string()
      .min(1)
      .max(60)
      .regex(/^[a-z][a-z0-9-]*$/, "Crew ids must use lowercase letters, digits, and dashes."),
    crew: draftedCrewSchema,
    rationale: z.string().min(1).max(1_200),
    currency: currencySchema,
  })
  .strict();

/** One role file the owner saves, byte-for-byte as it would land on disk. */
export type DraftedRoleFile = {
  roleId: string;
  /** Project-relative: `.vibestrate/roles/<roleId>.json`. */
  path: string;
  /** The file's contents - `{schemaVersion, id, prompt}` with the prompt text. */
  json: string;
};

export type CrewDraft = {
  crewId: string;
  /** The `crews.<id>` block. Each role's `prompt` points at its drafted file. */
  crew: CrewConfig;
  /** The `crews.<id>` block as YAML, for review and copy. */
  yaml: string;
  /** One file per role, carrying that role's instructions as text. */
  roleFiles: DraftedRoleFile[];
  rationale: string;
  currency: { checked: string[]; unverified: string[] };
  /** Everything standing between this draft and a crew that runs: what is
   *  wrong (an unknown profile or permission id, two roles on one seat) and
   *  what is still to write (the role files, absent on every fresh draft).
   *  See `findCrewProblems` - an empty list means nothing is left to do. */
  problems: string[];
  /** A crew with this id already exists in the project config. */
  exists: boolean;
};

const CREW_DRAFT_SCHEMA_HINT =
  '{ "crewId": "kebab-id", ' +
  '"crew": { "label": "...", "roles": { "planner": { "label": "Planner", ' +
  '"seats": ["planner"], "profile": "<an existing profile id>", ' +
  '"permissions": "read_only", "skills": [], ' +
  '"promptText": "You turn a loose request into a short, ordered plan.\\n\\n' +
  'Read the code the request touches before you propose anything.\\n\\n' +
  'You do not edit files. You hand back the plan and the risks you found." } } }, ' +
  '"rationale": "why this roster", ' +
  '"currency": { "checked": ["claim - source"], "unverified": ["claim you could not check"] } }';

const CREW_DRAFT_GUIDANCE = `
You are drafting a Vibestrate Crew: the roster of Roles a run draws on. This is a
SUGGESTION the owner reviews and explicitly saves. You are not creating anything.

WHAT A CREW IS
A Crew is a roster of Roles. Each role names the SEATS it can fill, a profile id,
a permissions id, and its instructions. Flows name seats, never role ids - that is
what keeps a flow shareable.

YOU WRITE EACH ROLE'S INSTRUCTIONS, AS TEXT
"promptText" holds the instructions themselves. It is NOT a file path, NOT a file
name, and NOT a reference to anything on disk. Vibestrate saves the text you
write into that role's own file and wires the pointer up for you, so never emit a
path anywhere in this response. Write each role's instructions yourself:
- Address the role directly ("You review the diff...").
- Say what it produces, what it must not touch, and what it hands back.
- Roughly 100-400 words. Plain prose or short headed sections; newlines are
  written as \\n inside the JSON string.
- Make it specific to THIS crew's job, not a generic job description.

RULES
- Use ONLY profile ids and permissions ids that already exist in this project;
  they are listed below. Do not invent one.
- Exactly one role per seat: two roles filling the same seat makes the flow
  ambiguous and the run refuses to start.
- Seat names come from this list: planner, architect, implementer, executor,
  builder, fixer, reviewer, challenger, verifier, arbiter. A role may fill
  several. Cover at least planner, implementer and reviewer unless the owner
  asked for something narrower.
- Only give a role write permissions when it actually writes code (the
  implementer and fixer seats). Everything else is read-only.
- Role ids and the crew id are lowercase-dash tokens. Each role id becomes the
  name of that role's file, so pick a fresh one unless you mean to replace a
  role this project already defines.

CURRENT FACTS - read this before you write anything
Vibestrate itself makes no outbound network call. If this draft depends on a
fact that changes over time - a model name, a provider's current options, a
tool's version - then:
 - If you have a web search or fetch tool available, USE IT, and list each claim
   you confirmed in "currency.checked" as "<claim> - <source>".
 - If you have NO such tool, do NOT answer from memory. Choose the conservative
   option that does not depend on the fact, and list the claim you could not
   check in "currency.unverified", phrased so the owner knows exactly what to
   confirm. For example: "assumed the profile's model is current; could not
   check what this provider serves today".
An empty "currency" is correct only when nothing in the draft depends on a
current fact. Stating an unverified assumption is always better than guessing.

You may read files and search to ground the draft. You may NOT write files, run
commands, or take any other action. Return structured data only.
`.trim();

/**
 * Turn one English description into an editable Crew draft. NO WRITE: the
 * returned draft carries the crew block, every role file, and every problem the
 * owner must fix before installing it.
 */
export async function draftCrewFromDescription(input: {
  projectRoot: string;
  description: string;
  /** Test seam - defaults to the real provider runner. */
  runner?: AssistProviderRunner;
}): Promise<{ draft: CrewDraft }> {
  const description = input.description.trim();
  if (!description) throw new CrewAssistError("A description is required.");
  if (description.length > MAX_DESCRIPTION) {
    throw new CrewAssistError(`Description exceeds ${MAX_DESCRIPTION} characters.`);
  }
  const loaded = await loadConfig(input.projectRoot);
  const profileIds = Object.keys(loaded.config.profiles).sort();
  const permissionIds = permissionProfileIds(loaded.config.permissions.profiles);
  const existingRoleIds = (await readDirSafe(projectRolesDir(input.projectRoot)))
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.basename(f, ".json"))
    .sort();
  const crewIds = Object.keys(loaded.config.crews).sort();

  const instruction =
    CREW_DRAFT_GUIDANCE +
    "\n\nExisting profile ids: " +
    (profileIds.join(", ") || "none") +
    "\nExisting permissions ids: " +
    (permissionIds.join(", ") || "none") +
    "\nRole ids this project already defines (reusing one replaces its file): " +
    (existingRoleIds.join(", ") || "none") +
    "\nCrew ids already taken (pick a different one): " +
    (crewIds.join(", ") || "none") +
    "\n\nThe owner describes the crew they want:\n" +
    // Raw here on purpose: runAssist redacts the assembled prompt (INVARIANT 2).
    `"""${description}"""\n\n` +
    "Produce ONE crew definition capturing it.";

  const res = await runAssist({
    projectRoot: input.projectRoot,
    loaded,
    label: "crew-draft",
    instruction,
    schema: crewDraftAssistSchema,
    schemaHint: CREW_DRAFT_SCHEMA_HINT,
    auditBucket: AUDIT_BUCKET,
    maxAttempts: MAX_ATTEMPTS,
    runner: input.runner,
  });

  const { crewId, crew: drafted } = res.parsed;
  const { roles: draftedRoles, ...crewFields } = drafted;

  // Compose the two real artifacts from the model's substance. Both go through
  // the schema that reads them back - `crewConfigSchema` for the block, and
  // `parseRoleFile` for each file, which is the same funnel the loader uses -
  // so "it drafted" and "it loads" cannot disagree.
  let crew: CrewConfig;
  const roleFiles: DraftedRoleFile[] = [];
  try {
    crew = crewConfigSchema.parse({
      ...crewFields,
      roles: Object.fromEntries(
        Object.entries(draftedRoles).map(([roleId, { promptText: _text, ...role }]) => [
          roleId,
          { ...role, prompt: roleFileRelPath(roleId) },
        ]),
      ),
    });
    for (const [roleId, role] of Object.entries(draftedRoles)) {
      const relPath = roleFileRelPath(roleId);
      const json = `${JSON.stringify(
        { schemaVersion: ROLE_FILE_SCHEMA_VERSION, id: roleId, prompt: role.promptText },
        null,
        2,
      )}\n`;
      parseRoleFile(json, relPath);
      roleFiles.push({ roleId, path: relPath, json });
    }
  } catch (err) {
    throw new CrewAssistError(
      `Refusing to return this drafted crew: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  const yaml = YAML.stringify({ [crewId]: crew });
  // INVARIANT 3: refuse, never redact - all of this would be committed, and a
  // role's instructions are model-authored free text that never appears in the
  // crew block, so scanning only the YAML would miss it.
  const secrets = [yaml, ...roleFiles.map((f) => f.json)].flatMap((text) =>
    scanTextForSecrets(text),
  );
  if (secrets.length > 0) {
    throw new CrewAssistError(
      "Refusing to return this drafted crew: " +
        secrets
          .map((m) => `it looks like a secret (${m.pattern}): ${m.redactedSnippet}`)
          .join(" "),
    );
  }

  return {
    draft: {
      crewId,
      crew,
      yaml,
      roleFiles,
      rationale: res.parsed.rationale,
      currency: res.parsed.currency,
      problems: await findCrewProblems({
        projectRoot: input.projectRoot,
        crew,
        profileIds,
        permissionIds,
      }),
      exists: Object.hasOwn(loaded.config.crews, crewId),
    },
  };
}

/** Where a role id's file goes, as the project-relative value that lands in
 *  `project.yml`. The one place a role file path is built.
 *
 *  Spelled with `/`, and composed rather than derived from `path.relative`:
 *  this string is committed and read on every platform, so a Windows draft
 *  would otherwise write `.vibestrate\roles\x.json` into the config and resolve
 *  to nothing on a teammate's machine. Node accepts `/` on Windows. */
function roleFileRelPath(roleId: string): string {
  return path.posix.join(VIBESTRATE_DIR, ROLES_DIRNAME, `${roleId}.json`);
}

/** Configured permission profiles plus the built-in ids, which
 *  `resolveProfile` accepts without them appearing in the config. */
function permissionProfileIds(configured: Record<string, unknown>): string[] {
  return [
    ...new Set([...Object.keys(configured), ...Object.keys(builtinPermissionProfiles)]),
  ].sort();
}

/**
 * Everything standing between this draft and a crew that runs. Two kinds, and
 * the wording keeps them apart:
 *   - something is WRONG - an unknown profile or permission id, a path that
 *     escapes the project, two roles on one seat. The schemas cross-validate
 *     none of it, and they cannot see the filesystem.
 *   - something is STILL TO WRITE - the role files. A drafted crew is two
 *     artifacts and only one of them is the config block, so on a fresh draft
 *     every role file is absent by definition. Reporting only the files that
 *     already exist let the broken case - a crew whose roles all point at
 *     nothing - come back as "no problems found", and the first run then dies
 *     in `loadRolePrompt` with "Role file not found".
 *
 * Reported, not thrown - the draft stays editable, and an owner who wants a
 * role on a profile they are about to add should see the whole roster, not a
 * bare error.
 */
async function findCrewProblems(input: {
  projectRoot: string;
  crew: CrewConfig;
  profileIds: string[];
  permissionIds: string[];
}): Promise<string[]> {
  const problems: string[] = [];
  const roots = buildProjectRoots({ projectRoot: input.projectRoot });
  const seatOwners = new Map<string, string[]>();
  const unwritten: string[] = [];

  for (const [roleId, role] of Object.entries(input.crew.roles)) {
    if (!input.profileIds.includes(role.profile)) {
      problems.push(
        `Role "${roleId}" runs on profile "${role.profile}", which this project does not define (have: ${input.profileIds.join(", ") || "none"}).`,
      );
    }
    if (!input.permissionIds.includes(role.permissions)) {
      problems.push(
        `Role "${roleId}" uses permission profile "${role.permissions}", which this project does not define (have: ${input.permissionIds.join(", ")}).`,
      );
    }
    for (const seat of role.seats) {
      seatOwners.set(seat, [...(seatOwners.get(seat) ?? []), roleId]);
    }

    // The role id becomes a filename, so the derived path is guarded like any
    // other path the model influences - the id token already rejects traversal,
    // and this is what keeps that true if the token is ever loosened.
    let absPath: string | null = null;
    try {
      absPath = (await resolveSafePath(role.prompt, roots)).absolutePath;
    } catch (err) {
      if (!(err instanceof PathGuardError)) throw err;
      problems.push(
        `Role "${roleId}" would be saved outside the project: ${role.prompt} (${err.message})`,
      );
    }
    if (absPath) {
      if (await pathExists(absPath)) {
        // Drafting writes nothing, but installing this crew would - and the file
        // already there is the owner's, not ours.
        problems.push(
          `Role "${roleId}" already exists at ${role.prompt}; saving this draft would replace it.`,
        );
      } else {
        unwritten.push(role.prompt);
      }
    }
  }

  for (const [seat, roleIds] of seatOwners) {
    if (roleIds.length > 1) {
      problems.push(
        `Seat "${seat}" is filled by more than one role (${roleIds.join(", ")}); a run refuses to start on an ambiguous seat.`,
      );
    }
  }

  // Last, and phrased as work rather than a defect: on a clean draft this is
  // the only entry, and it is the step the owner skips if nothing says it.
  // Names the files instead of counting them, so a partly-written roster
  // reports exactly which ones are still missing.
  if (unwritten.length > 0) {
    problems.push(
      `Still to write: ${unwritten.join(", ")}. The draft carries each file's contents - save them before the crew block, or the first run stops at "Role file not found".`,
    );
  }
  return problems;
}

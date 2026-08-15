// ── Crew assist: draft a crew from a description, or revise the one you hold ──
//
// The Crew half of supervisor-assisted authoring, on the same seam as
// `flow-assist.ts`: one `runAssist` call, a Zod-validated result, and NOTHING
// written. A crew is two artifacts - the `crews.<id>` block that lands in the
// committed `project.yml`, and one JSON role file per role - so the checks the
// schemas cannot express (profile ids, permission ids, one role per seat, a
// role file that already exists or is not written yet) are reported as
// `problems` rather than silently accepted.
//
// Two entry points, and the difference is what the owner is holding:
//   - `draftCrewFromDescription` - nothing yet. A description in, a whole crew
//     out.
//   - `reviseCrewFromInstruction` - a crew they are editing. That crew plus an
//     instruction in, a PROPOSED REVISION of the same crew out, which they
//     accept or reject. A whole roster comes back rather than a patch, so a
//     role the revision omits is a removal and is named as one.
// An instruction that turns out to be a question ("why is the architect seat
// uncovered?") is answered with no revision at all. That is a success.
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
// Seat coverage is COMPUTED, never model-claimed: which seats this project's
// flows ask for comes from the flow catalog, and who takes them comes from the
// same function the Flows surface uses, so a crew and a flow can never disagree
// about whether a seat is filled. Both modules are read-only.
import { discoverFlowCatalog } from "../flows/catalog/flow-discovery.js";
import {
  computeFlowSeatCoverage,
  type SeatCoverageStatus,
} from "../flows/runtime/seat-coverage.js";

export class CrewAssistError extends VibestrateError {
  constructor(message: string, cause?: unknown) {
    super("CREW_ASSIST_ERROR", message, cause);
    this.name = "CrewAssistError";
  }
}

const AUDIT_BUCKET = "crew-assist";

/** Same bound as the Flow drafter - one owner-typed description. */
const MAX_DESCRIPTION = 1_000;

/** One owner-typed instruction to the assistant ("add a second reviewer").
 *  Bounded the same way a description is, and checked before a provider is
 *  resolved. */
const MAX_INSTRUCTION = 1_000;

/** The assistant answers in prose whether or not it changes anything, so this
 *  bound covers the answer to a question as well as the note on a revision. */
const MAX_ANSWER = 2_000;

/** A crew id is a lowercase-dash token: it is a YAML key in the committed
 *  config and the assistant is told to produce one. */
const CREW_ID_RE = /^[a-z][a-z0-9-]*$/;

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

/** A crew in the shape the assistant reads and writes: role wiring plus each
 *  role's instructions as text. The editor round-trips this one shape in both
 *  directions, so a revision's input and output cannot drift apart. */
export type DraftedCrew = z.infer<typeof draftedCrewSchema>;

const crewDraftAssistSchema = z
  .object({
    crewId: z
      .string()
      .min(1)
      .max(60)
      .regex(CREW_ID_RE, "Crew ids must use lowercase letters, digits, and dashes."),
    crew: draftedCrewSchema,
    rationale: z.string().min(1).max(1_200),
    currency: currencySchema,
  })
  .strict();

/**
 * The revision assistant's output. No `crewId`: a revision edits the crew the
 * owner is holding, and renaming one moves its key in `project.yml` and orphans
 * every reference to it - a different, riskier operation than editing it.
 */
const crewRevisionAssistSchema = z
  .object({
    answer: z.string().min(1).max(MAX_ANSWER),
    /**
     * Nullable, and required. `null` means the instruction was a question and
     * nothing needs to change, which is a correct outcome. An ABSENT key is
     * not: a model that meant to revise and mangled this field would otherwise
     * come back as a confident answer with nothing behind it, so omitting it
     * is a Zod issue and gets re-prompted.
     */
    crew: draftedCrewSchema.nullable(),
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

// The blocks below are shared by the drafter and the reviser. Held once because
// the two that must never drift apart are exactly here: the rule that a role's
// instructions are TEXT and never a path, and the currency contract both
// surfaces report under.
const CREW_SHAPE_RULE = `
WHAT A CREW IS
A Crew is a roster of Roles. Each role names the SEATS it can fill, a profile id,
a permissions id, and its instructions. Flows name seats, never role ids - that is
what keeps a flow shareable.
`.trim();

const ROLE_INSTRUCTIONS_RULE = `
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
`.trim();

const CURRENT_FACTS_RULE = `
CURRENT FACTS - read this before you write anything
Vibestrate itself makes no outbound network call. If what you return depends on a
fact that changes over time - a model name, a provider's current options, a
tool's version - then:
 - If you have a web search or fetch tool available, USE IT, and list each claim
   you confirmed in "currency.checked" as "<claim> - <source>".
 - If you have NO such tool, do NOT answer from memory. Choose the conservative
   option that does not depend on the fact, and list the claim you could not
   check in "currency.unverified", phrased so the owner knows exactly what to
   confirm. For example: "assumed the profile's model is current; could not
   check what this provider serves today".
An empty "currency" is correct only when nothing you return depends on a current
fact. Stating an unverified assumption is always better than guessing.
`.trim();

const READ_ONLY_CLOSING = `
You may read files and search to ground your answer. You may NOT write files, run
commands, or take any other action. Return structured data only.
`.trim();

const CREW_DRAFT_GUIDANCE = [
  `You are drafting a Vibestrate Crew: the roster of Roles a run draws on. This is a
SUGGESTION the owner reviews and explicitly saves. You are not creating anything.`,
  CREW_SHAPE_RULE,
  ROLE_INSTRUCTIONS_RULE,
  `RULES
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
  role this project already defines.`,
  CURRENT_FACTS_RULE,
  READ_ONLY_CLOSING,
].join("\n\n");

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

  const { crewId } = res.parsed;
  const refusal = "Refusing to return this drafted crew";
  const { crew, roleFiles } = composeCrewArtifacts(res.parsed.crew, refusal);
  const yaml = YAML.stringify({ [crewId]: crew });
  assertNoSecrets([yaml, ...roleFiles.map((f) => f.json)], refusal);

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
        // Every role file in a fresh draft is this draft's doing.
        carriedRoleIds: [],
      }),
      exists: Object.hasOwn(loaded.config.crews, crewId),
    },
  };
}

/**
 * Compose the two real artifacts from the model's substance. Both go through
 * the schema that reads them back - `crewConfigSchema` for the block, and
 * `parseRoleFile` for each file, which is the same funnel the loader uses - so
 * "it drafted" and "it loads" cannot disagree.
 *
 * `refusal` leads the message because this runs on the way OUT of a draft, on
 * the way out of a revision, and on the way IN from an editor, and the owner
 * needs to know which of the three was rejected.
 */
function composeCrewArtifacts(
  drafted: DraftedCrew,
  refusal: string,
): { crew: CrewConfig; roleFiles: DraftedRoleFile[] } {
  const { roles: draftedRoles, ...crewFields } = drafted;
  const roleFiles: DraftedRoleFile[] = [];
  try {
    const crew = crewConfigSchema.parse({
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
    return { crew, roleFiles };
  } catch (err) {
    throw new CrewAssistError(
      `${refusal}: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }
}

/** INVARIANT 3: refuse, never redact - all of this would be committed, and a
 *  role's instructions are model-authored free text that never appears in the
 *  crew block, so scanning only the YAML would miss it. */
function assertNoSecrets(texts: string[], refusal: string): void {
  const secrets = texts.flatMap((text) => scanTextForSecrets(text));
  if (secrets.length === 0) return;
  throw new CrewAssistError(
    `${refusal}: ` +
      secrets
        .map((m) => `it looks like a secret (${m.pattern}): ${m.redactedSnippet}`)
        .join(" "),
  );
}

// ── Revise: the crew you are holding, plus one instruction ───────────────────

/** One seat a flow in this project asks for, and who in the crew takes it. */
export type CrewSeatFill = {
  seatId: string;
  /** Flows whose steps use this seat. */
  flowIds: string[];
  /** Roles in this crew that can take it. */
  roleIds: string[];
  /** `gap` = no role takes it, `ambiguous` = more than one does and a run
   *  refuses to start on it. The vocabulary a Flow's own coverage reports. */
  status: SeatCoverageStatus;
};

/**
 * What this crew can and cannot staff, COMPUTED - the seats come from the flow
 * catalog and the fills from the same function the Flows surface uses, so the
 * model never gets to claim a seat is covered.
 */
export type CrewCoverage = {
  /** One entry per seat some flow's step uses, in seat-id order. A seat a flow
   *  declares but never uses cannot block a run, so it is not here. */
  seats: CrewSeatFill[];
  /** Seats a role claims that no flow asks for: that role never runs on them,
   *  and the usual cause is a near-miss on a seat name. */
  idleRoleSeats: string[];
};

export type CrewRevision = {
  crewId: string;
  /**
   * The revised roster in the SAME shape it was sent in: role wiring plus each
   * role's instructions as text, whole rather than a patch. One shape both
   * directions means the editor applies it role by role and can hand it
   * straight back as the next revision's input.
   *
   * It has still been composed through `crewConfigSchema` and `parseRoleFile`
   * on the way out, so a revision that could not be loaded never reaches here -
   * the composed artifacts are just not what an editor needs.
   */
  crew: DraftedCrew;
  /** Roles this revision introduces. */
  addedRoleIds: string[];
  /** Roles it drops: in the crew that was sent, absent from the roster that
   *  came back. A whole-roster revision makes absence the only way to remove a
   *  role, and whoever applies it cannot tell a removal from an oversight
   *  unless it is named. */
  removedRoleIds: string[];
  /** Coverage of the REVISED roster - the "after" to the result's "before". */
  coverage: CrewCoverage;
  /** What the schemas cannot check, for what this revision introduces. See
   *  `findCrewProblems`. */
  problems: string[];
};

export type CrewRevisionResult = {
  /** Null when the instruction was a question and nothing needs to change.
   *  An answer with nothing to apply is a success, not a failure. */
  revision: CrewRevision | null;
  /** What changed and why, or the answer to the question. Always present. */
  answer: string;
  currency: { checked: string[]; unverified: string[] };
  /** Coverage of the crew as it was SENT, so a question about the crew the
   *  owner is holding is answerable with no revision to point at. */
  coverage: CrewCoverage;
};

const CREW_REVISE_SCHEMA_HINT =
  '{ "answer": "what you changed and why, or the answer to the question", ' +
  '"crew": { "label": "...", "roles": { "reviewer": { "label": "Reviewer", ' +
  '"seats": ["reviewer"], "profile": "<an existing profile id>", ' +
  '"permissions": "read_only", "skills": [], ' +
  '"promptText": "You review the diff against the plan.\\n\\n' +
  'Name every problem you find and where it is.\\n\\n' +
  'You do not edit files. You hand back findings and a verdict." } } }, ' +
  '"currency": { "checked": ["claim - source"], "unverified": ["claim you could not check"] } }' +
  '\nThe "crew" key is always required. Set it to null when the instruction was a ' +
  "question and nothing needs to change.";

const CREW_REVISE_GUIDANCE = [
  `You are the supervisor helping the owner edit a Vibestrate Crew they have open in
an editor. Nothing you return is saved: the owner sees what would change, then
accepts or rejects it.`,
  CREW_SHAPE_RULE,
  `WHAT TO RETURN
- "answer" is always required. Say what you changed and why, in the owner's own
  terms. If the instruction was a QUESTION and nothing needs to change, answer it
  and set "crew" to null. An answer with no edit is a correct outcome; inventing
  an edit so you have something to return is not.
- "crew" is the WHOLE revised roster, not a patch. Carry every role and every
  field you were NOT asked to change through exactly as you received it,
  instructions included - whatever you leave out, the owner loses. Leaving a role
  out is how you REMOVE it, so do that only when removing it is the ask.
- Change the least that satisfies the instruction.`,
  ROLE_INSTRUCTIONS_RULE,
  `RULES
- Use ONLY profile ids and permissions ids that already exist in this project;
  they are listed below. Do not invent one.
- Exactly one role per seat: two roles filling the same seat makes the flow
  ambiguous and the run refuses to start.
- A seat only matters if a flow asks for it. The seats this project's flows use,
  and who takes them today, are listed below; use those names.
- Only give a role write permissions when it actually writes code (the
  implementer and fixer seats). Everything else is read-only.
- A role id is a lowercase-dash token and becomes the name of that role's file.
  Keep the id of a role you are only editing - a different id means a different
  role and a new file.`,
  CURRENT_FACTS_RULE,
  READ_ONLY_CLOSING,
].join("\n\n");

/**
 * Turn the crew the owner is editing plus one instruction into a PROPOSED
 * revision of that same crew - or, when the instruction was a question, into an
 * answer with no revision at all.
 *
 * NO WRITE, exactly as the drafter: the result is a suggestion, and the editor's
 * own broker-gated save path stays the only thing that touches disk.
 */
export async function reviseCrewFromInstruction(input: {
  projectRoot: string;
  /** The crew being edited. Its id is kept - a revision edits a crew, it does
   *  not rename one. */
  crewId: string;
  /** That crew in the drafted shape: role wiring plus each role's instructions
   *  as text. Parsed here rather than by the caller, so the shape the assistant
   *  reads and the shape it returns have one owner. */
  crew: unknown;
  /** What the owner asked for: "add a second reviewer", "make this cheaper",
   *  "why is the architect seat uncovered?". */
  instruction: string;
  /** Test seam - defaults to the real provider runner. */
  runner?: AssistProviderRunner;
}): Promise<CrewRevisionResult> {
  const ask = input.instruction.trim();
  if (!ask) throw new CrewAssistError("An instruction is required.");
  if (ask.length > MAX_INSTRUCTION) {
    throw new CrewAssistError(`Instruction exceeds ${MAX_INSTRUCTION} characters.`);
  }
  if (!CREW_ID_RE.test(input.crewId)) {
    throw new CrewAssistError(
      `"${input.crewId}" is not a crew id (lowercase letters, digits, and dashes).`,
    );
  }
  const submitted = draftedCrewSchema.safeParse(input.crew);
  if (!submitted.success) {
    throw new CrewAssistError(
      "The crew being edited is not a shape the assistant can read:\n" +
        submitted.error.issues
          .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("\n"),
    );
  }
  const current = submitted.data;

  const loaded = await loadConfig(input.projectRoot);
  const profileIds = Object.keys(loaded.config.profiles).sort();
  const permissionIds = permissionProfileIds(loaded.config.permissions.profiles);
  // Compose the crew being edited before spending a provider call: an editor
  // state that could never be saved is bad input, and finding that out after
  // the model has answered wastes the spawn.
  const { crew: currentCrew } = composeCrewArtifacts(
    current,
    "The crew being edited cannot be read",
  );
  const coverage = await computeCrewCoverage({
    projectRoot: input.projectRoot,
    crewId: input.crewId,
    crew: currentCrew,
  });

  const instruction =
    CREW_REVISE_GUIDANCE +
    "\n\nExisting profile ids: " +
    (profileIds.join(", ") || "none") +
    "\nExisting permissions ids: " +
    (permissionIds.join(", ") || "none") +
    "\n\nSeats this project's flows ask for, and who takes them in the crew as it stands:\n" +
    renderCoverage(coverage) +
    `\n\nThe crew "${input.crewId}" as the owner is holding it, in exactly the shape you must return:\n` +
    // Raw here on purpose: runAssist redacts the assembled prompt (INVARIANT 2).
    JSON.stringify(current, null, 2) +
    "\n\nThe owner asks:\n" +
    `"""${ask}"""\n\n` +
    "Answer them, and return the revised crew - or null, if nothing needs to change.";

  const res = await runAssist({
    projectRoot: input.projectRoot,
    loaded,
    label: "crew-revise",
    instruction,
    schema: crewRevisionAssistSchema,
    schemaHint: CREW_REVISE_SCHEMA_HINT,
    auditBucket: AUDIT_BUCKET,
    maxAttempts: MAX_ATTEMPTS,
    runner: input.runner,
  });

  const { answer, currency } = res.parsed;
  if (res.parsed.crew === null) {
    return { revision: null, answer, currency, coverage };
  }

  const refusal = "Refusing to return this revised crew";
  const { crew, roleFiles } = composeCrewArtifacts(res.parsed.crew, refusal);
  // Scanned over the same rendering the drafter scans, even though a revision
  // is applied field by field rather than pasted: a secret in a label or a
  // profile id appears in the block and in no role file.
  assertNoSecrets(
    [YAML.stringify({ [input.crewId]: crew }), ...roleFiles.map((f) => f.json)],
    refusal,
  );

  const currentRoleIds = Object.keys(current.roles);
  const revisedRoleIds = Object.keys(crew.roles);

  return {
    revision: {
      crewId: input.crewId,
      crew: res.parsed.crew,
      addedRoleIds: revisedRoleIds.filter((id) => !currentRoleIds.includes(id)).sort(),
      removedRoleIds: currentRoleIds.filter((id) => !revisedRoleIds.includes(id)).sort(),
      coverage: await computeCrewCoverage({
        projectRoot: input.projectRoot,
        crewId: input.crewId,
        crew,
      }),
      problems: await findCrewProblems({
        projectRoot: input.projectRoot,
        crew,
        profileIds,
        permissionIds,
        // The role files of a role the owner already had are the editor's
        // business, not this revision's. Only what the revision INTRODUCES is
        // reported, so a crew that is already on disk does not come back
        // described as a pile of replacements.
        carriedRoleIds: currentRoleIds,
      }),
    },
    answer,
    currency,
    coverage,
  };
}

/**
 * Which seats this project's flows actually ask for, and who in this crew takes
 * them. Per-flow computation is `computeFlowSeatCoverage`, the same function the
 * Flows surface uses, so a seat cannot read as filled here and as a gap there.
 *
 * The fill of a seat depends only on the crew, so the first flow to ask for a
 * seat decides `roleIds`/`status` and every later one only adds its id.
 */
async function computeCrewCoverage(input: {
  projectRoot: string;
  crewId: string;
  crew: CrewConfig;
}): Promise<CrewCoverage> {
  // The unfiltered catalog: a flow hidden from the pickers still launches by id
  // and still needs its seats crewed, so hiding it here would hide a real gap.
  const { flows } = await discoverFlowCatalog(input.projectRoot);
  const bySeat = new Map<string, CrewSeatFill>();
  for (const flow of flows) {
    const flowCoverage = computeFlowSeatCoverage({
      flow: flow.definition,
      crew: input.crew,
      crewId: input.crewId,
    });
    for (const seat of flowCoverage.seats) {
      if (!seat.usedByStep) continue;
      const seen = bySeat.get(seat.seatId);
      if (seen) {
        seen.flowIds.push(flow.id);
        continue;
      }
      bySeat.set(seat.seatId, {
        seatId: seat.seatId,
        flowIds: [flow.id],
        roleIds: seat.candidateRoleIds,
        status: seat.status,
      });
    }
  }
  const seats = [...bySeat.values()].sort((a, b) => a.seatId.localeCompare(b.seatId));
  for (const seat of seats) seat.flowIds.sort();
  const asked = new Set(seats.map((s) => s.seatId));
  const idleRoleSeats = [
    ...new Set(Object.values(input.crew.roles).flatMap((role) => role.seats)),
  ]
    .filter((seat) => !asked.has(seat))
    .sort();
  return { seats, idleRoleSeats };
}

/** Coverage as the model reads it. One line per seat, naming the flows that
 *  ask for it so "why is this seat uncovered?" is answerable from the prompt. */
function renderCoverage(coverage: CrewCoverage): string {
  const lines = coverage.seats.map((seat) => {
    const who = seat.roleIds.length === 0 ? "NOBODY TAKES IT" : seat.roleIds.join(", ");
    return `- ${seat.seatId}: ${who} (asked for by ${seat.flowIds.join(", ")})`;
  });
  if (coverage.idleRoleSeats.length > 0) {
    lines.push(
      `Seats a role claims that no flow asks for: ${coverage.idleRoleSeats.join(", ")}`,
    );
  }
  return lines.join("\n") || "No flow in this project asks for a seat.";
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
  /** Roles the caller already had before this suggestion. Their role files are
   *  the caller's own, so neither "already there" nor "still to write" is this
   *  suggestion's doing and neither is reported for them. A fresh draft passes
   *  none; a revision passes the roster it was handed. */
  carriedRoleIds: string[];
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
    if (absPath && !input.carriedRoleIds.includes(roleId)) {
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

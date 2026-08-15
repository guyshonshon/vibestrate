// The one place an edited role file reaches disk: content screens (size,
// control characters, secrets, role-file validity), an Action Broker gate as a
// `file.write`, an atomic write, then an evidence record.
//
// A role's prompt is injected verbatim into every turn that role takes, which
// makes it the most consequential text in a project's config - it is what the
// model is told to be. Putting it behind the same `file.write` gate as flow
// authoring means one policy governs both.
//
// Only the GATE's outcome is audited. The content screens run first and return
// without recording anything, so a prompt refused for a NUL byte or a secret
// leaves no entry: the screens reject input that was never a legitimate write
// request, and feeding every malformed paste into the audit trail would bury
// the policy decisions the trail exists to hold. The same order holds in the
// flow writer.
//
// The broker is constructed here rather than accepted as a parameter, for the
// same reason the flow writer does it (`writeFlowYamlAudited`): an optional
// broker argument is a write that escapes the audit trail the moment a caller
// forgets to pass one.
//
// The caller owns the path guard and hands over an already-resolved absolute
// target; this owns the content screens, the decision, and the bytes. Failure
// is returned as {status, reasons} rather than thrown because the HTTP caller
// maps it straight onto a response - a deny is a 403, not a 500.

import path from "node:path";
import { projectConfigPath } from "../utils/paths.js";
import { writeTextAtomic } from "../utils/fs.js";
import { findControlCharIssue } from "../utils/text-guards.js";
import { scanTextForSecrets } from "../core/diff-service.js";
import {
  createActionBroker,
  gateAction,
  type ActionRequest,
} from "../safety/action-broker.js";
import { parseRoleFile, ROLE_FILE_SCHEMA_VERSION } from "./role-schema.js";

/** Cap on an edited prompt. Instructions run to a few thousand characters;
 *  past this it is a paste accident or an attempt to wedge a provider's
 *  context window on every turn the role takes. */
export const ROLE_PROMPT_MAX_CHARS = 100_000;

/** Audit bucket for role authoring. Editing a role happens outside any run, so
 *  its evidence lands in `runs/roles/actions.ndjson` next to the other run-less
 *  effect sites (`flows`, `manual`, `git-tree`, `supervisor`). Shared with the
 *  role-field writer so a reader finds both halves of one Save in one log. */
export const ROLE_AUDIT_RUN = "roles";

export type RoleWriteError = { ok: false; status: number; reasons: string[] };
export type RoleWriteResult = { ok: true; promptPath: string } | RoleWriteError;

/** The broker request every role-file write is gated and recorded under.
 *
 *  `path` is the role file, where these bytes actually land, so the audit trail
 *  names the file that changed.
 *
 *  `files` names BOTH files one Crew editor Save touches - the role file and
 *  `project.yml` - and the role-field writer presents the same pair. The two
 *  halves of a Save are two requests, and the policy matcher tests a `pathGlob`
 *  against `path` AND every entry of `files`
 *  (`collectPaths`, policies/action-policy-engine.ts), so a rule naming either
 *  file refuses both halves. The halves must not be separable: with only the
 *  landing path presented, a rule scoped to the config refused the field patch
 *  and let the prompt edit through, and a rule scoped to the roles directory
 *  did the reverse - landing the permissions flip while reporting the write was
 *  stopped. */
function roleFileRequest(input: {
  crewId: string;
  roleId: string;
  targetPath: string;
  configPath: string;
}): ActionRequest {
  return {
    runId: ROLE_AUDIT_RUN,
    kind: "file.write",
    subject: {
      path: input.targetPath,
      files: [input.configPath, input.targetPath],
      crewId: input.crewId,
      roleId: input.roleId,
      purpose: "role-prompt",
    },
    // "system": a role edit arrives from the dashboard and (in time) the CLI
    // alike, and this seam cannot tell them apart - so it does not claim to.
    proposedBy: "system",
  };
}

/**
 * Validate, gate, and write one role's instruction text into its JSON role
 * file. `content` is the instruction text alone; the JSON envelope
 * (schemaVersion, id) is built here so no caller can invent a different one.
 */
export async function writeRolePromptAudited(input: {
  projectRoot: string;
  crewId: string;
  roleId: string;
  /** The role's `prompt` value from config. Names the file in every message,
   *  because the absolute path is not the caller's to see. */
  promptPath: string;
  /** Already path-guarded absolute target. */
  targetPath: string;
  content: string;
}): Promise<RoleWriteResult> {
  const { content, promptPath } = input;

  if (content.length > ROLE_PROMPT_MAX_CHARS) {
    return {
      ok: false,
      status: 400,
      reasons: [
        `Prompt is too large (${ROLE_PROMPT_MAX_CHARS / 1000}k character max).`,
      ],
    };
  }

  // A prompt is model- or human-authored text that is replayed into another
  // model's prompt and echoed by the CLI printers, so an escape sequence or a
  // NUL is refused rather than stored. Screened on the text, not on the
  // serialized file: JSON escapes a real ESC on the way out and decodes it back
  // on the way in, so the bytes on disk look clean either way.
  const ctrl = findControlCharIssue(content);
  if (ctrl) {
    return {
      ok: false,
      status: 400,
      reasons: [`The prompt ${ctrl}. Remove it before saving.`],
    };
  }

  // The role file is named after the role it defines, so its `id` comes from
  // the file name the config points at - not from `roleId`, which is the crew's
  // key for it and may differ (several crews share one file).
  const fileRoleId = path.basename(promptPath, path.extname(promptPath));
  const serialized = `${JSON.stringify(
    { schemaVersion: ROLE_FILE_SCHEMA_VERSION, id: fileRoleId, prompt: content },
    null,
    2,
  )}\n`;
  // Both ends of the editor go through parseRoleFile, so a save cannot produce
  // a file that only fails later, on the first run that loads it.
  try {
    parseRoleFile(serialized, promptPath);
  } catch (err) {
    return {
      ok: false,
      status: 400,
      reasons: [err instanceof Error ? err.message : String(err)],
    };
  }

  // A pasted token would be handed to a provider on every turn this role takes.
  // Refused rather than redacted: a silently rewritten prompt is a role that no
  // longer says what its author wrote.
  const secrets = scanTextForSecrets(content);
  if (secrets.length > 0) {
    const first = secrets[0]!;
    return {
      ok: false,
      status: 400,
      reasons: [
        `The prompt looks like it contains a secret (${first.pattern}) on line ${
          first.line + 1
        }: ${first.redactedSnippet}. Remove it before saving.`,
      ],
    };
  }

  const broker = createActionBroker(input.projectRoot, ROLE_AUDIT_RUN);
  const request = roleFileRequest({
    crewId: input.crewId,
    roleId: input.roleId,
    targetPath: input.targetPath,
    configPath: projectConfigPath(input.projectRoot),
  });
  const gate = await gateAction(broker, request);
  if (!gate.allowed) {
    return {
      ok: false,
      status: 403,
      reasons: [
        `Action broker refused the role prompt write for "${input.roleId}" (${promptPath}): ${gate.reason}`,
      ],
    };
  }

  // An allowed action that then fails is still a terminal state the audit trail
  // owes an entry for; without this the log shows a decision and no outcome,
  // which reads as a write that landed.
  try {
    await writeTextAtomic(input.targetPath, serialized);
  } catch (err) {
    await broker.record(request, gate.decision, {
      ok: false,
      summary: `role "${input.roleId}" prompt failed to write: ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
    throw err;
  }
  await broker.record(request, gate.decision, {
    ok: true,
    summary: `wrote the prompt for role "${input.roleId}" in crew "${input.crewId}"`,
  });
  return { ok: true, promptPath };
}

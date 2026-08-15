// The gate on a Crew Role's `skills` list when the change arrives over HTTP.
// Sibling of `role-fields-write.ts`: same audit bucket, same refusal contract.
// The request subject is deliberately wider - see `roleSkillsRequest`.
//
// This exists because the Skills page reaches the SAME field the Crew editor's
// field patch reaches - `crews.<defaultCrew>.roles.<roleId>.skills` in
// project.yml - down a different code path. Gating the Crew editor alone left a
// second door onto one of the fields it protects, and that door is not a lesser
// one: a skill is instruction text replayed into every turn the role takes, and
// it can carry MCP servers, so assigning one grants the role new instructions
// and new tools. A policy that stops the Crew editor has to stop this too, or
// the refusal it reports is not the whole story.
//
// Gated HERE rather than inside `skill-assignment-service.ts`: that service is
// shared with `vibe skills assign` and the terminal shell's Skills page, which
// are the owner at their own keyboard, not a browser. Same carve-out the role
// field writer makes for the config commands.
//
// The broker is constructed here rather than accepted as a parameter, for the
// same reason the other authoring writers do it: an optional broker argument is
// a write that escapes the audit trail the moment a caller forgets to pass one.
//
// The caller owns resolving the skill id to a name and rejecting an unknown
// one; this owns the crew, the decision, the write and the record.

import { relativizeRoot } from "../utils/redact-paths.js";
import {
  createActionBroker,
  gateAction,
  type ActionRequest,
} from "../safety/action-broker.js";
import { readDocument } from "../setup/config-update-service.js";
import {
  assignSkillToRole,
  unassignSkillFromRole,
} from "./skill-assignment-service.js";
import { ROLE_AUDIT_RUN } from "./role-file-write.js";
import { roleWritePaths } from "./role-write-subject.js";

export type RoleSkillMode = "assign" | "unassign";

/** The crew `skill-assignment-service` falls back to when the config names
 *  none. Repeated rather than imported because that service does not export it,
 *  and it is shared with the CLI and the terminal shell. */
const FALLBACK_CREW_ID = "default";

export type RoleSkillWriteError = { ok: false; status: number; reasons: string[] };
export type RoleSkillWriteResult =
  | { ok: true; skills: string[] }
  | RoleSkillWriteError;

/** The broker request every HTTP skill assignment is gated and recorded under.
 *
 *  `path` is `project.yml`, because that is the file these bytes land in - the
 *  skill's own markdown is not touched, and neither is the role file.
 *
 *  `files` names BOTH the config and the role file, and that width is the
 *  point. The policy matcher tests a `pathGlob` against `path` AND every entry
 *  of `files` (`collectPaths`, policies/action-policy-engine.ts), and a skill is
 *  instruction text replayed into every turn the role takes - plus, when the
 *  skill declares MCP servers, new tools for that turn. That is the authority
 *  the role file carries, so a rule scoped to `.vibestrate/roles/**` has to
 *  refuse this too, or a role's instructions are frozen in the file the rule
 *  names and rewritable through the one it does not. What this grants is not
 *  separable from what the role file grants, so one request names both, built
 *  by the shared `roleWritePaths` that the Crew editor's two writers use.
 *
 *  `purpose` is `role-skills` so the log separates the Skills page from the Crew
 *  editor's `role-fields` patch, and `fields` names the one key it writes so a
 *  `role-fields` reader and this one describe the same config key the same way.
 *
 *  Ids and one field name only - a skill name is a filename the user chose, not
 *  its contents. */
function roleSkillsRequest(input: {
  crewId: string;
  roleId: string;
  skillName: string;
  mode: RoleSkillMode;
  configPath: string;
  files: string[];
}): ActionRequest {
  return {
    runId: ROLE_AUDIT_RUN,
    kind: "file.write",
    subject: {
      path: input.configPath,
      files: input.files,
      crewId: input.crewId,
      roleId: input.roleId,
      purpose: "role-skills",
      fields: ["skills"],
      skill: input.skillName,
      mode: input.mode,
    },
    // "system": the seam cannot tell a dashboard save from any other HTTP
    // caller, so it does not claim to. Same choice as the other writers.
    proposedBy: "system",
  };
}

/**
 * The crew this assignment lands in.
 *
 * Read off the raw document the way `skill-assignment-service` reads it, not
 * off the parsed config: the service is what picks the crew the bytes go to,
 * and a resolver that disagreed with it would name one crew's role file in the
 * subject while the write landed in another's.
 *
 * Falls back on an unreadable config, which is the state in which the
 * assignment is about to fail on the same document anyway. The document is read
 * only to label the subject, never to decide.
 */
async function skillCrewId(projectRoot: string): Promise<string> {
  let doc;
  try {
    ({ doc } = await readDocument(projectRoot));
  } catch {
    return FALLBACK_CREW_ID;
  }
  const named = doc.get("defaultCrew");
  return typeof named === "string" && named.length > 0 ? named : FALLBACK_CREW_ID;
}

/**
 * Gate, apply, and record one skill assignment or removal. The caller owns
 * resolving the skill id to a name and rejecting an unknown one; this owns the
 * decision, the write and the record.
 *
 * A non-allow verdict is returned as a 403 refusal rather than thrown, so the
 * HTTP caller maps it straight onto a response - a policy doing its job is the
 * caller's answer, not a server fault.
 */
export async function setRoleSkillAudited(input: {
  projectRoot: string;
  roleId: string;
  skillName: string;
  mode: RoleSkillMode;
}): Promise<RoleSkillWriteResult> {
  const { projectRoot, roleId, skillName, mode } = input;
  const broker = createActionBroker(projectRoot, ROLE_AUDIT_RUN);
  const crewId = await skillCrewId(projectRoot);
  const paths = await roleWritePaths({ projectRoot, crewId, roleId });
  const request = roleSkillsRequest({
    crewId,
    roleId,
    skillName,
    mode,
    configPath: paths.configPath,
    files: paths.files,
  });

  // An unknown role still reaches the gate with both paths named, and still
  // gets the same refusal, so a denying policy cannot be probed for which roles
  // exist.
  const gate = await gateAction(broker, request);
  if (!gate.allowed) {
    return {
      ok: false,
      status: 403,
      reasons: [
        `Action broker refused the skill ${mode} of "${skillName}" for role "${roleId}": ${gate.reason}`,
      ],
    };
  }

  // An allowed action that then fails is still a terminal state the audit trail
  // owes an entry for; without this the log shows a decision and no outcome,
  // which reads as a write that landed. An unknown role is the caller's to fix,
  // hence 400 rather than a rethrow - and the message is relativized because a
  // config read failure interpolates the absolute path it looked at, and this
  // body can travel to a client that is not the machine running the server.
  let skills: string[];
  try {
    const result =
      mode === "assign"
        ? await assignSkillToRole(projectRoot, roleId, skillName)
        : await unassignSkillFromRole(projectRoot, roleId, skillName);
    skills = result.skills;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await broker.record(request, gate.decision, {
      ok: false,
      summary: `role "${roleId}" skills failed to write: ${message}`,
    });
    return {
      ok: false,
      status: 400,
      reasons: [relativizeRoot(message, projectRoot)],
    };
  }
  await broker.record(request, gate.decision, {
    ok: true,
    summary: `${
      mode === "assign" ? "assigned" : "unassigned"
    } skill "${skillName}" for role "${roleId}" in crew "${crewId}"`,
  });
  return { ok: true, skills };
}

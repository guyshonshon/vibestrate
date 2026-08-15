// The gate on a Crew Role's config fields (profile, seats, permissions, label,
// skills) when the change arrives over HTTP: an Action Broker decision as a
// `file.write` against `project.yml`, then the shared config writer, then an
// evidence record.
//
// `permissions` is why this exists. It names the permission profile a Role's
// provider runs under, so flipping `read_only` -> `code_write` grants that Role
// the ability to edit the repo - a larger authority than any prompt edit. The
// Crew editor saves fields and prompt text in the SAME click, as two requests.
// With only the prompt gated, one Save under a policy denying `file.write`
// refused the harmless half with a 403 and landed the permission flip: the
// dangerous request was the one that got through. Gating one and not the other
// is worse than gating neither, because the policy's message says the write was
// stopped. Gating both is not enough on its own either: a path-scoped policy can
// name one file and not the other, so both halves present the SAME pair of paths
// to the matcher and neither can be refused alone (`roleFieldsRequest`).
//
// Gated HERE and not inside `setCrewRoleFields`: that function lives in the
// config writer shared with `vibe init` and every `vibe config` / `vibe crew`
// command, where a gate could refuse a first-time init before a project has any
// policy to consult. This wrapper is reachable only from the HTTP route, which
// is the surface a browser reaches, so the asymmetry closes with no CLI blast
// radius.
//
// The broker is constructed here rather than accepted as a parameter, for the
// same reason the flow and role-prompt writers do it: an optional broker
// argument is a write that escapes the audit trail the moment a caller forgets
// to pass one.

import { relativizeRoot } from "../utils/redact-paths.js";
import {
  createActionBroker,
  gateAction,
  type ActionRequest,
} from "../safety/action-broker.js";
import { setCrewRoleFields } from "../setup/config-update-service.js";
import { ROLE_AUDIT_RUN } from "./role-file-write.js";
import { roleWritePaths } from "./role-write-subject.js";

export type RoleFieldsWriteError = { ok: false; status: number; reasons: string[] };
export type RoleFieldsWriteResult = { ok: true } | RoleFieldsWriteError;

/** The broker request every HTTP role-field write is gated and recorded under.
 *
 *  `path` is `project.yml`, where these bytes actually land, so the audit trail
 *  names the file that changed.
 *
 *  `files` names BOTH files one Crew editor Save touches - the config and the
 *  role file - and the role-prompt writer presents the same pair, built by the
 *  shared `roleWritePaths` so the two cannot spell one file two ways. The two
 *  halves of a Save are two requests, and the policy matcher tests a `pathGlob`
 *  against `path` AND every entry of `files`
 *  (`collectPaths`, policies/action-policy-engine.ts), so a rule naming either
 *  file refuses both halves. The halves must not be separable: with only the
 *  landing path presented, a rule scoped to `.vibestrate/roles/**` refused the
 *  prompt edit and let the permissions flip through, so the deny landed the
 *  dangerous half while reporting the write was stopped.
 *
 *  `purpose` separates a field change from a `role-prompt` change in the log,
 *  and `fields` names what the patch touches so a reader can see a permissions
 *  flip without opening the config. Ids, paths and field names only: no values,
 *  which is what keeps a subject free of anything worth leaking. */
function roleFieldsRequest(input: {
  crewId: string;
  roleId: string;
  configPath: string;
  files: string[];
  fields: string[];
}): ActionRequest {
  return {
    runId: ROLE_AUDIT_RUN,
    kind: "file.write",
    subject: {
      path: input.configPath,
      files: input.files,
      crewId: input.crewId,
      roleId: input.roleId,
      purpose: "role-fields",
      fields: input.fields,
    },
    // "system": the seam cannot tell a dashboard save from any other HTTP
    // caller, so it does not claim to. Same choice as the other two writers.
    proposedBy: "system",
  };
}

/**
 * Gate, apply, and record one Crew Role's field patch. The caller owns the
 * allow-list of field names and the id validation; this owns the decision and
 * the record.
 *
 * A non-allow verdict is returned as a 403 refusal rather than thrown, so the
 * HTTP caller maps it straight onto a response - a policy doing its job is the
 * caller's answer, not a server fault.
 */
export async function setCrewRoleFieldsAudited(input: {
  projectRoot: string;
  crewId: string;
  roleId: string;
  patch: Record<string, unknown>;
}): Promise<RoleFieldsWriteResult> {
  const { projectRoot, crewId, roleId, patch } = input;
  const fields = Object.keys(patch).sort();
  const broker = createActionBroker(projectRoot, ROLE_AUDIT_RUN);
  const paths = await roleWritePaths({ projectRoot, crewId, roleId });
  const request = roleFieldsRequest({
    crewId,
    roleId,
    configPath: paths.configPath,
    files: paths.files,
    fields,
  });

  // The config is read only to name the role file in the subject, never to
  // decide. An unreadable config or an unknown role still yields both paths
  // (`roleWritePaths` substitutes the conventional role file rather than
  // dropping it), so the verdict is the policy's alone and a refusal cannot be
  // used to probe for which roles exist.
  const gate = await gateAction(broker, request);
  if (!gate.allowed) {
    return {
      ok: false,
      status: 403,
      reasons: [
        `Action broker refused the role field write for "${roleId}" (${fields.join(
          ", ",
        )}): ${gate.reason}`,
      ],
    };
  }

  // An allowed action that then fails is still a terminal state the audit trail
  // owes an entry for; without this the log shows a decision and no outcome,
  // which reads as a write that landed. `setCrewRoleFields` rejects an unknown
  // role, an unknown profile and a patch that would invalidate the config, all
  // of which are the caller's to fix - hence 400 rather than a rethrow.
  //
  // The message is relativized on the way out and kept verbatim in the record:
  // reading the config on a project that was never initialized interpolates the
  // absolute path it looked at, and a 4xx body is sent as-is by the server's
  // error handler, which only relativizes `title` and `hint`. The audit log is
  // a local file, where the absolute path is the useful part.
  try {
    await setCrewRoleFields(projectRoot, crewId, roleId, patch);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await broker.record(request, gate.decision, {
      ok: false,
      summary: `role "${roleId}" fields failed to write: ${message}`,
    });
    return {
      ok: false,
      status: 400,
      reasons: [relativizeRoot(message, projectRoot)],
    };
  }
  await broker.record(request, gate.decision, {
    ok: true,
    summary: `updated ${fields.join(", ")} for role "${roleId}" in crew "${crewId}"`,
  });
  return { ok: true };
}

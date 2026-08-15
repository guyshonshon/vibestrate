// The Crew editor's pure model: what the owner is editing, which parts of it
// the API can actually write, and which parts have to be pasted by hand.
//
// That split is the whole point of this module, and it is not cosmetic. Two
// write routes exist for a crew: PATCH a role's fields and PUT a role's prompt,
// both only for a role that ALREADY exists in a crew that already exists.
// Creating a crew, adding a role, removing one, renaming one, and the crew's own
// label and review-loop count all live in `crews:` in project.yml, and no route
// writes that map (the generic config setter excludes record containers on
// purpose - an arbitrary `providers.<x>.command` write would be a config-tamper
// path to host execution). So every edit is planned into two buckets, and the
// editor never reports the second bucket as saved.

import { stringify as stringifyYaml } from "yaml";
import type { CrewView, DiscoveredFlow } from "../../lib/types.js";

/** Mirrors ROLE_FILE_SCHEMA_VERSION in src/agents/role-schema.ts. The editor
 *  saves prompts through the API, but it also RENDERS a role file for a role
 *  the API cannot create, and that file has to parse on the next run. */
export const ROLE_FILE_SCHEMA_VERSION = 1;

/** The prompt cap the PUT route enforces. Mirrored so the owner sees the limit
 *  while typing instead of a 400 after a round trip. */
export const MAX_PROMPT_CHARS = 100_000;

/** Mirrors seatTokenSchema. A role id has to survive being a file name: the
 *  role file is named after the role it defines and the loader rejects a
 *  mismatch. */
const ROLE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/;

/** Mirrors ID_RE in the crews routes. A crew id outside this shape parses fine
 *  in project.yml but can never be fetched or patched over HTTP, so the editor
 *  refuses to mint one. */
const CREW_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/** Where a role file goes when the editor has to name one itself. */
export function defaultPromptPath(roleId: string): string {
  return `.vibestrate/roles/${roleId}.json`;
}

// ─── state ──────────────────────────────────────────────────────────────────

/** One role's persisted shape - config wiring plus the prompt text. */
export type RoleSnapshot = {
  id: string;
  label: string;
  seats: string[];
  profile: string;
  permissions: string;
  skills: string[];
  prompt: string;
  /** Project-relative path of the role's JSON role file. */
  promptPath: string;
};

export type EditorRole = RoleSnapshot & {
  /** Identity that survives an id rename, so the list can diff and React can
   *  key on something the owner is allowed to change. */
  key: string;
  /** The role as it is on disk; null for a role added in this editor. */
  baseline: RoleSnapshot | null;
  /** Set when the role's prompt could not be read - a role file that is not
   *  valid JSON, or whose declared id does not match its file name. The prompt
   *  stays editable: saving it rewrites the file through the same parse the
   *  loader uses, which is the recovery. */
  loadError: string | null;
};

export type CrewEditorState = {
  crewId: string;
  label: string;
  /** null = inherit the global `workflow.maxReviewLoops`. */
  maxReviewLoops: number | null;
  roles: EditorRole[];
  /** The crew as loaded. null means this editor is creating one, which no
   *  route can do, so every change is manual. */
  baseline: { crewId: string; label: string; maxReviewLoops: number | null } | null;
  /** Roles dropped in this editor that exist on disk. Kept so the plan can say
   *  which entries the owner has to delete from project.yml. */
  removed: RoleSnapshot[];
};

let roleKeySeq = 0;
export function newRoleKey(): string {
  roleKeySeq += 1;
  return `role-${roleKeySeq}`;
}

export function blankCrew(): CrewEditorState {
  return {
    crewId: "",
    label: "",
    maxReviewLoops: null,
    roles: [],
    baseline: null,
    removed: [],
  };
}

export function blankRole(defaults: { profile: string; permissions: string }): EditorRole {
  return {
    key: newRoleKey(),
    id: "",
    label: "",
    seats: [],
    profile: defaults.profile,
    permissions: defaults.permissions,
    skills: [],
    prompt: "",
    promptPath: "",
    baseline: null,
    loadError: null,
  };
}

/** What the page read back for one role's prompt. A read that failed is a value
 *  here, not a thrown error: one unreadable role file must not blank the whole
 *  editor. */
export type LoadedRolePrompt =
  | { ok: true; roleId: string; promptPath: string; content: string }
  | { ok: false; roleId: string; error: string };

export function crewToEditorState(
  crew: CrewView,
  prompts: LoadedRolePrompt[],
): CrewEditorState {
  const byRole = new Map(prompts.map((p) => [p.roleId, p]));
  return {
    crewId: crew.id,
    label: crew.label,
    maxReviewLoops: crew.maxReviewLoops,
    baseline: {
      crewId: crew.id,
      label: crew.label,
      maxReviewLoops: crew.maxReviewLoops,
    },
    removed: [],
    roles: crew.roles.map((role) => {
      const loaded = byRole.get(role.id);
      const promptPath =
        loaded?.ok === true ? loaded.promptPath : defaultPromptPath(role.id);
      const prompt = loaded?.ok === true ? loaded.content : "";
      const snapshot: RoleSnapshot = {
        id: role.id,
        label: role.label,
        seats: [...role.seats],
        profile: role.profile,
        permissions: role.permissions,
        skills: [...role.skills],
        prompt,
        promptPath,
      };
      return {
        ...snapshot,
        key: newRoleKey(),
        baseline: snapshot,
        loadError: loaded?.ok === false ? loaded.error : null,
      };
    }),
  };
}

// ─── vocabularies ───────────────────────────────────────────────────────────

/** Every seat the owner may assign: the seats flows declare, plus any seat the
 *  crew already uses (a crew is allowed to carry a seat no installed flow asks
 *  for, and dropping it from the picker would silently strip it). */
export function seatVocabulary(flows: DiscoveredFlow[], roles: EditorRole[]): string[] {
  const set = new Set<string>();
  for (const flow of flows) {
    for (const seat of Object.keys(flow.definition.seats ?? {})) set.add(seat);
    for (const step of flow.definition.steps ?? []) {
      if (step.seat) set.add(step.seat);
    }
  }
  for (const role of roles) for (const seat of role.seats) set.add(seat);
  return [...set].sort();
}

/** The permission ids that are safe to offer. The built-ins always resolve, and
 *  an id another crew already runs on must resolve too or that crew is already
 *  broken. A project-defined profile nothing uses yet is invisible here - no
 *  endpoint returns `permissions.profiles`, and guessing at one would offer an
 *  id that fails at run time. */
export function permissionVocabulary(
  builtins: string[],
  crews: CrewView[],
  current: string[],
): string[] {
  const set = new Set<string>(builtins);
  for (const crew of crews) for (const role of crew.roles) set.add(role.permissions);
  for (const id of current) if (id) set.add(id);
  return [...set].sort();
}

// ─── seat coverage against real flows ───────────────────────────────────────

export type FlowFitStatus = "ready" | "contested" | "blocked";

export type FlowFit = {
  flowId: string;
  flowLabel: string;
  /** Seats this flow's steps actually ask for. */
  required: string[];
  /** Required seats no role fills - the flow cannot start. */
  missing: string[];
  /** Required seats two or more roles fill - the flow cannot start either. */
  contested: string[];
  status: FlowFitStatus;
};

/** Which flows this crew can run, and why not when it cannot.
 *
 *  Both failure modes are resolution-time throws in flow-resolver, not
 *  soft warnings: a seat with no role stops the run, and a seat with several
 *  roles stops it too unless the run passes an explicit role override. Optional
 *  steps are included on purpose - resolution fills every step's seat before
 *  anything is skipped, so an optional step's seat is just as fatal. */
export function computeFlowFit(roles: EditorRole[], flows: DiscoveredFlow[]): FlowFit[] {
  return flows
    .map((flow) => {
      const required = [
        ...new Set(
          (flow.definition.steps ?? [])
            .map((step) => step.seat)
            .filter((seat): seat is string => Boolean(seat)),
        ),
      ].sort();
      const missing: string[] = [];
      const contested: string[] = [];
      for (const seat of required) {
        const takers = roles.filter((r) => r.seats.includes(seat));
        if (takers.length === 0) missing.push(seat);
        else if (takers.length > 1) contested.push(seat);
      }
      const status: FlowFitStatus =
        missing.length > 0 ? "blocked" : contested.length > 0 ? "contested" : "ready";
      return { flowId: flow.id, flowLabel: flow.label, required, missing, contested, status };
    })
    .sort((a, b) => {
      const rank = { blocked: 0, contested: 1, ready: 2 } as const;
      return rank[a.status] - rank[b.status] || a.flowLabel.localeCompare(b.flowLabel);
    });
}

// ─── validation ─────────────────────────────────────────────────────────────

export type EditorProblem = {
  /** Branch on the code, never on the sentence. */
  code:
    | "crew-id"
    | "crew-id-taken"
    | "no-roles"
    | "role-id"
    | "role-id-dupe"
    | "role-seat-dupe"
    | "role-seats"
    | "role-profile"
    | "role-permissions"
    | "role-prompt"
    | "role-prompt-long";
  /** The role this is about, or null for a crew-level problem. */
  roleKey: string | null;
  message: string;
};

export function validateEditorState(
  state: CrewEditorState,
  ctx: { takenCrewIds: string[] },
): EditorProblem[] {
  const problems: EditorProblem[] = [];
  const creating = state.baseline === null;

  if (!CREW_ID_RE.test(state.crewId)) {
    problems.push({
      code: "crew-id",
      roleKey: null,
      message:
        "The crew id must start with a letter or digit and use only letters, digits, dots, dashes, or underscores.",
    });
  } else if (creating && ctx.takenCrewIds.includes(state.crewId)) {
    problems.push({
      code: "crew-id-taken",
      roleKey: null,
      message: `A crew named "${state.crewId}" already exists. Open that one instead of overwriting it.`,
    });
  }

  if (state.roles.length === 0) {
    problems.push({
      code: "no-roles",
      roleKey: null,
      message: "A crew with no roles fills no seats. Add at least one role.",
    });
  }

  const seen = new Map<string, number>();
  for (const role of state.roles) seen.set(role.id, (seen.get(role.id) ?? 0) + 1);

  for (const role of state.roles) {
    if (!ROLE_ID_RE.test(role.id)) {
      problems.push({
        code: "role-id",
        roleKey: role.key,
        message:
          "The role id must start with a letter or digit, use only letters, digits, dashes, or underscores, and stay under 40 characters.",
      });
    } else if ((seen.get(role.id) ?? 0) > 1) {
      problems.push({
        code: "role-id-dupe",
        roleKey: role.key,
        message: `Two roles share the id "${role.id}". A crew keys its roles by id, so one would replace the other.`,
      });
    }
    if (role.seats.length === 0) {
      problems.push({
        code: "role-seats",
        roleKey: role.key,
        message: "A role must take at least one seat, or no flow can ever use it.",
      });
    }
    if (!role.profile) {
      problems.push({
        code: "role-profile",
        roleKey: role.key,
        message: "Pick the profile this role runs on.",
      });
    }
    if (!role.permissions) {
      problems.push({
        code: "role-permissions",
        roleKey: role.key,
        message: "Pick what this role is allowed to do.",
      });
    }
    if (role.prompt.trim().length === 0) {
      problems.push({
        code: "role-prompt",
        roleKey: role.key,
        message: "A role file needs a prompt. An empty one is refused when it loads.",
      });
    } else if (role.prompt.length > MAX_PROMPT_CHARS) {
      problems.push({
        code: "role-prompt-long",
        roleKey: role.key,
        message: `The prompt is ${role.prompt.length - MAX_PROMPT_CHARS} characters over the ${MAX_PROMPT_CHARS.toLocaleString()} cap.`,
      });
    }
  }

  // Two roles claiming one seat is not a style problem: the flow resolver
  // throws FlowResolutionError on an ambiguous seat, so the crew would save
  // cleanly and then refuse to start every flow that asks for it. The drafter
  // already refuses this; the editor has to as well.
  const seatOwners = new Map<string, string[]>();
  for (const role of state.roles) {
    for (const seat of role.seats) {
      seatOwners.set(seat, [...(seatOwners.get(seat) ?? []), role.id]);
    }
  }
  for (const [seat, owners] of seatOwners) {
    if (owners.length < 2) continue;
    problems.push({
      code: "role-seat-dupe",
      roleKey: null,
      message: `Seat "${seat}" is filled by more than one role (${owners.join(", ")}); a run refuses to start on an ambiguous seat.`,
    });
  }

  return problems;
}

// ─── artifacts the owner pastes ─────────────────────────────────────────────

export type CodeBlock = {
  title: string;
  /** Where the block belongs on disk. */
  path: string;
  body: string;
};

export function roleFileJson(roleId: string, prompt: string): string {
  return `${JSON.stringify(
    { schemaVersion: ROLE_FILE_SCHEMA_VERSION, id: roleId, prompt },
    null,
    2,
  )}\n`;
}

function roleFileBlock(role: EditorRole): CodeBlock {
  // The file is named after the role, and the loader rejects a file whose `id`
  // does not match its basename - so the id in the JSON follows the path, not
  // the crew's key for the role.
  const path = role.promptPath || defaultPromptPath(role.id);
  const basename = path.replace(/^.*\//, "").replace(/\.json$/, "");
  return {
    title: `Role file: ${role.id}`,
    path,
    body: roleFileJson(basename, role.prompt),
  };
}

function roleConfigObject(role: EditorRole): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  // The serialized crew defaults an absent label to the role id, so a label
  // equal to the id is not evidence the key was ever written.
  if (role.label && role.label !== role.id) out.label = role.label;
  out.seats = role.seats;
  out.profile = role.profile;
  out.prompt = role.promptPath || defaultPromptPath(role.id);
  out.permissions = role.permissions;
  if (role.skills.length > 0) out.skills = role.skills;
  return out;
}

/** The whole `crews.<id>` block, for a crew that does not exist yet. */
export function crewYaml(state: CrewEditorState): string {
  const crew: Record<string, unknown> = {};
  if (state.label && state.label !== state.crewId) crew.label = state.label;
  if (state.maxReviewLoops !== null) crew.maxReviewLoops = state.maxReviewLoops;
  crew.roles = Object.fromEntries(state.roles.map((r) => [r.id, roleConfigObject(r)]));
  return stringifyYaml({ [state.crewId]: crew });
}

/** One role's entry, for pasting under an existing `crews.<id>.roles:`.
 *  Deliberately not the whole crew block: re-emitting a crew the dashboard can
 *  only partly see would drop keys it never received, and `checklistReviewLenses`
 *  is exactly such a key - the crews API does not return it. */
export function roleYaml(role: EditorRole): string {
  return stringifyYaml({ [role.id]: roleConfigObject(role) });
}

// ─── the save plan ──────────────────────────────────────────────────────────

export type RoleFieldsPatch = {
  profile?: string;
  seats?: string[];
  permissions?: string;
  label?: string;
  skills?: string[];
};

export type SaveOp =
  | { kind: "fields"; roleId: string; roleLabel: string; summary: string; patch: RoleFieldsPatch }
  | { kind: "prompt"; roleId: string; roleLabel: string; summary: string; content: string };

export type ManualChange = {
  title: string;
  /** Why no route does this. */
  reason: string;
  blocks: CodeBlock[];
};

export type SavePlan = {
  /** Ops the existing write routes cover, in the order they must run. */
  writable: SaveOp[];
  /** Changes that only project.yml can carry. */
  manual: ManualChange[];
  clean: boolean;
};

function sameList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const x = [...a].sort();
  const y = [...b].sort();
  return x.every((v, i) => v === y[i]);
}

/** How many of this role's fields differ from disk. A role the editor added
 *  counts as wholly new rather than as a field count. */
export function roleChangeCount(role: EditorRole): number {
  const b = role.baseline;
  if (b === null) return -1;
  let n = 0;
  if (role.id !== b.id) n += 1;
  if (role.label !== b.label) n += 1;
  if (role.profile !== b.profile) n += 1;
  if (role.permissions !== b.permissions) n += 1;
  if (!sameList(role.seats, b.seats)) n += 1;
  if (!sameList(role.skills, b.skills)) n += 1;
  if (role.loadError !== null || role.prompt !== b.prompt) n += 1;
  return n;
}

/** Move a role's baseline forward over the ops that actually landed.
 *
 *  Re-reading the crew after a save would be simpler and would be wrong: the
 *  editor holds work the server has never seen (a role added here, a rename, a
 *  crew label), and a reload would throw it away. So only what the server
 *  confirmed is re-baselined, and everything still pending stays pending. */
export function rebaseRole(
  role: EditorRole,
  applied: { fields: boolean; prompt: boolean },
): EditorRole {
  if (role.baseline === null) return role;
  const baseline: RoleSnapshot = { ...role.baseline };
  if (applied.fields) {
    baseline.label = role.label;
    baseline.seats = [...role.seats];
    baseline.profile = role.profile;
    baseline.permissions = role.permissions;
    baseline.skills = [...role.skills];
  }
  if (applied.prompt) baseline.prompt = role.prompt;
  return {
    ...role,
    baseline,
    // The prompt write rebuilt the file through the loader's own parse, so the
    // read failure that motivated it is gone.
    loadError: applied.prompt ? null : role.loadError,
  };
}

export function planCrewSave(state: CrewEditorState): SavePlan {
  const writable: SaveOp[] = [];
  const manual: ManualChange[] = [];

  if (state.baseline === null) {
    manual.push({
      title: `Create the crew "${state.crewId}"`,
      reason:
        "The role files go first. A crew entry pointing at a file nobody wrote stops the first run before an agent starts.",
      blocks: [
        ...state.roles.map(roleFileBlock),
        {
          title: "The crew block",
          path: ".vibestrate/project.yml",
          body: crewYaml(state),
        },
      ],
    });
    return { writable, manual, clean: false };
  }

  const base = state.baseline;
  if (state.label !== base.label) {
    manual.push({
      title: `Rename the crew to "${state.label}"`,
      reason: "A crew's own label lives in project.yml. No route sets it.",
      blocks: [
        {
          title: "Under crews:",
          path: ".vibestrate/project.yml",
          body: stringifyYaml({ [state.crewId]: { label: state.label } }),
        },
      ],
    });
  }
  if (state.maxReviewLoops !== base.maxReviewLoops) {
    manual.push({
      title:
        state.maxReviewLoops === null
          ? "Inherit the global review-loop count"
          : `Set this crew's review loops to ${state.maxReviewLoops}`,
      reason: "The per-crew review-loop override lives in project.yml. No route sets it.",
      blocks:
        state.maxReviewLoops === null
          ? []
          : [
              {
                title: "Under crews:",
                path: ".vibestrate/project.yml",
                body: stringifyYaml({
                  [state.crewId]: { maxReviewLoops: state.maxReviewLoops },
                }),
              },
            ],
    });
  }

  for (const role of state.roles) {
    if (role.baseline === null) {
      manual.push({
        title: `Add the role "${role.id}"`,
        reason:
          "Adding a role means adding a key under this crew's roles map, and writing the role file it points at. No route does either.",
        blocks: [
          roleFileBlock(role),
          {
            title: `Under crews.${state.crewId}.roles:`,
            path: ".vibestrate/project.yml",
            body: roleYaml(role),
          },
        ],
      });
      continue;
    }

    if (role.baseline.id !== role.id) {
      manual.push({
        title: `Rename the role "${role.baseline.id}" to "${role.id}"`,
        reason: `A role's id is its key under this crew and the name of its file, so a rename is a config edit plus a file move. Delete the "${role.baseline.id}" entry and ${role.baseline.promptPath} after adding these.`,
        blocks: [
          roleFileBlock(role),
          {
            title: `Under crews.${state.crewId}.roles:`,
            path: ".vibestrate/project.yml",
            body: roleYaml(role),
          },
        ],
      });
      continue;
    }

    const b = role.baseline;
    const patch: RoleFieldsPatch = {};
    const changed: string[] = [];
    if (role.profile !== b.profile) {
      patch.profile = role.profile;
      changed.push("profile");
    }
    if (!sameList(role.seats, b.seats)) {
      patch.seats = role.seats;
      changed.push("seats");
    }
    if (role.permissions !== b.permissions) {
      patch.permissions = role.permissions;
      changed.push("permissions");
    }
    if (role.label !== b.label) {
      patch.label = role.label;
      changed.push("label");
    }
    if (!sameList(role.skills, b.skills)) {
      patch.skills = role.skills;
      changed.push("skills");
    }
    if (changed.length > 0) {
      writable.push({
        kind: "fields",
        roleId: role.id,
        roleLabel: role.label || role.id,
        summary: `${role.label || role.id}: ${changed.join(", ")}`,
        patch,
      });
    }
    // A role whose file never parsed has no known prompt to compare against,
    // so any prompt it now carries is a change. Writing it is the recovery: the
    // PUT route rebuilds the file from scratch through the loader's own parse.
    if (role.loadError !== null || role.prompt !== b.prompt) {
      writable.push({
        kind: "prompt",
        roleId: role.id,
        roleLabel: role.label || role.id,
        summary: `${role.label || role.id}: instructions`,
        content: role.prompt,
      });
    }
  }

  for (const gone of state.removed) {
    manual.push({
      title: `Remove the role "${gone.id}"`,
      reason: `Delete the "${gone.id}" entry under crews.${state.crewId}.roles, and ${gone.promptPath} with it. No route deletes either, and nothing here has removed anything from disk.`,
      blocks: [],
    });
  }

  return { writable, manual, clean: writable.length === 0 && manual.length === 0 };
}

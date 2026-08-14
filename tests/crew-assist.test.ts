import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { draftCrewFromDescription, CrewAssistError } from "../src/agents/crew-assist.js";
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
    // The crew block points each role at the JSON file the draft carries.
    expect(draft.crew.roles["duo-planner"]!.prompt).toBe(
      path.join(".vibestrate", "roles", "duo-planner.json"),
    );
    expect(draft.roleFiles.map((f) => f.path).sort()).toEqual(
      [
        path.join(".vibestrate", "roles", "duo-builder.json"),
        path.join(".vibestrate", "roles", "duo-planner.json"),
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
    expect(draft.problems[0]).toContain(path.join(".vibestrate", "roles", "duo-planner.json"));
    expect(draft.problems[0]).toContain(path.join(".vibestrate", "roles", "duo-builder.json"));

    expect(await readConfig(project)).toBe(before);
    expect(await listRoles(project)).toEqual(rolesBefore);
    const { config } = await loadConfig(project);
    expect(Object.hasOwn(config.crews, "duo")).toBe(false);
  });

  it("imports no config or role-file writer", async () => {
    // Structural guard: a draft service that cannot reach a writer cannot
    // install a crew, whatever a future edit does to its body.
    const source = await fs.readFile(
      path.join(import.meta.dirname, "..", "src", "agents", "crew-assist.ts"),
      "utf8",
    );
    expect(source).not.toMatch(
      /writeDocument|installCrewPreset|installDraftedCrew|fs\.writeFile|writeTextAtomic|mkdir/,
    );
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

  it("redacts the description before it reaches the model", async () => {
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
    expect(todo).toContain(path.join(".vibestrate", "roles", "duo-builder.json"));
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
      path: path.join(".vibestrate", "roles", "duo-planner.json"),
      json: '{\n  "schemaVersion": 1,\n  "id": "duo-planner",\n  "prompt": "You plan."\n}\n',
    },
    {
      roleId: "duo-builder",
      path: path.join(".vibestrate", "roles", "duo-builder.json"),
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
});

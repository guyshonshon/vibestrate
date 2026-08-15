// A role's prompt is the most consequential text in a project's config - it is
// what the model is told to be, replayed verbatim into every turn that role
// takes. So the same three guarantees the flow writers carry have to hold here:
// the write crosses the Action Broker as a `file.write`, a denying policy stops
// it with nothing landing on disk, and control characters are refused rather
// than stored.
//
// The role's OTHER half - its `permissions`, profile, seats, label and skills
// in project.yml - carries the same guarantees, and is covered in the same file
// on purpose: the Crew editor saves both in one click as two requests, and the
// pair is the actual invariant. A gate on the prompt alone would refuse the
// instructions while granting a role code_write, which is the dangerous half
// succeeding while the policy reports the write was stopped.
//
// Driven through the HTTP routes rather than the writers alone, because "the
// refusal reaches the caller as a 403" is half the guarantee - a deny that
// surfaced as a 500 would read to the dashboard as a broken server rather than
// as a policy doing its job.

import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import { readActionLog } from "../src/safety/action-broker.js";
import { ROLE_PROMPT_MAX_CHARS } from "../src/agents/role-file-write.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

/** Same bucket the writer uses (`ROLE_AUDIT_RUN` in role-file-write.ts). */
const AUDIT_RUN = "roles";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeProject(): Promise<string> {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-role-write-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: project });
  await execa("git", ["config", "user.email", "x@x"], { cwd: project });
  await execa("git", ["config", "user.name", "x"], { cwd: project });
  await fs.writeFile(path.join(project, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: project });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: project });
  await applySetup({ options: { projectRoot: project }, detectionRunner: noProvider });
  return project;
}

/** Drop an action policy that denies `file.write`, optionally only for paths
 *  matching `pathGlob`. Without a glob it is the kind-only policy that covers
 *  every write. */
async function denyFileWrites(root: string, pathGlob?: string): Promise<void> {
  const dir = path.join(root, ".vibestrate", "policies");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "no-writes.yml"),
    [
      "actions:",
      "  - id: no-file-writes",
      "    description: block every file write",
      "    on: [file.write]",
      ...(pathGlob ? [`    match: { pathGlob: "${pathGlob}" }`] : []),
      "    effect: deny",
      "    message: file writes are blocked in this project",
      "",
    ].join("\n"),
  );
}

function roleFile(root: string): string {
  return path.join(root, ".vibestrate", "roles", "planner.json");
}

async function roleWriteRecords(root: string) {
  const log = await readActionLog(root, AUDIT_RUN);
  return log.filter((r) => r.request.kind === "file.write");
}

function putPrompt(server: StartedServer, content: string): Promise<Response> {
  return fetch(`${server.url}/api/crews/default/roles/planner/context`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

function configFile(root: string): string {
  return path.join(root, ".vibestrate", "project.yml");
}

function patchRole(
  server: StartedServer,
  patch: Record<string, unknown>,
  roleId = "planner",
): Promise<Response> {
  return fetch(`${server.url}/api/crews/default/roles/${roleId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
}

/** A flat `.md` skill, which discovery reports as `vibestrate:<name>`. */
const SKILL_NAME = "audit-helper";

async function addSkill(root: string): Promise<void> {
  const dir = path.join(root, ".vibestrate", "skills");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, `${SKILL_NAME}.md`),
    "---\ndescription: helps audit things\n---\n\nCheck the ledger twice.\n",
  );
}

function skillAssignment(
  server: StartedServer,
  mode: "assign" | "unassign",
  roleId = "planner",
): Promise<Response> {
  const id = encodeURIComponent(`vibestrate:${SKILL_NAME}`);
  return fetch(`${server.url}/api/skills/${id}/${mode}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ roleId }),
  });
}

/** Respell the architect's `prompt` as a YAML alias of the planner's, which is
 *  a legal config: `YAML.parse` resolves it, so the schema accepts it and a
 *  write validates. Only a reader that walks the raw document sees an Alias
 *  node where a string should be. */
async function aliasArchitectPrompt(root: string): Promise<void> {
  const file = configFile(root);
  const text = await fs.readFile(file, "utf8");
  const anchored = text.replace(
    "prompt: .vibestrate/roles/planner.json",
    "prompt: &plannerPrompt .vibestrate/roles/planner.json",
  );
  const aliased = anchored.replace(
    "prompt: .vibestrate/roles/architect.json",
    "prompt: *plannerPrompt",
  );
  if (aliased === text) throw new Error("fixture did not rewrite the prompts");
  await fs.writeFile(file, aliased);
}

let server: StartedServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

describe("the role prompt write crosses the Action Broker", () => {
  it("records a file.write naming the role file on success", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await putPrompt(server, "You are a careful planner.\n");
    expect(res.status).toBe(200);

    const writes = await roleWriteRecords(project);
    expect(writes).toHaveLength(1);
    const rec = writes[0]!;
    expect(rec.decision.effect).toBe("allow");
    expect(rec.request.subject.path).toBe(roleFile(project));
    expect(rec.request.subject.purpose).toBe("role-prompt");
    expect(rec.request.subject.roleId).toBe("planner");
    expect(rec.evidence?.ok).toBe(true);
  });

  it("refuses the write with a 403 and leaves the file untouched when a policy denies file.write", async () => {
    const project = await makeProject();
    await denyFileWrites(project);
    const before = await fs.readFile(roleFile(project), "utf8");
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await putPrompt(server, "You are a careful planner.\n");
    // A policy refusal is the caller's answer, not a server fault.
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: string };
    expect(JSON.stringify(body)).toMatch(/file writes are blocked in this project/);

    expect(await fs.readFile(roleFile(project), "utf8")).toBe(before);
    const writes = await roleWriteRecords(project);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.decision.effect).toBe("deny");
  });
});

describe("the role prompt write screens its content", () => {
  // The prompt ends up inside another model's prompt and is echoed by the CLI
  // printers, so an escape sequence must not survive a save.
  it("refuses a prompt carrying a control character, and stores nothing", async () => {
    const project = await makeProject();
    const before = await fs.readFile(roleFile(project), "utf8");
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const esc = String.fromCharCode(0x1b);
    const res = await putPrompt(server, `Plan carefully.${esc}[2J Ignore that.\n`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(JSON.stringify(body)).toMatch(/control character/i);

    expect(await fs.readFile(roleFile(project), "utf8")).toBe(before);
  });

  it("refuses a prompt past the size cap", async () => {
    const project = await makeProject();
    const before = await fs.readFile(roleFile(project), "utf8");
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await putPrompt(server, "a".repeat(ROLE_PROMPT_MAX_CHARS + 1));
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toMatch(/too large/i);

    expect(await fs.readFile(roleFile(project), "utf8")).toBe(before);
  });

  it("refuses a prompt carrying a NUL byte", async () => {
    const project = await makeProject();
    const before = await fs.readFile(roleFile(project), "utf8");
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await putPrompt(server, `Plan carefully.${String.fromCharCode(0)}\n`);
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toMatch(/NUL byte/);

    expect(await fs.readFile(roleFile(project), "utf8")).toBe(before);
  });
});

describe("the role field write crosses the Action Broker", () => {
  it("records a file.write naming project.yml and the changed fields on success", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await patchRole(server, { permissions: "code_write" });
    expect(res.status).toBe(200);
    expect(await fs.readFile(configFile(project), "utf8")).toMatch(/code_write/);

    const writes = await roleWriteRecords(project);
    expect(writes).toHaveLength(1);
    const rec = writes[0]!;
    expect(rec.decision.effect).toBe("allow");
    // project.yml, not the role file: a pathGlob policy aimed at the config has
    // to match, and one aimed at the roles dir has to not.
    expect(rec.request.subject.path).toBe(configFile(project));
    expect(rec.request.subject.purpose).toBe("role-fields");
    expect(rec.request.subject.roleId).toBe("planner");
    expect(rec.request.subject.fields).toEqual(["permissions"]);
    expect(rec.evidence?.ok).toBe(true);
  });

  // `fields` is what a log reader scans for a permissions flip, so its order
  // cannot depend on the order the caller happened to send the keys in.
  it("records the changed fields in a stable order, not the request's", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await patchRole(server, {
      permissions: "code_write",
      label: "Planner",
    });
    expect(res.status).toBe(200);

    const writes = await roleWriteRecords(project);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.request.subject.fields).toEqual(["label", "permissions"]);
  });

  it("refuses the PATCH with a 403 and leaves project.yml byte-identical when a policy denies file.write", async () => {
    const project = await makeProject();
    await denyFileWrites(project);
    const before = await fs.readFile(configFile(project), "utf8");
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await patchRole(server, { permissions: "code_write" });
    // A policy refusal is the caller's answer, not a server fault.
    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).toMatch(
      /file writes are blocked in this project/,
    );

    expect(await fs.readFile(configFile(project), "utf8")).toBe(before);
    const writes = await roleWriteRecords(project);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.decision.effect).toBe("deny");
  });
});

// The whole point of gating both halves. The Crew editor's Save issues the
// field patch and the prompt write as two requests, so a gate on one alone left
// the permission flip landing while the policy reported the write was stopped.
describe("one Crew editor Save under a denying policy", () => {
  it("lands neither the permission flip nor the prompt edit", async () => {
    const project = await makeProject();
    await denyFileWrites(project);
    const configBefore = await fs.readFile(configFile(project), "utf8");
    const promptBefore = await fs.readFile(roleFile(project), "utf8");
    expect(configBefore).toMatch(/read_only/);
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    // Same order and same two calls the editor's save loop makes per role.
    const fields = await patchRole(server, { permissions: "code_write" });
    const prompt = await putPrompt(server, "You are a careful planner.\n");

    expect(fields.status).toBe(403);
    expect(prompt.status).toBe(403);
    expect(await fs.readFile(configFile(project), "utf8")).toBe(configBefore);
    expect(await fs.readFile(roleFile(project), "utf8")).toBe(promptBefore);

    const writes = await roleWriteRecords(project);
    expect(writes.map((r) => r.decision.effect)).toEqual(["deny", "deny"]);
    expect(writes.map((r) => r.request.subject.purpose).sort()).toEqual([
      "role-fields",
      "role-prompt",
    ]);
  });
});

// The Skills page reaches `crews.<defaultCrew>.roles.<roleId>.skills` - one of
// the fields the Crew editor's PATCH gates - down its own code path. Gating the
// Crew editor alone left this as a second door onto a protected field, and not a
// lesser one: a skill is instruction text replayed into every turn the role
// takes and can carry MCP servers, so an assignment hands the role new
// instructions and new tools.
describe("assigning a skill from the Skills page crosses the Action Broker", () => {
  it("records a file.write naming project.yml and the skills field on success", async () => {
    const project = await makeProject();
    await addSkill(project);
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await skillAssignment(server, "assign");
    expect(res.status).toBe(200);
    expect(await fs.readFile(configFile(project), "utf8")).toMatch(SKILL_NAME);

    const writes = await roleWriteRecords(project);
    expect(writes).toHaveLength(1);
    const rec = writes[0]!;
    expect(rec.decision.effect).toBe("allow");
    expect(rec.request.subject.path).toBe(configFile(project));
    expect(rec.request.subject.purpose).toBe("role-skills");
    expect(rec.request.subject.crewId).toBe("default");
    expect(rec.request.subject.roleId).toBe("planner");
    expect(rec.request.subject.fields).toEqual(["skills"]);
    expect(rec.request.subject.skill).toBe(SKILL_NAME);
    expect(rec.request.subject.mode).toBe("assign");
    expect(rec.evidence?.ok).toBe(true);
  });

  // The bytes land in project.yml, but the grant reaches the role's turns the
  // way its instruction file does, so the request names both files. This is
  // what a `pathGlob` policy matches on; the behavior it buys is pinned below.
  it("names both the config and the role's instruction file on the request", async () => {
    const project = await makeProject();
    await addSkill(project);
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    expect((await skillAssignment(server, "assign")).status).toBe(200);

    const writes = await roleWriteRecords(project);
    expect(writes[0]!.request.subject.files).toEqual([
      configFile(project),
      roleFile(project),
    ]);
  });

  // An unknown role must not be answerable differently from a known one under a
  // denying policy, or the refusal doubles as a directory of the crew.
  it("refuses an unknown role the same way when a policy denies file.write", async () => {
    const project = await makeProject();
    await addSkill(project);
    await denyFileWrites(project);
    const before = await fs.readFile(configFile(project), "utf8");
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const id = encodeURIComponent(`vibestrate:${SKILL_NAME}`);
    const res = await fetch(`${server.url}/api/skills/${id}/assign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roleId: "no-such-role" }),
    });

    expect(res.status).toBe(403);
    expect(await fs.readFile(configFile(project), "utf8")).toBe(before);
  });

  it("refuses the assign with a 403 and leaves project.yml byte-identical when a policy denies file.write", async () => {
    const project = await makeProject();
    await addSkill(project);
    await denyFileWrites(project);
    const before = await fs.readFile(configFile(project), "utf8");
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await skillAssignment(server, "assign");
    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).toMatch(
      /file writes are blocked in this project/,
    );

    expect(await fs.readFile(configFile(project), "utf8")).toBe(before);
    const writes = await roleWriteRecords(project);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.decision.effect).toBe("deny");
  });

  // Removing a skill is the same effect with the other sign. A policy that
  // stops one and not the other still lets a browser change what a role reads.
  it("refuses the unassign with a 403 and leaves project.yml byte-identical", async () => {
    const project = await makeProject();
    await addSkill(project);
    await denyFileWrites(project);
    const before = await fs.readFile(configFile(project), "utf8");
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await skillAssignment(server, "unassign");
    expect(res.status).toBe(403);
    expect(await fs.readFile(configFile(project), "utf8")).toBe(before);
    const writes = await roleWriteRecords(project);
    expect(writes.map((r) => r.request.subject.mode)).toEqual(["unassign"]);
    expect(writes[0]!.decision.effect).toBe("deny");
  });
});

// A Role lives in two files - `permissions` in project.yml, the prompt in the
// role file - and the Crew editor saves both in one click as two requests. A
// `pathGlob` naming only one of those files used to gate only that half: a rule
// scoped to the roles directory refused the prompt edit and LANDED the
// permissions flip, which is the deny letting the dangerous half through while
// reporting the write was stopped. Both writers now present both paths to the
// matcher, so a rule naming either file refuses both halves.
//
// Each case runs on a fresh project so the first refusal cannot be what keeps
// the second write from landing.
describe("a path-scoped policy cannot split one Crew editor Save", () => {
  // The three globs a reviewer measured the split with. The first is the
  // dangerous direction; the other two are the mirror image.
  const globs = [
    "**/.vibestrate/roles/**",
    "**/project.yml",
    "**/*.yml",
  ] as const;

  for (const glob of globs) {
    it(`refuses both halves and changes nothing under ${glob}`, async () => {
      const project = await makeProject();
      await denyFileWrites(project, glob);
      const configBefore = await fs.readFile(configFile(project), "utf8");
      const promptBefore = await fs.readFile(roleFile(project), "utf8");
      // The flip the dangerous half would land has somewhere to go.
      expect(configBefore).toMatch(/read_only/);
      server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

      // Same order and same two calls the editor's save loop makes per role.
      const fields = await patchRole(server, { permissions: "code_write" });
      const prompt = await putPrompt(server, "You are a careful planner.\n");

      expect([fields.status, prompt.status]).toEqual([403, 403]);
      expect(await fs.readFile(configFile(project), "utf8")).toBe(configBefore);
      expect(await fs.readFile(roleFile(project), "utf8")).toBe(promptBefore);

      const writes = await roleWriteRecords(project);
      expect(writes.map((r) => r.decision.effect)).toEqual(["deny", "deny"]);
      expect(writes.map((r) => r.request.subject.purpose).sort()).toEqual([
        "role-fields",
        "role-prompt",
      ]);
    });
  }

  // The mechanism, not just its effect: matching reads `subject.path` and every
  // entry of `subject.files` (`collectPaths`, action-policy-engine.ts), so the
  // two halves are inseparable exactly as long as both present the same pair.
  it("presents both files of the Save in both subjects", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    expect((await patchRole(server, { permissions: "code_write" })).status).toBe(200);
    expect((await putPrompt(server, "You are a careful planner.\n")).status).toBe(200);

    const writes = await roleWriteRecords(project);
    const byPurpose = new Map(
      writes.map((r) => [r.request.subject.purpose as string, r.request.subject]),
    );
    const pair = [configFile(project), roleFile(project)];
    expect(byPurpose.get("role-fields")?.files).toEqual(pair);
    expect(byPurpose.get("role-prompt")?.files).toEqual(pair);
    // `path` still names the file each write actually lands in, so the audit
    // trail says which one changed.
    expect(byPurpose.get("role-fields")?.path).toBe(configFile(project));
    expect(byPurpose.get("role-prompt")?.path).toBe(roleFile(project));
  });

  // The subject never drops the role file, whatever the config says. Dropping
  // it was a second spelling of the same split: a config that cannot name the
  // file narrows the subject to project.yml alone, a roles-directory rule stops
  // matching, and the field write lands. A role the config does not name is the
  // cheapest way to reach that state, so the refusal has to be the policy's,
  // not a 400 from the writer that happens to arrive first.
  it("refuses a field write for a role the config does not name", async () => {
    const project = await makeProject();
    await denyFileWrites(project, "**/.vibestrate/roles/**");
    const configBefore = await fs.readFile(configFile(project), "utf8");
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await patchRole(server, { permissions: "code_write" }, "ghost");
    expect(res.status).toBe(403);
    expect(await fs.readFile(configFile(project), "utf8")).toBe(configBefore);

    // The substituted path is the conventional location, so the rule a user
    // writes to freeze instructions covers a role whose file does not exist yet.
    const [write] = await roleWriteRecords(project);
    expect(write?.request.subject.files).toEqual([
      configFile(project),
      path.join(project, ".vibestrate", "roles", "ghost.json"),
    ]);
  });

  // The reachable form of the same narrowing, and the reason the fallback is
  // not belt-and-braces. `seats: []` fails the schema, so a subject that gave
  // up on an unreadable config named project.yml alone - and the patch that
  // supplies a seat makes the config valid again, so the write lands. One
  // request, invalid going in and valid coming out, carrying a permission flip
  // past a rule written to freeze the role.
  it("refuses a field write that repairs an invalid config while flipping permissions", async () => {
    const project = await makeProject();
    const broken = (await fs.readFile(configFile(project), "utf8")).replace(
      "seats: [planner]",
      "seats: []",
    );
    expect(broken).toMatch(/seats: \[\]/);
    await fs.writeFile(configFile(project), broken);
    await denyFileWrites(project, "**/.vibestrate/roles/**");
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await patchRole(server, {
      seats: ["planner"],
      permissions: "code_write",
    });

    expect(res.status).toBe(403);
    expect(await fs.readFile(configFile(project), "utf8")).toBe(broken);
  });

  // A role whose `prompt` is a YAML alias is the config-authored version of the
  // same split. `doc.getIn` returns an Alias node rather than a string, so a
  // subject built off the raw document could not see the role file and narrowed
  // to project.yml - while the write landed, because it validates the resolved
  // document, where the alias is a perfectly good path. Measured before the fix:
  // under a roles-directory rule the plain-string role was refused and the
  // aliased role's permission flip and skill assignment both returned 200.
  describe("a role whose prompt is a YAML alias", () => {
    it("is refused the same as a plain-string role under a roles-directory rule", async () => {
      const project = await makeProject();
      await addSkill(project);
      await aliasArchitectPrompt(project);
      await denyFileWrites(project, "**/.vibestrate/roles/**");
      const configBefore = await fs.readFile(configFile(project), "utf8");
      server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

      const plain = await patchRole(server, { permissions: "code_write" });
      const aliased = await patchRole(
        server,
        { permissions: "code_write" },
        "architect",
      );
      const skill = await skillAssignment(server, "assign", "architect");

      expect([plain.status, aliased.status, skill.status]).toEqual([403, 403, 403]);
      expect(await fs.readFile(configFile(project), "utf8")).toBe(configBefore);
    });

    // The sharp edge of the alias bug. A subject built off the raw document
    // cannot resolve the alias, so it names the conventional
    // `roles/architect.json` instead of the `roles/planner.json` the config
    // actually points at - and a rule naming that file stops matching while the
    // architect's instructions are exactly what it was written to freeze.
    it("is refused by a rule naming the file the alias points at", async () => {
      const project = await makeProject();
      await addSkill(project);
      await aliasArchitectPrompt(project);
      await denyFileWrites(project, "**/roles/planner.json");
      const configBefore = await fs.readFile(configFile(project), "utf8");
      server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

      const fields = await patchRole(
        server,
        { permissions: "code_write" },
        "architect",
      );
      const skill = await skillAssignment(server, "assign", "architect");

      expect([fields.status, skill.status]).toEqual([403, 403]);
      expect(await fs.readFile(configFile(project), "utf8")).toBe(configBefore);
    });

    it("names the role file the alias resolves to", async () => {
      const project = await makeProject();
      await addSkill(project);
      await aliasArchitectPrompt(project);
      server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

      expect(
        (await patchRole(server, { permissions: "code_write" }, "architect")).status,
      ).toBe(200);
      expect((await skillAssignment(server, "assign", "architect")).status).toBe(200);

      const pair = [configFile(project), roleFile(project)];
      for (const write of await roleWriteRecords(project)) {
        expect(write.request.subject.files).toEqual(pair);
      }
    });
  });

  // A skill assignment lands in project.yml alone, so it is one op and cannot be
  // split - but it presents the same pair, because what it grants is not
  // separable from what the role file grants. A skill is instruction text
  // replayed into every turn the role takes, and it can carry MCP servers, so
  // assigning one hands the role new instructions and new tools. A rule written
  // to freeze a role's instructions has to refuse it either way it is written.
  for (const glob of ["**/project.yml", "**/.vibestrate/roles/**"] as const) {
    it(`stops a skill assignment under ${glob}`, async () => {
      const project = await makeProject();
      await addSkill(project);
      await denyFileWrites(project, glob);
      const before = await fs.readFile(configFile(project), "utf8");
      server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

      expect((await skillAssignment(server, "assign")).status).toBe(403);
      expect(await fs.readFile(configFile(project), "utf8")).toBe(before);
    });
  }
});

import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { loadConfig } from "../src/project/config-loader.js";
import { projectConfigPath, projectFlowsDir } from "../src/utils/paths.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

// Route-level cover for the assisted-authoring endpoints. The services have their own
// tests (tests/flow-assist.test.ts, tests/crew-assist.test.ts) with a fake
// runner injected; nothing can inject a runner over HTTP, so these drive the
// real provider path through a fake CLI and assert the properties only the
// route owns: the body schema, the error mapping, and that a draft leaves the
// project exactly as it found it.

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

const VALID_FLOW = {
  id: "triage-fix",
  version: 1,
  label: "Triage and fix",
  description: "Plan the fix, implement it, then review the diff.",
  seats: {
    planner: { label: "Planner" },
    implementer: { label: "Implementer" },
    reviewer: { label: "Reviewer" },
  },
  steps: [
    {
      id: "plan",
      label: "Plan",
      kind: "agent-turn",
      seat: "planner",
      stage: "planning",
      inputs: ["task-brief"],
      outputs: ["plan"],
    },
    {
      id: "implement",
      label: "Implement",
      kind: "agent-turn",
      seat: "implementer",
      stage: "executing",
      inputs: ["task-brief", "plan"],
      outputs: ["execution", "diff"],
    },
    {
      id: "review",
      label: "Review",
      kind: "review-turn",
      seat: "reviewer",
      stage: "reviewing",
      inputs: ["diff"],
      outputs: ["findings", "review-decision"],
    },
  ],
};

/** The crew answer as the MODEL returns it: instructions as `promptText`, never
 *  a file path. The drafter derives each role file's location itself, so a fake
 *  CLI that emits a `prompt` pointer is rejected by the schema, not accepted. */
function crewFor(profile: string, opts: { secret?: boolean } = {}) {
  return {
    crewId: "duo",
    crew: {
      label: "Duo",
      roles: {
        // Fresh role ids: a drafted role whose id matches a scaffolded role file
        // is reported as a would-be replacement, which is a different case.
        "duo-planner": {
          label: opts.secret ? "Planner for AKIAIOSFODNN7EXAMPLE" : "Planner",
          seats: ["planner"],
          profile,
          promptText: "You turn a loose request into a short, ordered plan.",
          permissions: "read_only",
          skills: [],
        },
        "duo-builder": {
          label: "Builder",
          seats: ["implementer"],
          profile,
          promptText: "You implement the plan one step at a time and stop at the first failure.",
          permissions: "code_write",
          skills: [],
        },
      },
    },
    rationale: "Two roles cover planning and implementation.",
    currency: { checked: [], unverified: ["assumed the profile's model is current"] },
  };
}

/** The revised flow the fake returns: the same flow with a validation step
 *  appended, so the route's change summary has exactly one thing to report. */
const REVISED_FLOW = {
  ...VALID_FLOW,
  steps: [
    ...VALID_FLOW.steps,
    {
      id: "validate",
      label: "Validate",
      kind: "validation",
      inputs: ["diff"],
      outputs: ["validation"],
    },
  ],
};

/** One fake CLI standing in for the provider, answering whichever draft the
 *  prompt asks for. `runAssist` labels the prompt, so the branch is on the
 *  label it stamps in the header, not on any wording we control. The revision
 *  branch splits again on the owner's own instruction, because a question and
 *  an edit are two different right answers from one endpoint. */
function fakeCliSource(profile: string, opts: { secretCrew?: boolean } = {}): string {
  const flowAnswer = JSON.stringify({
    flow: VALID_FLOW,
    rationale: "A linear plan/implement/review shape is the simplest fit.",
    currency: { checked: [], unverified: ["assumed the toolchain is current"] },
  });
  const reviseAnswer = JSON.stringify({
    flow: REVISED_FLOW,
    answer: "Added a validation step after the review.",
    currency: { checked: [], unverified: [] },
  });
  const questionAnswer = JSON.stringify({
    flow: null,
    answer: "No role in this crew declares that seat.",
    currency: { checked: [], unverified: [] },
  });
  const crewAnswer = JSON.stringify(crewFor(profile, { secret: opts.secretCrew }));
  return `#!/usr/bin/env node
let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  console.log(
    i.includes('Assist - flow-draft') ? ${JSON.stringify(flowAnswer)}
    : i.includes('Assist - flow-revise')
      ? (i.includes('why is') ? ${JSON.stringify(questionAnswer)} : ${JSON.stringify(reviseAnswer)})
    : ${JSON.stringify(crewAnswer)});
});
`;
}

/** A provider that never answers - the path that must NOT become a 400. */
const FAKE_CLI_FAILS = `#!/usr/bin/env node
let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  console.error("you are not logged in");
  process.exit(1);
});
`;

async function makeProject(
  opts: { failing?: boolean; secretCrew?: boolean } = {},
): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-flowassist-srv-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

  const profile = await firstProfileId(dir);
  const fakeJs = path.join(dir, "fake.js");
  await fs.writeFile(
    fakeJs,
    opts.failing ? FAKE_CLI_FAILS : fakeCliSource(profile, { secretCrew: opts.secretCrew }),
    { mode: 0o755 },
  );
  await fs.chmod(fakeJs, 0o755);
  await setConfigValue(
    dir,
    "providers.fake",
    JSON.stringify({ type: "cli", command: "node", args: [fakeJs], input: "stdin" }),
  );
  // The assist resolves its provider from the crew planner's profile.
  await setConfigValue(dir, `profiles.${profile}.provider`, "fake");
  return dir;
}

async function firstProfileId(projectRoot: string): Promise<string> {
  const { config } = await loadConfig(projectRoot);
  const id = Object.keys(config.profiles)[0];
  if (!id) throw new Error("fixture project has no profiles");
  return id;
}

/** Every file under `.vibestrate/flows/`, content-hashed. Absent dir -> []. */
async function snapshotFlowsDir(projectRoot: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string, rel: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(dir, entry.name);
      const next = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(abs, next);
      else {
        const hash = createHash("sha256").update(await fs.readFile(abs)).digest("hex");
        out.push(`${next}:${hash}`);
      }
    }
  }
  await walk(projectFlowsDir(projectRoot), "");
  return out;
}

async function postJson(server: StartedServer, route: string, body: unknown) {
  return fetch(`${server.url}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

let server: StartedServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

describe("POST /api/flows/draft", () => {
  it("returns a draft and creates no flow", async () => {
    const project = await makeProject();
    const before = await snapshotFlowsDir(project);
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await postJson(server, "/api/flows/draft", {
      description: "plan a fix, implement it, then review the diff",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      draft: {
        flow: { id: string };
        yaml: string;
        targetPath: string;
        exists: boolean;
        currency: { checked: string[]; unverified: string[] };
        coverage: { runnable: boolean };
      };
    };
    expect(body.draft.flow.id).toBe("triage-fix");
    expect(body.draft.yaml).toContain("id: triage-fix");
    expect(body.draft.targetPath).toBe(
      path.join(".vibestrate", "flows", "triage-fix", "flow.yml"),
    );
    expect(body.draft.exists).toBe(false);
    expect(body.draft.coverage.runnable).toBe(true);
    // Model self-report, carried whole: the owner reviews what was not checked.
    expect(body.draft.currency.unverified).toEqual(["assumed the toolchain is current"]);

    // The route is read-only. A draft that reached disk here would mean the
    // owner never got to accept or reject it.
    expect(await snapshotFlowsDir(project)).toEqual(before);
  });

  it("rejects an over-long description with 400", async () => {
    const project = await makeProject();
    const before = await snapshotFlowsDir(project);
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await postJson(server, "/api/flows/draft", {
      description: "a".repeat(1001),
    });
    expect(res.status).toBe(400);
    expect(await snapshotFlowsDir(project)).toEqual(before);
  });

  it("rejects an unknown field with 400", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await postJson(server, "/api/flows/draft", {
      description: "plan, implement, review",
      overwrite: true,
    });
    expect(res.status).toBe(400);
  });

  it("rejects an unknown crew id with 400, not a 500", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await postJson(server, "/api/flows/draft", {
      description: "plan, implement, review",
      crewId: "no-such-crew",
    });
    // Bad caller input the service (not the body schema) catches - it must map
    // to 400, or a typo in a crew id reads as a server fault.
    expect(res.status).toBe(400);
  });

  it("surfaces a provider failure as 500 and leaves the flows directory untouched", async () => {
    const project = await makeProject({ failing: true });
    const before = await snapshotFlowsDir(project);
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await postJson(server, "/api/flows/draft", {
      description: "plan, implement, review",
    });
    // A provider that never answered is a server-side failure, not the caller's
    // bad input - flattening it to 400 would tell the owner to fix their prompt.
    expect(res.status).toBe(500);
    expect(await snapshotFlowsDir(project)).toEqual(before);
  });

  it("keeps the project's absolute path out of a 500 body", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    // A hand-broken config is the realistic way a filesystem path reaches an
    // error message here: the loader interpolates the file it failed on.
    await fs.writeFile(projectConfigPath(project), "providers: [unclosed\n");

    const res = await postJson(server, "/api/flows/draft", {
      description: "plan, implement, review",
    });
    expect(res.status).toBe(500);
    // The failure is rethrown rather than wrapped in an HttpError, whose message
    // the error handler sends verbatim. Mutation check: wrap it and this fails.
    expect(JSON.stringify(await res.json())).not.toContain(project);
  });
});

describe("POST /api/flows/revise", () => {
  it("returns a revision of the flow it was given, and creates no flow", async () => {
    const project = await makeProject();
    const before = await snapshotFlowsDir(project);
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await postJson(server, "/api/flows/revise", {
      flow: VALID_FLOW,
      instruction: "this flow never validates - fix that",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      revision: {
        flow: { steps: { id: string }[] } | null;
        yaml: string | null;
        answer: string;
        changes: { target: string; op: string; id: string | null; summary: string }[];
        coverage: { runnable: boolean } | null;
      };
    };
    expect(body.revision.flow?.steps.map((s) => s.id)).toEqual([
      "plan",
      "implement",
      "review",
      "validate",
    ]);
    expect(body.revision.yaml).toContain("id: validate");
    // Derived over the wire, not restated from the model's answer: the route
    // carries the same one change the service computed.
    expect(body.revision.changes).toHaveLength(1);
    expect(body.revision.changes[0]).toMatchObject({
      target: "step",
      op: "added",
      id: "validate",
    });
    expect(body.revision.coverage?.runnable).toBe(true);

    // Applying a revision is the owner's separate action; proposing one writes
    // nothing.
    expect(await snapshotFlowsDir(project)).toEqual(before);
  });

  it("answers a question with a null revision and a 200", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await postJson(server, "/api/flows/revise", {
      flow: VALID_FLOW,
      instruction: "why is the reviewer seat the one judging the diff?",
    });
    // No edit is a valid outcome. A 400 here would teach the UI to treat every
    // question as a failed request.
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      revision: { flow: unknown; yaml: unknown; answer: string; changes: unknown[] };
    };
    expect(body.revision.flow).toBeNull();
    expect(body.revision.yaml).toBeNull();
    expect(body.revision.changes).toEqual([]);
    expect(body.revision.answer).toContain("crew");
  });

  it("accepts a flow that does not parse", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await postJson(server, "/api/flows/revise", {
      // Mid-edit: an underscore in a step id, which the schema rejects. Refusing
      // this at the body schema would make "fix what is broken" unanswerable.
      flow: {
        ...VALID_FLOW,
        steps: [{ ...VALID_FLOW.steps[0], id: "plan_step" }, ...VALID_FLOW.steps.slice(1)],
      },
      instruction: "the first step id is not valid - fix it",
    });
    expect(res.status).toBe(200);
  });

  it("rejects an over-long instruction and an unknown field with 400", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    expect(
      (
        await postJson(server, "/api/flows/revise", {
          flow: VALID_FLOW,
          instruction: "a".repeat(1001),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await postJson(server, "/api/flows/revise", {
          flow: VALID_FLOW,
          instruction: "add a step",
          overwrite: true,
        })
      ).status,
    ).toBe(400);
  });

  it("surfaces a provider failure as 500 and leaves the flows directory untouched", async () => {
    const project = await makeProject({ failing: true });
    const before = await snapshotFlowsDir(project);
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await postJson(server, "/api/flows/revise", {
      flow: VALID_FLOW,
      instruction: "add a validation step",
    });
    // Same split as /draft: a provider that never answered is a server-side
    // failure, not the caller's bad input.
    expect(res.status).toBe(500);
    expect(await snapshotFlowsDir(project)).toEqual(before);
  });
});

describe("POST /api/crews/draft", () => {
  it("returns a draft and leaves project.yml byte-identical", async () => {
    const project = await makeProject();
    const before = await fs.readFile(projectConfigPath(project), "utf8");
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await postJson(server, "/api/crews/draft", {
      description: "a small crew: one planner and one implementer",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      draft: {
        crewId: string;
        yaml: string;
        roleFiles: { roleId: string; path: string; json: string }[];
        problems: string[];
        exists: boolean;
        currency: { checked: string[]; unverified: string[] };
      };
    };
    expect(body.draft.crewId).toBe("duo");
    expect(body.draft.yaml).toContain("duo:");
    // A drafted crew is two artifacts, and the route has to carry both: without
    // roleFiles the owner would install a crew whose roles have no instructions.
    expect(body.draft.roleFiles.map((f) => f.path)).toEqual([
      ".vibestrate/roles/duo-planner.json",
      ".vibestrate/roles/duo-builder.json",
    ]);
    // A fresh draft has no defects, but its role files are not on disk yet, and
    // that is the step an owner most easily skips - so the outstanding paths are
    // named rather than left implicit in an empty list.
    expect(body.draft.problems).toHaveLength(1);
    expect(body.draft.problems[0]).toContain("Still to write");
    expect(body.draft.problems[0]).toContain(".vibestrate/roles/duo-planner.json");
    expect(body.draft.problems[0]).toContain(".vibestrate/roles/duo-builder.json");
    expect(body.draft.exists).toBe(false);
    expect(body.draft.currency.unverified).toEqual([
      "assumed the profile's model is current",
    ]);

    // Installing a crew is the owner's separate action; drafting one writes
    // nothing into the config.
    expect(await fs.readFile(projectConfigPath(project), "utf8")).toBe(before);
  });

  it("rejects an over-long description with 400", async () => {
    const project = await makeProject();
    const before = await fs.readFile(projectConfigPath(project), "utf8");
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await postJson(server, "/api/crews/draft", {
      description: "a".repeat(1001),
    });
    expect(res.status).toBe(400);
    expect(await fs.readFile(projectConfigPath(project), "utf8")).toBe(before);
  });

  it("returns 400, not 500, when the service refuses a secret-shaped draft", async () => {
    const project = await makeProject({ secretCrew: true });
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await postJson(server, "/api/crews/draft", {
      description: "a crew for our AWS work",
    });
    // The refusal happens after the model answered, so only the service's own
    // error type distinguishes it from a server fault. Mutation check: drop the
    // CrewAssistError branch in the route and this becomes a 500.
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/refusing to return this drafted crew/i);
  });
});

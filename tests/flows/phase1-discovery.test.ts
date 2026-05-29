import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  discoverFlows,
  discoverFlowCatalog,
} from "../../src/flows/catalog/flow-discovery.js";
import {
  startServer,
  type StartedServer,
} from "../../src/server/server.js";

const PROJECT_CONFIG = `project:
  name: flows-phase1
providers:
  claude:
    type: cli
    command: __flow_phase1_claude_must_not_run__
  codex:
    type: cli
    command: __flow_phase1_codex_must_not_run__
profiles:
  claude-balanced:
    provider: claude
  codex-balanced:
    provider: codex
crews:
  default:
    roles:
      planner:
        seats: [planner]
        profile: claude-balanced
        prompt: .vibestrate/roles/planner.md
        permissions: readOnly
      architect:
        seats: [architect]
        profile: claude-balanced
        prompt: .vibestrate/roles/architect.md
        permissions: readOnly
      executor:
        seats: [implementer, builder]
        profile: claude-balanced
        prompt: .vibestrate/roles/executor.md
        permissions: codeWrite
      fixer:
        seats: [fixer]
        profile: claude-balanced
        prompt: .vibestrate/roles/fixer.md
        permissions: codeWrite
      reviewer:
        seats: [reviewer, challenger]
        profile: codex-balanced
        prompt: .vibestrate/roles/reviewer.md
        permissions: readOnly
      verifier:
        seats: [verifier, arbiter]
        profile: codex-balanced
        prompt: .vibestrate/roles/verifier.md
        permissions: readOnly
defaultCrew: default
`;

const PROJECT_FLOW = `id: project-review
version: 1
label: Project Review
description: Project-local review recipe.
seats:
  reviewer:
    label: Reviewer
steps:
  - id: review
    label: Review
    kind: review-turn
    seat: reviewer
    inputs: [diff]
    outputs: [findings]
`;

async function makeProject(): Promise<string> {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-flows-phase1-"));
  await fs.mkdir(path.join(projectRoot, ".vibestrate"), { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, ".vibestrate", "project.yml"),
    PROJECT_CONFIG,
  );
  await fs.mkdir(path.join(projectRoot, ".vibestrate", "flows", "project-review"), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(projectRoot, ".vibestrate", "flows", "project-review", "flow.yml"),
    PROJECT_FLOW,
  );
  return projectRoot;
}

let server: StartedServer | null = null;

afterEach(async () => {
  if (server) await server.close();
  server = null;
});

describe("Flow Phase 1 discovery", () => {
  it("discovers built-in and project Flow definitions", async () => {
    const projectRoot = await makeProject();
    const flows = await discoverFlows(projectRoot);

    expect(flows.map((flow) => flow.id)).toEqual(
      expect.arrayContaining(["quality-arbitration", "project-review"]),
    );
    expect(flows.find((flow) => flow.id === "project-review")).toEqual(
      expect.objectContaining({
        source: expect.objectContaining({ kind: "project" }),
        definitionPath: expect.stringMatching(/flow\.yml$/),
      }),
    );
  });

  it("lets a project flow shadow a builtin of the same id (fork to customize)", async () => {
    const projectRoot = await makeProject();
    await fs.mkdir(
      path.join(projectRoot, ".vibestrate", "flows", "quality-arbitration"),
      { recursive: true },
    );
    await fs.writeFile(
      path.join(
        projectRoot,
        ".vibestrate",
        "flows",
        "quality-arbitration",
        "flow.yml",
      ),
      PROJECT_FLOW.replace("project-review", "quality-arbitration"),
    );

    const flows = await discoverFlows(projectRoot);
    const winner = flows.filter((g) => g.id === "quality-arbitration");
    // Exactly one entry, and it's the project copy (not the builtin).
    expect(winner).toHaveLength(1);
    expect(winner[0]!.source.kind).toBe("project");
  });

  it("keeps one of two project flows with the same id and reports the duplicate", async () => {
    const projectRoot = await makeProject();
    await fs.mkdir(path.join(projectRoot, ".vibestrate", "flows", "dup"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(projectRoot, ".vibestrate", "flows", "dup", "flow.yml"),
      PROJECT_FLOW, // id stays project-review → collides with the first
    );
    // Resilient: the conflict is reported, not thrown — one wins, the rest are
    // flagged invalid so the catalog (and other flows) still load.
    const { flows, invalid } = await discoverFlowCatalog(projectRoot);
    expect(flows.filter((g) => g.id === "project-review")).toHaveLength(1);
    expect(invalid.some((i) => /duplicate flow id "project-review"/i.test(i.message))).toBe(true);
  });

  it("skips a malformed project flow but still returns the valid ones", async () => {
    const projectRoot = await makeProject();
    await fs.mkdir(path.join(projectRoot, ".vibestrate", "flows", "broken"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(projectRoot, ".vibestrate", "flows", "broken", "flow.yml"),
      "id: broken\nversion: 1\nlabel: Broken\n# missing description/slots/steps\n",
    );
    const { flows, invalid } = await discoverFlowCatalog(projectRoot);
    // Builtins + the valid project flow still load; the broken one is reported.
    expect(flows.some((g) => g.id === "quality-arbitration")).toBe(true);
    expect(flows.some((g) => g.id === "project-review")).toBe(true);
    expect(flows.some((g) => g.id === "broken")).toBe(false);
    expect(invalid.some((i) => i.path.includes("broken"))).toBe(true);
  });
});

describe("Flow Phase 1 server preview", () => {
  it("lists Flows and resolves the shared preview snapshot", async () => {
    const projectRoot = await makeProject();
    server = await startServer({ projectRoot, port: 0, host: "127.0.0.1" });

    const list = (await fetch(`${server.url}/api/flows`).then((res) =>
      res.json(),
    )) as { flows: { id: string }[] };
    expect(list.flows.map((flow) => flow.id)).toContain("quality-arbitration");

    const res = await fetch(
      `${server.url}/api/flows/quality-arbitration/resolve`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          task: "Preview the quality arbitration plan.",
          stepProfileOverrides: { implement: "codex-balanced" },
          skippedOptionalSteps: ["plan-review"],
        }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      snapshot: {
        flowId: string;
        crewId: string;
        seats: { id: string }[];
        steps: { id: string; enabled: boolean; profileId: string | null }[];
      };
    };
    expect(body.snapshot.flowId).toBe("quality-arbitration");
    expect(body.snapshot.seats.map((s) => s.id)).toContain("challenger");
    // The step-level Profile override is applied to the resolved step.
    expect(body.snapshot.steps).toContainEqual(
      expect.objectContaining({ id: "implement", profileId: "codex-balanced" }),
    );
    expect(body.snapshot.steps).toContainEqual(
      expect.objectContaining({ id: "plan-review", enabled: false }),
    );
  });

  it("returns a client error for an override that references an unknown step", async () => {
    const projectRoot = await makeProject();
    server = await startServer({ projectRoot, port: 0, host: "127.0.0.1" });

    const res = await fetch(
      `${server.url}/api/flows/quality-arbitration/resolve`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          task: "Reject an unknown step override before providers run.",
          stepProfileOverrides: { "no-such-step": "codex-balanced" },
        }),
      },
    );
    expect(res.status).toBe(400);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import YAML from "yaml";
import { startServer, type StartedServer } from "../src/server/server.js";

const PROJECT_CONFIG = `project:
  name: portability
providers:
  claude:
    type: cli
    command: __portability_claude_must_not_run__
profiles:
  claude-balanced:
    provider: claude
crews:
  default:
    roles:
      worker:
        seats: [worker]
        profile: claude-balanced
        prompt: .vibestrate/roles/worker.md
        permissions: readOnly
defaultCrew: default
`;

const NEW_FLOW = {
  id: "created-flow",
  version: 1,
  label: "Created Flow",
  description: "Created over the API.",
  seats: { worker: { label: "Worker" } },
  steps: [{ id: "do", label: "Do", kind: "agent-turn", seat: "worker" }],
};

const NEW_FLOW_YAML = `id: imported-flow
version: 1
label: Imported Flow
description: Imported over the API.
seats:
  worker:
    label: Worker
steps:
  - id: do
    label: Do
    kind: agent-turn
    seat: worker
`;

async function makeProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-portab-srv-"));
  await fs.mkdir(path.join(root, ".vibestrate", "flows"), { recursive: true });
  await fs.writeFile(path.join(root, ".vibestrate", "project.yml"), PROJECT_CONFIG);
  return root;
}

let server: StartedServer | null = null;
const roots: string[] = [];
afterEach(async () => {
  if (server) await server.close();
  server = null;
  while (roots.length) {
    await fs.rm(roots.pop()!, { recursive: true, force: true }).catch(() => undefined);
  }
});

async function boot(opts?: { apiToken?: string }): Promise<StartedServer> {
  const root = await makeProject();
  roots.push(root);
  server = await startServer({
    projectRoot: root,
    port: 0,
    host: "127.0.0.1",
    apiToken: opts?.apiToken,
  });
  return server;
}

describe("POST /api/flows (flow creator)", () => {
  it("creates a project flow (201) and lists it", async () => {
    const s = await boot();
    const res = await fetch(`${s.url}/api/flows`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ flow: NEW_FLOW }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok: boolean; flow: { source: { kind: string } } };
    expect(body.ok).toBe(true);
    expect(body.flow.source.kind).toBe("project");

    const list = await (await fetch(`${s.url}/api/flows`)).json() as { flows: { id: string }[] };
    expect(list.flows.some((f) => f.id === "created-flow")).toBe(true);
  });

  it("409s on duplicate without overwrite, 200 with overwrite", async () => {
    const s = await boot();
    const mk = (overwrite?: boolean) =>
      fetch(`${s.url}/api/flows`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ flow: NEW_FLOW, overwrite }),
      });
    expect((await mk()).status).toBe(201);
    expect((await mk()).status).toBe(409);
    expect((await mk(true)).status).toBe(200);
  });

  it("400s on an invalid definition", async () => {
    const s = await boot();
    const res = await fetch(`${s.url}/api/flows`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ flow: { id: "x", version: 0 } }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/flows/import", () => {
  it("imports raw YAML (201)", async () => {
    const s = await boot();
    const res = await fetch(`${s.url}/api/flows/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ yaml: NEW_FLOW_YAML }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { flowId: string };
    expect(body.flowId).toBe("imported-flow");
  });

  it("400s when neither or both of yaml/url are given", async () => {
    const s = await boot();
    const neither = await fetch(`${s.url}/api/flows/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(neither.status).toBe(400);
    const both = await fetch(`${s.url}/api/flows/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ yaml: NEW_FLOW_YAML, url: "https://example.test/f.yml" }),
    });
    expect(both.status).toBe(400);
  });

  it("400s on schema-invalid YAML", async () => {
    const s = await boot();
    const res = await fetch(`${s.url}/api/flows/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ yaml: "id: Bad_Id\nversion: 1\n" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/flows/:id/export", () => {
  it("exports a builtin as JSON", async () => {
    const s = await boot();
    const res = await fetch(`${s.url}/api/flows/default/export`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { flowId: string; yaml: string };
    expect(body.flowId).toBe("default");
    expect(YAML.parse(body.yaml).id).toBe("default");
  });

  it("exports raw YAML with ?format=yaml + attachment header", async () => {
    const s = await boot();
    const res = await fetch(`${s.url}/api/flows/default/export?format=yaml`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/yaml/);
    expect(res.headers.get("content-disposition")).toMatch(/default\.flow\.yml/);
    const text = await res.text();
    expect(YAML.parse(text).id).toBe("default");
  });

  it("404s for an unknown flow", async () => {
    const s = await boot();
    const res = await fetch(`${s.url}/api/flows/nope/export`);
    expect(res.status).toBe(404);
  });
});

describe("/api/v1 versioned alias", () => {
  it("serves /api/v1/flows identically to /api/flows", async () => {
    const s = await boot();
    const v1 = await fetch(`${s.url}/api/v1/flows`);
    expect(v1.status).toBe(200);
    const body = (await v1.json()) as { flows: unknown[] };
    expect(Array.isArray(body.flows)).toBe(true);
  });

  it("serves /api/v1/health", async () => {
    const s = await boot();
    const res = await fetch(`${s.url}/api/v1/health`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
  });

  it("does not mangle a path that merely starts with /api/v (e.g. /api/version)", async () => {
    const s = await boot();
    // No such route exists, but it must 404 as an API miss — proving it wasn't
    // rewritten to "/apiersion" or similar.
    const res = await fetch(`${s.url}/api/version`);
    expect(res.status).toBe(404);
  });
});

describe("bearer-token auth", () => {
  it("401s without a token and 200s with the right one", async () => {
    const s = await boot({ apiToken: "s3cret-token" });
    const noAuth = await fetch(`${s.url}/api/flows`);
    expect(noAuth.status).toBe(401);

    const wrong = await fetch(`${s.url}/api/flows`, {
      headers: { authorization: "Bearer nope" },
    });
    expect(wrong.status).toBe(401);

    const ok = await fetch(`${s.url}/api/flows`, {
      headers: { authorization: "Bearer s3cret-token" },
    });
    expect(ok.status).toBe(200);
  });

  it("guards the versioned alias too", async () => {
    const s = await boot({ apiToken: "s3cret-token" });
    const noAuth = await fetch(`${s.url}/api/v1/flows`);
    expect(noAuth.status).toBe(401);
    const ok = await fetch(`${s.url}/api/v1/flows`, {
      headers: { authorization: "Bearer s3cret-token" },
    });
    expect(ok.status).toBe(200);
  });

  it("leaves static assets (favicon) open", async () => {
    const s = await boot({ apiToken: "s3cret-token" });
    const res = await fetch(`${s.url}/favicon.svg`);
    expect(res.status).toBe(200);
  });

  it("refuses to bind a non-loopback host without a token", async () => {
    const root = await makeProject();
    roots.push(root);
    await expect(
      startServer({ projectRoot: root, port: 0, host: "0.0.0.0" }),
    ).rejects.toThrow(/token/i);
  });
});

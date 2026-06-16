import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const claudeOk: ProviderDetectionRunner = async (cmd) =>
  cmd === "claude"
    ? { exitCode: 0, stdout: "Claude Code 2.1.0", stderr: "" }
    : { exitCode: 127, stdout: "", stderr: "" };

const FLOW_YML = `id: site
version: 1
label: Make a site
description: Scaffold a marketing site
seats:
  builder:
    label: Builder
params:
  name:
    type: string
    required: true
    description: The site name
  niche:
    type: string
    shared: true
  count:
    type: number
    default: 3
  api_key:
    type: string
    secret: true
  palette:
    type: string
    generate:
      instruction: Generate a color palette for a {{params.niche}} brand
steps:
  - id: build
    label: Build
    kind: agent-turn
    seat: builder
`;

async function makeProject(): Promise<string> {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-profile-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: project });
  await execa("git", ["config", "user.email", "x@x"], { cwd: project });
  await execa("git", ["config", "user.name", "x"], { cwd: project });
  await fs.writeFile(
    path.join(project, "package.json"),
    JSON.stringify({ name: "demo", scripts: { test: "vitest" } }),
  );
  await fs.writeFile(path.join(project, "pnpm-lock.yaml"), "");
  await execa("git", ["add", "."], { cwd: project });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: project });
  await applySetup({ options: { projectRoot: project }, detectionRunner: claudeOk });
  await fs.mkdir(path.join(project, ".vibestrate/flows/site"), { recursive: true });
  await fs.writeFile(path.join(project, ".vibestrate/flows/site/flow.yml"), FLOW_YML);
  return project;
}

let server: StartedServer | null = null;
afterEach(async () => {
  if (server) await server.close();
  server = null;
});

const post = (url: string, body: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("profile routes", () => {
  it("set (flow-scoped) -> read -> flow view -> delete", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    let res = await fetch(`${server.url}/api/params`);
    expect(res.status).toBe(200);
    expect((await res.json()).params.values).toEqual({});

    res = await post(`${server.url}/api/params`, {
      flowId: "site",
      values: { name: "Acme", niche: "SaaS", count: "5" },
    });
    expect(res.status).toBe(200);

    res = await fetch(`${server.url}/api/params`);
    const stored = (await res.json()).params.values as Record<string, { value: string }>;
    // namespaced vs shared keys
    expect(stored["site.name"]!.value).toBe("Acme");
    expect(stored["niche"]!.value).toBe("SaaS");
    expect(stored["site.count"]!.value).toBe("5");

    // flow view is keyed by param name (for prefill)
    res = await fetch(`${server.url}/api/params/flow/site`);
    const view = (await res.json()).values as Record<string, { value: string; secret: boolean }>;
    expect(view.name!.value).toBe("Acme");
    expect(view.niche!.value).toBe("SaaS");

    res = await fetch(`${server.url}/api/params/site.name`, { method: "DELETE" });
    expect(res.status).toBe(200);
    res = await fetch(`${server.url}/api/params`);
    expect((await res.json()).params.values["site.name"]).toBeUndefined();
  });

  it("a secret value is stored as env:NAME and blanked in the flow view", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await post(`${server.url}/api/params`, {
      flowId: "site",
      values: { api_key: "OPENAI_API_KEY" },
    });
    expect(res.status).toBe(200);

    const stored = (await (await fetch(`${server.url}/api/params`)).json()).params.values;
    expect(stored["site.api_key"].value).toBe("env:OPENAI_API_KEY");
    expect(stored["site.api_key"].secret).toBe(true);

    const view = (await (await fetch(`${server.url}/api/params/flow/site`)).json()).values;
    expect(view.api_key.secret).toBe(true);
    expect(view.api_key.value).toBe(""); // never prefilled into a form
  });

  it("rejects a bad-typed value (400)", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    const res = await post(`${server.url}/api/params`, {
      flowId: "site",
      values: { count: "not-a-number" },
    });
    expect(res.status).toBe(400);
  });

  it("generate refuses a non-generatable param and a secret (400, no provider call)", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    let res = await post(`${server.url}/api/params/generate`, { flowId: "site", param: "name" });
    expect(res.status).toBe(400); // `name` has no generate hint

    res = await post(`${server.url}/api/params/generate`, { flowId: "site", param: "api_key" });
    expect(res.status).toBe(400); // secret -> never generated
  });
});

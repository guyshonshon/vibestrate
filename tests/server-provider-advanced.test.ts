import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeProject(): Promise<string> {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-padv-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: project });
  await execa("git", ["config", "user.email", "x@x"], { cwd: project });
  await execa("git", ["config", "user.name", "x"], { cwd: project });
  await fs.writeFile(path.join(project, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: project });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: project });
  await applySetup({ options: { projectRoot: project }, detectionRunner: noProvider });
  return project;
}

let server: StartedServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

async function setup(url: string, id: string, config: unknown) {
  return fetch(`${url}/api/providers/${id}/setup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ config }),
  });
}

describe("POST /api/providers/:id/setup — HTTP-backed providers", () => {
  it("writes a valid http-api provider and round-trips its typed config", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await setup(server.url, "cloud", {
      type: "http-api",
      api: "anthropic",
      baseUrl: "https://api.anthropic.com",
      model: "claude-sonnet-4-6",
      apiKey: "env:ANTHROPIC_API_KEY",
      maxTokens: 4096,
    });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    // It must be persisted with its real type (not flattened to cli).
    const yml = await fs.readFile(
      path.join(project, ".vibestrate", "project.yml"),
      "utf8",
    );
    expect(yml).toContain("type: http-api");
    expect(yml).toContain("env:ANTHROPIC_API_KEY");

    // The config GET returns the typed http-api shape so the editor can populate.
    const cfg = await (
      await fetch(`${server.url}/api/providers/cloud/config`)
    ).json();
    expect(cfg.config.type).toBe("http-api");
    expect(cfg.config.api).toBe("anthropic");
    expect(cfg.config.apiKey).toBe("env:ANTHROPIC_API_KEY");

    // The list route tags it with kind=http-api + external.
    const list = await (await fetch(`${server.url}/api/providers`)).json();
    const row = list.providers.find((r: { id: string }) => r.id === "cloud");
    expect(row.kind).toBe("http-api");
    expect(row.external).toBe(true);
  });

  it("writes a localhost-proxy provider (no key, loopback only)", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await setup(server.url, "local", {
      type: "localhost-proxy",
      api: "ollama",
      baseUrl: "http://localhost:11434",
      model: "qwen3.5",
      maxTokens: 4096,
    });
    expect(res.status).toBe(200);
    const list = await (await fetch(`${server.url}/api/providers`)).json();
    const row = list.providers.find((r: { id: string }) => r.id === "local");
    expect(row.kind).toBe("localhost-proxy");
    expect(row.external).toBeFalsy();
  });

  it("still accepts a legacy type-less cli config", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    const res = await setup(server.url, "mycli", { command: "mycli", args: ["go"], input: "stdin" });
    expect(res.status).toBe(200);
    const yml = await fs.readFile(
      path.join(project, ".vibestrate", "project.yml"),
      "utf8",
    );
    expect(yml).toContain("type: cli");
  });
});

describe("POST /api/providers/:id/setup — fail-closed safety guards", () => {
  it("400s a literal (non-env-ref) cloud API key", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    const res = await setup(server.url, "cloud", {
      type: "http-api",
      api: "anthropic",
      baseUrl: "https://api.anthropic.com",
      model: "claude-sonnet-4-6",
      apiKey: "sk-ant-totally-a-real-key",
      maxTokens: 4096,
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain("env");
  });

  it("400s an http-api pointed at a non-https URL", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    const res = await setup(server.url, "cloud", {
      type: "http-api",
      api: "openai",
      baseUrl: "http://api.openai.com/v1",
      model: "gpt-4o",
      apiKey: "env:OPENAI_API_KEY",
      maxTokens: 4096,
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain("https");
  });

  it("400s a localhost-proxy pointed at a non-loopback host (would egress)", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    const res = await setup(server.url, "local", {
      type: "localhost-proxy",
      api: "openai",
      baseUrl: "https://evil.example.com/v1",
      model: "gpt-4o",
      maxTokens: 4096,
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain("localhost");
  });
});

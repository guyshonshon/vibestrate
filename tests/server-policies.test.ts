import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";

async function makeProject(opts: { withRule?: boolean; withMalformed?: boolean } = {}): Promise<string> {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-policies-srv-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: project });
  await execa("git", ["config", "user.email", "x@x"], { cwd: project });
  await execa("git", ["config", "user.name", "x"], { cwd: project });
  await fs.writeFile(path.join(project, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: project });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: project });

  await fs.mkdir(path.join(project, ".vibestrate"), { recursive: true });
  await fs.writeFile(
    path.join(project, ".vibestrate/project.yml"),
    [
      "project: { name: demo, type: generic }",
      "providers:",
      "  fake: { type: cli, command: /bin/true, inputMode: stdin }",
      "roles:",
      "  reviewer: { provider: fake, prompt: reviewer, permissions: read }",
      "commands:",
      "  validate: []",
      "",
    ].join("\n"),
  );

  if (opts.withRule) {
    await fs.mkdir(path.join(project, ".vibestrate/policies"), { recursive: true });
    await fs.writeFile(
      path.join(project, ".vibestrate/policies/no-console.yml"),
      [
        "rules:",
        "  - id: no-console-log",
        "    description: Use the logger, not console.log.",
        "    appliesTo: [suggestion-apply]",
        '    matchAddedContent: { regex: "console\\\\.log" }',
        "    message: 'Use the logger instead.'",
        "",
      ].join("\n"),
    );
  }
  if (opts.withMalformed) {
    await fs.mkdir(path.join(project, ".vibestrate/policies"), { recursive: true });
    await fs.writeFile(
      path.join(project, ".vibestrate/policies/broken.yml"),
      "rules: [: this isn't yaml",
    );
  }
  return project;
}

let server: StartedServer | null = null;
afterEach(async () => {
  if (server) await server.close();
  server = null;
});

async function start(projectRoot: string): Promise<StartedServer> {
  server = await startServer({ projectRoot, port: 0, host: "127.0.0.1" });
  return server;
}

describe("server: policies routes", () => {
  it("GET /api/policies returns an empty snapshot when no rule files exist", async () => {
    const project = await makeProject();
    const srv = await start(project);
    const r = await fetch(`${srv.url}/api/policies`).then((x) => x.json());
    expect(r.rules).toEqual([]);
    expect(r.ruleFiles).toEqual([]);
    expect(r.malformedFiles).toEqual([]);
    expect(r.duplicateIds).toEqual([]);
  });

  it("GET /api/policies returns the loaded rule + file info", async () => {
    const project = await makeProject({ withRule: true });
    const srv = await start(project);
    const r = await fetch(`${srv.url}/api/policies`).then((x) => x.json());
    expect(r.rules).toHaveLength(1);
    expect(r.rules[0].id).toBe("no-console-log");
    expect(r.rules[0].appliesTo).toEqual(["suggestion-apply"]);
    expect(r.ruleFiles).toHaveLength(1);
  });

  it("GET /api/policies/doctor surfaces malformed files", async () => {
    const project = await makeProject({ withRule: true, withMalformed: true });
    const srv = await start(project);
    const r = await fetch(`${srv.url}/api/policies/doctor`).then((x) => x.json());
    expect(r.ruleCount).toBe(1);
    expect(r.malformedFiles.length).toBeGreaterThan(0);
    expect(r.malformedFiles[0].reason).toMatch(/YAML/i);
  });

  it("POST /api/policies/check evaluates a patch with no rules → ok", async () => {
    const project = await makeProject();
    const srv = await start(project);
    const patch = [
      "diff --git a/x.ts b/x.ts",
      "--- a/x.ts",
      "+++ b/x.ts",
      "@@ -1 +1,2 @@",
      " ok",
      "+console.log('x')",
      "",
    ].join("\n");
    const res = await fetch(`${srv.url}/api/policies/check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ patch, surface: "suggestion-apply" }),
    });
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r.violations).toEqual([]);
    expect(r.evaluatedRuleIds).toEqual([]);
  });

  it("POST /api/policies/check returns violations on a hit", async () => {
    const project = await makeProject({ withRule: true });
    const srv = await start(project);
    const patch = [
      "diff --git a/x.ts b/x.ts",
      "--- a/x.ts",
      "+++ b/x.ts",
      "@@ -1 +1,2 @@",
      " ok",
      "+console.log('x')",
      "",
    ].join("\n");
    const res = await fetch(`${srv.url}/api/policies/check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ patch, surface: "suggestion-apply" }),
    });
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].ruleId).toBe("no-console-log");
  });

  it("POST /api/policies/check rejects an empty patch (400)", async () => {
    const project = await makeProject();
    const srv = await start(project);
    const res = await fetch(`${srv.url}/api/policies/check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ patch: "", surface: "suggestion-apply" }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/policies/check rejects an oversize patch (413)", async () => {
    const project = await makeProject();
    const srv = await start(project);
    const huge = "x".repeat(1_000_001);
    const res = await fetch(`${srv.url}/api/policies/check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ patch: huge, surface: "suggestion-apply" }),
    });
    // Fastify's body-size limit may reject before our handler runs; accept
    // either 413 (our handler) or 413/400 from the framework.
    expect([400, 413]).toContain(res.status);
  });

  it("POST /api/policies/check rejects an invalid surface (400)", async () => {
    const project = await makeProject();
    const srv = await start(project);
    const res = await fetch(`${srv.url}/api/policies/check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ patch: "x", surface: "orchestrator-step" }),
    });
    expect(res.status).toBe(400);
  });

  it("no endpoint exists that creates, edits, or deletes rule files", async () => {
    const project = await makeProject();
    const srv = await start(project);
    const FORBIDDEN: { method: string; path: string }[] = [
      { method: "POST", path: "/api/policies/rules" },
      { method: "PUT", path: "/api/policies/rules/some-id" },
      { method: "DELETE", path: "/api/policies/rules/some-id" },
      { method: "POST", path: "/api/policies/files" },
      { method: "PUT", path: "/api/policies/files/a.yml" },
      { method: "DELETE", path: "/api/policies/files/a.yml" },
    ];
    for (const { method, path: pth } of FORBIDDEN) {
      const res = await fetch(`${srv.url}${pth}`, {
        method,
        headers: { "content-type": "application/json" },
        body: '{"x":1}',
      });
      expect([404, 405]).toContain(res.status);
    }
  });
});

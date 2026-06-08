import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({ exitCode: 127, stdout: "", stderr: "" });

// Fake CLI provider that prints a valid consult answer - exercises the real
// runProvider path without a model.
const FAKE_SCRIPT = `#!/usr/bin/env node
let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  console.log(JSON.stringify({
    answer: "Use the default flow.",
    confidence: "high",
    caveats: [],
    usedContext: ["project config"],
    recommendedActions: [],
    proposedManualUpdate: null
  }));
});
`;

async function makeProjectWithFakeProvider(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-consult-srv-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

  const fakeJs = path.join(dir, "fake.js");
  await fs.writeFile(fakeJs, FAKE_SCRIPT, { mode: 0o755 });
  await fs.chmod(fakeJs, 0o755);
  await setConfigValue(
    dir,
    "providers.fake",
    JSON.stringify({ type: "cli", command: "node", args: [fakeJs], input: "stdin" }),
  );
  await setConfigValue(dir, "profiles.claude-balanced.provider", "fake");
  return dir;
}

let server: StartedServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

describe("POST /api/consult", () => {
  it("returns a structured answer over the real provider path", async () => {
    const project = await makeProjectWithFakeProvider();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    const res = await fetch(`${server.url}/api/consult`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "Which flow should I use?" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      answer: { answer: string; confidence: string };
      usedSources: string[];
    };
    expect(body.answer.confidence).toBe("high");
    expect(body.answer.answer).toMatch(/default flow/i);
    expect(body.usedSources).toContain("project config");
  });

  it("answers with an explicitly selected profile and reports it back", async () => {
    const project = await makeProjectWithFakeProvider();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    const res = await fetch(`${server.url}/api/consult`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "Which flow?", profileId: "claude-balanced" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { profileId: string; providerId: string };
    expect(body.profileId).toBe("claude-balanced");
    expect(body.providerId).toBe("fake");
  });

  it("answers ad-hoc with a chosen provider + model + effort (no saved profile)", async () => {
    const project = await makeProjectWithFakeProvider();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    const res = await fetch(`${server.url}/api/consult`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "Which flow?", providerId: "fake", model: "haiku", effort: "low" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      profileId: string;
      providerId: string;
      model: string | null;
      effort: string | null;
    };
    expect(body.providerId).toBe("fake");
    expect(body.profileId).toBe("(ad-hoc)");
    expect(body.model).toBe("haiku");
    expect(body.effort).toBe("low");
  });

  it("rejects an empty question with 400", async () => {
    const project = await makeProjectWithFakeProvider();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    const res = await fetch(`${server.url}/api/consult`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("refuses an out-of-root file as a non-fatal note, not a crash", async () => {
    const project = await makeProjectWithFakeProvider();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    const res = await fetch(`${server.url}/api/consult`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "look at this", files: ["../../../etc/passwd"] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { notes: string[] };
    expect(body.notes.some((n) => /Refused|not found|Could not/i.test(n))).toBe(true);
  });
});

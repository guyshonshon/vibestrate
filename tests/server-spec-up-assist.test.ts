import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { ArtifactStore } from "../src/core/stores/artifact-store.js";
import { FLOW_QUESTIONS_CONTRACT } from "../src/flows/schemas/flow-output-contracts.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({ exitCode: 127, stdout: "", stderr: "" });

// Fake CLI provider: prints a valid Simplify answer (the assist route's shape).
const FAKE_SIMPLIFY = `#!/usr/bin/env node
let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  console.log(JSON.stringify({ text: "Whether people log in.", affects: "Adds an auth system.", analogy: "" }));
});
`;

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-specup-assist-srv-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  const fakeJs = path.join(dir, "fake.js");
  await fs.writeFile(fakeJs, FAKE_SIMPLIFY, { mode: 0o755 });
  await fs.chmod(fakeJs, 0o755);
  await setConfigValue(
    dir,
    "providers.fake",
    JSON.stringify({ type: "cli", command: "node", args: [fakeJs], input: "stdin" }),
  );
  await setConfigValue(dir, "profiles.claude-balanced.provider", "fake");

  const store = new ArtifactStore(dir, "brave-otter");
  await store.init();
  await store.write("00-idea.md", "Build a mini ecommerce store");
  await store.writeJson("flows/intake/questions.json", {
    contract: FLOW_QUESTIONS_CONTRACT,
    stepId: "intake",
    questions: [
      { id: "accounts", question: "Do users sign in?", why: "auth", kind: "choice", options: ["yes", "no"], category: "users" },
    ],
  });
  return dir;
}

let server: StartedServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

describe("POST /api/spec-up/assist", () => {
  it("returns a Simplify result over the real provider path", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    const res = await fetch(`${server.url}/api/spec-up/assist`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceRunId: "brave-otter", mode: "simplify", questionId: "accounts" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { mode: string; text: string; affects: string };
    expect(body.mode).toBe("simplify");
    expect(body.text).toMatch(/log in/i);
    expect(body.affects).toMatch(/auth/i);
  });

  it("rejects simplify with no questionId (400)", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    const res = await fetch(`${server.url}/api/spec-up/assist`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceRunId: "brave-otter", mode: "simplify" }),
    });
    expect(res.status).toBe(400);
  });

  it("surfaces round + coverageComplete on the questions GET", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    const res = await fetch(`${server.url}/api/runs/brave-otter/spec-up-questions`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { round: number; coverageComplete: boolean; questions: unknown[] };
    expect(body.round).toBe(1);
    expect(body.coverageComplete).toBe(false);
    expect(body.questions.length).toBe(1);
  });
});

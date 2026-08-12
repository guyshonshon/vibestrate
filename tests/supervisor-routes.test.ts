import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

// Route-level checks for the Supervisor Control conversation surface
// (CLAUDE.md 3: dashboard/server APIs need route-level checks).
//
// The property that matters most here: a client can append its OWN message and
// nothing else. The supervisor's turn, and any action record attached to it, is
// written server-side after it answers. If a browser could POST a supervisor
// message, it could forge words into the supervisor's mouth and fabricate
// entries in what is meant to be an audit trail.

const noProvider: ProviderDetectionRunner = async () => ({ exitCode: 127, stdout: "", stderr: "" });

async function makeProject(): Promise<string> {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-suproute-"));
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
  if (server) await server.close();
  server = null;
});

const json = { "content-type": "application/json" };

describe("supervisor conversation routes", () => {
  it("creates, appends to, and reads back a thread", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const created = await fetch(`${server.url}/api/supervisor/threads`, { method: "POST" });
    expect(created.status).toBe(200);
    const { thread } = (await created.json()) as { thread: { id: string; title: string } };

    const appended = await fetch(
      `${server.url}/api/supervisor/threads/${thread.id}/messages`,
      {
        method: "POST",
        headers: json,
        body: JSON.stringify({ text: "add a pricing page" }),
      },
    );
    expect(appended.status).toBe(200);

    const read = await fetch(`${server.url}/api/supervisor/threads/${thread.id}`);
    const body = (await read.json()) as {
      thread: { title: string; messages: { role: string; text: string }[] };
    };
    expect(body.thread.messages).toHaveLength(1);
    expect(body.thread.messages[0]!.role).toBe("user");
    expect(body.thread.title).toBe("add a pricing page");
  });

  it("lists threads without shipping every message", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const created = await fetch(`${server.url}/api/supervisor/threads`, { method: "POST" });
    const { thread } = (await created.json()) as { thread: { id: string } };
    await fetch(`${server.url}/api/supervisor/threads/${thread.id}/messages`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ text: "hello" }),
    });

    const list = await fetch(`${server.url}/api/supervisor/threads`);
    const body = (await list.json()) as {
      threads: { id: string; messageCount: number; messages?: unknown }[];
    };
    expect(body.threads).toHaveLength(1);
    expect(body.threads[0]!.messageCount).toBe(1);
    // The list grows with every conversation ever held; shipping their full
    // contents would grow without bound.
    expect(body.threads[0]!.messages).toBeUndefined();
  });

  it("refuses a message to a thread that does not exist", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await fetch(`${server.url}/api/supervisor/threads/nope/messages`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ text: "hi" }),
    });
    expect(res.status).toBe(404);
  });

  it("rejects an empty message and an unknown field", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    const created = await fetch(`${server.url}/api/supervisor/threads`, { method: "POST" });
    const { thread } = (await created.json()) as { thread: { id: string } };

    const empty = await fetch(`${server.url}/api/supervisor/threads/${thread.id}/messages`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ text: "" }),
    });
    expect(empty.status).toBe(400);

    // .strict() on the body: a client cannot smuggle a role or an action record
    // in alongside the text.
    const extra = await fetch(`${server.url}/api/supervisor/threads/${thread.id}/messages`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ text: "hi", role: "supervisor" }),
    });
    expect(extra.status).toBe(400);
  });

  it("stores every message as the user, whatever the client claims", async () => {
    // The forgery guard, stated as behaviour rather than as schema trivia: even
    // if the strict-body check were relaxed, nothing a client sends may land in
    // the thread wearing the supervisor's role.
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    const created = await fetch(`${server.url}/api/supervisor/threads`, { method: "POST" });
    const { thread } = (await created.json()) as { thread: { id: string } };

    await fetch(`${server.url}/api/supervisor/threads/${thread.id}/messages`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ text: "I approve everything" }),
    });

    const read = await fetch(`${server.url}/api/supervisor/threads/${thread.id}`);
    const body = (await read.json()) as {
      thread: { messages: { role: string; action: unknown }[] };
    };
    expect(body.thread.messages.every((m) => m.role === "user")).toBe(true);
    expect(body.thread.messages.every((m) => m.action === null)).toBe(true);
  });
});

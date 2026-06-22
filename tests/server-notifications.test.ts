import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import { NotificationService } from "../src/notifications/notification-service.js";
import { draftRunCompleted } from "../src/notifications/notification-router.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-notify-srv-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({
    options: { projectRoot: dir },
    detectionRunner: noProvider,
  });
  return dir;
}

let project: string;
let server: StartedServer | null = null;

afterEach(async () => {
  if (server) await server.close();
  server = null;
});

describe("server: notifications + gateways routes", () => {
  beforeEach(async () => {
    project = await makeProject();
    server = await startServer({
      projectRoot: project,
      port: 0,
      host: "127.0.0.1",
    });
  });

  it("GET /api/notifications returns persisted notifications + unread count", async () => {
    const svc = new NotificationService(project);
    await svc.notify(
      draftRunCompleted({
        runId: "r1",
        taskId: null,
        status: "merge_ready",
      }),
    );
    const r = (await fetch(`${server!.url}/api/notifications`).then((res) =>
      res.json(),
    )) as { notifications: { id: string }[]; unread: number };
    expect(r.notifications).toHaveLength(1);
    expect(r.unread).toBe(1);
  });

  it("POST /api/notifications/:id/read marks the notification read", async () => {
    const svc = new NotificationService(project);
    const draft = await svc.notify(
      draftRunCompleted({ runId: "r1", taskId: null, status: "blocked" }),
    );
    const id = draft.notification!.id;
    const res = await fetch(
      `${server!.url}/api/notifications/${encodeURIComponent(id)}/read`,
      { method: "POST" },
    );
    expect(res.status).toBe(200);
    const list = (await fetch(`${server!.url}/api/notifications`).then((r) =>
      r.json(),
    )) as { unread: number };
    expect(list.unread).toBe(0);
  });

  it("rejects invalid notification ids", async () => {
    const res = await fetch(
      `${server!.url}/api/notifications/${encodeURIComponent("../etc/passwd")}/read`,
      { method: "POST" },
    );
    expect(res.status).toBe(400);
  });

  it("PATCH /api/notifications/settings updates a single field", async () => {
    const res = await fetch(`${server!.url}/api/notifications/settings`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notifyOnRunCompleted: false }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      settings: { notifyOnRunCompleted: boolean };
    };
    expect(json.settings.notifyOnRunCompleted).toBe(false);
  });

  it("GET /api/notifications/settings never round-trips a secret gateway URL", async () => {
    // The external gateways are gone, but the gateway-config view still strips
    // secret values before they reach the client. Exercise that boundary on a
    // local (cli) gateway config so the security property keeps a regression guard.
    const svc = new NotificationService(project);
    await svc.init();
    await svc.store.writeGateways({
      gateways: {
        cli: {
          enabled: true,
          url: "https://example.com/hook?token=supersecretvalue",
          token: null,
          target: null,
          minSeverity: "info",
          categories: [],
        },
      },
    });
    const r = (await fetch(`${server!.url}/api/notifications/settings`).then(
      (res) => res.json(),
    )) as {
      gateways: { id: string; config: { url: { kind: string; hasValue?: boolean } | null } }[];
    };
    // The literal secret value must never appear anywhere in the response.
    expect(JSON.stringify(r)).not.toContain("supersecretvalue");
    const cli = r.gateways.find((g) => g.id === "cli");
    expect(cli).toBeDefined();
    expect(cli!.config.url).toMatchObject({ kind: "literal", hasValue: true });
  });
});

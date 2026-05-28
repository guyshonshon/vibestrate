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

  it("GET /api/notifications/settings returns settings + safe gateway list (no secrets)", async () => {
    const svc = new NotificationService(project);
    await svc.init();
    await svc.store.writeGateways({
      gateways: {
        webhook: {
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
      settings: { enabled: boolean };
      gateways: {
        id: string;
        config: {
          url: { kind: string; hasValue?: boolean } | null;
        };
      }[];
    };
    expect(r.settings.enabled).toBe(true);
    const webhook = r.gateways.find((g) => g.id === "webhook");
    expect(webhook).toBeDefined();
    // hard requirement: secret URL never round-trips to the client
    expect(JSON.stringify(r)).not.toContain("supersecretvalue");
    expect(webhook!.config.url).toMatchObject({
      kind: "literal",
      hasValue: true,
    });
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

  it("env-ref gateway URL surfaces as env-ref view, never a literal", async () => {
    const svc = new NotificationService(project);
    await svc.init();
    delete process.env.VIBESTRATE_TEST_NOTSET;
    await svc.store.writeGateways({
      gateways: {
        slack: {
          enabled: true,
          url: "env:VIBESTRATE_TEST_NOTSET",
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
      gateways: { id: string; missingEnvVars: string[]; valid: boolean; config: { url: { kind: string; envVar?: string; envVarSet?: boolean } | null } }[];
    };
    const slack = r.gateways.find((g) => g.id === "slack");
    expect(slack!.config.url).toMatchObject({
      kind: "env-ref",
      envVar: "VIBESTRATE_TEST_NOTSET",
      envVarSet: false,
    });
    expect(slack!.missingEnvVars).toContain("VIBESTRATE_TEST_NOTSET");
  });

  it("POST /api/gateways/:id/test on whatsapp returns ok=false (planned, not real)", async () => {
    const svc = new NotificationService(project);
    await svc.init();
    await svc.store.writeGateways({
      gateways: {
        whatsapp: {
          enabled: true,
          url: null,
          token: null,
          target: null,
          minSeverity: "info",
          categories: [],
        },
      },
    });
    const res = await fetch(`${server!.url}/api/gateways/whatsapp/test`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; message: string };
    expect(json.ok).toBe(false);
    expect(json.message).toMatch(/planned|not implemented/i);
  });
});

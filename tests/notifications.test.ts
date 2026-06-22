import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { NotificationStore } from "../src/notifications/notification-store.js";
import { NotificationService } from "../src/notifications/notification-service.js";
import {
  draftApprovalRequested,
  draftRunCompleted,
  draftSchedulerConflict,
} from "../src/notifications/notification-router.js";
import {
  meetsSeverity,
  shouldEmit,
  gatewayWillRelay,
} from "../src/notifications/notification-rules.js";
import {
  envVarName,
  redact,
  resolveSecret,
} from "../src/notifications/gateways/secret-resolver.js";
import { notificationsConfigSchema } from "../src/notifications/notification-types.js";
import type { Notification } from "../src/notifications/notification-types.js";

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-notify-"));
}

function fakeNotification(over: Partial<Notification> = {}): Notification {
  return {
    id: over.id ?? "nf-test-1",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    severity: "attention",
    category: "approval",
    title: "Hello",
    message: "test",
    runId: "r1",
    taskId: null,
    roadmapItemId: null,
    approvalId: "ap1",
    eventId: null,
    sourceEventType: "approval.requested",
    actionRequired: true,
    actionLabel: "Open run",
    actionUrl: "#/runs/r1",
    readAt: null,
    resolvedAt: null,
    metadata: {},
    ...over,
  };
}

describe("NotificationStore", () => {
  let project: string;
  beforeEach(async () => {
    project = await tempProject();
  });

  it("init creates the notifications directory", async () => {
    const store = new NotificationStore(project);
    await store.init();
    const stat = await fs.stat(path.join(project, ".vibestrate", "notifications"));
    expect(stat.isDirectory()).toBe(true);
  });

  it("ensureSettingsFile writes rules + gateways defaults", async () => {
    const store = new NotificationStore(project);
    await store.init();
    await store.ensureSettingsFile();
    const rules = await fs.readFile(
      path.join(project, ".vibestrate", "notifications", "rules.json"),
      "utf8",
    );
    const gateways = await fs.readFile(
      path.join(project, ".vibestrate", "notifications", "gateways.json"),
      "utf8",
    );
    expect(JSON.parse(rules).enabled).toBe(true);
    expect(JSON.parse(gateways).gateways).toEqual({});
  });

  it("append + readAll round-trip works", async () => {
    const store = new NotificationStore(project);
    await store.init();
    await store.append(fakeNotification({ id: "nf-x" }));
    const file = await store.readAll();
    expect(file.notifications).toHaveLength(1);
    expect(file.notifications[0]!.id).toBe("nf-x");
  });

  it("readAll tolerates a corrupt notifications.json", async () => {
    const store = new NotificationStore(project);
    await store.init();
    await fs.writeFile(
      path.join(project, ".vibestrate", "notifications", "notifications.json"),
      "not json",
    );
    const file = await store.readAll();
    expect(file).toEqual({ notifications: [] });
  });
});

describe("notification-rules", () => {
  it("meetsSeverity ranks correctly", () => {
    expect(meetsSeverity("critical", "info")).toBe(true);
    expect(meetsSeverity("info", "attention")).toBe(false);
    expect(meetsSeverity("attention", "attention")).toBe(true);
  });

  it("shouldEmit honours per-trigger toggles", () => {
    const cfg = notificationsConfigSchema.parse({});
    const n = fakeNotification();
    expect(shouldEmit(n, cfg)).toBe(true);
    expect(
      shouldEmit(n, { ...cfg, notifyOnApprovalRequested: false }),
    ).toBe(false);
    expect(shouldEmit(n, { ...cfg, enabled: false })).toBe(false);
  });

  it("shouldEmit blocks when category is quieted", () => {
    const cfg = notificationsConfigSchema.parse({});
    const n = fakeNotification({ category: "approval" });
    expect(shouldEmit(n, { ...cfg, quietCategories: ["approval"] })).toBe(false);
  });

  it("gatewayWillRelay respects min severity + category allow-list", () => {
    const n = fakeNotification({ severity: "info", category: "task" });
    expect(
      gatewayWillRelay({
        notification: n,
        gatewayMinSeverity: "warning",
        gatewayCategories: [],
      }),
    ).toBe(false);
    expect(
      gatewayWillRelay({
        notification: { ...n, severity: "critical" },
        gatewayMinSeverity: "warning",
        gatewayCategories: ["run"],
      }),
    ).toBe(false);
    expect(
      gatewayWillRelay({
        notification: { ...n, severity: "critical" },
        gatewayMinSeverity: "warning",
        gatewayCategories: ["task"],
      }),
    ).toBe(true);
  });
});

describe("secret-resolver", () => {
  const envBackup = { ...process.env };
  afterEach(() => {
    process.env = { ...envBackup };
  });

  it("resolveSecret returns the literal when not env-ref", () => {
    expect(resolveSecret("https://example.com")).toBe("https://example.com");
  });

  it("resolveSecret reads env when value is env:NAME", () => {
    process.env.VIBESTRATE_TEST_SECRET = "shh";
    expect(resolveSecret("env:VIBESTRATE_TEST_SECRET")).toBe("shh");
  });

  it("resolveSecret returns undefined when the env var is unset", () => {
    delete process.env.UNSET_VAR_XYZ;
    expect(resolveSecret("env:UNSET_VAR_XYZ")).toBeUndefined();
  });

  it("envVarName extracts only env-ref names", () => {
    expect(envVarName("env:FOO")).toBe("FOO");
    expect(envVarName("https://x.com")).toBeNull();
    expect(envVarName(null)).toBeNull();
  });

  it("redact strips literal secrets, bearer tokens, slack/discord/telegram URLs", () => {
    const out = redact(
      "leaked: hooks.slack.com/services/T1/B2/sekret123 + Bearer abc123def + bot",
      ["sekret123"],
    );
    expect(out).not.toContain("sekret123");
    expect(out).not.toContain("Bearer abc123def");
    expect(out).toContain("[redacted]");
  });

  it("redact replaces a discord webhook URL", () => {
    const out = redact(
      "fail: https://discord.com/api/webhooks/123/abc reason",
      [],
    );
    expect(out).toContain("[redacted-webhook]");
    expect(out).not.toContain("/abc");
  });

  it("redact replaces a telegram bot URL", () => {
    const out = redact(
      "fetch failed: https://api.telegram.org/bot1234:secret/sendMessage",
      [],
    );
    expect(out).toContain("[redacted-telegram]");
    expect(out).not.toContain("secret");
  });
});

describe("NotificationService end-to-end (smoke A: in-app + smoke B: approval)", () => {
  let project: string;
  beforeEach(async () => {
    project = await tempProject();
  });

  it("notify persists, list returns it, markRead/resolve mutate state", async () => {
    const svc = new NotificationService(project);
    const draft = draftApprovalRequested({
      runId: "r1",
      approvalId: "ap1",
      roleId: "implementer",
      stageId: "executing",
    });
    const result = await svc.notify(draft);
    expect(result.emitted).toBe(true);
    const list = await svc.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.severity).toBe("attention");
    expect(list[0]!.actionUrl).toBe("#/runs/r1");

    expect(await svc.unreadCount()).toBe(1);
    const read = await svc.markRead(list[0]!.id);
    expect(read?.readAt).not.toBeNull();
    expect(await svc.unreadCount()).toBe(0);

    const resolved = await svc.resolve(list[0]!.id);
    expect(resolved?.resolvedAt).not.toBeNull();
  });

  it("notify is filtered when notifyOnRunCompleted=false (smoke A: setting honoured)", async () => {
    const svc = new NotificationService(project);
    await svc.init();
    const settings = await svc.readSettings();
    await svc.writeSettings({ ...settings, notifyOnRunCompleted: false });
    const r = await svc.notify(
      draftRunCompleted({
        runId: "r2",
        taskId: null,
        status: "merge_ready",
      }),
    );
    expect(r.emitted).toBe(false);
    expect((await svc.list()).length).toBe(0);
  });

  it("smoke C: scheduler conflict notification ends up in notifications.json", async () => {
    const svc = new NotificationService(project);
    const r = await svc.notify(
      draftSchedulerConflict({
        taskId: "t1",
        conflictsWith: ["t2"],
        blocked: true,
        overlappingFiles: ["src/x.ts"],
      }),
    );
    expect(r.emitted).toBe(true);
    expect(r.notification?.category).toBe("conflict");
    const persisted = await svc.list();
    expect(persisted[0]!.taskId).toBe("t1");
    expect(persisted[0]!.actionUrl).toBe("#/queue");
  });
});

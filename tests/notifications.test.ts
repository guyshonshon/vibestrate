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
import { webhookGateway } from "../src/notifications/gateways/webhook-gateway.js";
import {
  buildDiscordPayload,
  discordGateway,
} from "../src/notifications/gateways/discord-gateway.js";
import { buildSlackPayload } from "../src/notifications/gateways/slack-gateway.js";
import {
  buildTelegramText,
  telegramGateway,
} from "../src/notifications/gateways/telegram-gateway.js";
import { whatsappPlaceholderGateway } from "../src/notifications/gateways/whatsapp-placeholder.js";
import { notificationsConfigSchema } from "../src/notifications/notification-types.js";
import type { Notification } from "../src/notifications/notification-types.js";

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "amaco-notify-"));
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
    const stat = await fs.stat(path.join(project, ".amaco", "notifications"));
    expect(stat.isDirectory()).toBe(true);
  });

  it("ensureSettingsFile writes rules + gateways defaults", async () => {
    const store = new NotificationStore(project);
    await store.init();
    await store.ensureSettingsFile();
    const rules = await fs.readFile(
      path.join(project, ".amaco", "notifications", "rules.json"),
      "utf8",
    );
    const gateways = await fs.readFile(
      path.join(project, ".amaco", "notifications", "gateways.json"),
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
      path.join(project, ".amaco", "notifications", "notifications.json"),
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
    process.env.AMACO_TEST_SECRET = "shh";
    expect(resolveSecret("env:AMACO_TEST_SECRET")).toBe("shh");
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

describe("webhook-gateway delivery (mocked fetch)", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("delivers when fetch returns 200", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("ok", { status: 200 }),
    ) as unknown as typeof fetch;
    const r = await webhookGateway.deliver({
      notification: fakeNotification(),
      config: {
        enabled: true,
        url: "https://example.com/hook",
        token: null,
        target: null,
        minSeverity: "info",
        categories: [],
      },
      settings: notificationsConfigSchema.parse({}),
    });
    expect(r.status).toBe("delivered");
  });

  it("records failed receipt when fetch returns 500 and redacts URL", async () => {
    const url = "https://example.com/hook?token=sneakyabcd";
    global.fetch = vi.fn().mockResolvedValue(
      new Response(`upstream error from ${url}`, { status: 500 }),
    ) as unknown as typeof fetch;
    const r = await webhookGateway.deliver({
      notification: fakeNotification(),
      config: {
        enabled: true,
        url,
        token: null,
        target: null,
        minSeverity: "info",
        categories: [],
      },
      settings: notificationsConfigSchema.parse({}),
    });
    expect(r.status).toBe("failed");
    expect(r.errorMessage ?? "").not.toContain("sneakyabcd");
  });

  it("returns skipped when env-ref URL is unset", async () => {
    delete process.env.AMACO_NOEXIST_URL;
    const r = await webhookGateway.deliver({
      notification: fakeNotification(),
      config: {
        enabled: true,
        url: "env:AMACO_NOEXIST_URL",
        token: null,
        target: null,
        minSeverity: "info",
        categories: [],
      },
      settings: notificationsConfigSchema.parse({}),
    });
    expect(r.status).toBe("skipped");
  });

  it("validateConfig flags missing env var", () => {
    delete process.env.AMACO_NOEXIST_URL;
    const r = webhookGateway.validateConfig({
      enabled: true,
      url: "env:AMACO_NOEXIST_URL",
      token: null,
      target: null,
      minSeverity: "info",
      categories: [],
    });
    expect(r.envVarsReferenced).toContain("AMACO_NOEXIST_URL");
    expect(r.missingEnvVars).toContain("AMACO_NOEXIST_URL");
  });
});

describe("formatters", () => {
  it("buildDiscordPayload uses an embed with severity color + fields", () => {
    const n = fakeNotification({ severity: "critical", category: "run" });
    const payload = buildDiscordPayload(n) as {
      embeds: { color: number; title: string; fields: unknown[] }[];
    };
    expect(payload.embeds[0]!.color).toBe(0xd96666);
    expect(payload.embeds[0]!.title).toBe("Hello");
    expect(payload.embeds[0]!.fields.length).toBeGreaterThan(0);
  });

  it("buildSlackPayload includes severity emoji + run reference", () => {
    const n = fakeNotification({ severity: "attention" });
    const payload = buildSlackPayload(n) as { text: string };
    expect(payload.text).toContain(":bell:");
    expect(payload.text).toContain("Hello");
    expect(payload.text).toContain("run: `r1`");
  });

  it("buildTelegramText escapes MarkdownV2 reserved chars", () => {
    const n = fakeNotification({
      title: "Run 1.2 [final]!",
      message: "needs (manual) review.",
    });
    const text = buildTelegramText(n);
    expect(text).toContain("\\.");
    expect(text).toContain("\\[final\\]");
    expect(text).toContain("\\!");
    expect(text).toContain("\\(manual\\)");
  });
});

describe("telegram-gateway validation", () => {
  const realFetch = global.fetch;
  const envBackup = { ...process.env };

  afterEach(() => {
    global.fetch = realFetch;
    process.env = { ...envBackup };
    vi.restoreAllMocks();
  });

  it("validateConfig requires both token and target", () => {
    const r = telegramGateway.validateConfig({
      enabled: true,
      url: null,
      token: null,
      target: null,
      minSeverity: "info",
      categories: [],
    });
    expect(r.ok).toBe(false);
  });

  it("delivers only notification text, never process.env contents", async () => {
    process.env.AMACO_TELEGRAM_TOKEN = "1234:secret";
    process.env.AMACO_TELEGRAM_CHAT = "chat-1";
    process.env.AMACO_SHOULD_NOT_LEAK = "do-not-send";

    const fetchMock = vi.fn().mockResolvedValue(
      new Response("ok", { status: 200 }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const notification = fakeNotification({
      title: "Build finished",
      message: "Validation passed",
    });

    const receipt = await telegramGateway.deliver({
      notification,
      config: {
        enabled: true,
        url: null,
        token: "env:AMACO_TELEGRAM_TOKEN",
        target: "env:AMACO_TELEGRAM_CHAT",
        minSeverity: "info",
        categories: [],
      },
      settings: notificationsConfigSchema.parse({}),
    });

    expect(receipt.status).toBe("delivered");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { body: string; method: string },
    ];
    expect(url).toBe("https://api.telegram.org/bot1234:secret/sendMessage");
    expect(init.method).toBe("POST");

    const bodyText = init.body;
    expect(bodyText).toContain("Build finished");
    expect(bodyText).toContain("Validation passed");
    expect(bodyText).not.toContain("do-not-send");
    expect(bodyText).not.toContain("AMACO_SHOULD_NOT_LEAK");
  });
});

describe("discord-gateway validation", () => {
  it("validateConfig fails on a non-URL value", () => {
    const r = discordGateway.validateConfig({
      enabled: true,
      url: "definitely-not-a-url",
      token: null,
      target: null,
      minSeverity: "info",
      categories: [],
    });
    expect(r.ok).toBe(false);
  });
});

describe("whatsapp placeholder", () => {
  it("validateConfig always returns ok=false with a planned reason", () => {
    const r = whatsappPlaceholderGateway.validateConfig({
      enabled: true,
      url: null,
      token: null,
      target: null,
      minSeverity: "info",
      categories: [],
    });
    expect(r.ok).toBe(false);
    expect(r.reason ?? "").toMatch(/planned/i);
  });

  it("deliver returns a skipped receipt without making any HTTP call", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const r = await whatsappPlaceholderGateway.deliver({
      notification: fakeNotification(),
      config: {
        enabled: true,
        url: null,
        token: null,
        target: null,
        minSeverity: "info",
        categories: [],
      },
      settings: notificationsConfigSchema.parse({}),
    });
    expect(r.status).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("test() reports planned status, never throws", async () => {
    const r = await whatsappPlaceholderGateway.test!({
      config: {
        enabled: true,
        url: null,
        token: null,
        target: null,
        minSeverity: "info",
        categories: [],
      },
    });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/planned|not implemented/i);
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

  it("smoke E: webhook gateway records a delivery receipt (mocked)", async () => {
    const svc = new NotificationService(project);
    await svc.init();
    await svc.store.writeGateways({
      gateways: {
        webhook: {
          enabled: true,
          url: "https://example.com/hook",
          token: null,
          target: null,
          minSeverity: "info",
          categories: [],
        },
      },
    });
    const realFetch = global.fetch;
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
      await svc.notify(
        draftRunCompleted({ runId: "r3", taskId: null, status: "merge_ready" }),
      );
      // give the fire-and-forget delivery a tick
      await new Promise((r) => setTimeout(r, 50));
      const receipts = await svc.store.readReceipts();
      const webhookReceipts = receipts.receipts.filter(
        (r) => r.gatewayId === "webhook",
      );
      expect(webhookReceipts.length).toBeGreaterThan(0);
      expect(webhookReceipts[0]!.status).toBe("delivered");
    } finally {
      global.fetch = realFetch;
    }
  });

  it("smoke F: secrets in error messages are redacted in receipts", async () => {
    const svc = new NotificationService(project);
    await svc.init();
    const url = "https://example.com/hook/secrettoken1234";
    await svc.store.writeGateways({
      gateways: {
        webhook: {
          enabled: true,
          url,
          token: null,
          target: null,
          minSeverity: "info",
          categories: [],
        },
      },
    });
    const realFetch = global.fetch;
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(`upstream rejected ${url}`, { status: 500 }),
      ) as unknown as typeof fetch;
    try {
      await svc.notify(
        draftRunCompleted({ runId: "r4", taskId: null, status: "failed" }),
      );
      await new Promise((r) => setTimeout(r, 50));
      const receipts = await svc.store.readReceipts();
      const failed = receipts.receipts.find(
        (r) => r.gatewayId === "webhook" && r.status === "failed",
      );
      expect(failed).toBeDefined();
      expect(failed!.errorMessage ?? "").not.toContain("secrettoken1234");
    } finally {
      global.fetch = realFetch;
    }
  });

  it("delivery never throws even when fetch rejects", async () => {
    const svc = new NotificationService(project);
    await svc.init();
    await svc.store.writeGateways({
      gateways: {
        webhook: {
          enabled: true,
          url: "https://example.com/hook",
          token: null,
          target: null,
          minSeverity: "info",
          categories: [],
        },
      },
    });
    const realFetch = global.fetch;
    global.fetch = vi
      .fn()
      .mockRejectedValue(new Error("boom")) as unknown as typeof fetch;
    try {
      const r = await svc.notify(
        draftRunCompleted({ runId: "r5", taskId: null, status: "blocked" }),
      );
      expect(r.emitted).toBe(true);
      await new Promise((res) => setTimeout(res, 50));
      const receipts = await svc.store.readReceipts();
      expect(
        receipts.receipts.some((r) => r.status === "failed"),
      ).toBe(true);
    } finally {
      global.fetch = realFetch;
    }
  });
});

import path from "node:path";
import { ensureDir, pathExists, readText, writeText } from "../utils/fs.js";
import {
  notificationGatewaysFile,
  notificationReceiptsFile,
  notificationRulesFile,
  notificationsDir,
  notificationsFile,
} from "../utils/paths.js";
import {
  type DeliveryReceipt,
  type GatewaysFile,
  type Notification,
  type NotificationsConfig,
  type NotificationsFile,
  type ReceiptsFile,
  gatewaysFileSchema,
  notificationsFileSchema,
  notificationsConfigSchema,
  receiptsFileSchema,
} from "./notification-types.js";

export class NotificationStore {
  constructor(private readonly projectRoot: string) {}

  async init(): Promise<void> {
    await ensureDir(notificationsDir(this.projectRoot));
  }

  // ─── notifications ────────────────────────────────────────────────────────

  async readAll(): Promise<NotificationsFile> {
    const file = notificationsFile(this.projectRoot);
    if (!(await pathExists(file))) return { notifications: [] };
    const text = await readText(file);
    if (!text.trim()) return { notifications: [] };
    try {
      return notificationsFileSchema.parse(JSON.parse(text));
    } catch {
      return { notifications: [] };
    }
  }

  async writeAll(file: NotificationsFile): Promise<void> {
    const validated = notificationsFileSchema.parse(file);
    await ensureDir(notificationsDir(this.projectRoot));
    await writeText(
      notificationsFile(this.projectRoot),
      `${JSON.stringify(validated, null, 2)}\n`,
    );
  }

  async append(n: Notification): Promise<void> {
    const file = await this.readAll();
    file.notifications.push(n);
    await this.writeAll(file);
  }

  async update(n: Notification): Promise<void> {
    const file = await this.readAll();
    const idx = file.notifications.findIndex((x) => x.id === n.id);
    if (idx >= 0) file.notifications[idx] = n;
    else file.notifications.push(n);
    await this.writeAll(file);
  }

  // ─── receipts ─────────────────────────────────────────────────────────────

  async readReceipts(): Promise<ReceiptsFile> {
    const file = notificationReceiptsFile(this.projectRoot);
    if (!(await pathExists(file))) return { receipts: [] };
    const text = await readText(file);
    if (!text.trim()) return { receipts: [] };
    try {
      return receiptsFileSchema.parse(JSON.parse(text));
    } catch {
      return { receipts: [] };
    }
  }

  async writeReceipts(file: ReceiptsFile): Promise<void> {
    const validated = receiptsFileSchema.parse(file);
    await ensureDir(notificationsDir(this.projectRoot));
    await writeText(
      notificationReceiptsFile(this.projectRoot),
      `${JSON.stringify(validated, null, 2)}\n`,
    );
  }

  async appendReceipt(r: DeliveryReceipt): Promise<void> {
    const file = await this.readReceipts();
    file.receipts.push(r);
    await this.writeReceipts(file);
  }

  // ─── settings (rules.json) ────────────────────────────────────────────────

  async readSettings(): Promise<NotificationsConfig> {
    const file = notificationRulesFile(this.projectRoot);
    if (!(await pathExists(file))) {
      return notificationsConfigSchema.parse({});
    }
    const text = await readText(file);
    if (!text.trim()) return notificationsConfigSchema.parse({});
    try {
      return notificationsConfigSchema.parse(JSON.parse(text));
    } catch {
      return notificationsConfigSchema.parse({});
    }
  }

  async writeSettings(config: NotificationsConfig): Promise<void> {
    const validated = notificationsConfigSchema.parse(config);
    await ensureDir(notificationsDir(this.projectRoot));
    await writeText(
      notificationRulesFile(this.projectRoot),
      `${JSON.stringify(validated, null, 2)}\n`,
    );
  }

  // ─── gateways.json (separate from project.yml so secrets stay out of git
  //     — we still treat the file as ignored by adding a rule in init) ──────

  async readGateways(): Promise<GatewaysFile> {
    const file = notificationGatewaysFile(this.projectRoot);
    if (!(await pathExists(file))) return { gateways: {} };
    const text = await readText(file);
    if (!text.trim()) return { gateways: {} };
    try {
      return gatewaysFileSchema.parse(JSON.parse(text));
    } catch {
      return { gateways: {} };
    }
  }

  async writeGateways(file: GatewaysFile): Promise<void> {
    const validated = gatewaysFileSchema.parse(file);
    await ensureDir(notificationsDir(this.projectRoot));
    await writeText(
      notificationGatewaysFile(this.projectRoot),
      `${JSON.stringify(validated, null, 2)}\n`,
    );
  }

  // ─── helpers used by the route handlers ───────────────────────────────────

  filePath = {
    notifications: () => notificationsFile(this.projectRoot),
    rules: () => notificationRulesFile(this.projectRoot),
    receipts: () => notificationReceiptsFile(this.projectRoot),
    gateways: () => notificationGatewaysFile(this.projectRoot),
    dir: () => notificationsDir(this.projectRoot),
  };

  async ensureSettingsFile(): Promise<void> {
    if (!(await pathExists(notificationRulesFile(this.projectRoot)))) {
      await this.writeSettings(notificationsConfigSchema.parse({}));
    }
    if (!(await pathExists(notificationGatewaysFile(this.projectRoot)))) {
      await this.writeGateways(gatewaysFileSchema.parse({}));
    }
    void path; // keep import for future use
  }
}

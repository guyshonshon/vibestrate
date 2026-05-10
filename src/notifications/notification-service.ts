import { randomUUID } from "node:crypto";
import { nowIso } from "../utils/time.js";
import { NotificationStore } from "./notification-store.js";
import {
  notificationSchema,
  type Notification,
  type NotificationsConfig,
} from "./notification-types.js";
import {
  draftToSkeleton,
  type NotificationDraft,
} from "./notification-router.js";
import { shouldEmit } from "./notification-rules.js";
import {
  GatewayRegistry,
  buildDefaultRegistry,
} from "./gateways/gateway-registry.js";

export type NotificationServiceLogger = (line: string) => void;

export type NotifyResult = {
  notification: Notification | null;
  emitted: boolean;
  reason?: string;
};

export class NotificationService {
  readonly store: NotificationStore;
  private registry: GatewayRegistry | null = null;

  constructor(
    private readonly projectRoot: string,
    private readonly log: NotificationServiceLogger = () => {},
  ) {
    this.store = new NotificationStore(projectRoot);
  }

  async init(): Promise<void> {
    await this.store.init();
    await this.store.ensureSettingsFile();
  }

  /**
   * Sentinel id generator. Path-safe, sortable, and human-readable enough
   * to spot in `notifications.json`.
   */
  private newId(category: string): string {
    const ts = nowIso().replace(/[:.]/g, "-").replace(/Z$/, "");
    const tail = randomUUID().slice(0, 4);
    return `nf-${category}-${ts}-${tail}`;
  }

  async readSettings(): Promise<NotificationsConfig> {
    return this.store.readSettings();
  }

  async writeSettings(c: NotificationsConfig): Promise<void> {
    await this.store.writeSettings(c);
  }

  /**
   * Create a notification from a draft and (best-effort, async) attempt to
   * deliver via every enabled gateway. Delivery failures are recorded as
   * receipts but never thrown.
   */
  async notify(draft: NotificationDraft): Promise<NotifyResult> {
    await this.init();
    const settings = await this.readSettings();
    const skeleton = draftToSkeleton(draft);
    const id = this.newId(skeleton.category);
    const ts = nowIso();
    const candidate: Notification = notificationSchema.parse({
      ...skeleton,
      id,
      createdAt: ts,
      updatedAt: ts,
    });

    if (!shouldEmit(candidate, settings)) {
      return {
        notification: null,
        emitted: false,
        reason: "filtered by user settings",
      };
    }

    await this.store.append(candidate);
    // Fire-and-forget delivery so callers (orchestrator, scheduler, …) are
    // never delayed by gateway latency. Errors are caught inside.
    void this.deliverInBackground(candidate, settings).catch((err) => {
      this.log(
        `[notifications] background delivery error: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });
    return { notification: candidate, emitted: true };
  }

  /**
   * Mark a notification read by id. Best-effort: missing ids are a no-op so
   * the dashboard never fails on stale state.
   */
  async markRead(id: string): Promise<Notification | null> {
    const all = await this.store.readAll();
    const idx = all.notifications.findIndex((n) => n.id === id);
    if (idx < 0) return null;
    const ts = nowIso();
    const next: Notification = {
      ...all.notifications[idx]!,
      readAt: ts,
      updatedAt: ts,
    };
    all.notifications[idx] = next;
    await this.store.writeAll(all);
    return next;
  }

  async markAllRead(): Promise<number> {
    const all = await this.store.readAll();
    const ts = nowIso();
    let count = 0;
    for (const n of all.notifications) {
      if (!n.readAt) {
        n.readAt = ts;
        n.updatedAt = ts;
        count++;
      }
    }
    await this.store.writeAll(all);
    return count;
  }

  async resolve(id: string): Promise<Notification | null> {
    const all = await this.store.readAll();
    const idx = all.notifications.findIndex((n) => n.id === id);
    if (idx < 0) return null;
    const ts = nowIso();
    const next: Notification = {
      ...all.notifications[idx]!,
      resolvedAt: ts,
      readAt: all.notifications[idx]!.readAt ?? ts,
      updatedAt: ts,
    };
    all.notifications[idx] = next;
    await this.store.writeAll(all);
    return next;
  }

  async list(): Promise<Notification[]> {
    const file = await this.store.readAll();
    return [...file.notifications].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }

  async unreadCount(): Promise<number> {
    const list = await this.list();
    return list.filter((n) => !n.readAt).length;
  }

  // ─── delivery ────────────────────────────────────────────────────────────

  private async getRegistry(): Promise<GatewayRegistry> {
    if (this.registry) return this.registry;
    this.registry = await buildDefaultRegistry(this.projectRoot, this.log);
    return this.registry;
  }

  private async deliverInBackground(
    notification: Notification,
    settings: NotificationsConfig,
  ): Promise<void> {
    const registry = await this.getRegistry();
    const gatewayConfigs = await this.store.readGateways();
    const receipts = await registry.deliver({
      notification,
      settings,
      gatewayConfigs: gatewayConfigs.gateways,
    });
    if (receipts.length === 0) return;
    const file = await this.store.readReceipts();
    file.receipts.push(...receipts);
    await this.store.writeReceipts(file);
  }
}

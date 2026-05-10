import type {
  DeliveryReceipt,
  GatewayConfig,
  Notification,
  NotificationsConfig,
} from "../notification-types.js";
import { gatewayWillRelay } from "../notification-rules.js";
import type { Gateway } from "./gateway-types.js";
import { cliGateway } from "./cli-gateway.js";
import { inAppGateway } from "./inapp-gateway.js";
import { webhookGateway } from "./webhook-gateway.js";
import { discordGateway } from "./discord-gateway.js";
import { slackGateway } from "./slack-gateway.js";
import { telegramGateway } from "./telegram-gateway.js";
import { whatsappPlaceholderGateway } from "./whatsapp-placeholder.js";

export class GatewayRegistry {
  private readonly gateways = new Map<string, Gateway>();

  constructor(initial: readonly Gateway[]) {
    for (const g of initial) this.gateways.set(g.id, g);
  }

  list(): Gateway[] {
    return [...this.gateways.values()];
  }

  get(id: string): Gateway | null {
    return this.gateways.get(id) ?? null;
  }

  /**
   * Deliver to every enabled gateway. Errors are caught per-gateway; the
   * caller is never thrown into. Receipts are returned for persistence.
   */
  async deliver(input: {
    notification: Notification;
    settings: NotificationsConfig;
    gatewayConfigs: Record<string, GatewayConfig>;
  }): Promise<DeliveryReceipt[]> {
    const out: DeliveryReceipt[] = [];

    // The in-app gateway runs implicitly: persisting the notification IS the
    // delivery. We still emit a receipt for the audit trail.
    const inAppCfg = input.gatewayConfigs["in-app"] ?? {
      enabled: input.settings.inApp.enabled,
      url: null,
      token: null,
      target: null,
      minSeverity: "info" as const,
      categories: [],
    };
    out.push(
      await inAppGateway.deliver({
        notification: input.notification,
        config: inAppCfg,
        settings: input.settings,
      }),
    );

    // CLI gateway delivers only when an attached writer exists.
    const cliCfg = input.gatewayConfigs["cli"] ?? {
      enabled: input.settings.cli.enabled,
      url: null,
      token: null,
      target: null,
      minSeverity: "attention" as const,
      categories: [],
    };
    if (cliCfg.enabled) {
      out.push(
        await cliGateway.deliver({
          notification: input.notification,
          config: cliCfg,
          settings: input.settings,
        }),
      );
    }

    // External gateways. Each has its own min-severity and category gate.
    for (const [id, cfg] of Object.entries(input.gatewayConfigs)) {
      if (id === "in-app" || id === "cli") continue;
      if (!cfg.enabled) continue;
      const gateway = this.gateways.get(id);
      if (!gateway) continue;
      if (
        !gatewayWillRelay({
          notification: input.notification,
          gatewayMinSeverity: cfg.minSeverity,
          gatewayCategories: cfg.categories,
        })
      ) {
        continue;
      }
      try {
        const receipt = await gateway.deliver({
          notification: input.notification,
          config: cfg,
          settings: input.settings,
        });
        out.push(receipt);
      } catch (err) {
        // deliver() implementations are supposed to be defensive; this is
        // belt-and-braces so a bad gateway never crashes the orchestrator.
        out.push({
          id: `synthetic-${gateway.id}-${input.notification.id}`,
          notificationId: input.notification.id,
          gatewayId: gateway.id,
          channel: gateway.channel,
          status: "failed",
          attemptedAt: new Date().toISOString(),
          deliveredAt: null,
          failedAt: new Date().toISOString(),
          errorMessage:
            err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
          externalMessageId: null,
          retryCount: 0,
        });
      }
    }
    return out;
  }
}

export async function buildDefaultRegistry(
  _projectRoot: string,
  _log: (line: string) => void,
): Promise<GatewayRegistry> {
  void _projectRoot;
  void _log;
  return new GatewayRegistry([
    inAppGateway,
    cliGateway,
    webhookGateway,
    discordGateway,
    slackGateway,
    telegramGateway,
    whatsappPlaceholderGateway,
  ]);
}

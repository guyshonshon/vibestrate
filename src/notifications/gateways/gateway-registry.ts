/**
 * Holds the gateways a notification can be delivered to, and fans one
 * notification out to them.
 *
 * `deliver` handles the two local gateways before it walks the configured
 * ones: the in-app gateway is invoked unconditionally because persisting the
 * notification IS the delivery (the receipt exists for the audit trail), and
 * the CLI gateway runs when its config is enabled. Any other config entry is
 * skipped unless it is enabled, registered here, and passes the per-gateway
 * severity/category gate.
 *
 * Delivery is best-effort: a gateway that throws becomes a synthetic "failed"
 * receipt instead of propagating, so one broken gateway cannot fail the run
 * that raised the notification. Receipts are returned, not persisted here.
 *
 * Every delivery goes through `attempt`, including the two local ones. They
 * used to be bare awaits with only the configured-gateway loop wrapped, which
 * had it exactly backwards: buildDefaultRegistry registers in-app and CLI and
 * nothing else, so the protected loop was empty and the unprotected pair was
 * the whole of delivery. The CLI gateway writes through a caller-installed
 * writer, which is the most likely thing here to throw.
 */
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
// External-API notification gateways (slack/telegram/discord/webhook/whatsapp) were
// removed: no external comms for notifications. Only local gateways ship.

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
      await this.attempt(inAppGateway, {
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
        await this.attempt(cliGateway, {
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
      out.push(
        await this.attempt(gateway, {
          notification: input.notification,
          config: cfg,
          settings: input.settings,
        }),
      );
    }
    return out;
  }

  /**
   * One delivery, degraded to a "failed" receipt if it throws. deliver()
   * implementations are supposed to be defensive already; this is the boundary
   * that makes it impossible to forget.
   */
  private async attempt(
    gateway: Gateway,
    args: Parameters<Gateway["deliver"]>[0],
  ): Promise<DeliveryReceipt> {
    try {
      return await gateway.deliver(args);
    } catch (err) {
      const at = new Date().toISOString();
      return {
        id: `synthetic-${gateway.id}-${args.notification.id}`,
        notificationId: args.notification.id,
        gatewayId: gateway.id,
        channel: gateway.channel,
        status: "failed",
        attemptedAt: at,
        deliveredAt: null,
        failedAt: at,
        errorMessage:
          err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
        externalMessageId: null,
        retryCount: 0,
      };
    }
  }
}

export async function buildDefaultRegistry(
  _projectRoot: string,
  _log: (line: string) => void,
): Promise<GatewayRegistry> {
  void _projectRoot;
  void _log;
  return new GatewayRegistry([inAppGateway, cliGateway]);
}

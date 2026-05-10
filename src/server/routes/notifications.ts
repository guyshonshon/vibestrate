import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { NotificationService } from "../../notifications/notification-service.js";
import { NotificationStore } from "../../notifications/notification-store.js";
import { buildDefaultRegistry } from "../../notifications/gateways/gateway-registry.js";
import {
  envVarName,
} from "../../notifications/gateways/secret-resolver.js";
import {
  notificationsConfigSchema,
  SAFE_ID_RE,
  gatewayConfigSchema,
} from "../../notifications/notification-types.js";
import { HttpError } from "../security.js";

function assertSafeId(id: string): void {
  if (!SAFE_ID_RE.test(id) || id.includes("..")) {
    throw new HttpError(400, "Invalid notification id.");
  }
}

const settingsBody = notificationsConfigSchema.partial();
const gatewayBody = gatewayConfigSchema.partial();

/** Strip secrets from a gateway config before sending it to the UI. */
function safeGatewayView(id: string, cfg: import("../../notifications/notification-types.js").GatewayConfig) {
  const valueOrEnvHint = (v: string | null) => {
    if (!v) return null;
    const env = envVarName(v);
    if (env) {
      return {
        kind: "env-ref" as const,
        envVar: env,
        envVarSet: !!process.env[env],
      };
    }
    return { kind: "literal" as const, hasValue: true };
  };
  return {
    id,
    enabled: cfg.enabled,
    minSeverity: cfg.minSeverity,
    categories: cfg.categories,
    url: valueOrEnvHint(cfg.url),
    token: valueOrEnvHint(cfg.token),
    target: valueOrEnvHint(cfg.target),
  };
}

export type NotificationsRoutesDeps = { projectRoot: string };

export async function registerNotificationRoutes(
  app: FastifyInstance,
  deps: NotificationsRoutesDeps,
): Promise<void> {
  const svc = new NotificationService(deps.projectRoot);
  const store = new NotificationStore(deps.projectRoot);
  const registry = await buildDefaultRegistry(deps.projectRoot, () => {});

  app.get("/api/notifications", async () => {
    const list = await svc.list();
    const unread = list.filter((n) => !n.readAt).length;
    return { notifications: list, unread };
  });

  app.get<{ Params: { notificationId: string } }>(
    "/api/notifications/:notificationId",
    async (req) => {
      assertSafeId(req.params.notificationId);
      const list = await svc.list();
      const n = list.find((x) => x.id === req.params.notificationId);
      if (!n) throw new HttpError(404, "Notification not found.");
      return { notification: n };
    },
  );

  app.post<{ Params: { notificationId: string } }>(
    "/api/notifications/:notificationId/read",
    async (req) => {
      assertSafeId(req.params.notificationId);
      const updated = await svc.markRead(req.params.notificationId);
      if (!updated) throw new HttpError(404, "Notification not found.");
      return { notification: updated };
    },
  );

  app.post<{ Params: { notificationId: string } }>(
    "/api/notifications/:notificationId/resolve",
    async (req) => {
      assertSafeId(req.params.notificationId);
      const updated = await svc.resolve(req.params.notificationId);
      if (!updated) throw new HttpError(404, "Notification not found.");
      return { notification: updated };
    },
  );

  app.post("/api/notifications/read-all", async () => {
    const count = await svc.markAllRead();
    return { read: count };
  });

  app.get("/api/notifications/settings", async () => {
    const settings = await svc.readSettings();
    const file = await store.readGateways();
    const gateways = registry.list().map((g) => {
      const cfg = file.gateways[g.id] ?? {
        enabled: false,
        url: null,
        token: null,
        target: null,
        minSeverity: "attention" as const,
        categories: [],
      };
      const validation = g.validateConfig(cfg);
      return {
        id: g.id,
        type: g.type,
        channel: g.channel,
        displayName: g.displayName,
        supportsTest: g.supportsTest,
        config: safeGatewayView(g.id, cfg),
        valid: validation.ok,
        validationReason: validation.reason ?? null,
        envVarsReferenced: validation.envVarsReferenced,
        missingEnvVars: validation.missingEnvVars,
      };
    });
    return { settings, gateways };
  });

  app.patch<{ Body: unknown }>(
    "/api/notifications/settings",
    async (req) => {
      const parsed = settingsBody.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, parsed.error.message);
      }
      const current = await svc.readSettings();
      const next = { ...current, ...parsed.data };
      await svc.writeSettings(next);
      return { settings: next };
    },
  );

  app.get<{ Params: { gatewayId: string } }>(
    "/api/gateways/:gatewayId",
    async (req) => {
      const id = req.params.gatewayId;
      const gateway = registry.get(id);
      if (!gateway) throw new HttpError(404, "Gateway not found.");
      const file = await store.readGateways();
      const cfg = file.gateways[id] ?? {
        enabled: false,
        url: null,
        token: null,
        target: null,
        minSeverity: "attention" as const,
        categories: [],
      };
      const validation = gateway.validateConfig(cfg);
      return {
        id,
        displayName: gateway.displayName,
        config: safeGatewayView(id, cfg),
        validation,
      };
    },
  );

  app.patch<{ Params: { gatewayId: string }; Body: unknown }>(
    "/api/gateways/:gatewayId",
    async (req) => {
      const id = req.params.gatewayId;
      const gateway = registry.get(id);
      if (!gateway) throw new HttpError(404, "Gateway not found.");
      const parsed = gatewayBody.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, parsed.error.message);
      }
      const file = await store.readGateways();
      const current = file.gateways[id] ?? {
        enabled: false,
        url: null,
        token: null,
        target: null,
        minSeverity: "attention" as const,
        categories: [],
      };
      const next = { ...current, ...parsed.data } as typeof current;
      file.gateways[id] = next;
      await store.writeGateways(file);
      return {
        id,
        config: safeGatewayView(id, next),
        validation: gateway.validateConfig(next),
      };
    },
  );

  app.post<{ Params: { gatewayId: string } }>(
    "/api/gateways/:gatewayId/test",
    async (req) => {
      const id = req.params.gatewayId;
      const gateway = registry.get(id);
      if (!gateway) throw new HttpError(404, "Gateway not found.");
      if (!gateway.test) {
        throw new HttpError(400, "This gateway does not support test mode.");
      }
      const file = await store.readGateways();
      const cfg = file.gateways[id];
      if (!cfg) {
        throw new HttpError(400, "Gateway has not been configured yet.");
      }
      const result = await gateway.test({ config: cfg });
      return result;
    },
  );

  app.get("/api/gateways", async () => {
    const file = await store.readGateways();
    return {
      gateways: registry.list().map((g) => {
        const cfg = file.gateways[g.id] ?? {
          enabled: false,
          url: null,
          token: null,
          target: null,
          minSeverity: "attention" as const,
          categories: [],
        };
        const validation = g.validateConfig(cfg);
        return {
          id: g.id,
          type: g.type,
          channel: g.channel,
          displayName: g.displayName,
          supportsTest: g.supportsTest,
          config: safeGatewayView(g.id, cfg),
          valid: validation.ok,
          missingEnvVars: validation.missingEnvVars,
        };
      }),
    };
  });
  void z;
}

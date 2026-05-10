import type { DeliverInput, Gateway } from "./gateway-types.js";
import { makeReceipt } from "../delivery-receipts.js";

/**
 * The in-app gateway is a marker: persisting the notification record IS the
 * in-app delivery (the dashboard reads `.amaco/notifications/notifications.json`).
 * We still emit a receipt so the receipts log is consistent.
 */
export const inAppGateway: Gateway = {
  id: "in-app",
  type: "in-app",
  channel: "in-app",
  displayName: "In-app notification center",
  supportsTest: false,
  validateConfig() {
    return { ok: true, envVarsReferenced: [], missingEnvVars: [] };
  },
  async deliver(input: DeliverInput) {
    const { notification, config } = input;
    return makeReceipt({
      notification,
      gatewayId: this.id,
      channel: this.channel,
      status: config.enabled ? "delivered" : "skipped",
    });
  },
};

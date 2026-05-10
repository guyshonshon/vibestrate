import type { DeliverInput, Gateway, ValidateConfigResult } from "./gateway-types.js";
import { envVarName } from "./secret-resolver.js";
import { makeReceipt } from "../delivery-receipts.js";

/**
 * WhatsApp gateway is intentionally a placeholder in V0.
 *
 * A safe WhatsApp adapter requires a verified provider account (e.g. Twilio
 * or the WhatsApp Cloud API) plus phone-number registration that we cannot
 * fake. The schema and routing layer are real so a future commit can drop in
 * a real adapter without touching everything else; for now `deliver` always
 * returns a `skipped` receipt with a clear message and `test` reports the
 * planned status.
 */
export const whatsappPlaceholderGateway: Gateway = {
  id: "whatsapp",
  type: "whatsapp-placeholder",
  channel: "whatsapp",
  displayName: "WhatsApp (planned)",
  supportsTest: true,
  validateConfig(config): ValidateConfigResult {
    const envRefs: string[] = [];
    const missing: string[] = [];
    for (const v of [config.token, config.target, config.url]) {
      const env = envVarName(v);
      if (env) {
        envRefs.push(env);
        if (!process.env[env]) missing.push(env);
      }
    }
    return {
      ok: false,
      reason:
        "WhatsApp delivery is planned but not implemented in V0. Configure a Twilio/WhatsApp-Cloud-API adapter when one ships.",
      envVarsReferenced: envRefs,
      missingEnvVars: missing,
    };
  },
  async deliver(input: DeliverInput) {
    return makeReceipt({
      notification: input.notification,
      gatewayId: this.id,
      channel: this.channel,
      status: "skipped",
      errorMessage:
        "WhatsApp gateway is planned (no real adapter ships in V0).",
    });
  },
  async test() {
    return {
      ok: false,
      message:
        "WhatsApp is planned but not implemented in V0. No external request was made.",
    };
  },
};

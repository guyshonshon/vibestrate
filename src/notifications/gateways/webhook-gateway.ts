import type { DeliverInput, Gateway, ValidateConfigResult } from "./gateway-types.js";
import { DEFAULT_TIMEOUT_MS } from "./gateway-types.js";
import { envVarName, redact, resolveSecret } from "./secret-resolver.js";
import { makeReceipt } from "../delivery-receipts.js";
import type { Notification } from "../notification-types.js";

function buildBody(notification: Notification): unknown {
  return {
    id: notification.id,
    severity: notification.severity,
    category: notification.category,
    title: notification.title,
    message: notification.message,
    runId: notification.runId,
    taskId: notification.taskId,
    approvalId: notification.approvalId,
    actionRequired: notification.actionRequired,
    actionLabel: notification.actionLabel,
    actionUrl: notification.actionUrl,
    createdAt: notification.createdAt,
  };
}

/** Used by Discord/Slack/Telegram gateways too — pure transport. */
export async function postJsonWithTimeout(input: {
  url: string;
  body: unknown;
  timeoutMs?: number;
  headers?: Record<string, string>;
}): Promise<{ ok: boolean; status: number; text: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), input.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(input.url, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", ...(input.headers ?? {}) },
      body: JSON.stringify(input.body),
    });
    const text = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, text: text.slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}

export const webhookGateway: Gateway = {
  id: "webhook",
  type: "webhook",
  channel: "webhook",
  displayName: "Generic webhook",
  supportsTest: true,
  validateConfig(config): ValidateConfigResult {
    const envRefs: string[] = [];
    const missing: string[] = [];
    const urlEnv = envVarName(config.url);
    if (urlEnv) {
      envRefs.push(urlEnv);
      if (!process.env[urlEnv]) missing.push(urlEnv);
    }
    if (!config.url || (urlEnv ? false : !/^https?:\/\//.test(config.url))) {
      return {
        ok: false,
        reason: "Webhook URL is missing or not http(s).",
        envVarsReferenced: envRefs,
        missingEnvVars: missing,
      };
    }
    return { ok: true, envVarsReferenced: envRefs, missingEnvVars: missing };
  },
  async deliver(input: DeliverInput) {
    const { notification, config } = input;
    const url = resolveSecret(config.url);
    if (!url) {
      return makeReceipt({
        notification,
        gatewayId: this.id,
        channel: this.channel,
        status: "skipped",
        errorMessage: "webhook URL is missing or env var unset",
      });
    }
    try {
      const r = await postJsonWithTimeout({
        url,
        body: { type: "amaco.notification", notification: buildBody(notification) },
      });
      if (r.ok) {
        return makeReceipt({
          notification,
          gatewayId: this.id,
          channel: this.channel,
          status: "delivered",
        });
      }
      return makeReceipt({
        notification,
        gatewayId: this.id,
        channel: this.channel,
        status: "failed",
        errorMessage: redact(`HTTP ${r.status}: ${r.text || "(no body)"}`, [url]),
      });
    } catch (err) {
      return makeReceipt({
        notification,
        gatewayId: this.id,
        channel: this.channel,
        status: "failed",
        errorMessage: redact(err, [url]),
      });
    }
  },
  async test(input) {
    const url = resolveSecret(input.config.url);
    if (!url) {
      return {
        ok: false,
        message: "Webhook URL is not configured (or env var is unset).",
      };
    }
    try {
      const r = await postJsonWithTimeout({
        url,
        body: { type: "amaco.test", message: "Amaco webhook test." },
      });
      return r.ok
        ? { ok: true, message: `Webhook responded ${r.status}.` }
        : { ok: false, message: `Webhook responded ${r.status}.` };
    } catch (err) {
      return {
        ok: false,
        message: redact(err, [url]),
      };
    }
  },
};

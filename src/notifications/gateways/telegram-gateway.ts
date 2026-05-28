import type { DeliverInput, Gateway } from "./gateway-types.js";
import { envVarName, redact, resolveSecret } from "./secret-resolver.js";
import { makeReceipt } from "../delivery-receipts.js";
import { postJsonWithTimeout } from "./webhook-gateway.js";
import type { Notification, Severity } from "../notification-types.js";

const TELEGRAM_PREFIX: Record<Severity, string> = {
  info: "ℹ️",
  success: "✅",
  warning: "⚠️",
  attention: "🔔",
  critical: "🚨",
};

export function buildTelegramText(n: Notification): string {
  const lines = [`${TELEGRAM_PREFIX[n.severity]} *${escape(n.title)}*`];
  if (n.message) lines.push(escape(n.message));
  if (n.runId) lines.push(`run: \`${escape(n.runId)}\``);
  if (n.taskId) lines.push(`task: \`${escape(n.taskId)}\``);
  if (n.actionLabel && n.actionUrl) {
    lines.push(`${escape(n.actionLabel)}: ${escape(n.actionUrl)}`);
  }
  return lines.join("\n");
}

function escape(s: string): string {
  // Telegram MarkdownV2 reserved characters; keep escaping conservative.
  return s.replace(/([_*\[\]()~`>#+=|{}.!\\-])/g, "\\$1");
}

export const telegramGateway: Gateway = {
  id: "telegram",
  type: "telegram",
  channel: "telegram",
  displayName: "Telegram bot",
  supportsTest: true,
  validateConfig(config) {
    const envRefs: string[] = [];
    const missing: string[] = [];
    for (const v of [config.token, config.target]) {
      const env = envVarName(v);
      if (env) {
        envRefs.push(env);
        if (!process.env[env]) missing.push(env);
      }
    }
    if (!config.token) {
      return {
        ok: false,
        reason:
          "Telegram gateway needs a bot token (literal or env:NAME). target is the chat id.",
        envVarsReferenced: envRefs,
        missingEnvVars: missing,
      };
    }
    if (!config.target) {
      return {
        ok: false,
        reason: "Telegram gateway needs target (chat id).",
        envVarsReferenced: envRefs,
        missingEnvVars: missing,
      };
    }
    return { ok: true, envVarsReferenced: envRefs, missingEnvVars: missing };
  },
  async deliver(input: DeliverInput) {
    const token = resolveSecret(input.config.token);
    const chatId = resolveSecret(input.config.target);
    if (!token || !chatId) {
      return makeReceipt({
        notification: input.notification,
        gatewayId: this.id,
        channel: this.channel,
        status: "skipped",
        errorMessage:
          "Telegram bot token or chat id missing (or env vars unset)",
      });
    }
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    try {
      const r = await postJsonWithTimeout({
        url,
        body: {
          chat_id: chatId,
          text: buildTelegramText(input.notification),
          parse_mode: "MarkdownV2",
          disable_web_page_preview: true,
        },
      });
      return r.ok
        ? makeReceipt({
            notification: input.notification,
            gatewayId: this.id,
            channel: this.channel,
            status: "delivered",
          })
        : makeReceipt({
            notification: input.notification,
            gatewayId: this.id,
            channel: this.channel,
            status: "failed",
            errorMessage: redact(`HTTP ${r.status}: ${r.text}`, [token, chatId]),
          });
    } catch (err) {
      return makeReceipt({
        notification: input.notification,
        gatewayId: this.id,
        channel: this.channel,
        status: "failed",
        errorMessage: redact(err, [token, chatId]),
      });
    }
  },
  async test(input) {
    const token = resolveSecret(input.config.token);
    const chatId = resolveSecret(input.config.target);
    if (!token || !chatId) {
      return {
        ok: false,
        message: "Telegram bot token or chat id missing (or env vars unset).",
      };
    }
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    try {
      const r = await postJsonWithTimeout({
        url,
        body: { chat_id: chatId, text: "Vibestrate Telegram gateway test." },
      });
      return r.ok
        ? { ok: true, message: `Telegram responded ${r.status}.` }
        : { ok: false, message: `Telegram responded ${r.status}.` };
    } catch (err) {
      return { ok: false, message: redact(err, [token, chatId]) };
    }
  },
};

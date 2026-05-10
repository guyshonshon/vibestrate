import type { DeliverInput, Gateway } from "./gateway-types.js";
import { envVarName, redact, resolveSecret } from "./secret-resolver.js";
import { makeReceipt } from "../delivery-receipts.js";
import { postJsonWithTimeout } from "./webhook-gateway.js";
import type { Notification, Severity } from "../notification-types.js";

const DISCORD_COLOR: Record<Severity, number> = {
  info: 0x5b6878,
  success: 0x5ec27c,
  warning: 0xd8a23a,
  attention: 0x4ea1ff,
  critical: 0xd96666,
};

export function buildDiscordPayload(n: Notification): unknown {
  return {
    embeds: [
      {
        title: n.title.slice(0, 256),
        description: n.message.slice(0, 2000),
        color: DISCORD_COLOR[n.severity],
        fields: [
          n.runId ? { name: "Run", value: n.runId, inline: true } : null,
          n.taskId ? { name: "Task", value: n.taskId, inline: true } : null,
          n.approvalId
            ? { name: "Approval", value: n.approvalId, inline: true }
            : null,
          n.actionLabel && n.actionUrl
            ? { name: n.actionLabel, value: n.actionUrl, inline: false }
            : null,
        ].filter(Boolean),
        footer: { text: `amaco · ${n.category} · ${n.severity}` },
        timestamp: n.createdAt,
      },
    ],
  };
}

export const discordGateway: Gateway = {
  id: "discord",
  type: "discord",
  channel: "discord",
  displayName: "Discord (webhook)",
  supportsTest: true,
  validateConfig(config) {
    const envRefs: string[] = [];
    const missing: string[] = [];
    const env = envVarName(config.url);
    if (env) {
      envRefs.push(env);
      if (!process.env[env]) missing.push(env);
    }
    if (!config.url || !/^env:|^https?:\/\//.test(config.url)) {
      return {
        ok: false,
        reason:
          "Discord gateway needs a webhook URL (literal https://discord.com/api/webhooks/... or env:NAME).",
        envVarsReferenced: envRefs,
        missingEnvVars: missing,
      };
    }
    return { ok: true, envVarsReferenced: envRefs, missingEnvVars: missing };
  },
  async deliver(input: DeliverInput) {
    const url = resolveSecret(input.config.url);
    if (!url) {
      return makeReceipt({
        notification: input.notification,
        gatewayId: this.id,
        channel: this.channel,
        status: "skipped",
        errorMessage: "Discord webhook URL missing or env var unset",
      });
    }
    try {
      const r = await postJsonWithTimeout({
        url,
        body: buildDiscordPayload(input.notification),
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
            errorMessage: redact(`HTTP ${r.status}: ${r.text}`, [url]),
          });
    } catch (err) {
      return makeReceipt({
        notification: input.notification,
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
        message: "Discord webhook URL is not configured (or env var is unset).",
      };
    }
    try {
      const r = await postJsonWithTimeout({
        url,
        body: { content: "Amaco Discord gateway test." },
      });
      return r.ok
        ? { ok: true, message: `Discord responded ${r.status}.` }
        : { ok: false, message: `Discord responded ${r.status}.` };
    } catch (err) {
      return { ok: false, message: redact(err, [url]) };
    }
  },
};

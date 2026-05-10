import type { DeliverInput, Gateway } from "./gateway-types.js";
import { envVarName, redact, resolveSecret } from "./secret-resolver.js";
import { makeReceipt } from "../delivery-receipts.js";
import { postJsonWithTimeout } from "./webhook-gateway.js";
import type { Notification, Severity } from "../notification-types.js";

const SLACK_EMOJI: Record<Severity, string> = {
  info: ":information_source:",
  success: ":white_check_mark:",
  warning: ":warning:",
  attention: ":bell:",
  critical: ":rotating_light:",
};

export function buildSlackPayload(n: Notification): unknown {
  const lines = [`${SLACK_EMOJI[n.severity]} *${n.title}*`];
  if (n.message) lines.push(n.message);
  if (n.runId) lines.push(`run: \`${n.runId}\``);
  if (n.taskId) lines.push(`task: \`${n.taskId}\``);
  if (n.actionLabel && n.actionUrl) {
    lines.push(`${n.actionLabel}: ${n.actionUrl}`);
  }
  return { text: lines.join("\n") };
}

export const slackGateway: Gateway = {
  id: "slack",
  type: "slack",
  channel: "slack",
  displayName: "Slack (incoming webhook)",
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
          "Slack gateway needs an incoming-webhook URL (literal or env:NAME).",
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
        errorMessage: "Slack webhook URL missing or env var unset",
      });
    }
    try {
      const r = await postJsonWithTimeout({
        url,
        body: buildSlackPayload(input.notification),
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
      return { ok: false, message: "Slack webhook URL is not configured." };
    }
    try {
      const r = await postJsonWithTimeout({
        url,
        body: { text: ":wave: Amaco Slack gateway test." },
      });
      return r.ok
        ? { ok: true, message: `Slack responded ${r.status}.` }
        : { ok: false, message: `Slack responded ${r.status}.` };
    } catch (err) {
      return { ok: false, message: redact(err, [url]) };
    }
  },
};

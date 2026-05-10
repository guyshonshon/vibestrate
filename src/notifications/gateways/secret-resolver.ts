/**
 * Resolve a config value that may reference an env var.
 *
 *   "https://hooks.slack.com/..."   → literal value
 *   "env:SLACK_WEBHOOK_URL"         → process.env.SLACK_WEBHOOK_URL or undefined
 *   null / ""                        → undefined
 *
 * Resolved values must be treated as secrets: never log them.
 */
export function resolveSecret(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const m = trimmed.match(/^env:([A-Z][A-Z0-9_]*)$/);
  if (m) {
    return process.env[m[1]!];
  }
  return trimmed;
}

/**
 * Returns the env var name when `value` is an env-ref like "env:NAME".
 * Otherwise returns null. Useful for doctor / settings UI to surface "missing
 * env var" without revealing the resolved secret.
 */
export function envVarName(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = value.trim().match(/^env:([A-Z][A-Z0-9_]*)$/);
  return m ? m[1]! : null;
}

/**
 * Replace any substring that looks like a secret (URLs, bot tokens, env
 * values) with a redaction marker. Used when surfacing errors back to
 * receipts/logs.
 */
export function redact(input: unknown, secrets: Array<string | undefined>): string {
  let text = typeof input === "string" ? input : input instanceof Error ? input.message : String(input ?? "");
  for (const s of secrets) {
    if (!s) continue;
    if (s.length < 4) continue; // never strip short literals — too risky
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(escaped, "g"), "[redacted]");
  }
  // Belt-and-braces: also redact obvious bearer tokens and slack/discord paths.
  text = text.replace(/Bearer\s+[A-Za-z0-9._\-]+/g, "Bearer [redacted]");
  text = text.replace(/(https?:\/\/[^\s"]+\/services\/[^\s"]+)/g, "[redacted-webhook]");
  text = text.replace(/(https?:\/\/discord\.com\/api\/webhooks\/[^\s"]+)/g, "[redacted-webhook]");
  text = text.replace(/(https?:\/\/api\.telegram\.org\/bot[^/]+\/[^\s"]+)/g, "[redacted-telegram]");
  return text;
}

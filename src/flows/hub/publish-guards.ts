// src/flows/hub/publish-guards.ts
import os from "node:os";
import { scanTextForSecrets } from "../../core/diff-service.js";

// Hub grammar, copied VERBATIM from vibestrate-marketing/registry/src/refs.ts.
// Do not approximate - the alnum end-anchor and the 2-40 length are load-bearing.
const HUB_NAME_RE = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;
const HUB_HANDLE_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/;
const HUB_SEMVER_RE = /^\d{1,9}\.\d{1,9}\.\d{1,9}$/;

export function buildPublishRef(input: {
  handle: string;
  name: string;
  version: string;
}): { ok: true; ref: string } | { ok: false; reason: string } {
  const handle = input.handle.trim();
  const name = input.name.trim();
  const version = input.version.trim();

  // Reject smuggled ref structure before anything else.
  if (/[@:]/.test(handle) || /[@:]/.test(name)) {
    return { ok: false, reason: "handle/name may not contain '@' or ':'." };
  }
  if (!handle) {
    return { ok: false, reason: "a handle is required (your GitHub login); bare-name flows are maintainer-only." };
  }
  if (!HUB_HANDLE_RE.test(handle)) {
    return { ok: false, reason: `invalid handle "${handle}" (GitHub-style: 1-39 chars, single internal hyphens).` };
  }
  if (!HUB_NAME_RE.test(name)) {
    return {
      ok: false,
      reason: `"${name}" is not a valid hub name (2-40 chars, lowercase alphanumeric + internal hyphens, must start and end alphanumeric). Pass --name to override.`,
    };
  }
  if (!HUB_SEMVER_RE.test(version)) {
    return { ok: false, reason: `version "${version}" must be a concrete semver like 1.2.0 (not "latest").` };
  }
  return { ok: true, ref: `${handle}@${name}:${version}` };
}

// Publish-scoped extra token shapes. Kept LOCAL to publish (not added to the
// shared SECRET_CONTENT_PATTERNS) on purpose: the shared set is deliberately
// underfit to avoid false-positive patch blocks; publish can afford a broader,
// recoverable refusal. These align the client up to the server's secret.token
// rule so the client is never weaker than the server.
const PUBLISH_EXTRA_SECRETS: { name: string; re: RegExp }[] = [
  { name: "OpenAI-style key", re: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: "GitHub fine-grained PAT (short)", re: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/ },
];

export function assertNoHardSecrets(content: string): string[] {
  const reasons: string[] = [];
  for (const m of scanTextForSecrets(content)) {
    reasons.push(`looks like a secret (${m.pattern}) on line ${m.line + 1}: ${m.redactedSnippet}`);
  }
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    for (const { name, re } of PUBLISH_EXTRA_SECRETS) {
      const found = re.exec(lines[i]!);
      if (found) {
        const tok = found[0];
        const red = tok.length <= 8 ? `${tok.slice(0, 2)}...(${tok.length})` : `${tok.slice(0, 4)}...(${tok.length} chars)`;
        reasons.push(`looks like a secret (${name}) on line ${i + 1}: ${red}`);
      }
    }
  }
  return reasons;
}

export function collectPublishWarnings(content: string): string[] {
  const warnings: string[] = [];
  const home = os.homedir();
  if (home && content.includes(home)) {
    warnings.push(`contains your home directory path (${home}) - it embeds your username and will be public.`);
  }
  const pathRe = /(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)[^\s"':,)]+/;
  if (pathRe.test(content)) {
    warnings.push("contains an absolute user path (e.g. /Users/<name>/...) - it may leak your username and local layout.");
  }
  if (/\benv:[A-Z][A-Z0-9_]*/.test(content)) {
    warnings.push("references an env: secret variable - the reference (not the value) will be public.");
  }
  if (/[a-z][a-z0-9+.-]*:\/\/[^\s/@]+:[^\s/@]+@/i.test(content)) {
    warnings.push("contains a URL with embedded credentials (user:pass@host).");
  }
  return warnings;
}

export function runPublishPreflight(
  content: string,
): { ok: false; refusals: string[] } | { ok: true; warnings: string[] } {
  const refusals = assertNoHardSecrets(content);
  if (refusals.length > 0) return { ok: false, refusals };
  return { ok: true, warnings: collectPublishWarnings(content) };
}

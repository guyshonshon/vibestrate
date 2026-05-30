// Single-flow import / export / create — the first slice of the Flows hub
// (design `docs/design/roadmap-and-sequencing.md` §5). A Flow is portable
// *because* of the Phase-0 rewrite: it names Seats, not local Role / Provider
// ids, so a YAML fetched from a URL or another project drops straight into
// `.vibestrate/flows/` and resolves against whatever Crew the importing
// project already has.
//
// Everything funnels through one guarded writer (`writeProjectFlowDefinition`)
// so import, URL fetch, and the create API share the same path guard, secret
// scan, control-char guard, overwrite policy, and atomic write. The flow id is
// schema-constrained to `[a-z][a-z0-9-]*` (flowTokenSchema), which is what
// keeps the `<id>/flow.yml` target path inside the flows dir.

import path from "node:path";
import fs from "node:fs/promises";
import dns from "node:dns/promises";
import net from "node:net";
import YAML from "yaml";
import { isPathInside, projectFlowsDir } from "../../utils/paths.js";
import { pathExists, readText } from "../../utils/fs.js";
import { scanTextForSecrets } from "../../core/diff-service.js";
import {
  flowDefinitionSchema,
  type FlowDefinition,
  type FlowSource,
} from "../schemas/flow-schema.js";
import { findFlowById } from "../catalog/flow-discovery.js";

/** Cap on imported YAML size. A flow definition is a few KB; anything past
 *  this is either a mistake or an attempt to wedge the parser. */
export const FLOW_IMPORT_MAX_BYTES = 256 * 1024;

/** Wall-clock cap on a URL fetch. */
export const FLOW_IMPORT_FETCH_TIMEOUT_MS = 10_000;

export type FlowPortabilityError = { ok: false; status: number; reasons: string[] };

export type FlowExportResult =
  | { ok: true; flowId: string; source: FlowSource; yaml: string }
  | FlowPortabilityError;

export type FlowWriteResult =
  | { ok: true; flowId: string; definitionPath: string; overwritten: boolean }
  | FlowPortabilityError;

/** Parsed + schema-valid definition, ready for the guarded writer. */
type ValidateResult =
  | { ok: true; definition: FlowDefinition }
  | FlowPortabilityError;

// ─── export ──────────────────────────────────────────────────────────────

/**
 * Render any discovered flow (builtin, fixture, or project) to canonical YAML
 * for sharing. The output is the same shape the loader accepts, so an export
 * from one project imports cleanly into another.
 */
export async function exportFlowYaml(input: {
  projectRoot: string;
  flowId: string;
}): Promise<FlowExportResult> {
  const flow = await findFlowById(input.projectRoot, input.flowId);
  if (!flow) {
    return { ok: false, status: 404, reasons: [`Flow "${input.flowId}" not found.`] };
  }
  return {
    ok: true,
    flowId: flow.id,
    source: flow.source,
    yaml: YAML.stringify(flow.definition),
  };
}

// ─── content guards ────────────────────────────────────────────────────────

/**
 * Reject NUL bytes and disallowed control characters in fetched/imported text.
 * Tab, newline, and carriage return are fine (YAML uses them); every other
 * C0 control char (and DEL) is a sign of binary content or an injection
 * attempt and gets refused before we parse or persist anything.
 */
function findControlCharIssue(text: string): string | null {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    // Allow tab (0x09), LF (0x0a), CR (0x0d). Refuse every other C0 control
    // char and DEL (0x7f).
    const isAllowed = code === 0x09 || code === 0x0a || code === 0x0d;
    if ((code <= 0x1f && !isAllowed) || code === 0x7f) {
      const hex = code.toString(16).padStart(2, "0");
      return code === 0
        ? "contains a NUL byte"
        : `contains a disallowed control character (0x${hex})`;
    }
  }
  return null;
}

/** Scan flow text for high-precision vendor secret shapes. A shared flow that
 *  smuggles a live API key must be refused, not silently written to disk. */
function findSecretIssues(text: string): string[] {
  return scanTextForSecrets(text).map(
    (m) =>
      `looks like a secret (${m.pattern}) on line ${m.line + 1}: ${m.redactedSnippet}`,
  );
}

/** Parse + schema-validate + secret/control-char guard a raw YAML string. */
export function validateFlowText(text: string): ValidateResult {
  if (text.length > FLOW_IMPORT_MAX_BYTES) {
    return {
      ok: false,
      status: 413,
      reasons: [
        `Flow YAML is ${text.length} bytes; the import limit is ${FLOW_IMPORT_MAX_BYTES}.`,
      ],
    };
  }
  const ctrl = findControlCharIssue(text);
  if (ctrl) {
    return { ok: false, status: 400, reasons: [`Flow source ${ctrl}.`] };
  }
  const secrets = findSecretIssues(text);
  if (secrets.length > 0) {
    return { ok: false, status: 400, reasons: secrets };
  }

  let raw: unknown;
  try {
    raw = YAML.parse(text);
  } catch (err) {
    return {
      ok: false,
      status: 400,
      reasons: [`Failed to parse Flow YAML: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
  return validateFlowObject(raw);
}

/** Schema-validate an already-parsed definition object (the create API path).
 *  Also secret-scans the canonical YAML we'd persist, so a structured POST
 *  can't bypass the guard a raw-text import is held to. */
export function validateFlowObject(raw: unknown): ValidateResult {
  const parsed = flowDefinitionSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      reasons: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
      ),
    };
  }
  const secrets = findSecretIssues(YAML.stringify(parsed.data));
  if (secrets.length > 0) {
    return { ok: false, status: 400, reasons: secrets };
  }
  return { ok: true, definition: parsed.data };
}

// ─── guarded writer ──────────────────────────────────────────────────────

/**
 * The single choke point every write path goes through. Path-guards the
 * target inside `.vibestrate/flows/`, enforces the overwrite policy (an
 * existing *project* flow is only replaced with `overwrite: true`; shadowing a
 * builtin is always allowed, like `fork`), and writes the YAML atomically
 * (tmpfile + rename, 0600).
 */
export async function writeProjectFlowDefinition(input: {
  projectRoot: string;
  definition: FlowDefinition;
  overwrite?: boolean;
}): Promise<FlowWriteResult> {
  const { projectRoot, definition } = input;
  const flowId = definition.id;
  const rootDir = projectFlowsDir(projectRoot);
  const dirPath = path.join(rootDir, flowId);
  const filePath = path.join(dirPath, "flow.yml");
  if (!isPathInside(rootDir, filePath)) {
    return {
      ok: false,
      status: 400,
      reasons: [`Flow id "${flowId}" produced an unsafe target path.`],
    };
  }

  const existed = await pathExists(filePath);
  if (existed && input.overwrite !== true) {
    return {
      ok: false,
      status: 409,
      reasons: [
        `Project flow "${flowId}" already exists. Pass overwrite to replace it (or delete it first).`,
      ],
    };
  }

  await fs.mkdir(dirPath, { recursive: true });
  const yaml = YAML.stringify(definition);
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, yaml, { encoding: "utf8", mode: 0o600 });
  try {
    await fs.rename(tmp, filePath);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  }
  return {
    ok: true,
    flowId,
    definitionPath: path.relative(projectRoot, filePath),
    overwritten: existed,
  };
}

// ─── import / create ───────────────────────────────────────────────────────

export async function importFlowFromText(input: {
  projectRoot: string;
  text: string;
  overwrite?: boolean;
}): Promise<FlowWriteResult> {
  const validated = validateFlowText(input.text);
  if (!validated.ok) return validated;
  return writeProjectFlowDefinition({
    projectRoot: input.projectRoot,
    definition: validated.definition,
    overwrite: input.overwrite,
  });
}

/** Create a project flow from an already-parsed definition (the flow-creator
 *  API). Object in, validated + guarded + written. */
export async function createProjectFlow(input: {
  projectRoot: string;
  definition: unknown;
  overwrite?: boolean;
}): Promise<FlowWriteResult> {
  const validated = validateFlowObject(input.definition);
  if (!validated.ok) return validated;
  return writeProjectFlowDefinition({
    projectRoot: input.projectRoot,
    definition: validated.definition,
    overwrite: input.overwrite,
  });
}

export async function importFlowFromFile(input: {
  projectRoot: string;
  filePath: string;
  overwrite?: boolean;
}): Promise<FlowWriteResult> {
  let text: string;
  try {
    const stat = await fs.stat(input.filePath);
    if (stat.size > FLOW_IMPORT_MAX_BYTES) {
      return {
        ok: false,
        status: 413,
        reasons: [
          `File is ${stat.size} bytes; the import limit is ${FLOW_IMPORT_MAX_BYTES}.`,
        ],
      };
    }
    text = await readText(input.filePath);
  } catch (err) {
    return {
      ok: false,
      status: 400,
      reasons: [`Could not read ${input.filePath}: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
  return importFlowFromText({
    projectRoot: input.projectRoot,
    text,
    overwrite: input.overwrite,
  });
}

// ─── URL fetch (SSRF-guarded) ────────────────────────────────────────────────

/** True for IP literals that must never be the target of a server-side fetch:
 *  loopback, private, link-local, and unspecified ranges. Best-effort SSRF
 *  guard — the user-initiated CLI path trusts the user, but the HTTP API must
 *  not be turned into a probe for internal services. */
export function isBlockedIp(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) {
    const parts = ip.split(".").map((n) => parseInt(n, 10));
    const [a, b] = parts;
    if (a === undefined || b === undefined) return true;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10/8
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
    if (a === 192 && b === 168) return true; // 192.168/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    if (lower.startsWith("fe80")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA fc00::/7
    // IPv4-mapped (::ffff:a.b.c.d) → recheck the embedded v4.
    const mapped = /::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(lower);
    if (mapped) return isBlockedIp(mapped[1]!);
    return false;
  }
  // Not an IP literal → caller resolves via DNS first.
  return true;
}

export type FetchImpl = (url: string, init: { signal: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

/**
 * Fetch a flow YAML over the network and import it. `https:` (and `http:`)
 * only; the resolved host must not be a private/loopback address. Bounded by
 * size and time. `fetchImpl` is injectable for tests; production uses global
 * `fetch`.
 */
export async function importFlowFromUrl(input: {
  projectRoot: string;
  url: string;
  overwrite?: boolean;
  fetchImpl?: FetchImpl;
  /** Skip the SSRF host check. ONLY the CLI sets this (user typed the URL);
   *  the HTTP API never does. */
  allowPrivateHosts?: boolean;
}): Promise<FlowWriteResult> {
  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    return { ok: false, status: 400, reasons: [`Invalid URL: ${input.url}`] };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return {
      ok: false,
      status: 400,
      reasons: [`Only http(s) URLs can be imported (got ${parsed.protocol}).`],
    };
  }

  if (!input.allowPrivateHosts) {
    const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
    const block = await isBlockedFetchHost(hostname);
    if (block) {
      return {
        ok: false,
        status: 400,
        reasons: [
          `Refusing to fetch from "${hostname}" — it resolves to a private/loopback address (SSRF guard).`,
        ],
      };
    }
  }

  const fetchImpl = input.fetchImpl ?? (globalThis.fetch as unknown as FetchImpl);
  if (!fetchImpl) {
    return { ok: false, status: 500, reasons: ["No fetch implementation available."] };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FLOW_IMPORT_FETCH_TIMEOUT_MS);
  let text: string;
  try {
    const res = await fetchImpl(parsed.toString(), { signal: controller.signal });
    if (!res.ok) {
      return {
        ok: false,
        status: 400,
        reasons: [`Fetch failed with HTTP ${res.status} for ${parsed.toString()}.`],
      };
    }
    const len = res.headers.get("content-length");
    if (len && Number(len) > FLOW_IMPORT_MAX_BYTES) {
      return {
        ok: false,
        status: 413,
        reasons: [
          `Remote flow is ${len} bytes; the import limit is ${FLOW_IMPORT_MAX_BYTES}.`,
        ],
      };
    }
    text = await res.text();
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      status: 400,
      reasons: [
        aborted
          ? `Fetch timed out after ${FLOW_IMPORT_FETCH_TIMEOUT_MS}ms.`
          : `Fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  } finally {
    clearTimeout(timer);
  }

  return importFlowFromText({
    projectRoot: input.projectRoot,
    text,
    overwrite: input.overwrite,
  });
}

/** Resolve a hostname and return true if it (or any literal it already is)
 *  points at a blocked address range. Fail-closed: a resolution error blocks. */
async function isBlockedFetchHost(hostname: string): Promise<boolean> {
  if (net.isIP(hostname)) return isBlockedIp(hostname);
  // Reject obvious internal names outright.
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost") || lower.endsWith(".internal")) {
    return true;
  }
  try {
    const addrs = await dns.lookup(hostname, { all: true });
    if (addrs.length === 0) return true;
    return addrs.some((a) => isBlockedIp(a.address));
  } catch {
    return true; // can't resolve → don't fetch
  }
}

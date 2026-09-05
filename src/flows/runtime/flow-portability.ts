// Single-flow import / export / create for the Flows hub. A Flow is portable
// *because* it names Seats, not local Role / Provider ids, so a YAML fetched
// from a URL or another project drops straight into `.vibestrate/flows/` and
// resolves against whatever Crew the importing project already has.
//
// Import, URL fetch, and the create API share one validating writer
// (`writeProjectFlowDefinition`): same path guard, secret scan, control-char
// guard, overwrite policy. The flow id is schema-constrained to
// `[a-z][a-z0-9-]*` (flowTokenSchema), which is what keeps the `<id>/flow.yml`
// target path inside the flows dir.
//
// Under that sit `writeFlowYamlAudited` and `deleteFlowFileAudited` - the only
// two points where a flow.yml is created or destroyed. Every flow writer in the
// repo (here, plus fork, builder patch, and delete in flow-patch.ts) goes
// through one of them, so the Action Broker sees a `file.write` for each and a
// project policy that denies file writes stops flow authoring the same way it
// stops every other write. Anything that touched a flow.yml with its own fs
// call would be outside the audit trail, so there is deliberately no third path.

import path from "node:path";
import fs from "node:fs/promises";
import dns from "node:dns/promises";
import net from "node:net";
import YAML from "yaml";
import { isPathInside, projectFlowsDir } from "../../utils/paths.js";
import { pathExists, readText } from "../../utils/fs.js";
import { findControlCharIssue } from "../../utils/text-guards.js";
import { scanTextForSecrets } from "../../core/diff-service.js";
import {
  createActionBroker,
  gateAction,
  type ActionRequest,
} from "../../safety/action-broker.js";
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

/**
 * Every string inside a parsed definition, keys included.
 *
 * Control-char screening has to walk these rather than the serialized form:
 * `YAML.stringify` turns a real ESC into the two characters `\e`, so scanning
 * the canonical YAML reports clean on the exact bytes the CLI printers later
 * echo raw to a terminal. It also closes the same hole on the text path, where
 * a `\e` escape in the source survives the pre-parse scan and decodes into a
 * live control character.
 */
function* stringsIn(value: unknown): Generator<string> {
  if (typeof value === "string") {
    yield value;
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) yield* stringsIn(item);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      yield key;
      yield* stringsIn(item);
    }
  }
}

/** Schema-validate an already-parsed definition object (the create API path).
 *  Runs the same control-char and secret guards a raw-text import is held to,
 *  so a structured POST - including a model-authored draft accepted straight
 *  from `runAssist` - can't bypass them. Labels and descriptions are
 *  unconstrained strings that the CLI printers echo verbatim. */
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
  for (const text of stringsIn(parsed.data)) {
    const ctrl = findControlCharIssue(text);
    if (ctrl) {
      return { ok: false, status: 400, reasons: [`Flow definition ${ctrl}.`] };
    }
  }
  const secrets = findSecretIssues(YAML.stringify(parsed.data));
  if (secrets.length > 0) {
    return { ok: false, status: 400, reasons: secrets };
  }
  return { ok: true, definition: parsed.data };
}

// ─── audited writer ──────────────────────────────────────────────────────

/** Audit bucket for flow authoring. Editing a flow happens outside any run, so
 *  its evidence lands in `runs/flows/actions.ndjson` next to the other run-less
 *  effect sites (`manual`, `git-tree`, `supervisor`). */
const FLOW_AUDIT_RUN = "flows";

/** Why a flow file is being written, recorded on the broker request so an audit
 *  reader can tell an import from a fork from a builder edit. `flow-delete`
 *  rides the same `file.write` kind: removing the YAML is the same authority
 *  over the same path, and a policy that denies flow writes has to stop it. */
export type FlowWritePurpose =
  | "flow-import"
  | "flow-create"
  | "flow-fork"
  | "flow-patch"
  | "flow-delete";

/** The broker request every flow-file effect is gated and recorded under.
 *  One builder, so a new effect site cannot describe itself differently. */
function flowFileRequest(input: {
  flowId: string;
  targetPath: string;
  purpose: FlowWritePurpose;
}): ActionRequest {
  return {
    runId: FLOW_AUDIT_RUN,
    kind: "file.write",
    subject: {
      path: input.targetPath,
      flowId: input.flowId,
      purpose: input.purpose,
    },
    // "system": flow writes arrive from the CLI, the HTTP API, and the TUI
    // alike, and this seam cannot tell them apart - so it does not claim to.
    proposedBy: "system",
  };
}

/**
 * The one place flow YAML reaches disk: Action Broker gate (`file.write`),
 * atomic tmpfile + rename at 0600, then a record of the outcome.
 *
 * The broker is constructed here rather than accepted as a parameter, on
 * purpose: an optional broker argument is a write that silently escapes the
 * audit trail the moment a caller forgets it. With no parameter there is
 * nothing to forget, and no flow write can exist without a decision and an
 * evidence record.
 *
 * A non-allow verdict is returned as a 403 refusal rather than thrown because
 * every flow write path already reports failure as {ok, status, reasons}. The
 * caller owns validation and the path guard; this owns the gate and the bytes.
 */
export async function writeFlowYamlAudited(input: {
  projectRoot: string;
  flowId: string;
  /** Already path-guarded absolute target (`<flows dir>/<id>/flow.yml`). */
  targetPath: string;
  yaml: string;
  purpose: FlowWritePurpose;
}): Promise<{ ok: true } | FlowPortabilityError> {
  const broker = createActionBroker(input.projectRoot, FLOW_AUDIT_RUN);
  const request = flowFileRequest(input);
  const gate = await gateAction(broker, request);
  if (!gate.allowed) {
    return {
      ok: false,
      status: 403,
      reasons: [
        `Action broker refused the flow write for "${input.flowId}": ${gate.reason}`,
      ],
    };
  }

  // An allowed action that then fails is still a terminal state the audit
  // trail owes an entry for; without this the log shows a decision and no
  // outcome, which reads as a write that landed.
  try {
    await fs.mkdir(path.dirname(input.targetPath), { recursive: true });
    const tmp = `${input.targetPath}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tmp, input.yaml, { encoding: "utf8", mode: 0o600 });
    try {
      await fs.rename(tmp, input.targetPath);
    } catch (err) {
      await fs.rm(tmp, { force: true }).catch(() => undefined);
      throw err;
    }
  } catch (err) {
    await broker.record(request, gate.decision, {
      ok: false,
      summary: `flow "${input.flowId}" (${input.purpose}) failed to write: ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
    throw err;
  }
  await broker.record(request, gate.decision, {
    ok: true,
    summary: `wrote flow "${input.flowId}" (${input.purpose})`,
  });
  return { ok: true };
}

/**
 * The delete counterpart of {@link writeFlowYamlAudited}: same gate, same audit
 * bucket, same refusal shape. Removing a flow is as consequential as writing
 * one, and an ungated `fs.rm` would let a project policy that denies flow
 * writes still lose every project flow with no record of the loss.
 *
 * The empty parent directory goes with the file: `<flows dir>/<id>/` exists
 * only to hold it, and leaving the husk behind makes the flow look present to
 * anything listing the directory.
 */
export async function deleteFlowFileAudited(input: {
  projectRoot: string;
  flowId: string;
  /** Already path-guarded absolute target (`<flows dir>/<id>/flow.yml`). */
  targetPath: string;
}): Promise<{ ok: true } | FlowPortabilityError> {
  const broker = createActionBroker(input.projectRoot, FLOW_AUDIT_RUN);
  const request = flowFileRequest({ ...input, purpose: "flow-delete" });
  const gate = await gateAction(broker, request);
  if (!gate.allowed) {
    return {
      ok: false,
      status: 403,
      reasons: [
        `Action broker refused the flow delete for "${input.flowId}": ${gate.reason}`,
      ],
    };
  }

  try {
    await fs.rm(input.targetPath, { force: true });
  } catch (err) {
    await broker.record(request, gate.decision, {
      ok: false,
      summary: `flow "${input.flowId}" (flow-delete) failed to delete: ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
    throw err;
  }
  const parent = path.dirname(input.targetPath);
  try {
    const remaining = await fs.readdir(parent);
    if (remaining.length === 0) await fs.rmdir(parent);
  } catch {
    // A non-empty or already-gone parent is not a failed delete; the file is
    // the artifact, and the record below reports on that.
  }
  await broker.record(request, gate.decision, {
    ok: true,
    summary: `deleted flow "${input.flowId}" (flow-delete)`,
  });
  return { ok: true };
}

// ─── guarded writer ──────────────────────────────────────────────────────

/**
 * The choke point the import / create paths go through. Path-guards the
 * target inside `.vibestrate/flows/`, enforces the overwrite policy (an
 * existing *project* flow is only replaced with `overwrite: true`; shadowing a
 * builtin is always allowed, like `fork`), then hands the bytes to
 * {@link writeFlowYamlAudited} for the broker gate and the atomic write.
 */
export async function writeProjectFlowDefinition(input: {
  projectRoot: string;
  definition: FlowDefinition;
  overwrite?: boolean;
  purpose?: FlowWritePurpose;
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

  const written = await writeFlowYamlAudited({
    projectRoot,
    flowId,
    targetPath: filePath,
    yaml: YAML.stringify(definition),
    purpose: input.purpose ?? "flow-import",
  });
  if (!written.ok) return written;

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
    purpose: "flow-create",
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
 *  guard - the user-initiated CLI path trusts the user, but the HTTP API must
 *  not be turned into a probe for internal services. */
/**
 * The eight 16-bit groups of an IPv6 literal, or null if it is not one.
 *
 * Written out rather than pattern-matched because the blocklist above has to be
 * spelling-independent: `::ffff:127.0.0.1`, `::ffff:7f00:1` and
 * `0:0:0:0:0:ffff:7f00:1` are the same address, and a check that recognises
 * only the first of them is not a check.
 */
function expandIpv6(lower: string): number[] | null {
  let text = lower.split("%")[0] ?? "";
  // A dotted IPv4 tail is the low 32 bits; fold it into two hex groups so the
  // rest of this function only ever deals with one notation.
  const dotted = /^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (dotted) {
    const quad = [dotted[2], dotted[3], dotted[4], dotted[5]].map((q) => Number(q));
    if (quad.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    const hi = ((quad[0]! << 8) | quad[1]!).toString(16);
    const lo = ((quad[2]! << 8) | quad[3]!).toString(16);
    text = `${dotted[1]}${hi}:${lo}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":").filter((x) => x !== "") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":").filter((x) => x !== "") : [];
  let parts: string[];
  if (halves.length === 2) {
    const fill = 8 - head.length - tail.length;
    if (fill < 0) return null;
    parts = [...head, ...new Array<string>(fill).fill("0"), ...tail];
  } else {
    parts = head;
  }
  if (parts.length !== 8) return null;
  const out: number[] = [];
  for (const part of parts) {
    if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
    out.push(parseInt(part, 16));
  }
  return out;
}

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
    // An IPv4 address embedded in a v6 literal is judged as the v4 address it
    // is, in EVERY spelling. This used to match only the dotted tail
    // (`::ffff:169.254.169.254`), so the identical address written in hex
    // (`::ffff:a9fe:a9fe`) walked straight through - and that particular one is
    // the cloud metadata endpoint. Expanding the address first means the check
    // does not depend on how the attacker chose to write it.
    const groups = expandIpv6(lower);
    if (groups) {
      const high = groups.slice(0, 5).every((g) => g === 0);
      const embedded = groups[5] === 0xffff || (groups[5] === 0 && high);
      if (high && embedded) {
        const hi = groups[6]!;
        const lo = groups[7]!;
        // `::` and `::1` are already returned above, so a zero tail here is a
        // reserved form rather than a real v4 host; refuse it either way.
        if (hi === 0 && lo <= 1) return true;
        return isBlockedIp(`${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`);
      }
    }
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
          `Refusing to fetch from "${hostname}" - it resolves to a private/loopback address (SSRF guard).`,
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

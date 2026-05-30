// ── Flows hub (Phase 5) ─────────────────────────────────────────────────────
//
// The "npm-without-a-registry" pattern (design §5 + flows-hub.md): a curated
// `index.json` in a community git repo, served over raw static URLs. There is
// NO Vibestrate backend — browse the index, then install a flow by downloading
// its raw `flow.yml`, schema-validating it, and writing it into `.vibestrate/`
// via the existing import path (secret/shell-guarded). Opt-in; nothing is
// fetched until the user asks.

import { z } from "zod";
import { fetchGuardedText } from "../../core/guarded-fetch.js";
import { importFlowFromUrl, type FlowWriteResult, type FetchImpl } from "../runtime/flow-portability.js";

/** Default community index. A raw base URL; override per call/flag. */
export const DEFAULT_HUB_BASE_URL =
  "https://raw.githubusercontent.com/guyshonshon/vibestrate-flows/main";

export const hubFlowEntrySchema = z
  .object({
    name: z.string().min(1).max(80),
    latest: z.string().min(1).max(40),
    versions: z.array(z.string().min(1).max(40)).default([]),
    label: z.string().max(160).optional(),
    description: z.string().max(600).optional(),
    tags: z.array(z.string().max(40)).max(20).default([]),
    author: z.string().max(120).optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();
export type HubFlowEntry = z.infer<typeof hubFlowEntrySchema>;

export const hubIndexSchema = z.object({
  schemaVersion: z.literal(1),
  flows: z.array(hubFlowEntrySchema).max(2000),
});
export type HubIndex = z.infer<typeof hubIndexSchema>;

export type HubResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

function trimSlash(u: string): string {
  return u.replace(/\/+$/, "");
}

/** Fetch + validate the hub index. Guarded + bounded; never auto-runs. */
export async function fetchHubIndex(input: {
  baseUrl?: string;
  fetchImpl?: FetchImpl;
  allowPrivateHosts?: boolean;
}): Promise<HubResult<HubIndex>> {
  const base = trimSlash(input.baseUrl ?? DEFAULT_HUB_BASE_URL);
  const got = await fetchGuardedText({
    url: `${base}/index.json`,
    fetchImpl: input.fetchImpl,
    allowPrivateHosts: input.allowPrivateHosts,
    maxBytes: 1024 * 1024,
  });
  if (!got.ok) return { ok: false, reason: got.reason };
  let raw: unknown;
  try {
    raw = JSON.parse(got.text);
  } catch {
    return { ok: false, reason: "Hub index is not valid JSON." };
  }
  const parsed = hubIndexSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, reason: `Hub index failed validation: ${parsed.error.issues[0]?.message ?? "unknown"}` };
  }
  return { ok: true, value: parsed.data };
}

export function searchHub(index: HubIndex, query: string): HubFlowEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return index.flows;
  return index.flows.filter(
    (f) =>
      f.name.toLowerCase().includes(q) ||
      (f.label ?? "").toLowerCase().includes(q) ||
      (f.description ?? "").toLowerCase().includes(q) ||
      f.tags.some((t) => t.toLowerCase().includes(q)),
  );
}

/**
 * Install a flow from the hub: resolve its raw `flow.yml` URL from the index
 * and import it through the existing validated, secret-guarded writer.
 */
export async function installFlowFromHub(input: {
  projectRoot: string;
  name: string;
  version?: string;
  baseUrl?: string;
  fetchImpl?: FetchImpl;
  allowPrivateHosts?: boolean;
  overwrite?: boolean;
}): Promise<FlowWriteResult> {
  const base = trimSlash(input.baseUrl ?? DEFAULT_HUB_BASE_URL);
  const indexResult = await fetchHubIndex({
    baseUrl: base,
    fetchImpl: input.fetchImpl,
    allowPrivateHosts: input.allowPrivateHosts,
  });
  if (!indexResult.ok) {
    return { ok: false, status: 400, reasons: [indexResult.reason] };
  }
  const entry = indexResult.value.flows.find((f) => f.name === input.name);
  if (!entry) {
    return { ok: false, status: 404, reasons: [`Flow "${input.name}" is not in the hub index.`] };
  }
  const version = input.version ?? entry.latest;
  if (input.version && !entry.versions.includes(input.version) && entry.latest !== input.version) {
    return {
      ok: false,
      status: 404,
      reasons: [`Version "${input.version}" of "${input.name}" not found (have: ${entry.versions.join(", ") || entry.latest}).`],
    };
  }
  const flowUrl = `${base}/flows/${encodeURIComponent(input.name)}/${encodeURIComponent(version)}/flow.yml`;
  return importFlowFromUrl({
    projectRoot: input.projectRoot,
    url: flowUrl,
    overwrite: input.overwrite,
    fetchImpl: input.fetchImpl,
    allowPrivateHosts: input.allowPrivateHosts,
  });
}

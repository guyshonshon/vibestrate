// ── Vibestrate Flows Hub client (real API) ──────────────────────────────────
//
// Replaces the old static-`index.json` model. The hub is a real service at
// `vibestrate.com/api/hub`:
//   - search  GET  /api/hub/flows?q=&tag=&author=&limit=&offset=  -> { flows }
//   - pull    GET  /api/hub/pull/<ref>   -> { ref, name, content, sha256, ... }
//   - publish POST /api/hub/publish      (separate, auth'd; landed later)
//
// Reads are guarded (https-only, SSRF-blocked, bounded). A pulled flow's
// `content` is sha256-verified before it's written through the existing
// validated, secret-guarded import writer. Opt-in; nothing is fetched until the
// user asks.

import { createHash } from "node:crypto";
import { z } from "zod";
import { fetchGuardedText } from "../../core/guarded-fetch.js";
import {
  importFlowFromText,
  type FlowWriteResult,
  type FetchImpl,
} from "../runtime/flow-portability.js";

/** The hub origin. A bare origin; endpoints are appended. Override per call. */
export const DEFAULT_HUB_BASE_URL = "https://vibestrate.com";

/** A flow row from search. Permissive (the server may add fields); we only
 *  depend on `ref`. `diagnosis` shape is open, surfaced best-effort.
 *  Live-contract notes (verified against vibestrate.com 2026-06-11): nullable
 *  fields arrive as `null` (not absent), the one-liner is `summary` and the
 *  publisher is `publishedBy` - normalized below into `description`/`author`
 *  so the surfaces stay contract-agnostic. */
export const hubFlowSummarySchema = z
  .object({
    ref: z.string().min(1).max(200),
    name: z.string().max(120).nullish(),
    handle: z.string().max(120).nullish(),
    verified: z.boolean().nullish(),
    version: z.string().max(40).nullish(),
    label: z.string().max(200).nullish(),
    description: z.string().max(2000).nullish(),
    summary: z.string().max(2000).nullish(),
    tags: z.array(z.string().max(40)).max(40).nullish(),
    author: z.string().max(120).nullish(),
    publishedBy: z.string().max(120).nullish(),
    installs: z.number().nullish(),
    steps: z.number().nullish(),
    diagnosis: z.unknown().optional(),
  })
  .passthrough();
export type HubFlowSummary = z.infer<typeof hubFlowSummarySchema>;

/** Fill the canonical display fields from their live-contract synonyms. */
function normalizeSummaryRow(row: HubFlowSummary): HubFlowSummary {
  return {
    ...row,
    description: row.description ?? row.summary ?? null,
    author: row.author ?? row.publishedBy ?? null,
  };
}

export const hubSearchResponseSchema = z.object({
  flows: z.array(hubFlowSummarySchema).max(5000),
});

/** A pulled flow: the full record, including the flow YAML `content`. */
export const hubPulledFlowSchema = z
  .object({
    ref: z.string().min(1).max(200),
    name: z.string().max(120).nullish(),
    handle: z.string().max(120).nullish(),
    verified: z.boolean().nullish(),
    version: z.string().max(40).nullish(),
    content: z.string().min(1).max(1024 * 1024),
    phases: z.unknown().optional(),
    sha256: z
      .string()
      .regex(/^[a-fA-F0-9]{64}$/)
      .nullish(),
    sizeBytes: z.number().nullish(),
    diagnosis: z.unknown().optional(),
  })
  .passthrough();
export type HubPulledFlow = z.infer<typeof hubPulledFlowSchema>;

export type HubResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

function trimSlash(u: string): string {
  return u.replace(/\/+$/, "");
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Guarded GET that parses JSON. */
async function getJson(input: {
  url: string;
  fetchImpl?: FetchImpl;
  allowPrivateHosts?: boolean;
  maxBytes?: number;
}): Promise<HubResult<unknown>> {
  const got = await fetchGuardedText({
    url: input.url,
    fetchImpl: input.fetchImpl,
    allowPrivateHosts: input.allowPrivateHosts,
    maxBytes: input.maxBytes ?? 1024 * 1024,
  });
  if (!got.ok) return { ok: false, reason: got.reason };
  try {
    return { ok: true, value: JSON.parse(got.text) };
  } catch {
    return { ok: false, reason: "Hub response was not valid JSON." };
  }
}

/** Search the hub. All filters optional; only provided ones are sent. */
export async function searchHubFlows(input: {
  q?: string;
  tag?: string;
  author?: string;
  limit?: number;
  offset?: number;
  baseUrl?: string;
  fetchImpl?: FetchImpl;
  allowPrivateHosts?: boolean;
}): Promise<HubResult<HubFlowSummary[]>> {
  const base = trimSlash(input.baseUrl ?? DEFAULT_HUB_BASE_URL);
  const qs = new URLSearchParams();
  if (input.q) qs.set("q", input.q);
  if (input.tag) qs.set("tag", input.tag);
  if (input.author) qs.set("author", input.author);
  if (input.limit != null) qs.set("limit", String(input.limit));
  if (input.offset != null) qs.set("offset", String(input.offset));
  const query = qs.toString();
  const url = `${base}/api/hub/flows${query ? `?${query}` : ""}`;
  const got = await getJson({
    url,
    fetchImpl: input.fetchImpl,
    allowPrivateHosts: input.allowPrivateHosts,
  });
  if (!got.ok) return got;
  const parsed = hubSearchResponseSchema.safeParse(got.value);
  if (!parsed.success) {
    return {
      ok: false,
      reason: `Hub search response failed validation: ${parsed.error.issues[0]?.message ?? "unknown"}`,
    };
  }
  return { ok: true, value: parsed.data.flows.map(normalizeSummaryRow) };
}

/** Pull a flow by ref. Verifies sha256(content) when the server provides it.
 *  Honesty note: the sha256 arrives in the same response as the content, so
 *  this is a transport-integrity check only - it is NOT protection against a
 *  compromised hub. Surfaces must not present it as such. */
export async function pullHubFlow(input: {
  ref: string;
  baseUrl?: string;
  fetchImpl?: FetchImpl;
  allowPrivateHosts?: boolean;
}): Promise<HubResult<HubPulledFlow>> {
  const base = trimSlash(input.baseUrl ?? DEFAULT_HUB_BASE_URL);
  const url = `${base}/api/hub/pull/${encodeURIComponent(input.ref)}`;
  const got = await getJson({
    url,
    fetchImpl: input.fetchImpl,
    allowPrivateHosts: input.allowPrivateHosts,
  });
  if (!got.ok) return got;
  const parsed = hubPulledFlowSchema.safeParse(got.value);
  if (!parsed.success) {
    return {
      ok: false,
      reason: `Hub pull response failed validation: ${parsed.error.issues[0]?.message ?? "unknown"}`,
    };
  }
  const flow = parsed.data;
  if (flow.sha256) {
    const actual = sha256Hex(flow.content);
    if (actual.toLowerCase() !== flow.sha256.toLowerCase()) {
      return {
        ok: false,
        reason: `Integrity check failed: sha256 mismatch for "${input.ref}" (got ${actual.slice(0, 12)}..., expected ${flow.sha256.slice(0, 12)}...).`,
      };
    }
  }
  return { ok: true, value: flow };
}

/** Pull a flow by ref and write it into the project (validated + guarded). */
export async function installFlowFromHub(input: {
  projectRoot: string;
  ref: string;
  overwrite?: boolean;
  baseUrl?: string;
  fetchImpl?: FetchImpl;
  allowPrivateHosts?: boolean;
}): Promise<FlowWriteResult> {
  const pulled = await pullHubFlow({
    ref: input.ref,
    baseUrl: input.baseUrl,
    fetchImpl: input.fetchImpl,
    allowPrivateHosts: input.allowPrivateHosts,
  });
  if (!pulled.ok) return { ok: false, status: 502, reasons: [pulled.reason] };
  return importFlowFromText({
    projectRoot: input.projectRoot,
    text: pulled.value.content,
    overwrite: input.overwrite,
  });
}

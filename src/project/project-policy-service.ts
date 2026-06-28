// Project policy capture (docs/design/policy-consolidation.md). Owner-explicit
// add/list/remove + confirm/reject for the PROJECT-scoped rule surface, so the owner
// never hand-edits YAML. Was the persona-scoped preferences-service; rules now live
// at top-level `projectPolicies`, not on a persona.
//
// The friction-killer: an owner add is CONFIRMED ON CREATION (the owner authored it
// via their own command, so it is trusted - no separate confirm step). The
// `confirmedAt`/`supervisor-proposed` machinery is exercised by the consult propose
// path (proposePolicy), which writes a PENDING entry the owner confirms.
//
// THE LOAD-BEARING SECURITY INVARIANT: a block tier is OWNER-ONLY. `addOwnerPolicy`
// accepts `tier`/`matcher`; `proposePolicy` (the model-fed path) hard-sets
// `tier:"advise"`, `matcher:null`, `confirmedAt:null` regardless of input, so a model
// can never author a hard merge-cap or a pre-confirmed rule.
//
// Writes go through the config service (readDocument/writeDocument), which preserves
// YAML comments and validates the WHOLE config against the schema before persisting
// (fail-closed). Narrow write surface: only the `projectPolicies` array is touched.
import { readDocument, writeDocument } from "../setup/config-update-service.js";
import {
  projectPolicySchema,
  type ProjectPolicy,
} from "./config-schema.js";
import { loadConfig } from "./config-loader.js";
import { ConfigError } from "../utils/errors.js";

export type AddOwnerPolicyInput = {
  id: string;
  statement: string;
  correction?: string | null;
  scopeLenses?: string[];
  /** `block` makes this a deterministic hard merge-cap (owner-only). */
  tier?: "advise" | "block";
  /** Regex for a block policy (validated by projectPolicySchema's refine). */
  matcher?: string | null;
};

/** Read the project's policies. */
export async function listPolicies(projectRoot: string): Promise<ProjectPolicy[]> {
  const { config } = await loadConfig(projectRoot);
  return config.projectPolicies ?? [];
}

/**
 * Add an owner policy. Confirmed on creation (live immediately). tier/matcher are
 * owner-only (proposePolicy never sets them); the schema refine rejects a block
 * without a valid matcher (and a lens-scoped block), so a bad `--block` fails fast.
 */
export async function addOwnerPolicy(
  projectRoot: string,
  input: AddOwnerPolicyInput,
  now: string,
): Promise<ProjectPolicy> {
  const policy = projectPolicySchema.parse({
    id: input.id,
    statement: input.statement,
    correction: input.correction ?? null,
    scope: { lenses: input.scopeLenses ?? [] },
    source: "owner",
    confirmedAt: now,
    tier: input.tier ?? "advise",
    matcher: input.matcher ?? null,
  });
  return appendPolicy(projectRoot, policy);
}

export type ProposePolicyInput = {
  id: string;
  statement: string;
  correction?: string | null;
};

/**
 * Supervisor-proposed policy: written PENDING (source:supervisor-proposed,
 * confirmedAt:null), so it is inert until the owner confirms it. The proposer is a
 * model (the consult deciding to propose), so it is HARD-CONSTRAINED to the advise
 * tier with no matcher - a model can never author a hard merge-cap.
 */
export async function proposePolicy(
  projectRoot: string,
  input: ProposePolicyInput,
): Promise<ProjectPolicy> {
  const policy = projectPolicySchema.parse({
    id: input.id,
    statement: input.statement,
    correction: input.correction ?? null,
    scope: { lenses: [] },
    source: "supervisor-proposed",
    confirmedAt: null,
    // Owner-only fields are forced here regardless of any caller intent.
    tier: "advise",
    matcher: null,
  });
  return appendPolicy(projectRoot, policy);
}

/** Shared: reject a duplicate id, append the policy, validate + persist. */
async function appendPolicy(
  projectRoot: string,
  policy: ProjectPolicy,
): Promise<ProjectPolicy> {
  const { doc } = await readDocument(projectRoot);
  const js = doc.toJS() as { projectPolicies?: ProjectPolicy[] };
  const existing = js.projectPolicies ?? [];
  if (existing.some((p) => p.id === policy.id)) {
    throw new ConfigError(`Policy "${policy.id}" already exists.`);
  }
  doc.setIn(["projectPolicies"], [...existing, policy]);
  await writeDocument(projectRoot, doc);
  return policy;
}

/** Owner confirms a pending policy (sets confirmedAt -> it goes live).
 *  Idempotent on an already-confirmed entry; false if the id is unknown. */
export async function confirmPolicy(
  projectRoot: string,
  policyId: string,
  now: string,
): Promise<{ confirmed: boolean }> {
  const { doc } = await readDocument(projectRoot);
  const js = doc.toJS() as { projectPolicies?: ProjectPolicy[] };
  const policies = js.projectPolicies;
  const target = policies?.find((p) => p.id === policyId);
  if (!policies || !target) return { confirmed: false };
  if (target.confirmedAt != null) return { confirmed: true }; // already live, no-op
  const updated = policies.map((p) =>
    p.id === policyId ? { ...p, confirmedAt: now } : p,
  );
  doc.setIn(["projectPolicies"], updated);
  await writeDocument(projectRoot, doc);
  return { confirmed: true };
}

/** Owner rejects a PENDING proposal (removes it). Never removes an active policy -
 *  use removePolicy for that. */
export async function rejectPolicy(
  projectRoot: string,
  policyId: string,
): Promise<{ rejected: boolean }> {
  const { doc } = await readDocument(projectRoot);
  const js = doc.toJS() as { projectPolicies?: ProjectPolicy[] };
  const policies = js.projectPolicies;
  const target = policies?.find((p) => p.id === policyId);
  if (!policies || !target || target.confirmedAt != null) return { rejected: false };
  doc.setIn(["projectPolicies"], policies.filter((p) => p.id !== policyId));
  await writeDocument(projectRoot, doc);
  return { rejected: true };
}

/** Remove a policy by id. Reports whether anything was removed. */
export async function removePolicy(
  projectRoot: string,
  policyId: string,
): Promise<{ removed: boolean }> {
  const { doc } = await readDocument(projectRoot);
  const js = doc.toJS() as { projectPolicies?: ProjectPolicy[] };
  const existing = js.projectPolicies;
  if (!existing || existing.length === 0) return { removed: false };
  const filtered = existing.filter((p) => p.id !== policyId);
  if (filtered.length === existing.length) return { removed: false };
  doc.setIn(["projectPolicies"], filtered);
  await writeDocument(projectRoot, doc);
  return { removed: true };
}

/**
 * Migration (docs/design/policy-consolidation.md): lift any persona-scoped
 * `personas.<id>.preferences` into top-level `projectPolicies`, preserving
 * confirmedAt, and delete the persona field. Returns the count moved. Idempotent
 * (no persona preferences -> 0). Maps the legacy `severity`->`tier`,
 * `pattern`->`matcher`. On an id collision across personas, the later one is
 * suffixed with the persona id to stay unique.
 */
export async function migratePersonaPreferences(
  projectRoot: string,
): Promise<{ moved: number }> {
  const { doc } = await readDocument(projectRoot);
  const js = doc.toJS() as {
    personas?: Record<string, { preferences?: unknown[] }>;
    projectPolicies?: ProjectPolicy[];
  };
  const personas = js.personas ?? {};
  const out: ProjectPolicy[] = [...(js.projectPolicies ?? [])];
  const seen = new Set(out.map((p) => p.id));
  let moved = 0;
  for (const [personaId, persona] of Object.entries(personas)) {
    if (!persona || !("preferences" in persona)) continue;
    const prefs = persona.preferences;
    if (Array.isArray(prefs)) {
      for (const raw of prefs) {
        const legacy = raw as Record<string, unknown>;
        const baseId = String(legacy.id ?? "");
        if (!baseId) continue;
        // Unique id within the 60-char cap: on collision suffix with the persona
        // (then a counter), always re-checking and re-clamping so migrate never
        // writes a duplicate id and never throws on an over-long renamed id (the
        // wedge it exists to prevent).
        let id = baseId.slice(0, 60);
        let n = 1;
        while (seen.has(id)) {
          const suffix = n === 1 ? `-${personaId}` : `-${personaId}-${n}`;
          id = `${baseId.slice(0, Math.max(1, 60 - suffix.length))}${suffix}`.slice(0, 60);
          n++;
        }
        const policy = projectPolicySchema.parse({
          id,
          statement: legacy.statement,
          correction: legacy.correction ?? null,
          scope: legacy.tier === "block" || legacy.severity === "block"
            ? { lenses: [] }
            : (legacy.scope as object) ?? { lenses: [] },
          source: legacy.source ?? "owner",
          confirmedAt: legacy.confirmedAt ?? null,
          tier: legacy.tier ?? legacy.severity ?? "advise",
          matcher: legacy.matcher ?? legacy.pattern ?? null,
        });
        out.push(policy);
        seen.add(id);
        moved++;
      }
    }
    // Drop the persona's now-removed preferences key (even when empty, so the
    // strict whole-config validation in writeDocument passes).
    doc.deleteIn(["personas", personaId, "preferences"]);
  }
  if (out.length > 0) doc.setIn(["projectPolicies"], out);
  await writeDocument(projectRoot, doc);
  return { moved };
}

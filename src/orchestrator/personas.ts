// Supervisor personas (orchestrator-personas.md). A persona is the orchestrator's
// ADVISORY judgment posture. This module: (1) resolves the active persona
// (config default + per-run override, always falling back to a built-in so a run
// never fails on a persona), (2) a PURE deterministic task-risk classifier (the
// mechanism; the policy - which signals - is data on the persona), and (3) the
// one behavioral lever this slice: an UPGRADE-only flow bias (a risk-tagged task
// is pushed toward the persona's preferred review flow; it can only add review,
// never remove it, and never overrides an explicit --flow).
import type { PersonaConfig, PersonaPreference, ProjectConfig } from "../project/config-schema.js";

// The shipped default persona, resolved in code so a project with no `personas:`
// block still gets a supervisor. Its `instructions` are descriptive this slice
// (shown in the UI); the behavioral teeth is `riskSignals` + `prefersFlows`.
export const BUILTIN_PERSONAS: Record<string, PersonaConfig> = {
  "staff-engineer": {
    label: "Staff engineer",
    description:
      "Correctness, risk, and blast-radius first. Skeptical staff-engineer judgment; escalates to heavier review when a task touches risky ground. The default supervisor.",
    instructions: undefined,
    // Conservative, deliberately upgrade-only: a false match costs extra review,
    // never less. Projects can override per persona.
    riskSignals: [
      "auth",
      "login",
      "password",
      "secret",
      "token",
      "credential",
      "payment",
      "billing",
      "charge",
      "migration",
      "schema change",
      "database",
      "permission",
      "authorization",
      "production",
      "concurrency",
      "race condition",
    ],
    prefersFlows: ["panel-review"],
    reviewerProfile: null,
    reviewLenses: ["correctness", "tests", "security-risk"],
    // The default persona stays posture-neutral: a plain `vibe run` is unchanged.
    prefersPosture: null,
    // null = the spec-up flows' own CTO-director step instructions stand alone
    // (default spec-up behavior unchanged).
    specUpPosture: null,
    // No built-in preferences: a project teaches its own (preference-gates.ts).
    preferences: [],
  },
  // A security-minded supervisor: it prefers the `security-review` panel (authz /
  // secrets / injection lenses) instead of the generalist panel, so the SAME
  // risk-tagged task routes to a different review under this persona. Its risk
  // signals are deliberately broad (most code can have a security dimension), but
  // still upgrade-only - a false match only adds review.
  security: {
    label: "Security",
    description:
      "Authorization, secrets, and injection first. Upgrades risky work to a security-lensed review panel.",
    instructions: undefined,
    riskSignals: [
      "auth",
      "login",
      "password",
      "secret",
      "token",
      "credential",
      "session",
      "cookie",
      "permission",
      "authorization",
      "sql",
      "query",
      "injection",
      "input",
      "upload",
      "deserialize",
      "xss",
      "csrf",
      "cors",
      "crypto",
      "encrypt",
      "api key",
      "exec",
      "shell",
    ],
    prefersFlows: ["security-review"],
    reviewerProfile: null,
    reviewLenses: ["authz", "secrets", "injection"],
    // Security work favors a sandboxed posture for risk-tagged tasks (advisory).
    prefersPosture: "sandbox-suggested",
    // Aims the spec-up planning agents at the security dimension of the work.
    specUpPosture:
      "You are the CTO shaping this work with a security lens. As you scope, spec, and architect: prioritise authorization boundaries, secret handling, input validation, and the attack surface of every proposed component. Surface the threat-model questions a vague brief leaves open (who can call this? what's untrusted? where do secrets live?), and prefer designs that minimise blast radius and untrusted-input exposure.",
    preferences: [],
  },
};

export type ResolvedPersona = { id: string; config: PersonaConfig };

/**
 * Resolve the active persona: a per-run override wins, else the project's
 * `defaultPersona`, else the shipped built-in. An unknown id never throws - it
 * falls back to the built-in default (a persona is advisory; it must not be able
 * to fail a run).
 */
export function resolvePersona(
  config: ProjectConfig,
  override?: string | null,
): ResolvedPersona {
  const id = (override && override.trim()) || config.defaultPersona || "staff-engineer";
  const fromConfig = config.personas?.[id];
  if (fromConfig) return { id, config: fromConfig };
  const builtin = BUILTIN_PERSONAS[id];
  if (builtin) return { id, config: builtin };
  return { id: "staff-engineer", config: BUILTIN_PERSONAS["staff-engineer"]! };
}

/** List persona ids known to a config (built-ins + project entries), deduped. */
export function listPersonaIds(config: ProjectConfig): string[] {
  return [
    ...new Set([...Object.keys(BUILTIN_PERSONAS), ...Object.keys(config.personas ?? {})]),
  ];
}

/** A read-only catalog row for the `vibe supervisor list` CLI and the dashboard
 *  Supervisors viewer - the same shape so the two surfaces can't drift. */
export type PersonaCatalogEntry = {
  id: string;
  label: string;
  description?: string;
  reviewLenses: string[];
  prefersFlows: string[];
  reviewerProfile: string | null;
  prefersPosture: string | null;
  /** The free-text spec-up CTO posture, or null. Shown verbatim in the viewer. */
  specUpPosture: string | null;
  /** Owner preferences the reviewer checks for (preference-gates.ts). */
  preferences: PersonaPreference[];
  builtin: boolean;
};

export type PersonaCatalog = {
  defaultPersona: string;
  personas: PersonaCatalogEntry[];
};

/**
 * Build the resolved persona catalog (built-ins + project personas, project
 * overriding a built-in of the same id), with the active default marked by id.
 * Pure: pass the loaded config, or null when there's no project. Shared by the
 * CLI (`vibe supervisor list`) and `GET /api/supervisors` so they stay in sync.
 */
export function buildPersonaCatalog(config: ProjectConfig | null): PersonaCatalog {
  const merged: Record<string, PersonaCatalogEntry> = {};
  const add = (id: string, p: PersonaConfig, builtin: boolean) => {
    merged[id] = {
      id,
      label: p.label,
      description: p.description,
      reviewLenses: p.reviewLenses,
      prefersFlows: p.prefersFlows,
      reviewerProfile: p.reviewerProfile ?? null,
      prefersPosture: p.prefersPosture,
      specUpPosture: p.specUpPosture,
      preferences: p.preferences,
      builtin,
    };
  };
  for (const [id, p] of Object.entries(BUILTIN_PERSONAS)) add(id, p, true);
  let defaultPersona = "staff-engineer";
  if (config) {
    defaultPersona = config.defaultPersona;
    for (const [id, p] of Object.entries(config.personas ?? {})) add(id, p, false);
  }
  return { defaultPersona, personas: Object.values(merged) };
}

/**
 * PURE deterministic risk classifier: which of `signals` appear (case-insensitive
 * substring) in the task text. The signals are persona data, not core policy.
 * Returns the matched signals (empty = not risk-tagged).
 */
export function classifyTaskRisk(task: string, signals: readonly string[]): string[] {
  const t = (task ?? "").toLowerCase();
  const matched: string[] = [];
  for (const raw of signals) {
    const sig = raw.toLowerCase().trim();
    if (sig && t.includes(sig) && !matched.includes(raw)) matched.push(raw);
  }
  return matched;
}

// Supervisor personas (orchestrator-personas.md). A persona is the orchestrator's
// ADVISORY judgment posture. This module: (1) resolves the active persona
// (config default + per-run override, always falling back to a built-in so a run
// never fails on a persona), (2) a PURE deterministic task-risk classifier (the
// mechanism; the policy - which signals - is data on the persona), and (3) the
// one behavioral lever this slice: an UPGRADE-only flow bias (a risk-tagged task
// is pushed toward the persona's preferred review flow; it can only add review,
// never remove it, and never overrides an explicit --flow).
import type { PersonaConfig, ProjectConfig } from "../project/config-schema.js";

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

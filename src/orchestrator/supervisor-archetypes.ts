// Curated supervisor archetypes (orchestrator-personas.md). A gallery of
// ready-to-adopt supervisor personas the dashboard/CLI can write into a project's
// `personas:` block. SERVER-OWNED: the client picks by id and never sends a
// persona object, so an archetype's judgment posture can't be tampered with over
// HTTP/CLI. Adopting one is `setConfigValue(personas.<id>, <this object>)` - the
// same schema-validated config write `vibe config set` uses.
//
// Every archetype is validated against `personaConfigSchema` at module load (and
// each reviewLens against the CLOSED `reviewLensSchema`), so a typo throws at
// import instead of shipping a broken definition.
import {
  personaConfigSchema,
  type PersonaConfig,
} from "../project/config-schema.js";
import { reviewLensSchema } from "./review-lenses.js";

/**
 * The adoptable archetype set. Keys are the persona ids written into project.yml
 * (they must satisfy the persona-name rule: letters/digits/dash/underscore, not a
 * reserved name - validated transitively when adopted, and by the module-load
 * check below). reviewLenses use ONLY the closed vocabulary.
 */
export const SUPERVISOR_ARCHETYPES: Record<string, PersonaConfig> = {
  "security-hawk": {
    label: "Security Hawk",
    description:
      "Authorization, secrets, and injection first - upgrades risky work to a security-lensed panel and a sandboxed posture.",
    instructions: undefined,
    riskSignals: [
      "auth",
      "secret",
      "token",
      "injection",
      "upload",
      "crypto",
      "permission",
    ],
    prefersFlows: ["security-review"],
    reviewerProfile: null,
    reviewLenses: ["authz", "secrets", "injection", "security-risk"],
    prefersPosture: "sandbox-suggested",
    specUpPosture:
      "You are the CTO shaping this work with a security lens. Prioritise authorization boundaries, secret handling, and input validation; surface the threat-model questions a vague brief leaves open (who can call this? what's untrusted? where do secrets live?) and prefer designs that minimise blast radius.",
  },
  "performance-skeptic": {
    label: "Performance Skeptic",
    description: "Hot paths, allocations, and query cost first.",
    instructions: undefined,
    riskSignals: [
      "loop",
      "query",
      "n+1",
      "hot path",
      "cache",
      "latency",
      "throughput",
      "index",
    ],
    prefersFlows: ["panel-review"],
    reviewerProfile: null,
    reviewLenses: ["performance", "correctness", "tests"],
    prefersPosture: null,
    specUpPosture: null,
  },
  "correctness-purist": {
    label: "Correctness Purist",
    description: "Every change earns a thorough correctness + test review.",
    instructions: undefined,
    riskSignals: [],
    prefersFlows: ["panel-review"],
    reviewerProfile: null,
    reviewLenses: ["correctness", "tests", "security-risk"],
    prefersPosture: null,
    specUpPosture: null,
  },
  "frontend-reviewer": {
    label: "Frontend Reviewer",
    description:
      "UX, accessibility, and visual consistency alongside correctness.",
    instructions: undefined,
    riskSignals: [],
    prefersFlows: ["panel-review"],
    reviewerProfile: null,
    reviewLenses: ["ux-ia", "accessibility", "visual-consistency", "correctness"],
    prefersPosture: null,
    specUpPosture:
      "You are the CTO shaping this work with a UX lens. Prioritise information architecture, keyboard/accessibility reachability, and visual consistency with the existing design system; surface the user-flow questions a vague brief leaves open and prefer designs that fit the established patterns rather than bolting on new ones.",
  },
  "data-migration-guardian": {
    label: "Data & Migration Guardian",
    description:
      "Schema changes, backfills, and migrations pause for human approval.",
    instructions: undefined,
    riskSignals: [
      "migration",
      "schema change",
      "database",
      "backfill",
      "index",
      "drop column",
      "alter table",
    ],
    prefersFlows: ["panel-review"],
    reviewerProfile: null,
    reviewLenses: ["correctness", "tests", "security-risk"],
    prefersPosture: "approval-suggested",
    specUpPosture: null,
  },
  "ship-fast-pragmatist": {
    label: "Ship-fast Pragmatist",
    description: "Light-touch review for low-stakes, high-velocity work.",
    instructions: undefined,
    riskSignals: [],
    prefersFlows: [],
    reviewerProfile: null,
    reviewLenses: ["correctness", "tests"],
    prefersPosture: null,
    specUpPosture: null,
  },
};

// Fail-fast at module load: a typo in any archetype (an unknown reviewLens, an
// out-of-range field) throws here rather than shipping a definition the config
// writer would later reject on adopt.
for (const [id, archetype] of Object.entries(SUPERVISOR_ARCHETYPES)) {
  const parsed = personaConfigSchema.safeParse(archetype);
  if (!parsed.success) {
    throw new Error(
      `Invalid supervisor archetype "${id}": ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ")}`,
    );
  }
  for (const lens of archetype.reviewLenses) {
    const lp = reviewLensSchema.safeParse(lens);
    if (!lp.success) {
      throw new Error(
        `Supervisor archetype "${id}" uses reviewLens "${lens}" outside the closed vocabulary.`,
      );
    }
  }
}

export type SupervisorArchetypeListing = {
  id: string;
  label: string;
  description?: string;
  reviewLenses: string[];
  prefersFlows: string[];
  reviewerProfile: string | null;
  prefersPosture: string | null;
  specUpPosture: string | null;
  /** This archetype's id is already present in config.personas. */
  adopted: boolean;
};

/** The archetype catalog as a list, each flagged `adopted` against a set of
 *  persona ids already in the project config. Shared by the CLI and HTTP so the
 *  two surfaces can't drift. Pure. */
export function listSupervisorArchetypes(
  configPersonaIds: ReadonlySet<string>,
): SupervisorArchetypeListing[] {
  return Object.entries(SUPERVISOR_ARCHETYPES).map(([id, a]) => ({
    id,
    label: a.label,
    description: a.description,
    reviewLenses: a.reviewLenses,
    prefersFlows: a.prefersFlows,
    reviewerProfile: a.reviewerProfile ?? null,
    prefersPosture: a.prefersPosture,
    specUpPosture: a.specUpPosture,
    adopted: configPersonaIds.has(id),
  }));
}

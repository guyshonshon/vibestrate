// ── Crew presets ────────────────────────────────────────────────────────────
//
// Ready-made crews tuned for a goal: a `fast` crew (the provider's lowest
// effort tier - quick, cheap, low-stakes) and a `thorough` crew (the highest
// tier - risky or complex work). The everyday `balanced` crew is the `default`
// `vibe init` already seeds, so it isn't installed again here.
//
// A preset changes HOW HARD the team runs (the profile effort), never WHO is on
// it: the roster is identical to `default`, so a Flow's seats stay covered no
// matter which preset you pick. Effort is resolved per provider from the
// capability catalog (a provider with no effort control gets a null power knob).
//
// Pure + IO-free so it unit-tests directly; the write path (config-update-
// service `installCrewPreset`) and `vibe init` consume these builders.

/** The installable preset tiers. `balanced` is the baseline `default` crew and
 *  is intentionally not in this list. */
export type PresetTier = "fast" | "thorough";

export type CrewPreset = {
  id: PresetTier;
  label: string;
  description: string;
};

export const CREW_PRESETS: CrewPreset[] = [
  {
    id: "fast",
    label: "Fast",
    description:
      "Lowest provider effort - quick, cheap, low-stakes runs. Same roster as the default crew.",
  },
  {
    id: "thorough",
    label: "Thorough",
    description:
      "Highest provider effort - risky or complex work. Same roster as the default crew.",
  },
];

/** The six built-in roles, shared by every crew. Mirrors the `default` crew
 *  `vibe init` seeds; presets reuse it verbatim and only swap the profile. */
type RosterRole = {
  id: string;
  label: string;
  seats: string[];
  permissions: string;
};

export const PRESET_ROSTER: RosterRole[] = [
  { id: "planner", label: "Planner", seats: ["planner"], permissions: "read_only" },
  { id: "architect", label: "Architect", seats: ["architect"], permissions: "read_only" },
  {
    id: "executor",
    label: "Backend Implementer",
    seats: ["implementer", "executor", "builder"],
    permissions: "code_write",
  },
  { id: "fixer", label: "Fixer", seats: ["fixer"], permissions: "code_write" },
  {
    id: "reviewer",
    label: "Reviewer",
    seats: ["reviewer", "challenger"],
    permissions: "read_only",
  },
  {
    id: "verifier",
    label: "Verifier",
    seats: ["verifier", "arbiter"],
    permissions: "read_only",
  },
];

/** The provider effort level for a tier, from the provider's wired levels.
 *  Empty levels (the provider exposes no effort control) -> null (no power
 *  knob, same as a bare profile). `fast` = lowest, `thorough` = highest. */
export function effortForTier(
  tier: PresetTier,
  powerLevels: readonly string[],
): string | null {
  if (powerLevels.length === 0) return null;
  return tier === "fast" ? powerLevels[0]! : powerLevels[powerLevels.length - 1]!;
}

/** Profile id a preset crew runs on, e.g. `claude-fast`. */
export function presetProfileId(ref: string, tier: PresetTier): string {
  return `${ref}-${tier}`;
}

/** The profile a preset installs: same provider as the default crew, the tier's
 *  effort, provider-default model. Minimal shape (the schema fills the rest). */
export function buildPresetProfile(
  ref: string,
  tier: PresetTier,
  powerLevels: readonly string[],
): { provider: string; label: string; model: null; power: string | null } {
  return {
    provider: ref,
    label: `${ref} ${tier}`,
    model: null,
    power: effortForTier(tier, powerLevels),
  };
}

export type PresetCrewRole = {
  label: string;
  seats: string[];
  profile: string;
  prompt: string;
  permissions: string;
  skills: string[];
};

/** A preset crew: the shared roster, every role on the tier's profile and the
 *  project's per-role prompt files (`<rolesDirRel>/<role>.md`). */
export function buildPresetCrew(
  tier: PresetTier,
  ref: string,
  rolesDirRel: string,
): { label: string; roles: Record<string, PresetCrewRole> } {
  const profile = presetProfileId(ref, tier);
  const roles: Record<string, PresetCrewRole> = {};
  for (const r of PRESET_ROSTER) {
    roles[r.id] = {
      label: r.label,
      seats: [...r.seats],
      profile,
      prompt: `${rolesDirRel}/${r.id}.md`,
      permissions: r.permissions,
      skills: [],
    };
  }
  const label = CREW_PRESETS.find((p) => p.id === tier)?.label ?? tier;
  return { label, roles };
}

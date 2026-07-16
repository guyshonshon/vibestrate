// ── Crew presets ────────────────────────────────────────────────────────────
//
// Ready-made crews along a few axes, all over the SAME roster as the default
// crew (so a Flow's seats stay covered - a preset changes how the team runs,
// never who is on it):
//   - fast      lowest provider effort + fewer review loops (quick, cheap)
//   - thorough  highest effort + extra review loops (risky / complex work)
//   - cheap     the provider's cheapest model at low effort (minimise spend)
//   - local     a local (non-cloud) provider (no cloud egress)
//
// The everyday `balanced` crew is the `default` `vibe init` seeds, so it isn't a
// preset. Pure + IO-free: `planPreset` decides everything from a context the
// caller gathers (provider capabilities + locality); the write path
// (config-update-service `installCrewPreset`) and `vibe init` consume it.

export type PresetTier = "fast" | "thorough" | "cheap" | "local";

export type CrewPreset = {
  id: PresetTier;
  label: string;
  description: string;
};

export const CREW_PRESETS: CrewPreset[] = [
  {
    id: "fast",
    label: "Fast",
    description: "Lowest provider effort + fewer review loops - quick, low-stakes runs.",
  },
  {
    id: "thorough",
    label: "Thorough",
    description: "Highest provider effort + extra review loops - risky or complex work.",
  },
  {
    id: "cheap",
    label: "Cheap",
    description: "The provider's cheapest model at low effort - minimise spend.",
  },
  {
    id: "local",
    label: "Local",
    description: "Runs on a local (non-cloud) provider - keeps work off cloud APIs.",
  },
];

/** Per-crew review-loop counts for the tiers that tune review depth. Applied as
 *  the crew's `maxReviewLoops` override; undefined = inherit the global. */
const REVIEW_LOOPS: Partial<Record<PresetTier, number>> = {
  fast: 1,
  thorough: 3,
};

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
 *  Empty levels (the provider exposes no effort control) -> null. `fast`/`cheap`
 *  use the lowest, `thorough` the highest. */
export function effortForTier(
  tier: PresetTier,
  powerLevels: readonly string[],
): string | null {
  if (powerLevels.length === 0) return null;
  return tier === "thorough"
    ? powerLevels[powerLevels.length - 1]!
    : powerLevels[0]!;
}

/** Profile id a preset crew runs on, e.g. `claude-fast`. */
export function presetProfileId(ref: string, tier: PresetTier): string {
  return `${ref}-${tier}`;
}

export type PresetProfile = {
  provider: string;
  label: string;
  model: string | null;
  power: string | null;
};

export type PresetCrewRole = {
  label: string;
  seats: string[];
  profile: string;
  prompt: string;
  permissions: string;
  skills: string[];
};

export type PresetCrew = { label: string; roles: Record<string, PresetCrewRole> };

/** Build a preset crew: the shared roster, every role on `profileId` and the
 *  project's per-role prompt files (`<rolesDirRel>/<role>.md`). */
export function buildPresetCrew(
  tier: PresetTier,
  profileId: string,
  rolesDirRel: string,
): PresetCrew {
  const roles: Record<string, PresetCrewRole> = {};
  for (const r of PRESET_ROSTER) {
    roles[r.id] = {
      label: r.label,
      seats: [...r.seats],
      profile: profileId,
      prompt: `${rolesDirRel}/${r.id}.md`,
      permissions: r.permissions,
      skills: [],
    };
  }
  const label = CREW_PRESETS.find((p) => p.id === tier)?.label ?? tier;
  return { label, roles };
}

/** Capability + locality snapshot for one configured provider. */
export type ProviderInfo = {
  id: string;
  /** false for cloud `http-api`; true for cli / claude-code / localhost-proxy. */
  isLocal: boolean;
  powerLevels: string[];
  modelEnabled: boolean;
  cheapModel: string | null;
};

export type PresetPlanCtx = {
  /** Provider the default crew runs on (presets stay consistent with it). */
  defaultProviderRef: string;
  /** Every configured provider with its capabilities + locality. */
  providers: ProviderInfo[];
  /** Roles dir relative to the project root (for role prompt paths). */
  rolesDirRel: string;
};

export type PresetPlan =
  | {
      ok: true;
      crewId: PresetTier;
      provider: string;
      profileId: string;
      profile: PresetProfile;
      crew: PresetCrew;
      /** Per-crew review-loop override, when the tier tunes it. */
      maxReviewLoops?: number;
    }
  | { ok: false; reason: string };

/** Decide what a preset would install, or why it can't - pure. The caller
 *  applies the result (additively, validated) or surfaces the refusal. */
export function planPreset(tier: PresetTier, ctx: PresetPlanCtx): PresetPlan {
  const byId = new Map(ctx.providers.map((p) => [p.id, p]));
  const def = byId.get(ctx.defaultProviderRef);
  if (!def) {
    return { ok: false, reason: `Provider "${ctx.defaultProviderRef}" is not configured.` };
  }

  // local: a local provider distinct from the default crew's - else it adds nothing.
  if (tier === "local") {
    const candidate = ctx.providers.find((p) => p.isLocal && p.id !== def.id);
    if (!candidate) {
      const reason = def.isLocal
        ? `Your default crew already runs on a local provider ("${def.id}"), so a local crew would be identical to it.`
        : `No local (non-cloud) provider is configured to build a local crew on.`;
      return { ok: false, reason };
    }
    return finish(tier, candidate, { model: null, power: null }, ctx);
  }

  // fast / thorough / cheap all run on the default crew's provider.
  if (tier === "cheap") {
    if (!def.modelEnabled || !def.cheapModel) {
      return {
        ok: false,
        reason: `Provider "${def.id}" has no designated cheap model, so a cheap crew can't be built (no model selection to economise on).`,
      };
    }
    return finish(tier, def, { model: def.cheapModel, power: effortForTier("fast", def.powerLevels) }, ctx);
  }

  // fast / thorough need two distinct effort levels or the tiers are identical.
  if (def.powerLevels.length < 2) {
    return {
      ok: false,
      reason: `Provider "${def.id}" exposes no distinct effort levels, so a "${tier}" crew would be identical to your default crew. Effort presets need a provider with effort control (e.g. claude, codex).`,
    };
  }
  return finish(tier, def, { model: null, power: effortForTier(tier, def.powerLevels) }, ctx);
}

function finish(
  tier: PresetTier,
  prov: ProviderInfo,
  knobs: { model: string | null; power: string | null },
  ctx: PresetPlanCtx,
): PresetPlan {
  const profileId = presetProfileId(prov.id, tier);
  const profile: PresetProfile = {
    provider: prov.id,
    label: `${prov.id} ${tier}`,
    model: knobs.model,
    power: knobs.power,
  };
  return {
    ok: true,
    crewId: tier,
    provider: prov.id,
    profileId,
    profile,
    crew: buildPresetCrew(tier, profileId, ctx.rolesDirRel),
    maxReviewLoops: REVIEW_LOOPS[tier],
  };
}

// Resolves a run-wide provider id from a (Task, ProjectConfig) pair.
//
// Lives in its own pure module so the resolution rule is easy to test in
// isolation and so the orchestrator can call it without any I/O.
//
// Design note: "effort" and "provider override" are shared concepts that
// route to any of the providers configured in project.yml — they don't
// know or care which model family those providers point at. A user can
// map `low → claude-haiku` in one project and `low → codex` in another;
// both are valid. The CLI/UI talk in low/medium/high; the project config
// owns the mapping.

import type { ProjectConfig } from "../project/config-schema.js";
import type { Effort } from "../roadmap/roadmap-types.js";

export type EffortResolution = {
  /**
   * The provider id every agent in the run should use, OR null when no
   * override applies and the agent's configured `provider` should win.
   */
  providerId: string | null;
  /** Where the resolution came from (drives the run-log message). */
  source: "providerOverride" | "effortMap" | "agentDefault";
  /**
   * Honest description for the event log. Always present even on
   * fallback so the user can see what was attempted.
   */
  note: string;
};

export type EffortResolutionInput = {
  effort: Effort | null;
  providerOverride: string | null;
  config: ProjectConfig;
};

export function resolveEffort(input: EffortResolutionInput): EffortResolution {
  const { effort, providerOverride, config } = input;

  // Explicit override beats everything else.
  if (providerOverride) {
    if (!config.providers[providerOverride]) {
      return {
        providerId: null,
        source: "agentDefault",
        note: `Task asked for provider "${providerOverride}" but it isn't configured in project.yml#providers. Falling back to each agent's default provider.`,
      };
    }
    return {
      providerId: providerOverride,
      source: "providerOverride",
      note: `Task pinned provider "${providerOverride}" (explicit override).`,
    };
  }

  if (effort) {
    const mapped = config.effortMap?.[effort];
    if (!mapped) {
      return {
        providerId: null,
        source: "agentDefault",
        note: `Task requested effort=${effort} but no providers.effortMap[${effort}] is configured. Falling back to each agent's default provider.`,
      };
    }
    if (!config.providers[mapped]) {
      return {
        providerId: null,
        source: "agentDefault",
        note: `Task requested effort=${effort} → "${mapped}" but that provider isn't in project.yml#providers. Falling back to each agent's default provider.`,
      };
    }
    return {
      providerId: mapped,
      source: "effortMap",
      note: `Task requested effort=${effort}; project.yml#effortMap.${effort} → "${mapped}".`,
    };
  }

  return {
    providerId: null,
    source: "agentDefault",
    note: "No effort or providerOverride set; each agent will use its configured provider.",
  };
}

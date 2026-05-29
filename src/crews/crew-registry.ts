import { ConfigError } from "../utils/errors.js";
import type { ProjectConfig } from "../project/config-schema.js";
import type { CrewConfig } from "./crew-schema.js";
import type { CrewRoleConfig } from "../roles/role-schema.js";
import type { ProfileConfig } from "../profiles/profile-schema.js";

/**
 * Resolve the Crew a run should use: an explicit `crewId`, else
 * `project.defaultCrew`. Fails clearly when the Crew doesn't exist.
 */
export function getCrew(
  config: ProjectConfig,
  crewId?: string | null,
): { crewId: string; crew: CrewConfig } {
  const id = crewId ?? config.defaultCrew;
  const crew = config.crews[id];
  if (!crew) {
    throw new ConfigError(
      `Crew "${id}" is not defined in project config (crews: ${Object.keys(config.crews).join(", ") || "none"}).`,
    );
  }
  return { crewId: id, crew };
}

export function getCrewRole(crew: CrewConfig, roleId: string): CrewRoleConfig {
  const role = crew.roles[roleId];
  if (!role) {
    throw new ConfigError(`Role "${roleId}" is not defined in the selected crew.`);
  }
  return role;
}

export function getProfile(config: ProjectConfig, profileId: string): ProfileConfig {
  const profile = config.profiles[profileId];
  if (!profile) {
    throw new ConfigError(
      `Profile "${profileId}" is not defined in project config (profiles: ${Object.keys(config.profiles).join(", ") || "none"}).`,
    );
  }
  return profile;
}

export function roleLabel(roleId: string, role: CrewRoleConfig): string {
  return role.label ?? roleId;
}

/** Crew roles whose `fills` includes the given seat. */
export function rolesFillingSeat(
  crew: CrewConfig,
  seat: string,
): Array<{ roleId: string; role: CrewRoleConfig }> {
  return Object.entries(crew.roles)
    .filter(([, role]) => role.fills.includes(seat))
    .map(([roleId, role]) => ({ roleId, role }));
}

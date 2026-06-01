import type { ProjectConfig } from "../project/config-schema.js";

export type ProfileUsageRef = { crewId: string; roleId: string };

/**
 * Which crew roles reference each profile id. Profiles are reusable presets a
 * Role points at, so "used by" is the link back from a profile to the roles
 * (across every crew) that run on it - surfaced in the UI/CLI and used to guard
 * deletes.
 */
export function profileUsage(config: ProjectConfig): Map<string, ProfileUsageRef[]> {
  const map = new Map<string, ProfileUsageRef[]>();
  for (const [crewId, crew] of Object.entries(config.crews)) {
    for (const [roleId, role] of Object.entries(crew.roles)) {
      const list = map.get(role.profile) ?? [];
      list.push({ crewId, roleId });
      map.set(role.profile, list);
    }
  }
  return map;
}

export function rolesUsingProfile(
  config: ProjectConfig,
  profileId: string,
): ProfileUsageRef[] {
  return profileUsage(config).get(profileId) ?? [];
}

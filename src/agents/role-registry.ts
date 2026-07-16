import { ConfigError } from "../utils/errors.js";
import type { CrewRoleConfig, CrewRolesConfigMap } from "./role-schema.js";

export function getRoleConfig(
  roles: CrewRolesConfigMap,
  roleId: string,
): CrewRoleConfig {
  const cfg = roles[roleId];
  if (!cfg) {
    throw new ConfigError(`Role "${roleId}" is not defined in the selected crew.`);
  }
  return cfg;
}

export function listRoleIds(roles: CrewRolesConfigMap): string[] {
  return Object.keys(roles);
}

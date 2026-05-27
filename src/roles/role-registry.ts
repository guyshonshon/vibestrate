import { ConfigError } from "../utils/errors.js";
import type { RoleConfig, RolesConfigMap } from "./role-schema.js";

export function getRoleConfig(
  agents: RolesConfigMap,
  roleId: string,
): RoleConfig {
  const cfg = agents[roleId];
  if (!cfg) {
    throw new ConfigError(`Agent "${roleId}" is not defined in project config.`);
  }
  return cfg;
}

export function listRoleIds(agents: RolesConfigMap): string[] {
  return Object.keys(agents);
}

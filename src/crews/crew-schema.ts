import { z } from "zod";
import { crewRolesConfigSchema } from "../roles/role-schema.js";

/**
 * A **Crew** is your local team of AI Roles. Each Crew holds a roster of Roles;
 * a run picks one Crew (defaulting to `defaultCrew`) and matches the Flow's
 * Seats to Roles in that Crew via each Role's `seats` list.
 */
export const crewConfigSchema = z
  .object({
    label: z.string().min(1).max(120).optional(),
    roles: crewRolesConfigSchema,
  })
  .strict();

export type CrewConfig = z.infer<typeof crewConfigSchema>;

export const crewsConfigSchema = z.record(z.string(), crewConfigSchema);
export type CrewsConfigMap = z.infer<typeof crewsConfigSchema>;

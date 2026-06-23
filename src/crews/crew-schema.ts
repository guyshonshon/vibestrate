import { z } from "zod";
import { crewRolesConfigSchema } from "../roles/role-schema.js";
import { reviewLensSchema } from "../orchestrator/review-lenses.js";

/**
 * A **Crew** is your local team of AI Roles. Each Crew holds a roster of Roles;
 * a run picks one Crew (defaulting to `defaultCrew`) and matches the Flow's
 * Seats to Roles in that Crew via each Role's `seats` list.
 */
export const crewConfigSchema = z
  .object({
    label: z.string().min(1).max(120).optional(),
    /**
     * Optional per-crew override of `workflow.maxReviewLoops`. When set, a run
     * using THIS crew uses this many review/fix cycles instead of the global
     * default; unset = inherit the global. Lets a "fast" crew do fewer loops
     * and a "thorough" crew more, without rewriting global flow config.
     */
    maxReviewLoops: z.number().int().min(0).max(10).optional(),
    /**
     * Optional per-crew override of the per-item review band's lenses (Shape B).
     * When set, a checklist-review run using THIS crew reviews each item under
     * these lenses instead of the flow's `checklistReview.lenses` (closed vocab;
     * precedence crew > flow > default). Lets a "security" crew aim every
     * per-item panel at auth/secrets/injection without editing the flow.
     */
    checklistReviewLenses: z.array(reviewLensSchema).min(1).max(10).optional(),
    roles: crewRolesConfigSchema,
  })
  .strict();

export type CrewConfig = z.infer<typeof crewConfigSchema>;

export const crewsConfigSchema = z.record(z.string(), crewConfigSchema);
export type CrewsConfigMap = z.infer<typeof crewsConfigSchema>;

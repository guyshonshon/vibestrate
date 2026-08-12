import { z } from "zod";

/**
 * Hard limits to keep user-supplied regex / glob inputs bounded. These are
 * defensive caps, not a sandbox. A user who *intends* to write a slow rule
 * can still write one within these bounds - the goal is to make
 * accidentally-catastrophic patterns less common, not impossible.
 */
export const POLICY_LIMITS = {
  /** Max length of a regex pattern (a deliberately small budget). */
  maxRegexLength: 256,
  /** Allowed regex flag characters. No `\`, no escape sequences. */
  allowedRegexFlags: /^[gimsuy]*$/,
  /** Max length of a glob pattern. */
  maxGlobLength: 256,
  /** Max length of a rule message. */
  maxMessageLength: 512,
  /** Max length of any added/touched-file string the engine scans per item. */
  maxScanItemLength: 4096,
} as const;

export const policySurfaceSchema = z.enum([
  "suggestion-apply",
  "bundle-apply",
]);
export type PolicySurface = z.infer<typeof policySurfaceSchema>;

const matchAddedContentSchema = z.object({
  regex: z
    .string()
    .min(1)
    .max(POLICY_LIMITS.maxRegexLength, "regex pattern too long"),
  flags: z
    .string()
    .max(8)
    .regex(POLICY_LIMITS.allowedRegexFlags, "regex flags must be a subset of [gimsuy]")
    .optional(),
});

const matchTouchedFilesSchema = z.object({
  glob: z
    .string()
    .min(1)
    .max(POLICY_LIMITS.maxGlobLength, "glob pattern too long"),
});

/**
 * One user-supplied rule. At least one of `matchAddedContent` /
 * `matchTouchedFiles` must be present, otherwise the rule would refuse
 * every patch (almost certainly a mistake - the engine treats a no-match
 * rule as malformed and surfaces it via doctor).
 *
 * `appliesTo` declares which apply surfaces the rule runs against:
 * - "suggestion-apply" - individual suggestion patch
 * - "bundle-apply"     - review-pass bundle of suggestion patches
 */
export const policyRuleSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(96)
      .regex(/^[A-Za-z][A-Za-z0-9_-]*$/, "id must match [A-Za-z][A-Za-z0-9_-]*"),
    description: z.string().min(1).max(POLICY_LIMITS.maxMessageLength),
    appliesTo: z.array(policySurfaceSchema).min(1),
    matchAddedContent: matchAddedContentSchema.optional(),
    matchTouchedFiles: matchTouchedFilesSchema.optional(),
    message: z.string().min(1).max(POLICY_LIMITS.maxMessageLength),
  })
  .refine(
    (r) => !!r.matchAddedContent || !!r.matchTouchedFiles,
    {
      message:
        "rule must define at least one of matchAddedContent or matchTouchedFiles",
    },
  );
export type PolicyRule = z.infer<typeof policyRuleSchema>;

/**
 * Action policies. Where `rules` gate *patch content* at the apply
 * surfaces, `actions` gate the Action Broker's effect kinds (provider spawn,
 * command run, file write, terminal create, run completion) with a `deny` or
 * `require_approval` effect. An action policy with no `match` applies to every
 * request of the listed kinds.
 */
export const actionKindSchema = z.enum([
  "provider.spawn",
  "command.run",
  "file.patch",
  "file.write",
  "terminal.create",
  "run.complete",
  // A run started by the supervisor from chat. See the ActionKind comment in
  // action-broker.ts for why this is not provider.spawn.
  "run.start",
  // Guided merge: the human-triggered integration->main merge. Policies
  // can deny or require_approval it like any other effect kind.
  "git.merge",
]);
export type PolicyActionKind = z.infer<typeof actionKindSchema>;

/**
 * The kinds whose effect sites can actually PAUSE for a human. Everywhere else
 * a `require_approval` verdict has no approval seam to await on, so the effect
 * is simply refused - the run gets a hard block where the author asked for a
 * hold. Rather than let that footgun through, the schema rejects the
 * combination (below) and `vibe policies doctor` names the offending kinds.
 *
 * - `run.complete` - the completion gate awaits the human sign-off.
 * - `file.patch`   - the POST-TURN DIFF GATE awaits it. The other file.patch
 *                    emitters (suggestion / bundle apply) have no seam and
 *                    refuse instead; `gateAction` records that refusal as
 *                    evidence so the audit log stays honest.
 */
export const HOLDABLE_ACTION_KINDS = [
  "run.complete",
  "file.patch",
] as const satisfies readonly PolicyActionKind[];

const HOLDABLE = new Set<string>(HOLDABLE_ACTION_KINDS);

const actionMatchSchema = z
  .object({
    /** Exact provider id (provider.spawn). */
    providerId: z.string().min(1).max(96).optional(),
    /** Regex over the command string (command.run). */
    commandRegex: z
      .string()
      .min(1)
      .max(POLICY_LIMITS.maxRegexLength, "regex pattern too long")
      .optional(),
    commandFlags: z
      .string()
      .max(8)
      .regex(POLICY_LIMITS.allowedRegexFlags, "regex flags must be a subset of [gimsuy]")
      .optional(),
    /** Glob over a touched/written path (file.write / file.patch). */
    pathGlob: z
      .string()
      .min(1)
      .max(POLICY_LIMITS.maxGlobLength, "glob pattern too long")
      .optional(),
    /** Exact terminal verdict (run.complete: "merge_ready" / "blocked"). */
    status: z.string().min(1).max(64).optional(),
  })
  .optional();

export const actionPolicySchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(96)
      .regex(/^[A-Za-z][A-Za-z0-9_-]*$/, "id must match [A-Za-z][A-Za-z0-9_-]*"),
    description: z.string().min(1).max(POLICY_LIMITS.maxMessageLength),
    on: z.array(actionKindSchema).min(1),
    match: actionMatchSchema,
    effect: z.enum(["deny", "require_approval"]).default("deny"),
    message: z.string().min(1).max(POLICY_LIMITS.maxMessageLength),
  })
  .superRefine((policy, ctx) => {
    // A `require_approval` on a kind with no approval seam cannot pause
    // anything - it refuses the effect and hard-blocks the run. Reject it at
    // load so the author finds out from `doctor` instead of from a run that
    // died at a gate they thought was a prompt.
    if (policy.effect !== "require_approval") return;
    const unholdable = policy.on.filter((kind) => !HOLDABLE.has(kind));
    if (unholdable.length === 0) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["effect"],
      message: `effect "require_approval" cannot pause ${unholdable.join(", ")} - there is no approval seam at those effect sites, so the action would simply be refused. Use effect "deny" for them, or narrow \`on\` to ${HOLDABLE_ACTION_KINDS.join(" / ")}.`,
    });
  });
export type ActionPolicy = z.infer<typeof actionPolicySchema>;

export const policyRuleFileSchema = z.object({
  rules: z.array(policyRuleSchema).default([]),
  actions: z.array(actionPolicySchema).default([]),
});
export type PolicyRuleFile = z.infer<typeof policyRuleFileSchema>;

/**
 * Engine input. The caller (checkPatchSafety) gathers these from the same
 * unified diff it already parses for the path-based safety check; the
 * policy engine never reads the worktree.
 */
export type PolicyEvaluationInput = {
  patch: string;
  /** Pre-parsed for the engine's convenience; engine can fall back to
   *  walking the patch if not supplied. */
  touchedFiles?: readonly string[];
  surface: PolicySurface;
};

export type PolicyViolation = {
  ruleId: string;
  message: string;
  /** Where it matched (best-effort, may be null if both matchers were
   *  absent - which shouldn't reach the engine since load-time validation
   *  rejects such rules). */
  matchedFile: string | null;
};

export type PolicyEvaluationResult = {
  violations: PolicyViolation[];
  /** Rules considered for this surface (after appliesTo filtering). */
  evaluatedRuleIds: string[];
};

export type MalformedPolicyFile = {
  file: string;
  reason: string;
};

/**
 * Snapshot of what the store knows. UI / CLI surface this as a single
 * read-only payload.
 */
export type PolicyStoreSnapshot = {
  rules: PolicyRule[];
  /** Broker action policies (deny / require_approval on effect kinds). */
  actions: ActionPolicy[];
  /** Files keyed by absolute path, with the rule + action ids parsed from them. */
  ruleFiles: { file: string; ruleIds: string[]; actionIds: string[] }[];
  malformedFiles: MalformedPolicyFile[];
  duplicateIds: string[];
};

export class PolicyError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "PolicyError";
  }
}

// ─── editor / suggestions / freshness ────────────────────────────────────────

export type EditorCandidate = {
  command: string;
  displayName: string;
  description: string;
  available: boolean;
};

export type EditorStatus = {
  candidates: EditorCandidate[];
  configured: {
    config: { enabled: boolean; command: string; args: string[] };
    validation: {
      ok: boolean;
      reason?: string;
      resolvedPlaceholders: string[];
    };
  } | null;
};

export type SuggestionStatus =
  | "open"
  | "approved"
  | "rejected"
  | "applying"
  | "applied"
  | "validation_passed"
  | "validation_failed"
  | "revert_failed"
  | "reverted"
  | "reverted_after_validation_failed"
  | "validation_failed_revert_failed"
  | "failed"
  | "resolved";

export type SuggestionSource = "reviewer" | "verifier" | "user" | "artifact";

export type ReviewSuggestion = {
  id: string;
  runId: string;
  createdAt: string;
  updatedAt: string;
  source: SuggestionSource;
  sourceArtifactPath: string | null;
  file: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  title: string;
  body: string;
  status: SuggestionStatus;
  proposedPatch: string | null;
  requiresApproval: boolean;
  approvalId: string | null;
  decisionNote: string | null;
  errorMessage: string | null;
  bundleId: string | null;
  appliedPatchPath: string | null;
  reversePatchPath: string | null;
  validationResultPath: string | null;
  validationProfile: string | null;
};

export type SuggestionValidationCommand = {
  command: string;
  exitCode: number;
  durationMs: number;
  status: "passed" | "failed";
  stdoutHead: string;
  stderrHead: string;
};

export type ValidationProfileSource =
  | "default"
  | "named"
  | "suggestion"
  | "bundle"
  | "override";

export type SuggestionValidationResult = {
  scope: string;
  scopeKind: "suggestion" | "bundle";
  scopeId: string;
  runId: string;
  worktreePath: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  status: "passed" | "failed" | "no_commands_configured";
  summary: { total: number; passed: number; failed: number };
  commands: SuggestionValidationCommand[];
  resultPath: string;
  profileName: string;
  profileSource: ValidationProfileSource;
  profileCommands: string[];
};

export type ValidationProfileSummary = {
  profileName: string;
  source: ValidationProfileSource;
  commands: string[];
  description: string | null;
  hasCommands: boolean;
};

export type ProfileMigrationScope =
  | { kind: "recent"; limit?: number }
  | { kind: "all" }
  | { kind: "run"; runId: string };

export type ProfileMigrationAffected = {
  runId: string;
  kind: "suggestion" | "bundle";
  id: string;
  currentProfile: string;
  nextProfile: string | null;
  sourceFile: string;
};

export type ProfileMigrationPreview = {
  fromProfile: string;
  toProfile: string | null;
  scope: ProfileMigrationScope;
  scannedRuns: number;
  affectedSuggestions: ProfileMigrationAffected[];
  affectedBundles: ProfileMigrationAffected[];
  malformedFiles: string[];
};

export type ProfileMigrationAuditKind =
  | "migrate_references"
  | "clear_references"
  | "rename_profile";

export type ProfileMigrationAudit = {
  id: string;
  /** Legacy audits written before the rename feature have no `kind` - readers should default them to "migrate_references". */
  kind?: ProfileMigrationAuditKind;
  createdAt: string;
  appliedAt: string | null;
  fromProfile: string;
  toProfile: string | null;
  scope: ProfileMigrationScope;
  affectedSuggestions: ProfileMigrationAffected[];
  affectedBundles: ProfileMigrationAffected[];
  malformedFiles: string[];
  dryRun: boolean;
  appliedBy: string;
  renamedProfile?: boolean;
  preservedDescription?: string | null;
  preservedCommandCount?: number;
};

export type ProfileRenamePreview = {
  fromProfile: string;
  toProfile: string;
  preservedDescription: string | null;
  preservedCommandCount: number;
  scope: ProfileMigrationScope;
  scannedRuns: number;
  affectedSuggestions: ProfileMigrationAffected[];
  affectedBundles: ProfileMigrationAffected[];
  malformedFiles: string[];
  warnings: string[];
};

export type ValidationProfileUsageEntry = {
  profileName: string;
  source: "default" | "named";
  totalUses: number;
  lastUsedAt: string | null;
  lastRunId: string | null;
  lastSuggestionId: string | null;
  lastBundleId: string | null;
};

export type BundleStatus =
  | "draft"
  | "approved"
  | "applying"
  | "applied"
  | "partially_applied"
  | "failed"
  | "validation_passed"
  | "validation_failed"
  | "reverted"
  | "reverted_after_validation_failed"
  | "validation_failed_revert_failed"
  | "revert_failed"
  | "rejected"
  | "smart_applying"
  | "smart_applied"
  | "smart_stopped"
  | "smart_reverted_failing"
  | "smart_failed";

export type SmartApplyStep = {
  suggestionId: string;
  applyStatus: "applied" | "failed" | "skipped";
  applyError: string | null;
  validation:
    | {
        status: "passed" | "failed" | "no_commands_configured";
        passed: number;
        failed: number;
        profileName: string;
        profileSource: ValidationProfileSource;
      }
    | null;
  revertStatus: "reverted" | "revert_failed" | null;
  revertError: string | null;
};

export type SmartApplyResult = {
  bundleId: string;
  runId: string;
  startedAt: string;
  endedAt: string;
  mode: {
    validateEachStep: boolean;
    autoRevertFailing: boolean;
    profileOverride: string | null;
    useSuggestionProfiles: boolean;
  };
  steps: SmartApplyStep[];
  finalStatus: BundleStatus;
  failedAt: number | null;
  resultPath: string;
};

export type SuggestionBundle = {
  id: string;
  runId: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  status: BundleStatus;
  suggestionIds: string[];
  approvalId: string | null;
  validationResultPath: string | null;
  createdBy: string;
  decisionNote: string | null;
  appliedAt: string | null;
  revertedAt: string | null;
  errorMessage: string | null;
  appliedPatchPath: string | null;
  reversePatchPath: string | null;
  touchedFiles: string[];
  sameFileWarnings: { file: string; suggestionIds: string[] }[];
  validationProfile: string | null;
};

export type BundlePreflightResult = {
  ok: boolean;
  findings: {
    suggestionId: string;
    reason: string | null;
    touchedFiles: string[];
  }[];
  sameFileWarnings: { file: string; suggestionIds: string[] }[];
};

export type CodebaseEvent =
  | {
      kind: "project.git.changed";
      timestamp: string;
      summary: GitStatusSummary;
    }
  | {
      kind: "run.git.changed";
      runId: string;
      timestamp: string;
      summary: GitStatusSummary;
    }
  | {
      kind: "filetree.changed";
      rootKind: "project" | "worktree";
      runId?: string;
      timestamp: string;
      changedPaths: string[];
    }
  | {
      kind: "codebase.snapshot.updated";
      timestamp: string;
      summary: GitStatusSummary | null;
    };

export type GitStatusSummary = {
  branch: string | null;
  isDirty: boolean;
  changedFileCount: number;
  headHash: string | null;
};

export type TerminalAvailability = {
  policyEnabled: boolean;
  driverAvailable: boolean;
  reason: string | null;
};

export type TerminalSession = {
  id: string;
  runId: string;
  cwd: string;
  cols: number;
  rows: number;
  shell: string;
  createdAt: string;
  closedAt: string | null;
  exitCode: number | null;
};

export type PolicySurface = "suggestion-apply" | "bundle-apply";

export type PolicyRuleSummary = {
  id: string;
  description: string;
  appliesTo: PolicySurface[];
  matchAddedContent?: { regex: string; flags?: string };
  matchTouchedFiles?: { glob: string };
  message: string;
};

/** Mirror of `actionKindSchema` (src/policies/policy-types.ts). Kept in sync by
 *  hand - the UI can't import server zod schemas. It drifted before (it was
 *  missing `git.merge` and the schema's kinds had moved on), so a drift test in
 *  tests/action-broker-honesty.test.ts pins the two lists together. */
export type PolicyActionKind =
  | "provider.spawn"
  | "command.run"
  | "file.patch"
  | "file.write"
  | "terminal.create"
  | "run.complete"
  | "git.merge";

export type ActionPolicySummary = {
  id: string;
  description: string;
  on: PolicyActionKind[];
  match?: {
    providerId?: string;
    commandRegex?: string;
    commandFlags?: string;
    pathGlob?: string;
    status?: string;
  };
  effect: "deny" | "require_approval";
  message: string;
};

export type MalformedPolicyFile = {
  file: string;
  reason: string;
};

export type PolicyStoreSnapshot = {
  rules: PolicyRuleSummary[];
  actions: ActionPolicySummary[];
  ruleFiles: { file: string; ruleIds: string[]; actionIds: string[] }[];
  malformedFiles: MalformedPolicyFile[];
  duplicateIds: string[];
};

/** The editable `policies.*` safety toggles (Advanced - Safety panel). */
export type SafetyPoliciesConfig = {
  strictApplyOnly: boolean;
  hardenReadOnlySeats: boolean;
  allowInteractiveTerminal: boolean;
  forbidMainBranchWrites: boolean;
  forbidSecretsAccess: boolean;
  forbidAutoPush: boolean;
  forbidAutoMerge: boolean;
  requireApprovalAtStages: string[];
  /** Posture auto-apply. Carried by the safety endpoint, persisted
   *  to `posture.*`. Both default off. */
  autoApplySandbox: boolean;
  autoApplyApproval: boolean;
};

/** A flow row from the live hub search (mirrors hub-client's normalized
 *  HubFlowSummary - `description`/`author` are filled from their live-contract
 *  synonyms server-side). */
export interface HubPublishResult {
  ok: boolean;
  ref?: string;
  version?: string;
  sha256?: string;
  verified?: boolean;
  alreadyExisted?: boolean;
  diagnosis?: { verdict?: string; findings?: Array<{ severity?: string; message?: string; path?: string }> };
}

export type HubFlowRow = {
  ref: string;
  name?: string | null;
  handle?: string | null;
  /** The hub's curation claim - render as "hub-curated", never "verified". */
  verified?: boolean | null;
  version?: string | null;
  label?: string | null;
  description?: string | null;
  tags?: string[] | null;
  author?: string | null;
  installs?: number | null;
  steps?: number | null;
  diagnosis?: unknown;
};

export type RunAssuranceVerdict =
  | "blocked"
  | "unsafe"
  | "unverified"
  | "partially_verified"
  | "verified";

export type RunAssurance = {
  schemaVersion: 1;
  runId: string;
  verdict: RunAssuranceVerdict;
  summary: string;
  generatedAt: string;
  policy: {
    status: "passed" | "held" | "violated";
    rulesEvaluated: string[];
    violations: { kind: string; ruleIds: string[]; reason: string }[];
  };
  validation: {
    /** "environment" = commands could not run (toolchain missing in the
     *  worktree); nothing was validated, but nothing failed either.
     *  "not_applicable" = no validation was required (no step / no commands /
     *  inert-diff scope-skip) - distinct from "missing" (expected, no evidence). */
    status: "passed" | "failed" | "environment" | "missing" | "not_applicable";
    total: number;
    passed: number;
    failed: number;
    environment: number;
  };
  review: {
    status:
      | "approved"
      | "changes_requested"
      | "missing"
      | "skipped_inert_diff"
      | "not_applicable";
  };
  verification: { status: "passed" | "failed" | "not_run" | "not_applicable" };
  coverage: { toleratedStepFailures: number };
  /** Root causes for a blocked/unsafe run (provider give-ups, failed steps).
   *  Optional: older assurance artifacts predate it. */
  blockers?: {
    stepId: string | null;
    kind: "provider" | "step" | "policy";
    class: string | null;
    detail: string;
  }[];
  caps: string[];
  /** Informational context that does NOT cap the verdict (not-applicable lanes,
   *  inert-diff review skip). Optional: older artifacts predate it. */
  notes?: string[];
  /** True iff a real check ran and passed (vs "nothing was required"). Lets a
   *  `verified` run be told apart from a "nothing to check" run. Optional:
   *  older artifacts predate it. */
  anyRealCheckPassed?: boolean;
  // Supervisor persona + how independent its review was.
  // independence is honest, NOT a confidence source.
  supervisor?: {
    persona: string | null;
    independence: "cross-model" | "single-profile";
  };
  /** How confined the run's agents actually were (from per-turn provider events,
   *  not config). Informational - never caps the verdict; "none" is the default
   *  baseline (worktree + diff gate). Optional: older artifacts predate it. */
  isolation?: {
    posture: "sandboxed" | "hardened" | "partial" | "none";
    osSandboxedTurns: number;
    hardenedTurns: number;
    unconfinedRequestedTurns: number;
  };
};

// Supervisor personas - the run composer's selector.
export type PersonaSummary = {
  id: string;
  label: string;
  description?: string;
  reviewLenses: string[];
  /** Flows this persona favors for risky work (upgrade-only bias). */
  prefersFlows?: string[];
  /** Review seats run this Profile when set (the supervisor's cost lever). */
  reviewerProfile?: string | null;
  /** Advisory posture this persona suggests for risky tasks (null = none). */
  prefersPosture?: string | null;
  /** Free-text posture injected into the spec-up planning agents (null = none). */
  specUpPosture?: string | null;
  builtin: boolean;
};
/** A project policy: the consolidated, project-scoped tiered rule surface
 *  (advise = reviewer-checked; block = deterministic merge-cap). */
export type ProjectPolicy = {
  id: string;
  statement: string;
  correction: string | null;
  scope: { lenses: string[] };
  source: "owner" | "supervisor-proposed";
  confirmedAt: string | null;
  tier: "advise" | "block";
  matcher: string | null;
};
export type PersonasResponse = {
  defaultPersona: string;
  personas: PersonaSummary[];
};

// A curated supervisor archetype (server-owned; the client adopts one by id).
export type SupervisorArchetypeView = {
  id: string;
  label: string;
  description?: string;
  reviewLenses: string[];
  prefersFlows: string[];
  reviewerProfile: string | null;
  prefersPosture: string | null;
  specUpPosture: string | null;
  /** This archetype's id is already present in config.personas. */
  adopted: boolean;
};

// Run audit tree (see src/core/run-audit.ts).
export type AuditAttemptOutcome =
  | "success"
  | "rate-limit"
  | "transient"
  | "fallback"
  | "paused"
  | "tolerated-failure"
  | "failed";

export type AuditAttempt = {
  index: number;
  outcome: AuditAttemptOutcome;
  detail: string | null;
};

export type AuditStep = {
  id: string;
  label: string;
  kind: string;
  seat: string | null;
  status: string;
  stage: string | null;
  roleId: string | null;
  roleLabel: string | null;
  profileId: string | null;
  needs: string[];
  provider: string | null;
  model: string | null;
  costUsd: number | null;
  durationMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  toolCallCount: number | null;
  retries: number;
  fellBack: boolean;
  decision: string | null;
  attempts: AuditAttempt[];
  tools: { name: string; count: number }[];
  subAgents: { name: string; description: string | null }[];
  internalsOpaque: boolean;
};

export type EngagementClass = "judgment" | "enforced" | "structural";
export type EngagementTone = "ok" | "warn" | "bad" | "info";
export type EngagementAnchor = "root" | "fanout" | "step" | "run";

export type EngagementEntry = {
  seq: number;
  timestamp: string;
  type: string;
  cls: EngagementClass;
  anchor: EngagementAnchor;
  stepId: string | null;
  title: string;
  detail: string | null;
  tone: EngagementTone;
};

export type RunAudit = {
  schemaVersion: 1;
  runId: string;
  task: string;
  status: string;
  flow: { id: string; label: string } | null;
  assuranceVerdict: string | null;
  steps: AuditStep[];
  control: { type: string; message: string }[];
  engagement: EngagementEntry[];
  totals: {
    turns: number;
    retries: number;
    fallbacks: number;
    costUsd: number | null;
  };
};

export type PolicyDoctorResult = {
  ruleCount: number;
  fileCount: number;
  malformedFiles: MalformedPolicyFile[];
  duplicateIds: string[];
};

export type PolicyViolation = {
  ruleId: string;
  message: string;
  matchedFile: string | null;
};

export type PolicyCheckResult = {
  surface: PolicySurface;
  evaluatedRuleIds: string[];
  violations: PolicyViolation[];
  ruleCountTotal: number;
  ruleCountForSurface: number;
  limits: { maxScanItemLength: number; maxPatchBytes: number };
};

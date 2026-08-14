import type { AssistCurrency } from "./flows.js";

// ─── crews / profiles (the new run-composition model) ───────────────────────

export type CrewRoleView = {
  id: string;
  label: string;
  /** Seats this role can take. */
  seats: string[];
  profile: string;
  profileConfigured: boolean;
  /** Provider behind the role's profile (null if profile missing). */
  provider: string | null;
  providerConfigured: boolean;
  permissions: string;
  skills: string[];
};

export type CrewView = {
  id: string;
  label: string;
  /** Per-crew override of the global review-loop count; null = inherit. */
  maxReviewLoops: number | null;
  roles: CrewRoleView[];
};

// ── Supervisor-assisted crew authoring (draft) ──────────────────────────────
// Hand-mirrored from src/agents/crew-assist.ts and the crew/role schemas it
// validates against.

/** One drafted role. `prompt` is a project-relative path to the role's JSON
 *  role file. The drafter AUTHORS that file (its contents arrive separately in
 *  `CrewDraft.roleFiles`) and derives the pointer itself, so the model never
 *  names a path and a role cannot aim at a file nobody wrote. */
export type CrewDraftRole = {
  label?: string;
  seats: string[];
  profile: string;
  prompt: string;
  permissions: string;
  skills?: string[];
};

export type CrewDraftConfig = {
  label?: string;
  maxReviewLoops?: number;
  roles: Record<string, CrewDraftRole>;
};

/** One role file the owner saves, byte-for-byte as it would land on disk. */
export type CrewDraftRoleFile = {
  roleId: string;
  /** Project-relative: `.vibestrate/roles/<roleId>.json`. */
  path: string;
  /** The file's contents - `{schemaVersion, id, prompt}`. */
  json: string;
};

/** A model-proposed, EDITABLE crew. No route installs one: the deliverable is
 *  the `crews.<id>` block PLUS one role file per role, and the owner saves both
 *  themselves. A crew installed without its role files fails on its first run,
 *  so both halves have to reach the owner. */
export type CrewDraft = {
  crewId: string;
  crew: CrewDraftConfig;
  /** The `crews.<id>` block, for review and copy. */
  yaml: string;
  /** One file per role, carrying that role's instructions. */
  roleFiles: CrewDraftRoleFile[];
  rationale: string;
  currency: AssistCurrency;
  /** Blocking problems the owner fixes before this crew can be installed - an
   *  unknown profile or permission id, a role file that would be replaced. The
   *  crew schema cross-validates none of those, so the service checks them and
   *  reports rather than throwing: the draft is still worth reading. */
  problems: string[];
  /** A crew with this id already exists in the project config. */
  exists: boolean;
};

export type WorkflowSelectionView = {
  flowId: string;
  crewId: string | null;
  source:
    | "forced"
    | "default"
    | "selected"
    | "only-flow"
    | "sized"
    | "spec-up"
    | "supervisor-upgraded";
  /** Adaptive spec-up: the brief is under-specified, so the run is spec'd up
   *  first and then `flowId` executes seeded with the derived spec. */
  needsSpecUp?: boolean;
  confidence: "low" | "medium" | "high";
  reasons: string[];
  risks: string[];
  posture: "normal" | "sandbox-suggested" | "approval-suggested";
  advisory: string | null;
  /** Active supervisor persona id. */
  personaId?: string | null;
  /** Set when the persona upgraded the flow for a risk-tagged task. */
  personaUpgrade?: { from: string; to: string; signals: string[] } | null;
};

export type ConsultActionKind =
  | "run"
  | "select_flow"
  | "annotate"
  | "propose_config"
  | "propose_vibestrate"
  | "request_sandbox"
  | "explain_block"
  | "other";

export type ConsultAnswer = {
  answer: string;
  confidence: "low" | "medium" | "high";
  caveats: string[];
  usedContext: string[];
  recommendedActions: { kind: ConsultActionKind; detail: string }[];
  proposedManualUpdate: { rationale: string; evidence: string; suggestedText: string } | null;
};

/** Deterministic, code-computed consult sections. */
/** What a computed consult item links to (run -> run detail, task -> board). */
export type ConsultRef =
  | { kind: "run"; id: string }
  | { kind: "task"; id: string };
/** A computed item: human text + an optional reference to open. */
export type ConsultSectionItem = { text: string; ref?: ConsultRef };

export type ConsultSections = {
  recentActivity: ConsultSectionItem[];
  openIntents: ConsultSectionItem[];
  mentionedNeverWorked: ConsultSectionItem[];
  suggestedNextSteps: ConsultSectionItem[];
  /** Maintenance tips (e.g. rewind-snapshot growth). Surfaced, never auto-applied.
   *  Plain text (no ref). Optional: older consult responses predate it. */
  housekeeping?: string[];
};

export type ConsultResult = {
  answer: ConsultAnswer;
  usedSources: string[];
  notes: string[];
  /** Deterministic project-state sections - same state => same sections. */
  sections?: ConsultSections;
  providerId: string;
  profileId: string;
  /** Model + effort actually used (null = the provider's own default). */
  model: string | null;
  effort: string | null;
  /** Id of the persisted VIBESTRATE.md proposal, when the answer proposed one. */
  proposalId?: string | null;
};

export type ProfileView = {
  id: string;
  provider: string;
  providerConfigured: boolean;
  label: string;
  model: string | null;
  power: string | null;
  maxTokens: number | null;
  timeoutMs: number | null;
  /** Crew roles that point at this profile (empty = unused). */
  usedBy: { crewId: string; roleId: string }[];
  /**
   * Whether this profile's model actually exists for its provider, judged
   * server-side against the resolved catalog (src/providers/provider-model-
   * validation.ts). `unknown-model` means a list the provider itself produced
   * does not contain it - that run fails at launch. `unverified` means we only
   * had a curated list to check against, so it is unproven, not wrong.
   */
  modelStatus: "not-applicable" | "ok" | "unknown-model" | "unverified";
  /** The sentence to show a human, or null when there is nothing wrong. */
  modelIssue: string | null;
};

export type ProviderCapabilities = {
  models: string[];
  /** Whether model selection actually applies (UI hides the field if false). */
  modelEnabled: boolean;
  powerLevels: string[];
};
/** Per-provider suggestion lists for the Profile editor (keyed by provider id). */
export type ProviderCatalog = Record<string, ProviderCapabilities>;

/** Full catalog response: the merged capabilities, the overlay status, and where
 *  each provider's spec came from (built-in vs the project overlay). */
export type ProviderCatalogResponse = {
  catalog: ProviderCatalog;
  overlay: { present: boolean; path: string };
  /** Where each provider's model list came from. `detected` is the run-start
   *  probe of the provider's own bundled catalog; `overlay` is hand-authored.
   *  Both are derived from the provider - `built-in` is our curated guess. */
  sources: Record<string, "overlay" | "detected" | "built-in">;
};

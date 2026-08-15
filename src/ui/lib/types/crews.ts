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

// ── Supervisor-assisted crew revision (inside the editor) ───────────────────
// Hand-mirrored from the crew revision service, same convention as the draft
// types above.
//
// A draft is ONE-SHOT: a description in, a whole new crew out. A revision is
// INCREMENTAL: the draft the editor is holding goes out with an instruction,
// and a proposed replacement for that same draft comes back. That difference is
// the whole point - accepting a fresh draft would throw away the work the owner
// has open.

/** One role as a revision carries it: the crew-scoped wiring plus the
 *  instructions AS TEXT. The `prompt` pointer a crew block needs is derived
 *  from the role id server-side, so a revision can never aim a role at a file
 *  nobody wrote. */
export type CrewRevisionRole = {
  label?: string;
  seats: string[];
  profile: string;
  permissions: string;
  skills?: string[];
  promptText: string;
};

export type CrewRevisionCrew = {
  label?: string;
  maxReviewLoops?: number;
  roles: Record<string, CrewRevisionRole>;
};

/** What the editor SENDS: the crew it is holding, in the same shape a revision
 *  comes back in, so a revision can be fed straight back as the next one's
 *  input. Posted flat as `{crewId, crew, instruction}`. */
export type CrewRevisionDraft = {
  crewId: string;
  crew: CrewRevisionCrew;
};

/** What comes back. A whole roster rather than a patch, which is why the
 *  service names what it dropped: absence is otherwise indistinguishable from
 *  an oversight.
 *
 *  The service also returns computed seat `coverage`. It is deliberately not
 *  mirrored: the editor derives coverage from the flow catalog for the draft in
 *  front of it, and two sources for the same number is how they end up
 *  disagreeing on screen. */
export type CrewRevision = CrewRevisionDraft & {
  addedRoleIds: string[];
  removedRoleIds: string[];
  /** What the schemas cannot check about what this revision introduces - an
   *  unknown profile or permission id, two roles on one seat. */
  problems: string[];
};

export type CrewRevisionResult = {
  /** null when the instruction was a question. "Why is the architect seat
   *  uncovered?" earns an answer and no edit, and that is a success. */
  revision: CrewRevision | null;
  answer: string;
  currency: AssistCurrency;
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

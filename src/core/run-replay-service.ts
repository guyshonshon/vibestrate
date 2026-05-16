import path from "node:path";
import { pathExists, readDirSafe, readText } from "../utils/fs.js";
import {
  runDir,
  runEventsPath,
  runStatePath,
  terminalSessionsFile,
  notificationsFile,
} from "../utils/paths.js";

/** Hard cap on events returned. Per CLAUDE.md §3 / the phase prompt, we
 *  surface truncation honestly rather than silently dropping rows. The cap
 *  applies to the timeline; the cross-cutting summaries (approvals,
 *  suggestions, etc.) are not truncated since those files are bounded in
 *  size by other code paths.
 */
const MAX_EVENTS = 10_000;

/** Re-stated locally so the projection types don't depend on the event-log
 *  enum — older event logs may carry types newer Amaco versions removed.
 *  The projection is forgiving: unknown event types still appear in the
 *  timeline, just classified into the "other" phase. */
export type ReplayPhaseKey =
  | "planning"
  | "architecting"
  | "executing"
  | "validating"
  | "reviewing"
  | "fixing"
  | "verifying"
  | "approvals"
  | "suggestions"
  | "policies"
  | "notifications"
  | "terminal"
  | "other";

export const REPLAY_PHASE_KEYS: ReplayPhaseKey[] = [
  "planning",
  "architecting",
  "executing",
  "validating",
  "reviewing",
  "fixing",
  "verifying",
  "approvals",
  "suggestions",
  "policies",
  "notifications",
  "terminal",
  "other",
];

export type ReplayEvent = {
  /** 0-based position in the (possibly truncated) timeline. */
  index: number;
  timestamp: string;
  /** "event" rows come from events.ndjson; "synthetic" rows are
   *  derived from auxiliary files (notifications, terminal sessions)
   *  to keep them visible in the same timeline. Synthetic rows never
   *  fabricate state that wasn't already on disk. */
  source: "event" | "synthetic";
  /** Mirrors AmacoEvent.type for "event" rows; readable synthetic id for
   *  "synthetic" rows ("notification.created", "terminal.session.opened",
   *  "terminal.session.closed"). */
  type: string;
  message: string;
  /** Raw data payload from events.ndjson when applicable. Pass-through
   *  with no transformation; the orchestrator emits scalar / id / path
   *  fields only. Synthetic rows carry small id+severity payloads. */
  data: Record<string, unknown> | null;
  phaseKey: ReplayPhaseKey;
  /** Artifact paths referenced by this row, relative to the run's
   *  artifacts/ dir. Built by scanning known fields in data. */
  artifactRefs: string[];
};

export type ReplayPhase = {
  key: ReplayPhaseKey;
  label: string;
  /** Indices into ReplayProjection.events. */
  eventIndices: number[];
  /** Earliest / latest timestamp across this phase's events. Null when
   *  the phase has no rows in this run. */
  startTimestamp: string | null;
  endTimestamp: string | null;
};

export type ReplayStateSnapshot = {
  /** Timestamp of the state.changed event that produced this snapshot. */
  timestamp: string;
  /** State after the transition. */
  status: string;
  /** Previous state, when known. */
  previousStatus: string | null;
};

export type ReplayApproval = {
  id: string;
  stageId: string;
  agentId: string;
  status: string;
  riskLevel: string;
  source: string;
  reason: string | null;
  createdAt: string;
  resolvedAt: string | null;
  decisionNote: string | null;
};

export type ReplaySuggestion = {
  id: string;
  title: string;
  source: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  file: string | null;
  validationProfile: string | null;
  bundleId: string | null;
  errorMessage: string | null;
};

export type ReplayBundle = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  suggestionIds: string[];
  validationProfile: string | null;
  errorMessage: string | null;
};

export type ReplayPolicyRefusal = {
  /** Timestamp of the refusing event (e.g. suggestion.apply_failed). */
  timestamp: string;
  /** Which surface refused: suggestion-apply / bundle-apply / unknown. */
  surface: "suggestion-apply" | "bundle-apply" | "unknown";
  /** Rule id parsed from the error message marker. */
  ruleId: string;
  /** Rule message (the part before "(policy rule: <id>)"). */
  message: string;
  /** Suggestion / bundle id when present in the event data. */
  targetId: string | null;
};

export type ReplayNotification = {
  id: string;
  createdAt: string;
  severity: string;
  category: string;
  title: string;
  message: string;
  runId: string | null;
  taskId: string | null;
  approvalId: string | null;
};

export type ReplayTerminalSession = {
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

export type ReplayMetricsSummary = {
  totalDurationMs: number;
  totalProviderCalls: number;
  totalCostUsd: number | null;
  reviewLoopCount: number;
  filesChanged: number | null;
  diffInsertions: number | null;
  diffDeletions: number | null;
  agentStageOrder: string[];
};

export type ReplayTruncation = {
  truncated: boolean;
  totalEventCount: number;
  keptEventCount: number;
  /** Always "latest" in V0 — when the log is over MAX_EVENTS we keep the
   *  most recent rows, since the head is more likely to be reviewed
   *  against the actual final state of the run. */
  keptKind: "latest";
  note: string;
};

export type RunReplay = {
  runId: string;
  task: string;
  taskId: string | null;
  finalStatus: string;
  branchName: string | null;
  worktreePath: string | null;
  startedAt: string;
  updatedAt: string;
  events: ReplayEvent[];
  phases: ReplayPhase[];
  snapshots: ReplayStateSnapshot[];
  truncation: ReplayTruncation;
  approvals: ReplayApproval[];
  suggestions: ReplaySuggestion[];
  bundles: ReplayBundle[];
  policyRefusals: ReplayPolicyRefusal[];
  notifications: ReplayNotification[];
  terminalSessions: ReplayTerminalSession[];
  artifacts: { path: string }[];
  metrics: ReplayMetricsSummary | null;
  /** Files we tried to read but couldn't parse / didn't exist. The UI
   *  surfaces these so users understand why a section is empty. */
  missingOrMalformed: { file: string; reason: string }[];
};

export class RunReplayError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "RunReplayError";
  }
}

/**
 * Read-only projection over a run's persisted files. Tolerates missing
 * optional files (older runs may not have everything new Amaco versions
 * write); the result lists each one under missingOrMalformed so the UI
 * surfaces honest gaps instead of pretending the data is there.
 *
 * The projection never reads worktree contents, source files, terminal
 * transcripts (none are persisted anyway), or .env files. It reads only
 * .amaco/runs/<runId>/* and the two project-scoped files that carry
 * per-run rows (notifications + terminal sessions), filtered to this run.
 */
export async function buildRunReplay(
  projectRoot: string,
  runId: string,
): Promise<RunReplay> {
  const stateFile = runStatePath(projectRoot, runId);
  if (!(await pathExists(stateFile))) {
    throw new RunReplayError(404, `Run not found: ${runId}`);
  }

  const missing: { file: string; reason: string }[] = [];

  // ─── state.json ────────────────────────────────────────────────────────
  const stateRaw = await safeReadJson(stateFile, missing);
  const state = (stateRaw ?? {}) as Record<string, unknown>;

  // ─── events.ndjson ─────────────────────────────────────────────────────
  const eventsRaw = await readEventsNdjson(
    runEventsPath(projectRoot, runId),
    missing,
  );
  const totalEventCount = eventsRaw.length;
  const truncated = totalEventCount > MAX_EVENTS;
  const kept = truncated ? eventsRaw.slice(-MAX_EVENTS) : eventsRaw;

  // ─── auxiliary files ───────────────────────────────────────────────────
  const approvalsRaw = await safeReadJson(
    path.join(runDir(projectRoot, runId), "approvals.json"),
    missing,
  );
  const suggestionsRaw = await safeReadJson(
    path.join(runDir(projectRoot, runId), "suggestions.json"),
    missing,
  );
  const bundlesRaw = await safeReadJson(
    path.join(runDir(projectRoot, runId), "suggestion-bundles.json"),
    missing,
  );
  const metricsRaw = await safeReadJson(
    path.join(runDir(projectRoot, runId), "runtime-metrics.json"),
    missing,
  );
  const notificationsRaw = await safeReadJson(
    notificationsFile(projectRoot),
    missing,
  );
  const terminalRaw = await safeReadJson(
    terminalSessionsFile(projectRoot),
    missing,
  );

  // ─── Build cross-cutting summaries ─────────────────────────────────────
  const approvals = extractApprovals(approvalsRaw);
  const suggestions = extractSuggestions(suggestionsRaw);
  const bundles = extractBundles(bundlesRaw);
  const allNotifications = extractNotifications(notificationsRaw);
  const notifications = allNotifications.filter((n) => n.runId === runId);
  const allTerminalSessions = extractTerminalSessions(terminalRaw);
  const terminalSessions = allTerminalSessions.filter(
    (s) => s.runId === runId,
  );
  const metrics = extractMetricsSummary(metricsRaw);

  // ─── Artifacts under .amaco/runs/<id>/artifacts/ ───────────────────────
  const artifactsDir = path.join(runDir(projectRoot, runId), "artifacts");
  const artifactNames = (await readDirSafe(artifactsDir)).sort();
  const artifacts = artifactNames.map((name) => ({ path: name }));

  // ─── Build merged timeline ─────────────────────────────────────────────
  const timeline: ReplayEvent[] = [];
  for (const ev of kept) {
    timeline.push(buildEventRow(ev));
  }
  // Synthesize timeline rows for notifications + terminal sessions so the
  // user can scrub past them in the same view. These rows never invent
  // information; every field is sourced from the auxiliary files above.
  for (const n of notifications) {
    timeline.push({
      index: 0,
      timestamp: n.createdAt,
      source: "synthetic",
      type: "notification.created",
      message: n.title,
      data: {
        id: n.id,
        severity: n.severity,
        category: n.category,
        approvalId: n.approvalId,
      },
      phaseKey: "notifications",
      artifactRefs: [],
    });
  }
  for (const s of terminalSessions) {
    timeline.push({
      index: 0,
      timestamp: s.createdAt,
      source: "synthetic",
      type: "terminal.session.opened",
      message: `Terminal session ${s.id} opened in ${s.cwd}`,
      data: { id: s.id, cwd: s.cwd, cols: s.cols, rows: s.rows },
      phaseKey: "terminal",
      artifactRefs: [],
    });
    if (s.closedAt) {
      timeline.push({
        index: 0,
        timestamp: s.closedAt,
        source: "synthetic",
        type: "terminal.session.closed",
        message: `Terminal session ${s.id} closed (exit ${s.exitCode ?? "?"})`,
        data: { id: s.id, exitCode: s.exitCode },
        phaseKey: "terminal",
        artifactRefs: [],
      });
    }
  }
  timeline.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  timeline.forEach((e, i) => {
    e.index = i;
  });

  // ─── Phase classification + snapshots ──────────────────────────────────
  const snapshots: ReplayStateSnapshot[] = [];
  let currentStagePhase: ReplayPhaseKey | null = null;
  for (const ev of timeline) {
    // Override phase from event type when applicable. The stage-phase
    // pass-through happens for events whose type maps to "other" by
    // default but were emitted while the run was in a known state.
    const explicit = phaseFromEventType(ev.type);
    if (explicit) {
      ev.phaseKey = explicit;
    } else if (currentStagePhase) {
      ev.phaseKey = currentStagePhase;
    }
    if (ev.type === "state.changed") {
      const to = readString(ev.data, "to");
      const from = readString(ev.data, "from");
      if (to) {
        snapshots.push({
          timestamp: ev.timestamp,
          status: to,
          previousStatus: from,
        });
        const next = stageKeyFromStatus(to);
        if (next) currentStagePhase = next;
      }
    }
  }

  const phases: ReplayPhase[] = REPLAY_PHASE_KEYS.map((key) => {
    const indices = timeline
      .filter((e) => e.phaseKey === key)
      .map((e) => e.index);
    const first = indices[0];
    const last = indices[indices.length - 1];
    return {
      key,
      label: phaseLabel(key),
      eventIndices: indices,
      startTimestamp: first !== undefined ? timeline[first]!.timestamp : null,
      endTimestamp: last !== undefined ? timeline[last]!.timestamp : null,
    };
  });

  // ─── Policy refusals (extracted from event messages) ───────────────────
  const policyRefusals = extractPolicyRefusals(timeline);

  // ─── Final assembly ────────────────────────────────────────────────────
  const finalStatus = readString(state, "status") ?? "unknown";
  const branchName = readString(state, "branchName");
  const worktreePath = readString(state, "worktreePath");
  const startedAt =
    readString(state, "startedAt") ??
    (timeline[0]?.timestamp ?? new Date(0).toISOString());
  const updatedAt =
    readString(state, "updatedAt") ??
    (timeline[timeline.length - 1]?.timestamp ?? startedAt);
  const task = readString(state, "task") ?? "";
  const taskId = readString(state, "taskId");

  return {
    runId,
    task,
    taskId,
    finalStatus,
    branchName,
    worktreePath,
    startedAt,
    updatedAt,
    events: timeline,
    phases,
    snapshots,
    truncation: {
      truncated,
      totalEventCount,
      keptEventCount: kept.length,
      keptKind: "latest",
      note: truncated
        ? `Showing the most recent ${kept.length} of ${totalEventCount} events. Older events are still on disk in events.ndjson; open the run folder to inspect them.`
        : "",
    },
    approvals,
    suggestions,
    bundles,
    policyRefusals,
    notifications,
    terminalSessions,
    artifacts,
    metrics,
    missingOrMalformed: missing,
  };
}

// ─── helpers ─────────────────────────────────────────────────────────────

function buildEventRow(ev: Record<string, unknown>): ReplayEvent {
  const timestamp =
    typeof ev.timestamp === "string" ? ev.timestamp : new Date(0).toISOString();
  const type = typeof ev.type === "string" ? ev.type : "unknown";
  const message = typeof ev.message === "string" ? ev.message : "";
  const data =
    ev.data && typeof ev.data === "object" && !Array.isArray(ev.data)
      ? (ev.data as Record<string, unknown>)
      : null;
  return {
    index: 0,
    timestamp,
    source: "event",
    type,
    message,
    data,
    phaseKey: "other",
    artifactRefs: collectArtifactRefs(data),
  };
}

function collectArtifactRefs(
  data: Record<string, unknown> | null,
): string[] {
  if (!data) return [];
  const refs: string[] = [];
  for (const key of ["artifactPath", "outputArtifactPath", "sourceArtifactPath"]) {
    const v = data[key];
    if (typeof v === "string" && v.length > 0) refs.push(v);
  }
  return refs;
}

function phaseFromEventType(t: string): ReplayPhaseKey | null {
  if (t.startsWith("approval.")) return "approvals";
  if (t.startsWith("suggestion.") || t.startsWith("bundle.")) return "suggestions";
  if (t.startsWith("policy.")) return "policies";
  if (t === "notification.created") return "notifications";
  if (t.startsWith("terminal.")) return "terminal";
  if (t === "validation.started" || t === "validation.command.completed")
    return "validating";
  if (t === "review.decision") return "reviewing";
  if (t === "verification.decision") return "verifying";
  return null;
}

function stageKeyFromStatus(status: string): ReplayPhaseKey | null {
  switch (status) {
    case "planning":
    case "planned":
      return "planning";
    case "architecting":
    case "architected":
      return "architecting";
    case "executing":
      return "executing";
    case "validating":
      return "validating";
    case "reviewing":
      return "reviewing";
    case "fixing":
      return "fixing";
    case "verifying":
      return "verifying";
    default:
      return null;
  }
}

function phaseLabel(key: ReplayPhaseKey): string {
  switch (key) {
    case "planning":
      return "Planning";
    case "architecting":
      return "Architecting";
    case "executing":
      return "Executing";
    case "validating":
      return "Validating";
    case "reviewing":
      return "Reviewing";
    case "fixing":
      return "Fixing";
    case "verifying":
      return "Verifying";
    case "approvals":
      return "Approvals";
    case "suggestions":
      return "Suggestions & bundles";
    case "policies":
      return "Policies";
    case "notifications":
      return "Notifications";
    case "terminal":
      return "Terminal";
    case "other":
      return "Other";
  }
}

const POLICY_RULE_RE = /\(policy rule:\s*([A-Za-z][A-Za-z0-9_-]*)\)\s*$/;

function extractPolicyRefusals(
  timeline: readonly ReplayEvent[],
): ReplayPolicyRefusal[] {
  const out: ReplayPolicyRefusal[] = [];
  for (const ev of timeline) {
    const isSuggestionFail = ev.type === "suggestion.apply_failed";
    const isBundleFail = ev.type === "bundle.apply_failed";
    if (!isSuggestionFail && !isBundleFail) continue;
    const errMsg =
      (ev.data ? readString(ev.data, "errorMessage") : null) ?? ev.message;
    const m = POLICY_RULE_RE.exec(errMsg);
    if (!m) continue;
    out.push({
      timestamp: ev.timestamp,
      surface: isSuggestionFail ? "suggestion-apply" : "bundle-apply",
      ruleId: m[1]!,
      message: errMsg.replace(POLICY_RULE_RE, "").trim(),
      targetId: ev.data ? readString(ev.data, "id") : null,
    });
  }
  return out;
}

function extractApprovals(raw: unknown): ReplayApproval[] {
  if (!Array.isArray(raw)) return [];
  const out: ReplayApproval[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const rec = r as Record<string, unknown>;
    const id = readString(rec, "id");
    if (!id) continue;
    out.push({
      id,
      stageId: readString(rec, "stageId") ?? "",
      agentId: readString(rec, "agentId") ?? "",
      status: readString(rec, "status") ?? "pending",
      riskLevel: readString(rec, "riskLevel") ?? "medium",
      source: readString(rec, "source") ?? "agent",
      reason: readString(rec, "reason"),
      createdAt: readString(rec, "createdAt") ?? "",
      resolvedAt: readString(rec, "resolvedAt"),
      decisionNote: readString(rec, "decisionNote"),
    });
  }
  return out;
}

function extractSuggestions(raw: unknown): ReplaySuggestion[] {
  if (!raw || typeof raw !== "object") return [];
  const arr = (raw as { suggestions?: unknown[] }).suggestions;
  if (!Array.isArray(arr)) return [];
  const out: ReplaySuggestion[] = [];
  for (const r of arr) {
    if (!r || typeof r !== "object") continue;
    const rec = r as Record<string, unknown>;
    const id = readString(rec, "id");
    if (!id) continue;
    out.push({
      id,
      title: readString(rec, "title") ?? "",
      source: readString(rec, "source") ?? "user",
      status: readString(rec, "status") ?? "open",
      createdAt: readString(rec, "createdAt") ?? "",
      updatedAt: readString(rec, "updatedAt") ?? "",
      file: readString(rec, "file"),
      validationProfile: readString(rec, "validationProfile"),
      bundleId: readString(rec, "bundleId"),
      errorMessage: readString(rec, "errorMessage"),
    });
  }
  return out;
}

function extractBundles(raw: unknown): ReplayBundle[] {
  if (!raw || typeof raw !== "object") return [];
  const arr = (raw as { bundles?: unknown[] }).bundles;
  if (!Array.isArray(arr)) return [];
  const out: ReplayBundle[] = [];
  for (const r of arr) {
    if (!r || typeof r !== "object") continue;
    const rec = r as Record<string, unknown>;
    const id = readString(rec, "id");
    if (!id) continue;
    const sids = (rec.suggestionIds as unknown) instanceof Array
      ? ((rec.suggestionIds as unknown[]).filter(
          (x): x is string => typeof x === "string",
        ) as string[])
      : [];
    out.push({
      id,
      title: readString(rec, "title") ?? "",
      status: readString(rec, "status") ?? "open",
      createdAt: readString(rec, "createdAt") ?? "",
      updatedAt: readString(rec, "updatedAt") ?? "",
      suggestionIds: sids,
      validationProfile: readString(rec, "validationProfile"),
      errorMessage: readString(rec, "errorMessage"),
    });
  }
  return out;
}

function extractNotifications(raw: unknown): ReplayNotification[] {
  if (!raw || typeof raw !== "object") return [];
  const arr = (raw as { notifications?: unknown[] }).notifications;
  if (!Array.isArray(arr)) return [];
  const out: ReplayNotification[] = [];
  for (const r of arr) {
    if (!r || typeof r !== "object") continue;
    const rec = r as Record<string, unknown>;
    const id = readString(rec, "id");
    if (!id) continue;
    out.push({
      id,
      createdAt: readString(rec, "createdAt") ?? "",
      severity: readString(rec, "severity") ?? "info",
      category: readString(rec, "category") ?? "info",
      title: readString(rec, "title") ?? "",
      message: readString(rec, "message") ?? "",
      runId: readString(rec, "runId"),
      taskId: readString(rec, "taskId"),
      approvalId: readString(rec, "approvalId"),
    });
  }
  return out;
}

function extractTerminalSessions(raw: unknown): ReplayTerminalSession[] {
  if (!raw || typeof raw !== "object") return [];
  const arr = (raw as { sessions?: unknown[] }).sessions;
  if (!Array.isArray(arr)) return [];
  const out: ReplayTerminalSession[] = [];
  for (const r of arr) {
    if (!r || typeof r !== "object") continue;
    const rec = r as Record<string, unknown>;
    const id = readString(rec, "id");
    if (!id) continue;
    out.push({
      id,
      runId: readString(rec, "runId") ?? "",
      cwd: readString(rec, "cwd") ?? "",
      cols: readNumber(rec, "cols") ?? 0,
      rows: readNumber(rec, "rows") ?? 0,
      shell: readString(rec, "shell") ?? "",
      createdAt: readString(rec, "createdAt") ?? "",
      closedAt: readString(rec, "closedAt"),
      exitCode: readNumber(rec, "exitCode"),
    });
  }
  return out;
}

function extractMetricsSummary(raw: unknown): ReplayMetricsSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const agents = Array.isArray(rec.agents) ? (rec.agents as unknown[]) : [];
  const stageOrder = agents
    .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
    .map((a) => readString(a, "stageId") ?? "")
    .filter((s) => s.length > 0);
  return {
    totalDurationMs: readNumber(rec, "totalDurationMs") ?? 0,
    totalProviderCalls: readNumber(rec, "totalProviderCalls") ?? 0,
    totalCostUsd: readNumber(rec, "totalCostUsd"),
    reviewLoopCount: readNumber(rec, "reviewLoopCount") ?? 0,
    filesChanged: readNumber(rec, "filesChanged"),
    diffInsertions: readNumber(rec, "diffInsertions"),
    diffDeletions: readNumber(rec, "diffDeletions"),
    agentStageOrder: stageOrder,
  };
}

function readString(
  obj: Record<string, unknown> | null,
  key: string,
): string | null {
  if (!obj) return null;
  const v = obj[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function readNumber(
  obj: Record<string, unknown>,
  key: string,
): number | null {
  const v = obj[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

async function safeReadJson(
  file: string,
  missing: { file: string; reason: string }[],
): Promise<unknown> {
  if (!(await pathExists(file))) {
    // Optional files: surfaced as missing only if they parse-error on
    // load. Pure absence is not noteworthy — many runs predate the
    // feature that writes a given file.
    return null;
  }
  try {
    const text = await readText(file);
    if (!text.trim()) return null;
    return JSON.parse(text);
  } catch (err) {
    missing.push({
      file,
      reason: `Failed to parse: ${err instanceof Error ? err.message : String(err)}`,
    });
    return null;
  }
}

async function readEventsNdjson(
  file: string,
  missing: { file: string; reason: string }[],
): Promise<Record<string, unknown>[]> {
  if (!(await pathExists(file))) return [];
  let text: string;
  try {
    text = await readText(file);
  } catch (err) {
    missing.push({
      file,
      reason: `Could not read: ${err instanceof Error ? err.message : String(err)}`,
    });
    return [];
  }
  const out: Record<string, unknown>[] = [];
  let badLines = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const v = JSON.parse(line);
      if (v && typeof v === "object" && !Array.isArray(v)) {
        out.push(v as Record<string, unknown>);
      }
    } catch {
      badLines += 1;
    }
  }
  if (badLines > 0) {
    missing.push({
      file,
      reason: `Skipped ${badLines} unparseable line(s).`,
    });
  }
  return out;
}

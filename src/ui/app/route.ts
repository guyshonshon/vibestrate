// Pure URL <-> Route helpers. This file deliberately holds zero React /
// browser-only imports so it can be unit-tested under the node-only Vitest
// environment.

import type { ReplayPhaseKey } from "../lib/types.js";
import type { InspectorTabId } from "../components/layout/inspector-tabs.js";

/**
 * Replay deep-link target. The run-detail page passes this down to the
 * Replay tab and the tab resolves it once the run's replay projection has
 * loaded. All three forms are read-only — they steer the selection, never
 * mutate the run.
 */
export type ReplayFocus =
  | { kind: "event"; eventIndex: number }
  | { kind: "phase"; phase: ReplayPhaseKey }
  | {
      kind: "match";
      match: { kind: "suggestion" | "approval" | "notification"; id: string };
    };

export type Route =
  | { kind: "mission" }
  | { kind: "runs" }
  | {
      kind: "run";
      runId: string;
      tab?: InspectorTabId | null;
      replayFocus?: ReplayFocus | null;
    }
  | { kind: "board" }
  | { kind: "task"; taskId: string }
  | { kind: "queue" }
  | { kind: "proposals" }
  | { kind: "proposal"; proposalId: string }
  | { kind: "settings" }
  | { kind: "project" }
  | {
      kind: "codebase";
      filePath: string | null;
      line: number | null;
      runId: string | null;
    }
  | { kind: "git"; runId: string | null };

const INSPECTOR_TABS = new Set<InspectorTabId>([
  "diff",
  "artifact",
  "validation",
  "logs",
  "notes",
  "skills",
  "approvals",
  "metrics",
  "agent-work",
  "git",
  "suggestions",
  "terminal",
  "replay",
]);

const REPLAY_PHASES = new Set<ReplayPhaseKey>([
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
]);

function parseReplayFocus(query: URLSearchParams): ReplayFocus | null {
  const rawEvent = query.get("replayEvent");
  if (rawEvent !== null) {
    const n = Number(rawEvent);
    if (Number.isFinite(n) && n >= 0 && Math.floor(n) === n) {
      return { kind: "event", eventIndex: n };
    }
  }
  const rawPhase = query.get("replayPhase");
  if (rawPhase && REPLAY_PHASES.has(rawPhase as ReplayPhaseKey)) {
    return { kind: "phase", phase: rawPhase as ReplayPhaseKey };
  }
  const rawMatch = query.get("replayMatch");
  if (rawMatch) {
    const colon = rawMatch.indexOf(":");
    if (colon > 0) {
      const kind = rawMatch.slice(0, colon);
      const id = rawMatch.slice(colon + 1);
      if (
        id.length > 0 &&
        (kind === "suggestion" || kind === "approval" || kind === "notification")
      ) {
        return { kind: "match", match: { kind, id } };
      }
    }
  }
  return null;
}

function serializeReplayFocus(
  q: URLSearchParams,
  focus: ReplayFocus | null,
): void {
  if (!focus) return;
  switch (focus.kind) {
    case "event":
      q.set("replayEvent", String(focus.eventIndex));
      return;
    case "phase":
      q.set("replayPhase", focus.phase);
      return;
    case "match":
      q.set("replayMatch", `${focus.match.kind}:${focus.match.id}`);
      return;
  }
}

/** Pure parser. Accepts the raw `location.hash` string. */
export function parseHashRoute(hash: string): Route {
  const raw = hash.replace(/^#\/?/, "");
  const [pathPart, queryPart] = raw.split("?");
  const parts = (pathPart ?? "").split("/").filter(Boolean);
  const query = new URLSearchParams(queryPart ?? "");
  if (parts[0] === "mission") return { kind: "mission" };
  if (parts[0] === "runs" && parts[1]) {
    const tabRaw = query.get("tab");
    const tab =
      tabRaw && INSPECTOR_TABS.has(tabRaw as InspectorTabId)
        ? (tabRaw as InspectorTabId)
        : null;
    return {
      kind: "run",
      runId: parts[1],
      tab,
      replayFocus: parseReplayFocus(query),
    };
  }
  if (parts[0] === "board") return { kind: "board" };
  if (parts[0] === "tasks" && parts[1]) return { kind: "task", taskId: parts[1] };
  if (parts[0] === "queue") return { kind: "queue" };
  if (parts[0] === "settings") return { kind: "settings" };
  if (parts[0] === "project") return { kind: "project" };
  if (parts[0] === "codebase") {
    const filePath = query.get("path");
    const lineStr = query.get("line");
    const runId = query.get("runId");
    return {
      kind: "codebase",
      filePath: filePath ?? null,
      line: lineStr ? Number(lineStr) || null : null,
      runId: runId ?? null,
    };
  }
  if (parts[0] === "git") {
    const runId = query.get("runId");
    return { kind: "git", runId: runId ?? null };
  }
  if (parts[0] === "proposals" && parts[1])
    return { kind: "proposal", proposalId: parts.slice(1).join("/") };
  if (parts[0] === "proposals") return { kind: "proposals" };
  if (parts[0] === "runs") return { kind: "runs" };
  // Default landing is now Mission Control.
  return { kind: "mission" };
}

/** Pure stringifier. Returns the next `location.hash` value. */
export function serializeRoute(route: Route): string {
  switch (route.kind) {
    case "mission":
      return "#/";
    case "runs":
      return "#/runs";
    case "run": {
      const q = new URLSearchParams();
      if (route.tab) q.set("tab", route.tab);
      serializeReplayFocus(q, route.replayFocus ?? null);
      const qs = q.toString();
      return `#/runs/${route.runId}${qs ? `?${qs}` : ""}`;
    }
    case "board":
      return "#/board";
    case "task":
      return `#/tasks/${route.taskId}`;
    case "queue":
      return "#/queue";
    case "proposals":
      return "#/proposals";
    case "proposal":
      return `#/proposals/${route.proposalId}`;
    case "settings":
      return "#/settings";
    case "project":
      return "#/project";
    case "codebase": {
      const q = new URLSearchParams();
      if (route.filePath) q.set("path", route.filePath);
      if (route.line !== null) q.set("line", String(route.line));
      if (route.runId) q.set("runId", route.runId);
      const qs = q.toString();
      return `#/codebase${qs ? `?${qs}` : ""}`;
    }
    case "git": {
      const q = new URLSearchParams();
      if (route.runId) q.set("runId", route.runId);
      const qs = q.toString();
      return `#/git${qs ? `?${qs}` : ""}`;
    }
  }
}

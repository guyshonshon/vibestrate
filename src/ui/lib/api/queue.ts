// Scheduler queue, run streams, scheduler log/spawns, issues, conflicts.
import { jsonGet, jsonPost } from "./http.js";
import type {
  ConflictWarning,
  QueueEntry,
  SchedulerState,
} from "../types.js";

export const queueApi = {
  async getQueue(): Promise<{
    queue: QueueEntry[];
    state: SchedulerState;
  }> {
    return jsonGet("/api/queue");
  },
  async startScheduler(): Promise<{
    ok: true;
    pid: number | null;
    message: string;
  }> {
    return jsonPost("/api/scheduler/start");
  },
  async listRunStreams(runId: string): Promise<{
    streams: { promptName: string; bytes: number; updatedAt: string }[];
  }> {
    return jsonGet(`/api/runs/${encodeURIComponent(runId)}/streams`);
  },
  async readRunStream(
    runId: string,
    name: string,
  ): Promise<{
    lines: { stream: "stdout" | "stderr"; chunk: string; at: string }[];
  }> {
    return jsonGet(
      `/api/runs/${encodeURIComponent(runId)}/streams/${encodeURIComponent(name)}`,
    );
  },
  async getSchedulerLog(bytes?: number): Promise<{
    bytes: number;
    truncated: boolean;
    text: string;
  }> {
    const qs = bytes ? `?bytes=${bytes}` : "";
    return jsonGet(`/api/scheduler/log${qs}`);
  },
  async getSchedulerSpawns(): Promise<{
    records: {
      at: string;
      pid: number | null;
      source: string;
      exitedAt: string | null;
      exitCode: number | null;
      exitError: string | null;
    }[];
  }> {
    return jsonGet(`/api/scheduler/spawns`);
  },
  async listIssues(): Promise<{
    issues: Array<{
      id: string;
      createdAt: string;
      kind: string;
      message: string;
      detail?: string;
      fix?: string;
      context?: Record<string, unknown>;
      resolved: boolean;
    }>;
    unresolved: number;
  }> {
    return jsonGet("/api/issues");
  },
  async resolveIssue(id: string): Promise<{ ok: true }> {
    return jsonPost(`/api/issues/${encodeURIComponent(id)}/resolve`);
  },
  async listConflicts(): Promise<ConflictWarning[]> {
    const r = await jsonGet<{ warnings: ConflictWarning[] }>(
      "/api/scheduler/conflicts",
    );
    return r.warnings;
  },
};

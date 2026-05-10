import path from "node:path";
import { MetricsStore } from "./metrics-store.js";
import { runDir } from "../utils/paths.js";
import { pathExists, readText } from "../utils/fs.js";
import { runStateSchema, type RunState } from "./state-machine.js";
import type {
  AgentMetrics,
  RuntimeMetrics,
} from "./runtime-metrics.js";
import { runStatePath } from "../utils/paths.js";

export type AgentWorkRow = {
  agentId: string;
  stage: string;
  providerId: string;
  providerType: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  exitCode: number;
  skillsAttached: string[];
  skillsRequested: string[];
  artifacts: { kind: string; path: string }[];
  /**
   * Files changed AFTER this agent finished, captured by the orchestrator from
   * the worktree diff at that moment. This is best-effort attribution: the
   * count only includes files that changed compared to the previous snapshot.
   */
  filesChangedAfter: number | null;
  diffInsertionsAfter: number | null;
  diffDeletionsAfter: number | null;
  validationSummary: { total: number; passed: number; failed: number } | null;
  reviewDecision: string | null;
  verificationDecision: string | null;
  notes: string[];
  /**
   * Always true in V0: we attribute on a per-stage basis using diff stats taken
   * after each stage, but we do not snapshot the per-file delta yet. Callers
   * should label this as "best effort".
   */
  bestEffort: boolean;
};

export type AgentWorkReport = {
  runId: string;
  available: boolean;
  bestEffort: true;
  totalDurationMs: number;
  totalCostUsd: number | null;
  rows: AgentWorkRow[];
  notice: string;
};

export async function getAgentWork(input: {
  projectRoot: string;
  runId: string;
}): Promise<AgentWorkReport> {
  const metrics = await new MetricsStore(input.projectRoot, input.runId).read();
  const stateFile = runStatePath(input.projectRoot, input.runId);
  const runStatusInfo: { state: RunState | null } = { state: null };
  if (await pathExists(stateFile)) {
    try {
      const text = await readText(stateFile);
      const parsed = runStateSchema.safeParse(JSON.parse(text));
      if (parsed.success) runStatusInfo.state = parsed.data;
    } catch {
      // ignore corrupt run state
    }
  }

  if (!metrics) {
    return {
      runId: input.runId,
      available: false,
      bestEffort: true,
      totalDurationMs: 0,
      totalCostUsd: null,
      rows: [],
      notice:
        "No runtime metrics yet. Agent attribution becomes available after the first agent completes.",
    };
  }

  const rows = metrics.agents.map((a) =>
    rowFromAgent(a, runDir(input.projectRoot, input.runId)),
  );

  return {
    runId: input.runId,
    available: true,
    bestEffort: true,
    totalDurationMs: metrics.totalDurationMs,
    totalCostUsd: metrics.totalCostUsd,
    rows,
    notice: buildNotice(metrics, runStatusInfo.state),
  };
}

function rowFromAgent(a: AgentMetrics, runRootAbs: string): AgentWorkRow {
  const artifacts: { kind: string; path: string }[] = [];
  if (a.promptArtifactPath) {
    artifacts.push({ kind: "prompt", path: relToRun(runRootAbs, a.promptArtifactPath) });
  }
  if (a.outputArtifactPath) {
    artifacts.push({ kind: "output", path: relToRun(runRootAbs, a.outputArtifactPath) });
  }
  if (a.stdoutArtifactPath) {
    artifacts.push({ kind: "stdout", path: relToRun(runRootAbs, a.stdoutArtifactPath) });
  }
  if (a.stderrArtifactPath) {
    artifacts.push({ kind: "stderr", path: relToRun(runRootAbs, a.stderrArtifactPath) });
  }
  return {
    agentId: a.agentId,
    stage: a.stageId,
    providerId: a.providerId,
    providerType: a.providerType,
    startedAt: a.startedAt,
    endedAt: a.endedAt,
    durationMs: a.durationMs,
    exitCode: a.exitCode,
    skillsAttached: a.skillsAttached,
    skillsRequested: a.skillsRequested,
    artifacts,
    filesChangedAfter: a.filesChangedAfter,
    diffInsertionsAfter: a.diffInsertionsAfter,
    diffDeletionsAfter: a.diffDeletionsAfter,
    validationSummary: a.validationSummary,
    reviewDecision: a.reviewDecision,
    verificationDecision: a.verificationDecision,
    notes: a.notes,
    bestEffort: true,
  };
}

function relToRun(runRoot: string, abs: string): string {
  if (path.isAbsolute(abs)) {
    const rel = path.relative(runRoot, abs);
    return rel || path.basename(abs);
  }
  return abs;
}

function buildNotice(metrics: RuntimeMetrics, _state: RunState | null): string {
  if (metrics.agents.length === 0) {
    return "No agents have completed yet.";
  }
  return "Per-agent file attribution is best-effort: counts come from worktree diffs after each stage, not per-file authorship.";
}

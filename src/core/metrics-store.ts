import path from "node:path";
import { ensureDir, pathExists, readText, writeText } from "../utils/fs.js";
import { runDir } from "../utils/paths.js";
import {
  type AgentMetrics,
  type RuntimeMetrics,
  recomputeRunTotals,
  runtimeMetricsSchema,
} from "./runtime-metrics.js";
import { nowIso } from "../utils/time.js";

const METRICS_FILE = "runtime-metrics.json";
const AGENT_METRICS_DIR = "agent-metrics";

export class MetricsStore {
  constructor(
    private readonly projectRoot: string,
    private readonly runId: string,
  ) {}

  get filePath(): string {
    return path.join(runDir(this.projectRoot, this.runId), METRICS_FILE);
  }

  get agentDir(): string {
    return path.join(runDir(this.projectRoot, this.runId), AGENT_METRICS_DIR);
  }

  async exists(): Promise<boolean> {
    return pathExists(this.filePath);
  }

  async read(): Promise<RuntimeMetrics | null> {
    if (!(await this.exists())) return null;
    const raw = await readText(this.filePath);
    if (!raw.trim()) return null;
    try {
      const parsed = runtimeMetricsSchema.parse(JSON.parse(raw));
      return parsed;
    } catch {
      return null;
    }
  }

  async write(metrics: RuntimeMetrics): Promise<void> {
    const validated = runtimeMetricsSchema.parse({
      ...metrics,
      updatedAt: nowIso(),
    });
    await ensureDir(path.dirname(this.filePath));
    await writeText(this.filePath, `${JSON.stringify(validated, null, 2)}\n`);
  }

  async appendAgentMetrics(agent: AgentMetrics): Promise<RuntimeMetrics> {
    const current = (await this.read()) ?? null;
    if (!current) {
      throw new Error(
        `MetricsStore: cannot append agent metrics before initial write. runId=${this.runId}`,
      );
    }
    // Replace if already present (e.g. fixer loop reruns), otherwise append.
    const existingIdx = current.agents.findIndex(
      (a) => a.agentId === agent.agentId && a.stageId === agent.stageId && a.startedAt === agent.startedAt,
    );
    const nextAgents = [...current.agents];
    if (existingIdx >= 0) nextAgents[existingIdx] = agent;
    else nextAgents.push(agent);

    const recomputed = recomputeRunTotals({
      ...current,
      agents: nextAgents,
    });
    await this.write(recomputed);

    // Per-agent JSON for future UI deep-dives.
    await ensureDir(this.agentDir);
    const safeAgentId = agent.agentId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `${safeAgentId}-${agent.startedAt.replace(/[:.]/g, "-")}.json`;
    await writeText(
      path.join(this.agentDir, filename),
      `${JSON.stringify(agent, null, 2)}\n`,
    );

    return recomputed;
  }

  async update(mutator: (current: RuntimeMetrics) => RuntimeMetrics): Promise<RuntimeMetrics> {
    const current = (await this.read()) ?? null;
    if (!current) {
      throw new Error(
        `MetricsStore: cannot update metrics before initial write. runId=${this.runId}`,
      );
    }
    const next = mutator(current);
    await this.write(next);
    return next;
  }
}

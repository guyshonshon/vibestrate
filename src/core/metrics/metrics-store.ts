// Per-run metrics file store: runtime-metrics.json in the run directory, plus a
// per-role snapshot under agent-metrics/ beside it. Writes to
// runtime-metrics.json go through writeNow, which re-validates against
// runtimeMetricsSchema and restamps updatedAt; the per-role snapshot is written
// raw.
//
// The read-modify-write mutators go through `serialize`. That guard is per
// instance and in-process: two MetricsStore objects over the same run, or two
// processes, are not serialized against each other.
//
// appendRoleMetrics and update throw when the file is missing or unparseable
// rather than starting a fresh document, so a lost or corrupt metrics file
// surfaces instead of being quietly overwritten. appendRoleMetrics passes the
// updated role list through recomputeRunTotals; update does not, so a mutator
// that touches roles has to recompute totals itself.

import path from "node:path";
import { ensureDir, pathExists, readText, writeText } from "../../utils/fs.js";
import { runDir } from "../../utils/paths.js";
import {
  type RoleMetrics,
  type RuntimeMetrics,
  recomputeRunTotals,
  runtimeMetricsSchema,
} from "./runtime-metrics.js";
import { nowIso } from "../../utils/time.js";

const METRICS_FILE = "runtime-metrics.json";
const AGENT_METRICS_DIR = "agent-metrics";

export class MetricsStore {
  constructor(
    private readonly projectRoot: string,
    private readonly runId: string,
  ) {}

  // Serialize the read-modify-write mutators. A parallel review panel
  // runs several turns concurrently, each appending its own role metrics; an
  // unguarded read-modify-write would lose updates (last writer wins). This
  // promise-chain mutex serializes appendRoleMetrics/update/write per store.
  private writeQueue: Promise<unknown> = Promise.resolve();
  private serialize<T>(op: () => Promise<T>): Promise<T> {
    const next = this.writeQueue.then(op, op);
    // Keep the chain alive even if an op rejects (swallow here; caller still sees it).
    this.writeQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  get filePath(): string {
    return path.join(runDir(this.projectRoot, this.runId), METRICS_FILE);
  }

  get roleDir(): string {
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

  write(metrics: RuntimeMetrics): Promise<void> {
    return this.serialize(() => this.writeNow(metrics));
  }

  private async writeNow(metrics: RuntimeMetrics): Promise<void> {
    const validated = runtimeMetricsSchema.parse({
      ...metrics,
      updatedAt: nowIso(),
    });
    await ensureDir(path.dirname(this.filePath));
    await writeText(this.filePath, `${JSON.stringify(validated, null, 2)}\n`);
  }

  appendRoleMetrics(agent: RoleMetrics): Promise<RuntimeMetrics> {
    return this.serialize(() => this.appendRoleMetricsNow(agent));
  }

  private async appendRoleMetricsNow(agent: RoleMetrics): Promise<RuntimeMetrics> {
    const current = (await this.read()) ?? null;
    if (!current) {
      // The initial write is awaited at run start, so a missing file here means
      // the run directory was removed UNDERNEATH a live run - not that a write
      // was skipped. Say so: the old "before initial write" wording sent a
      // debugging pass after call ordering when the cause was another process
      // resetting the same project directory mid-flight.
      throw new Error(
        `MetricsStore: ${this.filePath} is missing for run ${this.runId}. It was written at run start; if it is gone, the run directory was deleted while the run was live (another process resetting or cleaning this project?).`,
      );
    }
    // Replace if already present (e.g. fixer loop reruns), otherwise append.
    const existingIdx = current.roles.findIndex(
      (a) => a.roleId === agent.roleId && a.stageId === agent.stageId && a.startedAt === agent.startedAt,
    );
    const nextRoles = [...current.roles];
    if (existingIdx >= 0) nextRoles[existingIdx] = agent;
    else nextRoles.push(agent);

    const recomputed = recomputeRunTotals({
      ...current,
      roles: nextRoles,
    });
    await this.writeNow(recomputed);

    // Per-agent JSON for future UI deep-dives.
    await ensureDir(this.roleDir);
    const safeRoleId = agent.roleId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `${safeRoleId}-${agent.startedAt.replace(/[:.]/g, "-")}.json`;
    await writeText(
      path.join(this.roleDir, filename),
      `${JSON.stringify(agent, null, 2)}\n`,
    );

    return recomputed;
  }

  update(mutator: (current: RuntimeMetrics) => RuntimeMetrics): Promise<RuntimeMetrics> {
    return this.serialize(async () => {
      const current = (await this.read()) ?? null;
      if (!current) {
        throw new Error(
          `MetricsStore: cannot update metrics before initial write. runId=${this.runId}`,
        );
      }
      const next = mutator(current);
      await this.writeNow(next);
      return next;
    });
  }
}

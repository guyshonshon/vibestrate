import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { writeJson } from "../utils/json.js";
import { makeRunId } from "../utils/run-id.js";
import { runDir } from "../utils/paths.js";
import { RunStateStore, type RunState } from "./state-machine.js";
import { resolveRunEntry } from "./detached-run.js";
import type { RunSpec } from "./run-launcher.js";

type RunStatus = RunState["status"];

// ── Concurrent multi-doc: N isolated `docs` runs, one process each ──────────
//
// "Handle several documents at once" for the docs fast track. Each document is a
// separate `docs`-flow run in its OWN worktree/branch/commit - the run boundary
// is the isolation boundary, so this needs no intra-run parallel-write engine
// (which the architecture forbids: parallel-group steps are resolve-time
// read-only, "one writer per worktree", flow-resolver.ts).
//
// Isolation is real ONLY because each run is a SEPARATE OS process
// (`run-entry.js`), never an in-process pool: the repo's atomic-write helpers key
// their temp files on `process.pid`, so two runs in one process would collide on
// a shared temp path (e.g. STATE.md.tmp.<pid>). Process-per-run keeps that
// invariant. Run ids are pre-assigned sequentially (disk + in-batch set) because
// makeRunId is not atomic with worktree creation - a tight mint loop would
// otherwise draw the same id twice.
//
// SCOPE of the isolation: worktrees never corrupt each other. It does NOT
// guarantee conflict-free MERGES. The overlap guard rejects two items that
// DECLARE the same targetPath, but it cannot police what an agent actually edits
// - and the `docs` flow tells the author to run `pnpm docs:generate`, which
// rewrites the shared `docs/generated/*`. So concurrent runs that change
// frontmatter/nav/structure can produce branches that conflict on regenerated
// metadata, resolved normally at merge. Pure-prose page edits (the common batch
// case) regenerate nothing, so they don't collide. This is a best-effort guard,
// not a merge-safety guarantee.

export type DocsBatchItem = {
  /** The instruction for this document's run (becomes the run's task brief). */
  task: string;
  /** Repo-relative doc path this run edits. Two items may NOT declare the same
   *  file (best-effort overlap guard). Omit for a free-form docs task - but then
   *  the overlap guard cannot protect it. */
  targetPath?: string;
};

export type DocsBatchOutcome = {
  runId: string;
  task: string;
  targetPath: string | null;
  /** Terminal run status read back from the run's state file. `"unknown"` when
   *  the run wrote no state (crashed before init, or the launcher was faked). */
  status: RunStatus | "unknown";
  branchName: string | null;
  /** Child exit code: 0 = terminal non-failed, 1 = failed/threw, other = signal
   *  or spawn error. */
  exitCode: number;
  error: string | null;
};

/** Launch ONE run to completion and resolve its exit code. Injectable so the
 *  batch's pooling/aggregation is testable without spawning real processes. */
export type DocsBatchLauncher = (
  spec: RunSpec,
  opts?: { signal?: AbortSignal },
) => Promise<number>;

export type PlannedDocsItem = { item: DocsBatchItem; runId: string };

const DEFAULT_CONCURRENCY = 4;
const MAX_ITEMS = 32;

/** Validate a batch and pre-assign a unique run id per item. Shared by the
 *  awaiting runner and the HTTP path so both enforce the same guards. Overlap
 *  and size checks fail fast (throw); id minting is sequential (disk + in-batch
 *  set) so a tight mint loop can't draw a duplicate. */
export function planDocsBatch(
  projectRoot: string,
  items: DocsBatchItem[],
): PlannedDocsItem[] {
  if (items.length === 0) {
    throw new Error("docs batch: no documents to process.");
  }
  if (items.length > MAX_ITEMS) {
    throw new Error(
      `docs batch: too many documents (${items.length} > ${MAX_ITEMS}).`,
    );
  }
  const seenTarget = new Set<string>();
  for (const it of items) {
    if (!it.targetPath) continue;
    const key = normalizeTarget(it.targetPath);
    if (seenTarget.has(key)) {
      throw new Error(
        `docs batch: two documents target the same path "${it.targetPath}". Each run must edit a distinct file.`,
      );
    }
    seenTarget.add(key);
  }
  const taken = new Set<string>();
  const isTaken = (id: string): boolean =>
    taken.has(id) || existsSync(runDir(projectRoot, id));
  return items.map((item) => {
    const runId = makeRunId(isTaken);
    taken.add(runId);
    return { item, runId };
  });
}

// Steer each batch run away from rebuilding the SHARED derived metadata. The
// `docs` flow tells a single-page author to run `pnpm docs:generate` (so a lone
// run keeps docs/generated/* in sync). Under concurrency that is exactly wrong:
// N branches each regenerating the same global JSON conflict at merge. So a batch
// run edits only its page; metadata is rebuilt ONCE after the batch is merged.
// This is a soft directive (model behavior), like the flow instruction it
// overrides - not an enforced path scope.
const BATCH_NO_REGEN =
  "\n\nThis page is one of several being revised concurrently. Edit ONLY the target file above. Do NOT run `pnpm docs:generate` or touch `docs/generated/*` - the docs metadata is rebuilt once after this batch is merged, so regenerating it per-run would only create merge conflicts across the parallel branches.";

function specFor(projectRoot: string, item: DocsBatchItem, runId: string): RunSpec {
  return {
    projectRoot,
    task: `${item.task}${BATCH_NO_REGEN}`,
    runId,
    flow: { id: "docs" },
    // Pin the docs flow: skip adaptive selection AND spec-up. Without this a
    // plan-worthy brief would be diverted to a read-only spec-up run
    // (run-launcher willSpecUp), so the batch "succeeds" while editing nothing.
    select: false,
  };
}

/** Run a pre-planned batch to completion with a bounded worker pool. The one
 *  concurrency chokepoint - the CLI and the HTTP background path both go through
 *  here, so neither can exceed the cap. */
export async function executeDocsBatch(input: {
  projectRoot: string;
  planned: PlannedDocsItem[];
  /** Max runs in flight at once (default 4). Clamped to [1, planned.length]. */
  concurrency?: number;
  launch?: DocsBatchLauncher;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
}): Promise<DocsBatchOutcome[]> {
  const { projectRoot, planned, signal } = input;
  if (planned.length === 0) return [];
  const concurrency = Math.max(
    1,
    Math.min(input.concurrency ?? DEFAULT_CONCURRENCY, planned.length),
  );
  const launch = input.launch ?? defaultDocsLauncher();
  const outcomes = new Array<DocsBatchOutcome>(planned.length);
  let cursor = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      if (signal?.aborted) return;
      const i = cursor++;
      if (i >= planned.length) return;
      const { item, runId } = planned[i]!;
      input.onProgress?.(
        `docs-batch: starting ${runId} (${item.targetPath ?? truncate(item.task)})`,
      );
      let exitCode = -1;
      let error: string | null = null;
      try {
        exitCode = await launch(specFor(projectRoot, item, runId), { signal });
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      const { status, branchName } = await readTerminalState(projectRoot, runId);
      outcomes[i] = {
        runId,
        task: item.task,
        targetPath: item.targetPath ?? null,
        status,
        branchName,
        exitCode,
        error,
      };
      input.onProgress?.(
        `docs-batch: ${runId} finished ${status} (exit ${exitCode})`,
      );
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return outcomes;
}

/** Plan + execute, awaited. The CLI path. */
export async function runDocsBatch(input: {
  projectRoot: string;
  items: DocsBatchItem[];
  concurrency?: number;
  launch?: DocsBatchLauncher;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
}): Promise<DocsBatchOutcome[]> {
  const planned = planDocsBatch(input.projectRoot, input.items);
  return executeDocsBatch({
    projectRoot: input.projectRoot,
    planned,
    concurrency: input.concurrency,
    launch: input.launch,
    signal: input.signal,
    onProgress: input.onProgress,
  });
}

function normalizeTarget(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.?\/+/, "").replace(/\/+$/, "");
}

function truncate(s: string): string {
  return s.length > 48 ? `${s.slice(0, 45)}...` : s;
}

async function readTerminalState(
  projectRoot: string,
  runId: string,
): Promise<{ status: RunStatus | "unknown"; branchName: string | null }> {
  try {
    const store = new RunStateStore(projectRoot, runId);
    if (!(await store.exists())) return { status: "unknown", branchName: null };
    const st = await store.read();
    return { status: st.status, branchName: st.branchName };
  } catch {
    // A run that wrote a malformed/partial state reads as unknown, not a throw -
    // one bad run must not sink the batch's aggregation.
    return { status: "unknown", branchName: null };
  }
}

/** The real launcher: spawn `run-entry.js <specFile>` as its OWN process and
 *  resolve on exit. Separate process per run keeps the pid-keyed atomic-write
 *  invariant (see file header). Non-detached so it can be awaited AND killed:
 *  on abort the child is terminated rather than orphaned. */
function defaultDocsLauncher(): DocsBatchLauncher {
  const entry = resolveRunEntry();
  return (spec, opts) =>
    new Promise<number>((resolve, reject) => {
      if (opts?.signal?.aborted) {
        resolve(130);
        return;
      }
      const specPath = path.join(
        spec.projectRoot,
        ".vibestrate",
        `.docs-batch-${spec.runId}-${randomUUID().slice(0, 8)}.json`,
      );
      writeJson(specPath, spec)
        .then(() => {
          const child = spawn(process.execPath, [entry, specPath], {
            cwd: spec.projectRoot,
            env: {
              ...process.env,
              VIBESTRATE_SPAWNED_BY: "docs-batch",
              NO_COLOR: "1",
            },
            stdio: "ignore",
          });
          const onAbort = (): void => {
            child.kill("SIGTERM");
          };
          opts?.signal?.addEventListener("abort", onAbort, { once: true });
          child.on("exit", (code, sig) => {
            opts?.signal?.removeEventListener("abort", onAbort);
            resolve(code ?? (sig ? 130 : -1));
          });
          child.on("error", (err) => {
            opts?.signal?.removeEventListener("abort", onAbort);
            reject(err);
          });
        })
        .catch(reject);
    });
}

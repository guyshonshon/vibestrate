// Review harvested code TODOs and promote the real ones onto the Board.
//
// This is the on-ramp for a project that is already underway: instead of
// starting at an empty Board, you start from the work your own code already
// says it needs.
//
// ── The view is COMPUTED, never persisted ────────────────────────────────────
//
//   promotable = harvest.items
//              - anything whose fingerprint is already on a Task.source
//              - anything in dismissed.json
//              - anything below the substance bar (lowSignal)
//
// Nothing about promotion state is written down. The BOARD is the ledger, via
// `Task.source.fingerprint`, which means there is no second record that can
// drift out of sync with the harvest and no reconciliation step anyone can
// forget. It also self-heals: delete a card and its TODO returns as promotable.
//
// The one durable file is `dismissed.json`, because "not this one" is a human
// decision that has to survive `vibe learn` clobbering the harvest. Without it a
// noisy TODO re-offers on every scan and the only way to silence it is to
// promote-then-delete, which pollutes the Board.
//
// ── Failure is per item, not all-or-nothing ──────────────────────────────────
//
// Promote 12 with one bad apple and you get 11 cards plus a report, not zero
// cards. Harvested TODOs are independent - unlike a planner proposal there are
// no dependency edges between them, so there is no consistent-set property that
// a rollback would be protecting. All-or-nothing would only mean losing 11 good
// cards to one bad one.

import { promises as fs } from "node:fs";
import { z } from "zod";
import { ensureDir, pathExists, writeTextAtomic } from "../utils/fs.js";
import { withFileMutex } from "../utils/file-mutex.js";
import { nowIso } from "../utils/time.js";
import {
  roadmapTodosDir,
  roadmapTodosDismissedFile,
} from "../utils/paths.js";
import {
  loadTodoHarvest,
  type HarvestedTodo,
  type TodosFile,
} from "../project/todo-harvest.js";
import { RoadmapService } from "./roadmap-service.js";
import type { Priority } from "./roadmap-types.js";

export class TodoPromoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TodoPromoteError";
  }
}

// ── dismissals ───────────────────────────────────────────────────────────────

export const todoDismissalFileSchema = z.object({
  schemaVersion: z.literal(1),
  dismissed: z.array(
    z.object({
      fingerprint: z.string().min(1).max(64),
      dismissedAt: z.string(),
      /** Denormalized so the dismissed list stays legible after a re-scan drops
       *  the entry from the harvest entirely. */
      title: z.string().max(100),
    }),
  ),
});
export type TodoDismissalFile = z.infer<typeof todoDismissalFileSchema>;

const EMPTY_DISMISSALS: TodoDismissalFile = { schemaVersion: 1, dismissed: [] };

/**
 * Read the dismissal file.
 *
 * Unlike the harvest, a corrupt dismissal file FAILS LOUDLY. The harvest is a
 * regenerable cache, so "absent, regenerate" is the right degradation there. A
 * dismissal is a human decision that cannot be recomputed, so silently treating
 * a damaged file as empty would resurrect every TODO the user already rejected.
 */
export async function readDismissals(
  projectRoot: string,
): Promise<TodoDismissalFile> {
  const file = roadmapTodosDismissedFile(projectRoot);
  if (!(await pathExists(file))) return { ...EMPTY_DISMISSALS, dismissed: [] };
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (err) {
    throw new TodoPromoteError(
      `Could not read dismissed TODOs at ${file}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new TodoPromoteError(
      `Dismissed TODOs at ${file} is not valid JSON. It records decisions that cannot be recomputed, so it is not discarded automatically - repair or delete it.`,
    );
  }
  const result = todoDismissalFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new TodoPromoteError(
      `Dismissed TODOs at ${file} does not match the expected shape: ${result.error.issues.map((i) => i.message).join("; ")}`,
    );
  }
  return result.data;
}

async function writeDismissals(
  projectRoot: string,
  next: TodoDismissalFile,
): Promise<void> {
  await ensureDir(roadmapTodosDir(projectRoot));
  await writeTextAtomic(
    roadmapTodosDismissedFile(projectRoot),
    `${JSON.stringify(next, null, 2)}\n`,
  );
}

// ── the computed view ────────────────────────────────────────────────────────

export type TodoState = "promotable" | "on_board" | "dismissed";

export type TodoView = HarvestedTodo & {
  state: TodoState;
  /** Set when `state === "on_board"`, so the UI can link to the card. */
  taskId: string | null;
  dismissedAt: string | null;
};

export type TodoOverview = {
  present: boolean;
  stale: boolean;
  generatedAt: string | null;
  truncated: boolean;
  notes: string[];
  items: TodoView[];
  counts: {
    promotable: number;
    onBoard: number;
    dismissed: number;
    lowSignal: number;
  };
};

const EMPTY_OVERVIEW: TodoOverview = {
  present: false,
  stale: false,
  generatedAt: null,
  truncated: false,
  notes: [],
  items: [],
  counts: { promotable: 0, onBoard: 0, dismissed: 0, lowSignal: 0 },
};

/** Pure: fold the three inputs into one view. Exported so the derivation can be
 *  tested without touching disk. */
export function buildTodoView(
  harvest: TodosFile,
  boardFingerprints: Map<string, string>,
  dismissed: Map<string, string>,
): TodoView[] {
  return harvest.items.map((item) => {
    const taskId = boardFingerprints.get(item.fingerprint) ?? null;
    const dismissedAt = dismissed.get(item.fingerprint) ?? null;
    // Precedence matters: a card that exists wins over a dismissal, so a TODO
    // that was dismissed and later promoted anyway reads as on_board rather
    // than hiding in the dismissed tab.
    const state: TodoState = taskId
      ? "on_board"
      : dismissedAt
        ? "dismissed"
        : "promotable";
    return { ...item, state, taskId, dismissedAt };
  });
}

/** Map of harvest fingerprint -> task id for every card promoted from a TODO. */
export function boardFingerprintsOf(
  tasks: Array<{ id: string; source: unknown }>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const task of tasks) {
    const source = task.source as { kind?: string; fingerprint?: string } | null;
    if (!source || source.kind !== "code-todo" || !source.fingerprint) continue;
    // First writer wins: if two cards somehow carry the same fingerprint, the
    // view still resolves to one, and the duplicate is visible on the Board.
    if (!out.has(source.fingerprint)) out.set(source.fingerprint, task.id);
  }
  return out;
}

export class TodoPromoteService {
  private readonly roadmap: RoadmapService;

  constructor(private readonly projectRoot: string) {
    this.roadmap = new RoadmapService(projectRoot);
  }

  /** The full review surface: every harvested TODO with its derived state. */
  async overview(): Promise<TodoOverview> {
    const loaded = await loadTodoHarvest(this.projectRoot);
    if (!loaded.present || !loaded.harvest) return { ...EMPTY_OVERVIEW };

    const [tasks, dismissals] = await Promise.all([
      this.roadmap.listTasks(),
      readDismissals(this.projectRoot),
    ]);

    const board = boardFingerprintsOf(tasks);
    const dismissed = new Map(
      dismissals.dismissed.map((d) => [d.fingerprint, d.dismissedAt]),
    );
    const items = buildTodoView(loaded.harvest, board, dismissed);

    return {
      present: true,
      stale: loaded.stale,
      generatedAt: loaded.harvest.generatedAt,
      truncated: loaded.harvest.truncated,
      notes: loaded.harvest.notes,
      items,
      counts: {
        // A low-signal TODO is never promotable, whatever its state.
        promotable: items.filter((t) => t.state === "promotable" && !t.lowSignal)
          .length,
        onBoard: items.filter((t) => t.state === "on_board").length,
        dismissed: items.filter((t) => t.state === "dismissed").length,
        lowSignal: items.filter((t) => t.lowSignal).length,
      },
    };
  }

  // ── promote ────────────────────────────────────────────────────────────────

  async promote(input: {
    selections: Array<{
      fingerprint: string;
      overrides?: { title?: string; priority?: Priority };
    }>;
  }): Promise<TodoPromoteResult> {
    const promoted: TodoPromoteResult["promoted"] = [];
    const failed: TodoPromoteResult["failed"] = [];
    const skipped: TodoPromoteResult["skipped"] = [];

    const loaded = await loadTodoHarvest(this.projectRoot);
    if (!loaded.present || !loaded.harvest) {
      throw new TodoPromoteError(
        "No TODO harvest yet. Run `vibe learn` to scan the codebase first.",
      );
    }
    const byFingerprint = new Map(
      loaded.harvest.items.map((t) => [t.fingerprint, t]),
    );

    const dismissed = new Set(
      (await readDismissals(this.projectRoot)).dismissed.map((d) => d.fingerprint),
    );

    for (const selection of input.selections) {
      const todo = byFingerprint.get(selection.fingerprint);
      if (!todo) {
        skipped.push({ fingerprint: selection.fingerprint, reason: "unknown" });
        continue;
      }
      if (dismissed.has(todo.fingerprint)) {
        skipped.push({ fingerprint: todo.fingerprint, reason: "dismissed" });
        continue;
      }

      // Re-check the Board per item rather than once up front: two promotes
      // racing on the same TODO must produce one card and one skip, not two
      // duplicate cards.
      const onBoard = boardFingerprintsOf(await this.roadmap.listTasks());
      if (onBoard.has(todo.fingerprint)) {
        skipped.push({ fingerprint: todo.fingerprint, reason: "already_on_board" });
        continue;
      }

      // The isolation boundary. One bad item degrades to a reported failure and
      // the rest of the batch still lands.
      try {
        const title = (selection.overrides?.title ?? todo.suggestedTitle).trim();
        if (!title) {
          throw new TodoPromoteError("Title cannot be empty.");
        }
        const task = await this.roadmap.addTask({
          title,
          description: `From \`${todo.path}:${todo.line}\`\n\n    ${todo.raw}`,
          priority: selection.overrides?.priority ?? todo.suggestedPriority,
          riskLevel: todo.suggestedPriority,
          touchedFiles: [todo.path],
          source: {
            kind: "code-todo",
            path: todo.path,
            line: todo.line,
            marker: todo.marker,
            fingerprint: todo.fingerprint,
          },
        });
        promoted.push({
          fingerprint: todo.fingerprint,
          taskId: task.id,
          title: task.title,
        });
      } catch (err) {
        failed.push({
          fingerprint: todo.fingerprint,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { promoted, failed, skipped };
  }

  // ── dismiss ────────────────────────────────────────────────────────────────

  /** Record "not this one". Reversible, never auto-purged, and idempotent: a
   *  second dismiss of the same fingerprint keeps the first timestamp. */
  async dismiss(fingerprints: string[]): Promise<TodoDismissalFile> {
    return this.mutateDismissals((current, titles) => {
      const known = new Set(current.dismissed.map((d) => d.fingerprint));
      const additions = fingerprints
        .filter((f) => !known.has(f))
        .map((fingerprint) => ({
          fingerprint,
          dismissedAt: nowIso(),
          title: titles.get(fingerprint) ?? "",
        }));
      return { ...current, dismissed: [...current.dismissed, ...additions] };
    });
  }

  async undismiss(fingerprints: string[]): Promise<TodoDismissalFile> {
    const drop = new Set(fingerprints);
    return this.mutateDismissals((current) => ({
      ...current,
      dismissed: current.dismissed.filter((d) => !drop.has(d.fingerprint)),
    }));
  }

  /**
   * Read-modify-write under the same `<file>.lock` mutex convention the rest of
   * the roadmap uses, so two concurrent dismisses cannot lose one another's
   * decision. The lock is a SIBLING file: locking the data file itself would
   * write lock metadata over the decisions being protected.
   */
  private async mutateDismissals(
    transform: (
      current: TodoDismissalFile,
      titles: Map<string, string>,
    ) => TodoDismissalFile,
  ): Promise<TodoDismissalFile> {
    await ensureDir(roadmapTodosDir(this.projectRoot));
    const file = roadmapTodosDismissedFile(this.projectRoot);
    return withFileMutex(`${file}.lock`, async () => {
      // Denormalized titles come from the harvest, read inside the lock so a
      // concurrent `vibe learn` cannot splice a half-written file in.
      const loaded = await loadTodoHarvest(this.projectRoot);
      const titles = new Map(
        (loaded.harvest?.items ?? []).map((t) => [t.fingerprint, t.suggestedTitle]),
      );
      const current = await readDismissals(this.projectRoot);
      const next = transform(current, titles);
      await writeDismissals(this.projectRoot, next);
      return next;
    });
  }
}

export type TodoPromoteResult = {
  promoted: Array<{ fingerprint: string; taskId: string; title: string }>;
  failed: Array<{ fingerprint: string; reason: string }>;
  skipped: Array<{
    fingerprint: string;
    reason: "already_on_board" | "dismissed" | "unknown";
  }>;
};

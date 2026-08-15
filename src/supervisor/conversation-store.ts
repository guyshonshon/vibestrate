// ── Supervisor conversation store ───────────────────────────────────────────
//
// Consult answers one question and forgets it. That is fine for "what would you
// do here", and useless for a supervisor you work alongside: every follow-up
// re-explains the project, and nothing the supervisor decided five minutes ago
// survives. This is the durable half - one file per thread, messages appended in
// order, so a conversation can be resumed, reread, and audited.
//
// Threads are project state, not run state: they live under
// `.vibestrate/supervisor/threads/`, outlive any single run, and reference runs
// and tasks by id rather than embedding them.
//
// Writes go through withFileMutex because two browser tabs (or a tab and the
// CLI) appending at once would otherwise read-modify-write over each other and
// silently drop a message. The lock is the same link-based one the approval
// service uses, and it is NOT reentrant - never call a locking method from
// inside another one.

import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ensureDir, pathExists, readDirSafe, readText, writeText } from "../utils/fs.js";
import { withFileMutex } from "../utils/file-mutex.js";
import { supervisorThreadPath, supervisorThreadsDir } from "../utils/paths.js";
import { safeIdSchema } from "../roadmap/roadmap-types.js";
import { nowIso } from "../utils/time.js";
import { answerActionsField, type AnswerAction } from "../core/assist/answer-actions.js";

/** Who produced a message. `system` covers notes the product writes into the
 *  thread on the user's behalf (a run finished, an action was undone), which
 *  read as part of the conversation but were nobody's utterance. */
export const supervisorMessageRoleSchema = z.enum(["user", "supervisor", "system"]);
export type SupervisorMessageRole = z.infer<typeof supervisorMessageRoleSchema>;

/**
 * What the supervisor did as a result of a message, recorded ON the message that
 * caused it.
 *
 * This exists so the thread is the audit trail, not just a chat log. A
 * supervisor that can act has to be answerable for it: every action shows up
 * inline, names what it touched, and carries enough to undo it where undo is
 * possible. `undone` is set in place rather than deleting the record, because
 * "it did this and I took it back" is the history you want to keep.
 */
export const supervisorActionRecordSchema = z.object({
  /** Intent the router resolved. Kept as a plain string rather than an enum so
   *  the store does not need a release every time the router learns a verb. */
  intent: z.string().min(1).max(64),
  /** Human-readable one-liner: "added 3 TODOs to Landing page". */
  summary: z.string().min(1).max(600),
  /** What it touched, for the undo path and for the UI to link to. */
  targetKind: z.enum(["task", "checklist", "queue", "run", "none"]).default("none"),
  targetId: z.string().max(200).nullable().default(null),
  /** False when the action was refused (policy, validation, a failed write).
   *  A refused action still belongs in the thread - silently dropping it is how
   *  someone ends up believing work was queued that never was. */
  ok: z.boolean().default(true),
  /** Why it was refused, when it was. */
  error: z.string().max(2000).nullable().default(null),
  undone: z.boolean().default(false),
});
export type SupervisorActionRecord = z.infer<typeof supervisorActionRecordSchema>;

export const supervisorMessageSchema = z.object({
  id: z.string().min(1),
  role: supervisorMessageRoleSchema,
  text: z.string().max(200_000),
  createdAt: z.string(),
  /** Set on the supervisor message that carried out an action. */
  action: supervisorActionRecordSchema.nullable().default(null),
  /**
   * Buttons offered under an answer: a follow-up to drop in the composer, or a
   * page to open. Distinct from `action` above, which records what the
   * supervisor ALREADY DID; these are offers the user has not taken, and
   * taking one still writes nothing by itself (answer-actions.ts holds the
   * invariant and the validation).
   */
  answerActions: answerActionsField,
  /** True when the turn was stopped before the supervisor finished. The text is
   *  whatever had genuinely arrived by then, so a reopened conversation cannot
   *  read a half answer as a complete one. */
  stopped: z.boolean().default(false),
});
export type SupervisorMessage = z.infer<typeof supervisorMessageSchema>;

export const supervisorThreadSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  id: z.string().min(1),
  /** Short label for the thread list. Derived from the first user message. */
  title: z.string().max(200).default("New conversation"),
  /**
   * The run this conversation is about, or null for a project-level thread.
   *
   * Scoping lives on the THREAD rather than being a filter applied at read
   * time, because runs are genuinely concurrent: `scheduler.maxConcurrentRuns`
   * is only consulted by the queue picker, so `vibe run` and the dashboard
   * launch as many as you ask for, and a run with no task takes no lock at all.
   * With one shared conversation, "do it" has no referent while three runs are
   * live, and the transcript afterwards cannot say which run you meant.
   */
  runId: z.string().max(200).nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
  messages: z.array(supervisorMessageSchema).default([]),
});
export type SupervisorThread = z.infer<typeof supervisorThreadSchema>;

/** Title a thread from its opening message, so the list is readable without the
 *  user naming anything. */
export function deriveThreadTitle(firstMessage: string): string {
  const flat = firstMessage.replace(/\s+/g, " ").trim();
  if (!flat) return "New conversation";
  return flat.length <= 60 ? flat : `${flat.slice(0, 57)}...`;
}

export class SupervisorConversationStore {
  constructor(private readonly projectRoot: string) {}

  /** The one place a thread id becomes a filesystem path, so it is the one
   *  place the id has to be checked. The id arrives from the URL - `POST
   *  /api/supervisor/threads/:threadId/messages` - and lands in `path.join`,
   *  so an id of `../../..` would read and WRITE outside the project. Every
   *  read, append and write goes through here; nothing else builds the path. */
  private threadPath(threadId: string): string {
    const parsed = safeIdSchema.safeParse(threadId);
    if (!parsed.success) {
      throw new Error(`Not a valid conversation id: ${JSON.stringify(threadId).slice(0, 80)}`);
    }
    return supervisorThreadPath(this.projectRoot, parsed.data);
  }

  /** Read one thread, or null when it does not exist. A thread that will not
   *  parse is treated as absent rather than throwing: a corrupt chat log must
   *  not take down the panel that would let you start a new one. */
  async read(threadId: string): Promise<SupervisorThread | null> {
    const file = this.threadPath(threadId);
    if (!(await pathExists(file))) return null;
    try {
      return supervisorThreadSchema.parse(JSON.parse(await readText(file)));
    } catch {
      return null;
    }
  }

  /** Threads newest-first. Unreadable files are skipped, one bad file never
   *  hides the rest. */
  async list(): Promise<SupervisorThread[]> {
    const dir = supervisorThreadsDir(this.projectRoot);
    const entries = await readDirSafe(dir);
    const out: SupervisorThread[] = [];
    for (const name of entries) {
      if (!name.endsWith(".json")) continue;
      const thread = await this.read(path.basename(name, ".json"));
      if (thread) out.push(thread);
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async create(runId: string | null = null): Promise<SupervisorThread> {
    const ts = nowIso();
    const thread: SupervisorThread = {
      schemaVersion: 1,
      id: randomUUID(),
      title: "New conversation",
      runId,
      createdAt: ts,
      updatedAt: ts,
      messages: [],
    };
    await this.writeThread(thread);
    return thread;
  }

  /** The newest thread for a run, or a fresh one. The panel opens straight into
   *  the conversation about the run you are looking at. */
  async forRun(runId: string): Promise<SupervisorThread> {
    const existing = (await this.list()).find((t) => t.runId === runId);
    return existing ?? (await this.create(runId));
  }

  /**
   * Append a message. Returns the updated thread.
   *
   * The read happens INSIDE the lock: reading first and writing after would let
   * a concurrent append land between the two and be overwritten, which is the
   * exact bug that makes a chat drop messages under two open tabs.
   */
  async append(
    threadId: string,
    message: {
      role: SupervisorMessageRole;
      text: string;
      /** Present only on a supervisor message that carried out an action. */
      action?: SupervisorActionRecord | null;
      /** Already validated by parseAnswerActions; re-checked structurally here. */
      answerActions?: AnswerAction[];
      /** Set when the turn was cut short; the text is how far it got. */
      stopped?: boolean;
      id?: string;
      createdAt?: string;
    },
  ): Promise<SupervisorThread> {
    const file = this.threadPath(threadId);
    return withFileMutex(`${file}.lock`, async () => {
      const current = (await this.read(threadId)) ?? {
        schemaVersion: 1 as const,
        id: threadId,
        title: "New conversation",
        runId: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        messages: [],
      };
      const full: SupervisorMessage = supervisorMessageSchema.parse({
        id: message.id ?? randomUUID(),
        role: message.role,
        text: message.text,
        createdAt: message.createdAt ?? nowIso(),
        action: message.action ?? null,
        answerActions: message.answerActions ?? [],
        stopped: message.stopped ?? false,
      });
      const messages = [...current.messages, full];
      const title =
        current.title === "New conversation" && full.role === "user"
          ? deriveThreadTitle(full.text)
          : current.title;
      const next: SupervisorThread = {
        ...current,
        title,
        messages,
        updatedAt: full.createdAt,
      };
      await this.writeThread(next);
      return next;
    });
  }

  /** Mark a recorded action as undone. Same in-lock read as `append`. */
  async markActionUndone(threadId: string, messageId: string): Promise<SupervisorThread | null> {
    const file = this.threadPath(threadId);
    return withFileMutex(`${file}.lock`, async () => {
      const current = await this.read(threadId);
      if (!current) return null;
      const next: SupervisorThread = {
        ...current,
        updatedAt: nowIso(),
        messages: current.messages.map((m) =>
          m.id === messageId && m.action
            ? { ...m, action: { ...m.action, undone: true } }
            : m,
        ),
      };
      await this.writeThread(next);
      return next;
    });
  }

  private async writeThread(thread: SupervisorThread): Promise<void> {
    const validated = supervisorThreadSchema.parse(thread);
    const file = this.threadPath(validated.id);
    await ensureDir(path.dirname(file));
    await writeText(file, `${JSON.stringify(validated, null, 2)}\n`);
  }
}

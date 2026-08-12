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
import { nowIso } from "../utils/time.js";

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
});
export type SupervisorMessage = z.infer<typeof supervisorMessageSchema>;

export const supervisorThreadSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  id: z.string().min(1),
  /** Short label for the thread list. Derived from the first user message. */
  title: z.string().max(200).default("New conversation"),
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

  private threadPath(threadId: string): string {
    return supervisorThreadPath(this.projectRoot, threadId);
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

  async create(): Promise<SupervisorThread> {
    const ts = nowIso();
    const thread: SupervisorThread = {
      schemaVersion: 1,
      id: randomUUID(),
      title: "New conversation",
      createdAt: ts,
      updatedAt: ts,
      messages: [],
    };
    await this.writeThread(thread);
    return thread;
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
    message: Omit<SupervisorMessage, "id" | "createdAt"> &
      Partial<Pick<SupervisorMessage, "id" | "createdAt">>,
  ): Promise<SupervisorThread> {
    const file = this.threadPath(threadId);
    return withFileMutex(`${file}.lock`, async () => {
      const current = (await this.read(threadId)) ?? {
        schemaVersion: 1 as const,
        id: threadId,
        title: "New conversation",
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

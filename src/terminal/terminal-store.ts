import { ensureDir, pathExists, readText, writeText } from "../utils/fs.js";
import { terminalDir, terminalSessionsFile } from "../utils/paths.js";
import {
  terminalSessionsFileSchema,
  type TerminalSession,
} from "./terminal-types.js";

/**
 * Disk-backed registry of terminal sessions. Append-or-update by id; never
 * deletes rows so an audit of "what shells were opened against this project"
 * is preserved. Empty / malformed file is treated as empty — terminal is a
 * best-effort feature, a corrupt store should not poison startup.
 *
 * Writes (`upsert`, `write`) are serialized through an in-memory queue per
 * store instance. The service issues `upsert` from both `close()` and the
 * fire-and-forget `onExit` handler; without serialization those can race
 * and leave `sessions.json` in a half-written state that fails `JSON.parse`.
 * Same-process callers (CLI + server in two different processes) still race
 * with each other, but neither path is hot enough for that to matter in V0.
 */
export class TerminalSessionStore {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly projectRoot: string) {}

  get filePath(): string {
    return terminalSessionsFile(this.projectRoot);
  }

  async readAll(): Promise<TerminalSession[]> {
    if (!(await pathExists(this.filePath))) return [];
    try {
      const text = await readText(this.filePath);
      if (!text.trim()) return [];
      const parsed = terminalSessionsFileSchema.safeParse(JSON.parse(text));
      return parsed.success ? parsed.data.sessions : [];
    } catch {
      return [];
    }
  }

  async upsert(session: TerminalSession): Promise<void> {
    return this.enqueueWrite(async () => {
      const all = await this.readAll();
      const idx = all.findIndex((s) => s.id === session.id);
      if (idx < 0) all.push(session);
      else all[idx] = session;
      await this.writeNow(all);
    });
  }

  async write(sessions: TerminalSession[]): Promise<void> {
    return this.enqueueWrite(async () => this.writeNow(sessions));
  }

  private async writeNow(sessions: TerminalSession[]): Promise<void> {
    await ensureDir(terminalDir(this.projectRoot));
    await writeText(
      this.filePath,
      `${JSON.stringify({ sessions }, null, 2)}\n`,
    );
  }

  private enqueueWrite(work: () => Promise<void>): Promise<void> {
    const next = this.writeQueue.then(work, work);
    // Swallow rejections on the chain so one failed write doesn't poison
    // every subsequent one. Individual callers still see their own error
    // via the returned promise.
    this.writeQueue = next.catch(() => undefined);
    return next;
  }
}

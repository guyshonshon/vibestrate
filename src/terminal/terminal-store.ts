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
 */
export class TerminalSessionStore {
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
    const all = await this.readAll();
    const idx = all.findIndex((s) => s.id === session.id);
    if (idx < 0) all.push(session);
    else all[idx] = session;
    await this.write(all);
  }

  async write(sessions: TerminalSession[]): Promise<void> {
    await ensureDir(terminalDir(this.projectRoot));
    await writeText(
      this.filePath,
      `${JSON.stringify({ sessions }, null, 2)}\n`,
    );
  }
}

// Per-run terminal sessions.
import { jsonGet, jsonPost } from "./http.js";
import type {
  TerminalAvailability,
  TerminalSession,
} from "../types.js";

export const terminalApi = {
  async getTerminalAvailability(): Promise<TerminalAvailability> {
    return jsonGet("/api/terminal/availability");
  },
  async listTerminalSessions(): Promise<TerminalSession[]> {
    const r = await jsonGet<{ sessions: TerminalSession[] }>(
      "/api/terminal/sessions",
    );
    return r.sessions;
  },
  async createTerminalSession(input: {
    runId: string;
    cols: number;
    rows: number;
  }): Promise<TerminalSession> {
    const r = await jsonPost<{ session: TerminalSession }>(
      "/api/terminal/sessions",
      input,
    );
    return r.session;
  },
  async resizeTerminalSession(input: {
    id: string;
    cols: number;
    rows: number;
  }): Promise<void> {
    await jsonPost(
      `/api/terminal/sessions/${encodeURIComponent(input.id)}/resize`,
      { cols: input.cols, rows: input.rows },
    );
  },
  async closeTerminalSession(id: string): Promise<TerminalSession> {
    const r = await jsonPost<{ session: TerminalSession }>(
      `/api/terminal/sessions/${encodeURIComponent(id)}/close`,
    );
    return r.session;
  },
};

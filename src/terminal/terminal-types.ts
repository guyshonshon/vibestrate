import { z } from "zod";

/**
 * Persisted metadata about a terminal session. We deliberately do NOT
 * persist transcripts, command history, or environment. The dashboard
 * exposes an interactive shell — its output is the user's responsibility
 * and Vibestrate neither records it nor sends it anywhere.
 *
 * Closed sessions stay in the file as audit trail (id, runId, cwd,
 * createdAt, closedAt, exitCode) until pruned.
 */
export const terminalSessionSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^tm-[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/, "invalid session id"),
  runId: z.string().min(1),
  /** Absolute path of the run's worktree. Always validated == state.json's
   *  worktreePath; not user-supplied. */
  cwd: z.string().min(1),
  cols: z.number().int().positive().max(1024),
  rows: z.number().int().positive().max(1024),
  /** Absolute path of the shell binary actually spawned. */
  shell: z.string().min(1),
  createdAt: z.string().min(1),
  closedAt: z.string().nullable().default(null),
  exitCode: z.number().int().nullable().default(null),
});
export type TerminalSession = z.infer<typeof terminalSessionSchema>;

export const terminalSessionsFileSchema = z.object({
  sessions: z.array(terminalSessionSchema).default([]),
});

export type CreateSessionInput = {
  runId: string;
  cols: number;
  rows: number;
};

export type TerminalAvailability = {
  /** policies.allowInteractiveTerminal */
  policyEnabled: boolean;
  /** node-pty resolves at runtime */
  driverAvailable: boolean;
  /** Human-readable explanation when either is false. */
  reason: string | null;
};

/**
 * A live PTY handle. The service holds these in-memory; on server restart
 * they vanish (sessions.json marks any orphans as closed). The driver
 * abstraction keeps tests free of native code.
 */
export interface TerminalProcess {
  readonly pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  /** Returns an unsubscribe function. */
  onData(cb: (chunk: string) => void): () => void;
  /** Returns an unsubscribe function. */
  onExit(
    cb: (info: { exitCode: number; signal: number | null }) => void,
  ): () => void;
}

export type DriverSpawnOpts = {
  shell: string;
  cwd: string;
  cols: number;
  rows: number;
  /** Tight env: never the full process env. */
  env: Record<string, string>;
};

export interface TerminalDriver {
  /** Whether the driver can actually spawn. False on missing native bindings. */
  readonly available: boolean;
  readonly unavailableReason: string | null;
  spawn(opts: DriverSpawnOpts): TerminalProcess;
}

export class TerminalError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "TerminalError";
  }
}

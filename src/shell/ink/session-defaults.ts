// Pure helpers for the shell's session context. Import-free so they run
// under the node-only Vitest environment.
import type { SessionState } from "./ui-state.js";

/**
 * Seed a prompt-entered `vibe …` argv with the session's Crew / Flow / mode
 * so the status-bar selections actually shape the next run. Only `run`
 * commands are touched, and only for flags the user didn't already pass —
 * an explicit `--crew`/`--flow`/`--read-only` on the line always wins.
 */
export function applySessionDefaults(
  argv: readonly string[],
  session: SessionState,
): string[] {
  const out = [...argv];
  if (out[0] !== "run") return out;
  const has = (flag: string) => out.includes(flag);
  if (session.crewId && !has("--crew")) out.push("--crew", session.crewId);
  if (session.flowId && !has("--flow")) out.push("--flow", session.flowId);
  if (session.mode === "read-only" && !has("--read-only")) out.push("--read-only");
  return out;
}

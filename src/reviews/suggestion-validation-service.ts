import path from "node:path";
import { execa } from "execa";
import { ensureDir, pathExists, writeText } from "../utils/fs.js";
import { runDir } from "../utils/paths.js";
import { nowIso } from "../utils/time.js";

export type SuggestionValidationCommand = {
  command: string;
  exitCode: number;
  durationMs: number;
  status: "passed" | "failed";
  /** First 4 KB of stdout (we never persist the full stream to avoid bloating the run). */
  stdoutHead: string;
  /** First 4 KB of stderr. */
  stderrHead: string;
};

export type SuggestionValidationResult = {
  /** "suggestion:<id>" or "bundle:<id>". */
  scope: string;
  scopeKind: "suggestion" | "bundle";
  scopeId: string;
  runId: string;
  worktreePath: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  status: "passed" | "failed" | "no_commands_configured";
  summary: { total: number; passed: number; failed: number };
  commands: SuggestionValidationCommand[];
  /** Path to the persisted JSON inside .amaco/runs/<runId>/. */
  resultPath: string;
  /** Which validation profile was used. "default" means commands.validate. */
  profileName: string;
  /** Where that profile choice came from. */
  profileSource:
    | "default"
    | "named"
    | "suggestion"
    | "bundle"
    | "override";
  /** Resolved command list — what actually ran (or would have run). */
  profileCommands: string[];
};

const TIMEOUT_PER_COMMAND_MS = 5 * 60_000;
const STREAM_HEAD_BYTES = 4 * 1024;

function suggestionValidationDir(projectRoot: string, runId: string): string {
  return path.join(runDir(projectRoot, runId), "suggestion-validations");
}

function bundleValidationDir(projectRoot: string, runId: string): string {
  return path.join(runDir(projectRoot, runId), "suggestion-bundle-validations");
}

export class SuggestionValidationError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "SuggestionValidationError";
  }
}

export type RunValidationInput = {
  projectRoot: string;
  runId: string;
  worktreePath: string;
  /** Resolved command list (already chosen via the validation profile resolver). */
  commands: readonly string[];
  scope:
    | { kind: "suggestion"; suggestionId: string }
    | { kind: "bundle"; bundleId: string };
  /** Which profile was used. "default" means commands.validate. */
  profileName?: string;
  profileSource?:
    | "default"
    | "named"
    | "suggestion"
    | "bundle"
    | "override";
};

/**
 * Run the project's configured `commands.validate` array inside the run's
 * worktree. Persists a structured result file under the run dir and returns
 * a typed summary. Refuses gracefully when the worktree is missing or no
 * commands are configured — never invents validation success.
 */
export async function runSuggestionValidation(
  input: RunValidationInput,
): Promise<SuggestionValidationResult> {
  if (!(await pathExists(input.worktreePath))) {
    throw new SuggestionValidationError(
      409,
      "Run worktree no longer exists; cannot validate.",
    );
  }
  const dir =
    input.scope.kind === "suggestion"
      ? suggestionValidationDir(input.projectRoot, input.runId)
      : bundleValidationDir(input.projectRoot, input.runId);
  await ensureDir(dir);
  const fileBaseId =
    input.scope.kind === "suggestion"
      ? input.scope.suggestionId
      : input.scope.bundleId;
  const resultPath = path.join(dir, `${fileBaseId}.json`);

  const startedAt = nowIso();
  const startMs = Date.now();

  const profileName = input.profileName ?? "default";
  const profileSource = input.profileSource ?? "default";
  const profileCommands = [...input.commands];

  if (!input.commands || input.commands.length === 0) {
    const out: SuggestionValidationResult = {
      scope: `${input.scope.kind}:${fileBaseId}`,
      scopeKind: input.scope.kind,
      scopeId: fileBaseId,
      runId: input.runId,
      worktreePath: input.worktreePath,
      startedAt,
      endedAt: startedAt,
      durationMs: 0,
      status: "no_commands_configured",
      summary: { total: 0, passed: 0, failed: 0 },
      commands: [],
      resultPath,
      profileName,
      profileSource,
      profileCommands,
    };
    await writeText(resultPath, `${JSON.stringify(out, null, 2)}\n`);
    return out;
  }

  const commandResults: SuggestionValidationCommand[] = [];
  for (const cmd of input.commands) {
    const t0 = Date.now();
    let r;
    try {
      r = await execa(cmd, {
        cwd: input.worktreePath,
        reject: false,
        shell: true, // commands.validate is user-configured shell text already
        timeout: TIMEOUT_PER_COMMAND_MS,
        stdin: "ignore",
      });
    } catch (err) {
      commandResults.push({
        command: cmd,
        exitCode: -1,
        durationMs: Date.now() - t0,
        status: "failed",
        stdoutHead: "",
        stderrHead:
          err instanceof Error
            ? err.message.slice(0, STREAM_HEAD_BYTES)
            : String(err).slice(0, STREAM_HEAD_BYTES),
      });
      continue;
    }
    commandResults.push({
      command: cmd,
      exitCode: r.exitCode ?? -1,
      durationMs: Date.now() - t0,
      status: r.exitCode === 0 ? "passed" : "failed",
      stdoutHead: (r.stdout ?? "").slice(0, STREAM_HEAD_BYTES),
      stderrHead: (r.stderr ?? "").slice(0, STREAM_HEAD_BYTES),
    });
  }

  const passed = commandResults.filter((c) => c.status === "passed").length;
  const failed = commandResults.length - passed;
  const out: SuggestionValidationResult = {
    scope: `${input.scope.kind}:${fileBaseId}`,
    scopeKind: input.scope.kind,
    scopeId: fileBaseId,
    runId: input.runId,
    worktreePath: input.worktreePath,
    startedAt,
    endedAt: nowIso(),
    durationMs: Date.now() - startMs,
    status: failed === 0 ? "passed" : "failed",
    summary: { total: commandResults.length, passed, failed },
    commands: commandResults,
    resultPath,
    profileName,
    profileSource,
    profileCommands,
  };
  await writeText(resultPath, `${JSON.stringify(out, null, 2)}\n`);
  return out;
}

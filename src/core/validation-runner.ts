import path from "node:path";
import { runShellCommand } from "../execution/command-runner.js";
import { writeText } from "../utils/fs.js";
import { slugify } from "../utils/slug.js";
import type { ArtifactStore } from "./artifact-store.js";
import {
  gateAction,
  type ActionBroker,
  type ActionRequest,
} from "../safety/action-broker.js";

export type ValidationCommandResult = {
  command: string;
  exitCode: number;
  /** "environment" = the command's toolchain wasn't there (command not
   *  found / exit 127) - the change was never actually validated, which is
   *  different from validation FAILING. It must not block a run. */
  status: "passed" | "failed" | "environment";
  durationMs: number;
  stdoutPath: string;
  stderrPath: string;
};

export type ValidationSummary = {
  total: number;
  passed: number;
  /** Real failures only - environment problems are counted separately so a
   *  missing toolchain can't masquerade as a failing change. */
  failed: number;
  environment: number;
};

/** A command that never really ran: the shell couldn't find the tool. The
 *  observed shape from a worktree without node_modules is exit 1 with
 *  `sh: tsc: command not found` on stderr (the wrapper masks 127).
 *
 *  Line-ANCHORED on purpose (adversarial review): the phrase must BE the
 *  shell's error line, not appear inside test output - vitest prints failure
 *  detail to stderr, and a real failing test that merely mentions "command
 *  not found" must stay a real failure. */
export function isEnvironmentFailure(exitCode: number, stderr: string): boolean {
  if (exitCode === 0) return false;
  if (exitCode === 127) return true;
  return (
    // `sh: tsc: command not found` / `zsh:1: command not found: tsc`
    /^(?:[\w./-]{1,40}:\s*)?(?:\d+:\s*)?(?:[\w./ -]{1,120}:\s*)?command not found(?::\s*[\w./-]{1,120})?\s*$/m.test(
      stderr,
    ) ||
    // cmd.exe: `'tsc' is not recognized as an internal or external command...`
    /^'[^'\n]{1,120}' is not recognized as an internal or external command/m.test(
      stderr,
    ) ||
    // shebang/env failures: `env: node: No such file or directory`
    /^env: [^\n]{1,80}: No such file or directory\s*$/m.test(stderr)
  );
}

export type ValidationResults = {
  commands: ValidationCommandResult[];
  summary: ValidationSummary;
  note?: string;
};

export async function runValidationCommands(input: {
  commands: readonly string[];
  cwd: string;
  store: ArtifactStore;
  prefix?: string;
  /** S0 Action Broker - when provided, every command.run crosses the boundary
   *  (fail-closed: a deny records the denial and skips the command). */
  broker?: ActionBroker;
  runId?: string;
  roleId?: string;
}): Promise<ValidationResults> {
  const { commands, cwd, store, broker, runId } = input;
  const prefix = input.prefix ?? "validation";

  if (commands.length === 0) {
    return {
      commands: [],
      summary: { total: 0, passed: 0, failed: 0, environment: 0 },
      note: "No validation commands configured.",
    };
  }

  const results: ValidationCommandResult[] = [];

  for (let i = 0; i < commands.length; i++) {
    const command = commands[i]!;
    const slug = slugify(command).slice(0, 40) || `cmd-${i + 1}`;
    const baseRel = path.posix.join(prefix, `${i + 1}-${slug}`);
    const stdoutRel = `${baseRel}.stdout.txt`;
    const stderrRel = `${baseRel}.stderr.txt`;

    // ── Action Broker boundary (S0): command.run ──────────────────────────
    // Fail-closed: a non-allow verdict records the denial and skips the command
    // (recorded as a failed result so the summary stays honest).
    const action: ActionRequest | null =
      broker && runId
        ? {
            runId,
            roleId: input.roleId,
            kind: "command.run",
            subject: { command, cwd, purpose: prefix },
            proposedBy: "system",
          }
        : null;
    let allowDecision: { effect: "allow"; ruleIds: string[] } | null = null;
    if (broker && action) {
      const gate = await gateAction(broker, action);
      if (!gate.allowed) {
        const stdoutAbs = store.resolveArtifactPath(stdoutRel);
        const stderrAbs = store.resolveArtifactPath(stderrRel);
        const msg = `command.run ${gate.effect}: ${gate.reason}`;
        await writeText(stdoutAbs, "");
        await writeText(stderrAbs, `${msg}\n`);
        results.push({
          command,
          exitCode: 126,
          status: "failed",
          durationMs: 0,
          stdoutPath: store.relPath(stdoutAbs),
          stderrPath: store.relPath(stderrAbs),
        });
        continue;
      }
      allowDecision = { effect: "allow", ruleIds: gate.decision.ruleIds };
    }

    const result = await runShellCommand({ command, cwd });

    const stdoutAbs = store.resolveArtifactPath(stdoutRel);
    const stderrAbs = store.resolveArtifactPath(stderrRel);
    await writeText(stdoutAbs, result.stdout);
    await writeText(stderrAbs, result.stderr);

    const environment = isEnvironmentFailure(result.exitCode, result.stderr);

    if (broker && action && allowDecision) {
      await broker.record(action, allowDecision, {
        ok: result.exitCode === 0,
        summary: environment
          ? `${command} → environment unavailable (exit ${result.exitCode})`
          : `${command} → exit ${result.exitCode}`,
        data: {
          exitCode: result.exitCode,
          durationMs: result.durationMs,
          environment,
        },
      });
    }

    results.push({
      command,
      exitCode: result.exitCode,
      status:
        result.exitCode === 0 ? "passed" : environment ? "environment" : "failed",
      durationMs: result.durationMs,
      stdoutPath: store.relPath(stdoutAbs),
      stderrPath: store.relPath(stderrAbs),
    });
  }

  const passed = results.filter((r) => r.status === "passed").length;
  const environment = results.filter((r) => r.status === "environment").length;
  const failed = results.length - passed - environment;

  return {
    commands: results,
    summary: { total: results.length, passed, failed, environment },
    ...(environment > 0
      ? {
          note: `${environment} command(s) could not run: toolchain missing in the worktree (environment, not a code failure).`,
        }
      : {}),
  };
}

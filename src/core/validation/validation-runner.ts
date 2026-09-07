// Runs a set of validation commands one at a time in `cwd`, writes each
// command's stdout and stderr into the run's artifact store, and returns a
// per-command result list plus a rolled-up summary.
//
// Two things here are load-bearing:
//
// - A command whose toolchain is missing gets its own status, "environment",
//   rather than "failed". Such a command never validated anything, so
//   counting it as a failure would report a healthy change as broken.
//   `isEnvironmentFailure` decides this from the exit code plus line-anchored
//   shell messages (see its doc for why the anchoring matters).
// - The Action Broker gate runs before the command is spawned, and only when
//   the caller supplies both a broker and a runId. A non-allow verdict skips
//   the spawn and still pushes a result (exit 126, status "failed") with the
//   denial written to the stderr artifact, so a gated-off command stays
//   visible in the summary instead of vanishing from it.

import path from "node:path";
import { runShellCommand } from "../execution/command-runner.js";
import { writeText } from "../../utils/fs.js";
import { slugify } from "../../utils/slug.js";
import type { ArtifactStore } from "../stores/artifact-store.js";
import {
  gateAction,
  type ActionBroker,
  type ActionRequest,
} from "../../safety/action-broker.js";

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

/** Lines that prove the tool RAN and judged the code. If one is present the
 *  command produced a verdict, so nothing else in its output can make it
 *  "never ran".
 *
 *  This is the gate that was missing. The shell patterns below test whether
 *  stderr CONTAINS an environment-shaped line, which they must - the Windows
 *  message spans two lines and the daemon ones sit inside tool chatter - so on
 *  their own they let a genuinely failing suite that also shelled out to a
 *  missing binary score as "could not run", and `ValidationSummary.failed` is
 *  computed by SUBTRACTING that count. */
const RAN_AND_JUDGED: RegExp[] = [
  /\bAssertionError\b/,
  /\berror TS\d+\b/,
  /^\s*(?:FAIL|\u2717|\u00d7)\s/m,
  /\bTests?\s+\d+\s+failed\b/,
  /\b(?:SyntaxError|TypeError|ReferenceError)\b/,
];

/** A command that never really ran: the shell couldn't find the tool. The
 *  observed shape from a worktree without node_modules is exit 1 with
 *  `sh: tsc: command not found` on stderr (the wrapper masks 127).
 *
 *  `environmentDegraded` is the run's OWN record (`RunState.envDegraded`):
 *  dirs that exist in the project and were not linked into the worktree,
 *  written at startup, before any command runs, on a channel the code under
 *  test cannot touch. A missing toolchain is only believable as an environment
 *  fault when that record says the environment really is missing; otherwise
 *  the toolchain was there and the run broke it, which is a defect in the work
 *  rather than a fault of the machine. Omitting it keeps the old behaviour for
 *  callers with no record to offer.
 *
 *  A daemon that is not running is judged WITHOUT that record: it has nothing
 *  to do with linked directories. */
export function isEnvironmentFailure(
  exitCode: number,
  stderr: string,
  environmentDegraded?: boolean,
): boolean {
  if (exitCode === 0) return false;
  // The tool spoke about the code. Whatever else is in the output, it ran.
  if (RAN_AND_JUDGED.some((re) => re.test(stderr))) return false;
  // A tool that IS installed but whose daemon is not running: the command
  // never got to look at the code, so its failure says nothing about the work.
  // Found by a benchmark run where Docker was down and the run reported
  // `validation_failed`, which would have sent correct work back for rework
  // instead of asking for the service.
  //
  // Deliberately NARROW, and deliberately NOT subject to the environment
  // record below: a bare "connection refused" is not enough, because a suite
  // failing to reach a service it was meant to start is a true defect, and
  // calling that environmental would let a supervisor retry broken code
  // forever. These name the TOOL saying its own daemon is unreachable.
  if (
    /Cannot connect to the Docker daemon/i.test(stderr) ||
    /failed to connect to the docker API/i.test(stderr) ||
    /Is the docker daemon running\?/i.test(stderr) ||
    /docker: error during connect/i.test(stderr) ||
    /Cannot connect to the Podman socket/i.test(stderr)
  ) {
    return true;
  }
  // Everything below is a MISSING TOOLCHAIN claim, which the run's own record
  // must corroborate whenever one is available.
  if (environmentDegraded === false) return false;
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
  /** Action Broker - when provided, every command.run crosses the boundary
   *  (fail-closed: a deny records the denial and skips the command). */
  broker?: ActionBroker;
  runId?: string;
  roleId?: string;
  /** Per-command ceiling (commands.validateTimeoutMs). Omitted = the default. */
  timeoutMs?: number;
  /** The run's own record: did an environment dir that EXISTS in the project
   *  fail to reach the worktree? `false` means the toolchain was there, so a
   *  missing binary is something the run broke, not a fault of the machine.
   *  Omitted keeps the old stderr-only judgement for callers with no record. */
  environmentDegraded?: boolean;
}): Promise<ValidationResults> {
  const { commands, cwd, store, broker, runId } = input;
  const timeoutMs = input.timeoutMs ?? 900_000;
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

    // ── Action Broker boundary: command.run ──────────────────────────
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

    // Bounded: see commands.validateTimeoutMs. Without a ceiling a blocking
    // command wedges the run with no timer and no tree-kill.
    const result = await runShellCommand({ command, cwd, timeoutMs });

    const stdoutAbs = store.resolveArtifactPath(stdoutRel);
    const stderrAbs = store.resolveArtifactPath(stderrRel);
    await writeText(stdoutAbs, result.stdout);
    await writeText(stderrAbs, result.stderr);

    const environment = isEnvironmentFailure(
      result.exitCode,
      result.stderr,
      input.environmentDegraded,
    );

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

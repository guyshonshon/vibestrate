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
  status: "passed" | "failed";
  durationMs: number;
  stdoutPath: string;
  stderrPath: string;
};

export type ValidationSummary = {
  total: number;
  passed: number;
  failed: number;
};

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
  /** S0 Action Broker — when provided, every command.run crosses the boundary
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
      summary: { total: 0, passed: 0, failed: 0 },
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

    if (broker && action && allowDecision) {
      await broker.record(action, allowDecision, {
        ok: result.exitCode === 0,
        summary: `${command} → exit ${result.exitCode}`,
        data: { exitCode: result.exitCode, durationMs: result.durationMs },
      });
    }

    results.push({
      command,
      exitCode: result.exitCode,
      status: result.exitCode === 0 ? "passed" : "failed",
      durationMs: result.durationMs,
      stdoutPath: store.relPath(stdoutAbs),
      stderrPath: store.relPath(stderrAbs),
    });
  }

  const passed = results.filter((r) => r.status === "passed").length;
  const failed = results.length - passed;

  return {
    commands: results,
    summary: { total: results.length, passed, failed },
  };
}

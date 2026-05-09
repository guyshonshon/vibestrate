import path from "node:path";
import { runShellCommand } from "../execution/command-runner.js";
import { writeText } from "../utils/fs.js";
import { slugify } from "../utils/slug.js";
import type { ArtifactStore } from "./artifact-store.js";

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
}): Promise<ValidationResults> {
  const { commands, cwd, store } = input;
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

    const result = await runShellCommand({ command, cwd });

    const stdoutAbs = store.resolveArtifactPath(stdoutRel);
    const stderrAbs = store.resolveArtifactPath(stderrRel);
    await writeText(stdoutAbs, result.stdout);
    await writeText(stderrAbs, result.stderr);

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

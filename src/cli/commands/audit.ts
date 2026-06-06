import { Command } from "commander";
import { detectProject } from "../../project/project-detector.js";
import { pathExists } from "../../utils/fs.js";
import { runStatePath } from "../../utils/paths.js";
import {
  buildRunAudit,
  type AuditAttemptOutcome,
  type AuditStep,
  type RunAudit,
} from "../../core/run-audit.js";
import { color, symbol } from "../ui/format.js";

const OUTCOME_PAINT: Record<AuditAttemptOutcome, (s: string) => string> = {
  success: color.green,
  "rate-limit": color.yellow,
  transient: color.yellow,
  fallback: color.cyan,
  paused: color.cyan,
  "tolerated-failure": color.yellow,
  failed: color.red,
};

function attemptChain(step: AuditStep): string {
  return step.attempts
    .map((a) => {
      const label = a.detail ? `${a.outcome} (${a.detail})` : a.outcome;
      return OUTCOME_PAINT[a.outcome](label);
    })
    .join(color.dim(" → "));
}

function renderAuditText(a: RunAudit): string {
  const lines: string[] = [];
  lines.push(
    `${color.bold("Run audit")} ${color.dim(a.runId)} - ${a.status}` +
      (a.assuranceVerdict ? ` ${color.dim("·")} assurance: ${a.assuranceVerdict}` : ""),
  );
  lines.push(color.dim(`  ${a.task}`));
  if (a.flow) lines.push(`  Flow: ${a.flow.label} ${color.dim(`(${a.flow.id})`)}`);
  lines.push("");

  for (const s of a.steps) {
    const role = [s.seat, s.provider].filter(Boolean).join("→");
    const meta = [
      role ? color.dim(`${role}${s.model ? `/${s.model}` : ""}`) : null,
      s.costUsd != null ? color.dim(`$${s.costUsd.toFixed(3)}`) : null,
      s.durationMs != null ? color.dim(`${(s.durationMs / 1000).toFixed(1)}s`) : null,
      s.toolCallCount != null ? color.dim(`${s.toolCallCount} tools`) : null,
    ]
      .filter(Boolean)
      .join(color.dim(" · "));
    const needs = s.needs.length > 0 ? color.dim(` needs:${s.needs.join(",")}`) : "";
    lines.push(`  ${symbol.bullet()} ${color.bold(s.id)} ${color.dim(`(${s.kind})`)}${needs}  ${meta}`);
    if (s.attempts.length > 0) lines.push(`      ${attemptChain(s)}`);
    if (s.decision) lines.push(color.dim(`      decision: ${s.decision}`));
  }

  if (a.control.length > 0) {
    lines.push("");
    lines.push(color.bold("  Control:"));
    for (const c of a.control) lines.push(color.dim(`  - ${c.type}: ${c.message}`));
  }

  lines.push("");
  const t = a.totals;
  lines.push(
    color.dim(
      `  Totals: ${t.turns} turns · ${t.retries} retries · ${t.fallbacks} fallbacks` +
        (t.costUsd != null ? ` · $${t.costUsd.toFixed(3)}` : ""),
    ),
  );
  return lines.join("\n");
}

/**
 * `vibe audit <runId>` - a tree of everything that happened in a run: the flow
 * steps, each step's attempts (rate-limited -> retry -> fallback -> success),
 * and run-level control events. Read-only; derived from the recorded evidence.
 */
export function buildAuditCommand(): Command {
  const cmd = new Command("audit");
  cmd
    .description(
      "Show a run's audit tree (flow steps, per-step attempts incl. retries/fallbacks, control events).",
    )
    .argument("<runId>", "the run id (see `vibe status`)")
    .option("--json", "emit JSON")
    .action(async (runId: string, opts: { json?: boolean }) => {
      const { projectRoot } = await detectProject(process.cwd());
      if (!(await pathExists(runStatePath(projectRoot, runId)))) {
        console.error(`${symbol.fail()} Run ${runId} not found.`);
        process.exit(1);
      }
      const audit = await buildRunAudit(projectRoot, runId);
      if (opts.json) {
        console.log(JSON.stringify(audit, null, 2));
        return;
      }
      console.log(renderAuditText(audit));
    });
  return cmd;
}

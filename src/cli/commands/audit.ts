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

function fmtTok(n: number | null): string {
  if (n == null) return "?";
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

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
    const role = [s.stage, s.roleLabel ?? s.seat, s.provider].filter(Boolean).join("→");
    const tok =
      s.tokensIn != null || s.tokensOut != null
        ? `${fmtTok(s.tokensIn)}→${fmtTok(s.tokensOut)} tok`
        : null;
    const meta = [
      role ? color.dim(`${role}${s.model ? `/${s.model}` : ""}`) : null,
      s.profileId ? color.dim(`profile:${s.profileId}`) : null,
      s.costUsd != null ? color.dim(`$${s.costUsd.toFixed(3)}`) : null,
      s.durationMs != null ? color.dim(`${(s.durationMs / 1000).toFixed(1)}s`) : null,
      tok ? color.dim(tok) : null,
      s.toolCallCount != null ? color.dim(`${s.toolCallCount} tools`) : null,
    ]
      .filter(Boolean)
      .join(color.dim(" · "));
    const needs = s.needs.length > 0 ? color.dim(` needs:${s.needs.join(",")}`) : "";
    lines.push(`  ${symbol.bullet()} ${color.bold(s.id)} ${color.dim(`(${s.kind})`)}${needs}  ${meta}`);
    if (s.attempts.length > 0) lines.push(`      ${attemptChain(s)}`);
    if (s.decision) lines.push(color.dim(`      decision: ${s.decision}`));
    const inside: string[] = [];
    if (s.tools.length > 0) inside.push(s.tools.map((t) => `${t.name}×${t.count}`).join(" "));
    if (s.subAgents.length > 0) {
      inside.push(`sub-agents: ${s.subAgents.map((a) => a.description ?? a.name).join("; ")}`);
    }
    if (inside.length > 0) lines.push(color.dim(`      inside: ${inside.join(" · ")}`));
    else if (s.internalsOpaque) lines.push(color.dim(`      inside: opaque (provider internals not exposed)`));
  }

  if (a.engagement.length > 0) {
    lines.push("");
    lines.push(color.bold("  Orchestrator engaged:"));
    for (const e of a.engagement) {
      const tag =
        e.cls === "judgment"
          ? color.yellow("judgment")
          : e.cls === "enforced"
            ? color.red("enforced")
            : color.dim("flow");
      const where = e.stepId ? color.dim(` @${e.stepId}`) : "";
      const detail = e.detail ? color.dim(` (${e.detail})`) : "";
      lines.push(`  - [${tag}] ${e.title}${where}${detail}`);
    }
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

import { Command } from "commander";
import { detectProject } from "../../project/project-detector.js";
import { runStatePath } from "../../utils/paths.js";
import { resolveRunRef } from "../run-ref.js";
import {
  buildRunAudit,
  type AuditAttemptOutcome,
  type AuditStep,
  type RunAudit,
} from "../../core/run-audit.js";
import { readJson } from "../../utils/json.js";
import { runStateSchema } from "../../core/state-machine.js";
import { collectPerItemVerdicts, type PerItemVerdict } from "../../flows/runtime/per-item-verdicts.js";
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

function renderPerItemVerdicts(verdicts: PerItemVerdict[]): string {
  if (verdicts.length === 0) return "";
  const lines: string[] = [];
  lines.push("");
  lines.push(color.bold("  Per-item review (Shape B):"));
  for (const v of verdicts) {
    const paint =
      v.verdict === "approved"
        ? color.green
        : v.verdict === "changes_requested"
          ? color.yellow
          : color.dim;
    const label = v.verdict === "changes_requested" ? "changes requested" : v.verdict;
    const iters =
      v.fixIterations > 0
        ? color.dim(` (${v.fixIterations} fix ${v.fixIterations === 1 ? "iteration" : "iterations"})`)
        : "";
    lines.push(`  ${symbol.bullet()} item ${v.itemIndex + 1}: ${paint(label)}${iters}`);
  }
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
    .argument("<run>", "the run id or display name (see `vibe status`)")
    .option("--json", "emit JSON")
    .action(async (runRef: string, opts: { json?: boolean }) => {
      const { projectRoot } = await detectProject(process.cwd());
      const resolved = await resolveRunRef(projectRoot, runRef);
      if (!resolved.ok) {
        console.error(`${symbol.fail()} ${resolved.reason}`);
        process.exit(1);
      }
      const runId = resolved.runId;
      const audit = await buildRunAudit(projectRoot, runId);

      // Per-item verdicts (Shape B / pickup-review runs only).
      const stateRaw = await readJson<unknown>(runStatePath(projectRoot, runId)).catch(() => null);
      const stateResult = stateRaw ? runStateSchema.safeParse(stateRaw) : null;
      const itemCount = stateResult?.success ? (stateResult.data.checklistProgress?.total ?? 0) : 0;
      const perItemVerdicts: PerItemVerdict[] =
        itemCount > 0
          ? await collectPerItemVerdicts({ projectRoot, runId, itemCount }).catch(() => [])
          : [];

      if (opts.json) {
        console.log(JSON.stringify({ ...audit, perItemVerdicts }, null, 2));
        return;
      }
      console.log(renderAuditText(audit) + renderPerItemVerdicts(perItemVerdicts));
    });
  return cmd;
}

import { Check, Coins, Cpu, FileDiff, Hash, Timer, X } from "lucide-react";
import type { RoleMetrics, RuntimeMetrics } from "../../lib/types.js";
import { StatTile } from "../design/StatTile.js";
import { Chip } from "../design/Chip.js";

/**
 * Per-step inspector - one card per agent invocation from the run's runtime
 * metrics: what ran (stage / agent / provider+model), how it went (exit code,
 * review/verification decision), what it touched (files + lines), and the cost
 * (duration, tokens, dollars). Read-only; sourced from `.vibestrate/runs/<id>` via
 * the metrics endpoint the page already loads.
 */
export function StepsInspector({ metrics }: { metrics: RuntimeMetrics | null }) {
  const agents = metrics?.roles ?? [];
  if (agents.length === 0) {
    return (
      <div className="text-[12.5px] text-chalk-400">
        No steps recorded yet. Each agent invocation appears here as it runs -
        with its files touched, tokens, time, and pass/fail.
      </div>
    );
  }
  return (
    <ol className="space-y-2">
      {agents.map((a, i) => (
        <StepCard key={`${a.stageId}-${a.roleId}-${i}`} index={i + 1} a={a} />
      ))}
    </ol>
  );
}

function StepCard({ index, a }: { index: number; a: RoleMetrics }) {
  const ok = a.exitCode === 0;
  const running = !a.endedAt;
  const decision = a.verificationDecision ?? a.reviewDecision ?? null;
  const tokensIn = a.tokenUsage?.input ?? null;
  const tokensOut = a.tokenUsage?.output ?? null;
  return (
    <li className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mono num-tabular w-5 shrink-0 text-right text-[11px] text-chalk-400">
          {index}
        </span>
        <Cpu className="h-3.5 w-3.5 shrink-0 text-violet-soft" strokeWidth={1.9} />
        <span className="text-[13.5px] font-medium text-chalk-100">{a.roleId}</span>
        <span className="mono text-[11px] text-chalk-400">{a.stageId}</span>
        <Chip contained tone="neutral" className="mono">
          {a.providerId}
          {a.model ? `/${a.model}` : ""}
        </Chip>
        <Chip
          contained
          tone={running ? "sky" : ok ? "emerald" : "rose"}
          className="ml-auto"
        >
          {running ? (
            "running"
          ) : ok ? (
            <>
              <Check className="h-3 w-3" strokeWidth={1.9} /> ok
            </>
          ) : (
            <>
              <X className="h-3 w-3" strokeWidth={1.9} /> exit {a.exitCode}
            </>
          )}
        </Chip>
      </div>

      <div className="mt-2 flex flex-wrap items-stretch gap-1.5 pl-[28px]">
        <div title="Wall-clock time">
          <StatTile
            icon={<Timer className="h-3 w-3" />}
            label="duration"
            value={fmtDuration(a.durationMs)}
          />
        </div>
        {tokensIn !== null || tokensOut !== null ? (
          <div
            title={
              a.tokensEstimated
                ? "Tokens (input → output) - estimated from text"
                : "Tokens (input → output)"
            }
          >
            <StatTile
              icon={<Hash className="h-3 w-3" />}
              label="tokens"
              value={`${a.tokensEstimated ? "~" : ""}${fmtNum(tokensIn)} → ${fmtNum(tokensOut)}`}
            />
          </div>
        ) : null}
        {a.totalCostUsd !== null ? (
          <div
            title={
              a.costEstimated
                ? "Estimated cost (tokens × local list price)"
                : "Cost reported by the CLI"
            }
          >
            <StatTile
              icon={<Coins className="h-3 w-3" />}
              label="cost"
              value={`${a.costEstimated ? "~" : ""}$${a.totalCostUsd.toFixed(4)}${a.costEstimated ? " est" : ""}`}
            />
          </div>
        ) : null}
        {a.toolCallCount !== null ? (
          <div title="Tool calls">
            <StatTile icon={<Cpu className="h-3 w-3" />} label="tool calls" value={a.toolCallCount} />
          </div>
        ) : null}
        {a.filesChangedAfter !== null ? (
          <div title="Worktree files changed after this step">
            <StatTile
              icon={<FileDiff className="h-3 w-3" />}
              label="files changed"
              value={
                <>
                  {a.filesChangedAfter}{" "}
                  <span className="text-emerald-400">+{a.diffInsertionsAfter ?? 0}</span>{" "}
                  <span className="text-rose-300">−{a.diffDeletionsAfter ?? 0}</span>
                </>
              }
            />
          </div>
        ) : null}
      </div>

      {decision || (a.validationSummary && a.validationSummary.total > 0) || a.skillsAttached.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-[28px]">
          {decision ? (
            <Chip contained tone="neutral">
              <span className="text-chalk-400">decision:</span>
              <span className="text-chalk-100">{decision}</span>
            </Chip>
          ) : null}
          {a.validationSummary && a.validationSummary.total > 0 ? (
            <Chip contained tone={a.validationSummary.failed > 0 ? "rose" : "emerald"}>
              validation {a.validationSummary.passed}/{a.validationSummary.total}
            </Chip>
          ) : null}
          {a.skillsAttached.map((s) => (
            <Chip key={s} contained tone="neutral">
              {s}
            </Chip>
          ))}
        </div>
      ) : null}
    </li>
  );
}

function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "-";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s - m * 60)}s`;
}

function fmtNum(n: number | null): string {
  return n === null ? "-" : n.toLocaleString();
}

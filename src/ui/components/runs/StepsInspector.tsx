import { Check, Coins, Cpu, FileDiff, Hash, Timer, X } from "lucide-react";
import type { RoleMetrics, RuntimeMetrics } from "../../lib/types.js";

/**
 * Per-step inspector — one card per agent invocation from the run's runtime
 * metrics: what ran (stage / agent / provider+model), how it went (exit code,
 * review/verification decision), what it touched (files + lines), and the cost
 * (duration, tokens, dollars). Read-only; sourced from `.vibestrate/runs/<id>` via
 * the metrics endpoint the page already loads.
 */
export function StepsInspector({ metrics }: { metrics: RuntimeMetrics | null }) {
  const agents = metrics?.roles ?? [];
  if (agents.length === 0) {
    return (
      <div className="text-[12.5px] text-fog-400">
        No steps recorded yet. Each agent invocation appears here as it runs —
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
    <li className="rounded-xl border border-white/[0.08] bg-ink-200/40 px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mono w-5 shrink-0 text-right text-[11px] text-fog-600">{index}</span>
        <Cpu className="h-3.5 w-3.5 shrink-0 text-violet-soft" strokeWidth={1.7} />
        <span className="text-[13.5px] font-medium text-fog-100">{a.roleId}</span>
        <span className="mono text-[11px] text-fog-500">{a.stageId}</span>
        <span className="rounded border border-white/10 px-1.5 py-0.5 text-[10.5px] text-fog-300">
          {a.providerId}
          {a.model ? ` · ${a.model}` : ""}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-[11px]">
          {running ? (
            <span className="text-sky-300">running…</span>
          ) : ok ? (
            <span className="inline-flex items-center gap-1 text-emerald-300">
              <Check className="h-3 w-3" strokeWidth={2} /> ok
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-rose-300">
              <X className="h-3 w-3" strokeWidth={2} /> exit {a.exitCode}
            </span>
          )}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-[28px] text-[11.5px] text-fog-400">
        <Stat icon={<Timer className="h-3 w-3" />} title="Wall-clock time">
          {fmtDuration(a.durationMs)}
        </Stat>
        {tokensIn !== null || tokensOut !== null ? (
          <Stat
            icon={<Hash className="h-3 w-3" />}
            title={
              a.tokensEstimated
                ? "Tokens (input → output) — estimated from text"
                : "Tokens (input → output)"
            }
          >
            {a.tokensEstimated ? "~" : ""}
            {fmtNum(tokensIn)} → {fmtNum(tokensOut)} tok
          </Stat>
        ) : null}
        {a.totalCostUsd !== null ? (
          <Stat
            icon={<Coins className="h-3 w-3" />}
            title={
              a.costEstimated
                ? "Estimated cost (tokens × local list price)"
                : "Cost reported by the CLI"
            }
          >
            {a.costEstimated ? "~" : ""}${a.totalCostUsd.toFixed(4)}
            {a.costEstimated ? " est" : ""}
          </Stat>
        ) : null}
        {a.toolCallCount !== null ? (
          <Stat icon={<Cpu className="h-3 w-3" />} title="Tool calls">
            {a.toolCallCount} tool calls
          </Stat>
        ) : null}
        {a.filesChangedAfter !== null ? (
          <Stat icon={<FileDiff className="h-3 w-3" />} title="Worktree files changed after this step">
            {a.filesChangedAfter} files{" "}
            <span className="text-emerald-300/90">+{a.diffInsertionsAfter ?? 0}</span>{" "}
            <span className="text-rose-300/90">−{a.diffDeletionsAfter ?? 0}</span>
          </Stat>
        ) : null}
      </div>

      {decision || (a.validationSummary && a.validationSummary.total > 0) || a.skillsAttached.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-[28px]">
          {decision ? (
            <span className="rounded border border-white/10 px-1.5 py-0.5 text-[10.5px] text-fog-300">
              decision: <span className="text-fog-100">{decision}</span>
            </span>
          ) : null}
          {a.validationSummary && a.validationSummary.total > 0 ? (
            <span
              className={`rounded border px-1.5 py-0.5 text-[10.5px] ${
                a.validationSummary.failed > 0
                  ? "border-rose-400/30 text-rose-300"
                  : "border-emerald-400/30 text-emerald-300"
              }`}
            >
              validation {a.validationSummary.passed}/{a.validationSummary.total}
            </span>
          ) : null}
          {a.skillsAttached.map((s) => (
            <span key={s} className="rounded border border-white/10 px-1.5 py-0.5 text-[10.5px] text-fog-400">
              {s}
            </span>
          ))}
        </div>
      ) : null}
    </li>
  );
}

function Stat({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap" title={title}>
      <span className="text-fog-600">{icon}</span>
      <span className="mono">{children}</span>
    </span>
  );
}

function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s - m * 60)}s`;
}

function fmtNum(n: number | null): string {
  return n === null ? "—" : n.toLocaleString();
}

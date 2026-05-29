import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Copy,
  GitBranch,
  GitCommit,
  Layers,
  ListChecks,
  Package,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { api } from "../../lib/api.js";
import type { ProjectMetadata } from "../../lib/types.js";
import { RunStatusBadge } from "../../components/runs/RunStatusBadge.js";
import { FreshnessIndicator } from "../../components/codebase/FreshnessIndicator.js";
import { useCodebaseEvents } from "../../lib/useCodebaseEvents.js";

type Props = {
  onSelectRun: (runId: string) => void;
  onShowQueue: () => void;
};

export function ProjectPage({ onSelectRun, onShowQueue }: Props) {
  const [meta, setMeta] = useState<ProjectMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const freshness = useCodebaseEvents("/api/project/events/stream");

  async function load() {
    try {
      setMeta(await api.getProjectMetadata());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // Initial load + drop down to a slow heartbeat poll. SSE drives most updates.
  useEffect(() => {
    void load();
    const i = setInterval(load, 30_000);
    return () => clearInterval(i);
  }, []);

  // Re-fetch metadata on any codebase event so the page never feels stale.
  useEffect(() => {
    if (!freshness.lastEvent) return;
    void load();
  }, [freshness.lastEvent]);

  if (error)
    return (
      <div className="p-6 text-[12.5px] text-vibestrate-fail">
        Failed to load project metadata: {error}
      </div>
    );
  if (!meta)
    return (
      <div className="p-6 text-[12.5px] text-vibestrate-fg-muted">Loading…</div>
    );

  const cards: StatusCard[] = [
    {
      label: "Git",
      value: meta.git.isGitRepo
        ? meta.git.currentBranch ?? "(no branch)"
        : "not a git repo",
      tone: meta.git.isGitRepo ? "ok" : "warn",
      icon: GitBranch,
    },
    {
      label: "Providers",
      value: `${meta.providers.length} configured`,
      tone: meta.providers.length > 0 ? "ok" : "warn",
      icon: Boxes,
    },
    {
      label: "Validation",
      value:
        meta.validationCommands.length > 0
          ? `${meta.validationCommands.length} cmd${meta.validationCommands.length > 1 ? "s" : ""}`
          : "none configured",
      tone: meta.validationCommands.length > 0 ? "ok" : "warn",
      icon: Wrench,
    },
    {
      label: "Skills",
      value: `${meta.skills.length} discovered`,
      tone: "info",
      icon: Layers,
    },
    {
      label: "Pending approvals",
      value: `${meta.counts.pendingApprovals}`,
      tone: meta.counts.pendingApprovals > 0 ? "warn" : "ok",
      icon: AlertTriangle,
    },
    {
      label: "Running tasks",
      value: `${meta.counts.runningTaskIds.length}`,
      tone: "info",
      icon: Activity,
    },
    {
      label: "Queue",
      value: `${meta.counts.queueLength} entries`,
      tone: "info",
      icon: ListChecks,
    },
  ];

  return (
    <div className="relative z-10 mx-auto max-w-[1280px] px-6 pt-5 pb-12">
      <section className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="eyebrow">Project</span>
          <span className="text-fog-500">·</span>
          <h1 className="text-[15px] font-semibold tracking-tight text-fog-100 truncate">
            {meta.projectName}
          </h1>
          <span className="mono text-[11px] text-fog-500">
            {meta.projectTypeLabel}
          </span>
          <span className="text-fog-500">·</span>
          <span className="mono text-[11px] text-fog-500">
            {meta.packageManager}
          </span>
          {!meta.status.initialised ? (
            <span className="mono text-[10.5px] text-amber-300">
              .vibestrate not initialised
            </span>
          ) : null}
        </div>
        <FreshnessIndicator freshness={freshness} onRefresh={load} />
      </section>
      <div className="mt-1 flex items-center gap-1.5 text-[12px] text-fog-400">
        <span className="mono truncate">{meta.projectRoot}</span>
        <CopyButton text={meta.projectRoot} title="Copy project root" />
      </div>

      <div className="grid gap-3 mt-5 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <StatusCardView key={c.label} card={c} />
        ))}
      </div>

      <div className="grid gap-4 mt-5 lg:grid-cols-2">
        <Section title="Git">
          <KV label="Repo">
            <span
              className={
                meta.git.isGitRepo ? "text-vibestrate-success" : "text-vibestrate-warn"
              }
            >
              {meta.git.isGitRepo ? "yes" : "no"}
            </span>
          </KV>
          <KV label="Main branch">
            <span className="vibestrate-mono">{meta.git.mainBranch ?? "—"}</span>
          </KV>
          <KV label="Current branch">
            <span className="vibestrate-mono">{meta.git.currentBranch ?? "—"}</span>
          </KV>
          <KV label="HEAD">
            {meta.git.headHash ? (
              <span className="flex items-center gap-2">
                <GitCommit className="h-3 w-3" strokeWidth={1.5} />
                <span className="vibestrate-mono">{meta.git.headHash}</span>
                <span className="truncate text-vibestrate-fg-dim">
                  {meta.git.headSubject ?? ""}
                </span>
              </span>
            ) : (
              "—"
            )}
          </KV>
          <KV label="Worktree dir">
            <span className="vibestrate-mono truncate">{meta.worktreeDir}</span>
          </KV>
        </Section>

        <Section title="Validation commands">
          {meta.validationCommands.length === 0 ? (
            <div className="text-[12px] text-vibestrate-fg-muted">
              No commands configured. Run{" "}
              <span className="vibestrate-mono">vibe config set commands.validate</span>.
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {meta.validationCommands.map((c) => (
                <li
                  key={c}
                  className="vibestrate-mono rounded border border-vibestrate-border bg-vibestrate-panel-2 px-2 py-1 text-[11.5px]"
                >
                  {c}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={`Providers (${meta.providers.length})`}>
          {meta.providers.length === 0 ? (
            <Empty>
              No providers configured. Run{" "}
              <span className="vibestrate-mono">vibe provider add</span>.
            </Empty>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {meta.providers.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-2 rounded border border-vibestrate-border bg-vibestrate-panel-2 px-2 py-1 text-[12px]"
                >
                  <span className="font-medium">{p.id}</span>
                  <span className="vibestrate-mono rounded border border-vibestrate-border px-1 text-[10.5px] text-vibestrate-fg-muted">
                    {p.type}
                  </span>
                  {p.command ? (
                    <span className="vibestrate-mono ml-auto truncate text-[11px] text-vibestrate-fg-muted">
                      {p.command}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {(() => {
          const crew =
            meta.crews.find((c) => c.id === meta.defaultCrew) ??
            meta.crews[0] ??
            null;
          const roles = crew?.roles ?? [];
          return (
            <Section title={`Crew — ${crew?.label ?? "none"} (${roles.length})`}>
              {roles.length === 0 ? (
                <Empty>No roles configured.</Empty>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {roles.map((a) => (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-center gap-2 rounded border border-vibestrate-border bg-vibestrate-panel-2 px-2 py-1 text-[12px]"
                    >
                      <span className="font-medium">{a.label}</span>
                      {a.seats.map((s) => (
                        <span
                          key={s}
                          className="vibestrate-mono rounded border border-vibestrate-border px-1 text-[10.5px] text-vibestrate-fg-muted"
                        >
                          {s}
                        </span>
                      ))}
                      <span className="vibestrate-mono rounded border border-vibestrate-border px-1 text-[10.5px] text-vibestrate-fg-muted">
                        {a.profile}
                      </span>
                      <span className="vibestrate-mono rounded border border-vibestrate-border px-1 text-[10.5px] text-vibestrate-fg-muted">
                        {a.permissions}
                      </span>
                      {a.skills.length > 0 ? (
                        <span className="text-[11px] text-vibestrate-fg-dim">
                          skills: {a.skills.join(", ")}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          );
        })()}

        <Section title={`Skills (${meta.skills.length})`}>
          {meta.skills.length === 0 ? (
            <Empty>No skills discovered.</Empty>
          ) : (
            <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
              {meta.skills.map((s) => (
                <li
                  key={s.id}
                  className="flex items-baseline gap-2 rounded border border-vibestrate-border bg-vibestrate-panel-2 px-2 py-1 text-[12px]"
                  title={s.filePath}
                >
                  <Layers
                    className="h-3 w-3 text-vibestrate-fg-muted"
                    strokeWidth={1.5}
                  />
                  <span>{s.name}</span>
                  <span className="vibestrate-mono ml-auto text-[10.5px] text-vibestrate-fg-muted">
                    {s.source}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Scheduler">
          <KV label="Max concurrent runs">
            {meta.scheduler.maxConcurrentRuns}
          </KV>
          <KV label="Max write agents">
            {meta.scheduler.maxConcurrentWriteRoles}
          </KV>
          <KV label="Conflict policy">
            <span className="vibestrate-mono">{meta.scheduler.conflictPolicy}</span>
          </KV>
          <KV label="Queue policy">
            <span className="vibestrate-mono">{meta.scheduler.queuePolicy}</span>
          </KV>
          <KV label="Queue length">
            <button
              type="button"
              onClick={onShowQueue}
              className="vibestrate-mono text-vibestrate-accent hover:underline"
            >
              {meta.counts.queueLength} entries →
            </button>
          </KV>
          <KV label="Roadmap items">{meta.counts.roadmapItems}</KV>
          <KV label="Tasks">{meta.counts.tasks}</KV>
        </Section>

        <Section title={`Recent runs (${meta.recentRuns.length})`}>
          {meta.recentRuns.length === 0 ? (
            <Empty>No runs yet.</Empty>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {meta.recentRuns.map((r) => (
                <li key={r.runId}>
                  <button
                    type="button"
                    onClick={() => onSelectRun(r.runId)}
                    className="flex w-full items-center gap-2 rounded border border-vibestrate-border bg-vibestrate-panel-2 px-2 py-1 text-left text-[12px] hover:border-vibestrate-accent/40"
                  >
                    <RunStatusBadge status={r.status} compact />
                    <span className="truncate">{r.task}</span>
                    <span className="vibestrate-mono ml-auto text-[10.5px] text-vibestrate-fg-muted">
                      {r.runId}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Policies">
          <KV label="Forbid main-branch writes">
            <Toggle on={meta.policies.forbidMainBranchWrites} />
          </KV>
          <KV label="Forbid secrets access">
            <Toggle on={meta.policies.forbidSecretsAccess} />
          </KV>
          <KV label="Forbid auto-push">
            <Toggle on={meta.policies.forbidAutoPush} />
          </KV>
          <KV label="Forbid auto-merge">
            <Toggle on={meta.policies.forbidAutoMerge} />
          </KV>
          <KV label="Forced approval stages">
            {meta.policies.requireApprovalAtStages.length === 0
              ? "—"
              : meta.policies.requireApprovalAtStages.join(", ")}
          </KV>
        </Section>
      </div>
    </div>
  );
}

type StatusCard = {
  label: string;
  value: string;
  tone: "ok" | "warn" | "info";
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
};

function StatusCardView({ card }: { card: StatusCard }) {
  const tone =
    card.tone === "ok"
      ? "border-vibestrate-success/40 text-vibestrate-success"
      : card.tone === "warn"
        ? "border-vibestrate-warn/40 text-vibestrate-warn"
        : "border-vibestrate-border text-vibestrate-fg";
  const Icon = card.icon;
  return (
    <div className={`rounded border ${tone} bg-vibestrate-panel-2/60 px-3 py-2`}>
      <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.14em] text-vibestrate-fg-muted">
        <Icon className="h-3 w-3" strokeWidth={1.5} />
        {card.label}
      </div>
      <div className="mt-1 text-[14px] font-medium">{card.value}</div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded border border-vibestrate-border bg-vibestrate-panel/30">
      <header className="flex items-center gap-2 border-b border-vibestrate-border px-3 py-1.5 text-[11.5px] uppercase tracking-[0.12em] text-vibestrate-fg-muted">
        <Package className="h-3 w-3" strokeWidth={1.5} />
        {title}
      </header>
      <div className="p-3 text-[12px] text-vibestrate-fg">{children}</div>
    </section>
  );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-3 py-0.5 text-[12px]">
      <span className="text-vibestrate-fg-muted">{label}</span>
      <span className="text-vibestrate-fg">{children}</span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11.5px] text-vibestrate-fg-muted">{children}</div>
  );
}

function Toggle({ on }: { on: boolean }) {
  return on ? (
    <span className="inline-flex items-center gap-1 text-vibestrate-success">
      <CheckCircle2 className="h-3 w-3" strokeWidth={1.5} /> on
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-vibestrate-warn">
      <ShieldCheck className="h-3 w-3" strokeWidth={1.5} /> off
    </span>
  );
}

function CopyButton({ text, title }: { text: string; title: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          // ignore
        }
      }}
      className="inline-flex items-center gap-1 rounded border border-vibestrate-border px-1.5 py-0.5 text-[10.5px] text-vibestrate-fg-dim hover:bg-vibestrate-panel-2"
      title={title}
    >
      <Copy className="h-3 w-3" strokeWidth={1.5} />
      {copied ? "copied" : "copy"}
    </button>
  );
}

import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Boxes,
  Check,
  Copy,
  GitBranch,
  GitCommit,
  Layers,
  ListChecks,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { api } from "../../lib/api.js";
import type { ProjectMetadata } from "../../lib/types.js";
import { RunStatusBadge } from "../../components/runs/RunStatusBadge.js";
import { FreshnessIndicator } from "../../components/codebase/FreshnessIndicator.js";
import { useCodebaseEvents } from "../../lib/useCodebaseEvents.js";
import { PageShell, PageHeader, Section } from "../../components/layout/PageShell.js";
import { HeroCard, type HeroTone } from "../../components/design/HeroCard.js";
import { StatTile, type StatTileTone } from "../../components/design/StatTile.js";
import { Button } from "../../components/design/Button.js";

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
      <PageShell>
        <PageHeader title="Project" />
        <div className="rounded-[12px] border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-[12.5px] text-rose-300">
          Couldn't load project metadata: {error}. Check the backend is running,
          then retry.
          <div className="mt-2.5">
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </div>
      </PageShell>
    );
  if (!meta)
    return (
      <PageShell>
        <PageHeader title="Project" />
        <div className="text-[13px] text-chalk-300">Loading project…</div>
      </PageShell>
    );

  const cards: StatusCard[] = [
    {
      label: "Git",
      value: meta.git.isGitRepo
        ? meta.git.currentBranch ?? "(no branch)"
        : "not a git repo",
      tone: meta.git.isGitRepo ? "emerald" : "amber",
      icon: GitBranch,
    },
    {
      label: "Providers",
      value: `${meta.providers.length} configured`,
      tone: meta.providers.length > 0 ? "emerald" : "amber",
      icon: Boxes,
    },
    {
      label: "Validation",
      value:
        meta.validationCommands.length > 0
          ? `${meta.validationCommands.length} cmd${meta.validationCommands.length > 1 ? "s" : ""}`
          : "none configured",
      tone: meta.validationCommands.length > 0 ? "emerald" : "amber",
      icon: Wrench,
    },
    {
      label: "Skills",
      value: `${meta.skills.length} discovered`,
      tone: "violet",
      icon: Layers,
    },
    {
      label: "Pending approvals",
      value: `${meta.counts.pendingApprovals}`,
      tone: meta.counts.pendingApprovals > 0 ? "amber" : "emerald",
      icon: AlertTriangle,
    },
    {
      label: "Running tasks",
      value: `${meta.counts.runningTaskIds.length}`,
      tone: "violet",
      icon: Activity,
    },
    {
      label: "Queue",
      value: `${meta.counts.queueLength} entries`,
      tone: "violet",
      icon: ListChecks,
    },
  ];

  const crew =
    meta.crews.find((c) => c.id === meta.defaultCrew) ?? meta.crews[0] ?? null;
  const roles = crew?.roles ?? [];

  // Hero status column: initialised + a git repo reads emerald; a missing
  // .vibestrate or non-repo needs attention.
  const initialised = meta.status.initialised;
  const heroTone: HeroTone = !initialised
    ? "amber"
    : meta.git.isGitRepo
      ? "emerald"
      : "amber";
  const heroStatus = !initialised
    ? "not set up"
    : meta.git.isGitRepo
      ? "ready"
      : "no repo";

  return (
    <PageShell>
      <PageHeader
        title={meta.projectName}
        actions={<FreshnessIndicator freshness={freshness} onRefresh={load} />}
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatTile value={meta.projectTypeLabel} label="type" />
          <StatTile value={meta.packageManager} label="package manager" />
          <div className="flex items-center gap-1.5 rounded-[10px] border border-[color:var(--line-soft)] bg-coal-500/50 px-2.5 py-1.5">
            <span className="mono max-w-[420px] truncate text-[11.5px] text-chalk-300">
              {meta.projectRoot}
            </span>
            <CopyButton text={meta.projectRoot} title="Copy project root" />
          </div>
        </div>
      </PageHeader>

      <Section>
        <HeroCard
          tone={heroTone}
          overline="Project"
          status={heroStatus}
          statusSub={initialised ? ".vibestrate ready" : "run vibe init"}
          title={
            initialised
              ? "This project is wired up"
              : ".vibestrate not initialised"
          }
          sub={
            initialised ? (
              <>
                The workspace metadata below is live - providers, crew, skills,
                and policies your runs use.
              </>
            ) : (
              <>
                Initialise the workspace so runs can record state. Run{" "}
                <span className="mono text-chalk-100">vibe init</span> in the
                project root.
              </>
            )
          }
          metrics={[
            { value: meta.providers.length, label: "providers" },
            { value: meta.skills.length, label: "skills" },
            { value: roles.length, label: "roles" },
            {
              value: meta.counts.pendingApprovals,
              label: "approvals",
              valueClass:
                meta.counts.pendingApprovals > 0
                  ? "text-amber-soft"
                  : undefined,
            },
            {
              value: meta.counts.runningTaskIds.length,
              label: "running",
            },
          ]}
        />
      </Section>

      <Section title="At a glance">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c) => (
            <StatusCardView key={c.label} card={c} />
          ))}
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Git">
          <Panel>
            <KV label="Repo">
              <span
                className={
                  meta.git.isGitRepo ? "text-emerald-400" : "text-amber-soft"
                }
              >
                {meta.git.isGitRepo ? "yes" : "no"}
              </span>
            </KV>
            <KV label="Main branch">
              <span className="mono text-chalk-100">
                {meta.git.mainBranch ?? "-"}
              </span>
            </KV>
            <KV label="Current branch">
              <span className="mono text-chalk-100">
                {meta.git.currentBranch ?? "-"}
              </span>
            </KV>
            <KV label="HEAD">
              {meta.git.headHash ? (
                <span className="flex items-center gap-2">
                  <GitCommit
                    className="h-3.5 w-3.5 text-violet-soft"
                    strokeWidth={1.9}
                    aria-hidden
                  />
                  <span className="mono text-chalk-100">
                    {meta.git.headHash}
                  </span>
                  <span className="truncate text-chalk-300">
                    {meta.git.headSubject ?? ""}
                  </span>
                </span>
              ) : (
                "-"
              )}
            </KV>
            <KV label="Worktree dir">
              <span className="mono truncate text-chalk-100">
                {meta.worktreeDir}
              </span>
            </KV>
          </Panel>
        </Section>

        <Section title="Validation commands">
          <Panel>
            {meta.validationCommands.length === 0 ? (
              <Empty>
                No validation commands yet. Set them with{" "}
                <span className="mono text-chalk-100">
                  vibe config set commands.validate
                </span>{" "}
                so runs can self-check.
              </Empty>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {meta.validationCommands.map((c) => (
                  <li
                    key={c}
                    className="mono rounded-[10px] border border-[color:var(--line-soft)] bg-coal-500/50 px-2.5 py-1.5 text-[11.5px] text-chalk-100"
                  >
                    {c}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </Section>

        <Section title={`Providers (${meta.providers.length})`}>
          <Panel>
            {meta.providers.length === 0 ? (
              <Empty>
                No providers configured. Add one with{" "}
                <span className="mono text-chalk-100">vibe provider add</span> to
                let runs call a model.
              </Empty>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {meta.providers.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-2 rounded-[10px] border border-[color:var(--line-soft)] bg-coal-500/50 px-2.5 py-1.5 text-[12px]"
                  >
                    <span className="font-semibold text-chalk-100">{p.id}</span>
                    <span className="mono rounded-[8px] border border-[color:var(--line)] px-1.5 py-0.5 text-[10.5px] text-chalk-300">
                      {p.type}
                    </span>
                    {p.command ? (
                      <span className="mono ml-auto truncate text-[11px] text-chalk-300">
                        {p.command}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </Section>

        <Section title={`Crew - ${crew?.label ?? "none"} (${roles.length})`}>
          <Panel>
            {roles.length === 0 ? (
              <Empty>
                No roles configured. Set up a crew on the Crews page to staff
                your runs.
              </Empty>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {roles.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center gap-2 rounded-[10px] border border-[color:var(--line-soft)] bg-coal-500/50 px-2.5 py-1.5 text-[12px]"
                  >
                    <span className="font-semibold text-chalk-100">
                      {a.label}
                    </span>
                    {a.seats.map((s) => (
                      <span
                        key={s}
                        className="mono rounded-[8px] border border-[color:var(--line)] px-1.5 py-0.5 text-[10.5px] text-chalk-300"
                      >
                        {s}
                      </span>
                    ))}
                    <span className="mono rounded-[8px] border border-[color:var(--line)] px-1.5 py-0.5 text-[10.5px] text-chalk-300">
                      {a.profile}
                    </span>
                    <span className="mono rounded-[8px] border border-[color:var(--line)] px-1.5 py-0.5 text-[10.5px] text-chalk-300">
                      {a.permissions}
                    </span>
                    {a.skills.length > 0 ? (
                      <span className="text-[11px] text-chalk-300">
                        skills: {a.skills.join(", ")}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </Section>

        <Section title={`Skills (${meta.skills.length})`}>
          <Panel>
            {meta.skills.length === 0 ? (
              <Empty>
                No skills discovered. Add a skill under{" "}
                <span className="mono text-chalk-100">.vibestrate/skills</span> to
                extend what roles can do.
              </Empty>
            ) : (
              <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
                {meta.skills.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-baseline gap-2 rounded-[10px] border border-[color:var(--line-soft)] bg-coal-500/50 px-2.5 py-1.5 text-[12px]"
                    title={s.filePath}
                  >
                    <Layers
                      className="h-3.5 w-3.5 text-violet-soft"
                      strokeWidth={1.9}
                      aria-hidden
                    />
                    <span className="text-chalk-100">{s.name}</span>
                    <span className="mono ml-auto text-[10.5px] text-chalk-300">
                      {s.source}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </Section>

        <Section title="Scheduler">
          <Panel>
            <KV label="Max concurrent runs">
              <span className="text-chalk-100">
                {meta.scheduler.maxConcurrentRuns}
              </span>
            </KV>
            <KV label="Max write agents">
              <span className="text-chalk-100">
                {meta.scheduler.maxConcurrentWriteRoles}
              </span>
            </KV>
            <KV label="Conflict policy">
              <span className="mono text-chalk-100">
                {meta.scheduler.conflictPolicy}
              </span>
            </KV>
            <KV label="Queue policy">
              <span className="mono text-chalk-100">
                {meta.scheduler.queuePolicy}
              </span>
            </KV>
            <KV label="Queue length">
              <button
                type="button"
                onClick={onShowQueue}
                className="text-[12.5px] font-semibold text-violet-soft transition hover:text-violet-soft/80"
              >
                {meta.counts.queueLength} entries →
              </button>
            </KV>
            <KV label="Roadmap items">
              <span className="text-chalk-100">{meta.counts.roadmapItems}</span>
            </KV>
            <KV label="Tasks">
              <span className="text-chalk-100">{meta.counts.tasks}</span>
            </KV>
          </Panel>
        </Section>

        <Section title={`Recent runs (${meta.recentRuns.length})`}>
          <Panel>
            {meta.recentRuns.length === 0 ? (
              <Empty>
                No runs yet. Queue one from Mission Control to see it land here.
              </Empty>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {meta.recentRuns.map((r) => (
                  <li key={r.runId}>
                    <button
                      type="button"
                      onClick={() => onSelectRun(r.runId)}
                      className="flex w-full items-center gap-2 rounded-[10px] border border-[color:var(--line-soft)] bg-coal-500/50 px-2.5 py-1.5 text-left text-[12px] transition hover:border-[color:var(--line-strong)] hover:bg-coal-400"
                    >
                      <RunStatusBadge status={r.status} compact />
                      <span className="truncate text-chalk-100">{r.task}</span>
                      <span className="mono ml-auto text-[10.5px] text-chalk-300">
                        {r.runId}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </Section>

        <Section title="Policies">
          <Panel>
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
              <span className="text-chalk-100">
                {meta.policies.requireApprovalAtStages.length === 0
                  ? "-"
                  : meta.policies.requireApprovalAtStages.join(", ")}
              </span>
            </KV>
          </Panel>
        </Section>
      </div>
    </PageShell>
  );
}

type StatusCard = {
  label: string;
  value: string;
  tone: StatTileTone;
  icon: React.ComponentType<{
    className?: string;
    strokeWidth?: number;
    "aria-hidden"?: boolean;
  }>;
};

const CARD_TONE_TEXT: Record<StatTileTone, string> = {
  default: "text-chalk-100",
  violet: "text-violet-soft",
  emerald: "text-emerald-400",
  amber: "text-amber-soft",
  rose: "text-rose-300",
};

function StatusCardView({ card }: { card: StatusCard }) {
  const Icon = card.icon;
  return (
    <div className="rounded-[14px] border border-[color:var(--line)] bg-coal-600 px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-violet-soft">
        <Icon
          className="h-3.5 w-3.5"
          strokeWidth={1.9}
          aria-hidden
        />
        {card.label}
      </div>
      <div
        className={`mt-1 truncate text-[14px] font-bold ${CARD_TONE_TEXT[card.tone]}`}
      >
        {card.value}
      </div>
    </div>
  );
}

/** The card shell every detail section renders inside (contract §5). */
function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4 text-[12px] text-chalk-100">
      {children}
    </div>
  );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-3 py-0.5 text-[12px]">
      <span className="text-chalk-300">{label}</span>
      <span className="text-chalk-100">{children}</span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-[12px] text-chalk-300">{children}</div>;
}

function Toggle({ on }: { on: boolean }) {
  return on ? (
    <span className="inline-flex items-center gap-1 text-emerald-400">
      <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> on
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-amber-soft">
      <ShieldAlert className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden /> off
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
      className="inline-flex shrink-0 items-center gap-1 text-[10.5px] font-semibold text-chalk-300 transition hover:text-chalk-100"
      title={title}
    >
      {copied ? (
        <Check className="h-3 w-3 text-emerald-400" strokeWidth={2} aria-hidden />
      ) : (
        <Copy className="h-3 w-3" strokeWidth={1.9} aria-hidden />
      )}
      {copied ? "copied" : "copy"}
    </button>
  );
}

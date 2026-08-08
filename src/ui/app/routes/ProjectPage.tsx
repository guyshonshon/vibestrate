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
  Plus,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { api } from "../../lib/api.js";
import type { ProjectMetadata } from "../../lib/types.js";
import { RunStatusBadge } from "../../components/runs/RunStatusBadge.js";
import { FreshnessIndicator } from "../../components/codebase/FreshnessIndicator.js";
import { useCodebaseEvents } from "../../lib/useCodebaseEvents.js";
import { PageShell, PageHeader, Section } from "../../components/layout/PageShell.js";
import { Deck, Cell } from "../../components/layout/Deck.js";
import { PageHero } from "../../components/layout/PageHero.js";
import { StatTile, type StatTileTone } from "../../components/design/StatTile.js";
import { Button } from "../../components/design/Button.js";
import { navigate } from "../App.js";

type Props = {
  onSelectRun: (runId: string) => void;
  onShowQueue: () => void;
};

export function ProjectPage({ onSelectRun, onShowQueue }: Props) {
  const [meta, setMeta] = useState<ProjectMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [initBusy, setInitBusy] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [skillUrl, setSkillUrl] = useState("");
  const [skillBusy, setSkillBusy] = useState(false);
  const [skillError, setSkillError] = useState<string | null>(null);
  const freshness = useCodebaseEvents("/api/project/events/stream");

  async function load() {
    try {
      setMeta(await api.getProjectMetadata());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // Same call InitScreen makes on first run - this just re-offers it here for
  // the rare case .vibestrate/ goes missing after the dashboard is already open
  // (InitScreen only gates the very first load).
  async function handleInit() {
    setInitBusy(true);
    setInitError(null);
    try {
      await api.initProject();
      await load();
    } catch (err) {
      setInitError(err instanceof Error ? err.message : String(err));
    } finally {
      setInitBusy(false);
    }
  }

  async function handleFetchSkill(e: React.FormEvent) {
    e.preventDefault();
    if (!skillUrl.trim()) return;
    setSkillBusy(true);
    setSkillError(null);
    try {
      await api.fetchSkillFromUrl({ url: skillUrl.trim() });
      setSkillUrl("");
      await load();
    } catch (err) {
      setSkillError(err instanceof Error ? err.message : String(err));
    } finally {
      setSkillBusy(false);
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

  const initialised = meta.status.initialised;

  return (
    <PageShell>
      <Deck>
        <Cell size="full" reason="masthead">
          {/* One header. This page used to stack a PageHeader on top of a
           * HeroCard, so it announced itself twice before saying anything. */}
          <PageHero
            state={{
              value: initialised ? "Ready" : "Not set up",
              caption: initialised ? ".vibestrate" : "Needs init",
              note: initialised
                ? "Providers, crew, skills and policies below are live."
                : "Initialise the workspace so runs can record state.",
              tone: initialised ? "emerald" : "amber",
            }}
            title={meta.projectName}
            purpose={
              initialised
                ? "Everything a run reads before it starts: the repo it works in, the providers and crew it can call, the validation it must pass, and the policies that judge it."
                : "This directory has no .vibestrate workspace yet, so nothing can record state."
            }
            actions={
              <>
                {!initialised ? (
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={initBusy}
                    onClick={() => void handleInit()}
                  >
                    {initBusy ? "Initializing…" : "Initialize project"}
                  </Button>
                ) : null}
                <FreshnessIndicator freshness={freshness} onRefresh={load} />
              </>
            }
            metrics={[
              { value: meta.providers.length, label: "providers" },
              { value: meta.skills.length, label: "skills" },
              { value: roles.length, label: "roles" },
              {
                value: meta.counts.pendingApprovals,
                label: "approvals",
                tone: meta.counts.pendingApprovals > 0 ? "warn" : "default",
              },
              { value: meta.counts.runningTaskIds.length, label: "running" },
            ]}
            footer={
              <>
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="mono min-w-0 truncate text-chalk-100">
                    {meta.projectRoot}
                  </span>
                  <CopyButton text={meta.projectRoot} title="Copy project root" />
                </span>
                <span className="shrink-0">
                  {meta.projectTypeLabel} project, managed with{" "}
                  {meta.packageManager}
                </span>
              </>
            }
          />
          {initError && !initialised ? (
            <p className="mt-2 text-[13px] text-rose-300">{initError}</p>
          ) : null}
        </Cell>

        <Cell size="full" reason="masthead">
          <Section flush title="At a glance">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {cards.map((c) => (
                <StatusCardView key={c.label} card={c} />
              ))}
            </div>
          </Section>
        </Cell>

        {/* Columns of stacks. These eight sections have wildly different
         * heights; as a plain 2-column grid every row was as tall as its
         * taller half and the shorter one left a void. */}
        <Cell size="half" className="flex flex-col gap-4">
        <Section flush title="Git">
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

        <Section flush title="Validation commands">
          <Panel>
            {meta.validationCommands.length === 0 ? (
              <Empty>
                No validation commands yet. They run as shell commands, so
                they're set from the CLI only, never the browser:{" "}
                <span className="mono text-chalk-100">
                  vibe config set commands.validate
                </span>
                .
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

        <Section flush title={`Providers (${meta.providers.length})`}>
          <Panel>
            {meta.providers.length === 0 ? (
              <div className="flex flex-col items-start gap-2.5">
                <p className="text-[12px] text-chalk-300">
                  No providers configured yet - runs need at least one to call a
                  model.
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  iconLeft={<Plus className="h-3.5 w-3.5" strokeWidth={1.9} />}
                  onClick={() => navigate({ kind: "providers" })}
                >
                  Add provider
                </Button>
              </div>
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

        <Section flush title={`Crew - ${crew?.label ?? "none"} (${roles.length})`}>
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

        </Cell>

        <Cell size="half" className="flex flex-col gap-4">
        <Section flush title={`Skills (${meta.skills.length})`}>
          <Panel>
            {meta.skills.length === 0 ? (
              <div className="flex flex-col gap-2.5">
                <Empty>
                  No skills discovered yet. Fetch one from a URL to extend what
                  roles can do.
                </Empty>
                <form
                  onSubmit={(e) => void handleFetchSkill(e)}
                  className="flex items-center gap-1.5"
                >
                  <input
                    value={skillUrl}
                    onChange={(e) => setSkillUrl(e.target.value)}
                    placeholder="https://…/skill.md"
                    disabled={skillBusy}
                    className="w-full min-w-0 flex-1 rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 px-2.5 py-1.5 text-[12px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none disabled:opacity-50"
                  />
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    disabled={skillBusy || !skillUrl.trim()}
                  >
                    {skillBusy ? "Fetching…" : "Fetch skill"}
                  </Button>
                </form>
                {skillError ? (
                  <div className="rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-2.5 py-1.5 text-[11.5px] text-rose-300">
                    {skillError}
                  </div>
                ) : null}
              </div>
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

        <Section flush title="Scheduler">
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

        <Section flush title={`Recent runs (${meta.recentRuns.length})`}>
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

        <Section flush title="Policies">
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
        </Cell>
      </Deck>
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

import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  Cpu,
  Play,
  Plus,
  Settings as SettingsIcon,
  X,
} from "lucide-react";
import { api, type AgentProfile, type AgentsOverview } from "../../lib/api.js";
import { Button } from "../../components/design/Button.js";
import { Chip, ToneDot } from "../../components/design/Chip.js";
import { SectionEyebrow } from "../../components/design/SectionEyebrow.js";
import { Sparkline, MiniBars } from "../../components/design/Sparkline.js";
import { cn } from "../../components/design/cn.js";
import { fmtElapsed, relTime } from "../../components/design/format.js";

type AgentTone = "violet" | "sky" | "emerald" | "amber" | "rose";

const TONE: Record<
  AgentTone,
  { ring: string; grad: string; text: string; bar: string }
> = {
  violet: {
    ring: "ring-violet-soft/40",
    grad: "from-violet-soft/30 to-violet-deep/15",
    text: "text-violet-soft",
    bar: "bg-violet-soft",
  },
  sky: {
    ring: "ring-sky-glow/40",
    grad: "from-sky-400/30 to-sky-500/15",
    text: "text-sky-glow",
    bar: "bg-sky-glow",
  },
  emerald: {
    ring: "ring-emerald-400/40",
    grad: "from-emerald-400/30 to-emerald-600/15",
    text: "text-emerald-300",
    bar: "bg-emerald-400",
  },
  amber: {
    ring: "ring-amber-300/40",
    grad: "from-amber-300/30 to-amber-500/15",
    text: "text-amber-300",
    bar: "bg-amber-300",
  },
  rose: {
    ring: "ring-rose-400/40",
    grad: "from-rose-400/30 to-rose-600/15",
    text: "text-rose-300",
    bar: "bg-rose-400",
  },
};

function toneForVendor(vendor: string | null): AgentTone {
  if (!vendor) return "violet";
  const v = vendor.toLowerCase();
  if (v.includes("anthropic")) return "violet";
  if (v.includes("openai")) return "sky";
  if (v.includes("google")) return "amber";
  if (v.includes("ollama")) return "rose";
  if (v.includes("aider") || v.includes("opencode")) return "emerald";
  return "violet";
}

function avatarLetter(profile: AgentProfile): string {
  // Surface the most recognizable letter: vendor's first letter, falling
  // back to the model id's first letter.
  if (profile.vendor) return profile.vendor.charAt(0);
  return profile.label.charAt(0).toUpperCase();
}

export function AgentsPage() {
  const [overview, setOverview] = useState<AgentsOverview | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await api.getAgentsOverview();
        if (cancelled) return;
        setOverview(r);
        setError(null);
        setSelectedId((cur) => cur ?? r.providers[0]?.providerId ?? null);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
    const id = window.setInterval(load, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const selected = useMemo(
    () =>
      overview?.providers.find((p) => p.providerId === selectedId) ??
      overview?.providers[0] ??
      null,
    [overview, selectedId],
  );

  // Configure / test state lives on the page so it survives roster
  // re-renders triggered by the 8s overview poll.
  const [configureFor, setConfigureFor] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<
    { kind: "ok" | "err"; text: string } | null
  >(null);
  const [testBusy, setTestBusy] = useState<Record<string, true>>({});
  const [setupBusy, setSetupBusy] = useState<Record<string, true>>({});
  const [testResults, setTestResults] = useState<
    Record<
      string,
      Awaited<ReturnType<typeof api.testProvider>>
    >
  >({});

  useEffect(() => {
    if (!actionToast) return;
    const t = window.setTimeout(() => setActionToast(null), 5000);
    return () => window.clearTimeout(t);
  }, [actionToast]);

  async function runSetup(
    providerId: string,
    opts: { setAsDefault?: boolean } = {},
  ) {
    setSetupBusy((c) => ({ ...c, [providerId]: true }));
    try {
      await api.setupProvider(providerId, opts);
      setActionToast({
        kind: "ok",
        text: opts.setAsDefault
          ? `${providerId}: configured + set as default for every agent.`
          : `${providerId}: configured in .amaco/project.yml.`,
      });
      // Force an immediate overview refresh.
      const r = await api.getAgentsOverview();
      setOverview(r);
    } catch (err) {
      setActionToast({
        kind: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSetupBusy((c) => {
        const next = { ...c };
        delete next[providerId];
        return next;
      });
    }
  }

  async function runSetDefault(providerId: string) {
    setSetupBusy((c) => ({ ...c, [providerId]: true }));
    try {
      const r = await api.setDefaultProvider(providerId);
      setActionToast({
        kind: "ok",
        text: `${providerId} is now the default for ${r.agentsUpdated.length} agent(s).`,
      });
    } catch (err) {
      setActionToast({
        kind: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSetupBusy((c) => {
        const next = { ...c };
        delete next[providerId];
        return next;
      });
    }
  }

  async function runTest(providerId: string) {
    setTestBusy((c) => ({ ...c, [providerId]: true }));
    try {
      const r = await api.testProvider(providerId);
      setTestResults((cur) => ({ ...cur, [providerId]: r }));
      setActionToast({
        kind: r.ok ? "ok" : "err",
        text: r.ok
          ? `${providerId}: connectivity OK (${r.durationMs} ms).`
          : `${providerId}: ${r.hint ?? "test failed"}`,
      });
    } catch (err) {
      setActionToast({
        kind: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setTestBusy((c) => {
        const next = { ...c };
        delete next[providerId];
        return next;
      });
    }
  }

  return (
    <div className="relative z-10 mx-auto max-w-[1480px] px-8 pt-6 pb-16 fade-up">
      <section className="mt-2">
        <div className="eyebrow mb-3">Agents · the crew you can pull from</div>
        <h1 className="text-display text-[32px] sm:text-[36px] xl:text-[40px] leading-[1.12] max-w-[820px]">
          {overview ? overview.providers.length : "—"}{" "}
          <em className="text-display italic text-violet-soft">models</em>, one
          orchestrator, your rules.
        </h1>
        <p className="text-fog-300 text-[13.5px] mt-3 max-w-[640px]">
          Tune capabilities, see who's online, watch throughput per agent.
          Every change here flows through to the composer.
        </p>
      </section>

      {error ? (
        <div className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/5 px-3 py-1.5 text-[12.5px] text-rose-300">
          {error}
        </div>
      ) : null}

      <KpiStrip overview={overview} />

      <section className="mt-8 grid grid-cols-12 gap-5">
        <div className="col-span-12 lg:col-span-5 xl:col-span-4 space-y-2.5">
          <SectionEyebrow className="mb-1 px-1">
            <span>
              Providers · {overview?.providers.length ?? 0}
            </span>
            <span className="text-fog-400">↑ select to inspect</span>
          </SectionEyebrow>
          {(overview?.providers ?? []).map((p) => (
            <RosterRow
              key={p.providerId}
              profile={p}
              selected={p.providerId === selected?.providerId}
              onSelect={() => setSelectedId(p.providerId)}
            />
          ))}
          {!overview ? (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] px-4 py-3 text-[12.5px] text-fog-400">
              Loading providers…
            </div>
          ) : null}
        </div>

        <div className="col-span-12 lg:col-span-7 xl:col-span-8">
          {selected ? (
            <AgentDetail
              profile={selected}
              testResult={testResults[selected.providerId] ?? null}
              setupBusy={!!setupBusy[selected.providerId]}
              testBusy={!!testBusy[selected.providerId]}
              onConfigure={() => setConfigureFor(selected.providerId)}
              onTest={() => void runTest(selected.providerId)}
              onSetDefault={() => void runSetDefault(selected.providerId)}
            />
          ) : (
            <div className="rounded-2xl border border-white/[0.08] surface-ink-100-55 px-6 py-10 text-[13px] text-fog-400">
              No agent selected.
            </div>
          )}
        </div>
      </section>

      {actionToast ? (
        <div
          role="status"
          className={cn(
            "fixed bottom-4 right-4 z-30 rounded-lg border px-3.5 py-2 text-[12.5px] shadow-2xl",
            actionToast.kind === "ok"
              ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
              : "border-rose-400/40 bg-rose-500/10 text-rose-200",
          )}
        >
          {actionToast.kind === "ok" ? "✓ " : "✗ "}
          {actionToast.text}
        </div>
      ) : null}

      {configureFor ? (
        <ConfigureProviderModal
          profile={
            overview?.providers.find((p) => p.providerId === configureFor) ??
            null
          }
          busy={!!setupBusy[configureFor]}
          onSetup={(opts) => {
            void runSetup(configureFor, opts).then(() => setConfigureFor(null));
          }}
          onSetDefault={() => {
            void runSetDefault(configureFor).then(() => setConfigureFor(null));
          }}
          onClose={() => setConfigureFor(null)}
        />
      ) : null}
    </div>
  );
}

// ── Configure provider modal ────────────────────────────────────────────

function ConfigureProviderModal({
  profile,
  busy,
  onSetup,
  onSetDefault,
  onClose,
}: {
  profile: AgentProfile | null;
  busy: boolean;
  onSetup: (opts: { setAsDefault?: boolean }) => void;
  onSetDefault: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!profile) return null;
  const hasPreset = ["claude", "codex", "ollama"].includes(profile.providerId);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Configure ${profile.label}`}
      className="fixed inset-0 z-40 flex items-center justify-center p-6"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/45 backdrop-blur-[3px]"
      />
      <div className="relative bevel-violet top-rim p-[1px] w-full max-w-[460px]">
        <div className="rounded-[13px] surface-ink-100-70 backdrop-blur-2xl p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="eyebrow">Configure provider</div>
              <h3 className="text-display text-[22px] leading-tight mt-1">
                {profile.label}
              </h3>
              <div className="text-[11.5px] text-fog-400 mono mt-1">
                {profile.vendor ?? "—"} · {profile.providerId}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 rounded-lg hover:bg-white/[0.06] text-fog-300 hover:text-fog-100 flex items-center justify-center"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.7} />
            </button>
          </div>

          <div className="space-y-3 text-[12.5px] text-fog-300">
            <KvRow label="Detected" value={profile.available ? "yes" : "no"} />
            <KvRow
              label="Configured in project.yml"
              value={profile.configured ? "yes" : "no"}
            />
            <KvRow
              label="Last seen"
              value={profile.lastSeenAt ? relTime(profile.lastSeenAt) : "never"}
            />
          </div>

          {!hasPreset ? (
            <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-500/5 px-3 py-2 text-[11.5px] text-amber-200">
              No bundled preset for this provider. Edit{" "}
              <span className="mono">.amaco/project.yml</span> directly to
              configure it, then run{" "}
              <span className="mono">amaco provider test</span>.
            </div>
          ) : null}

          <div className="mt-5 flex items-center justify-end gap-2 flex-wrap">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="h-8 px-3 rounded-lg border border-white/10 bg-transparent hover:bg-white/[0.04] text-[12px] text-fog-300"
            >
              Cancel
            </button>
            {profile.configured ? (
              <button
                type="button"
                onClick={onSetDefault}
                disabled={busy}
                className="h-8 px-3 rounded-lg border border-white/10 bg-white/[0.06] hover:bg-white/[0.1] text-[12px] text-fog-100 disabled:opacity-50"
              >
                Set as default
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onSetup({ setAsDefault: false })}
              disabled={busy || !hasPreset || !profile.available}
              title={
                !profile.available
                  ? "Install the CLI before configuring."
                  : undefined
              }
              className="h-8 px-3 rounded-lg border border-white/10 bg-white/[0.06] hover:bg-white/[0.1] text-[12px] text-fog-100 disabled:opacity-50"
            >
              {busy ? "Working…" : "Add to project"}
            </button>
            <button
              type="button"
              onClick={() => onSetup({ setAsDefault: true })}
              disabled={busy || !hasPreset || !profile.available}
              className="h-8 px-3 rounded-lg bg-gradient-to-b from-violet-mid to-violet-deep ring-1 ring-violet-soft/40 text-white text-[12px] font-medium disabled:opacity-50"
            >
              {busy ? "Working…" : "Add + set default"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function KvRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/[0.04] pb-2 last:border-0">
      <span className="text-fog-400">{label}</span>
      <span className="mono text-fog-100 num-tabular">{value}</span>
    </div>
  );
}

// ── KPI strip ─────────────────────────────────────────────────────────────

function KpiStrip({ overview }: { overview: AgentsOverview | null }) {
  return (
    <section className="mt-7 grid grid-cols-2 md:grid-cols-4 gap-3">
      <KpiTile
        label="Online"
        value={
          overview ? `${overview.kpi.onlineCount} / ${overview.kpi.totalCount}` : "—"
        }
        sub={
          <span className="flex items-center gap-1.5">
            <span className="pulse-dot text-emerald-400" />{" "}
            {overview
              ? `${overview.kpi.totalCount - overview.kpi.onlineCount} offline`
              : "—"}
          </span>
        }
        accent={
          <MiniBars
            values={
              overview
                ? overview.providers.map((p) => (p.available ? 5 : 1))
                : [1, 1, 1, 1, 1, 1, 1]
            }
            tone="emerald"
          />
        }
      />
      <KpiTile
        label="Runs · 24h"
        value={(overview?.kpi.runs24h ?? 0).toLocaleString()}
        sub={<span className="text-violet-soft">live count</span>}
        accent={
          <Sparkline
            values={
              overview && overview.providers.length > 0
                ? overview.providers[0]!.throughputSpark
                : [0]
            }
            tone="violet"
            width={84}
            height={26}
          />
        }
      />
      <KpiTile
        label="Spend · 24h"
        value={`$${(overview?.kpi.spend24hUsd ?? 0).toFixed(2)}`}
        sub={<span className="text-fog-400">across active models</span>}
        accent={
          <Sparkline
            values={
              overview
                ? overview.providers.map((p) => p.costUsd)
                : [0]
            }
            tone="amber"
            width={84}
            height={26}
          />
        }
      />
      <KpiTile
        label="p95 latency"
        value={
          overview?.kpi.avgP95Seconds !== null &&
          overview?.kpi.avgP95Seconds !== undefined
            ? `${overview.kpi.avgP95Seconds.toFixed(1)}s`
            : "—"
        }
        sub={<span className="text-fog-400">averaged across providers</span>}
        accent={
          <Sparkline
            values={
              overview
                ? overview.providers
                    .map((p) => p.latencyP95Ms ?? 0)
                    .map((v) => (v > 0 ? v / 1000 : 0))
                : [0]
            }
            tone="sky"
            width={84}
            height={26}
          />
        }
      />
    </section>
  );
}

function KpiTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: React.ReactNode;
  accent: React.ReactNode;
}) {
  return (
    <div className="glass p-4 relative overflow-hidden">
      <div className="eyebrow">{label}</div>
      <div className="flex items-baseline justify-between mt-2 gap-3">
        <div className="text-[26px] font-semibold tracking-tight num-tabular">
          {value}
        </div>
        <div className="shrink-0 opacity-90">{accent}</div>
      </div>
      <div className="text-[11.5px] mt-1.5">{sub}</div>
    </div>
  );
}

// ── Roster ────────────────────────────────────────────────────────────────

function RosterRow({
  profile,
  selected,
  onSelect,
}: {
  profile: AgentProfile;
  selected: boolean;
  onSelect: () => void;
}) {
  const tone = TONE[toneForVendor(profile.vendor)];
  const isOnline = profile.available;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-xl border transition group relative overflow-hidden",
        selected
          ? "border-violet-soft/45 bg-violet-500/[0.07] ring-1 ring-violet-soft/30"
          : "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04]",
      )}
    >
      {selected ? (
        <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r bg-violet-soft" />
      ) : null}
      <div className="px-4 py-3.5 flex items-center gap-3">
        <span
          className={cn(
            "rounded-xl bg-gradient-to-br ring-1 flex items-center justify-center shrink-0",
            tone.grad,
            tone.ring,
            tone.text,
          )}
          style={{ width: 40, height: 40 }}
        >
          <span className="text-display text-[20px] leading-none">
            {avatarLetter(profile)}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[13.5px] text-fog-100 font-medium truncate">
              {profile.label}
            </span>
            {profile.configured ? (
              <span className="text-[9.5px] uppercase tracking-[0.14em] text-violet-soft px-1.5 py-[1px] rounded-full bg-violet-soft/10 border border-violet-soft/25 shrink-0">
                configured
              </span>
            ) : null}
          </div>
          <div className="text-[11.5px] text-fog-400 mt-0.5 flex items-center gap-1.5">
            <span>{profile.vendor ?? "—"}</span>
            <span className="text-fog-500">·</span>
            <span className="truncate">{profile.providerId}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div
            className={cn(
              "text-[11px] flex items-center justify-end gap-1.5",
              isOnline ? "text-emerald-300/90" : "text-fog-400",
            )}
          >
            <span
              className={cn(
                "pulse-dot",
                isOnline ? "text-emerald-400" : "text-fog-500",
              )}
            />
            {isOnline ? "Online" : "Offline"}
          </div>
          <div className="mono text-[10.5px] text-fog-500 mt-1">
            {profile.runs} runs · ${profile.costUsd.toFixed(2)}
          </div>
        </div>
      </div>
      <div className="px-4 pb-3 flex items-center gap-1.5">
        <CapTick
          label="ON?"
          value={profile.available ? 100 : 0}
          tone={toneForVendor(profile.vendor)}
        />
        <CapTick
          label="Runs"
          value={Math.min(100, profile.runs * 4)}
          tone={toneForVendor(profile.vendor)}
        />
        <CapTick
          label="Ok"
          value={profile.successRate ? profile.successRate * 100 : 0}
          tone={toneForVendor(profile.vendor)}
        />
        <CapTick
          label="Spend"
          value={Math.min(100, profile.costUsd * 8)}
          tone={toneForVendor(profile.vendor)}
        />
        <CapTick
          label="Lat"
          value={
            profile.latencyP95Ms !== null
              ? Math.max(0, 100 - Math.min(100, profile.latencyP95Ms / 200))
              : 0
          }
          tone={toneForVendor(profile.vendor)}
        />
      </div>
    </button>
  );
}

function CapTick({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: AgentTone;
}) {
  const t = TONE[tone];
  return (
    <div className="flex-1 min-w-0" title={`${label} ${Math.round(value)}`}>
      <div className="mono text-[9px] uppercase tracking-[0.12em] text-fog-500 truncate">
        {label}
      </div>
      <div className="h-[3px] mt-1 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className={cn("h-full rounded-full", t.bar)}
          style={{ width: `${value}%`, opacity: 0.85 }}
        />
      </div>
    </div>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────

function AgentDetail({
  profile,
  testResult,
  setupBusy,
  testBusy,
  onConfigure,
  onTest,
  onSetDefault,
}: {
  profile: AgentProfile;
  testResult: Awaited<ReturnType<typeof api.testProvider>> | null;
  setupBusy: boolean;
  testBusy: boolean;
  onConfigure: () => void;
  onTest: () => void;
  onSetDefault: () => void;
}) {
  const tone = TONE[toneForVendor(profile.vendor)];
  const capability = {
    Plan: Math.round((profile.successRate ?? 0.5) * 90 + 10),
    Execute: profile.runs > 0 ? Math.min(95, 60 + profile.runs * 2) : 30,
    Review:
      profile.latencyP95Ms !== null
        ? Math.max(40, 100 - profile.latencyP95Ms / 200)
        : 50,
    Speed:
      profile.latencyP50Ms !== null
        ? Math.max(20, 100 - profile.latencyP50Ms / 100)
        : 40,
    Cost: profile.costUsd > 0 ? Math.max(20, 100 - profile.costUsd * 10) : 80,
  };

  return (
    <div className="bevel-violet top-rim p-[1px]">
      <div className="rounded-[13px] surface-ink-100-70 backdrop-blur-2xl">
        <div className="px-6 pt-6 pb-5 flex items-start gap-4">
          <span
            className={cn(
              "rounded-xl bg-gradient-to-br ring-1 flex items-center justify-center shrink-0",
              tone.grad,
              tone.ring,
              tone.text,
            )}
            style={{ width: 56, height: 56 }}
          >
            <span className="text-display text-[28px] leading-none">
              {avatarLetter(profile)}
            </span>
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="eyebrow">
                {profile.vendor ?? "Vendor unknown"} · {profile.providerId}
              </span>
              <Chip tone={profile.available ? "emerald" : "neutral"}>
                <span className="pulse-dot" />{" "}
                {profile.available ? "Online" : "Offline"}
              </Chip>
              {profile.configured ? (
                <Chip tone="violet">configured</Chip>
              ) : (
                <Chip tone="amber">not configured</Chip>
              )}
            </div>
            <h2 className="text-display text-[28px] leading-tight">
              {profile.label}
            </h2>
            <p className="text-fog-300 text-[13px] mt-1">
              {profile.lastSeenAt
                ? `Last seen ${relTime(profile.lastSeenAt)} · ${profile.runs} runs in the last 7d`
                : "No recent activity. Once a run uses this agent, it shows up here."}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={onConfigure}
              iconLeft={<SettingsIcon className="h-3 w-3" strokeWidth={1.7} />}
            >
              {setupBusy ? "Configuring…" : "Configure"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onTest}
              disabled={!profile.configured || testBusy}
              title={
                !profile.configured
                  ? "Configure the provider before testing."
                  : undefined
              }
              iconLeft={<Play className="h-3 w-3" strokeWidth={1.7} />}
            >
              {testBusy ? "Testing…" : "Test prompt"}
            </Button>
            {profile.configured ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={onSetDefault}
                disabled={setupBusy}
              >
                Set as default
              </Button>
            ) : null}
          </div>
        </div>

        {testResult ? (
          <div
            className={cn(
              "mx-6 mb-4 -mt-2 rounded-xl border px-4 py-3 text-[12px]",
              testResult.ok
                ? "border-emerald-400/30 bg-emerald-500/[0.05]"
                : "border-rose-400/30 bg-rose-500/[0.05]",
            )}
          >
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="eyebrow">
                {testResult.ok ? "✓ Test passed" : "✗ Test failed"}
              </div>
              <span className="mono text-[10.5px] text-fog-400">
                exit {testResult.exitCode} · {testResult.durationMs} ms
              </span>
            </div>
            {testResult.hint ? (
              <div className="text-fog-200 mb-2">{testResult.hint}</div>
            ) : null}
            {testResult.stdout ? (
              <pre className="mono text-[11px] text-fog-300 overflow-x-auto max-h-24 whitespace-pre-wrap break-all">
                {testResult.stdout.slice(0, 600)}
                {testResult.stdout.length > 600 ? "…" : ""}
              </pre>
            ) : null}
            {testResult.stderr ? (
              <pre className="mono text-[11px] text-rose-300/80 overflow-x-auto max-h-24 whitespace-pre-wrap break-all mt-1">
                {testResult.stderr.slice(0, 400)}
              </pre>
            ) : null}
          </div>
        ) : null}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-white/[0.06] border-y border-white/[0.06]">
          <DetailStat label="Runs · 7d" value={String(profile.runs)} tone="violet" />
          <DetailStat
            label="Success"
            value={
              profile.successRate !== null
                ? `${Math.round(profile.successRate * 100)}%`
                : "—"
            }
            tone="emerald"
          />
          <DetailStat
            label="p50 latency"
            value={
              profile.latencyP50Ms !== null
                ? fmtElapsed(Math.round(profile.latencyP50Ms / 1000))
                : "—"
            }
          />
          <DetailStat
            label="p95 latency"
            value={
              profile.latencyP95Ms !== null
                ? fmtElapsed(Math.round(profile.latencyP95Ms / 1000))
                : "—"
            }
            tone="amber"
          />
          <DetailStat label="Spend · 7d" value={`$${profile.costUsd.toFixed(2)}`} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 p-6">
          <div className="lg:col-span-5">
            <SectionEyebrow className="mb-3">
              <span>Capability profile</span>
            </SectionEyebrow>
            <CapabilityRadar
              capability={capability}
              tone={toneForVendor(profile.vendor)}
            />
            <div className="mt-3 grid grid-cols-5 gap-1.5">
              {Object.entries(capability).map(([k, v]) => (
                <div key={k} className="text-center">
                  <div
                    className={cn(
                      "mono text-[13px] font-medium num-tabular",
                      tone.text,
                    )}
                  >
                    {v}
                  </div>
                  <div className="mono text-[9px] uppercase tracking-[0.12em] text-fog-500 mt-0.5">
                    {k}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-7 space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="eyebrow">Throughput · last 14h</span>
                <span className="mono text-[11px] text-fog-400">
                  peak {Math.max(...profile.throughputSpark, 0)}/h
                </span>
              </div>
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.015] px-3 py-2.5">
                <Sparkline
                  values={
                    profile.throughputSpark.length > 0
                      ? profile.throughputSpark
                      : [0]
                  }
                  tone={toneForVendor(profile.vendor)}
                  width={600}
                  height={68}
                  className="w-full h-auto"
                />
              </div>
            </div>

            <div>
              <SectionEyebrow className="mb-2">
                <span>Trained skills · {profile.skills.length}</span>
              </SectionEyebrow>
              {profile.skills.length === 0 ? (
                <div className="text-[12px] text-fog-400">
                  No skills have been attached to this agent yet.
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {profile.skills.map((id) => (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.02] px-2.5 py-[3px] text-[11.5px] text-fog-200"
                    >
                      <ToneDot tone="violet" /> {id}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <SectionEyebrow className="mb-2">
                <span>Status</span>
              </SectionEyebrow>
              <ul className="space-y-1.5 text-[12.5px]">
                <Row
                  icon={<Cpu className="h-3 w-3 text-violet-soft" strokeWidth={1.7} />}
                  label="Provider id"
                  value={profile.providerId}
                />
                <Row
                  icon={<Plus className="h-3 w-3 text-fog-400" strokeWidth={1.7} />}
                  label="Configured in project.yml"
                  value={profile.configured ? "yes" : "no"}
                />
                <Row
                  icon={<ChevronRight className="h-3 w-3 text-fog-400" strokeWidth={1.7} />}
                  label="Last run"
                  value={
                    profile.lastSeenAt ? relTime(profile.lastSeenAt) : "—"
                  }
                />
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <li className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-fog-300">
        {icon}
        {label}
      </span>
      <span className="mono text-fog-100 num-tabular">{value}</span>
    </li>
  );
}

function DetailStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "emerald" | "violet" | "amber";
}) {
  const cls = {
    neutral: "text-fog-100",
    emerald: "text-emerald-300",
    violet: "text-violet-soft",
    amber: "text-amber-300",
  }[tone];
  return (
    <div className="surface-ink-100-70 px-4 py-3">
      <div className="eyebrow">{label}</div>
      <div
        className={cn(
          "mt-1 text-[18px] font-semibold tracking-tight num-tabular",
          cls,
        )}
      >
        {value}
      </div>
    </div>
  );
}

function CapabilityRadar({
  capability,
  tone = "violet",
}: {
  capability: Record<string, number>;
  tone?: AgentTone;
}) {
  const labels = Object.keys(capability);
  const values = Object.values(capability);
  const n = labels.length;
  const size = 240;
  const cx = size / 2;
  const cy = size / 2;
  const r = 86;
  const colors: Record<AgentTone, string> = {
    violet: "#a78bfa",
    sky: "#7cc5ff",
    amber: "#fbbf24",
    emerald: "#4ade80",
    rose: "#fb7185",
  };
  const c = colors[tone];

  const pt = (i: number, val: number) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const rr = (val / 100) * r;
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr] as const;
  };
  const polygon = values.map((v, i) => pt(i, v).join(",")).join(" ");
  const rings = [25, 50, 75, 100];

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.015] p-3 flex items-center justify-center">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        {rings.map((p) => (
          <polygon
            key={p}
            points={Array.from({ length: n }, (_, i) => pt(i, p).join(",")).join(" ")}
            fill="none"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth="1"
          />
        ))}
        {labels.map((_, i) => {
          const [x, y] = pt(i, 100);
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke="rgba(255,255,255,0.05)"
            />
          );
        })}
        <polygon
          points={polygon}
          fill={c}
          fillOpacity="0.18"
          stroke={c}
          strokeWidth="1.5"
        />
        {values.map((v, i) => {
          const [x, y] = pt(i, v);
          return <circle key={i} cx={x} cy={y} r="3" fill={c} />;
        })}
        {labels.map((l, i) => {
          const [x, y] = pt(i, 122);
          return (
            <text
              key={l}
              x={x}
              y={y}
              fill="#9aa0b3"
              fontSize="10"
              textAnchor="middle"
              dominantBaseline="middle"
              fontFamily="Geist Mono, monospace"
              style={{ letterSpacing: "0.12em", textTransform: "uppercase" }}
            >
              {l}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

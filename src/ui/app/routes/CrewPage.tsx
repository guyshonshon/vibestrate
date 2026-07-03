import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Cpu,
  PenLine,
  Plus,
  Save,
  X,
} from "lucide-react";
import { api, type CrewPresetView } from "../../lib/api.js";
import type {
  CrewView,
  CrewRoleView,
  ProfileView,
  ProviderCatalog,
  DiscoveredFlow,
  DiscoveredSkill,
} from "../../lib/types.js";
import { Button } from "../../components/design/Button.js";
import { SuggestInput } from "../../components/design/SuggestInput.js";
import { EffortScale } from "../../components/design/EffortScale.js";
import { StatTile } from "../../components/design/StatTile.js";
import { EntityIcon } from "../../components/design/EntityIcon.js";
import { PageShell, PageHeader, Section } from "../../components/layout/PageShell.js";

const EMPTY_CAPS = { models: [], modelEnabled: false, powerLevels: [] };
import { ToneDot, type ChipTone } from "../../components/design/Chip.js";
import { Select } from "../../components/design/Select.js";
import { cn } from "../../components/design/cn.js";

// Deterministic tone per role so a role keeps the same accent across renders.
const TONES: ChipTone[] = ["violet", "sky", "emerald", "amber", "rose"];
function toneFor(roleId: string): ChipTone {
  let h = 0;
  for (const ch of roleId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length]!;
}

// Tailwind can't see runtime-built class names, so map each tone to literal
// classes (these strings appear verbatim for the JIT to pick up). All tones map
// through the coal/chalk/accent palette so they flip correctly in both themes -
// no raw hex, no `.slab`.
// The role card's tonal header wash - the task hero's tonal-anchor treatment
// (TaskOverviewPanel TONE.colBg): colour as a structural surface region inside
// an overflow-hidden card, never an edge stripe.
const TONE_WASH: Record<ChipTone, string> = {
  neutral: "bg-coal-500/40",
  violet: "bg-violet-soft/[0.08]",
  sky: "bg-sky-glow/[0.08]",
  emerald: "bg-emerald-500/[0.09]",
  amber: "bg-amber-500/[0.09]",
  rose: "bg-rose-500/[0.09]",
};
// The role avatar chip (initials) - tinted fill + accent text.
const TONE_AVATAR: Record<ChipTone, string> = {
  neutral: "bg-coal-500 text-chalk-300",
  violet: "bg-violet-soft/14 text-violet-soft",
  sky: "bg-sky-glow/14 text-sky-glow",
  emerald: "bg-emerald-400/14 text-emerald-400",
  amber: "bg-amber-soft/14 text-amber-soft",
  rose: "bg-rose-400/14 text-rose-300",
};
// A seat this role takes (selected state), toned to the role.
const TONE_SEAT_ON: Record<ChipTone, string> = {
  neutral: "border-chalk-400/40 bg-coal-500 text-chalk-100",
  violet: "border-violet-soft/40 bg-violet-soft/10 text-chalk-100",
  sky: "border-sky-glow/40 bg-sky-glow/10 text-chalk-100",
  emerald: "border-emerald-400/40 bg-emerald-400/10 text-chalk-100",
  amber: "border-amber-soft/40 bg-amber-soft/10 text-chalk-100",
  rose: "border-rose-400/40 bg-rose-400/10 text-chalk-100",
};

const PERMISSION_OPTIONS = [
  "read_only",
  "code_write",
  "review_only",
  "verify_only",
];

type SeatStatus = "covered" | "uncovered" | "ambiguous";
type SeatCoverageEntry = { roleIds: string[]; status: SeatStatus };
type Toast = { kind: "ok" | "err"; text: string } | null;

/** Seats any flow asks for (plus seats the crew already assigns) and how many
 *  of the crew's roles fill each - shared by the hub cards and the config page
 *  so the numbers always agree. Pure. */
function computeCoverage(
  crew: CrewView | null,
  flows: DiscoveredFlow[],
): { knownSeats: string[]; coverage: Map<string, SeatCoverageEntry> } {
  const set = new Set<string>();
  for (const f of flows) {
    for (const seatId of Object.keys(f.definition.seats ?? {})) set.add(seatId);
  }
  for (const r of crew?.roles ?? []) for (const s of r.seats) set.add(s);
  const knownSeats = [...set].sort();
  const coverage = new Map<string, SeatCoverageEntry>();
  for (const seat of knownSeats) {
    const roleIds = (crew?.roles ?? [])
      .filter((r) => r.seats.includes(seat))
      .map((r) => r.id);
    const status: SeatStatus =
      roleIds.length === 0 ? "uncovered" : roleIds.length > 1 ? "ambiguous" : "covered";
    coverage.set(seat, { roleIds, status });
  }
  return { knownSeats, coverage };
}

export function CrewPage({
  crewId,
  onOpenCrew,
  onBackToCrews,
}: {
  /** null = the crews hub (list); set = that crew's configuration page. */
  crewId: string | null;
  onOpenCrew: (crewId: string) => void;
  onBackToCrews: () => void;
}) {
  const [crews, setCrews] = useState<CrewView[] | null>(null);
  const [defaultCrew, setDefaultCrew] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<ProfileView[]>([]);
  const [providers, setProviders] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<ProviderCatalog>({});
  const [flows, setFlows] = useState<DiscoveredFlow[]>([]);
  const [skills, setSkills] = useState<DiscoveredSkill[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [savingRole, setSavingRole] = useState<string | null>(null);
  const [settingDefault, setSettingDefault] = useState(false);

  async function load() {
    try {
      const [crewsRes, profilesRes, flowsRes, skillsRes, meta, cat] = await Promise.all([
        api.getCrews(),
        api.getProfiles().catch(() => ({ profiles: [] as ProfileView[] })),
        api
          .listFlows()
          .catch(() => ({ flows: [] as DiscoveredFlow[], invalid: [] })),
        api.listSkills().catch(() => ({ skills: [] as DiscoveredSkill[] })),
        api.getProjectMetadata().catch(() => null),
        api.getProviderCatalog().catch(() => ({ catalog: {} as ProviderCatalog })),
      ]);
      setCrews(crewsRes.crews);
      setDefaultCrew(crewsRes.defaultCrew);
      setProfiles(profilesRes.profiles);
      setCatalog(cat.catalog);
      setProviders(
        [
          ...new Set([
            ...(meta?.providers.map((p) => p.id) ?? []),
            ...profilesRes.profiles.map((p) => p.provider),
          ]),
        ].sort(),
      );
      setFlows(flowsRes.flows);
      setSkills(skillsRes.skills);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function flash(t: Toast) {
    setToast(t);
    if (t) window.setTimeout(() => setToast(null), 3200);
  }

  const crew = useMemo(
    () => crews?.find((c) => c.id === crewId) ?? null,
    [crews, crewId],
  );

  async function makeDefault(id: string) {
    if (id === defaultCrew) return;
    const label = crews?.find((c) => c.id === id)?.label ?? id;
    setSettingDefault(true);
    try {
      await api.setDefaultCrew(id);
      setDefaultCrew(id);
      flash({ kind: "ok", text: `"${label}" is now the default crew.` });
    } catch (err) {
      flash({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSettingDefault(false);
    }
  }

  const { knownSeats, coverage } = useMemo(
    () => computeCoverage(crew, flows),
    [crew, flows],
  );

  async function patchRole(
    roleId: string,
    patch: Parameters<typeof api.patchCrewRole>[2],
    okText: string,
  ) {
    if (!crew) return;
    setSavingRole(roleId);
    try {
      await api.patchCrewRole(crew.id, roleId, patch);
      await load();
      flash({ kind: "ok", text: okText });
    } catch (err) {
      flash({
        kind: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSavingRole(null);
    }
  }

  // Create a new profile inline and assign it to the role in one step - so you
  // can mint "claude-cheap" right where a role needs it (the "connected" path).
  async function createAndAssignProfile(
    roleId: string,
    input: Parameters<typeof api.createProfile>[0],
  ) {
    if (!crew) return;
    setSavingRole(roleId);
    try {
      await api.createProfile(input);
      await api.patchCrewRole(crew.id, roleId, { profile: input.id });
      await load();
      flash({ kind: "ok", text: `Created ${input.id} and assigned it.` });
    } catch (err) {
      flash({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSavingRole(null);
    }
  }

  const hubView = crewId === null;

  return (
    <PageShell>
      {hubView ? (
        // ── Stage 1: the crews hub - a list you select from + presets ───────
        <>
          <PageHeader title="Crews" />
          {error ? <ErrorBanner text={error} /> : null}
          <CrewHub
            crews={crews}
            defaultCrew={defaultCrew}
            flows={flows}
            settingDefault={settingDefault}
            onOpen={onOpenCrew}
            onSetDefault={(id) => void makeDefault(id)}
          />
          <CrewPresets onInstalled={() => void load()} flash={flash} />
        </>
      ) : !crews ? (
        <>
          <PageHeader title="Crew" />
          <div className="text-[13px] text-chalk-300">Loading crew…</div>
        </>
      ) : !crew ? (
        // ── Stage 2 (missing): the requested crew doesn't exist ─────────────
        <>
          <PageHeader
            title="Crew not found"
            actions={
              <Button
                variant="secondary"
                size="sm"
                iconLeft={<ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.9} />}
                onClick={onBackToCrews}
              >
                All crews
              </Button>
            }
          />
          {error ? <ErrorBanner text={error} /> : null}
          <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 px-6 py-8 text-center text-[13px] text-chalk-300">
            No crew named <span className="mono text-chalk-100">{crewId}</span>.
            Pick one from the list instead.
          </div>
        </>
      ) : (
        // ── Stage 2: the selected crew's configuration page ─────────────────
        <>
          <PageHeader
            title={crew.label}
            actions={
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  iconLeft={
                    <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.9} />
                  }
                  onClick={onBackToCrews}
                >
                  All crews
                </Button>
                {crew.id !== defaultCrew ? (
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={settingDefault}
                    onClick={() => void makeDefault(crew.id)}
                    iconLeft={<Check className="h-3.5 w-3.5" strokeWidth={2} />}
                  >
                    {settingDefault ? "Setting…" : "Set as default"}
                  </Button>
                ) : null}
              </>
            }
          >
            {/* Contained header: crew facts as stat tiles + what a crew is. */}
            <div className="mt-4 rounded-[20px] border border-[color:var(--line)] bg-coal-600 p-5">
              <div className="flex items-center gap-2.5">
                <EntityIcon
                  entity="crew"
                  size={18}
                  className="shrink-0 text-violet-soft"
                />
                <h2 className="text-[15px] font-bold text-chalk-100">
                  {crew.label}
                </h2>
                {crew.id === defaultCrew ? (
                  <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-400">
                    <Check className="h-3.5 w-3.5" strokeWidth={2.2} /> runs by
                    default
                  </span>
                ) : null}
              </div>
              <p className="mt-2 max-w-[74ch] text-[13px] leading-[1.55] text-chalk-300">
                A crew is the cast for a run. Each{" "}
                <strong className="font-semibold text-chalk-100">role</strong>{" "}
                runs on a{" "}
                <strong className="font-semibold text-chalk-100">profile</strong>{" "}
                (the model + effort) and claims one or more{" "}
                <strong className="font-semibold text-chalk-100">seats</strong>.
                When a run starts, the flow's required seats are matched to these
                roles.
              </p>
              <div className="mt-3 flex flex-wrap items-stretch gap-1">
                <StatTile
                  value={crew.roles.length}
                  label={crew.roles.length === 1 ? "role" : "roles"}
                />
                {crew.maxReviewLoops !== null ? (
                  <StatTile
                    value={crew.maxReviewLoops}
                    label={crew.maxReviewLoops === 1 ? "review loop" : "review loops"}
                  />
                ) : null}
              </div>
            </div>
          </PageHeader>

          {error ? <ErrorBanner text={error} /> : null}

          <SeatCoverage seats={knownSeats} coverage={coverage} crew={crew} />
          <Section title="Roles">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {crew.roles.map((role) => (
                <RoleCard
                  key={role.id}
                  crewId={crew.id}
                  role={role}
                  profiles={profiles}
                  providers={providers}
                  catalog={catalog}
                  existingProfileIds={new Set(profiles.map((p) => p.id))}
                  knownSeats={knownSeats}
                  skills={skills}
                  coverage={coverage}
                  saving={savingRole === role.id}
                  onPatch={(patch, okText) =>
                    void patchRole(role.id, patch, okText)
                  }
                  onCreateProfile={(input) =>
                    void createAndAssignProfile(role.id, input)
                  }
                  onFlash={flash}
                />
              ))}
            </div>
          </Section>
        </>
      )}

      {toast ? (
        <div
          className={cn(
            "fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-[12px] border px-3.5 py-2 text-[12.5px] shadow-2xl",
            toast.kind === "ok"
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
              : "border-rose-400/30 bg-rose-500/10 text-rose-200",
          )}
        >
          {toast.kind === "ok" ? (
            <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />
          ) : (
            <X className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />
          )}
          {toast.text}
        </div>
      ) : null}
    </PageShell>
  );
}

/** Inline page-level error banner in the new idiom. */
function ErrorBanner({ text }: { text: string }) {
  return (
    <div className="mb-4 rounded-[12px] border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-300">
      {text}
    </div>
  );
}

// ─── Crews hub (the list you select from) ───────────────────────────────────

/** Ready-made crews (fast / thorough / cheap / local) the user can install with
 *  one click - parity with `vibe crew presets`. Self-contained: fetches its own
 *  list (with availability + what each would do) and asks the parent to reload
 *  the crews hub after an install. */
function CrewPresets({
  onInstalled,
  flash,
}: {
  onInstalled: () => void;
  flash: (t: Toast) => void;
}) {
  const [presets, setPresets] = useState<CrewPresetView[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      const r = await api.getCrewPresets();
      setPresets(r.presets);
    } catch {
      setPresets([]);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function install(id: string) {
    setBusy(id);
    try {
      const res = await api.installCrewPreset(id);
      flash({ kind: "ok", text: `Installed "${res.crewId}" crew (profile ${res.profileId}).` });
      await load();
      onInstalled();
    } catch (err) {
      flash({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  if (!presets || presets.length === 0) return null;

  // The preset's effect surfaced as stat tiles so facts read as data, not a
  // grey dot-separated meta line.
  type Stat = { value: string | number; label: string };
  const effectStats = (e: NonNullable<CrewPresetView["effect"]>): Stat[] => {
    const rows: (Stat | null)[] = [
      { value: e.provider, label: "provider" },
      e.power ? { value: e.power, label: "effort" } : null,
      e.model ? { value: e.model, label: "model" } : null,
      e.maxReviewLoops !== null
        ? {
            value: e.maxReviewLoops,
            label: e.maxReviewLoops === 1 ? "review loop" : "review loops",
          }
        : null,
    ];
    return rows.filter((x): x is Stat => x !== null);
  };

  return (
    <div id="crew-presets">
    <Section title="Presets">
      <p className="mb-3 max-w-[74ch] text-[13px] leading-[1.55] text-chalk-300">
        Ready-made crews over the same roster as your default crew - faster, more
        thorough, cheaper, or local. Adds to{" "}
        <span className="mono text-chalk-100">project.yml</span> without
        overwriting anything.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {presets.map((p) => (
          <div
            key={p.id}
            className="flex flex-col rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4"
          >
            <div className="flex items-center gap-2">
              <EntityIcon
                entity="crew"
                size={16}
                className="shrink-0 text-violet-soft"
              />
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-chalk-100">
                {p.label}
              </span>
              {p.installed ? (
                <span className="shrink-0 text-[11px] font-semibold text-emerald-400">
                  installed
                </span>
              ) : !p.available ? (
                <span className="shrink-0 text-[11px] font-medium text-chalk-400">
                  n/a here
                </span>
              ) : null}
            </div>
            <p className="mt-2 line-clamp-2 text-[12px] leading-snug text-chalk-300">
              {p.description}
            </p>
            {!p.installed && p.available && p.effect ? (
              <div className="mt-3 flex flex-wrap items-stretch gap-1">
                {effectStats(p.effect).map((s, i) => (
                  <StatTile key={i} value={s.value} label={s.label} />
                ))}
              </div>
            ) : null}
            {!p.available && p.reason ? (
              <p className="mt-2 text-[11.5px] text-amber-soft">{p.reason}</p>
            ) : null}
            {!p.installed && p.available ? (
              <div className="mt-3.5 flex items-center gap-1.5 border-t border-[color:var(--line-soft)] pt-3">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy === p.id}
                  iconLeft={<Plus className="h-3.5 w-3.5" strokeWidth={2} />}
                  onClick={() => void install(p.id)}
                >
                  {busy === p.id ? "Adding…" : "Add to crews"}
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </Section>
    </div>
  );
}

function CrewHub({
  crews,
  defaultCrew,
  flows,
  settingDefault,
  onOpen,
  onSetDefault,
}: {
  crews: CrewView[] | null;
  defaultCrew: string | null;
  flows: DiscoveredFlow[];
  settingDefault: boolean;
  onOpen: (crewId: string) => void;
  onSetDefault: (crewId: string) => void;
}) {
  return (
    <Section
      title="Your crews"
      action={
        crews && crews.length > 0 ? (
          <span className="mono text-[12px] text-chalk-400">
            {crews.length} {crews.length === 1 ? "crew" : "crews"}
          </span>
        ) : null
      }
    >
      <p className="mb-4 max-w-[74ch] text-[13px] leading-[1.55] text-chalk-300">
        Each crew is a roster of roles. Pick one to configure its roles,
        profiles, and seats - or set the one runs use by default.
      </p>

      {!crews ? (
        <div className="text-[13px] text-chalk-300">Loading crews…</div>
      ) : crews.length === 0 ? (
        // Empty state is a CTA, not a dead end - a preset below installs one.
        <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 px-6 py-8 text-center">
          <p className="text-[13px] text-chalk-300">
            No crews yet. Install a ready-made preset to get your first roster.
          </p>
          <div className="mt-3 flex justify-center">
            <Button
              variant="primary"
              size="sm"
              iconLeft={<Plus className="h-3.5 w-3.5" strokeWidth={2} />}
              onClick={() => {
                document
                  .getElementById("crew-presets")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              Add a crew preset
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {crews.map((c) => {
            const { knownSeats, coverage } = computeCoverage(c, flows);
            const uncovered = knownSeats.filter(
              (s) => coverage.get(s)?.status === "uncovered",
            ).length;
            const ambiguous = knownSeats.filter(
              (s) => coverage.get(s)?.status === "ambiguous",
            ).length;
            const isDefault = c.id === defaultCrew;
            const seatStats: { value: string | number; label: string; tone?: "emerald" | "amber" | "rose" }[] = [
              { value: c.roles.length, label: c.roles.length === 1 ? "role" : "roles" },
              uncovered > 0
                ? { value: uncovered, label: uncovered === 1 ? "uncovered seat" : "uncovered seats", tone: "rose" as const }
                : { value: "all", label: "seats filled", tone: "emerald" as const },
              ...(ambiguous > 0
                ? [{ value: ambiguous, label: "ambiguous", tone: "amber" as const }]
                : []),
            ];
            return (
              <div
                key={c.id}
                className={cn(
                  "flex flex-col rounded-[18px] border bg-coal-600 p-4",
                  isDefault
                    ? "border-emerald-500/40"
                    : "border-[color:var(--line)]",
                )}
              >
                <div className="flex items-center gap-2">
                  <EntityIcon
                    entity="crew"
                    size={16}
                    className="shrink-0 text-violet-soft"
                  />
                  <button
                    type="button"
                    onClick={() => onOpen(c.id)}
                    className="min-w-0 flex-1 truncate bg-transparent p-0 text-left text-[13.5px] font-bold text-chalk-100 transition hover:text-violet-soft"
                  >
                    {c.label}
                  </button>
                  {isDefault ? (
                    <span className="shrink-0 text-[10px] font-bold text-emerald-400">
                      default
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap items-stretch gap-1">
                  {seatStats.map((s, i) => (
                    <StatTile
                      key={i}
                      value={s.value}
                      label={s.label}
                      tone={s.tone}
                    />
                  ))}
                </div>
                <div className="mt-3.5 flex items-center gap-1.5 border-t border-[color:var(--line-soft)] pt-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onOpen(c.id)}
                  >
                    Configure
                  </Button>
                  {!isDefault ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={settingDefault}
                      onClick={() => onSetDefault(c.id)}
                    >
                      Set default
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

// ─── Seat coverage strip ────────────────────────────────────────────────────

function SeatCoverage({
  seats,
  coverage,
  crew,
}: {
  seats: string[];
  coverage: Map<string, SeatCoverageEntry>;
  crew: CrewView;
}) {
  if (seats.length === 0) return null;
  const uncovered = seats.filter((s) => coverage.get(s)?.status === "uncovered");
  const ambiguous = seats.filter((s) => coverage.get(s)?.status === "ambiguous");
  // Problem seats first (empty, then ambiguous, then filled) so the things
  // that need attention sit at the front of the list.
  const order: Record<SeatStatus, number> = {
    uncovered: 0,
    ambiguous: 1,
    covered: 2,
  };
  const sortedSeats = [...seats].sort(
    (a, b) =>
      order[coverage.get(a)!.status] - order[coverage.get(b)!.status] ||
      a.localeCompare(b),
  );
  return (
    <Section title="Seat coverage">
      <div className="rounded-[20px] border border-[color:var(--line)] bg-coal-600 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-bold text-chalk-100">
          Which seats the roles fill
        </span>
        <span className="text-[13px] font-semibold text-emerald-400">
          {seats.length - uncovered.length}/{seats.length} filled
        </span>
      </div>
      <p className="mt-1.5 max-w-[80ch] text-[12.5px] leading-[1.55] text-chalk-300">
        A <strong className="text-chalk-100">seat</strong> is a slot a flow can
        ask for. Each should be filled by exactly one role below - a run can only
        use a flow whose seats this crew all fills.
      </p>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[11.5px] text-chalk-300">
        <span className="inline-flex items-center gap-1.5">
          <ToneDot tone="emerald" /> filled by one role
        </span>
        <span className="inline-flex items-center gap-1.5">
          <ToneDot tone="amber" /> filled by several - a run picks which
        </span>
        <span className="inline-flex items-center gap-1.5">
          <ToneDot tone="rose" /> empty - a flow needing it fails
        </span>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {sortedSeats.map((seat) => {
          const c = coverage.get(seat)!;
          const tone: ChipTone =
            c.status === "covered"
              ? "emerald"
              : c.status === "ambiguous"
                ? "amber"
                : "rose";
          const roleLabels = c.roleIds
            .map((id) => crew.roles.find((r) => r.id === id)?.label ?? id)
            .join(", ");
          return (
            <span
              key={seat}
              className="inline-flex items-center gap-2 rounded-[12px] border border-[color:var(--line)] bg-coal-500/60 px-2.5 py-1.5 text-[12px]"
            >
              <ToneDot tone={tone} />
              <span className="font-medium text-chalk-100">{seat}</span>
              <span className="ml-auto truncate pl-2 text-[11px] text-chalk-300">
                {c.status === "uncovered"
                  ? "no role"
                  : c.status === "ambiguous"
                    ? `${c.roleIds.length} roles`
                    : roleLabels}
              </span>
            </span>
          );
        })}
      </div>
      {uncovered.length > 0 || ambiguous.length > 0 ? (
        <p className="mt-3 text-[12px] leading-[1.5] text-chalk-300">
          {uncovered.length > 0 ? (
            <>
              <span className="font-semibold text-rose-300">
                {uncovered.join(", ")}
              </span>{" "}
              {uncovered.length === 1 ? "has" : "have"} no role - assign{" "}
              {uncovered.length === 1 ? "it" : "them"} below.{" "}
            </>
          ) : null}
          {ambiguous.length > 0 ? (
            <>
              <span className="font-semibold text-amber-soft">
                {ambiguous.join(", ")}
              </span>{" "}
              {ambiguous.length === 1 ? "is" : "are"} filled by more than one role
              - a run will ask which.
            </>
          ) : null}
        </p>
      ) : null}
      </div>
    </Section>
  );
}

// ─── Role card ──────────────────────────────────────────────────────────────

function RoleCard({
  crewId,
  role,
  profiles,
  providers,
  catalog,
  existingProfileIds,
  knownSeats,
  skills,
  coverage,
  saving,
  onPatch,
  onCreateProfile,
  onFlash,
}: {
  crewId: string;
  role: CrewRoleView;
  profiles: ProfileView[];
  providers: string[];
  catalog: ProviderCatalog;
  existingProfileIds: Set<string>;
  knownSeats: string[];
  skills: DiscoveredSkill[];
  coverage: Map<string, SeatCoverageEntry>;
  saving: boolean;
  onPatch: (
    patch: Parameters<typeof api.patchCrewRole>[2],
    okText: string,
  ) => void;
  onCreateProfile: (input: Parameters<typeof api.createProfile>[0]) => void;
  onFlash: (t: Toast) => void;
}) {
  const tone = toneFor(role.id);
  const profile = profiles.find((p) => p.id === role.profile) ?? null;
  const [promptOpen, setPromptOpen] = useState(false);
  const [newProfileOpen, setNewProfileOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-[18px] border border-[color:var(--line)] bg-coal-600">
      {/* Tonal header band - the hero's status-column treatment, horizontal:
          the role's tone is a washed surface region split off by a hairline. */}
      <div
        className={cn(
          "flex items-start justify-between gap-3 border-b border-[color:var(--line-soft)] px-4 py-3",
          TONE_WASH[tone],
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] mono text-[15px] font-bold uppercase",
              TONE_AVATAR[tone],
            )}
          >
            {role.label.slice(0, 2)}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-bold leading-tight text-chalk-100">
              {role.label}
            </div>
            {/* The id is only worth showing when it adds something the label
                doesn't - e.g. "executor" under "Backend Implementer". For the
                common case where it's just the label's slug ("Fixer"/"fixer"),
                the duplicate line is noise, so we drop it. */}
            {role.id.toLowerCase() !==
            role.label.toLowerCase().replace(/[^a-z0-9]+/g, "") ? (
              <div className="mono truncate text-[11px] text-chalk-300">
                {role.id}
              </div>
            ) : null}
          </div>
        </div>
        {/* Permission renders as flat tinted text, not a pill. */}
        <span
          className={cn(
            "mono shrink-0 text-[11px] font-semibold",
            role.permissions === "code_write"
              ? "text-amber-soft"
              : "text-chalk-300",
          )}
        >
          {role.permissions}
        </span>
      </div>

      {/* body */}
      <div className="flex flex-col gap-4 p-4">
      {/* seats */}
      <div>
        <div className="mb-1.5 text-[12px] font-semibold text-violet-vivid">
          Seats it takes
        </div>
        <div className="flex flex-wrap gap-1.5">
          {knownSeats.map((seat) => {
            const on = role.seats.includes(seat);
            const ambiguous = on && coverage.get(seat)?.status === "ambiguous";
            return (
              <button
                key={seat}
                type="button"
                disabled={saving}
                onClick={() => {
                  const next = on
                    ? role.seats.filter((s) => s !== seat)
                    : [...role.seats, seat];
                  if (next.length === 0) {
                    onFlash({
                      kind: "err",
                      text: "A role must keep at least one seat.",
                    });
                    return;
                  }
                  onPatch(
                    { seats: next },
                    on
                      ? `Removed ${seat} from ${role.label}.`
                      : `${role.label} now takes ${seat}.`,
                  );
                }}
                className={cn(
                  "inline-flex items-center gap-1 rounded-[10px] border px-2 py-1 text-[11.5px] transition disabled:opacity-50",
                  on
                    ? ambiguous
                      ? "border-amber-soft/40 bg-amber-soft/10 text-amber-soft"
                      : TONE_SEAT_ON[tone]
                    : "border-[color:var(--line)] bg-transparent text-chalk-400 hover:border-[color:var(--line-strong)] hover:text-chalk-200",
                )}
              >
                {on ? <ToneDot tone={tone} /> : <Plus className="h-2.5 w-2.5" />}
                {seat}
              </button>
            );
          })}
        </div>
      </div>

      {/* profile */}
      <div>
        <div className="mb-2 text-[12px] font-semibold text-violet-vivid">
          Profile (runtime)
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={role.profile}
            disabled={saving}
            ariaLabel="Profile"
            className="min-w-[170px]"
            onChange={(v) =>
              onPatch({ profile: v }, `${role.label} now runs on ${v}.`)
            }
            options={[
              ...profiles.map((p) => ({
                value: p.id,
                label: p.label,
                hint: p.model ?? undefined,
              })),
              ...(!profile
                ? [{ value: role.profile, label: `${role.profile} (missing)` }]
                : []),
            ]}
          />
          {profile ? (
            <span className="inline-flex items-center gap-1.5 rounded-[10px] border border-[color:var(--line)] bg-coal-500/60 px-2.5 py-1.5 text-[11.5px] text-chalk-300">
              <Cpu className="h-3 w-3 text-violet-soft" strokeWidth={1.7} />
              <span
                className={cn(
                  "text-chalk-100",
                  !role.providerConfigured && "text-rose-300",
                )}
              >
                {profile.provider}
                {!role.providerConfigured ? " (not set up)" : ""}
              </span>
              {profile.model ? (
                <span className="text-chalk-300">- {profile.model}</span>
              ) : null}
              {profile.power ? (
                <span className="text-chalk-300">- {profile.power}</span>
              ) : null}
            </span>
          ) : (
            <span className="text-[11.5px] text-rose-300">
              profile not found - pick or create one
            </span>
          )}
          <Button
            variant="secondary"
            size="sm"
            disabled={saving}
            iconLeft={<Plus className="h-3.5 w-3.5" strokeWidth={2} />}
            onClick={() => setNewProfileOpen((v) => !v)}
            title="Create a new profile and assign it to this role"
          >
            New profile
          </Button>
          <Select
            value={role.permissions}
            disabled={saving}
            ariaLabel="Permissions"
            className="min-w-[130px]"
            onChange={(v) =>
              onPatch({ permissions: v }, `${role.label} permissions -> ${v}.`)
            }
            options={[
              ...new Set([...PERMISSION_OPTIONS, role.permissions]),
            ].map((p) => ({ value: p, label: p }))}
          />
        </div>
        {newProfileOpen ? (
          <NewProfileInline
            providers={providers}
            catalog={catalog}
            existingProfileIds={existingProfileIds}
            saving={saving}
            onCancel={() => setNewProfileOpen(false)}
            onCreate={(input) => {
              setNewProfileOpen(false);
              onCreateProfile(input);
            }}
          />
        ) : null}
      </div>

      {/* skills */}
      <SkillsRow role={role} skills={skills} saving={saving} onPatch={onPatch} />

      {/* prompt editor */}
      <div className="border-t border-[color:var(--line-soft)] pt-3">
        <button
          type="button"
          onClick={() => setPromptOpen((v) => !v)}
          className="flex items-center gap-1.5 text-[12px] font-semibold text-chalk-300 transition hover:text-chalk-100"
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition",
              promptOpen ? "" : "-rotate-90",
            )}
          />
          <PenLine className="h-3.5 w-3.5" /> Instructions (prompt)
        </button>
        {promptOpen ? (
          <PromptEditor crewId={crewId} role={role} onFlash={onFlash} />
        ) : null}
      </div>
      </div>
    </div>
  );
}

function SkillsRow({
  role,
  skills,
  saving,
  onPatch,
}: {
  role: CrewRoleView;
  skills: DiscoveredSkill[];
  saving: boolean;
  onPatch: (
    patch: Parameters<typeof api.patchCrewRole>[2],
    okText: string,
  ) => void;
}) {
  const [adding, setAdding] = useState(false);
  const available = skills
    .map((s) => s.name)
    .filter((n) => !role.skills.includes(n));
  return (
    <div>
      <div className="mb-1.5 text-[12px] font-semibold text-violet-vivid">
        Skills
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {role.skills.length === 0 && !adding ? (
          available.length > 0 ? (
            // Empty state is a CTA - attach the first skill inline.
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1 rounded-[10px] border border-[color:var(--line)] px-2 py-1 text-[11px] font-medium text-chalk-300 transition hover:border-[color:var(--line-strong)] hover:text-chalk-100"
            >
              <Plus className="h-2.5 w-2.5" /> Attach a skill
            </button>
          ) : (
            <span className="text-[11.5px] text-chalk-400">
              no skills available to attach
            </span>
          )
        ) : (
          role.skills.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 rounded-[10px] border border-[color:var(--line)] bg-coal-500/50 px-2 py-0.5 text-[11px] text-chalk-200"
            >
              {s}
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  onPatch(
                    { skills: role.skills.filter((x) => x !== s) },
                    `Removed skill ${s}.`,
                  )
                }
                className="text-chalk-400 transition hover:text-rose-300"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))
        )}
        {available.length > 0 && (role.skills.length > 0 || adding) ? (
          adding ? (
            <select
              autoFocus
              defaultValue=""
              disabled={saving}
              onChange={(e) => {
                if (e.target.value) {
                  onPatch(
                    { skills: [...role.skills, e.target.value] },
                    `Attached skill ${e.target.value}.`,
                  );
                }
                setAdding(false);
              }}
              onBlur={() => setAdding(false)}
              className="rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 px-1.5 py-0.5 text-[11px] text-chalk-100 outline-none focus:border-violet-soft/50"
            >
              <option value="">+ skill…</option>
              {available.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1 rounded-[10px] border border-[color:var(--line)] px-2 py-0.5 text-[11px] text-chalk-300 transition hover:border-[color:var(--line-strong)] hover:text-chalk-100"
            >
              <Plus className="h-2.5 w-2.5" /> skill
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}

function PromptEditor({
  crewId,
  role,
  onFlash,
}: {
  crewId: string;
  role: CrewRoleView;
  onFlash: (t: Toast) => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [path, setPath] = useState<string>("");

  useEffect(() => {
    let alive = true;
    void api
      .getCrewRoleContext(crewId, role.id)
      .then((r) => {
        if (!alive) return;
        setContent(r.content);
        setPath(r.promptPath);
      })
      .catch((err) => {
        if (alive)
          onFlash({
            kind: "err",
            text: err instanceof Error ? err.message : String(err),
          });
      });
    return () => {
      alive = false;
    };
  }, [crewId, role.id, onFlash]);

  async function save() {
    if (content === null) return;
    setSaving(true);
    try {
      await api.setCrewRoleContext(crewId, role.id, content);
      setDirty(false);
      onFlash({ kind: "ok", text: `Saved ${role.label} instructions.` });
    } catch (err) {
      onFlash({
        kind: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }

  if (content === null) {
    return <div className="mt-2 text-[11.5px] text-chalk-400">Loading…</div>;
  }
  return (
    <div className="mt-2">
      <textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          setDirty(true);
        }}
        spellCheck={false}
        rows={8}
        className="mono w-full resize-y rounded-[12px] border border-[color:var(--line-strong)] bg-coal-800 px-2.5 py-2 text-[11.5px] leading-[1.55] text-chalk-200 outline-none focus:border-violet-soft/50"
      />
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="mono truncate text-[10px] text-chalk-400">{path}</span>
        <Button
          size="sm"
          variant={dirty ? "primary" : "ghost"}
          disabled={!dirty || saving}
          onClick={() => void save()}
          iconLeft={<Save className="h-3 w-3" />}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

// Inline "create a profile and use it here" form, opened from a Role's profile
// row - the connected path so you can mint a preset (e.g. claude-cheap) right
// where a role needs it.
function NewProfileInline({
  providers,
  catalog,
  existingProfileIds,
  saving,
  onCancel,
  onCreate,
}: {
  providers: string[];
  catalog: ProviderCatalog;
  existingProfileIds: Set<string>;
  saving: boolean;
  onCancel: () => void;
  onCreate: (input: Parameters<typeof api.createProfile>[0]) => void;
}) {
  const [id, setId] = useState("");
  const [provider, setProvider] = useState(providers[0] ?? "");
  const [model, setModel] = useState("");
  const [power, setPower] = useState("");
  const caps = catalog[provider] ?? EMPTY_CAPS;
  const idTaken = existingProfileIds.has(id.trim());
  const valid =
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id.trim()) && !idTaken && !!provider;
  const inputCls =
    "rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 px-2 py-1.5 text-[12px] text-chalk-100 placeholder:text-chalk-400 outline-none focus:border-violet-soft/50";

  return (
    <div className="mt-2.5 rounded-[16px] border border-violet-soft/25 bg-coal-800 p-3">
      <div className="mb-2 text-[12px] font-semibold text-violet-vivid">
        New profile for this role
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="id (e.g. claude-cheap)"
          className={cn(inputCls, "w-[160px]", idTaken && "border-rose-400/50")}
          autoFocus
        />
        <select value={provider} onChange={(e) => setProvider(e.target.value)} className={inputCls}>
          {providers.length === 0 ? <option value="">(no providers)</option> : null}
          {providers.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {caps.modelEnabled ? (
          <SuggestInput value={model} onChange={setModel} suggestions={caps.models} placeholder="model" className={cn(inputCls, "w-[130px]")} />
        ) : null}
      </div>
      {caps.powerLevels.length ? (
        <div className="mt-3">
          <div className="mb-1.5 text-[12px] font-semibold text-violet-vivid">
            Effort
          </div>
          <EffortScale levels={caps.powerLevels} value={power} onChange={setPower} />
        </div>
      ) : null}
      <div className="mt-2.5 flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={!valid || saving}
          onClick={() =>
            onCreate({
              id: id.trim(),
              provider,
              model: model.trim() || undefined,
              power: power.trim() || undefined,
            })
          }
        >
          Create and use
        </Button>
      </div>
    </div>
  );
}

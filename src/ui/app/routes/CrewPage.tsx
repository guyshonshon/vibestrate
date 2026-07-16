import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Cpu,
  Eye,
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
import { annularPath } from "../../components/design/ring.js";
import {
  HeroCard,
  type HeroMetric,
  type HeroTone,
} from "../../components/design/HeroCard.js";
import { EntityIcon } from "../../components/design/EntityIcon.js";
import { PageShell, PageHeader, Section } from "../../components/layout/PageShell.js";

const EMPTY_CAPS = { models: [], modelEnabled: false, powerLevels: [] };
import { ToneDot, toneForId, type ChipTone } from "../../components/design/Chip.js";
import {
  useToast,
  ToastView,
  type Toast,
} from "../../components/design/useToast.js";
import { Select } from "../../components/design/Select.js";
import { SegmentedControl } from "../../components/design/SegmentedControl.js";
import { cn } from "../../components/design/cn.js";
import { ErrorState } from "../../components/design/ErrorState.js";
import { ErrorView } from "../../lib/error-view.js";
import { ProvidersView } from "../../components/providers/ProvidersView.js";

/** Top-level tab across the Crew surface: the crews roster, or the providers
 *  management view (relocated here from the retired standalone Providers page).
 *  An interactive segmented control - not a status label. */
type CrewTab = "crews" | "providers";

const CREW_TABS: { value: CrewTab; label: string }[] = [
  { value: "crews", label: "Crews" },
  { value: "providers", label: "Providers" },
];

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

// Human labels for the permission tokens - never surface the raw snake_case id
// (a design anti-pattern: a code slug masquerading as a label).
const PERMISSION_LABEL: Record<string, string> = {
  read_only: "Read only",
  code_write: "Can write",
  review_only: "Review only",
  verify_only: "Verify only",
};

// A seat's work-type category, derived from the permission of the role that
// fills it: read / write / review / verify. "Not all seats are equal" - this is
// their kind of work, and it's complete (every role has a permission) and
// authoritative, unlike per-step flow stages which many seats never set.
const WORKTYPE_LABEL: Record<string, string> = {
  read_only: "Reading",
  code_write: "Writing",
  review_only: "Reviewing",
  verify_only: "Verifying",
};

type SeatStatus = "covered" | "uncovered" | "ambiguous";
type SeatCoverageEntry = { roleIds: string[]; status: SeatStatus };

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
  tab = "crews",
  onOpenCrew,
  onBackToCrews,
  onSwitchTab,
}: {
  /** null = the crews hub (list); set = that crew's configuration page. */
  crewId: string | null;
  /** Which top-level tab is active: the crews roster or the providers view. */
  tab?: CrewTab;
  onOpenCrew: (crewId: string) => void;
  onBackToCrews: () => void;
  onSwitchTab: (tab: CrewTab) => void;
}) {
  const [crews, setCrews] = useState<CrewView[] | null>(null);
  const [defaultCrew, setDefaultCrew] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<ProfileView[]>([]);
  const [providers, setProviders] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<ProviderCatalog>({});
  const [flows, setFlows] = useState<DiscoveredFlow[]>([]);
  const [skills, setSkills] = useState<DiscoveredSkill[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { toast, showToast: flash } = useToast();
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
      {tab === "providers" ? (
        // ── Providers tab: the relocated provider-management surface ────────
        <>
          <PageHeader title="Crew">
            <SegmentedControl
              className="mt-4"
              options={CREW_TABS}
              value="providers"
              onChange={onSwitchTab}
            />
          </PageHeader>
          <ProvidersView />
        </>
      ) : hubView ? (
        // ── Stage 1: the crews hub - a list you select from + presets ───────
        <>
          <PageHeader title="Crew">
            <SegmentedControl
              className="mt-4"
              options={CREW_TABS}
              value="crews"
              onChange={onSwitchTab}
            />
          </PageHeader>
          {error ? <ErrorView err={error} compact /> : null}
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
          {error ? <ErrorView err={error} compact /> : null}
          <ErrorState
            title="Crew not found"
            hint={`No crew named ${crewId}. Pick one from the list, or install a preset to get a roster.`}
            actions={[{ label: "All crews", onClick: onBackToCrews }]}
          />
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
          />

          {error ? <ErrorView err={error} compact /> : null}

          <div className="mt-4 flex flex-col gap-4 xl:flex-row xl:items-stretch">
            <div className="min-w-0 xl:flex-1">
            {/* The crew hero: roster state as the tonal anchor, the explainer
                as the headline sub, facts as the divided metric strip. */}
            {(() => {
              const uncoveredCount = knownSeats.filter(
                (s) => coverage.get(s)?.status === "uncovered",
              ).length;
              const ambiguousCount = knownSeats.filter(
                (s) => coverage.get(s)?.status === "ambiguous",
              ).length;
              const isDefault = crew.id === defaultCrew;
              const tone: HeroTone =
                uncoveredCount > 0
                  ? "rose"
                  : ambiguousCount > 0
                    ? "amber"
                    : isDefault
                      ? "emerald"
                      : "violet";
              const headline =
                uncoveredCount > 0
                  ? "Seats need filling"
                  : ambiguousCount > 0
                    ? "Some seats have several takers"
                    : isDefault
                      ? "This crew runs by default"
                      : "Ready to crew a run";
              return (
                <HeroCard
                  tone={tone}
                  overline="Crew"
                  status={
                    uncoveredCount > 0 ? "gaps" : isDefault ? "default" : "ready"
                  }
                  statusSub={
                    uncoveredCount > 0
                      ? `${uncoveredCount} seat${uncoveredCount === 1 ? "" : "s"} open`
                      : isDefault
                        ? "picked for every run"
                        : null
                  }
                  title={headline}
                  sub={
                    <>
                      A crew is the cast for a run. Each{" "}
                      <strong className="font-semibold text-chalk-100">role</strong>{" "}
                      runs on a{" "}
                      <strong className="font-semibold text-chalk-100">
                        profile
                      </strong>{" "}
                      (the model + effort) and claims one or more{" "}
                      <strong className="font-semibold text-chalk-100">seats</strong>
                      . When a run starts, the flow's required seats are matched to
                      these roles.
                    </>
                  }
                  metrics={[
                    {
                      value: crew.roles.length,
                      label: crew.roles.length === 1 ? "role" : "roles",
                    },
                    uncoveredCount > 0
                      ? {
                          value: uncoveredCount,
                          label: "uncovered",
                          valueClass: "text-rose-300",
                        }
                      : {
                          value: "all",
                          label: "seats filled",
                          valueClass: "text-emerald-400",
                        },
                    ...(crew.maxReviewLoops !== null
                      ? [
                          {
                            value: crew.maxReviewLoops,
                            label:
                              crew.maxReviewLoops === 1
                                ? "review loop"
                                : "review loops",
                          },
                        ]
                      : []),
                  ]}
                  className="xl:h-full"
                >
                  {/* Spacer: at xl the hero stretches to the seat panel's
                      height, so grow the gap and pin the metric strip to the
                      bottom instead of leaving dead space mid-card. */}
                  <div className="hidden grow xl:block" aria-hidden />
                </HeroCard>
              );
            })()}
            </div>
            <SeatCoverage seats={knownSeats} coverage={coverage} crew={crew} />
          </div>
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

      <ToastView toast={toast} />
    </PageShell>
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
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {crews.map((c) => {
            const { knownSeats, coverage } = computeCoverage(c, flows);
            const uncovered = knownSeats.filter(
              (s) => coverage.get(s)?.status === "uncovered",
            ).length;
            const ambiguous = knownSeats.filter(
              (s) => coverage.get(s)?.status === "ambiguous",
            ).length;
            const isDefault = c.id === defaultCrew;
            // The status column carries roster health: gaps beat ambiguity
            // beats readiness; the default crew reads emerald.
            const tone: HeroTone =
              uncovered > 0
                ? "rose"
                : ambiguous > 0
                  ? "amber"
                  : isDefault
                    ? "emerald"
                    : "violet";
            const status =
              uncovered > 0 ? "gaps" : isDefault ? "default" : "ready";
            const statusSub =
              uncovered > 0
                ? `${uncovered} seat${uncovered === 1 ? "" : "s"} open`
                : isDefault
                  ? "runs by default"
                  : ambiguous > 0
                    ? `${ambiguous} ambiguous`
                    : "seats filled";
            const metrics: HeroMetric[] = [
              { value: c.roles.length, label: c.roles.length === 1 ? "role" : "roles" },
              uncovered > 0
                ? { value: uncovered, label: "uncovered", valueClass: "text-rose-300" }
                : { value: "all", label: "seats filled", valueClass: "text-emerald-400" },
              ...(ambiguous > 0
                ? [{ value: ambiguous, label: "ambiguous", valueClass: "text-amber-soft" }]
                : []),
            ];
            return (
              <HeroCard
                key={c.id}
                size="md"
                tone={tone}
                overline="Crew"
                status={status}
                statusSub={statusSub}
                title={
                  <button
                    type="button"
                    onClick={() => onOpen(c.id)}
                    className="inline-flex min-w-0 items-center gap-2 bg-transparent p-0 text-left transition hover:text-violet-soft"
                  >
                    <EntityIcon
                      entity="crew"
                      size={15}
                      className="shrink-0 text-violet-soft"
                    />
                    <span className="truncate">{c.label}</span>
                  </button>
                }
                metrics={metrics}
                footer={
                  <>
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
                  </>
                }
              />
            );
          })}
        </div>
      )}
    </Section>
  );
}

// ─── Seat coverage ──────────────────────────────────────────────────────────

const TONE_TEXT: Record<ChipTone, string> = {
  neutral: "text-chalk-400",
  violet: "text-violet-soft",
  sky: "text-sky-glow",
  emerald: "text-emerald-400",
  amber: "text-amber-soft",
  rose: "text-rose-300",
};

// Border + wire colours for the hover detail tree (Tailwind can't apply an
// opacity modifier to `currentColor`, so each tone maps to a literal class).
const TONE_LINE: Record<ChipTone, string> = {
  neutral: "border-chalk-400/40",
  violet: "border-violet-soft/50",
  sky: "border-sky-glow/50",
  emerald: "border-emerald-400/50",
  amber: "border-amber-soft/50",
  rose: "border-rose-400/50",
};

const TONE_WIRE: Record<ChipTone, string> = {
  neutral: "bg-chalk-400/40",
  violet: "bg-violet-soft/50",
  sky: "bg-sky-glow/50",
  emerald: "bg-emerald-400/50",
  amber: "bg-amber-soft/50",
  rose: "bg-rose-400/50",
};

type SeatArc = {
  seat: string;
  roleLabel: string;
  groupKey: string;
  tone: ChipTone;
  status: SeatStatus;
  d: string;
};

// The relation as a shape: one ring = the full set of seats, each seat an arc
// coloured by the role that fills it, so a role's seats read as one coloured
// wedge. Empty seats are hollow dashed gaps. Centre = the coverage count, or
// the hovered seat -> its role.
function SeatCoverage({
  seats,
  coverage,
  crew,
}: {
  seats: string[];
  coverage: Map<string, SeatCoverageEntry>;
  crew: CrewView;
}) {
  const [hoverSeat, setHoverSeat] = useState<string | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  if (seats.length === 0) return null;

  const uncovered = seats.filter((s) => coverage.get(s)?.status === "uncovered");
  const ambiguous = seats.filter((s) => coverage.get(s)?.status === "ambiguous");
  const filled = seats.length - uncovered.length;

  // On the ring, adjacent roles must be visually distinct - so colour by role
  // order through the palette, not by the toneForId hash (which clusters
  // several roles onto the same hue and blurs their wedges together).
  const PALETTE: ChipTone[] = [
    "violet",
    "emerald",
    "amber",
    "sky",
    "rose",
    "neutral",
  ];
  const roleTone = (roleId: string): ChipTone =>
    PALETTE[
      Math.max(
        0,
        crew.roles.findIndex((r) => r.id === roleId),
      ) % PALETTE.length
    ]!;

  // Ordered seat list, grouped: each role's covered seats, then a "several
  // takers" group, then the empty seats. Sectors of the ring, in this order.
  const items: {
    seat: string;
    roleLabel: string;
    groupKey: string;
    tone: ChipTone;
    status: SeatStatus;
  }[] = [];
  for (const role of crew.roles) {
    for (const seat of role.seats) {
      if (coverage.get(seat)?.status !== "covered") continue;
      items.push({
        seat,
        roleLabel: role.label,
        groupKey: role.id,
        tone: roleTone(role.id),
        status: "covered",
      });
    }
  }
  for (const seat of ambiguous) {
    items.push({
      seat,
      roleLabel: `${coverage.get(seat)!.roleIds.length} roles`,
      groupKey: "__amb",
      tone: "amber",
      status: "ambiguous",
    });
  }
  for (const seat of uncovered) {
    items.push({
      seat,
      roleLabel: "unassigned",
      groupKey: "__unc",
      tone: "rose",
      status: "uncovered",
    });
  }

  const total = items.length;
  const groups = new Set(items.map((i) => i.groupKey)).size;
  const cx = 90;
  const cy = 90;
  const ro = 82;
  const ri = 56;
  const groupGap = 0.05;
  const seatGap = 0.028;
  const usable = Math.PI * 2 - groupGap * groups;
  const seatAngle = usable / total;

  const arcs: SeatArc[] = [];
  let a = -Math.PI / 2;
  let prevKey: string | null = null;
  for (const it of items) {
    if (prevKey !== null && it.groupKey !== prevKey) a += groupGap;
    const d = annularPath(cx, cy, ri, ro, a, a + seatAngle - seatGap);
    arcs.push({ ...it, d });
    a += seatAngle;
    prevKey = it.groupKey;
  }

  const hovered = hoverSeat ? arcs.find((x) => x.seat === hoverSeat) : null;
  const hoveredGroup =
    !hovered && hoverKey ? arcs.find((x) => x.groupKey === hoverKey) : null;

  const lit = (arc: SeatArc) => {
    if (hoverSeat) return arc.seat === hoverSeat;
    if (hoverKey) return arc.groupKey === hoverKey;
    return true;
  };

  // The group currently hovered (via an arc or a legend row) - drives the
  // detail tree on the right.
  const activeKey = hoverSeat
    ? (arcs.find((x) => x.seat === hoverSeat)?.groupKey ?? null)
    : hoverKey;
  let activeGroup: {
    label: string;
    tone: ChipTone;
    seats: string[];
    workType?: string;
  } | null = null;
  if (activeKey === "__amb") {
    activeGroup = { label: "Several takers", tone: "amber", seats: ambiguous };
  } else if (activeKey === "__unc") {
    activeGroup = { label: "Unassigned", tone: "rose", seats: uncovered };
  } else if (activeKey) {
    const role = crew.roles.find((r) => r.id === activeKey);
    if (role) {
      activeGroup = {
        label: role.label,
        tone: roleTone(role.id),
        workType:
          WORKTYPE_LABEL[role.permissions] ??
          role.permissions.replace(/_/g, " "),
        seats: role.seats.filter(
          (s) => coverage.get(s)?.status === "covered",
        ),
      };
    }
  }

  return (
    <div className="flex w-full max-w-[640px] items-stretch gap-5 rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-5">
        <div className="relative shrink-0" style={{ width: 180, height: 180 }}>
          <svg width="180" height="180" viewBox="0 0 180 180">
            {arcs.map((arc) => {
              const empty = arc.status === "uncovered";
              return (
                <path
                  key={arc.seat}
                  d={arc.d}
                  onMouseEnter={() => setHoverSeat(arc.seat)}
                  onMouseLeave={() => setHoverSeat(null)}
                  className={cn(
                    "cursor-default transition-opacity duration-150",
                    empty ? "text-rose-300" : TONE_TEXT[arc.tone],
                    lit(arc) ? "opacity-100" : "opacity-25",
                  )}
                  fill="currentColor"
                  fillOpacity={empty ? 0.1 : 0.9}
                  stroke="currentColor"
                  strokeOpacity={empty ? 0.55 : 0}
                  strokeWidth={1}
                  strokeDasharray={empty ? "3 3" : undefined}
                />
              );
            })}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            {hovered ? (
              <>
                <span className="max-w-[110px] truncate font-mono text-[12.5px] font-semibold text-chalk-100">
                  {hovered.seat}
                </span>
                <span
                  className={cn(
                    "text-[10.5px]",
                    hovered.status === "uncovered"
                      ? "text-rose-300"
                      : hovered.status === "ambiguous"
                        ? "text-amber-soft"
                        : "text-chalk-400",
                  )}
                >
                  {hovered.status === "covered" ? "→ " : ""}
                  {hovered.roleLabel}
                </span>
              </>
            ) : hoveredGroup ? (
              <>
                <span className="max-w-[110px] truncate text-[13px] font-bold text-chalk-100">
                  {hoveredGroup.groupKey === "__amb"
                    ? "Several takers"
                    : hoveredGroup.groupKey === "__unc"
                      ? "Unassigned"
                      : hoveredGroup.roleLabel}
                </span>
                <span className="text-[10.5px] text-chalk-400">
                  {arcs.filter((x) => x.groupKey === hoveredGroup.groupKey).length}{" "}
                  seat
                  {arcs.filter((x) => x.groupKey === hoveredGroup.groupKey)
                    .length === 1
                    ? ""
                    : "s"}
                </span>
              </>
            ) : (
              <>
                <span className="text-[24px] font-extrabold leading-none text-chalk-100">
                  {filled}
                  <span className="text-chalk-400">/{seats.length}</span>
                </span>
                <span className="mt-1 text-[10.5px] text-chalk-400">
                  seats filled
                </span>
              </>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          {crew.roles.map((role) => {
            const count = role.seats.filter(
              (s) => coverage.get(s)?.status === "covered",
            ).length;
            if (count === 0) return null;
            return (
              <div
                key={role.id}
                onMouseEnter={() => setHoverKey(role.id)}
                onMouseLeave={() => setHoverKey(null)}
                className="flex items-center gap-2 rounded-[8px] px-1.5 py-1 text-[12px] transition-colors hover:bg-coal-500/50"
              >
                <ToneDot tone={roleTone(role.id)} />
                <span className="truncate font-medium text-chalk-100">
                  {role.label}
                </span>
                <span className="ml-auto shrink-0 text-[10px] text-chalk-400">
                  {WORKTYPE_LABEL[role.permissions] ??
                    role.permissions.replace(/_/g, " ")}
                </span>
                <span className="w-3 shrink-0 text-right font-mono text-[11px] text-chalk-400">
                  {count}
                </span>
              </div>
            );
          })}
          {ambiguous.length > 0 ? (
            <div
              onMouseEnter={() => setHoverKey("__amb")}
              onMouseLeave={() => setHoverKey(null)}
              className="flex items-center gap-2 rounded-[8px] px-1.5 py-1 text-[12px] transition-colors hover:bg-coal-500/50"
            >
              <ToneDot tone="amber" />
              <span className="truncate font-medium text-amber-soft">
                Several takers
              </span>
              <span className="ml-auto shrink-0 font-mono text-[11px] text-chalk-400">
                {ambiguous.length}
              </span>
            </div>
          ) : null}
          {uncovered.length > 0 ? (
            <div
              onMouseEnter={() => setHoverKey("__unc")}
              onMouseLeave={() => setHoverKey(null)}
              className="flex items-center gap-2 rounded-[8px] px-1.5 py-1 text-[12px] transition-colors hover:bg-coal-500/50"
            >
              <ToneDot tone="rose" />
              <span className="truncate font-medium text-rose-300">
                Unassigned - assign below
              </span>
              <span className="ml-auto shrink-0 font-mono text-[11px] text-rose-300">
                {uncovered.length}
              </span>
            </div>
          ) : null}
        </div>

        <SeatPyramid group={activeGroup} activeSeat={hoverSeat} />
      </div>
  );
}

// The hover detail: the role at the top, the seats it takes wired beneath it -
// a role apex over its seats, connected by a tone-coloured trunk + elbows.
function SeatPyramid({
  group,
  activeSeat,
}: {
  group: {
    label: string;
    tone: ChipTone;
    seats: string[];
    workType?: string;
  } | null;
  activeSeat: string | null;
}) {
  return (
    <div className="flex w-[196px] shrink-0 flex-col rounded-[14px] border border-[color:var(--line)] bg-coal-800/50 p-3">
      {!group ? (
        <div className="flex flex-1 items-center justify-center">
          <span className="text-center text-[11px] leading-[1.5] text-chalk-400">
            Hover a role to see
            <br />
            the seats it takes
          </span>
        </div>
      ) : (
        <div>
          <div
            className={cn(
              "inline-flex max-w-full items-center gap-1.5 rounded-[9px] border px-2.5 py-1",
              TONE_LINE[group.tone],
            )}
          >
            <ToneDot tone={group.tone} />
            <span className="truncate text-[11.5px] font-semibold text-chalk-100">
              {group.label}
            </span>
          </div>
          {group.seats.length === 0 ? (
            <div className="mt-2 pl-1 text-[11px] italic text-chalk-400">
              no seats
            </div>
          ) : (
            <div className="mt-2">
              {group.workType ? (
                <div className="mb-1 pl-1 text-[10.5px] font-semibold text-chalk-400">
                  {group.workType}
                </div>
              ) : null}
              <div
                className={cn(
                  "relative ml-[10px] space-y-1.5 border-l-2 pl-4",
                  TONE_LINE[group.tone],
                )}
              >
                {group.seats.map((seat) => (
                  <div key={seat} className="relative flex items-center">
                    <span
                      className={cn(
                        "absolute -left-4 top-1/2 h-px w-4 -translate-y-1/2",
                        TONE_WIRE[group.tone],
                      )}
                    />
                    <span
                      className={cn(
                        "rounded-[7px] px-2 py-[3px] font-mono text-[11px]",
                        seat === activeSeat
                          ? "bg-coal-500 text-chalk-100"
                          : "bg-coal-600 text-chalk-200",
                      )}
                    >
                      {seat}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
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
  const tone = toneForId(role.id);
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
        {/* Permission as a human label with an icon - never the raw snake_case
            token (a code slug is not a label). */}
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 text-[11.5px] font-semibold",
            role.permissions === "code_write"
              ? "text-amber-soft"
              : "text-chalk-300",
          )}
        >
          {role.permissions === "code_write" ? (
            <PenLine className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden />
          ) : (
            <Eye className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden />
          )}
          {PERMISSION_LABEL[role.permissions] ??
            role.permissions.replace(/_/g, " ")}
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
            ].map((p) => ({
              value: p,
              label: PERMISSION_LABEL[p] ?? p.replace(/_/g, " "),
            }))}
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

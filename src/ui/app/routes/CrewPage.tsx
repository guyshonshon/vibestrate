import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { api } from "../../lib/api.js";
import type {
  CrewView,
  ProfileView,
  ProviderCatalog,
  DiscoveredFlow,
  DiscoveredSkill,
} from "../../lib/types.js";
import { Button } from "../../components/design/Button.js";
import { HeroCard, type HeroTone } from "../../components/design/HeroCard.js";
import { PageShell, PageHeader, Section } from "../../components/layout/PageShell.js";
import { useToast, ToastView } from "../../components/design/useToast.js";
import { SegmentedControl } from "../../components/design/SegmentedControl.js";
import { ErrorState } from "../../components/design/ErrorState.js";
import { ErrorView } from "../../lib/error-view.js";
import { ProvidersView } from "../../components/providers/ProvidersView.js";
import { computeCoverage } from "../../components/crew/helpers.js";
import { SeatCoverage } from "../../components/crew/SeatCoverage.js";
import { RoleCard } from "../../components/crew/RoleCard.js";
import { CrewPresets } from "../../components/crew/CrewPresets.js";
import { CrewHub } from "../../components/crew/CrewHub.js";

/** Top-level tab across the Crew surface: the crews roster, or the providers
 *  management view (relocated here from the retired standalone Providers page).
 *  An interactive segmented control - not a status label. */
type CrewTab = "crews" | "providers";

const CREW_TABS: { value: CrewTab; label: string }[] = [
  { value: "crews", label: "Crews" },
  { value: "providers", label: "Providers" },
];

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
          {error ? <ErrorView err={error} compact onRetry={() => void load()} /> : null}
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
          {error ? <ErrorView err={error} compact onRetry={() => void load()} /> : null}
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

          {error ? <ErrorView err={error} compact onRetry={() => void load()} /> : null}

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

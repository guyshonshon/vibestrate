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
import { PageShell, PageHeader, Section } from "../../components/layout/PageShell.js";
import { Deck, Cell } from "../../components/layout/Deck.js";
import { PageHero, type HeroTone } from "../../components/layout/PageHero.js";
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
      // Safe to degrade silently: everything after getCrews only fills the
      // pickers a crew is assembled FROM (profiles, flows, skills, provider
      // labels). An empty picker shows the crew's existing values unchanged,
      // and the crews themselves - this page's subject - fail loudly.
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
        <Deck>
          <Cell size="full" reason="masthead">
            <PageHero
              title="Crew"
              purpose="The local CLIs your roles run on."
              actions={
                <SegmentedControl
                  options={CREW_TABS}
                  value="providers"
                  onChange={onSwitchTab}
                />
              }
            />
          </Cell>
          <Cell size="full" reason="nested-deck">
            <ProvidersView />
          </Cell>
        </Deck>
      ) : hubView ? (
        // ── Stage 1: the crews hub - a list you select from + presets ───────
        <Deck>
          <Cell size="full" reason="masthead">
            <PageHero
              state={{
                value: crews?.length ?? "-",
                caption: (crews?.length ?? 0) === 1 ? "Crew" : "Crews",
                note: defaultCrew
                  ? `"${defaultCrew}" is cast for every run unless one names another.`
                  : "None set as default yet.",
                tone: "violet",
              }}
              title="Crew"
              purpose="A crew is the cast for a run. Open one to see its roles."
              actions={
                <SegmentedControl
                  options={CREW_TABS}
                  value="crews"
                  onChange={onSwitchTab}
                />
              }
              metrics={[
                { value: crews?.length ?? "-", label: "crews" },
                { value: flows?.length ?? "-", label: "flows they can run" },
              ]}
              footer="Installing a preset just saves it. Nothing runs until you pick it."
            />
          </Cell>
          {error ? (
            <Cell size="full" reason="masthead">
              <ErrorView err={error} compact onRetry={() => void load()} />
            </Cell>
          ) : null}
          <Cell size="full" reason="nested-deck">
            <CrewHub
              crews={crews}
              defaultCrew={defaultCrew}
              flows={flows}
              settingDefault={settingDefault}
              onOpen={onOpenCrew}
              onSetDefault={(id) => void makeDefault(id)}
            />
          </Cell>
          <Cell size="full" reason="nested-deck">
            <CrewPresets onInstalled={() => void load()} flash={flash} />
          </Cell>
        </Deck>
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
            return (
              <Deck>
                <Cell size="full" reason="masthead">
                  <PageHero
                    state={{
                      value: uncoveredCount > 0 ? uncoveredCount : "Ready",
                      caption:
                        uncoveredCount > 0
                          ? uncoveredCount === 1
                            ? "Seat open"
                            : "Seats open"
                          : isDefault
                            ? "Runs by default"
                            : "To crew a run",
                      note:
                        uncoveredCount > 0
                          ? "A run needing one of these seats has nobody to give it to."
                          : ambiguousCount > 0
                            ? `${ambiguousCount} seat${ambiguousCount === 1 ? " has" : "s have"} several takers - the first match wins.`
                            : "Every seat a flow can ask for has a role behind it.",
                      tone,
                    }}
                    title={crew.label}
                    purpose="Each role runs on a profile and fills one of the flow's seats."
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
                        {!isDefault ? (
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={settingDefault}
                            onClick={() => void makeDefault(crew.id)}
                            iconLeft={
                              <Check className="h-3.5 w-3.5" strokeWidth={2} />
                            }
                          >
                            {settingDefault ? "Setting…" : "Set as default"}
                          </Button>
                        ) : null}
                      </>
                    }
                    metrics={[
                      {
                        value: crew.roles.length,
                        label: crew.roles.length === 1 ? "role" : "roles",
                      },
                      {
                        value: knownSeats.length,
                        label: "seats",
                      },
                      uncoveredCount > 0
                        ? { value: uncoveredCount, label: "uncovered", tone: "bad" }
                        : { value: "all", label: "seats filled", tone: "good" },
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
                    footer={
                      isDefault
                        ? "Picked for every run unless a run names another crew."
                        : "Pick this crew per run, or set it as the default."
                    }
                  />
                </Cell>

                {error ? (
                  <Cell size="full" reason="masthead">
                    <ErrorView err={error} compact onRetry={() => void load()} />
                  </Cell>
                ) : null}

                <Cell size="full" reason="masthead">
                  <SeatCoverage seats={knownSeats} coverage={coverage} crew={crew} />
                </Cell>

                <Cell size="full" reason="nested-deck">
                  <Section flush title="Roles">
                    <Deck>
                      {crew.roles.map((role) => (
                        <Cell key={role.id} size="half">
                          <RoleCard
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
                        </Cell>
                      ))}
                    </Deck>
                  </Section>
                </Cell>
              </Deck>
            );
          })()}
        </>
      )}

      <ToastView toast={toast} />
    </PageShell>
  );
}

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Cpu,
  PenLine,
  Plus,
  Save,
  Users,
  X,
} from "lucide-react";
import { api } from "../../lib/api.js";
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

const EMPTY_CAPS = { models: [], modelEnabled: false, powerLevels: [] };
import { Chip, ToneDot, type ChipTone } from "../../components/design/Chip.js";
import { SectionEyebrow } from "../../components/design/SectionEyebrow.js";
import { cn } from "../../components/design/cn.js";

// Deterministic tone per role so a role keeps the same accent across renders.
const TONES: ChipTone[] = ["violet", "sky", "emerald", "amber", "rose"];
function toneFor(roleId: string): ChipTone {
  let h = 0;
  for (const ch of roleId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length]!;
}

// Tailwind can't see runtime-built class names, so map each tone to literal
// classes (these strings appear verbatim for the JIT to pick up).
const TONE_RING: Record<ChipTone, string> = {
  neutral: "ring-white/20",
  violet: "ring-violet-soft/30",
  sky: "ring-sky-glow/30",
  emerald: "ring-emerald-400/30",
  amber: "ring-amber-300/30",
  rose: "ring-rose-400/30",
};
const TONE_SEAT_ON: Record<ChipTone, string> = {
  neutral: "border-white/25 bg-white/[0.05] text-fog-100",
  violet: "border-violet-soft/40 bg-white/[0.05] text-fog-100",
  sky: "border-sky-glow/40 bg-white/[0.05] text-fog-100",
  emerald: "border-emerald-400/40 bg-white/[0.05] text-fog-100",
  amber: "border-amber-300/40 bg-white/[0.05] text-fog-100",
  rose: "border-rose-400/40 bg-white/[0.05] text-fog-100",
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
    <div className="relative z-10 mx-auto max-w-[1180px] px-8 pt-6 pb-16 fade-up">
      {error ? (
        <div className="mb-4 rounded-lg border border-rose-400/30 bg-rose-500/5 px-3 py-2 text-[12.5px] text-rose-300">
          {error}
        </div>
      ) : null}

      {hubView ? (
        // ── Stage 1: the crews hub - a list you select from ─────────────────
        <CrewHub
          crews={crews}
          defaultCrew={defaultCrew}
          flows={flows}
          settingDefault={settingDefault}
          onOpen={onOpenCrew}
          onSetDefault={(id) => void makeDefault(id)}
        />
      ) : !crews ? (
        <div className="mt-6 text-fog-400 text-[13px]">Loading crew…</div>
      ) : !crew ? (
        // ── Stage 2 (missing): the requested crew doesn't exist ─────────────
        <div className="mt-6">
          <BackToCrews onBack={onBackToCrews} />
          <div className="mt-4 text-fog-400 text-[13px]">
            No crew named <span className="mono">{crewId}</span>.
          </div>
        </div>
      ) : (
        // ── Stage 2: the selected crew's configuration page ─────────────────
        <>
          <BackToCrews onBack={onBackToCrews} />
          <section className="mt-3 flex items-end justify-between gap-4 flex-wrap">
            <div>
              <div className="eyebrow mb-1.5 flex items-center gap-1.5">
                <Users className="h-3 w-3" strokeWidth={1.8} /> Configuring crew
              </div>
              <h1 className="text-display text-[21px] sm:text-[23px] leading-[1.2]">
                {crew.label}
                {crew.id === defaultCrew ? (
                  <span className="ml-2 align-middle">
                    <Chip tone="violet">default</Chip>
                  </span>
                ) : null}
              </h1>
              <p className="text-fog-300 text-[13px] mt-1.5 max-w-[70ch]">
                Each role runs on a{" "}
                <strong className="text-fog-100">Profile</strong> and lists the{" "}
                <strong className="text-fog-100">Seats</strong> it can take. A run
                matches a Flow's seats to these roles.
              </p>
            </div>
            {crew.id !== defaultCrew ? (
              <button
                type="button"
                disabled={settingDefault}
                onClick={() => void makeDefault(crew.id)}
                className="h-8 rounded-md border border-violet-soft/40 bg-violet-soft/15 px-2.5 text-[12px] text-violet-200 hover:bg-violet-soft/25 disabled:opacity-50"
                title="Make this the crew runs use when none is picked (writes defaultCrew)"
              >
                {settingDefault ? "Setting…" : "Set as default"}
              </button>
            ) : null}
          </section>

          <SeatCoverage seats={knownSeats} coverage={coverage} crew={crew} />
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
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
        </>
      )}

      {toast ? (
        <div
          className={cn(
            "fixed bottom-4 right-4 z-30 rounded-lg border px-3.5 py-2 text-[12.5px] shadow-2xl",
            toast.kind === "ok"
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
              : "border-rose-400/30 bg-rose-500/10 text-rose-200",
          )}
        >
          {toast.kind === "ok" ? "✓ " : "✗ "}
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}

// ─── Crews hub (the list you select from) ───────────────────────────────────

function BackToCrews({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-1.5 text-[12px] text-fog-400 hover:text-fog-100"
    >
      <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.7} /> All crews
    </button>
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
    <>
      <section className="mt-1">
        <div className="eyebrow mb-1.5 flex items-center gap-1.5">
          <Users className="h-3 w-3" strokeWidth={1.8} /> Crews
        </div>
        <h1 className="text-display text-[21px] sm:text-[23px] leading-[1.2]">
          Your crews
        </h1>
        <p className="text-fog-300 text-[13px] mt-1.5 max-w-[70ch]">
          Each crew is a roster of roles. Pick one to configure its roles,
          profiles, and seats - or set the one runs use by default.
        </p>
      </section>

      {!crews ? (
        <div className="mt-6 text-fog-400 text-[13px]">Loading crews…</div>
      ) : crews.length === 0 ? (
        <div className="mt-6 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-6 text-[12.5px] text-fog-400">
          No crews configured.
        </div>
      ) : (
        <ul className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {crews.map((c) => {
            const { knownSeats, coverage } = computeCoverage(c, flows);
            const uncovered = knownSeats.filter(
              (s) => coverage.get(s)?.status === "uncovered",
            ).length;
            const ambiguous = knownSeats.filter(
              (s) => coverage.get(s)?.status === "ambiguous",
            ).length;
            const isDefault = c.id === defaultCrew;
            return (
              <li
                key={c.id}
                className="group rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 hover:border-violet-soft/30"
              >
                <button
                  type="button"
                  onClick={() => onOpen(c.id)}
                  className="flex w-full items-center gap-2 text-left"
                >
                  <span className="text-[14px] font-medium text-fog-100 group-hover:text-violet-200">
                    {c.label}
                  </span>
                  {isDefault ? <Chip tone="violet">default</Chip> : null}
                  <ChevronRight
                    className="ml-auto h-4 w-4 text-fog-500 group-hover:text-violet-300"
                    strokeWidth={1.7}
                  />
                </button>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="text-fog-400">{c.roles.length} role(s)</span>
                  <span className="text-fog-600">·</span>
                  {uncovered > 0 ? (
                    <Chip tone="rose">{uncovered} seat(s) uncovered</Chip>
                  ) : (
                    <Chip tone="emerald">all seats covered</Chip>
                  )}
                  {ambiguous > 0 ? <Chip tone="amber">{ambiguous} ambiguous</Chip> : null}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpen(c.id)}
                    className="h-7 rounded-md border border-white/10 bg-white/[0.03] px-2.5 text-[11.5px] text-fog-200 hover:bg-white/[0.06]"
                  >
                    Configure
                  </button>
                  {!isDefault ? (
                    <button
                      type="button"
                      disabled={settingDefault}
                      onClick={() => onSetDefault(c.id)}
                      className="h-7 rounded-md border border-violet-soft/40 bg-violet-soft/15 px-2.5 text-[11.5px] text-violet-200 hover:bg-violet-soft/25 disabled:opacity-50"
                      title="Make this the crew runs use when none is picked"
                    >
                      Set as default
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
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
  return (
    <section className="mt-6 glass rounded-xl border border-white/[0.08] p-4">
      <SectionEyebrow
        right={
          <span className="text-[11px] text-fog-400">
            {seats.length - uncovered.length}/{seats.length} seats covered
          </span>
        }
      >
        Seat coverage
      </SectionEyebrow>
      <div className="mt-3 flex flex-wrap gap-2">
        {seats.map((seat) => {
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
              title={
                c.status === "uncovered"
                  ? `No role takes the "${seat}" seat - a flow needing it will fail.`
                  : c.status === "ambiguous"
                    ? `Two roles take "${seat}" (${roleLabels}) - a run must pick one.`
                    : `${roleLabels} takes the "${seat}" seat.`
              }
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-ink-200/50 px-2 py-1 text-[11.5px]"
            >
              <ToneDot tone={tone} />
              <span className="text-fog-100">{seat}</span>
              {c.status !== "covered" ? (
                <span
                  className={cn(
                    "mono text-[10px]",
                    c.status === "uncovered" ? "text-rose-300" : "text-amber-300",
                  )}
                >
                  {c.status === "uncovered" ? "empty" : `×${c.roleIds.length}`}
                </span>
              ) : null}
            </span>
          );
        })}
      </div>
      {uncovered.length > 0 || ambiguous.length > 0 ? (
        <p className="mt-2.5 text-[11.5px] text-fog-400">
          {uncovered.length > 0 ? (
            <>
              <span className="text-rose-300">{uncovered.join(", ")}</span> need a
              role.{" "}
            </>
          ) : null}
          {ambiguous.length > 0 ? (
            <>
              <span className="text-amber-300">{ambiguous.join(", ")}</span> are
              filled by more than one role - a run will ask which.
            </>
          ) : null}
        </p>
      ) : null}
    </section>
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
    <div className="glass rounded-xl border border-white/[0.08] p-4 flex flex-col gap-3">
      {/* header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={cn(
              "h-9 w-9 shrink-0 rounded-lg ring-1 flex items-center justify-center mono text-[13px] uppercase",
              TONE_RING[tone],
            )}
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            {role.label.slice(0, 2)}
          </span>
          <div className="min-w-0">
            <div className="text-[14px] text-fog-100 font-medium truncate">
              {role.label}
            </div>
            {/* The id is only worth showing when it adds something the label
                doesn't - e.g. "executor" under "Backend Implementer". For the
                common case where it's just the label's slug ("Fixer"/"fixer"),
                the duplicate line is noise, so we drop it. */}
            {role.id.toLowerCase() !==
            role.label.toLowerCase().replace(/[^a-z0-9]+/g, "") ? (
              <div className="mono text-[10.5px] text-fog-500 truncate">
                {role.id}
              </div>
            ) : null}
          </div>
        </div>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] mono",
            role.permissions === "code_write"
              ? "border border-amber-400/30 bg-amber-500/10 text-amber-300"
              : "border border-white/10 bg-ink-200/60 text-fog-400",
          )}
        >
          {role.permissions}
        </span>
      </div>

      {/* seats */}
      <div>
        <div className="eyebrow mb-1.5">Seats it takes</div>
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
                  "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11.5px] transition",
                  on
                    ? ambiguous
                      ? "border-amber-400/40 bg-amber-500/10 text-amber-200"
                      : TONE_SEAT_ON[tone]
                    : "border-white/10 bg-transparent text-fog-500 hover:text-fog-200 hover:border-white/20",
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
        <div className="eyebrow mb-1.5">Profile (runtime)</div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={role.profile}
            disabled={saving}
            onChange={(e) =>
              onPatch(
                { profile: e.target.value },
                `${role.label} now runs on ${e.target.value}.`,
              )
            }
            className="rounded-md border border-white/10 bg-ink-200/70 px-2 py-1.5 text-[12.5px] text-fog-100 outline-none focus:border-violet-soft/40"
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            {!profile ? (
              <option value={role.profile}>{role.profile} (missing)</option>
            ) : null}
          </select>
          {profile ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-ink-200/40 px-2 py-1 text-[11px] text-fog-300">
              <Cpu className="h-3 w-3 text-violet-soft" strokeWidth={1.7} />
              <span
                className={cn(
                  "text-fog-100",
                  !role.providerConfigured && "text-rose-300",
                )}
              >
                {profile.provider}
                {!role.providerConfigured ? " (not set up)" : ""}
              </span>
              {profile.model ? (
                <span className="text-fog-500">· {profile.model}</span>
              ) : null}
              {profile.power ? (
                <span className="text-fog-500">· {profile.power}</span>
              ) : null}
            </span>
          ) : (
            <span className="text-[11px] text-rose-300">profile not found</span>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={() => setNewProfileOpen((v) => !v)}
            className="rounded-md border border-white/10 bg-ink-200/40 px-2 py-1.5 text-[11.5px] text-fog-300 hover:border-violet-soft/40 hover:text-fog-100 disabled:opacity-50"
            title="Create a new profile and assign it to this role"
          >
            + New
          </button>
          <select
            value={role.permissions}
            disabled={saving}
            onChange={(e) =>
              onPatch(
                { permissions: e.target.value },
                `${role.label} permissions → ${e.target.value}.`,
              )
            }
            className="rounded-md border border-white/10 bg-ink-200/70 px-2 py-1.5 text-[12px] text-fog-200 outline-none focus:border-violet-soft/40"
          >
            {[...new Set([...PERMISSION_OPTIONS, role.permissions])].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
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
      <div className="border-t border-white/[0.06] pt-2.5">
        <button
          type="button"
          onClick={() => setPromptOpen((v) => !v)}
          className="flex items-center gap-1.5 text-[12px] text-fog-300 hover:text-fog-100"
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
      <div className="eyebrow mb-1.5">Skills</div>
      <div className="flex flex-wrap items-center gap-1.5">
        {role.skills.length === 0 ? (
          <span className="text-[11.5px] text-fog-500">none</span>
        ) : (
          role.skills.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-ink-200/50 px-2 py-0.5 text-[11px] text-fog-200"
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
                className="text-fog-500 hover:text-rose-300"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))
        )}
        {available.length > 0 ? (
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
              className="rounded-md border border-white/10 bg-ink-200/70 px-1.5 py-0.5 text-[11px] text-fog-100 outline-none"
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
              className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-0.5 text-[11px] text-fog-400 hover:text-fog-200 hover:border-white/20"
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
    return <div className="mt-2 text-[11.5px] text-fog-500">Loading…</div>;
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
        className="w-full rounded-md border border-white/10 bg-ink-0/60 px-2.5 py-2 mono text-[11.5px] leading-[1.55] text-fog-200 outline-none focus:border-violet-soft/40 resize-y"
      />
      <div className="mt-1.5 flex items-center justify-between">
        <span className="mono text-[10px] text-fog-500 truncate">{path}</span>
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
    "rounded-md border border-white/10 bg-ink-200/70 px-2 py-1.5 text-[12px] text-fog-100 outline-none focus:border-violet-soft/40";

  return (
    <div className="mt-2.5 rounded-lg border border-violet-soft/25 bg-ink-200/40 p-3">
      <div className="eyebrow mb-2">New profile for this role</div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="id (e.g. claude-cheap)"
          className={cn(inputCls, "w-[160px]", idTaken && "border-rose-400/40")}
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
          <div className="eyebrow mb-1.5">Effort</div>
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
          Create & use
        </Button>
      </div>
    </div>
  );
}

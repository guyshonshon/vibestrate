// The crew editor: build a crew, or open an existing one and change its roles,
// their parameters, and the instructions each one works from.
//
// The page leads with ROLES, because a crew IS its roles. Everything else here -
// which seats are covered, which flows would run, what has to be pasted - is
// derived from them, and a derived report is not what someone came here to
// write. Seat coverage is therefore stated as movement toward a crew that runs,
// not as a failure count: an empty crew has covered nothing yet, and that is
// where every crew starts.
//
// Nothing is red before the owner has used the control it belongs to or pressed
// the save action. The validator still runs on every keystroke; what changed is
// when its messages are allowed to speak, and that they speak on the control
// that owns them instead of in a banner above the form.
//
// It stays honest about a split the API forces. Two write routes exist for a
// crew - PATCH a role's fields, PUT a role's prompt - and both only touch a role
// that already exists in a crew that already exists. Everything structural (a
// new crew, an added, removed, or renamed role, the crew's label and review-loop
// override) lives in the crews map in project.yml, which no dashboard action
// writes. So the page plans each edit into what it can save and what the owner
// pastes, saves the first, and hands over exact bytes for the second rather than
// inventing an endpoint.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, RotateCcw, Save, SlidersHorizontal } from "lucide-react";
import { api } from "../../lib/api.js";
// The revise endpoint is declared with the rest of the crew API surface; the
// barrel composes methods, not constants, so this one is imported from the
// slice it belongs to.
import { CREW_REVISE_ENDPOINT } from "../../lib/api/crews.js";
import type {
  CrewRevision,
  CrewRevisionDraft,
  CrewRevisionResult,
  CrewView,
  DiscoveredFlow,
  DiscoveredSkill,
  ProfileView,
} from "../../lib/types.js";
import { ErrorView } from "../../lib/error-view.js";
import { AssistantPanel } from "../../components/design/AssistantPanel.js";
import { Button } from "../../components/design/Button.js";
import { ToneDot } from "../../components/design/Chip.js";
import { ErrorState } from "../../components/design/ErrorState.js";
import {
  Skeleton,
  SkeletonBlock,
  SkeletonRows,
  SkeletonStats,
} from "../../components/design/Skeleton.js";
import { Select } from "../../components/design/Select.js";
import { StatTile } from "../../components/design/StatTile.js";
import { useToast, ToastView } from "../../components/design/useToast.js";
import { Breadcrumbs } from "../../components/layout/Breadcrumbs.js";
import { Deck, Cell, Stack } from "../../components/layout/Deck.js";
import { PageHeader, PageShell, Section } from "../../components/layout/PageShell.js";
import { CrewManualChanges } from "../../components/crew/CrewManualChanges.js";
import { CrewRoleEditor } from "../../components/crew/CrewRoleEditor.js";
import { PERMISSION_OPTIONS } from "../../components/crew/helpers.js";
import {
  blankCrew,
  blankRole,
  computeFlowFit,
  crewToEditorState,
  describeFlowFit,
  newRoleKey,
  permissionVocabulary,
  planCrewSave,
  rebaseRole,
  seatVocabulary,
  validateEditorState,
  type CrewEditorState,
  type EditorRole,
  type LoadedRolePrompt,
  type RoleSnapshot,
} from "../../components/crew/crew-editor-model.js";

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** One writable op's outcome, kept as a value so a partial save reports on the
 *  role card that failed instead of collapsing into a single red banner. */
type OpFailure = { roleId: string; message: string };

/** The shortest roster that runs something: on a stock catalog these three
 *  seats are what most flows ask for, so covering them turns an empty crew into
 *  a working one in one click. Offered only when the installed flows actually
 *  declare the seats - inventing a seat no flow asks for would build a crew that
 *  fits nothing. */
const STARTER_ROLES: { id: string; label: string; seats: string[]; permissions: string }[] = [
  { id: "planner", label: "Planner", seats: ["planner"], permissions: "read_only" },
  { id: "implementer", label: "Implementer", seats: ["implementer"], permissions: "code_write" },
  { id: "reviewer", label: "Reviewer", seats: ["reviewer"], permissions: "review_only" },
];

export function CrewEditorPage({
  crewId,
  onBack,
  onOpenCrew,
}: {
  /** null = compose a new crew. */
  crewId: string | null;
  onBack: () => void;
  onOpenCrew: (crewId: string) => void;
}) {
  const [phase, setPhase] = useState<"loading" | "ready" | "failed">("loading");
  const [loadError, setLoadError] = useState<unknown>(null);
  const [missing, setMissing] = useState(false);
  const [state, setState] = useState<CrewEditorState | null>(null);
  const [crews, setCrews] = useState<CrewView[]>([]);
  const [profiles, setProfiles] = useState<ProfileView[]>([]);
  const [flows, setFlows] = useState<DiscoveredFlow[]>([]);
  const [skills, setSkills] = useState<DiscoveredSkill[]>([]);
  const [saving, setSaving] = useState(false);
  const [failures, setFailures] = useState<OpFailure[]>([]);
  // The two gates on every validator message: the control it belongs to has
  // been used, or the owner has asked to save.
  const [submitted, setSubmitted] = useState(false);
  const [crewIdUsed, setCrewIdUsed] = useState(false);
  const [showFlows, setShowFlows] = useState(false);
  const { toast, showToast: flash } = useToast();

  const load = useCallback(async () => {
    setPhase("loading");
    setMissing(false);
    setFailures([]);
    setSubmitted(false);
    setCrewIdUsed(false);
    try {
      // Only the crews call is load-bearing. The rest fill the pickers a crew is
      // assembled from, and an empty picker still shows the crew's own values -
      // so they degrade to empty rather than blanking the editor.
      const [crewsRes, profilesRes, flowsRes, skillsRes] = await Promise.all([
        api.getCrews(),
        api.getProfiles().catch(() => ({ profiles: [] as ProfileView[] })),
        api.listFlows().catch(() => ({ flows: [] as DiscoveredFlow[], invalid: [] })),
        api.listSkills().catch(() => ({ skills: [] as DiscoveredSkill[], assignments: [] })),
      ]);
      setCrews(crewsRes.crews);
      setProfiles(profilesRes.profiles);
      setFlows(flowsRes.flows);
      setSkills(skillsRes.skills);

      if (crewId === null) {
        setState(blankCrew());
        setPhase("ready");
        return;
      }
      const crew = crewsRes.crews.find((c) => c.id === crewId);
      if (!crew) {
        setMissing(true);
        setPhase("ready");
        return;
      }
      // Per role, because one unreadable role file must not blank the editor:
      // a failed read becomes that role's own error, and the rest load.
      const prompts: LoadedRolePrompt[] = await Promise.all(
        crew.roles.map((role) =>
          api
            .getCrewRoleContext(crew.id, role.id)
            .then(
              (res): LoadedRolePrompt => ({
                ok: true,
                roleId: role.id,
                promptPath: res.promptPath,
                content: res.content,
              }),
            )
            .catch(
              (err): LoadedRolePrompt => ({
                ok: false,
                roleId: role.id,
                error: message(err),
              }),
            ),
        ),
      );
      setState(crewToEditorState(crew, prompts));
      setPhase("ready");
    } catch (err) {
      setLoadError(err);
      setPhase("failed");
    }
  }, [crewId]);

  useEffect(() => {
    void load();
  }, [load]);

  const roles = useMemo(() => state?.roles ?? [], [state]);
  const seats = useMemo(() => seatVocabulary(flows, roles), [flows, roles]);
  const seatTakers = useMemo(() => {
    const map = new Map<string, EditorRole[]>();
    for (const seat of seats) {
      map.set(
        seat,
        roles.filter((r) => r.seats.includes(seat)),
      );
    }
    return map;
  }, [seats, roles]);
  const takerKeys = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const [seat, takers] of seatTakers) map.set(seat, takers.map((r) => r.key));
    return map;
  }, [seatTakers]);
  const permissions = useMemo(
    () =>
      permissionVocabulary(
        PERMISSION_OPTIONS,
        crews,
        roles.map((r) => r.permissions),
      ),
    [crews, roles],
  );
  const fits = useMemo(() => computeFlowFit(roles, flows), [roles, flows]);
  const problems = useMemo(
    () =>
      state
        ? validateEditorState(state, { takenCrewIds: crews.map((c) => c.id) })
        : [],
    [state, crews],
  );
  const plan = useMemo(() => (state ? planCrewSave(state) : null), [state]);

  /** How many flows ask for each seat. Not every seat is worth the same: this
   *  is what makes "cover this one next" a real recommendation. */
  const seatDemand = useMemo(() => {
    const map = new Map<string, number>();
    for (const fit of fits) {
      for (const seat of fit.required) map.set(seat, (map.get(seat) ?? 0) + 1);
    }
    return map;
  }, [fits]);

  /** Seats the installed flows declare, independent of what the crew carries -
   *  the starter roster is only offered for seats that really exist. */
  const declaredSeats = useMemo(() => new Set(seatVocabulary(flows, [])), [flows]);

  const seatRows = useMemo(
    () =>
      seats
        .map((seat) => ({
          seat,
          takers: seatTakers.get(seat) ?? [],
          demand: seatDemand.get(seat) ?? 0,
        }))
        // Highest-value seat first, and the order does not move as seats fill,
        // so a row never jumps out from under the pointer.
        .sort((a, b) => b.demand - a.demand || a.seat.localeCompare(b.seat)),
    [seats, seatTakers, seatDemand],
  );

  const covered = seatRows.filter((r) => r.takers.length === 1).length;
  const doubled = seatRows.filter((r) => r.takers.length > 1).length;
  const runnable = fits.filter((f) => f.status === "ready").length;

  const creating = state?.baseline === null;

  /** The draft as the revise service reads it: role wiring plus the
   *  instructions AS TEXT, which is the substance a revision edits. A role
   *  still without an id is keyed by its editor key so the map never carries an
   *  empty key, and a revision that comes back under that key is applied to the
   *  same row. */
  const assistDraft = useMemo<CrewRevisionDraft | null>(() => {
    if (state === null) return null;
    return {
      crewId: state.crewId,
      crew: {
        ...(state.label ? { label: state.label } : {}),
        ...(state.maxReviewLoops === null ? {} : { maxReviewLoops: state.maxReviewLoops }),
        roles: Object.fromEntries(
          state.roles.map((r) => [
            r.id || r.key,
            {
              ...(r.label ? { label: r.label } : {}),
              seats: r.seats,
              profile: r.profile,
              permissions: r.permissions,
              ...(r.skills.length > 0 ? { skills: r.skills } : {}),
              promptText: r.prompt,
            },
          ]),
        ),
      },
    };
  }, [state]);

  function patchRole(key: string, patch: Partial<EditorRole>) {
    setState((prev) =>
      prev === null
        ? prev
        : {
            ...prev,
            roles: prev.roles.map((r) => (r.key === key ? { ...r, ...patch } : r)),
          },
    );
  }

  function newRole(seed?: { id: string; label: string; seats: string[]; permissions: string }) {
    const base = blankRole({
      profile: profiles[0]?.id ?? "",
      // Least privilege by default. The vocabulary is sorted, so taking the
      // first entry would hand every new role code_write.
      permissions: permissions.includes("read_only") ? "read_only" : (permissions[0] ?? "read_only"),
    });
    if (!seed) return base;
    return {
      ...base,
      id: seed.id,
      label: seed.label,
      seats: seed.seats.filter((s) => declaredSeats.has(s)),
      permissions: permissions.includes(seed.permissions) ? seed.permissions : base.permissions,
    };
  }

  function addRole() {
    setState((prev) => (prev === null ? prev : { ...prev, roles: [...prev.roles, newRole()] }));
  }

  function addStarterRoles() {
    setState((prev) =>
      prev === null
        ? prev
        : {
            ...prev,
            roles: [
              ...prev.roles,
              ...STARTER_ROLES.filter((s) => !prev.roles.some((r) => r.id === s.id)).map((s) =>
                newRole(s),
              ),
            ],
          },
    );
  }

  function removeRole(key: string) {
    setState((prev) => {
      if (prev === null) return prev;
      const target = prev.roles.find((r) => r.key === key);
      return {
        ...prev,
        roles: prev.roles.filter((r) => r.key !== key),
        // Nothing is deleted on disk here. The snapshot is kept so the plan can
        // tell the owner exactly which entry and which file to remove.
        removed: target?.baseline ? [...prev.removed, target.baseline] : prev.removed,
      };
    });
  }

  /** One seat, one role. Assigning here strips the seat from every other role,
   *  because two roles on one seat is a resolution-time throw, not a preference:
   *  the run stops before an agent starts. */
  function assignSeat(seat: string, roleKey: string) {
    setState((prev) =>
      prev === null
        ? prev
        : {
            ...prev,
            roles: prev.roles.map((r) => {
              const has = r.seats.includes(seat);
              if (r.key === roleKey) return has ? r : { ...r, seats: [...r.seats, seat] };
              return has ? { ...r, seats: r.seats.filter((s) => s !== seat) } : r;
            }),
          },
    );
  }

  /** Fold a proposed revision into the draft, role by role, keyed on role id.
   *
   *  Deliberately NOT `crewToEditorState`: that sets `baseline` from what it is
   *  given, which would assert the supervisor's proposal is already on disk -
   *  the save plan would then emit patches for roles that do not exist and the
   *  per-role change counts would read zero. A role the revision adds gets a
   *  null baseline, a role it drops goes to `removed` exactly as the Remove
   *  button does, and a role it edits keeps its key and its baseline so the
   *  editor still knows what changed. Nothing here saves. */
  function applyRevision(revision: CrewRevision) {
    setState((prev) => {
      if (prev === null) return prev;
      const existing = new Map(prev.roles.map((r) => [r.id || r.key, r]));
      const kept = new Set<string>();
      const roles: EditorRole[] = Object.entries(revision.crew.roles ?? {}).map(([id, r]) => {
        const cur = existing.get(id);
        if (cur) kept.add(cur.key);
        return {
          key: cur?.key ?? newRoleKey(),
          baseline: cur?.baseline ?? null,
          loadError: cur?.loadError ?? null,
          id,
          label: r.label ?? cur?.label ?? id,
          seats: [...r.seats],
          profile: r.profile,
          permissions: r.permissions,
          skills: [...(r.skills ?? [])],
          prompt: r.promptText,
          promptPath: cur?.promptPath ?? "",
        };
      });
      const dropped: RoleSnapshot[] = [];
      for (const r of prev.roles) {
        if (!kept.has(r.key) && r.baseline !== null) dropped.push(r.baseline);
      }
      return {
        ...prev,
        // A crew's id is its key in the config and cannot be changed once it
        // exists, so a proposed id only lands on a crew being composed.
        crewId: prev.baseline === null ? revision.crewId || prev.crewId : prev.crewId,
        label: revision.crew.label ?? prev.label,
        maxReviewLoops: revision.crew.maxReviewLoops ?? prev.maxReviewLoops,
        roles,
        removed: [...prev.removed, ...dropped],
      };
    });
  }

  async function save() {
    if (state === null || plan === null || problems.length > 0) return;
    setSaving(true);
    setFailures([]);
    const failed: OpFailure[] = [];
    const applied = new Map<string, { fields: boolean; prompt: boolean }>();
    for (const op of plan.writable) {
      const mark = applied.get(op.roleId) ?? { fields: false, prompt: false };
      try {
        if (op.kind === "fields") {
          await api.patchCrewRole(state.crewId, op.roleId, op.patch);
          mark.fields = true;
        } else {
          await api.setCrewRoleContext(state.crewId, op.roleId, op.content);
          mark.prompt = true;
        }
      } catch (err) {
        failed.push({ roleId: op.roleId, message: `${op.summary}: ${message(err)}` });
      }
      applied.set(op.roleId, mark);
    }
    // Advance the baseline only over what the server confirmed, so a role added
    // or renamed in this editor survives the save instead of being reloaded away.
    setState((prev) =>
      prev === null
        ? prev
        : {
            ...prev,
            roles: prev.roles.map((r) =>
              rebaseRole(r, applied.get(r.id) ?? { fields: false, prompt: false }),
            ),
          },
    );
    setSaving(false);
    setFailures(failed);
    if (failed.length === 0) {
      flash({
        kind: "ok",
        text: `Saved ${plan.writable.length} change${plan.writable.length === 1 ? "" : "s"}.`,
      });
    } else {
      flash({
        kind: "err",
        text: `${failed.length} of ${plan.writable.length} changes did not save.`,
      });
    }
  }

  // ── loading / failed / missing ────────────────────────────────────────────
  if (phase === "loading") {
    return (
      <PageShell>
        <Skeleton label="Loading crew editor" className="flex flex-col gap-4">
          <SkeletonBlock h={26} w="28%" radius={8} />
          <div className="flex flex-wrap items-center gap-3 rounded-[20px] border border-[color:var(--line)] bg-coal-600 p-5">
            <SkeletonStats count={3} size="lg" />
            <div className="ml-auto flex gap-1.5 rounded-[14px] border border-[color:var(--line)] p-1.5">
              <SkeletonBlock w={78} h={30} />
              <SkeletonBlock w={110} h={30} />
            </div>
          </div>
          {/* One card per role, each an instruction pane - the shape the editor
           * always resolves to. */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="flex flex-col gap-3 rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4"
              >
                <div className="flex items-center gap-2">
                  <SkeletonBlock w={44} h={44} radius={12} />
                  <SkeletonBlock h={16} w="42%" />
                </div>
                <SkeletonRows rows={3} meta trailing />
                <SkeletonBlock h={92} w="100%" bordered />
              </div>
            ))}
          </div>
        </Skeleton>
      </PageShell>
    );
  }

  if (phase === "failed") {
    return (
      <PageShell>
        <ErrorView
          err={loadError}
          override={{ title: "The crew editor could not load" }}
          onRetry={() => void load()}
          actions={[{ label: "All crews", onClick: onBack, variant: "secondary" }]}
        />
      </PageShell>
    );
  }

  if (missing || state === null || plan === null || assistDraft === null) {
    return (
      <PageShell>
        <ErrorState
          title="Crew not found"
          hint={`No crew named ${crewId}. Pick one from the list, or compose a new crew here.`}
          actions={[{ label: "All crews", onClick: onBack }]}
        />
      </PageShell>
    );
  }

  const crewIdError =
    submitted || crewIdUsed
      ? problems.find((p) => p.code === "crew-id" || p.code === "crew-id-taken")?.message
      : undefined;
  const pendingWrites = plan.writable.length;
  const pendingManual = plan.manual.length;
  const touchedAnything =
    creating
      ? state.crewId !== "" || state.label !== "" || roles.length > 0
      : pendingWrites + pendingManual > 0;
  const canStart = STARTER_ROLES.every((s) => s.seats.every((seat) => declaredSeats.has(seat)));

  function onPrimary() {
    // Pressing this is what licenses the page to report the fields nobody has
    // touched yet. It is also the only way out of a draft that is not ready:
    // a disabled button with a tooltip is a dead end for someone who cannot see
    // what is missing.
    setSubmitted(true);
    if (problems.length > 0) return;
    if (pendingWrites > 0) void save();
  }

  return (
    <PageShell>
      <Breadcrumbs
        className="mb-3"
        items={[
          { label: "Crews", onClick: onBack },
          { label: creating ? "New crew" : state.label || state.crewId, muted: true },
        ]}
      />
      <PageHeader
        className="mb-4"
        title={
          creating ? (
            "New crew"
          ) : (
            <span className="flex items-baseline gap-2.5">
              {state.label || state.crewId}
              <span className="mono text-[12px] font-medium text-chalk-300">
                {state.crewId}
              </span>
            </span>
          )
        }
        actions={
          <>
            {!creating ? (
              <Button
                variant="ghost"
                size="sm"
                iconLeft={<SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.9} />}
                onClick={() => onOpenCrew(state.crewId)}
              >
                Crew page
              </Button>
            ) : null}
            {touchedAnything ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={saving}
                iconLeft={<RotateCcw className="h-3.5 w-3.5" strokeWidth={1.9} />}
                onClick={() => void load()}
              >
                Discard
              </Button>
            ) : null}
          </>
        }
      />

      <Deck>
        <Cell size="full" reason="masthead">
          <section className="rounded-[20px] border border-[color:var(--line)] bg-coal-600 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap items-stretch gap-2">
                <StatTile size="lg" value={roles.length} label={roles.length === 1 ? "role" : "roles"} />
                <StatTile
                  size="lg"
                  tone={covered > 0 ? "violet" : "default"}
                  value={`${covered} of ${seats.length}`}
                  label="seats covered"
                />
                <StatTile
                  size="lg"
                  tone={runnable > 0 ? "emerald" : "default"}
                  value={`${runnable} of ${fits.length}`}
                  label={fits.length === 1 ? "flow runs" : "flows run"}
                />
                {doubled > 0 ? (
                  <StatTile size="lg" tone="amber" value={doubled} label="seats taken twice" />
                ) : null}
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-1.5 rounded-[14px] border border-[color:var(--line)] bg-coal-700 p-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  iconLeft={<ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.8} />}
                  onClick={onBack}
                >
                  All crews
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  data-tour="crew-editor-save"
                  disabled={saving || (pendingWrites === 0 && pendingManual === 0)}
                  iconLeft={<Save className="h-3.5 w-3.5" strokeWidth={1.8} />}
                  title={
                    problems.length > 0
                      ? "Some of this crew is not ready yet"
                      : pendingWrites > 0
                        ? "Write the role changes this page can save"
                        : pendingManual > 0
                          ? "Show the exact bytes to put in your project config"
                          : "Nothing has changed since the last save"
                  }
                  onClick={onPrimary}
                >
                  {saving
                    ? "Saving…"
                    : pendingWrites > 0
                      ? `Save ${pendingWrites} change${pendingWrites === 1 ? "" : "s"}`
                      : "What to save"}
                </Button>
              </div>
            </div>
          </section>
        </Cell>

        <Cell size="full" reason="nested-deck">
          <Section
            flush
            title="Roles"
            action={
              roles.length > 0 ? (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={saving}
                  iconLeft={<Plus className="h-3.5 w-3.5" strokeWidth={2} />}
                  onClick={addRole}
                >
                  Add a role
                </Button>
              ) : null
            }
          >
            {roles.length === 0 ? (
              // Capped, so the one thing on an empty page stays card-shaped
              // instead of stretching a sentence across the whole monitor.
              <div className="w-full max-w-[620px] rounded-[18px] border border-[color:var(--line)] bg-coal-600 px-6 py-8 text-center">
                <p className="mx-auto max-w-[60ch] text-[13px] leading-[1.55] text-chalk-200">
                  A role is one agent: the seats it can take, the profile it runs on, and the
                  instructions it works from.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    iconLeft={<Plus className="h-3.5 w-3.5" strokeWidth={2} />}
                    onClick={addRole}
                  >
                    Add a role
                  </Button>
                  {canStart ? (
                    <Button variant="secondary" size="sm" onClick={addStarterRoles}>
                      Start with planner, implementer, reviewer
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              // Two columns, not one. A role card at full page width stretches
              // the prompt to ~180 characters a line, which is the one thing on
              // this page a person actually reads.
              <Deck align="stretch">
                {roles.map((role) => (
                  <Cell key={role.key} size="half">
                    <CrewRoleEditor
                      role={role}
                      seatVocabulary={seats}
                      seatTakers={takerKeys}
                      profiles={profiles}
                      permissions={permissions}
                      skills={skills}
                      problems={problems.filter((p) => p.roleKey === role.key)}
                      saveErrors={failures
                        .filter((f) => f.roleId === role.id)
                        .map((f) => f.message)}
                      showAllProblems={submitted}
                      disabled={saving}
                      onChange={(patch) => patchRole(role.key, patch)}
                      onRemove={() => removeRole(role.key)}
                    />
                  </Cell>
                ))}
              </Deck>
            )}
          </Section>
        </Cell>

        <Cell size="half">
          <Section flush title="Seats">
            <div
              data-tour="crew-editor-seats"
              className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4"
            >
              {seatRows.length === 0 ? (
                <p className="text-[12.5px] text-chalk-200">
                  No flow installed here declares a seat, so there is nothing to fill.
                </p>
              ) : (
                <div>
                  {seatRows.map(({ seat, takers, demand }) => (
                    <div
                      key={seat}
                      className="border-t border-[color:var(--line-soft)] py-2 first:border-t-0 first:pt-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="mono text-[12.5px] text-chalk-100">{seat}</span>
                        {demand > 0 ? (
                          <span className="text-meta text-violet-soft">
                            {demand} {demand === 1 ? "flow" : "flows"}
                          </span>
                        ) : null}
                        <Select
                          className="ml-auto w-[176px]"
                          value={takers.length === 1 ? (takers[0]?.key ?? "") : ""}
                          disabled={saving || roles.length === 0}
                          ariaLabel={`Role for the ${seat} seat`}
                          placeholder={roles.length === 0 ? "Add a role first" : "Nobody"}
                          onChange={(v) => assignSeat(seat, v)}
                          options={[
                            { value: "", label: "Nobody" },
                            ...roles.map((r) => ({
                              value: r.key,
                              label: r.label || r.id || "Untitled role",
                            })),
                          ]}
                        />
                      </div>
                      {takers.length > 1 ? (
                        <p className="mt-1 text-meta leading-[1.45] text-amber-soft">
                          {takers.map((r) => r.label || r.id || "an unnamed role").join(" and ")}{" "}
                          both take this seat, so a run stops before it starts.
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}

              {fits.length > 0 ? (
                <div className="mt-3 border-t border-[color:var(--line-soft)] pt-3">
                  <Button variant="outline" size="sm" onClick={() => setShowFlows((v) => !v)}>
                    {showFlows ? "Hide the flows" : "Which flows this covers"}
                  </Button>
                  {showFlows ? (
                    <div className="mt-2">
                      {fits.map((fit) => (
                        <div
                          key={fit.flowId}
                          className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-t border-[color:var(--line-soft)] py-1.5 first:border-t-0"
                        >
                          {/* Three tones, not two - see describeFlowFit. */}
                          <ToneDot tone={describeFlowFit(fit.status).tone} />
                          <span className="text-[12.5px] font-semibold text-chalk-100">
                            {fit.flowLabel}
                          </span>
                          <span className="mono text-meta text-chalk-300">{fit.flowId}</span>
                          <span
                            className={
                              fit.status === "ready"
                                ? "text-meta text-chalk-300"
                                : fit.status === "contested"
                                  ? "text-meta text-amber-soft"
                                  : "text-meta text-rose-300"
                            }
                          >
                            {describeFlowFit(fit.status).label}
                          </span>
                          {fit.missing.length > 0 ? (
                            <span className="ml-auto text-meta text-amber-soft">
                              waiting on {fit.missing.join(", ")}
                            </span>
                          ) : fit.contested.length > 0 ? (
                            <span className="ml-auto text-meta text-amber-soft">
                              two roles on {fit.contested.join(", ")}
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </Section>
        </Cell>

        <Cell size="half">
          <Stack>
            <Section flush title="The crew">
              <div
                data-tour="crew-editor-identity"
                className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-semibold text-violet-vivid">
                      Id
                    </span>
                    <input
                      value={state.crewId}
                      disabled={!creating || saving}
                      spellCheck={false}
                      placeholder="review-heavy"
                      onChange={(e) =>
                        setState((prev) => (prev ? { ...prev, crewId: e.target.value } : prev))
                      }
                      onBlur={() => setCrewIdUsed(true)}
                      className={`mono w-full rounded-[10px] border bg-coal-800 px-2.5 py-1.5 text-[12.5px] text-chalk-100 outline-none placeholder:text-chalk-300/70 disabled:opacity-60 ${
                        crewIdError
                          ? "border-rose-400/60"
                          : "border-[color:var(--line-strong)] focus:border-violet-soft/50"
                      }`}
                    />
                    {crewIdError ? (
                      <span className="mt-1 block text-meta leading-[1.45] text-rose-300">
                        {crewIdError}
                      </span>
                    ) : (
                      <span className="mt-1 block text-meta text-chalk-300">
                        {creating
                          ? "How runs name this crew."
                          : "A crew's id is its key in the config and cannot be changed here."}
                      </span>
                    )}
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-semibold text-violet-vivid">
                      Name
                    </span>
                    <input
                      value={state.label}
                      disabled={saving}
                      placeholder="Review heavy"
                      onChange={(e) =>
                        setState((prev) => (prev ? { ...prev, label: e.target.value } : prev))
                      }
                      className="w-full rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 px-2.5 py-1.5 text-[13px] text-chalk-100 outline-none placeholder:text-chalk-300/70 focus:border-violet-soft/50"
                    />
                    <span className="mt-1 block text-meta text-chalk-300">
                      What you see in the crew list.
                    </span>
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="mb-1.5 block text-[12px] font-semibold text-violet-vivid">
                      Review loops
                    </span>
                    <Select
                      value={state.maxReviewLoops === null ? "" : String(state.maxReviewLoops)}
                      disabled={saving}
                      ariaLabel="Review loops"
                      onChange={(v) =>
                        setState((prev) =>
                          prev ? { ...prev, maxReviewLoops: v === "" ? null : Number(v) } : prev,
                        )
                      }
                      // The crew schema bounds this at 0..10; offering the range
                      // instead of a number field keeps an out-of-range value
                      // from reaching the config at all.
                      options={[
                        { value: "", label: "Inherit the global setting" },
                        ...Array.from({ length: 11 }, (_, i) => ({
                          value: String(i),
                          label: i === 1 ? "1 loop" : `${i} loops`,
                        })),
                      ]}
                    />
                    <span className="mt-1 block text-meta text-chalk-300">
                      How many review-and-fix cycles a run on this crew takes.
                    </span>
                  </label>
                </div>
              </div>
            </Section>

            <AssistantPanel<CrewRevision>
              endpoint={CREW_REVISE_ENDPOINT}
              draft={assistDraft}
              parseReply={(raw) => {
                const res = raw as CrewRevisionResult;
                return { answer: res.answer, revision: res.revision };
              }}
              purpose="It reads the crew you have open and proposes a change to it. Applying puts the change in this draft; saving stays yours."
              placeholder="Add a second reviewer that only reads."
              examples={[
                "Add a second reviewer",
                "Why is the architect seat uncovered?",
                "Make this cheaper",
              ]}
              renderChange={(revision) => (
                <RevisionChanges
                  items={describeCrewRevision(state, revision)}
                  problems={revision.problems}
                />
              )}
              onApply={applyRevision}
            />
          </Stack>
        </Cell>

        {/* Bytes derived from an invalid crew are worse than no bytes: paste
            them and the config stops loading. The fields say what is missing
            once the owner has asked to save, so the blocks appear when the crew
            is actually ready to be written by hand. */}
        <Cell size="full" reason="masthead">
          {submitted && problems.length === 0 ? (
            <CrewManualChanges changes={plan.manual} creating={creating} />
          ) : null}
        </Cell>
      </Deck>

      <ToastView toast={toast} />
    </PageShell>
  );
}

/** What a proposed revision would change, in the editor's own vocabulary. Never
 *  a semantic differ: the editor already holds the before-state, so this is a
 *  per-role field comparison keyed on role id, and a reordered roles map reads
 *  as no change rather than as everything changing. */
function describeCrewRevision(state: CrewEditorState, revision: CrewRevision): string[] {
  const out: string[] = [];
  if (state.baseline === null && revision.crewId && revision.crewId !== state.crewId) {
    out.push(`Id: ${revision.crewId}`);
  }
  const label = revision.crew.label ?? state.label;
  if (label !== state.label) out.push(`Name: ${label}`);
  const loops = revision.crew.maxReviewLoops ?? state.maxReviewLoops;
  if (loops !== state.maxReviewLoops) {
    out.push(`Review loops: ${loops === null ? "inherit the global setting" : loops}`);
  }

  const proposed = revision.crew.roles ?? {};
  const current = new Map(state.roles.map((r) => [r.id || r.key, r]));
  for (const [id, role] of Object.entries(proposed)) {
    const cur = current.get(id);
    if (!cur) {
      out.push(
        `Adds ${role.label ?? id}${role.seats.length > 0 ? ` on ${role.seats.join(", ")}` : ""}`,
      );
      continue;
    }
    const fields: string[] = [];
    if ((role.label ?? cur.label) !== cur.label) fields.push("name");
    if (!sameSet(role.seats, cur.seats)) fields.push("seats");
    if (role.profile !== cur.profile) fields.push("profile");
    if (role.permissions !== cur.permissions) fields.push("permissions");
    if (!sameSet(role.skills ?? [], cur.skills)) fields.push("skills");
    if (role.promptText !== cur.prompt) fields.push("instructions");
    if (fields.length > 0) out.push(`${cur.label || id}: ${fields.join(", ")}`);
  }
  for (const role of state.roles) {
    if (!((role.id || role.key) in proposed)) out.push(`Removes ${role.label || role.id}`);
  }
  return out;
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const x = [...a].sort();
  const y = [...b].sort();
  return x.every((v, i) => v === y[i]);
}

function RevisionChanges({ items, problems }: { items: string[]; problems: string[] }) {
  return (
    <>
      {items.length === 0 ? (
        <p className="text-meta leading-[1.5] text-chalk-200">
          This revision matches the crew you already have.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((item, i) => (
            <li
              key={i}
              className="flex items-baseline gap-2 text-[12.5px] leading-[1.5] text-chalk-100"
            >
              <ToneDot tone="violet" />
              {item}
            </li>
          ))}
        </ul>
      )}
      {/* What the schemas cannot catch about what this revision introduces.
          Shown before the Apply, because it is cheaper to reject a proposal than
          to unpick it. */}
      {problems.map((problem, i) => (
        <p key={i} className="mt-1.5 text-meta leading-[1.45] text-amber-soft">
          {problem}
        </p>
      ))}
    </>
  );
}

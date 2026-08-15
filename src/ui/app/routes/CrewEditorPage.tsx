// The crew editor: build a crew, or open an existing one and change its roles,
// their parameters, and the instructions each one works from.
//
// It is deliberately honest about a split the API forces. Two write routes
// exist for a crew - PATCH a role's fields, PUT a role's prompt - and both only
// touch a role that already exists in a crew that already exists. Everything
// structural (a new crew, an added, removed, or renamed role, the crew's label
// and review-loop override) lives in the crews map in project.yml, which no
// dashboard action writes. So the page plans each edit into what it can save
// and what the owner pastes, saves the first, and hands over exact bytes for the
// second rather than inventing an endpoint.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, RotateCcw, Save, SlidersHorizontal } from "lucide-react";
import { api } from "../../lib/api.js";
import type {
  CrewView,
  DiscoveredFlow,
  DiscoveredSkill,
  ProfileView,
} from "../../lib/types.js";
import { ErrorView } from "../../lib/error-view.js";
import { Button } from "../../components/design/Button.js";
import { ErrorState } from "../../components/design/ErrorState.js";
import {
  Skeleton,
  SkeletonBlock,
  SkeletonRows,
} from "../../components/design/Skeleton.js";
import { PageHeroSkeleton } from "./page-skeletons.js";
import { Select } from "../../components/design/Select.js";
import { useToast, ToastView } from "../../components/design/useToast.js";
import { Deck, Cell } from "../../components/layout/Deck.js";
import { PageHero, type HeroTone } from "../../components/layout/PageHero.js";
import { PageShell, Section } from "../../components/layout/PageShell.js";
import { CrewFlowFit } from "../../components/crew/CrewFlowFit.js";
import { CrewManualChanges } from "../../components/crew/CrewManualChanges.js";
import { CrewRoleEditor } from "../../components/crew/CrewRoleEditor.js";
import { PERMISSION_OPTIONS } from "../../components/crew/helpers.js";
import {
  blankCrew,
  blankRole,
  computeFlowFit,
  crewToEditorState,
  permissionVocabulary,
  planCrewSave,
  rebaseRole,
  seatVocabulary,
  validateEditorState,
  type CrewEditorState,
  type EditorRole,
  type LoadedRolePrompt,
} from "../../components/crew/crew-editor-model.js";

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** One writable op's outcome, kept as a value so a partial save reports which
 *  change failed instead of collapsing into a single red banner. */
type OpFailure = { summary: string; message: string };

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
  const { toast, showToast: flash } = useToast();

  const load = useCallback(async () => {
    setPhase("loading");
    setMissing(false);
    setFailures([]);
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

  const roles = state?.roles ?? [];
  const seats = useMemo(() => seatVocabulary(flows, roles), [flows, roles]);
  const seatTakers = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const seat of seats) {
      map.set(
        seat,
        roles.filter((r) => r.seats.includes(seat)).map((r) => r.key),
      );
    }
    return map;
  }, [seats, roles]);
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

  const creating = state?.baseline === null;
  const crewProblems = problems.filter((p) => p.roleKey === null);

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

  function addRole() {
    setState((prev) =>
      prev === null
        ? prev
        : {
            ...prev,
            roles: [
              ...prev.roles,
              blankRole({
                profile: profiles[0]?.id ?? "",
                // Least privilege by default. The vocabulary is sorted, so
                // taking the first entry would hand every new role code_write.
                permissions: permissions.includes("read_only")
                  ? "read_only"
                  : (permissions[0] ?? "read_only"),
              }),
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
        failed.push({ summary: op.summary, message: message(err) });
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
        <Skeleton label="Loading crew editor">
          <Deck>
            <Cell size="full" reason="masthead">
              <PageHeroSkeleton metrics={0} />
            </Cell>
            {/* One card per role, each an instruction pane - the shape the
             * editor always resolves to. */}
            {[0, 1, 2].map((i) => (
              <Cell key={i} size="half">
                <div className="flex flex-col gap-3 rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4">
                  <div className="flex items-center gap-2">
                    <SkeletonBlock w={16} h={16} radius={6} />
                    <SkeletonBlock h={16} w="42%" />
                  </div>
                  <SkeletonRows rows={3} meta trailing />
                  <SkeletonBlock h={92} w="100%" bordered />
                </div>
              </Cell>
            ))}
          </Deck>
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

  if (missing || state === null || plan === null) {
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

  const blocked = fits.filter((f) => f.status === "blocked").length;
  const pending = plan.writable.length + plan.manual.length;
  // One fact in the status column, and the tone follows it - an amber column
  // over "nothing pending" reads as a rendering fault. Order is severity: a
  // crew that will not load, then a flow that cannot start, then unsaved work.
  const status: { value: string | number; caption: string; note?: string; tone: HeroTone } =
    problems.length > 0
      ? {
          value: problems.length,
          caption: problems.length === 1 ? "Thing to fix" : "Things to fix",
          note: "A crew in this shape is refused when it loads.",
          tone: "rose",
        }
      : blocked > 0
        ? {
            value: blocked,
            caption: blocked === 1 ? "Flow blocked" : "Flows blocked",
            note: "A seat it asks for has no role, so a run on it stops before an agent starts.",
            tone: "amber",
          }
        : pending > 0
          ? {
              value: pending,
              caption: "Pending",
              note: creating
                ? "This crew is saved by hand. The blocks below are the exact bytes."
                : "Some of this saves here; the structural part is pasted.",
              tone: "violet",
            }
          : {
              value: "Clear",
              caption: "Nothing pending",
              tone: "emerald",
            };

  return (
    <PageShell>
      <Deck>
        <Cell size="full" reason="masthead">
          <PageHero
            state={status}
            title={creating ? "New crew" : state.label || state.crewId}
            purpose="A crew is the cast for a run. Each role names the seats it can fill, the profile it runs on, and the instructions it works from."
            actions={
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  iconLeft={<ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.9} />}
                  onClick={onBack}
                >
                  All crews
                </Button>
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
                {/* A new crew always has a pending "create" step, so Discard
                    keys on whether anything was actually typed. */}
                {(creating ? state.crewId !== "" || state.label !== "" || roles.length > 0 : pending > 0) ? (
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
                {/* A crew that does not exist yet has nothing this page can
                    write: `planCrewSave` puts every part of creating it in the
                    manual bucket. Rendering Save there would put a control that
                    can never fire in the loudest slot on the page. The footer
                    and the paste blocks below carry that story instead. */}
                {creating ? null : (
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={saving || problems.length > 0 || plan.writable.length === 0}
                    iconLeft={<Save className="h-3.5 w-3.5" strokeWidth={2} />}
                    onClick={() => void save()}
                  >
                    {saving
                      ? "Saving…"
                      : plan.writable.length === 0
                        ? "Nothing to save"
                        : `Save ${plan.writable.length} change${plan.writable.length === 1 ? "" : "s"}`}
                  </Button>
                )}
              </>
            }
            metrics={[
              { value: roles.length, label: roles.length === 1 ? "role" : "roles" },
              { value: seats.length, label: "seats available" },
              blocked > 0
                ? {
                    value: blocked,
                    label: blocked === 1 ? "flow blocked" : "flows blocked",
                    tone: "bad",
                  }
                : { value: fits.length, label: "flows it runs", tone: "good" },
              { value: plan.writable.length, label: "saves here" },
              { value: plan.manual.length, label: "pasted by hand" },
            ]}
            footer={
              creating
                ? "Composing a crew here writes nothing. The role files and the crew block are yours to save."
                : "Role parameters and instructions save from this page. Adding, removing, or renaming a role is a project.yml edit."
            }
          />
        </Cell>

        {crewProblems.length > 0 ? (
          <Cell size="full" reason="masthead">
            <ErrorState
              compact
              title={crewProblems.length === 1 ? "One thing to fix" : `${crewProblems.length} things to fix`}
              hint={crewProblems.map((p) => p.message).join(" ")}
            />
          </Cell>
        ) : null}

        {failures.length > 0 ? (
          <Cell size="full" reason="masthead">
            <ErrorState
              compact
              title={`${failures.length} change${failures.length === 1 ? "" : "s"} did not save`}
              hint="Everything else on this page did save. Fix these and save again."
              detail={failures.map((f) => `${f.summary}: ${f.message}`).join(" | ")}
              actions={[{ label: "Try again", onClick: () => void save(), variant: "secondary" }]}
            />
          </Cell>
        ) : null}

        <Cell size="full" reason="masthead">
          <Section flush title="The crew">
            <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4">
              <div className="grid gap-3 sm:grid-cols-3">
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
                    className="mono w-full rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 px-2.5 py-1.5 text-[12.5px] text-chalk-100 outline-none placeholder:text-chalk-300/70 focus:border-violet-soft/50 disabled:opacity-60"
                  />
                  <span className="mt-1 block text-meta text-chalk-300">
                    {creating
                      ? "How runs name this crew."
                      : "A crew's id is its key in the config and cannot be changed here."}
                  </span>
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
                <label className="block">
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
                    // instead of a number field keeps an out-of-range value from
                    // reaching the config at all.
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
        </Cell>

        <Cell size="full" reason="masthead">
          <CrewFlowFit fits={fits} />
        </Cell>

        <Cell size="full" reason="nested-deck">
          <Section
            flush
            title="Roles"
            action={
              <Button
                variant="secondary"
                size="sm"
                disabled={saving}
                iconLeft={<Plus className="h-3.5 w-3.5" strokeWidth={2} />}
                onClick={addRole}
              >
                Add a role
              </Button>
            }
          >
            {profiles.length === 0 ? (
              <ErrorState
                compact
                className="mb-3"
                title="This project has no profiles"
                hint="A role runs on a profile, so every role here will be incomplete until one exists. Add a profile on the Crew page, then come back."
              />
            ) : null}
            {roles.length === 0 ? (
              <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 px-6 py-8 text-center">
                <p className="text-[13px] text-chalk-300">
                  A crew with no roles fills no seats.
                </p>
                <div className="mt-3 flex justify-center">
                  <Button
                    variant="primary"
                    size="sm"
                    iconLeft={<Plus className="h-3.5 w-3.5" strokeWidth={2} />}
                    onClick={addRole}
                  >
                    Add the first role
                  </Button>
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
                    seatTakers={seatTakers}
                    profiles={profiles}
                    permissions={permissions}
                    skills={skills}
                    problems={problems.filter((p) => p.roleKey === role.key)}
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

        <Cell size="full" reason="masthead">
          {/* Bytes derived from an invalid crew are worse than no bytes: paste
              them and the config stops loading. The problems panel above already
              says what is missing, so nothing is shown until it is. */}
          {problems.length === 0 ? (
            <CrewManualChanges changes={plan.manual} creating={creating} />
          ) : null}
        </Cell>
      </Deck>

      <ToastView toast={toast} />
    </PageShell>
  );
}

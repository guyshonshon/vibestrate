import { useEffect, useState } from "react";
import { ChevronDown, Cpu, Eye, PenLine, Plus, Save, X } from "lucide-react";
import { api } from "../../lib/api.js";
import type {
  CrewRoleView,
  ProfileView,
  ProviderCatalog,
  DiscoveredSkill,
} from "../../lib/types.js";
import { Button } from "../design/Button.js";
import { ToneDot, toneForId } from "../design/Chip.js";
import type { Toast } from "../design/useToast.js";
import { Select } from "../design/Select.js";
import { cn } from "../design/cn.js";
import { NewProfileInline } from "./NewProfileInline.js";
import {
  TONE_WASH,
  TONE_AVATAR,
  TONE_SEAT_ON,
  PERMISSION_OPTIONS,
  PERMISSION_LABEL,
  type SeatCoverageEntry,
} from "./helpers.js";

export function RoleCard({
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

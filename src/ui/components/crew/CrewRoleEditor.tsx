// One role, fully editable: its wiring (seats, profile, permissions, skills)
// and its instructions. Derived from RoleCard, which is the read-and-nudge
// version of the same object on the crew configuration page - same tonal header
// band, same seat toggles, same profile row - so a role looks like a role
// wherever it is. The differences are the ones an editor needs: the id and label
// are inputs, the role can be removed, and the prompt is a first-class editing
// surface rather than a disclosure at the bottom.

import { Trash2, X } from "lucide-react";
import type { DiscoveredSkill, ProfileView } from "../../lib/types.js";
import { Button } from "../design/Button.js";
import { ToneDot, toneForId } from "../design/Chip.js";
import { ErrorState } from "../design/ErrorState.js";
import { Select } from "../design/Select.js";
import { StatTile } from "../design/StatTile.js";
import { cn } from "../design/cn.js";
import {
  MAX_PROMPT_CHARS,
  defaultPromptPath,
  roleChangeCount,
  type EditorProblem,
  type EditorRole,
} from "./crew-editor-model.js";
import {
  PERMISSION_LABEL,
  TONE_AVATAR,
  TONE_SEAT_ON,
  TONE_WASH,
} from "./helpers.js";

const FIELD =
  "w-full rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 px-2.5 py-1.5 text-[13px] text-chalk-100 outline-none placeholder:text-chalk-300/70 focus:border-violet-soft/50";

export function CrewRoleEditor({
  role,
  seatVocabulary,
  seatTakers,
  profiles,
  permissions,
  skills,
  problems,
  disabled,
  onChange,
  onRemove,
}: {
  role: EditorRole;
  seatVocabulary: string[];
  /** seat id -> the role keys taking it, so a contested seat reads as contested
   *  on every card that causes it, not just the first. */
  seatTakers: Map<string, string[]>;
  profiles: ProfileView[];
  permissions: string[];
  skills: DiscoveredSkill[];
  problems: EditorProblem[];
  disabled: boolean;
  onChange: (patch: Partial<EditorRole>) => void;
  onRemove: () => void;
}) {
  const tone = toneForId(role.id || role.key);
  const profile = profiles.find((p) => p.id === role.profile) ?? null;
  const changes = roleChangeCount(role);
  const availableSkills = skills.map((s) => s.name).filter((n) => !role.skills.includes(n));
  const initials = (role.label || role.id || "??").slice(0, 2);
  const promptPath = role.promptPath || defaultPromptPath(role.id || "role");
  const overCap = role.prompt.length > MAX_PROMPT_CHARS;

  return (
    <div className="overflow-hidden rounded-[18px] border border-[color:var(--line)] bg-coal-600">
      <div
        className={cn(
          "flex flex-wrap items-end justify-between gap-3 border-b border-[color:var(--line-soft)] px-4 py-3",
          TONE_WASH[tone],
        )}
      >
        <div className="flex min-w-0 flex-1 items-end gap-3">
          <span
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] mono text-[15px] font-bold uppercase",
              TONE_AVATAR[tone],
            )}
          >
            {initials}
          </span>
          <label className="block min-w-0 flex-1">
            <span className="mb-1 block text-[12px] font-semibold text-violet-vivid">
              Name
            </span>
            <input
              value={role.label}
              disabled={disabled}
              placeholder="Reviewer"
              onChange={(e) => onChange({ label: e.target.value })}
              className={FIELD}
            />
          </label>
          <label className="block min-w-0 flex-1">
            <span className="mb-1 block text-[12px] font-semibold text-violet-vivid">
              Id
            </span>
            <input
              value={role.id}
              disabled={disabled}
              spellCheck={false}
              placeholder="reviewer"
              onChange={(e) => onChange({ id: e.target.value })}
              className={cn(FIELD, "mono text-[12.5px]")}
            />
          </label>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatTile value={role.seats.length} label={role.seats.length === 1 ? "seat" : "seats"} />
          <StatTile
            value={role.prompt.length.toLocaleString()}
            label="characters"
            tone={overCap ? "rose" : "default"}
          />
          {changes === -1 ? (
            <StatTile value="new" label="not on disk" tone="amber" />
          ) : changes > 0 ? (
            <StatTile value={changes} label="edited" tone="violet" />
          ) : null}
          <Button
            variant="danger"
            size="sm"
            disabled={disabled}
            onClick={onRemove}
            iconLeft={<Trash2 className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden />}
          >
            Remove
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-4">
        {problems.length > 0 ? (
          <ErrorState
            compact
            title={problems.length === 1 ? "This role is not ready" : `${problems.length} things to fix`}
            hint={problems.map((p) => p.message).join(" ")}
          />
        ) : null}

        <div>
          <div className="mb-1.5 text-[12px] font-semibold text-violet-vivid">
            Seats it takes
          </div>
          {seatVocabulary.length === 0 ? (
            <p className="text-[12px] text-chalk-300">
              No flow declares a seat yet, so there is nothing to assign.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {seatVocabulary.map((seat) => {
                const on = role.seats.includes(seat);
                const contested = on && (seatTakers.get(seat)?.length ?? 0) > 1;
                return (
                  <button
                    key={seat}
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      onChange({
                        seats: on
                          ? role.seats.filter((s) => s !== seat)
                          : [...role.seats, seat],
                      })
                    }
                    className={cn(
                      "inline-flex items-center gap-1 rounded-[10px] border px-2 py-1 text-[11.5px] transition disabled:opacity-50",
                      on
                        ? contested
                          ? "border-amber-soft/40 bg-amber-soft/10 text-amber-soft"
                          : TONE_SEAT_ON[tone]
                        : "border-[color:var(--line)] bg-transparent text-chalk-300 hover:border-[color:var(--line-strong)] hover:text-chalk-100",
                    )}
                  >
                    {on ? <ToneDot tone={contested ? "amber" : tone} /> : null}
                    {seat}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-violet-vivid">
              Profile it runs on
            </span>
            <Select
              value={role.profile}
              disabled={disabled}
              ariaLabel="Profile"
              placeholder={profiles.length === 0 ? "No profiles yet" : "Pick a profile"}
              onChange={(v) => onChange({ profile: v })}
              options={[
                ...profiles.map((p) => ({
                  value: p.id,
                  label: p.label,
                  hint: p.model ?? p.provider,
                })),
                // A role can point at a profile that no longer exists. Keeping
                // it in the list is what makes that visible instead of silently
                // resetting the role to someone else's profile.
                ...(role.profile && !profile
                  ? [{ value: role.profile, label: role.profile, hint: "missing" }]
                  : []),
              ]}
            />
            <span className="mt-1 block text-[11.5px] text-chalk-300">
              {profile
                ? `${profile.provider}${profile.model ? ` - ${profile.model}` : ""}${profile.power ? ` - ${profile.power}` : ""}`
                : role.profile
                  ? "This profile is not in the project config."
                  : "Every role runs on a profile."}
            </span>
            {profile?.modelIssue ? (
              <span className="mt-1 block text-[11.5px] text-amber-soft">
                {profile.modelIssue}
              </span>
            ) : null}
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-violet-vivid">
              What it may do
            </span>
            <Select
              value={role.permissions}
              disabled={disabled}
              ariaLabel="Permissions"
              onChange={(v) => onChange({ permissions: v })}
              options={permissions.map((p) => ({
                value: p,
                label: PERMISSION_LABEL[p] ?? p.replace(/_/g, " "),
                hint: PERMISSION_LABEL[p] ? undefined : "project profile",
              }))}
            />
            <span className="mt-1 block text-[11.5px] text-chalk-300">
              {role.permissions === "code_write"
                ? "This role writes files inside the run's worktree."
                : "This role reads. It cannot change your files."}
            </span>
          </label>
        </div>

        <div>
          <div className="mb-1.5 text-[12px] font-semibold text-violet-vivid">Skills</div>
          <div className="flex flex-wrap items-center gap-1.5">
            {role.skills.map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1 rounded-[10px] border border-[color:var(--line)] bg-coal-500/50 px-2 py-0.5 text-[11px] text-chalk-200"
              >
                {s}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange({ skills: role.skills.filter((x) => x !== s) })}
                  className="text-chalk-300 transition hover:text-rose-300"
                  aria-label={`Detach ${s}`}
                >
                  <X className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
                </button>
              </span>
            ))}
            {availableSkills.length > 0 ? (
              <Select
                value=""
                ariaLabel="Attach a skill"
                placeholder="+ skill…"
                disabled={disabled}
                className="min-w-[140px]"
                onChange={(v) => onChange({ skills: [...role.skills, v] })}
                options={availableSkills.map((n) => ({ value: n, label: n }))}
              />
            ) : role.skills.length === 0 ? (
              <span className="text-[11.5px] text-chalk-300">
                This project has no skills to attach.
              </span>
            ) : null}
          </div>
        </div>

        <div className="border-t border-[color:var(--line-soft)] pt-3.5">
          <div className="mb-1.5 flex flex-wrap items-baseline gap-2">
            <span className="text-[12px] font-semibold text-violet-vivid">
              Instructions
            </span>
            <span className="text-[11.5px] text-chalk-300">
              the text this role works from
            </span>
            <span className="mono ml-auto truncate text-[11.5px] text-chalk-300">
              {promptPath}
            </span>
          </div>
          {role.loadError ? (
            <ErrorState
              compact
              className="mb-2"
              title="This role's file could not be read"
              detail={role.loadError}
              hint="Write the instructions below and save. That rewrites the file through the same check the loader uses."
            />
          ) : null}
          <textarea
            value={role.prompt}
            disabled={disabled}
            spellCheck={false}
            rows={14}
            placeholder="You review a diff against the plan it claims to implement. You name what is wrong and where, and you do not edit files."
            onChange={(e) => onChange({ prompt: e.target.value })}
            className={cn(
              "mono w-full resize-y rounded-[12px] border border-[color:var(--line-strong)] bg-coal-800 px-3 py-2.5 text-[12px] leading-[1.6] text-chalk-100 outline-none placeholder:text-chalk-300/60 focus:border-violet-soft/50",
              overCap && "border-rose-400/50",
            )}
          />
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-3">
            <span
              className={cn(
                "num-tabular text-[11px]",
                overCap ? "text-rose-300" : "text-chalk-300",
              )}
            >
              {role.prompt.length.toLocaleString()} / {MAX_PROMPT_CHARS.toLocaleString()}
            </span>
            <span className="text-[11.5px] text-chalk-300">
              Stored as JSON in the role file. The editor holds the text.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

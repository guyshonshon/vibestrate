// One role, fully editable: its wiring (seats, profile, permissions, skills)
// and its instructions. Derived from RoleCard, which is the read-and-nudge
// version of the same object on the crew configuration page - same tonal header
// band, same seat toggles, same profile row - so a role looks like a role
// wherever it is. The differences are the ones an editor needs: the id and label
// are inputs, the role can be removed, and the prompt is a first-class editing
// surface rather than a disclosure at the bottom.
//
// Every validator message lands ON the control that owns it, and only once that
// control has been used or the owner has asked to save. A card that opens with
// five red sentences about fields nobody has filled in yet is reporting the
// obvious, and it buried the one message that arrived because of something the
// owner actually did.

import { useState } from "react";
import { Trash2, X } from "lucide-react";
import type { DiscoveredSkill, ProfileView } from "../../lib/types.js";
import { Button } from "../design/Button.js";
import { ToneDot, toneForId } from "../design/Chip.js";
import { Select } from "../design/Select.js";
import { StatTile } from "../design/StatTile.js";
import { cn } from "../design/cn.js";
import { RoleInstructions } from "./RoleInstructions.js";
import {
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

/** The border colour is applied separately from the rest of the field because
 *  cn() is clsx, not tailwind-merge: two border-colour classes on one element
 *  both ship, and the winner is whichever Tailwind emitted last. */
const FIELD =
  "w-full rounded-[10px] border bg-coal-800 px-2.5 py-1.5 text-[13px] text-chalk-100 outline-none placeholder:text-chalk-300/70";
const FIELD_LINE = "border-[color:var(--line-strong)] focus:border-violet-soft/50";
const FIELD_BAD = "border-rose-400/60";

/** Which control each validator message belongs to. Branching on the code, not
 *  the sentence, is what keeps a reworded message anchored. */
type RoleField = "id" | "seats" | "profile" | "permissions" | "prompt";

const FIELD_FOR: Partial<Record<EditorProblem["code"], RoleField>> = {
  "role-id": "id",
  "role-id-dupe": "id",
  "role-seats": "seats",
  "role-profile": "profile",
  "role-permissions": "permissions",
  "role-prompt": "prompt",
  "role-prompt-long": "prompt",
};

function FieldError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return <span className="mt-1 block text-meta leading-[1.45] text-rose-300">{message}</span>;
}

export function CrewRoleEditor({
  role,
  seatVocabulary,
  seatTakers,
  profiles,
  permissions,
  skills,
  problems,
  saveErrors,
  showAllProblems,
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
  /** Writes for this role the server refused, so a partial save reports on the
   *  card that failed instead of in a banner listing role names. */
  saveErrors: string[];
  /** Save was pressed: report every problem, including on controls the owner
   *  never opened. */
  showAllProblems: boolean;
  disabled: boolean;
  onChange: (patch: Partial<EditorRole>) => void;
  onRemove: () => void;
}) {
  const [used, setUsed] = useState<ReadonlySet<RoleField>>(new Set());
  const use = (field: RoleField) =>
    setUsed((prev) => (prev.has(field) ? prev : new Set(prev).add(field)));

  const errorFor = (field: RoleField): string | undefined => {
    if (!showAllProblems && !used.has(field)) return undefined;
    return problems.find((p) => FIELD_FOR[p.code] === field)?.message;
  };

  const tone = toneForId(role.id || role.key);
  const profile = profiles.find((p) => p.id === role.profile) ?? null;
  const changes = roleChangeCount(role);
  const availableSkills = skills.map((s) => s.name).filter((n) => !role.skills.includes(n));
  const initials = (role.label || role.id || "??").slice(0, 2);
  const promptPath = role.promptPath || defaultPromptPath(role.id || "role");
  const idError = errorFor("id");
  const seatsError = errorFor("seats");
  const profileError = errorFor("profile");
  const permissionsError = errorFor("permissions");
  const promptError = errorFor("prompt");

  return (
    <div className="overflow-hidden rounded-[18px] border border-[color:var(--line)] bg-coal-600">
      <div
        className={cn(
          "flex flex-wrap items-start justify-between gap-3 border-b border-[color:var(--line-soft)] px-4 py-3",
          TONE_WASH[tone],
        )}
      >
        {/* Top-aligned, with the avatar and the tiles dropped by one field
            label, so the row stays level when a message appears under the id
            input instead of shifting with the tallest column. */}
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            className={cn(
              "mt-[22px] flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] mono text-[15px] font-bold uppercase",
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
              className={cn(FIELD, FIELD_LINE)}
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
              onBlur={() => use("id")}
              className={cn(FIELD, "mono text-[12.5px]", idError ? FIELD_BAD : FIELD_LINE)}
            />
            <FieldError message={idError} />
          </label>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-[22px]">
          <StatTile value={role.seats.length} label={role.seats.length === 1 ? "seat" : "seats"} />
          {changes > 0 ? <StatTile value={changes} label="changes" tone="violet" /> : null}
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
        {saveErrors.map((err, i) => (
          <p key={i} className="text-meta leading-[1.45] text-rose-300">
            {err}
          </p>
        ))}

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
                    onClick={() => {
                      use("seats");
                      onChange({
                        seats: on
                          ? role.seats.filter((s) => s !== seat)
                          : [...role.seats, seat],
                      });
                    }}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-[10px] border px-2 py-1 text-meta transition disabled:opacity-50",
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
          <FieldError message={seatsError} />
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
              onChange={(v) => {
                use("profile");
                onChange({ profile: v });
              }}
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
            {profileError ? (
              <FieldError message={profileError} />
            ) : (
              <span className="mt-1 block text-meta text-chalk-300">
                {profile
                  ? `${profile.provider}${profile.model ? ` - ${profile.model}` : ""}${profile.power ? ` - ${profile.power}` : ""}`
                  : role.profile
                    ? "This profile is not in the project config."
                    : "Every role runs on a profile."}
              </span>
            )}
            {profile?.modelIssue ? (
              <span className="mt-1 block text-meta text-amber-soft">
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
              onChange={(v) => {
                use("permissions");
                onChange({ permissions: v });
              }}
              options={permissions.map((p) => ({
                value: p,
                label: PERMISSION_LABEL[p] ?? p.replace(/_/g, " "),
                hint: PERMISSION_LABEL[p] ? undefined : "project profile",
              }))}
            />
            {permissionsError ? (
              <FieldError message={permissionsError} />
            ) : (
              <span className="mt-1 block text-meta text-chalk-300">
                {role.permissions === "code_write"
                  ? "This role writes files inside the run's worktree."
                  : "This role reads. It cannot change your files."}
              </span>
            )}
          </label>
        </div>

        <div>
          <div className="mb-1.5 text-[12px] font-semibold text-violet-vivid">Skills</div>
          <div className="flex flex-wrap items-center gap-1.5">
            {role.skills.map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1 rounded-[10px] border border-[color:var(--line)] bg-coal-500/50 px-2 py-0.5 text-meta text-chalk-200"
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
              <span className="text-meta text-chalk-300">
                This project has no skills to attach.
              </span>
            ) : null}
          </div>
        </div>

        <div className="border-t border-[color:var(--line-soft)] pt-3.5">
          {/* This page saves every role at once from the header, so the
              instructions carry no save control of their own. */}
          <RoleInstructions
            roleId={role.id || role.key}
            promptPath={promptPath}
            value={role.prompt}
            disabled={disabled}
            defaultMode="edit"
            loadError={role.loadError}
            rows={14}
            onChange={(next) => {
              use("prompt");
              onChange({ prompt: next });
            }}
          />
          <FieldError message={promptError} />
        </div>
      </div>
    </div>
  );
}

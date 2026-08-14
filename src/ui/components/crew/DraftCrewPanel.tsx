// Draft a crew from a plain-English description - the dashboard half of
// `vibe crew draft`. Same seam as the flow draft: one model call, an editable
// draft back, nothing written.
//
// Read-only by design, and the panel says so rather than implying otherwise:
// no route installs a drafted crew, so the owner saves BOTH artifacts by hand -
// one JSON role file per role, then the `crews.<id>` block under `crews:` in
// .vibestrate/project.yml. Rendering only the block would hand the owner a crew
// whose roles all point at files nobody wrote, and the first run would stop at
// "Role file not found" before an agent started; so every role file is shown in
// full, copyable, ahead of the block that points at it.
// Do not add a "create" button here until a guarded writer exists behind it.
//
// AssistCurrencyReport and YamlBlock come from the flow draft panel on purpose:
// the two authoring surfaces must present the same trust signal identically, so
// they share one implementation instead of forking it. They belong in
// components/design/ once a third surface needs them.

import { useState } from "react";
import { ChevronDown, ChevronRight, Wand2 } from "lucide-react";
import { api } from "../../lib/api.js";
import { ErrorView } from "../../lib/error-view.js";
import { LoadingState } from "../design/ErrorState.js";
import type { CrewDraft } from "../../lib/types.js";
import { Button } from "../design/Button.js";
import { Chip } from "../design/Chip.js";
import { FormField } from "../design/FormField.js";
import { StatTile } from "../design/StatTile.js";
import { cn } from "../design/cn.js";
import {
  AssistCurrencyReport,
  YamlBlock,
} from "../flow-builder/DraftFlowPanel.js";

/** The route caps the description at 1,000 characters. Mirrored here so the
 *  owner sees the limit while typing instead of a 400 after a round-trip. */
const MAX_DESCRIPTION = 1000;

const TEXTAREA =
  "w-full resize-y rounded-[12px] border border-[color:var(--line-strong)] bg-coal-800 px-3 py-2.5 text-[13px] leading-[1.5] text-chalk-100 outline-none placeholder:text-chalk-300/70 focus:border-violet-soft/50";

export function DraftCrewPanel({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [draft, setDraft] = useState<CrewDraft | null>(null);

  const trimmed = description.trim();
  const tooLong = trimmed.length > MAX_DESCRIPTION;

  async function requestDraft() {
    if (!trimmed || tooLong) return;
    setBusy(true);
    setError(null);
    setDraft(null);
    try {
      const r = await api.draftCrew(trimmed);
      setDraft(r.draft);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={cn(
        "rounded-[18px] border border-violet-soft/20 bg-violet-soft/[0.06]",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-violet-soft" strokeWidth={1.9} aria-hidden />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-violet-soft" strokeWidth={1.9} aria-hidden />
        )}
        <Wand2 className="h-4 w-4 shrink-0 text-violet-soft" strokeWidth={2} aria-hidden />
        <span className="text-[14px] font-bold text-chalk-100">Draft a crew</span>
        <span className="text-[12px] text-chalk-300">
          from a description - the supervisor proposes a roster you review
        </span>
      </button>

      {open ? (
        <div className="border-t border-violet-soft/15 px-4 py-3.5">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
            <FormField label="Who should be on this crew">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. a small crew for backend work: one planner, one implementer that can write code, and a reviewer on a different model that only reads"
                rows={4}
                className={cn(TEXTAREA, tooLong && "border-rose-400/50")}
              />
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <span
                  className={cn(
                    "num-tabular text-[11px]",
                    tooLong ? "text-rose-300" : "text-chalk-300",
                  )}
                >
                  {trimmed.length} / {MAX_DESCRIPTION}
                </span>
                {tooLong ? (
                  <span className="text-[11.5px] text-rose-300">
                    Over the cap by {trimmed.length - MAX_DESCRIPTION}. Drafting needs a
                    shorter description.
                  </span>
                ) : null}
              </div>
            </FormField>

            <div className="flex flex-col gap-2">
              <Button
                variant="primary"
                size="md"
                className="w-full"
                disabled={busy || !trimmed || tooLong}
                iconLeft={<Wand2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
                onClick={() => void requestDraft()}
              >
                {busy ? "Drafting…" : "Draft"}
              </Button>
              <p className="text-[11.5px] leading-[1.45] text-chalk-300">
                The draft uses profiles and permissions this project already has.
              </p>
            </div>
          </div>

          {busy ? (
            <LoadingState
              compact
              className="mt-4"
              title="Drafting a crew"
              detail="The supervisor is matching roles to the seats your flows use. It reads the project and cannot write."
            />
          ) : null}

          {error ? (
            <ErrorView
              compact
              className="mt-4"
              err={error}
              override={{ title: "The draft did not come back" }}
              onRetry={() => void requestDraft()}
            />
          ) : null}

          {draft ? <CrewDraftReview draft={draft} onDiscard={() => setDraft(null)} /> : null}
        </div>
      ) : null}
    </section>
  );
}

function CrewDraftReview({
  draft,
  onDiscard,
}: {
  draft: CrewDraft;
  onDiscard: () => void;
}) {
  const roles = Object.entries(draft.crew.roles ?? {});
  const seats = new Set(roles.flatMap(([, r]) => r.seats ?? []));

  return (
    <div className="mt-4 rounded-[16px] border border-[color:var(--line)] bg-coal-700 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-bold text-chalk-100">
            {draft.crew.label || draft.crewId}
          </h3>
          <p className="mono mt-0.5 text-[11.5px] text-violet-soft">{draft.crewId}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatTile value={roles.length} label={roles.length === 1 ? "role" : "roles"} />
          <StatTile value={seats.size} label={seats.size === 1 ? "seat" : "seats"} />
          {draft.problems.length > 0 ? (
            <StatTile value={draft.problems.length} label="to do" tone="amber" />
          ) : (
            <StatTile value="none" label="to do" tone="emerald" />
          )}
        </div>
      </div>

      {draft.rationale ? (
        <p className="mt-2.5 max-w-[80ch] text-[12.5px] leading-[1.5] text-chalk-300">
          <span className="font-semibold text-violet-vivid">Why this roster: </span>
          {draft.rationale}
        </p>
      ) : null}

      {draft.problems.length > 0 ? (
        <div className="mt-3.5 rounded-[12px] border border-amber-soft/30 bg-amber-soft/10 px-3 py-2.5">
          <div className="text-[12px] font-semibold text-amber-soft">
            Before this crew can run
          </div>
          <ul className="mt-1.5 space-y-1">
            {draft.problems.map((p, i) => (
              <li key={i} className="text-[12px] leading-[1.45] text-chalk-100">
                {p}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-3.5">
        <div className="mb-1.5 text-[12px] font-semibold text-violet-vivid">Roles</div>
        <ul className="space-y-1.5">
          {roles.map(([roleId, role]) => (
            <li
              key={roleId}
              className="rounded-[12px] border border-[color:var(--line-soft)] bg-coal-600 px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12.5px] font-semibold text-chalk-100">
                  {role.label || roleId}
                </span>
                <span className="mono text-[11px] text-violet-soft">{roleId}</span>
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                  {(role.seats ?? []).map((s) => (
                    <Chip key={s} contained tone="violet">
                      {s}
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11.5px]">
                <span className="text-chalk-300">
                  <span className="font-semibold text-violet-vivid">profile </span>
                  <span className="mono text-chalk-100">{role.profile}</span>
                </span>
                <span className="text-chalk-300">
                  <span className="font-semibold text-violet-vivid">permissions </span>
                  <span className="mono text-chalk-100">{role.permissions}</span>
                </span>
                <span className="min-w-0 truncate text-chalk-300">
                  <span className="font-semibold text-violet-vivid">prompt </span>
                  <span className="mono text-chalk-100">{role.prompt}</span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <AssistCurrencyReport currency={draft.currency} className="mt-4" />

      {/* The role files come before the crew block, in both the reading order
          and the saving order: the block points at these paths, so a block
          installed on its own is a crew that cannot load. YamlBlock is the
          shared titled-copyable-block primitive - the contents here are JSON. */}
      <div className="mt-4">
        <div className="text-[12px] font-semibold text-violet-vivid">
          The role files ({draft.roleFiles.length})
        </div>
        <p className="mt-0.5 max-w-[80ch] text-[11.5px] leading-[1.45] text-chalk-300">
          A role&apos;s instructions live in its own file, and the crew block points at
          these paths. They are saved first - a role file that is not there stops the
          first run before any agent starts.
        </p>
        {draft.roleFiles.map((file) => (
          <YamlBlock
            key={file.roleId}
            yaml={file.json}
            title={file.roleId}
            path={file.path}
            className="mt-2.5"
          />
        ))}
      </div>

      <YamlBlock
        yaml={draft.yaml}
        title="The crew block"
        path=".vibestrate/project.yml"
        className="mt-4"
      />

      <div className="mt-3 rounded-[12px] border border-[color:var(--line)] bg-coal-600 px-3 py-2.5">
        <p className="max-w-[80ch] text-[12px] leading-[1.5] text-chalk-300">
          <span className="font-semibold text-violet-vivid">Installing is manual. </span>
          The {draft.roleFiles.length === 1 ? "role file goes" : "role files go"} in{" "}
          <span className="mono text-chalk-100">.vibestrate/roles/</span> first, then this
          block goes under <span className="mono text-chalk-100">crews:</span> in your
          project config
          {draft.exists ? (
            <>
              , replacing the{" "}
              <span className="mono text-chalk-100">{draft.crewId}</span> already there
            </>
          ) : null}
          . Nothing writes either of them for you.
        </p>
      </div>

      <div className="mt-3.5">
        <Button variant="ghost" size="sm" onClick={onDiscard}>
          Discard
        </Button>
      </div>
    </div>
  );
}

// Draft a flow from a plain-English description - the dashboard half of
// `vibe flows draft`, and the same seam the Policies page's "Draft with the
// supervisor" uses: one model call, an editable draft back, and a separate
// explicit action that writes.
//
// Two things this panel exists to say honestly:
//   - Nothing is on disk. `targetPath` is where accepting WOULD write, and
//     Create is the accept step - POST /api/flows, the same guarded writer the
//     import path uses. There is no new write path behind this panel.
//   - The currency report is the drafting agent's own self-report. Vibestrate
//     opens no socket to check a fact that moves, so both lists render even
//     when empty: an empty "Could not verify" is then a claim the owner can
//     weigh rather than an absence they never see.

import { useEffect, useState } from "react";
import { Check, Copy, Wand2 } from "lucide-react";
import { api } from "../../lib/api.js";
import { ErrorView } from "../../lib/error-view.js";
import {
  Skeleton,
  SkeletonBlock,
  SkeletonRows,
  SkeletonStats,
  SkeletonText,
} from "../design/Skeleton.js";
import type { AssistCurrency, FlowDraft } from "../../lib/types/flows.js";
import type { CrewView, SeatCoverage } from "../../lib/types.js";
import { Button } from "../design/Button.js";
import { Chip, type ChipTone } from "../design/Chip.js";
import { FlowBars } from "../design/FlowBars.js";
import { FlowCard } from "../design/FlowCard.js";
import { FormField } from "../design/FormField.js";
import { Select } from "../design/Select.js";
import {
  STEP_GROUP_TONE,
  stepKindGroup,
  stepKindName,
} from "../design/stepKind.js";
import { cn } from "../design/cn.js";

/** The route caps the description at 1,000 characters. Mirrored here so the
 *  owner sees the limit while typing instead of a 400 after a round-trip. */
const MAX_DESCRIPTION = 1000;

const TEXTAREA =
  "w-full resize-y rounded-[12px] border border-[color:var(--line-strong)] bg-coal-800 px-3 py-2.5 text-[13px] leading-[1.5] text-chalk-100 outline-none placeholder:text-chalk-300/70 focus:border-violet-soft/50";

const COVERAGE_TONE: Record<SeatCoverage["status"], ChipTone> = {
  filled: "emerald",
  gap: "rose",
  ambiguous: "amber",
};

export function DraftFlowPanel({
  onCreated,
}: {
  /** Fired after the owner accepts a draft and the flow is written. */
  onCreated?: (flowId: string) => void;
}) {
  const [description, setDescription] = useState("");
  const [crewId, setCrewId] = useState("");
  const [crews, setCrews] = useState<CrewView[] | null>(null);
  const [crewsFailed, setCrewsFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [draft, setDraft] = useState<FlowDraft | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<unknown>(null);

  // The crew only picks which roster coverage is measured against; drafting
  // works without it (the service falls back to the project default), so a
  // failed load costs the picker, not the panel.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await api.getCrews();
        if (!cancelled) setCrews(r.crews);
      } catch {
        if (!cancelled) setCrewsFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const trimmed = description.trim();
  const tooLong = trimmed.length > MAX_DESCRIPTION;

  async function requestDraft() {
    if (!trimmed || tooLong) return;
    setBusy(true);
    setError(null);
    setCreateError(null);
    setDraft(null);
    setOverwrite(false);
    try {
      const r = await api.draftFlow({
        description: trimmed,
        crewId: crewId || undefined,
      });
      setDraft(r.draft);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function accept() {
    if (!draft) return;
    setCreating(true);
    setCreateError(null);
    try {
      const r = await api.createFlow(draft.flow, overwrite || undefined);
      setDraft(null);
      setDescription("");
      setOverwrite(false);
      onCreated?.(r.flowId);
    } catch (err) {
      setCreateError(err);
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="rounded-[20px] border border-violet-soft/20 bg-violet-soft/[0.06] p-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="flex items-center gap-2 text-[15px] font-bold text-chalk-100">
          <Wand2 className="h-4 w-4 text-violet-soft" strokeWidth={2} aria-hidden />
          Draft a flow
        </h2>
        <span className="text-[12px] text-chalk-300">
          from a description - the supervisor proposes steps and seats, you decide
          whether it is saved
        </span>
      </div>

      <div className="mt-3.5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
        <FormField label="What should this flow do">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. plan the change, implement it, run the project's checks, then have a second model review the diff before a human approves the merge"
            rows={4}
            className={cn(TEXTAREA, tooLong && "border-rose-400/50")}
          />
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <span
              className={cn(
                "num-tabular text-meta",
                tooLong ? "text-rose-300" : "text-chalk-300",
              )}
            >
              {trimmed.length} / {MAX_DESCRIPTION}
            </span>
            {tooLong ? (
              <span className="text-meta text-rose-300">
                Over the cap by {trimmed.length - MAX_DESCRIPTION}. Drafting needs a
                shorter description.
              </span>
            ) : null}
          </div>
        </FormField>

        <div className="flex flex-col gap-2">
          <div>
            <div className="mb-1 text-[12px] font-semibold text-violet-vivid">
              Check seats against
            </div>
            <Select
              value={crewId}
              ariaLabel="crew to check seat coverage against"
              disabled={!crews || crews.length === 0}
              onChange={setCrewId}
              options={[
                { value: "", label: "Project default crew" },
                ...(crews ?? []).map((c) => ({ value: c.id, label: c.label })),
              ]}
            />
            {crewsFailed ? (
              <p className="mt-1.5 text-meta text-amber-soft">
                The crew list did not load. Coverage falls back to the project default.
              </p>
            ) : null}
          </div>
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
          <p className="text-meta leading-[1.45] text-chalk-300">
            Drafting reads the project and writes nothing.
          </p>
        </div>
      </div>

      {busy ? (
        // Shaped like the FlowCard review the draft resolves into.
        <Skeleton
          label="Drafting a flow"
          className="mt-4 rounded-[16px] border border-[color:var(--line)] bg-coal-700 p-4"
        >
          <div className="flex items-start gap-3">
            <SkeletonBlock w={40} h={40} radius={12} />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <SkeletonBlock h={15} w="46%" />
              <SkeletonText lines={2} size={11} gap={7} />
            </div>
          </div>
          <SkeletonStats className="mt-3" count={4} />
          <SkeletonRows className="mt-3.5" rows={4} lead="dot" meta />
        </Skeleton>
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

      {draft ? (
        <DraftReview
          draft={draft}
          creating={creating}
          createError={createError}
          overwrite={overwrite}
          onOverwriteChange={setOverwrite}
          onAccept={() => void accept()}
          onDiscard={() => {
            setDraft(null);
            setCreateError(null);
            setOverwrite(false);
          }}
        />
      ) : null}
    </section>
  );
}

/** The draft itself: what it proposes, where it would land, what the agent
 *  could not check, and the exact YAML accepting it would write. */
function DraftReview({
  draft,
  creating,
  createError,
  overwrite,
  onOverwriteChange,
  onAccept,
  onDiscard,
}: {
  draft: FlowDraft;
  creating: boolean;
  createError: unknown;
  overwrite: boolean;
  onOverwriteChange: (v: boolean) => void;
  onAccept: () => void;
  onDiscard: () => void;
}) {
  const steps = draft.flow.steps ?? [];
  const seats = Object.keys(draft.flow.seats ?? {});
  const gates = steps.filter((s) => s.kind === "approval-gate" || !!s.approval).length;
  const gaps = draft.coverage.seats.filter((s) => s.status === "gap");
  const ambiguous = draft.coverage.seats.filter((s) => s.status === "ambiguous");
  const blocked = draft.exists && !overwrite;

  return (
    <div className="mt-4 rounded-[16px] border border-[color:var(--line)] bg-coal-700 p-4">
      {/* A drafted flow is a flow, so it wears the catalog's card rather than
          a hand-built copy of its anatomy. Everything below is review material
          the card has no slot for. */}
      <FlowCard
        entity="flow"
        title={draft.flow.label}
        badge={<span className="mono shrink-0 text-meta text-violet-soft">{draft.flow.id}</span>}
        description={draft.flow.description}
        stats={[
          { value: steps.length, label: steps.length === 1 ? "step" : "steps" },
          { value: seats.length, label: seats.length === 1 ? "seat" : "seats" },
          ...(gates > 0 ? [{ value: gates, label: gates === 1 ? "gate" : "gates" }] : []),
          gaps.length > 0
            ? { value: gaps.length, label: "seats open" }
            : { value: "all", label: "seats filled" },
        ]}
      >
        <FlowBars steps={steps} />
      </FlowCard>

      {draft.rationale ? (
        <p className="mt-2 max-w-[80ch] text-[12.5px] leading-[1.5] text-chalk-300">
          <span className="font-semibold text-violet-vivid">Why this shape: </span>
          {draft.rationale}
        </p>
      ) : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div>
          <div className="mb-1.5 text-[12px] font-semibold text-violet-vivid">Steps</div>
          <ul className="rounded-[12px] border border-[color:var(--line-soft)] bg-coal-600 px-3 py-1">
            {steps.map((s, i) => (
              <li
                key={s.id}
                className="flex items-center gap-2.5 border-b border-[color:var(--line-soft)] py-1.5 last:border-0"
              >
                <span className="num-tabular w-4 shrink-0 text-right text-meta text-chalk-300">
                  {i + 1}
                </span>
                <Chip contained tone={STEP_GROUP_TONE[stepKindGroup(s.kind)]}>
                  {stepKindName(s.kind)}
                </Chip>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-chalk-100">
                  {s.label}
                </span>
                {s.seat ? (
                  <span className="mono shrink-0 text-meta text-violet-soft">{s.seat}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="mb-1.5 flex items-baseline gap-2">
            <span className="text-[12px] font-semibold text-violet-vivid">Seats</span>
            <span className="text-meta text-chalk-300">
              against {draft.coverage.crewId}
            </span>
          </div>
          <ul className="rounded-[12px] border border-[color:var(--line-soft)] bg-coal-600 px-3 py-1">
            {draft.coverage.seats.map((s) => (
              <li
                key={s.seatId}
                className="flex items-center gap-2.5 border-b border-[color:var(--line-soft)] py-1.5 last:border-0"
              >
                <span className="mono min-w-0 flex-1 truncate text-[12px] text-chalk-100">
                  {s.seatId}
                </span>
                {s.resolvedRoleId ? (
                  <span className="truncate text-meta text-chalk-300">
                    {s.resolvedRoleId}
                  </span>
                ) : null}
                <Chip tone={COVERAGE_TONE[s.status]}>{s.status}</Chip>
              </li>
            ))}
          </ul>
          {gaps.length > 0 ? (
            <p className="mt-1.5 text-meta leading-[1.45] text-amber-soft">
              A run needs a role for every seat a step uses. Saving the flow is still
              safe; running it is what the gap blocks.
            </p>
          ) : ambiguous.length > 0 ? (
            <p className="mt-1.5 text-meta leading-[1.45] text-amber-soft">
              Two roles can take the same seat, so a run cannot pick one on its own.
            </p>
          ) : null}
        </div>
      </div>

      <AssistCurrencyReport currency={draft.currency} className="mt-4" />

      <YamlBlock
        yaml={draft.yaml}
        title="Exactly what saving this writes"
        path={draft.targetPath}
        className="mt-4"
      />

      {draft.exists ? (
        <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-[12px] border border-amber-soft/25 bg-amber-soft/10 px-3 py-2.5">
          <input
            type="checkbox"
            checked={overwrite}
            onChange={(e) => onOverwriteChange(e.target.checked)}
            className="mt-0.5 shrink-0 accent-violet-500"
          />
          <span className="text-[12px] leading-[1.45] text-amber-soft">
            A project flow already lives at {draft.targetPath}. Saving replaces it.
          </span>
        </label>
      ) : null}

      {createError ? (
        <ErrorView
          compact
          className="mt-3"
          err={createError}
          override={{ title: "The flow was not saved" }}
        />
      ) : null}

      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          disabled={creating || blocked}
          onClick={onAccept}
        >
          {creating ? "Saving…" : draft.exists ? "Replace the flow" : "Save this flow"}
        </Button>
        <Button variant="ghost" size="sm" disabled={creating} onClick={onDiscard}>
          Discard
        </Button>
        <span className="text-meta text-chalk-300">
          Saving validates it again and refuses anything secret-shaped.
        </span>
      </div>
    </div>
  );
}

/**
 * The currency report, shared by the flow and crew draft panels so the two can
 * never present the same trust signal differently. Both lists render even when
 * empty - the whole point is that the owner sees what the agent claims it could
 * not check, and an absent section reads as "nothing to worry about" when it
 * actually means "the model said nothing".
 *
 * Promote to components/design/ if a third surface needs it.
 */
export function AssistCurrencyReport({
  currency,
  className,
}: {
  currency: AssistCurrency;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <CurrencyList
          title="Could not verify"
          tone="amber"
          items={currency.unverified}
          empty="The draft claims nothing needed checking."
        />
        <CurrencyList
          title="Checked against a source"
          tone="emerald"
          items={currency.checked}
          empty="The draft claims it checked nothing."
        />
      </div>
      <p className="mt-1.5 max-w-[80ch] text-meta leading-[1.45] text-chalk-300">
        Vibestrate makes no network call. Both lists are the agent&apos;s own report
        from inside its provider CLI, and nothing here verifies them.
      </p>
    </div>
  );
}

function CurrencyList({
  title,
  tone,
  items,
  empty,
}: {
  title: string;
  tone: "amber" | "emerald";
  items: string[];
  empty: string;
}) {
  const accent = tone === "amber" ? "text-amber-soft" : "text-emerald-400";
  const frame =
    tone === "amber"
      ? "border-amber-soft/25 bg-amber-soft/[0.07]"
      : "border-[color:var(--line-soft)] bg-coal-600";
  return (
    <div className={cn("rounded-[12px] border px-3 py-2.5", frame)}>
      <div className={cn("flex items-baseline gap-2 text-[12px] font-semibold", accent)}>
        {title}
        <span className="num-tabular text-meta font-medium text-chalk-300">
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="mt-1 text-meta leading-[1.45] text-chalk-300">{empty}</p>
      ) : (
        <ul className="mt-1.5 space-y-1">
          {items.map((it, i) => (
            <li key={i} className="text-[12px] leading-[1.45] text-chalk-100">
              {it}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The draft's canonical YAML with a copy action. Exported so the crew panel
 *  renders its `crews.<id>` block identically. */
export function YamlBlock({
  yaml,
  title,
  path,
  className,
}: {
  yaml: string;
  title: string;
  /** Where this YAML belongs, when there is a concrete destination. */
  path?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={className}>
      <div className="mb-1.5 flex flex-wrap items-baseline gap-2">
        <span className="text-[12px] font-semibold text-violet-vivid">{title}</span>
        {path ? <span className="mono text-meta text-chalk-300">{path}</span> : null}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          iconLeft={
            copied ? (
              <Check className="h-3 w-3 text-emerald-400" strokeWidth={2} aria-hidden />
            ) : (
              <Copy className="h-3 w-3" strokeWidth={1.9} aria-hidden />
            )
          }
          onClick={() => {
            void (async () => {
              try {
                await navigator.clipboard.writeText(yaml);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1200);
              } catch {
                // A blocked or absent clipboard (non-secure context) leaves the
                // label alone. The YAML is on screen and selectable, so there is
                // nothing to recover from and nothing to report.
              }
            })();
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="mono max-h-[320px] overflow-auto rounded-[12px] border border-[color:var(--line-strong)] bg-coal-800 px-3 py-2.5 text-meta leading-[1.55] text-chalk-100">
        {yaml}
      </pre>
    </div>
  );
}

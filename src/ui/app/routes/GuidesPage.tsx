import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Flag,
  GitFork,
  Library,
  PenLine,
  Trash2,
} from "lucide-react";
import { api } from "../../lib/api.js";
import type {
  DiscoveredGuide,
  GuideStepDefinition,
} from "../../lib/types.js";
import { Button } from "../../components/design/Button.js";
import { Chip, type ChipTone } from "../../components/design/Chip.js";
import { cn } from "../../components/design/cn.js";

type Props = {
  /** Open a guide in the Flow Builder (customize slots/steps, then run). */
  onOpenInFlow: (guideId: string) => void;
};

type Toast = { kind: "ok" | "err"; text: string } | null;
type Busy = { id: string; action: "fork" | "delete" } | null;

/**
 * Guides — the dashboard catalog of run recipes, independent of the Flow
 * Builder. Discover builtin + project guides, inspect each one's flow (slots,
 * ordered steps, approval gates), fork a builtin into the project to customize
 * it, or delete a project guide. All over the audited `/api/guides` routes —
 * the browser never shells out. Groundwork for the Guides Hub (#3).
 */
export function GuidesPage({ onOpenInFlow }: Props) {
  const [guides, setGuides] = useState<DiscoveredGuide[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [toast, setToast] = useState<Toast>(null);

  async function load() {
    try {
      const r = await api.listGuides();
      setGuides(r.guides);
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

  async function fork(guideId: string) {
    setBusy({ id: guideId, action: "fork" });
    try {
      const r = await api.forkGuideToProject(guideId);
      await load();
      setExpanded(r.guideId);
      flash({
        kind: "ok",
        text: r.alreadyForked
          ? `${guideId} is already a project guide.`
          : `Forked ${guideId} into .amaco/guides/ — customize it in the Flow Builder.`,
      });
    } catch (err) {
      flash({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  async function remove(guideId: string) {
    if (!window.confirm(`Delete the project guide "${guideId}"? This removes .amaco/guides/${guideId}/.`)) {
      return;
    }
    setBusy({ id: guideId, action: "delete" });
    try {
      await api.deleteGuide(guideId);
      await load();
      flash({ kind: "ok", text: `Deleted project guide ${guideId}.` });
    } catch (err) {
      flash({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  const projectCount = guides?.filter((g) => g.source.kind === "project").length ?? 0;

  return (
    <div className="relative z-10 mx-auto max-w-[1100px] px-8 pt-6 pb-16 fade-up">
      <section className="mt-1">
        <div className="eyebrow mb-1.5">Guides · run recipes your crew follows</div>
        <h1 className="text-display text-[21px] sm:text-[23px] leading-[1.2]">
          {guides ? guides.length : "—"} guides
          <span className="text-fog-400">
            {guides ? ` · ${projectCount} editable in this project` : ""}
          </span>
        </h1>
        <p className="text-fog-300 text-[13px] mt-1.5 max-w-[70ch]">
          A guide is a declarative plan — slots + ordered steps with approval
          gates — that your agents follow on a run. Fork a builtin to customize
          it, then open it in the Flow Builder or run it with{" "}
          <code className="text-violet-soft">amaco run "task" --guide &lt;id&gt;</code>.
        </p>
      </section>

      {error ? (
        <div className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/5 px-3 py-2 text-[12.5px] text-rose-300">
          {error}
        </div>
      ) : null}

      <section className="mt-7 space-y-3">
        {!guides ? (
          <div className="text-fog-400 text-[13px]">Loading guides…</div>
        ) : guides.length === 0 ? (
          <div className="text-fog-400 text-[13px]">No guides discovered.</div>
        ) : (
          guides.map((g) => (
            <GuideCard
              key={g.id}
              guide={g}
              expanded={expanded === g.id}
              busy={busy?.id === g.id ? busy.action : null}
              onToggle={() => setExpanded((cur) => (cur === g.id ? null : g.id))}
              onOpenInFlow={() => onOpenInFlow(g.id)}
              onFork={() => void fork(g.id)}
              onDelete={() => void remove(g.id)}
            />
          ))
        )}
      </section>

      <p className="mt-8 text-[12px] text-fog-500">
        Sharing and installing community guides is on the roadmap (Guides Hub).
        For now, guides live in <code className="text-fog-300">.amaco/guides/</code>{" "}
        and ship built-in.
      </p>

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

function GuideCard({
  guide: g,
  expanded,
  busy,
  onToggle,
  onOpenInFlow,
  onFork,
  onDelete,
}: {
  guide: DiscoveredGuide;
  expanded: boolean;
  busy: "fork" | "delete" | null;
  onToggle: () => void;
  onOpenInFlow: () => void;
  onFork: () => void;
  onDelete: () => void;
}) {
  const isProject = g.source.kind === "project";
  const steps = g.definition.steps;
  const slots = Object.entries(g.definition.slots);
  const gateCount = steps.filter(
    (s) => s.kind === "approval-gate" || s.approval,
  ).length;

  return (
    <div className="rounded-xl border border-white/10 surface-ink-100-55">
      <div className="flex items-start justify-between gap-4 px-4 py-3.5">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 items-start gap-2.5 text-left"
        >
          {expanded ? (
            <ChevronDown size={15} className="mt-0.5 shrink-0 text-fog-400" />
          ) : (
            <ChevronRight size={15} className="mt-0.5 shrink-0 text-fog-400" />
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Library size={14} className="text-violet-soft shrink-0" />
              <span className="text-[15px] font-medium text-fog-100">{g.label}</span>
              <span className="mono text-[11px] text-fog-500">{g.id}</span>
              <Chip tone={isProject ? "violet" : "neutral"}>
                {isProject ? "project" : g.source.kind}
              </Chip>
              <span className="mono text-[10.5px] text-fog-500">v{g.version}</span>
            </div>
            <p className="mt-1 text-[12.5px] leading-snug text-fog-400 max-w-[75ch]">
              {g.description}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-fog-500">
              <span>{steps.length} steps</span>
              <span>·</span>
              <span>{slots.length} slots</span>
              {gateCount > 0 ? (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1 text-amber-300/90">
                    <Flag size={11} />
                    {gateCount} approval {gateCount === 1 ? "gate" : "gates"}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-2">
          {!isProject ? (
            <Button
              variant="primary"
              size="sm"
              iconLeft={<GitFork size={13} />}
              disabled={busy !== null}
              onClick={onFork}
            >
              {busy === "fork" ? "Forking…" : "Fork to project"}
            </Button>
          ) : null}
          <Button
            variant={isProject ? "primary" : "outline"}
            size="sm"
            iconLeft={<PenLine size={13} />}
            onClick={onOpenInFlow}
          >
            Flow Builder
          </Button>
          {isProject ? (
            <Button
              variant="outline"
              size="sm"
              iconLeft={<Trash2 size={13} />}
              disabled={busy !== null}
              onClick={onDelete}
            >
              {busy === "delete" ? "Deleting…" : "Delete"}
            </Button>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <div className="border-t border-white/10 px-4 py-3.5">
          {slots.length > 0 ? (
            <div className="mb-3">
              <div className="eyebrow mb-1.5">Slots</div>
              <div className="flex flex-wrap gap-1.5">
                {slots.map(([id, slot]) => (
                  <span
                    key={id}
                    className="rounded-md border border-white/10 bg-ink-200/50 px-2 py-1 text-[11.5px] text-fog-300"
                    title={slot.description ?? undefined}
                  >
                    <span className="text-fog-100">{slot.label}</span>{" "}
                    <span className="text-fog-500">→ {slot.defaultAgent}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="eyebrow mb-1.5">Flow</div>
          <ol className="space-y-1.5">
            {steps.map((step, i) => (
              <StepRow key={step.id} index={i + 1} step={step} />
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

function StepRow({ index, step }: { index: number; step: GuideStepDefinition }) {
  const kind = stepKindChip(step.kind);
  const target = step.slot ?? step.agentId ?? null;
  const hasApproval = step.kind === "approval-gate" || !!step.approval;
  return (
    <li className="flex items-center gap-2.5 rounded-md border border-white/[0.06] bg-ink-200/30 px-2.5 py-1.5">
      <span className="mono w-5 shrink-0 text-right text-[11px] text-fog-600">{index}</span>
      <Chip tone={kind.tone}>{kind.label}</Chip>
      <span className="min-w-0 truncate text-[12.5px] text-fog-200">{step.label}</span>
      {target ? (
        <span className="mono text-[10.5px] text-fog-500">{target}</span>
      ) : null}
      {step.optional ? (
        <span className="rounded border border-white/10 px-1 text-[10px] text-fog-500">optional</span>
      ) : null}
      {step.repeat ? (
        <span className="rounded border border-white/10 px-1 text-[10px] text-fog-500">×{step.repeat.times}</span>
      ) : null}
      {hasApproval ? (
        <span
          className="ml-auto inline-flex items-center gap-1 text-[10.5px] text-amber-300/90"
          title={step.approval?.reason ?? "Human approval gate"}
        >
          <Flag size={11} />
          {step.approval?.riskLevel ? `${step.approval.riskLevel} risk` : "approval"}
        </span>
      ) : null}
    </li>
  );
}

function stepKindChip(kind: GuideStepDefinition["kind"]): {
  label: string;
  tone: ChipTone;
} {
  switch (kind) {
    case "agent-turn":
      return { label: "agent", tone: "neutral" };
    case "review-turn":
      return { label: "review", tone: "sky" };
    case "response-turn":
      return { label: "response", tone: "neutral" };
    case "validation":
      return { label: "validation", tone: "emerald" };
    case "approval-gate":
      return { label: "approval", tone: "amber" };
    case "summary-turn":
      return { label: "summary", tone: "neutral" };
  }
}

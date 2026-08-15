import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  X,
  HelpCircle,
  PenLine,
  Crosshair,
  UsersRound,
  Database,
  Shield,
  Trophy,
  Plug,
  Shapes,
} from "lucide-react";
import { api } from "../../lib/api.js";
import type { SpecUpQuestion, SpecUpQuestionCategory } from "../../lib/types.js";
import { usePublishViewContext } from "../../lib/view-context.js";
import { Button } from "../design/Button.js";
import { SegmentedControl } from "../design/SegmentedControl.js";
import { Chip } from "../design/Chip.js";
import { StatTile } from "../design/StatTile.js";
import { cn } from "../design/cn.js";

// ── In-run gap-questions screen (Spec-up) - modern, card-based, layered ────────
// Bold left menu of areas (the current one highlighted); the current area's
// questions are contained cards on a layered surface (ground -> card -> well).
// One area at a time, jumpable, Submit + Proceed always reachable. Suggest is
// ADVISORY (recommends, never pre-selects) - a suggestion only ever shows in
// its own row with Use/Dismiss, never pre-fills the answer.

// Intent-tinted ghost recipe (primitives-contract §4, verbatim from
// RunActions.tsx:61-62) - the violet accent action a plain `design/Button`
// can't express, since Button's variants carry no per-intent tint.
const INTENT_BTN =
  "inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[12.5px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

const CATEGORY_ORDER: SpecUpQuestionCategory[] = [
  "scope",
  "users",
  "data",
  "constraints",
  "success",
  "integrations",
  "other",
];
const CATEGORY_LABEL: Record<SpecUpQuestionCategory, string> = {
  scope: "Scope",
  users: "Users",
  data: "Data",
  constraints: "Constraints",
  success: "Success",
  integrations: "Integrations",
  other: "Other",
};
const CATEGORY_BLURB: Record<SpecUpQuestionCategory, string> = {
  scope: "What's in, what's out, how big.",
  users: "Who uses it and how they get in.",
  data: "What you store and where it comes from.",
  constraints: "Limits, deadlines, and must-nots.",
  success: "What makes a launch a success.",
  integrations: "Payments, sync, third-party services.",
  other: "Everything else worth deciding.",
};
const CATEGORY_ICON: Record<SpecUpQuestionCategory, LucideIcon> = {
  scope: Crosshair,
  users: UsersRound,
  data: Database,
  constraints: Shield,
  success: Trophy,
  integrations: Plug,
  other: Shapes,
};

type SimplifyState = { loading: boolean; text?: string; affects?: string; analogy?: string };
type Suggestion = { value: string; why: string };

export function RunGapQuestions({
  runId,
  questions,
  round,
  coverageComplete,
  onSubmitted,
}: {
  runId: string;
  questions: SpecUpQuestion[];
  round: number;
  coverageComplete: boolean;
  onSubmitted: (nextRunId: string) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion>>({});
  const [simplify, setSimplify] = useState<Record<string, SimplifyState>>({});
  const [busy, setBusy] = useState(false);
  const [suggestingAll, setSuggestingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byCategory = useMemo(() => {
    const groups = new Map<SpecUpQuestionCategory, SpecUpQuestion[]>();
    for (const q of questions) {
      const cat = (q.category ?? "other") as SpecUpQuestionCategory;
      (groups.get(cat) ?? groups.set(cat, []).get(cat)!).push(q);
    }
    return CATEGORY_ORDER.filter((c) => groups.has(c)).map((c) => ({ category: c, items: groups.get(c)! }));
  }, [questions]);

  const answeredOf = (items: SpecUpQuestion[]) => items.filter((q) => (answers[q.id] ?? "").trim().length > 0).length;
  const answeredCount = questions.filter((q) => (answers[q.id] ?? "").trim().length > 0).length;
  const coveredAreas = byCategory.filter((g) => answeredOf(g.items) === g.items.length).length;

  const [active, setActive] = useState<SpecUpQuestionCategory | null>(null);
  const activeCat = active ?? byCategory[0]?.category ?? null;
  const activeIdx = byCategory.findIndex((g) => g.category === activeCat);
  const activeGroup = byCategory[activeIdx];

  usePublishViewContext({
    screen: "Spec-up questions",
    details:
      `Round ${round}. Current area: ${activeCat ? CATEGORY_LABEL[activeCat] : "-"}.\n` +
      questions.map((q) => `- [${q.category}] ${q.id}: "${q.question}" -> ${(answers[q.id] ?? "").trim() || "(blank)"}`).join("\n"),
  });

  function setAnswer(id: string, value: string) {
    setAnswers((a) => ({ ...a, [id]: value }));
    setSuggestions((s) => {
      if (!s[id]) return s;
      const next = { ...s };
      delete next[id];
      return next;
    });
    setError(null);
  }
  function clearAnswer(id: string) {
    setAnswers((a) => {
      const next = { ...a };
      delete next[id];
      return next;
    });
  }
  function dropSuggestion(id: string) {
    setSuggestions((s) => {
      const next = { ...s };
      delete next[id];
      return next;
    });
  }

  async function doSimplify(id: string, forNonDeveloper: boolean) {
    setSimplify((s) => ({ ...s, [id]: { ...(s[id] ?? {}), loading: true } }));
    try {
      const r = await api.specUpAssist({ sourceRunId: runId, mode: "simplify", questionId: id, forNonDeveloper });
      setSimplify((s) => ({ ...s, [id]: { loading: false, text: r.text, affects: r.affects, analogy: r.analogy } }));
    } catch (err) {
      setSimplify((s) => ({ ...s, [id]: { loading: false, text: `Could not simplify: ${err instanceof Error ? err.message : String(err)}` } }));
    }
  }
  async function doSuggest(id: string) {
    try {
      const r = await api.specUpAssist({ sourceRunId: runId, mode: "suggest", questionId: id });
      if (r.suggestedValue) setSuggestions((s) => ({ ...s, [id]: { value: r.suggestedValue!, why: r.why ?? "" } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }
  async function doSuggestAll() {
    const blanks = (activeGroup?.items ?? []).filter((q) => (answers[q.id] ?? "").trim().length === 0).map((q) => q.id);
    if (blanks.length === 0) return;
    setSuggestingAll(true);
    setError(null);
    try {
      const r = await api.specUpAssist({ sourceRunId: runId, mode: "suggest-all", questionIds: blanks });
      const next: Record<string, Suggestion> = {};
      for (const it of r.items ?? []) next[it.questionId] = { value: it.suggestedValue, why: it.why };
      setSuggestions((s) => ({ ...s, ...next }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSuggestingAll(false);
    }
  }

  async function submit(proceed: boolean) {
    const payload = questions.map((q) => ({ id: q.id, answer: (answers[q.id] ?? "").trim() })).filter((a) => a.answer.length > 0);
    if (payload.length === 0) {
      if (proceed) return finalizeNoAnswers();
      setError("Answer at least one question, or use a suggestion.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { runId: nextRunId } = await api.submitSpecUpAnswers({ sourceRunId: runId, answers: payload, proceed });
      onSubmitted(nextRunId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }
  async function finalizeNoAnswers() {
    setBusy(true);
    setError(null);
    try {
      const { runId: nextRunId } = await api.proceedSpecUp(runId);
      onSubmitted(nextRunId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  if (questions.length === 0 && coverageComplete) {
    return (
      <section className="rounded-[18px] bg-coal-800 p-5 text-chalk-100">
        <h2 className="mb-2 text-[16px] font-bold">Coverage complete</h2>
        <p className="mb-5 text-[13.5px] leading-relaxed text-chalk-300">
          The CTO has what it needs from your answers (round {round}). Build the spec, architecture, and risks.
        </p>
        {error ? (
          <div className="mb-4 w-full rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-meta text-rose-300">
            {error}
          </div>
        ) : null}
        <Button
          variant="primary"
          size="lg"
          disabled={busy}
          onClick={() => void finalizeNoAnswers()}
          iconRight={<ArrowRight className="h-4 w-4" strokeWidth={1.9} />}
          className="w-full"
        >
          {busy ? "Building..." : "Build the spec"}
        </Button>
      </section>
    );
  }

  const single = byCategory.length <= 1;

  const menu = (
    <div className="flex flex-col gap-0.5">
      {byCategory.map((g) => {
        const ans = answeredOf(g.items);
        const done = ans === g.items.length;
        const current = g.category === activeCat;
        return (
          <Button
            key={g.category}
            variant={current ? "secondary" : "ghost"}
            size="md"
            className="w-full"
            onClick={() => setActive(g.category)}
          >
            <span className="flex w-full items-center gap-2.5">
              <span
                className={cn(
                  "flex w-4 shrink-0 justify-center",
                  done ? "text-violet-vivid" : current ? "text-violet-soft" : "text-chalk-300",
                )}
              >
                {done ? (
                  <Check className="h-[15px] w-[15px]" strokeWidth={1.9} />
                ) : (
                  <span className={cn("h-1.5 w-1.5 rounded-full", current ? "bg-violet-soft" : "bg-chalk-400")} />
                )}
              </span>
              <span
                className={cn(
                  "flex-1 text-left text-[13px]",
                  current ? "font-semibold text-chalk-100" : "font-medium text-chalk-300",
                )}
              >
                {CATEGORY_LABEL[g.category]}
              </span>
              <span
                className={cn(
                  "font-mono text-meta",
                  done || current ? "text-violet-vivid" : "text-chalk-300",
                )}
              >
                {ans}/{g.items.length}
              </span>
            </span>
          </Button>
        );
      })}
    </div>
  );

  const ActiveIcon = activeGroup ? CATEGORY_ICON[activeGroup.category] : Shapes;
  const content = activeGroup ? (
    <div>
      <div className="mb-3.5 flex items-center gap-3 border-b border-[color:var(--line-soft)] pb-3.5">
        <ActiveIcon className="h-6 w-6 shrink-0 text-violet-vivid" strokeWidth={1.9} />
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-bold leading-tight tracking-[-0.01em] text-chalk-100">
            {CATEGORY_LABEL[activeGroup.category]}
          </div>
          <div className="mt-0.5 text-[13px] text-chalk-300">{CATEGORY_BLURB[activeGroup.category]}</div>
        </div>
        <StatTile
          value={`${answeredOf(activeGroup.items)}/${activeGroup.items.length}`}
          label="answered"
          tone="violet"
        />
      </div>

      <div className="flex flex-col">
        {activeGroup.items.map((q, i) => (
          <div key={q.id}>
            {i > 0 ? <div className="my-2 h-px bg-[color:var(--line)]" /> : null}
            <QuestionCard
              q={q}
              value={answers[q.id] ?? ""}
              suggestion={suggestions[q.id]}
              simplify={simplify[q.id]}
              onAnswer={(v) => setAnswer(q.id, v)}
              onClear={() => clearAnswer(q.id)}
              onSimplify={(nd) => void doSimplify(q.id, nd)}
              onSuggest={() => void doSuggest(q.id)}
              onUseSuggestion={() => suggestions[q.id] && setAnswer(q.id, suggestions[q.id]!.value)}
              onDismissSuggestion={() => dropSuggestion(q.id)}
            />
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between">
        {activeIdx > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActive(byCategory[activeIdx - 1]!.category)}
            iconLeft={<ArrowLeft className="h-4 w-4" strokeWidth={1.9} />}
          >
            {CATEGORY_LABEL[byCategory[activeIdx - 1]!.category]}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            disabled={suggestingAll}
            onClick={() => void doSuggestAll()}
            iconLeft={<PenLine className="h-3.5 w-3.5" strokeWidth={1.9} />}
          >
            {suggestingAll ? "Drafting..." : "Suggest all here"}
          </Button>
          {activeIdx < byCategory.length - 1 ? (
            <Button
              variant="primary"
              size="md"
              onClick={() => setActive(byCategory[activeIdx + 1]!.category)}
              iconRight={<ArrowRight className="h-4 w-4" strokeWidth={1.9} />}
            >
              {CATEGORY_LABEL[byCategory[activeIdx + 1]!.category]}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  ) : null;

  const footer = (
    <div className="mt-5 flex items-center gap-4 border-t border-[color:var(--line-soft)] pt-4">
      <span className="flex-1 text-[13px] leading-relaxed text-chalk-300">
        Answer what you can - we ask follow-ups only where it's still open.
      </span>
      {error ? <span className="text-[13px] text-amber-soft">{error}</span> : null}
      <Button variant="secondary" size="md" disabled={busy} onClick={() => void submit(true)}>
        Proceed to spec
      </Button>
      <Button
        variant="primary"
        size="md"
        disabled={busy || answeredCount === 0}
        onClick={() => void submit(false)}
        iconRight={<ArrowRight className="h-4 w-4" strokeWidth={1.9} />}
      >
        {busy ? "Working..." : "Submit answers"}
      </Button>
    </div>
  );

  return (
    <section className="rounded-[18px] bg-coal-800 p-5 text-chalk-100">
      {single ? (
        <div>
          <div className="mb-1 text-[16px] font-bold">Scope the work</div>
          <div className="mb-3.5 text-[13px] text-chalk-300">Round {round}. Answer what you can.</div>
          <div className="rounded-[14px] bg-coal-700 p-4">
            {content}
            {footer}
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between">
            <div className="text-[16px] font-bold">Scope the work</div>
            <div className="flex items-center gap-3">
              <div className="flex flex-wrap items-stretch gap-1.5">
                <StatTile value={round} label="round" />
                <StatTile
                  value={`${coveredAreas}/${byCategory.length}`}
                  label="areas"
                  tone={coveredAreas === byCategory.length ? "emerald" : "default"}
                />
              </div>
              <div className="flex gap-1">
                {byCategory.map((g) => {
                  const done = answeredOf(g.items) === g.items.length;
                  const cur = g.category === activeCat;
                  return (
                    <div
                      key={g.category}
                      className={cn(
                        "h-[5px] w-[22px] rounded-full",
                        done ? "bg-violet-soft" : cur ? "bg-violet-vivid" : "bg-[color:var(--line-strong)]",
                      )}
                    />
                  );
                })}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 min-[861px]:grid-cols-[196px_1fr]">
            <aside className="self-start">{menu}</aside>
            <div className="rounded-[14px] bg-coal-700 p-4">
              {content}
              {footer}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function QuestionCard({
  q,
  value,
  suggestion,
  simplify,
  onAnswer,
  onClear,
  onSimplify,
  onSuggest,
  onUseSuggestion,
  onDismissSuggestion,
}: {
  q: SpecUpQuestion;
  value: string;
  suggestion?: Suggestion;
  simplify?: SimplifyState;
  onAnswer: (v: string) => void;
  onClear: () => void;
  onSimplify: (nonDev: boolean) => void;
  onSuggest: () => void;
  onUseSuggestion: () => void;
  onDismissSuggestion: () => void;
}) {
  const answered = value.trim().length > 0;
  const isChoice = q.kind === "choice" && q.options.length > 0;
  return (
    <div className={cn("rounded-[11px] p-4", answered ? "bg-coal-500" : "bg-transparent")}>
      <div className="mb-4 flex items-start justify-between gap-3.5">
        <span className="text-[14px] font-semibold leading-snug text-chalk-100">{q.question}</span>
        {answered ? (
          <Chip tone="violet" className="shrink-0 pt-1">
            <Check className="h-3.5 w-3.5" strokeWidth={1.9} />
            answered
          </Chip>
        ) : (
          <div className="flex shrink-0 gap-3.5 whitespace-nowrap pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSimplify(false)}
              iconLeft={<HelpCircle className="h-3.5 w-3.5" strokeWidth={1.9} />}
            >
              Simplify
            </Button>
            {/* Violet accent marks this as the AI-assist action - Button has no
                per-intent tint, so this stays the documented intent-tinted
                ghost recipe instead of `design/Button` (primitives-contract §4). */}
            <button
              type="button"
              onClick={() => onSuggest()}
              className={cn(INTENT_BTN, "text-violet-soft hover:bg-violet-soft/10")}
            >
              <PenLine className="h-3.5 w-3.5" strokeWidth={1.9} />
              Suggest
            </button>
          </div>
        )}
      </div>

      {isChoice ? (
        <div className="flex flex-wrap items-center gap-2.5">
          <SegmentedControl
            options={q.options.map((opt) => ({ value: opt, label: opt }))}
            value={value}
            onChange={onAnswer}
            className="flex-wrap"
          />
          {answered ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              iconLeft={<X className="h-3.5 w-3.5" strokeWidth={1.9} />}
            >
              clear
            </Button>
          ) : null}
        </div>
      ) : (
        <input
          value={value}
          onChange={(e) => onAnswer(e.target.value)}
          placeholder="Type your answer"
          className="w-full rounded-[14px] border border-[color:var(--line-strong)] bg-coal-800 px-3 py-2.5 text-[13px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none"
        />
      )}

      {!answered && suggestion ? (
        <div className="mt-3.5 flex items-center gap-3 rounded-[10px] bg-coal-800 px-3.5 py-3">
          <PenLine className="h-4 w-4 shrink-0 text-violet-vivid" strokeWidth={1.9} />
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] text-chalk-100">
              <Chip tone="violet">Suggested</Chip> {suggestion.value}
            </div>
            {suggestion.why ? <div className="mt-0.5 text-[12.5px] text-chalk-300">{suggestion.why}</div> : null}
          </div>
          <Button variant="primary" size="sm" onClick={onUseSuggestion}>
            Use
          </Button>
          <Button variant="ghost" size="sm" onClick={onDismissSuggestion}>
            Dismiss
          </Button>
        </div>
      ) : null}

      {simplify ? (
        <div className="mt-3.5 rounded-[10px] bg-coal-800 px-3.5 py-3.5 text-[13px] leading-relaxed text-chalk-100">
          {simplify.loading ? (
            <span className="text-chalk-300">Explaining...</span>
          ) : (
            <>
              <div>{simplify.text}</div>
              {simplify.affects ? (
                <div className="mt-2 text-chalk-300">
                  <b className="font-semibold">What it affects:</b> {simplify.affects}
                </div>
              ) : null}
              {simplify.analogy ? (
                <div className="mt-2 text-chalk-300">
                  <b className="font-semibold">Analogy:</b> {simplify.analogy}
                </div>
              ) : null}
              {!simplify.analogy ? (
                <button
                  type="button"
                  onClick={() => onSimplify(true)}
                  className={cn(INTENT_BTN, "mt-2.5 text-violet-soft hover:bg-violet-soft/10")}
                >
                  Explain for a non-developer
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <div className="mt-3.5 flex gap-2.5 border-t border-[color:var(--line-soft)] pt-3 text-[13px] leading-relaxed">
          <span className="shrink-0 text-[12px] font-semibold text-violet-soft">Why it matters</span>
          <span className="text-chalk-300">{q.why}</span>
        </div>
      )}
    </div>
  );
}

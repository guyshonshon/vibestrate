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
import type { ShapeQuestion, ShapeQuestionCategory } from "../../lib/types.js";
import { usePublishViewContext } from "../../lib/view-context.js";

// ── In-run gap-questions screen (Shape) - C2 vertical-timeline stepper ───────
// A left timeline lists every area with status + count; the current area is a
// focused, tinted workspace on the right. One area at a time, steps jumpable,
// Submit + Proceed always reachable, single-area rounds collapse to one screen.
// Suggest is ADVISORY (recommends, never pre-selects). Colour carries hierarchy:
// violet = current/action, teal = answered/covered, neutral = pending.

const CATEGORY_ORDER: ShapeQuestionCategory[] = [
  "scope",
  "users",
  "data",
  "constraints",
  "success",
  "integrations",
  "other",
];

const CATEGORY_LABEL: Record<ShapeQuestionCategory, string> = {
  scope: "Scope",
  users: "Users",
  data: "Data",
  constraints: "Constraints",
  success: "Success criteria",
  integrations: "Integrations",
  other: "Other",
};

const CATEGORY_BLURB: Record<ShapeQuestionCategory, string> = {
  scope: "What's in, what's out, how big.",
  users: "Who uses it and how they get in.",
  data: "What you store and where it comes from.",
  constraints: "Limits, deadlines, and must-nots.",
  success: "What makes a launch a success.",
  integrations: "Payments, sync, third-party services.",
  other: "Everything else worth deciding.",
};

const CATEGORY_ICON: Record<ShapeQuestionCategory, LucideIcon> = {
  scope: Crosshair,
  users: UsersRound,
  data: Database,
  constraints: Shield,
  success: Trophy,
  integrations: Plug,
  other: Shapes,
};

const ACCENT = "var(--s-accent-bright)";
// Explicit rgba tints (NOT color-mix - it silently fails to render in some
// browsers, which made the panel look unstyled). Violet = the brand accent,
// teal = answered/done.
const RGB: Record<string, string> = {
  "var(--s-accent-bright)": "139, 124, 255",
  "var(--s-ok-ink)": "94, 234, 212",
  "var(--s-ink-faint)": "138, 144, 162",
};
const tint = (c: string, pct: number) => `rgba(${RGB[c] ?? "138, 144, 162"}, ${(pct / 100).toFixed(3)})`;

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
  questions: ShapeQuestion[];
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
    const groups = new Map<ShapeQuestionCategory, ShapeQuestion[]>();
    for (const q of questions) {
      const cat = (q.category ?? "other") as ShapeQuestionCategory;
      (groups.get(cat) ?? groups.set(cat, []).get(cat)!).push(q);
    }
    return CATEGORY_ORDER.filter((c) => groups.has(c)).map((c) => ({ category: c, items: groups.get(c)! }));
  }, [questions]);

  const answeredOf = (items: ShapeQuestion[]) => items.filter((q) => (answers[q.id] ?? "").trim().length > 0).length;
  const answeredCount = questions.filter((q) => (answers[q.id] ?? "").trim().length > 0).length;
  const coveredAreas = byCategory.filter((g) => answeredOf(g.items) === g.items.length).length;

  // The current step is explicit - it only changes on navigation, so answering
  // never auto-jumps and you always see the answer you just gave.
  const [active, setActive] = useState<ShapeQuestionCategory | null>(null);
  const activeCat = active ?? byCategory[0]?.category ?? null;
  const activeIdx = byCategory.findIndex((g) => g.category === activeCat);
  const activeGroup = byCategory[activeIdx];

  usePublishViewContext({
    screen: "Shape questions",
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
      const r = await api.shapeAssist({ sourceRunId: runId, mode: "simplify", questionId: id, forNonDeveloper });
      setSimplify((s) => ({ ...s, [id]: { loading: false, text: r.text, affects: r.affects, analogy: r.analogy } }));
    } catch (err) {
      setSimplify((s) => ({ ...s, [id]: { loading: false, text: `Could not simplify: ${err instanceof Error ? err.message : String(err)}` } }));
    }
  }
  async function doSuggest(id: string) {
    try {
      const r = await api.shapeAssist({ sourceRunId: runId, mode: "suggest", questionId: id });
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
      const r = await api.shapeAssist({ sourceRunId: runId, mode: "suggest-all", questionIds: blanks });
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
      const { runId: nextRunId } = await api.submitShapeAnswers({ sourceRunId: runId, answers: payload, proceed });
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
      const { runId: nextRunId } = await api.proceedShape(runId);
      onSubmitted(nextRunId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  if (questions.length === 0 && coverageComplete) {
    return (
      <section style={panel}>
        <h2 style={{ fontSize: 17, fontWeight: 500, margin: "0 0 6px" }}>Coverage complete</h2>
        <p style={{ fontSize: 13, color: "var(--s-ink-dim)", lineHeight: 1.5, margin: "0 0 16px" }}>
          The CTO has what it needs from your answers (round {round}). Build the spec, architecture, and risks.
        </p>
        {error ? <div style={errorLine}>{error}</div> : null}
        <button onClick={() => void finalizeNoAnswers()} disabled={busy} style={primaryBtn(true)}>
          {busy ? "Building..." : "Build the spec"} <ArrowRight size={15} />
        </button>
      </section>
    );
  }

  const single = byCategory.length <= 1;

  const timeline = (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {byCategory.map((g, i) => {
        const ans = answeredOf(g.items);
        const done = ans === g.items.length;
        const current = g.category === activeCat;
        const Icon = CATEGORY_ICON[g.category];
        return (
          <div key={g.category}>
            <button
              onClick={() => setActive(g.category)}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                width: "100%",
                textAlign: "left",
                cursor: "pointer",
                padding: "6px 8px",
                margin: "0 -8px",
                borderRadius: 7,
                background: current ? tint("var(--s-accent-bright)", 14) : "transparent",
                border: current ? "1px solid " + tint("var(--s-accent-bright)", 55) : "1px solid transparent",
              }}
            >
              <span style={stepNode(done, current)}>{done ? <Check size={11} /> : <Icon size={11} />}</span>
              <span style={{ flex: 1, fontSize: 12.5, color: current ? "var(--s-ink)" : done ? "var(--s-ink-dim)" : "var(--s-ink-dim)", fontWeight: current ? 500 : 400 }}>
                {CATEGORY_LABEL[g.category]}
              </span>
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: done ? "var(--s-ok-ink)" : current ? ACCENT : "var(--s-ink-faint)" }}>
                {ans}/{g.items.length}
              </span>
            </button>
            {i < byCategory.length - 1 ? (
              <div style={{ width: 2, height: 9, borderRadius: 2, background: done ? "var(--s-ok-ink)" : "var(--s-line)", marginLeft: 16 }} />
            ) : null}
          </div>
        );
      })}
    </div>
  );

  const footer = (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--s-line)" }}>
      <span style={{ flex: 1, fontSize: 11.5, color: "var(--s-ink-dim)", lineHeight: 1.5 }}>
        Answer what you can - we ask follow-ups only where it's still open.
      </span>
      {error ? <span style={{ color: "var(--s-warn-ink)", fontSize: 12 }}>{error}</span> : null}
      <button onClick={() => void submit(true)} disabled={busy} style={ghostBtn(false)}>
        Proceed to spec
      </button>
      <button onClick={() => void submit(false)} disabled={busy || answeredCount === 0} style={primaryBtn(answeredCount > 0, true)}>
        {busy ? "Working..." : "Submit answers"} <ArrowRight size={14} />
      </button>
    </div>
  );

  const ActiveIcon = activeGroup ? CATEGORY_ICON[activeGroup.category] : Shapes;
  const content = activeGroup ? (
    <div style={workspace}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <span style={iconChip}>
          <ActiveIcon size={17} style={{ color: ACCENT }} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 500, letterSpacing: "-0.01em", lineHeight: 1.2 }}>{CATEGORY_LABEL[activeGroup.category]}</div>
          <div style={{ fontSize: 12, color: "var(--s-ink-faint)", marginTop: 1 }}>{CATEGORY_BLURB[activeGroup.category]}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: "var(--s-ink-dim)" }}>
            {answeredOf(activeGroup.items)}/{activeGroup.items.length}
          </span>
          <div style={{ display: "flex", gap: 3 }}>
            {activeGroup.items.map((q) => (
              <div key={q.id} style={{ width: 18, height: 5, borderRadius: 3, background: (answers[q.id] ?? "").trim() ? "var(--s-ok-ink)" : tint("var(--s-ink-faint)", 35) }} />
            ))}
          </div>
        </div>
      </div>

      {activeGroup.items.map((q) => (
        <QuestionCard
          key={q.id}
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
      ))}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
        {activeIdx > 0 ? (
          <button onClick={() => setActive(byCategory[activeIdx - 1]!.category)} style={navBtn}>
            <ArrowLeft size={14} /> {CATEGORY_LABEL[byCategory[activeIdx - 1]!.category]}
          </button>
        ) : (
          <span />
        )}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={() => void doSuggestAll()} disabled={suggestingAll} style={ghostInline}>
            <PenLine size={13} /> {suggestingAll ? "Drafting..." : "Suggest all here"}
          </button>
          {activeIdx < byCategory.length - 1 ? (
            <button onClick={() => setActive(byCategory[activeIdx + 1]!.category)} style={primaryBtn(true, true)}>
              {CATEGORY_LABEL[byCategory[activeIdx + 1]!.category]} <ArrowRight size={14} />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <section style={panel}>
      {single ? (
        <div>
          <div style={{ fontSize: 17, fontWeight: 500, marginBottom: 2 }}>Scope the work</div>
          <div style={{ fontSize: 11.5, color: "var(--s-ink-faint)", marginBottom: 14 }}>Round {round}. Answer what you can.</div>
          {content}
          {error ? <div style={{ ...errorLine, marginTop: 12 }}>{error}</div> : null}
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button onClick={() => void submit(false)} disabled={busy || answeredCount === 0} style={primaryBtn(answeredCount > 0)}>
              {busy ? "Working..." : "Submit answers"} <ArrowRight size={14} />
            </button>
            <button onClick={() => void submit(true)} disabled={busy} style={ghostBtn(false)}>
              Proceed to spec
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 15 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--s-ink)" }}>Scope the work</div>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: "var(--s-ink-faint)" }}>round {round}</span>
              <div style={{ display: "flex", gap: 3 }} aria-label={`${coveredAreas} of ${byCategory.length} areas covered`}>
                {byCategory.map((g) => {
                  const done = answeredOf(g.items) === g.items.length;
                  const cur = g.category === activeCat;
                  return <div key={g.category} style={{ width: 14, height: 4, borderRadius: 2, background: done ? "var(--s-ok-ink)" : cur ? "var(--s-accent-bright)" : tint("var(--s-ink-faint)", 30) }} />;
                })}
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 20 }} className="run-gap-grid">
            <aside style={{ alignSelf: "start" }}>{timeline}</aside>
            <div style={{ minWidth: 0 }}>{content}</div>
          </div>
          {footer}
        </>
      )}
      <style>{`@media (max-width: 820px){ .run-gap-grid{ grid-template-columns: 1fr !important; } }`}</style>
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
  q: ShapeQuestion;
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
    <div style={card(answered)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 11 }}>
        <span style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.35 }}>{q.question}</span>
        {answered ? (
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: "var(--s-ok-ink)", display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", paddingTop: 2 }}>
            <Check size={12} /> answered
          </span>
        ) : (
          <div style={{ display: "flex", gap: 9, paddingTop: 2 }}>
            <button onClick={() => onSimplify(false)} style={miniAction}><HelpCircle size={13} /> simplify</button>
            <button onClick={() => onSuggest()} style={{ ...miniAction, color: ACCENT }}><PenLine size={13} /> suggest</button>
          </div>
        )}
      </div>

      {isChoice ? (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
          {q.options.map((opt) => {
            const sel = value === opt;
            const rec = !answered && suggestion?.value === opt;
            return (
              <button key={opt} onClick={() => onAnswer(opt)} style={optionBtn(sel, rec)}>
                {sel ? <Check size={13} /> : null} {opt}
              </button>
            );
          })}
          {answered ? <button onClick={onClear} style={clearBtn}><X size={13} /> clear</button> : null}
        </div>
      ) : (
        <input value={value} onChange={(e) => onAnswer(e.target.value)} placeholder="Type your answer" style={textInput} />
      )}

      {!answered && suggestion ? (
        <div style={adviseRow}>
          <PenLine size={14} style={{ color: ACCENT, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: "var(--s-ink)" }}>
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: ACCENT }}>suggested</span> {suggestion.value}
            </div>
            {suggestion.why ? <div style={{ fontSize: 11, color: "var(--s-ink-faint)", marginTop: 1 }}>{suggestion.why}</div> : null}
          </div>
          <button onClick={onUseSuggestion} style={useBtn}>Use</button>
          <button onClick={onDismissSuggestion} style={{ ...miniAction, color: "var(--s-ink-faint)" }}>dismiss</button>
        </div>
      ) : null}

      {simplify ? (
        <div style={simplifyBox}>
          {simplify.loading ? (
            <span style={{ color: "var(--s-ink-faint)" }}>Explaining...</span>
          ) : (
            <>
              <div>{simplify.text}</div>
              {simplify.affects ? <div style={{ marginTop: 6, color: "var(--s-ink-dim)" }}><b style={{ fontWeight: 500 }}>What it affects:</b> {simplify.affects}</div> : null}
              {simplify.analogy ? <div style={{ marginTop: 6, color: "var(--s-ink-dim)" }}><b style={{ fontWeight: 500 }}>Analogy:</b> {simplify.analogy}</div> : null}
              {!simplify.analogy ? <button onClick={() => onSimplify(true)} style={{ ...miniAction, marginTop: 8, color: ACCENT }}>Explain for a non-developer</button> : null}
            </>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 9, fontSize: 11.5, lineHeight: 1.55, borderTop: "1px solid var(--s-line)", paddingTop: 9, marginTop: 11 }}>
          <span style={{ fontFamily: "ui-monospace, monospace", color: "var(--s-ink-faint)", minWidth: 44 }}>why</span>
          <span style={{ color: "var(--s-ink-dim)" }}>{q.why}</span>
        </div>
      )}
    </div>
  );
}

// ── styles ──
const panel: React.CSSProperties = {
  border: "1px solid var(--s-line)",
  borderRadius: 12,
  background: "var(--s-slab)",
  padding: "16px 18px",
  color: "var(--s-ink)",
};
const workspace: React.CSSProperties = {
  background: "var(--s-soft)",
  border: "1px solid " + tint("var(--s-accent-bright)", 45),
  borderRadius: 11,
  padding: "16px 18px",
};
const iconChip: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 10,
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: tint("var(--s-accent-bright)", 20),
  border: "1px solid " + tint("var(--s-accent-bright)", 55),
};
function card(answered: boolean): React.CSSProperties {
  return {
    background: "var(--s-slab)",
    border: "1px solid " + (answered ? tint("var(--s-ok-ink)", 35) : "var(--s-line)"),
    borderRadius: 9,
    padding: "13px 14px",
    marginBottom: 10,
  };
}
const adviseRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  marginTop: 10,
  background: tint("var(--s-accent-bright)", 12),
  border: "1px solid " + tint("var(--s-accent-bright)", 45),
  borderRadius: 7,
  padding: "8px 10px",
};
const simplifyBox: React.CSSProperties = {
  marginTop: 11,
  padding: "10px 12px",
  borderRadius: 8,
  background: "var(--s-soft)",
  color: "var(--s-soft-ink)",
  fontSize: 12,
  lineHeight: 1.55,
};
const textInput: React.CSSProperties = {
  width: "100%",
  background: "var(--s-slab-2)",
  color: "var(--s-slab-ink)",
  border: "1px solid var(--s-line)",
  borderRadius: 7,
  padding: "9px 12px",
  fontSize: 13,
  outline: "none",
};
const errorLine: React.CSSProperties = { color: "var(--s-warn-ink)", fontSize: 12, marginBottom: 10 };
const miniAction: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  background: "transparent",
  border: "none",
  cursor: "pointer",
  fontSize: 11,
  color: "var(--s-ink-faint)",
  padding: 0,
};
const ghostInline: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  background: "transparent",
  border: "1px solid var(--s-line)",
  borderRadius: 7,
  cursor: "pointer",
  fontSize: 11.5,
  color: "var(--s-slab-ink)",
  padding: "6px 10px",
};
const navBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  background: "transparent",
  border: "none",
  cursor: "pointer",
  fontSize: 12,
  color: "var(--s-ink-dim)",
  padding: 0,
};
const clearBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  background: "transparent",
  border: "none",
  cursor: "pointer",
  fontSize: 11,
  color: "var(--s-ink-faint)",
  padding: "0 2px",
};
const useBtn: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 500,
  color: "var(--s-on-accent)",
  background: "var(--s-accent)",
  border: "none",
  borderRadius: 6,
  padding: "5px 12px",
  cursor: "pointer",
  whiteSpace: "nowrap",
};
function stepNode(done: boolean, current: boolean): React.CSSProperties {
  return {
    width: 24,
    height: 24,
    borderRadius: 8,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: done ? tint("var(--s-ok-ink)", 18) : current ? tint("var(--s-accent-bright)", 22) : "transparent",
    border: `1px solid ${done ? "var(--s-ok-ink)" : current ? tint("var(--s-accent-bright)", 65) : "var(--s-line)"}`,
    color: done ? "var(--s-ok-ink)" : current ? ACCENT : "var(--s-ink-faint)",
  };
}
function optionBtn(selected: boolean, recommended: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 13px",
    borderRadius: 7,
    fontSize: 12.5,
    cursor: "pointer",
    fontWeight: selected ? 500 : 400,
    background: selected ? tint("var(--s-ok-ink)", 16) : recommended ? tint("var(--s-accent-bright)", 10) : "var(--s-slab-2)",
    border: selected
      ? "1px solid var(--s-ok-ink)"
      : recommended
        ? "1px dashed " + tint("var(--s-accent-bright)", 70)
        : "1px solid var(--s-line)",
    color: selected ? "var(--s-ok-ink)" : recommended ? ACCENT : "var(--s-slab-ink)",
  };
}
function primaryBtn(enabled: boolean, compact = false): React.CSSProperties {
  return {
    width: compact ? undefined : "100%",
    padding: compact ? "7px 14px" : "9px 12px",
    borderRadius: 8,
    fontSize: 12.5,
    fontWeight: 500,
    cursor: enabled ? "pointer" : "default",
    border: "1px solid " + (enabled ? "var(--s-accent)" : "var(--s-line)"),
    background: enabled ? "var(--s-accent)" : "transparent",
    color: enabled ? "var(--s-on-accent)" : "var(--s-ink-faint)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  };
}
function ghostBtn(block: boolean): React.CSSProperties {
  return {
    width: block ? "100%" : undefined,
    marginTop: block ? 8 : 0,
    padding: "8px 12px",
    borderRadius: 8,
    fontSize: 12,
    cursor: "pointer",
    border: "1px solid var(--s-line)",
    background: "transparent",
    color: "var(--s-slab-ink)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };
}

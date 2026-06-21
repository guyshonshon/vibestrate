import { useMemo, useState } from "react";
import { ArrowRight, ArrowLeft, Check, X, HelpCircle, PenLine } from "lucide-react";
import { api } from "../../lib/api.js";
import type { ShapeQuestion, ShapeQuestionCategory } from "../../lib/types.js";
import { usePublishViewContext } from "../../lib/view-context.js";

// ── In-run gap-questions screen (Shape) - C2 "vertical timeline" design ──────
// A left timeline lists every category (area) with its status + count; the
// current area's questions show on the right, one area at a time. Steps are
// jumpable, "Proceed to spec" is always reachable, and a single-area round
// collapses to one screen (no timeline). Suggest is ADVISORY: it surfaces a
// recommendation you accept with one click - it never pre-selects your answer.

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
  // Advisory recommendations, shown but NOT applied until the user accepts.
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

  const answeredOf = (items: ShapeQuestion[]) =>
    items.filter((q) => (answers[q.id] ?? "").trim().length > 0).length;
  const answeredCount = questions.filter((q) => (answers[q.id] ?? "").trim().length > 0).length;

  // The current step is explicit: it starts at the first area and only changes
  // when the user navigates (Next/Back/click a step). Answering never auto-jumps,
  // so you always see the answer you just gave.
  const [active, setActive] = useState<ShapeQuestionCategory | null>(null);
  const activeCat = active ?? byCategory[0]?.category ?? null;
  const activeIdx = byCategory.findIndex((g) => g.category === activeCat);
  const activeGroup = byCategory[activeIdx];

  usePublishViewContext({
    screen: "Shape questions",
    details:
      `Round ${round}. Current area: ${activeCat ? CATEGORY_LABEL[activeCat] : "-"}.\n` +
      questions
        .map((q) => `- [${q.category}] ${q.id}: "${q.question}" -> ${(answers[q.id] ?? "").trim() || "(blank)"}`)
        .join("\n"),
  });

  function setAnswer(id: string, value: string) {
    setAnswers((a) => ({ ...a, [id]: value }));
    // Accepting/typing an answer clears any standing recommendation for it.
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
    const payload = questions
      .map((q) => ({ id: q.id, answer: (answers[q.id] ?? "").trim() }))
      .filter((a) => a.answer.length > 0);
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

  const stepper = (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {byCategory.map((g, i) => {
        const ans = answeredOf(g.items);
        const done = ans === g.items.length;
        const current = g.category === activeCat;
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
                padding: current ? "6px 8px" : "5px 0",
                margin: current ? "0 -8px" : 0,
                borderRadius: 6,
                background: current ? "var(--s-soft)" : "transparent",
                border: current ? "1px solid var(--s-accent)" : "1px solid transparent",
              }}
            >
              <span style={stepNode(done, current)}>{done ? <Check size={11} /> : i + 1}</span>
              <span style={{ flex: 1, fontSize: 12.5, color: current ? "var(--s-soft-ink)" : "var(--s-ink-dim)", fontWeight: current ? 500 : 400 }}>
                {CATEGORY_LABEL[g.category]}
              </span>
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: done ? "var(--s-ok-ink)" : "var(--s-ink-faint)" }}>
                {ans}/{g.items.length}
              </span>
            </button>
            {i < byCategory.length - 1 ? (
              <div style={{ width: 1, height: 10, background: done ? "var(--s-ok-ink)" : "var(--s-line)", marginLeft: 8 }} />
            ) : null}
          </div>
        );
      })}
      <div style={{ height: 1, background: "var(--s-line)", margin: "13px 0 11px" }} />
      <div style={{ fontSize: 11.5, color: "var(--s-ink-dim)", lineHeight: 1.5, marginBottom: 11 }}>
        Answer what you can. We ask follow-ups only where it's still open.
      </div>
      {error ? <div style={errorLine}>{error}</div> : null}
      <button onClick={() => void submit(false)} disabled={busy || answeredCount === 0} style={primaryBtn(answeredCount > 0)}>
        {busy ? "Working..." : "Submit answers"} <ArrowRight size={14} />
      </button>
      <button onClick={() => void submit(true)} disabled={busy} style={ghostBtn(true)}>
        Proceed to spec now
      </button>
    </div>
  );

  const content = activeGroup ? (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 13 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 500, letterSpacing: "-0.01em" }}>{CATEGORY_LABEL[activeGroup.category]}</div>
          <div style={{ fontSize: 11.5, color: "var(--s-ink-faint)", marginTop: 2 }}>{CATEGORY_BLURB[activeGroup.category]}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: "var(--s-ink-dim)" }}>
            {answeredOf(activeGroup.items)}/{activeGroup.items.length}
          </span>
          <div style={{ display: "flex", gap: 3 }}>
            {activeGroup.items.map((q) => (
              <div key={q.id} style={{ width: 16, height: 4, borderRadius: 2, background: (answers[q.id] ?? "").trim() ? "var(--s-ok-ink)" : "var(--s-line)" }} />
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
          onDismissSuggestion={() =>
            setSuggestions((s) => {
              const next = { ...s };
              delete next[q.id];
              return next;
            })
          }
        />
      ))}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 13 }}>
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
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--s-ink)" }}>Scope the work</div>
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: "var(--s-ink-faint)" }}>
              round {round} &middot; {byCategory.filter((g) => answeredOf(g.items) === g.items.length).length} of {byCategory.length} areas covered
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "168px 1fr", gap: 20 }} className="run-gap-grid">
            <aside style={{ alignSelf: "start", position: "sticky", top: 12 }}>{stepper}</aside>
            <div style={{ minWidth: 0 }}>{content}</div>
          </div>
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
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.35 }}>{q.question}</span>
        {answered ? (
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: "var(--s-ok-ink)", display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", paddingTop: 2 }}>
            <Check size={12} /> answered
          </span>
        ) : (
          <div style={{ display: "flex", gap: 9, color: "var(--s-ink-faint)", paddingTop: 2 }}>
            <button onClick={() => onSimplify(false)} style={miniAction}><HelpCircle size={13} /> simplify</button>
            <button onClick={() => onSuggest()} style={miniAction}><PenLine size={13} /> suggest</button>
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
          {answered ? (
            <button onClick={onClear} style={clearBtn}><X size={13} /> clear</button>
          ) : null}
        </div>
      ) : (
        <input
          value={value}
          onChange={(e) => onAnswer(e.target.value)}
          placeholder="Type your answer"
          style={textInput}
        />
      )}

      {!answered && suggestion ? (
        <div style={adviseRow}>
          <PenLine size={14} style={{ color: "var(--s-accent-bright)", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: "var(--s-ink)" }}>
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: "var(--s-soft-ink)" }}>suggested</span>{" "}
              {suggestion.value}
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
              {!simplify.analogy ? <button onClick={() => onSimplify(true)} style={{ ...miniAction, marginTop: 8 }}>Explain for a non-developer</button> : null}
            </>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 9, fontSize: 11.5, lineHeight: 1.55, borderTop: "1px solid var(--s-line)", paddingTop: 9, marginTop: 10 }}>
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
const card: React.CSSProperties = {
  background: "var(--s-slab-2)",
  border: "1px solid var(--s-line)",
  borderRadius: 8,
  padding: "13px 14px",
  marginBottom: 10,
};
const adviseRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  marginTop: 9,
  background: "var(--s-soft)",
  border: "1px solid var(--s-accent)",
  borderRadius: 6,
  padding: "8px 10px",
};
const simplifyBox: React.CSSProperties = {
  marginTop: 10,
  padding: "10px 12px",
  borderRadius: 7,
  background: "var(--s-soft)",
  color: "var(--s-soft-ink)",
  fontSize: 12,
  lineHeight: 1.55,
};
const textInput: React.CSSProperties = {
  width: "100%",
  background: "var(--s-slab)",
  color: "var(--s-slab-ink)",
  border: "1px solid var(--s-line)",
  borderRadius: 6,
  padding: "8px 11px",
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
  borderRadius: 6,
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
  color: "var(--s-ink-faint)",
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
  borderRadius: 5,
  padding: "5px 11px",
  cursor: "pointer",
  whiteSpace: "nowrap",
};
function stepNode(done: boolean, current: boolean): React.CSSProperties {
  return {
    width: 18,
    height: 18,
    borderRadius: "50%",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 10.5,
    fontWeight: 500,
    background: done ? "color-mix(in oklab, var(--s-ok-ink) 16%, transparent)" : current ? "var(--s-soft)" : "transparent",
    border: `1px solid ${done ? "var(--s-ok-ink)" : current ? "var(--s-accent)" : "var(--s-line)"}`,
    color: done ? "var(--s-ok-ink)" : current ? "var(--s-soft-ink)" : "var(--s-ink-faint)",
  };
}
function optionBtn(selected: boolean, recommended: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
    fontWeight: selected ? 500 : 400,
    background: selected ? "color-mix(in oklab, var(--s-ok-ink) 14%, transparent)" : "var(--s-slab)",
    border: selected
      ? "1px solid var(--s-ok-ink)"
      : recommended
        ? "1px dashed var(--s-accent)"
        : "1px solid var(--s-line)",
    color: selected ? "var(--s-ok-ink)" : recommended ? "var(--s-soft-ink)" : "var(--s-slab-ink)",
  };
}
function primaryBtn(enabled: boolean, compact = false): React.CSSProperties {
  return {
    width: compact ? undefined : "100%",
    marginTop: compact ? 0 : 0,
    padding: compact ? "7px 14px" : "9px 12px",
    borderRadius: 7,
    fontSize: 12.5,
    fontWeight: 500,
    cursor: enabled ? "pointer" : "default",
    border: "1px solid var(--s-accent)",
    background: enabled ? "var(--s-accent)" : "var(--s-slab-2)",
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
    borderRadius: 7,
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

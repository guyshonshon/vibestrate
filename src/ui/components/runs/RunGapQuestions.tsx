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

// ── In-run gap-questions screen (Shape) - modern C2 ──────────────────────────
// A bold left menu of areas (the current one a solid violet block); the current
// area is a large, open workspace on the right with big type and generous space.
// Steps jumpable, Submit + Proceed always reachable, single-area rounds collapse.
// Suggest is ADVISORY (recommends, never pre-selects). Explicit rgba colour
// (NOT color-mix, which fails to paint in some browsers): violet = current,
// teal = answered.

const V = "#8b7cff"; // brand violet (solid, punchy)
const VB = "#a99bff"; // bright violet (accents/text on dark)
const T = "#5eead4"; // teal (answered / selected)
const vt = (a: number) => `rgba(139, 124, 255, ${a})`;
const tt = (a: number) => `rgba(94, 234, 212, ${a})`;

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
  success: "Success",
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
        <h2 style={{ fontSize: 22, fontWeight: 500, margin: "0 0 8px" }}>Coverage complete</h2>
        <p style={{ fontSize: 15, color: "var(--s-ink-dim)", lineHeight: 1.6, margin: "0 0 22px" }}>
          The CTO has what it needs from your answers (round {round}). Build the spec, architecture, and risks.
        </p>
        {error ? <div style={errorLine}>{error}</div> : null}
        <button onClick={() => void finalizeNoAnswers()} disabled={busy} style={primaryBtn(true)}>
          {busy ? "Building..." : "Build the spec"} <ArrowRight size={18} />
        </button>
      </section>
    );
  }

  const single = byCategory.length <= 1;

  const menu = (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {byCategory.map((g) => {
        const ans = answeredOf(g.items);
        const done = ans === g.items.length;
        const current = g.category === activeCat;
        const Icon = CATEGORY_ICON[g.category];
        return (
          <button key={g.category} onClick={() => setActive(g.category)} style={menuRow(current)}>
            <span style={{ width: 22, display: "flex", color: current ? "#0c0d12" : done ? T : "var(--s-ink-faint)" }}>
              {done && !current ? <Check size={20} /> : <Icon size={20} />}
            </span>
            <span style={{ flex: 1, fontSize: 15.5, fontWeight: current ? 600 : 400, color: current ? "#0c0d12" : "var(--s-ink-dim)" }}>
              {CATEGORY_LABEL[g.category]}
            </span>
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, fontWeight: current ? 600 : 400, color: current ? "#0c0d12" : done ? T : "var(--s-ink-faint)" }}>
              {ans}/{g.items.length}
            </span>
          </button>
        );
      })}
    </div>
  );

  const ActiveIcon = activeGroup ? CATEGORY_ICON[activeGroup.category] : Shapes;
  const content = activeGroup ? (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, paddingBottom: 18, marginBottom: 22, borderBottom: "1px solid var(--s-line)" }}>
        <span style={bigChip}>
          <ActiveIcon size={26} style={{ color: VB }} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 25, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.15 }}>{CATEGORY_LABEL[activeGroup.category]}</div>
          <div style={{ fontSize: 14.5, color: "var(--s-ink-dim)", marginTop: 3 }}>{CATEGORY_BLURB[activeGroup.category]}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 22, fontWeight: 500 }}>
            <span style={{ color: VB }}>{answeredOf(activeGroup.items)}</span>
            <span style={{ color: "var(--s-ink-faint)", fontSize: 16 }}>/{activeGroup.items.length}</span>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--s-ink-faint)" }}>answered</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
        {activeGroup.items.map((q) => (
          <QuestionBlock
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
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24 }}>
        {activeIdx > 0 ? (
          <button onClick={() => setActive(byCategory[activeIdx - 1]!.category)} style={navBtn}>
            <ArrowLeft size={17} /> {CATEGORY_LABEL[byCategory[activeIdx - 1]!.category]}
          </button>
        ) : (
          <span />
        )}
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button onClick={() => void doSuggestAll()} disabled={suggestingAll} style={ghostInline}>
            <PenLine size={15} /> {suggestingAll ? "Drafting..." : "Suggest all here"}
          </button>
          {activeIdx < byCategory.length - 1 ? (
            <button onClick={() => setActive(byCategory[activeIdx + 1]!.category)} style={primaryBtn(true, true)}>
              {CATEGORY_LABEL[byCategory[activeIdx + 1]!.category]} <ArrowRight size={17} />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  ) : null;

  const footer = (
    <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 22, paddingTop: 18, borderTop: "1px solid var(--s-line)" }}>
      <span style={{ flex: 1, fontSize: 13.5, color: "var(--s-ink-dim)", lineHeight: 1.5 }}>
        Answer what you can - we ask follow-ups only where it's still open.
      </span>
      {error ? <span style={{ color: "var(--s-warn-ink)", fontSize: 13 }}>{error}</span> : null}
      <button onClick={() => void submit(true)} disabled={busy} style={ghostBtn}>
        Proceed to spec
      </button>
      <button onClick={() => void submit(false)} disabled={busy || answeredCount === 0} style={primaryBtn(answeredCount > 0, true)}>
        {busy ? "Working..." : "Submit answers"} <ArrowRight size={17} />
      </button>
    </div>
  );

  return (
    <section style={panel}>
      {single ? (
        <div>
          <div style={{ fontSize: 20, fontWeight: 500, marginBottom: 3 }}>Scope the work</div>
          <div style={{ fontSize: 13.5, color: "var(--s-ink-faint)", marginBottom: 20 }}>Round {round}. Answer what you can.</div>
          {content}
          {footer}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 500 }}>Scope the work</div>
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, color: "var(--s-ink-faint)" }}>
                round {round} &middot; {coveredAreas}/{byCategory.length} areas
              </span>
              <div style={{ display: "flex", gap: 4 }}>
                {byCategory.map((g) => {
                  const done = answeredOf(g.items) === g.items.length;
                  const cur = g.category === activeCat;
                  return <div key={g.category} style={{ width: 22, height: 5, borderRadius: 3, background: done ? T : cur ? V : "rgba(255,255,255,0.12)" }} />;
                })}
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "224px 1fr", gap: 30 }} className="run-gap-grid">
            <aside style={{ alignSelf: "start" }}>{menu}</aside>
            <div style={{ minWidth: 0 }}>{content}</div>
          </div>
          {footer}
        </>
      )}
      <style>{`@media (max-width: 860px){ .run-gap-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </section>
  );
}

function QuestionBlock({
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
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, marginBottom: 15 }}>
        <span style={{ fontSize: 18.5, fontWeight: 500, lineHeight: 1.4 }}>{q.question}</span>
        {answered ? (
          <span style={{ fontSize: 13, color: T, display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", paddingTop: 4 }}>
            <Check size={15} /> answered
          </span>
        ) : (
          <div style={{ display: "flex", gap: 14, paddingTop: 4, whiteSpace: "nowrap" }}>
            <button onClick={() => onSimplify(false)} style={action}><HelpCircle size={15} /> Simplify</button>
            <button onClick={() => onSuggest()} style={{ ...action, color: VB }}><PenLine size={15} /> Suggest</button>
          </div>
        )}
      </div>

      {isChoice ? (
        <div style={{ display: "flex", gap: 11, flexWrap: "wrap", alignItems: "center" }}>
          {q.options.map((opt) => {
            const sel = value === opt;
            const rec = !answered && suggestion?.value === opt;
            return (
              <button key={opt} onClick={() => onAnswer(opt)} style={optionBtn(sel, rec)}>
                {sel ? <Check size={16} /> : null} {opt}
              </button>
            );
          })}
          {answered ? <button onClick={onClear} style={clearBtn}><X size={15} /> clear</button> : null}
        </div>
      ) : (
        <input value={value} onChange={(e) => onAnswer(e.target.value)} placeholder="Type your answer" style={textInput} />
      )}

      {!answered && suggestion ? (
        <div style={adviseRow}>
          <PenLine size={17} style={{ color: VB, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, color: "var(--s-ink)" }}>
              <span style={{ fontSize: 12, color: VB, fontWeight: 500 }}>Suggested</span> &nbsp;{suggestion.value}
            </div>
            {suggestion.why ? <div style={{ fontSize: 13, color: "var(--s-ink-faint)", marginTop: 2 }}>{suggestion.why}</div> : null}
          </div>
          <button onClick={onUseSuggestion} style={useBtn}>Use</button>
          <button onClick={onDismissSuggestion} style={{ ...action, color: "var(--s-ink-faint)" }}>Dismiss</button>
        </div>
      ) : null}

      {simplify ? (
        <div style={simplifyBox}>
          {simplify.loading ? (
            <span style={{ color: "var(--s-ink-faint)" }}>Explaining...</span>
          ) : (
            <>
              <div>{simplify.text}</div>
              {simplify.affects ? <div style={{ marginTop: 8, color: "var(--s-ink-dim)" }}><b style={{ fontWeight: 500 }}>What it affects:</b> {simplify.affects}</div> : null}
              {simplify.analogy ? <div style={{ marginTop: 8, color: "var(--s-ink-dim)" }}><b style={{ fontWeight: 500 }}>Analogy:</b> {simplify.analogy}</div> : null}
              {!simplify.analogy ? <button onClick={() => onSimplify(true)} style={{ ...action, marginTop: 10, color: VB }}>Explain for a non-developer</button> : null}
            </>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 11, fontSize: 14, lineHeight: 1.6, marginTop: 14 }}>
          <span style={{ color: "var(--s-ink-faint)", flexShrink: 0 }}>Why it matters</span>
          <span style={{ color: "var(--s-ink-dim)" }}>{q.why}</span>
        </div>
      )}
    </div>
  );
}

// ── styles ──
const panel: React.CSSProperties = {
  border: "1px solid var(--s-line)",
  borderRadius: 16,
  background: "var(--s-slab)",
  padding: "22px 26px",
  color: "var(--s-ink)",
};
const bigChip: React.CSSProperties = {
  width: 50,
  height: 50,
  borderRadius: 14,
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: vt(0.16),
  border: `1px solid ${vt(0.4)}`,
};
function menuRow(current: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 13,
    width: "100%",
    textAlign: "left",
    cursor: "pointer",
    padding: "13px 15px",
    borderRadius: 13,
    background: current ? V : "var(--s-slab-2)",
    border: current ? `1px solid ${V}` : "1px solid var(--s-line)",
  };
}
const adviseRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  marginTop: 14,
  background: vt(0.1),
  border: `1px solid ${vt(0.4)}`,
  borderRadius: 12,
  padding: "12px 15px",
};
const simplifyBox: React.CSSProperties = {
  marginTop: 14,
  padding: "14px 16px",
  borderRadius: 12,
  background: vt(0.1),
  border: `1px solid ${vt(0.28)}`,
  color: "var(--s-ink)",
  fontSize: 14,
  lineHeight: 1.6,
};
const textInput: React.CSSProperties = {
  width: "100%",
  background: "var(--s-slab-2)",
  color: "var(--s-slab-ink)",
  border: "1px solid var(--s-line)",
  borderRadius: 12,
  padding: "13px 16px",
  fontSize: 15,
  outline: "none",
};
const errorLine: React.CSSProperties = { color: "var(--s-warn-ink)", fontSize: 13.5, marginBottom: 14 };
const action: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  background: "transparent",
  border: "none",
  cursor: "pointer",
  fontSize: 13.5,
  color: "var(--s-ink-dim)",
  padding: 0,
};
const ghostInline: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  background: "var(--s-slab-2)",
  border: "1px solid var(--s-line)",
  borderRadius: 11,
  cursor: "pointer",
  fontSize: 14,
  color: "var(--s-slab-ink)",
  padding: "10px 16px",
};
const navBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  background: "transparent",
  border: "none",
  cursor: "pointer",
  fontSize: 15,
  color: "var(--s-ink-dim)",
  padding: 0,
};
const clearBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  background: "transparent",
  border: "none",
  cursor: "pointer",
  fontSize: 13.5,
  color: "var(--s-ink-faint)",
  padding: "0 4px",
};
const useBtn: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: "#0c0d12",
  background: V,
  border: "none",
  borderRadius: 10,
  padding: "9px 18px",
  cursor: "pointer",
  whiteSpace: "nowrap",
};
const ghostBtn: React.CSSProperties = {
  padding: "12px 20px",
  borderRadius: 12,
  fontSize: 14.5,
  cursor: "pointer",
  border: "1px solid var(--s-line)",
  background: "var(--s-slab-2)",
  color: "var(--s-slab-ink)",
  whiteSpace: "nowrap",
};
function optionBtn(selected: boolean, recommended: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "13px 22px",
    borderRadius: 12,
    fontSize: 15.5,
    cursor: "pointer",
    fontWeight: selected ? 500 : 400,
    background: selected ? tt(0.15) : recommended ? vt(0.1) : "var(--s-slab-2)",
    border: selected ? `1.5px solid ${T}` : recommended ? `1.5px dashed ${vt(0.7)}` : "1.5px solid var(--s-line)",
    color: selected ? T : recommended ? VB : "var(--s-slab-ink)",
  };
}
function primaryBtn(enabled: boolean, compact = false): React.CSSProperties {
  return {
    width: compact ? undefined : "100%",
    padding: compact ? "12px 24px" : "14px 20px",
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 500,
    cursor: enabled ? "pointer" : "default",
    border: "none",
    background: enabled ? V : "var(--s-slab-2)",
    color: enabled ? "#0c0d12" : "var(--s-ink-faint)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    whiteSpace: "nowrap",
  };
}

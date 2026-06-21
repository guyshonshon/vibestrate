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

// ── In-run gap-questions screen (Shape) - modern, card-based, layered ────────
// Bold left menu of areas (the current one a solid violet block); the current
// area's questions are contained CARDS on a layered surface (panel -> card ->
// inset). One area at a time, jumpable, Submit + Proceed always reachable.
// Suggest is ADVISORY (recommends, never pre-selects). Palette is violet +
// neutrals only - no second hue, no glow tints (flat solid surfaces). Explicit
// rgba violet (NOT color-mix, which fails to paint in some browsers).

const V = "#8b7cff"; // brand violet, solid
const VB = "#a99bff"; // bright violet, accents/text on dark

// Borderless tonal system. Separation is carried by TONE STEPS, never by borders,
// so the `.deep-scene` near-invisible --s-line can't flatten it. Violet is an
// accent only (active marker, answered check, selected option, Submit). Ladder:
// page -> container ("ground") -> card -> recessed well; questions are split by a
// crisp divider rather than relying on the gap alone.
const PAGE = "#07090e"; // section canvas; the rail floats directly on it
const GROUND = "#0e1119"; // the content container - "it is a container"
const CARD = "#1b212d"; // open question card, a clear step above the ground
const CARD_DONE = "#221f31"; // answered question, same step with a faint violet lean
const WELL = "#080b10"; // recessed field: text input, unselected option
const SEL = "rgba(139, 124, 255, 0.22)"; // selected option fill
const SEL_INK = "#d8ccff"; // text on a selected option
const RAIL_ON = "#171c24"; // active menu field (calm, neutral - no violet wash)
const DIVIDER = "rgba(255,255,255,0.08)"; // the rule between questions
const HAIR = "rgba(255,255,255,0.07)"; // quiet rule for header / footer separators

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
      <section style={page}>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {byCategory.map((g) => {
        const ans = answeredOf(g.items);
        const done = ans === g.items.length;
        const current = g.category === activeCat;
        return (
          <button key={g.category} onClick={() => setActive(g.category)} style={menuRow(current)}>
            <span style={{ width: 16, display: "flex", justifyContent: "center", flexShrink: 0, color: done ? VB : current ? V : "var(--s-ink-faint)" }}>
              {done ? <Check size={15} /> : <span style={{ width: 6, height: 6, borderRadius: 999, background: current ? V : "rgba(255,255,255,0.18)" }} />}
            </span>
            <span style={{ flex: 1, fontSize: 14, fontWeight: current ? 500 : 400, color: current ? "#e7e9f0" : "var(--s-ink-dim)" }}>
              {CATEGORY_LABEL[g.category]}
            </span>
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, color: done || current ? VB : "var(--s-ink-faint)" }}>
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
      <div style={{ display: "flex", alignItems: "center", gap: 13, paddingBottom: 14, marginBottom: 14, borderBottom: `1px solid ${HAIR}` }}>
        <ActiveIcon size={24} style={{ color: VB, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 500, letterSpacing: "-0.01em", lineHeight: 1.2 }}>{CATEGORY_LABEL[activeGroup.category]}</div>
          <div style={{ fontSize: 13.5, color: "var(--s-ink-dim)", marginTop: 2 }}>{CATEGORY_BLURB[activeGroup.category]}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 15, color: VB }}>
            {answeredOf(activeGroup.items)}/{activeGroup.items.length}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--s-ink-faint)" }}>answered</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {activeGroup.items.map((q, i) => (
          <div key={q.id}>
            {i > 0 ? <div style={qDivider} /> : null}
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

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20 }}>
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
    <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 20, paddingTop: 18, borderTop: `1px solid ${HAIR}` }}>
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
    <section style={page}>
      {single ? (
        <div>
          <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 3 }}>Scope the work</div>
          <div style={{ fontSize: 13, color: "var(--s-ink-faint)", marginBottom: 14 }}>Round {round}. Answer what you can.</div>
          <div style={ground}>
            {content}
            {footer}
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 500 }}>Scope the work</div>
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, color: "var(--s-ink-faint)" }}>
                round {round} &middot; {coveredAreas}/{byCategory.length} areas
              </span>
              <div style={{ display: "flex", gap: 4 }}>
                {byCategory.map((g) => {
                  const done = answeredOf(g.items) === g.items.length;
                  const cur = g.category === activeCat;
                  return <div key={g.category} style={{ width: 22, height: 5, borderRadius: 3, background: done ? V : cur ? VB : "rgba(255,255,255,0.12)" }} />;
                })}
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "196px 1fr", gap: 16 }} className="run-gap-grid">
            <aside style={{ alignSelf: "start" }}>{menu}</aside>
            <div style={ground}>
              {content}
              {footer}
            </div>
          </div>
        </>
      )}
      <style>{`@media (max-width: 860px){ .run-gap-grid{ grid-template-columns: 1fr !important; } }`}</style>
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
    <div style={card(answered)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, marginBottom: 15 }}>
        <span style={{ fontSize: 17.5, fontWeight: 500, lineHeight: 1.4 }}>{q.question}</span>
        {answered ? (
          <span style={{ fontSize: 13, color: VB, display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", paddingTop: 4 }}>
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
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
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
        <div style={{ display: "flex", gap: 11, fontSize: 14, lineHeight: 1.6, marginTop: 14, paddingTop: 13, borderTop: `1px solid ${HAIR}` }}>
          <span style={{ color: "var(--s-ink-faint)", flexShrink: 0 }}>Why it matters</span>
          <span style={{ color: "var(--s-ink-dim)" }}>{q.why}</span>
        </div>
      )}
    </div>
  );
}

// ── styles - borderless tonal (page -> ground -> card -> well); violet as accent ──
const page: React.CSSProperties = {
  borderRadius: 18,
  background: PAGE,
  padding: "20px 22px",
  color: "var(--s-ink)",
};
const ground: React.CSSProperties = {
  background: GROUND,
  borderRadius: 14,
  padding: "16px 18px",
  minWidth: 0,
};
function card(answered: boolean): React.CSSProperties {
  // Open questions are flat rows on the ground so the divider is the sole
  // separator (a filled card + a divider read redundant). Answered questions
  // keep a subtle violet-tinted block as their done-state cue.
  return answered
    ? { background: CARD_DONE, borderRadius: 11, padding: "15px 16px" }
    : { background: "transparent", padding: "15px 16px" };
}
const qDivider: React.CSSProperties = { height: 1, background: DIVIDER, margin: "8px 0" };
function menuRow(current: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 11,
    width: "100%",
    textAlign: "left",
    cursor: "pointer",
    padding: "10px 12px",
    borderRadius: 10,
    background: current ? RAIL_ON : "transparent",
    border: "none",
  };
}
const adviseRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  marginTop: 14,
  background: WELL,
  borderRadius: 10,
  padding: "12px 15px",
};
const simplifyBox: React.CSSProperties = {
  marginTop: 14,
  padding: "13px 15px",
  borderRadius: 10,
  background: WELL,
  color: "var(--s-ink)",
  fontSize: 14,
  lineHeight: 1.6,
};
const textInput: React.CSSProperties = {
  width: "100%",
  background: WELL,
  color: "var(--s-slab-ink)",
  border: "none",
  borderRadius: 10,
  padding: "12px 15px",
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
  background: CARD,
  border: "none",
  borderRadius: 10,
  cursor: "pointer",
  fontSize: 13.5,
  color: "var(--s-ink-dim)",
  padding: "9px 15px",
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
  gap: 6,
  background: WELL,
  border: "none",
  borderRadius: 10,
  cursor: "pointer",
  fontSize: 13,
  color: "var(--s-ink-faint)",
  padding: "9px 13px",
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
  padding: "11px 18px",
  borderRadius: 10,
  fontSize: 14,
  cursor: "pointer",
  border: "none",
  background: CARD,
  color: "var(--s-ink)",
  whiteSpace: "nowrap",
};
function optionBtn(selected: boolean, recommended: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "11px 17px",
    borderRadius: 10,
    fontSize: 14.5,
    cursor: "pointer",
    fontWeight: selected ? 500 : 400,
    border: "none",
    background: selected ? SEL : recommended ? "rgba(139,124,255,0.12)" : WELL,
    color: selected ? SEL_INK : recommended ? VB : "var(--s-ink)",
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
    background: enabled ? V : CARD,
    color: enabled ? "#14101f" : "var(--s-ink-faint)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    whiteSpace: "nowrap",
  };
}

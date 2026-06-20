import { useMemo, useState } from "react";
import { ArrowRight, Sparkles, HelpCircle, Wand2 } from "lucide-react";
import { api } from "../../lib/api.js";
import type { ShapeQuestion, ShapeQuestionCategory } from "../../lib/types.js";
import { usePublishViewContext } from "../../lib/view-context.js";

// ── In-run gap-questions screen (the "spec entry" face of Shape) ─────────────
// Deep-questioning loop: questions arrive in rounds, grouped by category with
// per-area progress. Each question carries on-demand helpers - Simplify (plain
// language) and Suggest (a draft grounded in prior answers, which you still
// review). Submitting either loops to a gap-check round or builds the spec; a
// "Proceed to spec" escape is always available. The screen also publishes a
// snapshot to the consult orb so it can advise in context.

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

type SimplifyState = { loading: boolean; text?: string; affects?: string; analogy?: string };
type SuggestMeta = { why: string; reviewed: boolean };

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
  const [suggested, setSuggested] = useState<Record<string, SuggestMeta>>({});
  const [simplify, setSimplify] = useState<Record<string, SimplifyState>>({});
  const [focused, setFocused] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [suggestingAll, setSuggestingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmUnreviewed, setConfirmUnreviewed] = useState(false);

  const answeredCount = questions.filter((q) => (answers[q.id] ?? "").trim().length > 0).length;
  // A field filled by Suggest and not yet touched by the user.
  const unreviewedIds = questions
    .map((q) => q.id)
    .filter((id) => (answers[id] ?? "").trim().length > 0 && suggested[id] && !suggested[id].reviewed);

  const byCategory = useMemo(() => {
    const groups = new Map<ShapeQuestionCategory, ShapeQuestion[]>();
    for (const q of questions) {
      const cat = (q.category ?? "other") as ShapeQuestionCategory;
      (groups.get(cat) ?? groups.set(cat, []).get(cat)!).push(q);
    }
    return CATEGORY_ORDER.filter((c) => groups.has(c)).map((c) => ({ category: c, items: groups.get(c)! }));
  }, [questions]);

  // Publish a snapshot for the screen-aware orb (redacted server-side).
  usePublishViewContext({
    screen: "Shape questions",
    details:
      `Round ${round}. The user is answering scoping questions.\n` +
      questions
        .map((q) => {
          const a = (answers[q.id] ?? "").trim();
          return `- [${q.category}] ${q.id}: "${q.question}" -> ${a ? a : "(blank)"}`;
        })
        .join("\n") +
      (focused ? `\nFocused field: ${focused}` : ""),
  });

  function setAnswer(id: string, value: string, byUser: boolean) {
    setAnswers((a) => ({ ...a, [id]: value }));
    if (byUser) {
      // Touching a suggested field counts as reviewing it.
      setSuggested((s) => (s[id] ? { ...s, [id]: { ...s[id], reviewed: true } } : s));
      setConfirmUnreviewed(false);
    }
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
      if (r.suggestedValue) {
        setAnswers((a) => ({ ...a, [id]: r.suggestedValue! }));
        setSuggested((s) => ({ ...s, [id]: { why: r.why ?? "", reviewed: false } }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function doSuggestAll() {
    const blanks = questions.filter((q) => (answers[q.id] ?? "").trim().length === 0).map((q) => q.id);
    if (blanks.length === 0) return;
    setSuggestingAll(true);
    setError(null);
    try {
      const r = await api.shapeAssist({ sourceRunId: runId, mode: "suggest-all", questionIds: blanks });
      const filled: Record<string, string> = {};
      const meta: Record<string, SuggestMeta> = {};
      for (const it of r.items ?? []) {
        filled[it.questionId] = it.suggestedValue;
        meta[it.questionId] = { why: it.why, reviewed: false };
      }
      setAnswers((a) => ({ ...a, ...filled }));
      setSuggested((s) => ({ ...s, ...meta }));
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
      // No new answers: a bare "proceed" finalizes the accumulated set.
      if (proceed) return finalizeNoAnswers();
      setError("Answer at least one question, or use Suggest to draft one.");
      return;
    }
    // Unreviewed-suggestion guard: warn before submitting model-authored answers.
    if (unreviewedIds.length > 0 && !confirmUnreviewed) {
      setConfirmUnreviewed(true);
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

  // Coverage-complete round (gap-check found no further gaps): no questions to
  // answer, just build the spec.
  if (questions.length === 0 && coverageComplete) {
    return (
      <section style={panelStyle}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>Coverage complete</h2>
        <p style={{ fontSize: 13, color: "var(--s-ink-dim)", lineHeight: 1.5, margin: "0 0 16px" }}>
          The CTO has everything it needs from your answers (round {round}). Build the
          spec, architecture, and risks from what you decided.
        </p>
        {error ? <div style={{ color: "var(--s-warn-ink)", fontSize: 12, marginBottom: 10 }}>{error}</div> : null}
        <button onClick={() => void finalizeNoAnswers()} disabled={busy} style={primaryBtn(true)}>
          {busy ? "Building..." : "Build the spec"} <ArrowRight size={15} />
        </button>
      </section>
    );
  }

  return (
    <section style={panelStyle}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 240px", gap: 22 }} className="run-gap-grid">
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Scope the work</h2>
            <span style={{ fontSize: 12, color: "var(--s-ink-dim)", fontVariantNumeric: "tabular-nums" }}>
              Round {round} &middot; {answeredCount} of {questions.length} answered
            </span>
          </div>
          <p style={{ fontSize: 13, color: "var(--s-ink-dim)", lineHeight: 1.5, margin: "0 0 16px" }}>
            The CTO asks until the work is fully scoped, drilling deeper each round. Answer
            what you can - tap <b>Simplify</b> if a question is unclear, or <b>Suggest</b> for a
            draft grounded in your earlier answers (you still decide).
          </p>

          {byCategory.map(({ category, items }) => {
            const ans = items.filter((q) => (answers[q.id] ?? "").trim().length > 0).length;
            return (
              <div key={category} style={{ marginBottom: 18 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: "var(--s-soft-ink)" }}>
                    {CATEGORY_LABEL[category]}
                  </span>
                  <span style={{ fontSize: 11, color: ans === items.length ? "var(--s-ok-ink)" : "var(--s-ink-faint)", fontVariantNumeric: "tabular-nums" }}>
                    {ans === items.length ? "covered" : `${ans}/${items.length}`}
                  </span>
                </div>
                <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {items.map((q) => {
                    const value = answers[q.id] ?? "";
                    const answered = value.trim().length > 0;
                    const sug = suggested[q.id];
                    const simp = simplify[q.id];
                    return (
                      <li key={q.id} style={cardStyle}>
                        <span aria-hidden style={spineStyle(answered)} />
                        <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                          <span style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.35, flex: 1 }}>{q.question}</span>
                          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                            <button title="Explain this in plain language" onClick={() => void doSimplify(q.id, false)} style={ghostBtn}>
                              <HelpCircle size={12} /> Simplify
                            </button>
                            <button title="Draft an answer from your prior answers" onClick={() => void doSuggest(q.id)} style={ghostBtn}>
                              <Sparkles size={12} /> Suggest
                            </button>
                          </div>
                        </div>
                        <div style={whyStyle}>
                          <span style={{ color: "var(--s-soft-ink)", fontWeight: 500 }}>Why it matters. </span>
                          {q.why}
                        </div>

                        {simp ? (
                          <div style={simplifyBoxStyle}>
                            {simp.loading ? (
                              <span style={{ color: "var(--s-ink-faint)" }}>Explaining...</span>
                            ) : (
                              <>
                                <div>{simp.text}</div>
                                {simp.affects ? <div style={{ marginTop: 6, color: "var(--s-ink-dim)" }}><b>What it affects:</b> {simp.affects}</div> : null}
                                {simp.analogy ? <div style={{ marginTop: 6, color: "var(--s-ink-dim)" }}><b>Analogy:</b> {simp.analogy}</div> : null}
                                {!simp.analogy ? (
                                  <button onClick={() => void doSimplify(q.id, true)} style={{ ...ghostBtn, marginTop: 8 }}>
                                    Explain for a non-developer
                                  </button>
                                ) : null}
                              </>
                            )}
                          </div>
                        ) : null}

                        {q.kind === "choice" && q.options.length > 0 ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 12 }}>
                            {q.options.map((opt) => {
                              const active = value === opt;
                              return (
                                <button key={opt} onClick={() => setAnswer(q.id, opt, true)} style={optionBtn(active)}>
                                  {opt}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <input
                            value={value}
                            onFocusCapture={() => setFocused(q.id)}
                            onBlur={() => setFocused((f) => (f === q.id ? null : f))}
                            onChange={(e) => setAnswer(q.id, e.target.value, true)}
                            placeholder="Your answer"
                            style={inputStyle}
                          />
                        )}

                        {sug ? (
                          <div style={{ marginTop: 8, fontSize: 11.5, color: sug.reviewed ? "var(--s-ink-faint)" : "var(--s-soft-ink)" }}>
                            <Wand2 size={11} style={{ verticalAlign: "-1px" }} />{" "}
                            {sug.reviewed ? "edited from a suggestion" : "suggested - review or edit it"}
                            {sug.why ? <span style={{ color: "var(--s-ink-faint)" }}> &middot; {sug.why}</span> : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })}
        </div>

        {/* Readiness rail */}
        <aside style={{ alignSelf: "start", position: "sticky", top: 12 }}>
          <div style={railStyle}>
            <div style={{ fontSize: 11.5, color: "var(--s-ink-dim)", fontWeight: 600 }}>Readiness &middot; round {round}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
              <span style={{ fontSize: 30, fontWeight: 800, lineHeight: 1 }}>{answeredCount}</span>
              <span style={{ fontSize: 12.5, color: "var(--s-ink-faint)" }}>/ {questions.length} answered</span>
            </div>

            <div style={{ height: 1, background: "var(--s-line)", margin: "12px 0" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {byCategory.map(({ category, items }) => {
                const ans = items.filter((q) => (answers[q.id] ?? "").trim().length > 0).length;
                const done = ans === items.length;
                return (
                  <div key={category} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={dotStyle(done)} />
                      <span style={{ color: done ? "var(--s-ink)" : "var(--s-ink-faint)" }}>{CATEGORY_LABEL[category]}</span>
                    </span>
                    <span style={{ color: "var(--s-ink-faint)", fontVariantNumeric: "tabular-nums" }}>{ans}/{items.length}</span>
                  </div>
                );
              })}
            </div>

            <button onClick={() => void doSuggestAll()} disabled={suggestingAll} style={{ ...ghostBtn, width: "100%", justifyContent: "center", marginTop: 14, padding: "7px 10px" }}>
              <Sparkles size={12} /> {suggestingAll ? "Drafting..." : "Suggest all remaining"}
            </button>

            {unreviewedIds.length > 0 ? (
              <div style={{ color: "var(--s-warn-ink)", fontSize: 11.5, marginTop: 10, lineHeight: 1.4 }}>
                {unreviewedIds.length} suggested answer{unreviewedIds.length > 1 ? "s" : ""} not yet reviewed.
              </div>
            ) : null}
            {error ? <div style={{ color: "var(--s-warn-ink)", fontSize: 12, marginTop: 10 }}>{error}</div> : null}

            <button onClick={() => void submit(false)} disabled={busy || answeredCount === 0} style={primaryBtn(answeredCount > 0)}>
              {busy ? "Working..." : confirmUnreviewed ? "Submit suggested as-is?" : "Submit answers"}
              <ArrowRight size={15} />
            </button>
            <button onClick={() => void submit(true)} disabled={busy} style={{ ...ghostBtn, width: "100%", justifyContent: "center", marginTop: 8, padding: "8px 10px" }}>
              Proceed to spec now
            </button>
            <div style={{ fontSize: 11, color: "var(--s-ink-faint)", marginTop: 8, lineHeight: 1.45 }}>
              Read-only. We ask follow-ups if anything's still open, or build the spec - a
              draft you approve before anything is written.
            </div>
          </div>
        </aside>
      </div>
      <style>{`@media (max-width: 880px){ .run-gap-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </section>
  );
}

// ── styles ──
const panelStyle: React.CSSProperties = {
  border: "1px solid var(--s-line)",
  borderRadius: 14,
  background: "var(--s-slab)",
  padding: "18px 20px",
  color: "var(--s-ink)",
};
const cardStyle: React.CSSProperties = {
  background: "var(--s-slab-2)",
  border: "1px solid var(--s-line)",
  borderRadius: 8,
  padding: "14px 16px",
  marginBottom: 10,
  position: "relative",
  overflow: "hidden",
};
const railStyle: React.CSSProperties = {
  border: "1px solid var(--s-line)",
  borderRadius: 10,
  background: "var(--s-glass-2)",
  padding: "14px 14px 16px",
};
const whyStyle: React.CSSProperties = {
  marginTop: 7,
  paddingLeft: 11,
  borderLeft: "2px solid var(--s-soft)",
  fontSize: 12.5,
  lineHeight: 1.5,
  color: "var(--s-ink-dim)",
};
const simplifyBoxStyle: React.CSSProperties = {
  marginTop: 10,
  padding: "10px 12px",
  borderRadius: 7,
  background: "var(--s-soft)",
  color: "var(--s-soft-ink)",
  fontSize: 12.5,
  lineHeight: 1.5,
};
const inputStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 12,
  background: "var(--s-slab)",
  color: "var(--s-slab-ink)",
  border: "1px solid var(--s-line)",
  borderRadius: 7,
  padding: "8px 11px",
  fontSize: 13.5,
  outline: "none",
};
const ghostBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "4px 9px",
  borderRadius: 6,
  fontSize: 11.5,
  cursor: "pointer",
  border: "1px solid var(--s-line)",
  background: "var(--s-slab)",
  color: "var(--s-slab-ink)",
};
function spineStyle(answered: boolean): React.CSSProperties {
  return { position: "absolute", left: 0, top: 0, bottom: 0, width: 2, background: answered ? "var(--s-ok-ink)" : "var(--s-line)", transition: "background 200ms" };
}
function optionBtn(active: boolean): React.CSSProperties {
  return {
    padding: "6px 12px",
    borderRadius: 7,
    fontSize: 13,
    cursor: "pointer",
    border: `1px solid ${active ? "var(--s-accent)" : "var(--s-line)"}`,
    background: active ? "var(--s-soft)" : "var(--s-slab)",
    color: active ? "var(--s-soft-ink)" : "var(--s-slab-ink)",
  };
}
function dotStyle(done: boolean): React.CSSProperties {
  return { width: 7, height: 7, borderRadius: 7, background: done ? "var(--s-ok-ink)" : "transparent", border: `1.5px solid ${done ? "var(--s-ok-ink)" : "var(--s-ink-faint)"}`, flexShrink: 0 };
}
function primaryBtn(enabled: boolean): React.CSSProperties {
  return {
    width: "100%",
    marginTop: 14,
    padding: "9px 12px",
    borderRadius: 8,
    fontSize: 13.5,
    fontWeight: 600,
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

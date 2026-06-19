import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { api } from "../../lib/api.js";
import type { ShapeQuestion } from "../../lib/types.js";

// ── In-run gap-questions screen (the "spec entry" face of Shape) ─────────────
// Rendered by RunDetailPage when the open run is a shape-intake run awaiting
// answers. Design adopted from the Guided Document proposal: status-spine
// question cards, the CTO's "Why it matters" rationale voiced inline, and a
// readiness rail. Submitting launches the shaping run (via the gated
// /api/shape/answers path) and hands off to it. The page owns polling; this
// component just renders the questions it is handed.

export function RunGapQuestions({
  runId,
  questions,
  onSubmitted,
}: {
  runId: string;
  questions: ShapeQuestion[];
  onSubmitted: (shapeRunId: string) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answeredCount = questions.filter((q) => (answers[q.id] ?? "").trim().length > 0).length;

  async function submit() {
    const payload = questions
      .map((q) => ({ id: q.id, answer: (answers[q.id] ?? "").trim() }))
      .filter((a) => a.answer.length > 0);
    if (payload.length === 0) {
      setError("Answer at least one question.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { runId: shapeRunId } = await api.submitShapeAnswers({
        sourceRunId: runId,
        answers: payload,
      });
      onSubmitted(shapeRunId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <section
      style={{
        border: "1px solid var(--s-line)",
        borderRadius: 14,
        background: "var(--s-slab)",
        padding: "18px 20px",
        color: "var(--s-ink)",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) 232px",
          gap: 22,
        }}
        className="run-gap-grid"
      >
        {/* The conversational document of questions */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Scope the work</h2>
            <span style={{ fontSize: 12, color: "var(--s-ink-dim)", fontVariantNumeric: "tabular-nums" }}>
              {answeredCount} of {questions.length} answered
            </span>
          </div>
          <p style={{ fontSize: 13, color: "var(--s-ink-dim)", lineHeight: 1.5, margin: "0 0 16px" }}>
            The CTO needs these decisions to scope the plan. Answer what you can - each
            one carries the reasoning, so you are steering, not guessing. Your answers
            drive the spec, the architecture, and the roadmap.
          </p>

          <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {questions.map((q, i) => {
              const value = answers[q.id] ?? "";
              const answered = value.trim().length > 0;
              return (
                <li
                  key={q.id}
                  style={{
                    background: "var(--s-slab-2)",
                    border: "1px solid var(--s-line)",
                    borderRadius: 8,
                    padding: "14px 16px",
                    marginBottom: 12,
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: 2,
                      background: answered ? "var(--s-ok-ink)" : "var(--s-line)",
                      transition: "background 200ms",
                    }}
                  />
                  <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                    <span
                      style={{
                        fontSize: 12,
                        fontFamily: "ui-monospace, monospace",
                        color: answered ? "var(--s-ok-ink)" : "var(--s-ink-faint)",
                        minWidth: 20,
                      }}
                    >
                      {answered ? "ok" : `0${i + 1}`.slice(-2)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.35 }}>
                        {q.question}
                      </div>
                      <div
                        style={{
                          marginTop: 7,
                          paddingLeft: 11,
                          borderLeft: "2px solid var(--s-soft)",
                          fontSize: 12.5,
                          lineHeight: 1.5,
                          color: "var(--s-ink-dim)",
                        }}
                      >
                        <span style={{ color: "var(--s-soft-ink)", fontWeight: 500 }}>Why it matters. </span>
                        {q.why}
                      </div>

                      {q.kind === "choice" && q.options.length > 0 ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 12 }}>
                          {q.options.map((opt) => {
                            const active = value === opt;
                            return (
                              <button
                                key={opt}
                                onClick={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}
                                style={{
                                  padding: "6px 12px",
                                  borderRadius: 7,
                                  fontSize: 13,
                                  cursor: "pointer",
                                  border: `1px solid ${active ? "var(--s-accent)" : "var(--s-line)"}`,
                                  background: active ? "var(--s-soft)" : "var(--s-slab)",
                                  color: active ? "var(--s-soft-ink)" : "var(--s-slab-ink)",
                                }}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <input
                          value={value}
                          onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                          placeholder="Your answer"
                          style={{
                            width: "100%",
                            marginTop: 12,
                            background: "var(--s-slab)",
                            color: "var(--s-slab-ink)",
                            border: "1px solid var(--s-line)",
                            borderRadius: 7,
                            padding: "8px 11px",
                            fontSize: 13.5,
                            outline: "none",
                          }}
                        />
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Readiness rail */}
        <aside style={{ alignSelf: "start", position: "sticky", top: 12 }}>
          <div
            style={{
              border: "1px solid var(--s-line)",
              borderRadius: 10,
              background: "var(--s-glass-2)",
              padding: "14px 14px 16px",
            }}
          >
            <div style={{ fontSize: 11.5, color: "var(--s-ink-dim)", fontWeight: 600 }}>Readiness</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
              <span style={{ fontSize: 30, fontWeight: 800, lineHeight: 1 }}>{answeredCount}</span>
              <span style={{ fontSize: 12.5, color: "var(--s-ink-faint)" }}>/ {questions.length} answered</span>
            </div>
            <div style={{ height: 1, background: "var(--s-line)", margin: "12px 0" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {questions.map((q) => {
                const answered = (answers[q.id] ?? "").trim().length > 0;
                return (
                  <div key={q.id} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12 }}>
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 7,
                        background: answered ? "var(--s-ok-ink)" : "transparent",
                        border: `1.5px solid ${answered ? "var(--s-ok-ink)" : "var(--s-ink-faint)"}`,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ color: answered ? "var(--s-ink)" : "var(--s-ink-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {q.id}
                    </span>
                  </div>
                );
              })}
            </div>
            {error ? (
              <div style={{ color: "var(--s-warn-ink)", fontSize: 12, marginTop: 12 }}>{error}</div>
            ) : null}
            <button
              onClick={() => void submit()}
              disabled={busy || answeredCount === 0}
              style={{
                width: "100%",
                marginTop: 14,
                padding: "9px 12px",
                borderRadius: 8,
                fontSize: 13.5,
                fontWeight: 600,
                cursor: busy || answeredCount === 0 ? "default" : "pointer",
                border: "1px solid var(--s-accent)",
                background: answeredCount === 0 ? "var(--s-slab-2)" : "var(--s-accent)",
                color: answeredCount === 0 ? "var(--s-ink-faint)" : "var(--s-on-accent)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              {busy ? "Shaping..." : "Shape it"}
              <ArrowRight size={15} />
            </button>
            <div style={{ fontSize: 11, color: "var(--s-ink-faint)", marginTop: 8, lineHeight: 1.45 }}>
              Submitting launches the shaping run (read-only). No code is written - the
              plan is a draft you approve before anything builds.
            </div>
          </div>
        </aside>
      </div>
      <style>{`@media (max-width: 880px){ .run-gap-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </section>
  );
}

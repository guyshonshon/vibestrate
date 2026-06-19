import { useEffect, useState } from "react";
import { Compass, ArrowRight, ListChecks } from "lucide-react";
import { api } from "../../lib/api.js";
import type { ShapeQuestion } from "../../lib/types.js";
import { Button } from "../../components/design/Button.js";
import MissionTreeProposal from "../../components/shape/proposals/MissionTreeProposal.js";
import GraphCanvasProposal from "../../components/shape/proposals/GraphCanvasProposal.js";
import GuidedDocProposal from "../../components/shape/proposals/GuidedDocProposal.js";

const PROPOSALS = [
  { id: "mission-tree", label: "A · Mission Tree", Component: MissionTreeProposal },
  { id: "graph-canvas", label: "B · Graph Canvas", Component: GraphCanvasProposal },
  { id: "guided-doc", label: "C · Guided Document", Component: GuidedDocProposal },
] as const;

/**
 * The Shape phase surface (docs/design/shape-phase.md): start the CTO planning
 * chain from a brief, and answer the intake run's gap questions to launch the
 * shaping run. Read-only by construction (every link is a no-diff run). The
 * polished spec-entry / live node-tree design is being chosen from the run-control
 * proposals; this is the functional surface that drives the real chain.
 */
export function ShapePage({
  runId,
  onOpenRun,
  onOpenIntake,
}: {
  runId: string | null;
  onOpenRun: (runId: string) => void;
  onOpenIntake: (runId: string) => void;
}) {
  const [view, setView] = useState<"start" | "concepts">("start");
  if (runId) {
    return <AnswerQuestions runId={runId} onOpenRun={onOpenRun} />;
  }
  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 6,
          padding: "14px 20px 0",
          maxWidth: view === "concepts" ? "none" : 760,
          margin: "0 auto",
        }}
      >
        {(["start", "concepts"] as const).map((v) => {
          const active = view === v;
          return (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: "7px 13px",
                borderRadius: 9,
                fontSize: 13.5,
                fontWeight: 600,
                cursor: "pointer",
                border: `1px solid ${active ? "var(--s-accent)" : "var(--s-line)"}`,
                background: active ? "var(--s-soft)" : "transparent",
                color: active ? "var(--s-soft-ink)" : "var(--s-ink-dim)",
              }}
            >
              {v === "start" ? "Start a plan" : "Run-control concepts (3)"}
            </button>
          );
        })}
      </div>
      {view === "start" ? (
        <StartShaping onOpenIntake={onOpenIntake} />
      ) : (
        <ProposalGallery />
      )}
    </div>
  );
}

// Three run-control UI directions for the spec-entry + live node-tree task view,
// for you to evaluate and pick (then the winner gets wired into the composer).
function ProposalGallery() {
  const [pick, setPick] = useState<(typeof PROPOSALS)[number]["id"]>("mission-tree");
  const Active = PROPOSALS.find((p) => p.id === pick)?.Component ?? MissionTreeProposal;
  return (
    <div style={{ padding: "14px 20px 28px", color: "var(--s-ink)" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {PROPOSALS.map((p) => {
          const active = p.id === pick;
          return (
            <button
              key={p.id}
              onClick={() => setPick(p.id)}
              style={{
                padding: "8px 14px",
                borderRadius: 9,
                fontSize: 13.5,
                fontWeight: 600,
                cursor: "pointer",
                border: `1px solid ${active ? "var(--s-accent)" : "var(--s-line)"}`,
                background: active ? "var(--s-soft)" : "var(--s-slab-2)",
                color: active ? "var(--s-soft-ink)" : "var(--s-slab-ink)",
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div
        style={{
          border: "1px solid var(--s-line)",
          borderRadius: 14,
          overflow: "hidden",
          background: "var(--s-bg)",
        }}
      >
        <Active />
      </div>
    </div>
  );
}

const card: React.CSSProperties = {
  background: "var(--s-slab)",
  color: "var(--s-slab-ink)",
  border: "1px solid var(--s-line)",
  borderRadius: 14,
  padding: 20,
};

function StartShaping({ onOpenIntake }: { onOpenIntake: (runId: string) => void }) {
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!brief.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { runId } = await api.startShapeIntake({ task: brief.trim() });
      onOpenIntake(runId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 20px", color: "var(--s-ink)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <Compass size={20} style={{ color: "var(--s-accent-bright)" }} />
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Plan as a CTO</h1>
      </div>
      <p style={{ color: "var(--s-ink-dim)", margin: "0 0 18px", lineHeight: 1.5 }}>
        Describe what you want to build. The CTO surfaces the unstated decisions
        (sign-in, payments, scale, data), asks you the gap questions, then drafts
        a spec, an architecture, the risks, and a reviewable roadmap. Nothing is
        written to your code - every step is read-only.
      </p>
      <div style={card}>
        <label style={{ display: "block", fontSize: 13, color: "var(--s-ink-dim)", marginBottom: 8 }}>
          Your brief
        </label>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="e.g. a mini ecommerce store for handmade candles"
          rows={4}
          style={{
            width: "100%",
            background: "var(--s-slab-2)",
            color: "var(--s-slab-ink)",
            border: "1px solid var(--s-line)",
            borderRadius: 10,
            padding: "12px 14px",
            fontSize: 15,
            resize: "vertical",
            outline: "none",
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void start();
          }}
        />
        {error ? (
          <div style={{ color: "var(--s-warn-ink)", fontSize: 13, marginTop: 10 }}>{error}</div>
        ) : null}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <Button onClick={() => void start()} disabled={!brief.trim() || busy}>
            {busy ? "Starting..." : "Start shaping"}
            <ArrowRight size={15} style={{ marginLeft: 6 }} />
          </Button>
        </div>
      </div>
    </div>
  );
}

function AnswerQuestions({
  runId,
  onOpenRun,
}: {
  runId: string;
  onOpenRun: (runId: string) => void;
}) {
  const [questions, setQuestions] = useState<ShapeQuestion[] | null | "loading">("loading");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // After answers are submitted the shape run is launched; the user reviews it
  // and then approves -> the roadmap run. Held here so the whole chain is
  // reachable from this surface.
  const [shaped, setShaped] = useState<{ shapeRunId: string; roadmapRunId: string | null } | null>(
    null,
  );

  useEffect(() => {
    let live = true;
    setQuestions("loading");
    // The intake run emits its questions artifact asynchronously; poll briefly.
    let tries = 0;
    const tick = async () => {
      try {
        const r = await api.getShapeQuestions(runId);
        if (!live) return;
        if (r.questions && r.questions.length > 0) {
          setQuestions(r.questions);
          return;
        }
      } catch {
        /* keep polling */
      }
      tries += 1;
      if (live && tries < 30) setTimeout(() => void tick(), 2000);
      else if (live) setQuestions(null);
    };
    void tick();
    return () => {
      live = false;
    };
  }, [runId]);

  async function submit() {
    if (questions === "loading" || !questions || busy) return;
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
      setShaped({ shapeRunId, roadmapRunId: null });
      setBusy(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  async function approve() {
    if (!shaped || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { runId: roadmapRunId } = await api.approveShapeRoadmap(shaped.shapeRunId);
      setShaped({ ...shaped, roadmapRunId });
      setBusy(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  if (shaped) {
    return (
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 20px", color: "var(--s-ink)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <ListChecks size={20} style={{ color: "var(--s-accent-bright)" }} />
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Shaping run launched</h1>
        </div>
        <p style={{ color: "var(--s-ink-dim)", margin: "0 0 18px", lineHeight: 1.5 }}>
          The CTO is drafting the scope, spec, architecture, and risks. Open the
          run to review the draft. When you are happy with it, approve to
          synthesize the roadmap.
        </p>
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 13, color: "var(--s-ink-dim)" }}>
            Shape run: <span style={{ color: "var(--s-ink)", fontWeight: 600 }}>{shaped.shapeRunId}</span>
          </div>
          {error ? (
            <div style={{ color: "var(--s-warn-ink)", fontSize: 13 }}>{error}</div>
          ) : null}
          <div style={{ display: "flex", gap: 10 }}>
            <Button variant="ghost" onClick={() => onOpenRun(shaped.shapeRunId)}>
              Open run to review
            </Button>
            {shaped.roadmapRunId ? (
              <Button onClick={() => onOpenRun(shaped.roadmapRunId!)}>
                Open roadmap run
                <ArrowRight size={15} style={{ marginLeft: 6 }} />
              </Button>
            ) : (
              <Button onClick={() => void approve()} disabled={busy}>
                {busy ? "Launching roadmap..." : "Approve & generate roadmap"}
                <ArrowRight size={15} style={{ marginLeft: 6 }} />
              </Button>
            )}
          </div>
          {shaped.roadmapRunId ? (
            <div style={{ fontSize: 12.5, color: "var(--s-ink-faint)" }}>
              Roadmap run {shaped.roadmapRunId} launched. When it finishes, turn it
              into board cards from the proposals surface (or `vibe shape roadmap{" "}
              {shaped.roadmapRunId}`).
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 20px", color: "var(--s-ink)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <ListChecks size={20} style={{ color: "var(--s-accent-bright)" }} />
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Scope the work</h1>
      </div>
      <p style={{ color: "var(--s-ink-dim)", margin: "0 0 18px", lineHeight: 1.5 }}>
        The CTO needs these decisions to scope the plan. Answer what you can - your
        answers steer the spec, the architecture, and the roadmap.
      </p>

      {questions === "loading" ? (
        <div style={{ ...card, color: "var(--s-ink-dim)" }}>
          Waiting for the intake run to surface its questions...
        </div>
      ) : !questions ? (
        <div style={{ ...card, color: "var(--s-ink-dim)" }}>
          No questions for this run yet. If the intake run is still working, give
          it a moment and refresh.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {questions.map((q) => (
            <div key={q.id} style={card}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{q.question}</div>
              <div style={{ fontSize: 13, color: "var(--s-ink-faint)", margin: "4px 0 12px" }}>
                {q.why}
              </div>
              {q.kind === "choice" && q.options.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {q.options.map((opt) => {
                    const active = answers[q.id] === opt;
                    return (
                      <button
                        key={opt}
                        onClick={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}
                        style={{
                          padding: "7px 12px",
                          borderRadius: 8,
                          fontSize: 13.5,
                          cursor: "pointer",
                          border: `1px solid ${active ? "var(--s-accent)" : "var(--s-line)"}`,
                          background: active ? "var(--s-soft)" : "var(--s-slab-2)",
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
                  value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  placeholder="Your answer"
                  style={{
                    width: "100%",
                    background: "var(--s-slab-2)",
                    color: "var(--s-slab-ink)",
                    border: "1px solid var(--s-line)",
                    borderRadius: 8,
                    padding: "9px 12px",
                    fontSize: 14,
                    outline: "none",
                  }}
                />
              )}
            </div>
          ))}
          {error ? (
            <div style={{ color: "var(--s-warn-ink)", fontSize: 13 }}>{error}</div>
          ) : null}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button onClick={() => void submit()} disabled={busy}>
              {busy ? "Launching shaping run..." : "Shape it"}
              <ArrowRight size={15} style={{ marginLeft: 6 }} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

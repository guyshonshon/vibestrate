import { useState } from "react";
import { ArrowRight, ClipboardList, GitBranch } from "lucide-react";
import { api } from "../../lib/api.js";
import type { RunState } from "../../lib/types.js";

// ── In-run Spec-up chain actions ───────────────────────────────────────────────
// The spec-up chain advances by human steps. The intake run's gap-questions are
// handled by RunGapQuestions; this is the terminal links, surfaced on the run
// they belong to so the whole chain is advanceable from the run view (UI<->CLI
// parity with `vibe spec-up build` / `vibe spec-up approve` / `vibe spec-up roadmap`):
//   - a completed `spec-up` run         -> "Approve & build" (run the chosen
//        flow seeded with the approved spec) OR "Approve & generate roadmap"
//   - a completed `spec-up-roadmap` run -> "Create board cards"
// All reuse the already-gated spec-up endpoints; nothing spawns a command.

const TERMINAL = new Set([
  "merge_ready",
  "blocked",
  "failed",
  "aborted",
  "done",
  "completed",
]);

export function SpecUpRunActions({
  runId,
  run,
  onOpenRun,
  onOpenProposal,
}: {
  runId: string;
  run: RunState;
  onOpenRun: (runId: string) => void;
  onOpenProposal: (proposalId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const flowId = run.flow?.flowId;
  if (flowId !== "spec-up" && flowId !== "spec-up-roadmap") return null;
  if (!TERMINAL.has(run.status)) return null;

  const blocked = run.status === "blocked" || run.status === "failed";

  async function approveRoadmap() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { runId: roadmapRunId } = await api.approveSpecUpRoadmap(runId);
      onOpenRun(roadmapRunId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  async function createCards() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { proposalId } = await api.createSpecUpRoadmapProposal(runId);
      onOpenProposal(proposalId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  async function buildNow() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { runId: buildRunId } = await api.buildSpecUp(runId);
      onOpenRun(buildRunId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  const isSpecUp = flowId === "spec-up";
  const title = isSpecUp ? "Spec-up draft ready" : "Roadmap synthesized";
  const body = isSpecUp
    ? blocked
      ? "The reviewer flagged gaps (see the verdict). Re-run spec-up to address them, or approve as-is to build / synthesize a roadmap."
      : "Review the spec, architecture, and risks below. When the scope is right, approve to build it with the chosen flow - or synthesize a roadmap first."
    : "The roadmap is ready as a proposal. Turn it into dependency-ordered board cards you can review and accept.";

  return (
    <section
      style={{
        border: "1px solid var(--s-line)",
        borderRadius: 14,
        background: "var(--s-slab)",
        padding: "16px 18px",
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}
    >
      <span
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--s-soft)",
          color: "var(--s-soft-ink)",
          flexShrink: 0,
        }}
      >
        {isSpecUp ? <GitBranch size={18} /> : <ClipboardList size={18} />}
      </span>
      <div style={{ flex: 1, minWidth: 0, color: "var(--s-ink)" }}>
        <div style={{ fontSize: 14.5, fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 12.5, color: "var(--s-ink-dim)", marginTop: 2, lineHeight: 1.45 }}>
          {body}
        </div>
        {error ? (
          <div style={{ fontSize: 12, color: "var(--s-warn-ink)", marginTop: 6 }}>{error}</div>
        ) : null}
      </div>
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
        {isSpecUp ? (
          <button
            onClick={() => void approveRoadmap()}
            disabled={busy}
            style={{
              padding: "9px 13px",
              borderRadius: 9,
              fontSize: 13,
              fontWeight: 600,
              cursor: busy ? "default" : "pointer",
              border: "1px solid var(--s-line)",
              background: "var(--s-slab-2)",
              color: busy ? "var(--s-ink-faint)" : "var(--s-ink)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <ClipboardList size={14} />
            Generate roadmap
          </button>
        ) : null}
        <button
          onClick={() => void (isSpecUp ? buildNow() : createCards())}
          disabled={busy}
          style={{
            padding: "9px 14px",
            borderRadius: 9,
            fontSize: 13.5,
            fontWeight: 600,
            cursor: busy ? "default" : "pointer",
            border: "1px solid var(--s-accent)",
            background: busy ? "var(--s-slab-2)" : "var(--s-accent)",
            color: busy ? "var(--s-ink-faint)" : "var(--s-on-accent)",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {busy
            ? isSpecUp
              ? "Launching build..."
              : "Creating cards..."
            : isSpecUp
              ? "Approve & build"
              : "Create board cards"}
          <ArrowRight size={15} />
        </button>
      </div>
    </section>
  );
}

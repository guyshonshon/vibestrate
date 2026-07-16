import { useState } from "react";
import { ArrowRight, ClipboardList, GitBranch } from "lucide-react";
import { api } from "../../lib/api.js";
import type { RunState } from "../../lib/types.js";
import { Button } from "../design/Button.js";

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
    <section className="flex items-center gap-4 rounded-[16px] border border-[color:var(--line)] bg-coal-600 p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-violet-soft/12 text-violet-soft">
        {isSpecUp ? (
          <GitBranch className="h-[18px] w-[18px]" strokeWidth={1.9} aria-hidden />
        ) : (
          <ClipboardList className="h-[18px] w-[18px]" strokeWidth={1.9} aria-hidden />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-bold text-chalk-100">{title}</div>
        <div className="mt-0.5 text-[12.5px] leading-relaxed text-chalk-300">{body}</div>
        {error ? (
          <div className="mt-1.5 text-[12px] text-amber-soft">{error}</div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {isSpecUp ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void approveRoadmap()}
            disabled={busy}
            iconLeft={<ClipboardList className="h-3.5 w-3.5" strokeWidth={1.9} />}
          >
            Generate roadmap
          </Button>
        ) : null}
        <Button
          variant="primary"
          size="sm"
          onClick={() => void (isSpecUp ? buildNow() : createCards())}
          disabled={busy}
          iconRight={<ArrowRight className="h-4 w-4" strokeWidth={1.9} />}
        >
          {busy
            ? isSpecUp
              ? "Launching build..."
              : "Creating cards..."
            : isSpecUp
              ? "Approve & build"
              : "Create board cards"}
        </Button>
      </div>
    </section>
  );
}

import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import type { FlowRunState } from "../../lib/types.js";
import {
  parseReviewOutput,
  type ParsedReviewOutput,
} from "../../../flows/runtime/review-findings.js";
import { Scale, X } from "lucide-react";

const DECISION_TONE: Record<string, string> = {
  APPROVED: "border-emerald-400/30 bg-emerald-500/10 text-emerald-400",
  CHANGES_REQUESTED: "border-amber-soft/30 bg-amber-soft/10 text-amber-soft",
  BLOCKED: "border-rose-400/30 bg-rose-500/10 text-rose-300",
};

const SEVERITY_TONE: Record<string, string> = {
  high: "text-rose-300",
  medium: "text-amber-soft",
  low: "text-chalk-300",
};

/** Resolve the artifact path of the run's latest review output. The flow
 *  snapshot is authoritative (review steps stamp outputArtifactPath); the
 *  artifacts list is the fallback for older runs / custom flows. */
export function findReviewArtifactPath(
  flow: FlowRunState | null | undefined,
  artifacts: { path: string }[],
): string | null {
  const reviewSteps = (flow?.steps ?? []).filter(
    (s) => s.stage === "reviewing" && s.outputArtifactPath,
  );
  const last = reviewSteps[reviewSteps.length - 1];
  if (last?.outputArtifactPath) return last.outputArtifactPath;
  // Step ids vary ("review", "implementation-review", "second-review") -
  // match any step dir containing "review" (real runs use all three shapes).
  const candidates = artifacts.filter((a) =>
    /(^|\/)[^/]*review[^/]*\/output\.md$/.test(a.path),
  );
  return candidates.length ? candidates[candidates.length - 1]!.path : null;
}

export function ReviewFindingsPanel({
  runId,
  flow,
  onClose,
  onRerunWithFixes,
}: {
  runId: string;
  flow: FlowRunState | null | undefined;
  onClose: () => void;
  onRerunWithFixes?: () => void;
}) {
  const [raw, setRaw] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  // Key the effect on the resolved path, not the flow object - the page
  // re-fetches run state on a poll, and a fresh object identity must not
  // re-download the artifact.
  const flowPath = findReviewArtifactPath(flow, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        let path = flowPath;
        if (!path) {
          const list = await api.listArtifacts(runId).catch(() => []);
          path = findReviewArtifactPath(null, list);
        }
        if (!path) {
          if (!cancelled) setMissing(true);
          return;
        }
        const text = await api.readArtifact(runId, path);
        if (!cancelled) {
          setRaw(text);
          setMissing(false);
          setError(null);
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [runId, flowPath]);

  const parsed: ParsedReviewOutput | null = useMemo(
    () => (raw === null ? null : parseReviewOutput(raw)),
    [raw],
  );

  return (
    <section
      className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 px-5 py-4"
      data-screen-label="01c Review findings"
    >
      <div className="flex items-start gap-3">
        <Scale className="mt-0.5 h-4 w-4 shrink-0 text-chalk-400" strokeWidth={1.9} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-semibold text-chalk-100">Review findings</h2>
            {parsed?.decision ? (
              <span
                className={`rounded-[8px] border px-2 py-0.5 text-[11px] font-medium ${
                  DECISION_TONE[parsed.decision] ?? DECISION_TONE.BLOCKED
                }`}
              >
                {parsed.decision.replace(/_/g, " ")}
              </span>
            ) : null}
            <span className="flex-1" />
            {onRerunWithFixes ? (
              <button
                type="button"
                onClick={onRerunWithFixes}
                className="rounded-[10px] bg-violet-soft px-3 py-1.5 text-[12.5px] font-bold text-coal-900 transition hover:bg-violet-soft/90"
              >
                Re-run with fixes
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close review findings"
              className="rounded-[10px] border border-[color:var(--line-strong)] p-1 text-chalk-300 transition hover:text-chalk-100"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.9} />
            </button>
          </div>

          {error ? (
            <p className="mt-2 text-[12.5px] text-rose-300">{error}</p>
          ) : missing ? (
            <p className="mt-2 text-[12.5px] text-chalk-400">
              No review output artifact was found for this run - the review
              step may not have run. The Events tab has the full timeline.
            </p>
          ) : raw === null ? (
            <p className="mt-2 text-[12.5px] text-chalk-400">Loading review…</p>
          ) : (
            <>
              {parsed && parsed.structured ? (
                <ul className="mt-2.5 space-y-1.5">
                  {parsed.findings.map((f, i) => (
                    <li key={i} className="text-[12.5px] leading-snug">
                      <span
                        className={`mono mr-2 text-[11px] font-medium ${
                          SEVERITY_TONE[f.severity ?? ""] ?? "text-chalk-400"
                        }`}
                      >
                        {f.severity ?? "note"}
                      </span>
                      <span className="text-chalk-100">{f.title}</span>
                      {f.file ? (
                        <span className="mono ml-2 text-[11px] text-chalk-400">
                          {f.file}
                        </span>
                      ) : null}
                      {f.detail ? (
                        <p className="mt-0.5 text-[12px] text-chalk-300">{f.detail}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[11.5px] text-chalk-400">
                  No structured findings block - showing the reviewer's full
                  output below.
                </p>
              )}
              {parsed && parsed.structured ? (
                <button
                  type="button"
                  onClick={() => setShowRaw((v) => !v)}
                  className="mt-2 text-[11.5px] font-semibold text-violet-soft transition hover:text-violet-soft/80"
                >
                  {showRaw ? "Hide full review output" : "Show full review output"}
                </button>
              ) : null}
              {!parsed?.structured || showRaw ? (
                <pre className="mt-2 max-h-[360px] overflow-auto whitespace-pre-wrap rounded-[14px] border border-[color:var(--line)] bg-coal-800 p-3 text-[12px] leading-relaxed text-chalk-300">
                  {raw}
                </pre>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

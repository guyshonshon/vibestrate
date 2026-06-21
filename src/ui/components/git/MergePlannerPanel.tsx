/**
 * MergePlannerPanel - branch picker + predict + apply + undo.
 *
 * Flow:
 *   pick source + target -> Predict -> show result
 *     clean -> Apply merge button
 *     conflicts -> ConflictResolver
 *   Undo last merge affordance (calls undoGitMerge on current target)
 */
import { useState } from "react";
import { AlertTriangle, CheckCircle2, GitMerge, RotateCcw } from "lucide-react";
import { api } from "../../lib/api.js";
import type {
  GitBranchHead,
  GitMergePrediction,
  GitApplyResult,
  GitUndoResult,
} from "../../lib/types.js";
import { Chip } from "../design/Chip.js";
import { cn } from "../design/cn.js";
import { ConflictResolver } from "./ConflictResolver.js";

type Props = {
  branchHeads: GitBranchHead[];
  source: string | null;
  target: string | null;
  onSourceChange: (name: string | null) => void;
  onTargetChange: (name: string | null) => void;
  onMergeApplied: () => void;
};

export function MergePlannerPanel({
  branchHeads,
  source,
  target,
  onSourceChange,
  onTargetChange,
  onMergeApplied,
}: Props) {
  const [prediction, setPrediction] = useState<GitMergePrediction | null>(null);
  const [predicting, setPredicting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<GitApplyResult | null>(null);
  const [undoResult, setUndoResult] = useState<GitUndoResult | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetPrediction() {
    setPrediction(null);
    setApplyResult(null);
    setUndoResult(null);
    setError(null);
  }

  async function predict() {
    if (!source || !target) return;
    setPredicting(true);
    resetPrediction();
    try {
      const p = await api.predictGitMerge(source, target);
      setPrediction(p);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.includes("403") ? "Not authorised - no API token configured." : msg);
    } finally {
      setPredicting(false);
    }
  }

  async function applyMerge() {
    if (!source || !target) return;
    if (!window.confirm(`Merge "${source}" into "${target}"? This will modify the target branch.`)) return;
    setApplying(true);
    setError(null);
    try {
      const result = await api.applyGitMerge(source, target);
      setApplyResult(result);
      onMergeApplied();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.includes("403") ? "Not authorised - no API token configured." : msg);
    } finally {
      setApplying(false);
    }
  }

  async function undoMerge() {
    if (!target) return;
    if (!window.confirm(`Undo the last merge on "${target}"? This resets the branch to its pre-merge state.`)) return;
    setUndoing(true);
    setError(null);
    setUndoResult(null);
    try {
      const result = await api.undoGitMerge(target);
      setUndoResult(result);
      if (result.undone) {
        onMergeApplied();
        resetPrediction();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.includes("403") ? "Not authorised - no API token configured." : msg);
    } finally {
      setUndoing(false);
    }
  }

  const canPredict = !!source && !!target && source !== target;

  return (
    <div className="space-y-4">
      <div className="text-[13px] font-medium text-fog-100">Merge planner</div>

      {/* Branch selectors */}
      <div className="grid grid-cols-2 gap-2">
        <BranchSelect
          label="source"
          value={source}
          options={branchHeads}
          onChange={(v) => { onSourceChange(v); resetPrediction(); }}
          exclude={target}
        />
        <BranchSelect
          label="target"
          value={target}
          options={branchHeads}
          onChange={(v) => { onTargetChange(v); resetPrediction(); }}
          exclude={source}
        />
      </div>

      {/* Predict button */}
      <button
        type="button"
        onClick={() => void predict()}
        disabled={!canPredict || predicting}
        className="h-8 px-3 border border-white/10 bg-ink-200 hover:bg-ink-100 text-[12px] text-fog-200 flex items-center gap-1.5 disabled:opacity-40"
      >
        <GitMerge className="h-3.5 w-3.5" strokeWidth={1.6} />
        {predicting ? "Predicting…" : "Predict merge"}
      </button>

      {/* Prediction result */}
      {prediction ? (
        <PredictionResult
          prediction={prediction}
          applyResult={applyResult}
          applying={applying}
          onApply={() => void applyMerge()}
          onApplied={(r) => {
            setApplyResult(r);
            onMergeApplied();
          }}
        />
      ) : null}

      {/* Undo */}
      {target ? (
        <div className="border-t border-white/[0.06] pt-3 space-y-2">
          <div className="text-[11.5px] text-fog-500">Undo last merge on target branch</div>
          <button
            type="button"
            onClick={() => void undoMerge()}
            disabled={undoing || !target}
            className="h-7 px-2.5 border border-white/10 bg-ink-200 hover:bg-ink-100 text-[11.5px] text-fog-300 flex items-center gap-1.5 disabled:opacity-40"
          >
            <RotateCcw className="h-3 w-3" strokeWidth={1.6} />
            {undoing ? "Undoing…" : `Undo merge on "${target}"`}
          </button>
          {undoResult ? (
            undoResult.undone ? (
              <div className="flex items-center gap-2 border border-emerald-400/30 bg-emerald-500/5 px-3 py-1.5 text-[12px] text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.7} />
                Undone. Reverted to <span className="mono">{undoResult.preSha.slice(0, 8)}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 border border-amber-400/30 bg-amber-500/5 px-3 py-1.5 text-[12px] text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.7} />
                {undoResult.reason}
              </div>
            )
          ) : null}
        </div>
      ) : null}

      {/* Error */}
      {error ? (
        <div className="flex items-start gap-2 border border-rose-400/30 bg-rose-500/5 px-3 py-2 text-[12px] text-rose-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" strokeWidth={1.7} />
          {error}
        </div>
      ) : null}
    </div>
  );
}

function BranchSelect({
  label,
  value,
  options,
  onChange,
  exclude,
}: {
  label: string;
  value: string | null;
  options: GitBranchHead[];
  onChange: (v: string | null) => void;
  exclude: string | null;
}) {
  return (
    <div>
      <div className="text-[10.5px] text-fog-500 mb-1">{label}</div>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full h-8 px-2 text-[12px] mono text-fog-100 bg-ink-200 border border-white/10 focus:outline-none focus:border-violet-soft/40"
      >
        <option value="">-- pick a branch --</option>
        {options
          .filter((b) => b.name !== exclude)
          .map((b) => (
            <option key={b.name} value={b.name}>
              {b.name}{b.isMain ? " (main)" : ""}
            </option>
          ))}
      </select>
    </div>
  );
}

function PredictionResult({
  prediction,
  applyResult,
  applying,
  onApply,
  onApplied,
}: {
  prediction: GitMergePrediction;
  applyResult: GitApplyResult | null;
  applying: boolean;
  onApply: () => void;
  onApplied: (r: GitApplyResult) => void;
}) {
  if (prediction.alreadyUpToDate) {
    return (
      <div className="flex items-center gap-2 border border-white/[0.07] bg-ink-200 px-3 py-2 text-[12.5px] text-fog-300">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-300" strokeWidth={1.7} />
        Already up to date - nothing to merge.
      </div>
    );
  }

  if (prediction.clean) {
    return (
      <div className="space-y-2 border border-emerald-400/20 bg-emerald-500/5 px-3 py-3">
        <div className="flex items-center gap-2 text-[12.5px] text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.7} />
          Clean merge - no conflicts predicted.
        </div>
        {applyResult ? (
          <div className="text-[11.5px] text-emerald-300/80">
            Merged. New commit: <span className="mono">{applyResult.mergedSha.slice(0, 8)}</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={onApply}
            disabled={applying}
            className="h-8 px-3 border border-emerald-400/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-[12px] text-emerald-300 flex items-center gap-1.5 disabled:opacity-50"
          >
            <GitMerge className="h-3.5 w-3.5" strokeWidth={1.6} />
            {applying ? "Applying…" : `Apply merge`}
          </button>
        )}
        {prediction.note ? (
          <div className="text-[10.5px] text-fog-500">{prediction.note}</div>
        ) : null}
      </div>
    );
  }

  // Conflicts
  return (
    <div className="space-y-3 border border-rose-400/20 bg-rose-500/5 px-3 py-3">
      <div className="flex items-center gap-2 text-[12.5px] text-rose-300">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.7} />
        {prediction.conflictedFiles.length} conflicted file{prediction.conflictedFiles.length === 1 ? "" : "s"}
      </div>
      {prediction.note ? (
        <div className="text-[10.5px] text-fog-500">{prediction.note}</div>
      ) : null}
      <ConflictResolver
        source={prediction.source}
        target={prediction.target}
        conflictedFiles={prediction.conflictedFiles}
        onApplied={onApplied}
      />
    </div>
  );
}

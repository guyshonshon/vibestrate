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
import { Button } from "../design/Button.js";
import { Select } from "../design/Select.js";
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
  const predictHint =
    !source || !target
      ? "Pick a source and target branch to predict a merge."
      : source === target
        ? "Pick two different branches to merge."
        : null;

  return (
    <div className="space-y-4">
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
      <div className="space-y-1.5">
        <Button
          variant="primary"
          size="sm"
          onClick={() => void predict()}
          disabled={!canPredict || predicting}
          iconLeft={<GitMerge className="h-3.5 w-3.5" strokeWidth={1.9} />}
          className="w-full"
        >
          {predicting ? "Predicting" : "Predict merge"}
        </Button>
        {predictHint ? (
          <div className="text-[11.5px] text-chalk-300">{predictHint}</div>
        ) : null}
      </div>

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
        <div className="space-y-2 border-t border-[color:var(--line-soft)] pt-3">
          <div className="text-[11.5px] font-semibold text-violet-soft">
            Undo last merge on target
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void undoMerge()}
            disabled={undoing || !target}
            iconLeft={<RotateCcw className="h-3 w-3" strokeWidth={1.9} />}
          >
            {undoing ? "Undoing" : `Undo merge on "${target}"`}
          </Button>
          {undoResult ? (
            undoResult.undone ? (
              <div className="flex items-center gap-2 rounded-[10px] border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-[12px] text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.9} />
                <span>
                  Undone. Reverted to{" "}
                  <span className="mono">{undoResult.preSha.slice(0, 8)}</span>
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-[10px] border border-amber-soft/30 bg-amber-soft/10 px-3 py-1.5 text-[12px] text-amber-soft">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.9} />
                {undoResult.reason}
              </div>
            )
          ) : null}
        </div>
      ) : null}

      {/* Error */}
      {error ? (
        <div className="flex items-start gap-2 rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.9} />
          <span>{error} - adjust the branches or retry the prediction.</span>
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
  const selectOptions = options
    .filter((b) => b.name !== exclude)
    .map((b) => ({
      value: b.name,
      label: b.name,
      hint: b.isMain ? "main" : undefined,
    }));
  return (
    <div>
      <div className="mb-1 text-[10.5px] font-semibold text-violet-soft">{label}</div>
      <Select
        ariaLabel={label}
        value={value ?? ""}
        onChange={(v) => onChange(v || null)}
        options={selectOptions}
        placeholder="pick a branch"
        className="w-full"
      />
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
      <div className="flex items-center gap-2 rounded-[12px] border border-[color:var(--line)] bg-coal-500/60 px-3 py-2.5 text-[12.5px] text-chalk-300">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" strokeWidth={1.9} />
        Already up to date - nothing to merge.
      </div>
    );
  }

  if (prediction.clean) {
    return (
      <div className="space-y-2.5 rounded-[12px] border border-emerald-400/25 bg-emerald-500/10 px-3 py-3">
        <div className="flex items-center gap-2 text-[12.5px] font-semibold text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.9} />
          Clean merge - no conflicts predicted.
        </div>
        {applyResult ? (
          <div className="text-[11.5px] text-emerald-400/90">
            Merged. New commit:{" "}
            <span className="mono">{applyResult.mergedSha.slice(0, 8)}</span>
          </div>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={onApply}
            disabled={applying}
            iconLeft={<GitMerge className="h-3.5 w-3.5" strokeWidth={1.9} />}
          >
            {applying ? "Applying" : "Apply merge"}
          </Button>
        )}
        {prediction.note ? (
          <div className="text-[10.5px] text-chalk-300">{prediction.note}</div>
        ) : null}
      </div>
    );
  }

  // Conflicts
  return (
    <div className="space-y-3 rounded-[12px] border border-rose-400/25 bg-rose-500/10 px-3 py-3">
      <div className="flex items-center gap-2 text-[12.5px] font-semibold text-rose-300">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.9} />
        {prediction.conflictedFiles.length} conflicted file
        {prediction.conflictedFiles.length === 1 ? "" : "s"} - resolve below to merge.
      </div>
      {prediction.note ? (
        <div className="text-[10.5px] text-chalk-300">{prediction.note}</div>
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

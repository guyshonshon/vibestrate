/**
 * MergePlannerPanel - branch picker + predict + apply + undo.
 *
 * Flow:
 *   pick source + target -> Predict -> show result
 *     clean -> Apply merge button
 *     conflicts -> ConflictResolver
 *   Undo last merge affordance (calls undoGitMerge on current target)
 */
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  GitMerge,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { api } from "../../lib/api.js";
import type {
  GitBranchHead,
  GitBranchesOverview,
  GitGraphCommit,
  GitMergePrediction,
  GitApplyResult,
  GitUndoResult,
  ConsultAnswer,
} from "../../lib/types.js";
import { Button } from "../design/Button.js";
import { Select } from "../design/Select.js";
import { cn } from "../design/cn.js";
import { ConflictResolver } from "./ConflictResolver.js";
import { buildIndex, isAncestor } from "./graph-math.js";

type Props = {
  branchHeads: GitBranchHead[];
  /** The bounded commit topology - lets the planner spot already-merged pairs before predicting. */
  commits: GitGraphCommit[];
  /** Per-branch ahead/behind + diffstat, for the supervisor's context (optional). */
  branchesOverview: GitBranchesOverview | null;
  mainBranch: string;
  source: string | null;
  target: string | null;
  onSourceChange: (name: string | null) => void;
  onTargetChange: (name: string | null) => void;
  onMergeApplied: () => void;
};

export function MergePlannerPanel({
  branchHeads,
  commits,
  branchesOverview,
  mainBranch,
  source,
  target,
  onSourceChange,
  onTargetChange,
  onMergeApplied,
}: Props) {
  const [prediction, setPrediction] = useState<GitMergePrediction | null>(null);
  const [predicting, setPredicting] = useState(false);
  const [guided, setGuided] = useState(false);
  const [advice, setAdvice] = useState<ConsultAnswer | null>(null);
  const [advising, setAdvising] = useState(false);
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
    setGuided(false);
  }

  // Open branches = not main, not already merged into main. This is what the
  // planner steers you toward; when it's empty there is genuinely nothing to do.
  const openBranches = useMemo(
    () => branchHeads.filter((b) => !b.isMain && !b.mergedIntoMain),
    [branchHeads],
  );

  async function askSupervisor() {
    setAdvising(true);
    setError(null);
    try {
      const ov = branchesOverview?.branches ?? [];
      const describe = (pred: (b: GitBranchHead) => boolean) =>
        branchHeads
          .filter(pred)
          .map((b) => {
            const o = ov.find((x) => x.name === b.name);
            return o && !b.isMain
              ? `${b.name} (+${o.ahead}/-${o.behind}${o.stats ? `, +${o.stats.insertions}/-${o.stats.deletions}` : ""})`
              : b.name;
          })
          .join(", ");
      const open = describe((b) => !b.isMain && !b.mergedIntoMain) || "none";
      const merged = describe((b) => b.mergedIntoMain) || "none";
      const question = [
        `I'm reviewing merges on the Diffs page. Main branch: \`${mainBranch}\`.`,
        `Open branches (not yet merged, shown as +ahead/-behind vs main): ${open}.`,
        `Already merged: ${merged}.`,
        source && target
          ? `I've selected source \`${source}\` -> target \`${target}\`.`
          : `I have not picked a source/target yet.`,
        `Advise concisely: which open branch is the best next merge and why, whether the selected pair (if any) is safe to merge now, and any risk to watch. Do not run anything - advice only.`,
      ].join(" ");
      const res = await api.consult({
        question,
        viewContext: {
          screen: "Diffs / merge planner",
          details: `main=${mainBranch}; open=[${open}]; merged=[${merged}]; picked=${source ?? "-"}->${target ?? "-"}`,
        },
      });
      setAdvice(res.answer);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(
        msg.includes("403")
          ? "Supervisor needs a provider - configure one in Providers, then ask again."
          : `${msg} - the supervisor could not be reached; try again.`,
      );
    } finally {
      setAdvising(false);
    }
  }

  async function predict(asGuided = false) {
    if (!source || !target) return;
    setPredicting(true);
    resetPrediction();
    setGuided(asGuided);
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

  // Already-merged awareness, BEFORE any prediction runs. For target=main the
  // flag comes straight from git (`branch --merged`); for other targets it is
  // derived from the bounded topology, so it is best-effort when truncated.
  const alreadyMerged = useMemo(() => {
    if (!source || !target || source === target) return false;
    const src = branchHeads.find((b) => b.name === source);
    const tgt = branchHeads.find((b) => b.name === target);
    if (!src || !tgt) return false;
    if (tgt.name === mainBranch) return src.mergedIntoMain;
    const idx = buildIndex(commits);
    if (!idx.byHash.has(src.hash) || !idx.byHash.has(tgt.hash)) return false;
    return isAncestor(idx, src.hash, tgt.hash);
  }, [source, target, branchHeads, commits, mainBranch]);

  const predictHint =
    !source || !target
      ? "Pick a source and target branch to predict a merge."
      : source === target
        ? "Pick two different branches to merge."
        : null;

  const nothingToMerge = openBranches.length === 0 && branchHeads.length > 0;

  return (
    <div className="space-y-4">
      {/* Nothing to merge - every branch is already in main. A resolved state,
          not an empty form that invites a no-op. */}
      {nothingToMerge ? (
        <div className="flex items-start gap-2 rounded-[12px] border border-emerald-500/25 bg-emerald-500/[0.07] px-3 py-2.5 text-[12px] text-emerald-400">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.9} />
          <span>
            Everything is merged into{" "}
            <span className="mono">{mainBranch}</span> - there are no open
            branches to bring over. New work on a branch will show up here.
          </span>
        </div>
      ) : null}

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

      {/* Supervisor advice - read-only. Advises which branch to merge next and
          whether the picked pair is safe, without touching a branch. */}
      <div className="space-y-2 rounded-[12px] border border-[color:var(--line)] bg-coal-600 p-2.5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-violet-soft" strokeWidth={1.9} />
          <span className="flex-1 text-[11.5px] font-semibold text-chalk-100">
            Ask the supervisor
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void askSupervisor()}
            disabled={advising || branchHeads.length === 0}
          >
            {advising ? "Thinking" : advice ? "Ask again" : "Ask"}
          </Button>
        </div>
        {advice ? (
          <div className="space-y-1.5 border-t border-[color:var(--line-soft)] pt-2">
            <p className="max-h-48 overflow-auto whitespace-pre-wrap text-[11.5px] leading-[1.5] text-chalk-200">
              {advice.answer}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px]">
              <span
                className={cn(
                  "font-semibold",
                  advice.confidence === "high"
                    ? "text-emerald-400"
                    : advice.confidence === "low"
                      ? "text-amber-soft"
                      : "text-violet-soft",
                )}
              >
                {advice.confidence} confidence
              </span>
              {advice.caveats.slice(0, 2).map((c, i) => (
                <span key={i} className="text-chalk-400">
                  {c}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-[10.5px] leading-[1.45] text-chalk-300">
            Advice only - which open branch to merge next, and whether your
            picked pair is safe. It never merges for you.
          </p>
        )}
      </div>

      {/* Already merged - say so up front instead of suggesting a no-op. */}
      {alreadyMerged ? (
        <div className="flex items-start gap-2 rounded-[12px] border border-emerald-500/25 bg-emerald-500/[0.07] px-3 py-2 text-[12px] text-emerald-400">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.9} />
          <span>
            <span className="mono">{source}</span> is already merged into{" "}
            <span className="mono">{target}</span> - there is nothing new to
            bring over. Pick an open branch, or predict anyway to double-check.
          </span>
        </div>
      ) : null}

      {/* Predict / guided merge. Guided runs predict, then on a conflict lets
          the supervisor propose a resolution automatically - apply always stays
          an explicit click. */}
      <div className="space-y-1.5">
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={alreadyMerged ? "secondary" : "primary"}
            size="sm"
            onClick={() => void predict(false)}
            disabled={!canPredict || predicting}
            iconLeft={<GitMerge className="h-3.5 w-3.5" strokeWidth={1.9} />}
          >
            {predicting && !guided
              ? "Predicting"
              : alreadyMerged
                ? "Predict anyway"
                : "Predict"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void predict(true)}
            disabled={!canPredict || predicting}
            iconLeft={<Sparkles className="h-3.5 w-3.5" strokeWidth={1.9} />}
          >
            {predicting && guided ? "Working" : "Guided merge"}
          </Button>
        </div>
        {predictHint ? (
          <div className="text-[11.5px] text-chalk-300">{predictHint}</div>
        ) : null}
      </div>

      {/* Prediction result */}
      {prediction ? (
        <PredictionResult
          prediction={prediction}
          guided={guided}
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
      // The picker itself says which branches are already landed vs open, so
      // a merged branch is never a surprise suggestion.
      hint: b.isMain ? "main" : b.mergedIntoMain ? "merged" : "open",
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
  guided,
  applyResult,
  applying,
  onApply,
  onApplied,
}: {
  prediction: GitMergePrediction;
  guided: boolean;
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
          <>
            {guided ? (
              <div className="text-[11px] text-chalk-300">
                Supervisor: clean to merge. Review, then apply - nothing is
                written until you click.
              </div>
            ) : null}
            <Button
              variant="primary"
              size="sm"
              onClick={onApply}
              disabled={applying}
              iconLeft={<GitMerge className="h-3.5 w-3.5" strokeWidth={1.9} />}
            >
              {applying ? "Applying" : "Apply merge"}
            </Button>
          </>
        )}
        {prediction.note ? (
          <div className="text-[10.5px] text-chalk-300">{prediction.note}</div>
        ) : null}
      </div>
    );
  }

  // Conflicts. In guided mode the supervisor proposes a resolution on its own
  // (autoPropose); either way apply stays an explicit click inside the resolver.
  return (
    <div className="space-y-3 rounded-[12px] border border-rose-400/25 bg-rose-500/10 px-3 py-3">
      <div className="flex items-center gap-2 text-[12.5px] font-semibold text-rose-300">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.9} />
        {prediction.conflictedFiles.length} conflicted file
        {prediction.conflictedFiles.length === 1 ? "" : "s"} - resolve below to merge.
      </div>
      {guided ? (
        <div className="text-[10.5px] text-chalk-300">
          Guided: the supervisor is proposing a resolution below. Review each
          file before applying.
        </div>
      ) : prediction.note ? (
        <div className="text-[10.5px] text-chalk-300">{prediction.note}</div>
      ) : null}
      <ConflictResolver
        source={prediction.source}
        target={prediction.target}
        conflictedFiles={prediction.conflictedFiles}
        autoPropose={guided}
        onApplied={onApplied}
      />
    </div>
  );
}

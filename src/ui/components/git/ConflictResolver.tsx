/**
 * ConflictResolver - supervisor-assisted conflict resolution.
 *
 * Flow:
 *   1. User clicks "ask supervisor to propose resolutions"
 *   2. API returns GitResolutionProposal with per-file resolutions
 *   3. For each "proposed" file: show a whole-file editable textarea seeded
 *      with the proposed merge content (joined hunk proposals). Human can
 *      edit freely before accepting.
 *   4. refusedSecret/binary/unparseable files shown as "resolve manually"
 *      with the note.
 *   5. "Apply resolved merge" calls api.applyGitMergeResolved with the
 *      accepted files.
 *
 * Design note: proposals are advisory - nothing is written until Apply.
 */
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, GitMerge, RefreshCw } from "lucide-react";
import { api } from "../../lib/api.js";
import type {
  GitFileResolution,
  GitResolutionProposal,
  GitResolvedFile,
  GitApplyResult,
} from "../../lib/types.js";
import { cn } from "../design/cn.js";
import { Button } from "../design/Button.js";

type Props = {
  source: string;
  target: string;
  conflictedFiles: string[];
  /** Guided mode: fetch the supervisor's proposal on mount (still never applies). */
  autoPropose?: boolean;
  onApplied: (result: GitApplyResult) => void;
};

type FileState = {
  resolution: GitFileResolution;
  content: string; // editable text for "proposed" files
  accepted: boolean;
};

export function ConflictResolver({ source, target, conflictedFiles, autoPropose, onApplied }: Props) {
  const [proposal, setProposal] = useState<GitResolutionProposal | null>(null);
  const [fileStates, setFileStates] = useState<FileState[]>([]);
  const [proposing, setProposing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<GitApplyResult | null>(null);

  // Guided merge: request the supervisor's proposal once, automatically. Apply
  // still requires an explicit confirmed click below - autoPropose never writes.
  const autoDone = useRef(false);
  useEffect(() => {
    if (autoPropose && !autoDone.current) {
      autoDone.current = true;
      void fetchProposal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPropose]);

  async function fetchProposal() {
    setProposing(true);
    setError(null);
    setProposal(null);
    setFileStates([]);
    setApplyResult(null);
    try {
      const p = await api.proposeGitMergeResolutions(source, target);
      setProposal(p);
      // Seed file states
      const states: FileState[] = p.files.map((f) => {
        // Seed with the FULL reconstructed file (conflict regions resolved,
        // surrounding context + line endings preserved). A "proposed" file always
        // carries a non-null proposedFile; anything un-reconstructable is reported
        // as manual, so there is no truncating per-hunk fallback to write.
        const content =
          f.status === "proposed" && f.proposedFile != null ? f.proposedFile : "";
        return {
          resolution: f,
          content,
          accepted: f.status === "proposed" && f.proposedFile != null,
        };
      });
      setFileStates(states);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.includes("403") ? "Not authorised - no API token configured." : msg);
    } finally {
      setProposing(false);
    }
  }

  async function applyResolved() {
    if (!window.confirm(`Apply resolved merge of "${source}" into "${target}"? This will modify the target branch.`)) return;
    setApplying(true);
    setError(null);
    try {
      const resolvedFiles: GitResolvedFile[] = fileStates
        .filter((s) => s.accepted && s.resolution.status === "proposed")
        .map((s) => ({ path: s.resolution.file, content: s.content }));
      const result = await api.applyGitMergeResolved(source, target, resolvedFiles);
      setApplyResult(result);
      onApplied(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.includes("403") ? "Not authorised - no API token configured." : msg);
    } finally {
      setApplying(false);
    }
  }

  function updateContent(file: string, content: string) {
    setFileStates((prev) =>
      prev.map((s) => (s.resolution.file === file ? { ...s, content } : s)),
    );
  }

  function toggleAccepted(file: string) {
    setFileStates((prev) =>
      prev.map((s) =>
        s.resolution.file === file ? { ...s, accepted: !s.accepted } : s,
      ),
    );
  }

  const acceptedCount = fileStates.filter(
    (s) => s.accepted && s.resolution.status === "proposed",
  ).length;
  // Files the supervisor can't propose for (secret/binary/unparseable) block the
  // whole resolved-apply: the backend requires EVERY conflict resolved and
  // refuses secret paths, so this surface can't complete the merge. The human
  // must resolve those with plain git.
  const blockedFiles = fileStates.filter(
    (s) => s.resolution.status !== "proposed",
  );
  const canApply = blockedFiles.length === 0 && acceptedCount > 0;

  return (
    <div className="space-y-3">
      {/* Conflict file list */}
      <div>
        <div className="mb-2 text-[11.5px] font-semibold text-violet-soft">
          {conflictedFiles.length} conflicted file
          {conflictedFiles.length === 1 ? "" : "s"}
        </div>
        <ul className="space-y-1">
          {conflictedFiles.map((f) => (
            <li
              key={f}
              className="mono rounded-[8px] border border-rose-400/20 bg-rose-500/10 px-2 py-1 text-[11.5px] text-rose-300"
            >
              {f}
            </li>
          ))}
        </ul>
      </div>

      {/* Proposal controls */}
      {!proposal ? (
        <div className="space-y-2">
          <p className="text-[11.5px] text-chalk-300">
            Ask the supervisor to propose resolutions. Proposals are advisory - nothing is written until you apply.
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void fetchProposal()}
            disabled={proposing}
            iconLeft={<GitMerge className="h-3.5 w-3.5" strokeWidth={1.9} />}
          >
            {proposing ? "Asking supervisor" : "Ask supervisor to propose"}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11.5px] font-semibold text-violet-soft">
              {proposal.files.length} file{proposal.files.length === 1 ? "" : "s"} in proposal
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void fetchProposal()}
              disabled={proposing}
              iconLeft={
                <RefreshCw className={cn("h-3 w-3", proposing && "animate-spin")} strokeWidth={1.9} />
              }
            >
              Re-ask
            </Button>
          </div>

          {/* Per-file resolution */}
          <div className="space-y-3">
            {fileStates.map((fs) => (
              <FileResolutionCard
                key={fs.resolution.file}
                fileState={fs}
                onToggleAccepted={() => toggleAccepted(fs.resolution.file)}
                onContentChange={(c) => updateContent(fs.resolution.file, c)}
              />
            ))}
          </div>

          {/* Apply resolved */}
          {applyResult ? (
            <div className="flex items-center gap-2 rounded-[10px] border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.9} />
              <span>
                Merge applied. New commit:{" "}
                <span className="mono">{applyResult.mergedSha.slice(0, 8)}</span>
              </span>
            </div>
          ) : (
            <div className="space-y-1.5">
              {blockedFiles.length > 0 ? (
                <div className="rounded-[10px] border border-amber-soft/25 bg-amber-soft/10 px-3 py-2 text-[11.5px] text-amber-soft">
                  {blockedFiles.length} file
                  {blockedFiles.length === 1 ? "" : "s"} can't be resolved here
                  (secret / binary / unparseable). Resolve the whole merge with
                  plain git - this surface can't complete it.
                </div>
              ) : null}
              <Button
                variant="primary"
                size="sm"
                onClick={() => void applyResolved()}
                disabled={applying || !canApply}
                iconLeft={<GitMerge className="h-3.5 w-3.5" strokeWidth={1.9} />}
              >
                {applying
                  ? "Applying"
                  : `Apply resolved merge (${acceptedCount} file${acceptedCount === 1 ? "" : "s"})`}
              </Button>
            </div>
          )}
        </div>
      )}

      {error ? (
        <div className="flex items-start gap-2 rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.9} />
          <span>{error} - re-ask the supervisor or resolve with plain git.</span>
        </div>
      ) : null}
    </div>
  );
}

function FileResolutionCard({
  fileState,
  onToggleAccepted,
  onContentChange,
}: {
  fileState: FileState;
  onToggleAccepted: () => void;
  onContentChange: (content: string) => void;
}) {
  const { resolution, content, accepted } = fileState;
  const [expanded, setExpanded] = useState(resolution.status === "proposed");

  const statusLabel: Record<GitFileResolution["status"], { label: string; tone: string }> = {
    proposed: { label: "proposed", tone: "text-violet-soft" },
    refusedSecret: { label: "refused (secret)", tone: "text-rose-300" },
    binary: { label: "binary", tone: "text-amber-soft" },
    unparseable: { label: "unparseable", tone: "text-chalk-300" },
  };
  const s = statusLabel[resolution.status];

  return (
    <div className={cn(
      "overflow-hidden rounded-[12px] border",
      resolution.status === "proposed" && accepted
        ? "border-violet-soft/30 bg-violet-soft/[0.06]"
        : "border-[color:var(--line)] bg-coal-500/50",
    )}>
      {/* File header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="mono truncate text-[11.5px] text-chalk-100">{resolution.file}</span>
          <span className={cn("mono text-[10.5px] font-semibold", s.tone)}>{s.label}</span>
          {resolution.note ? (
            <span className="truncate text-[10.5px] text-chalk-300">{resolution.note}</span>
          ) : null}
        </button>
        {resolution.status === "proposed" ? (
          <label className="flex shrink-0 cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={accepted}
              onChange={onToggleAccepted}
              className="h-3.5 w-3.5 accent-violet-500"
            />
            <span className="text-[11px] font-medium text-chalk-300">include</span>
          </label>
        ) : null}
      </div>

      {/* Content for non-proposed files */}
      {resolution.status !== "proposed" ? (
        <div className="border-t border-[color:var(--line-soft)] px-3 py-2 text-[11.5px] text-chalk-300">
          {resolution.status === "refusedSecret"
            ? "Contains secret-like content - resolve manually."
            : resolution.status === "binary"
              ? "Binary file - resolve manually."
              : "Could not parse conflict markers - resolve manually."}
          {resolution.note ? (
            <span className="mt-0.5 block text-chalk-400">{resolution.note}</span>
          ) : null}
        </div>
      ) : null}

      {/* Hunk view and editable merge content */}
      {resolution.status === "proposed" && expanded ? (
        <div className="space-y-2 border-t border-[color:var(--line-soft)] p-3">
          {/* Hunk reference table */}
          {resolution.hunks.length > 0 ? (
            <div className="mb-3 space-y-2">
              {resolution.hunks.map((h) => (
                <div key={h.index} className="mono overflow-hidden rounded-[10px] border border-[color:var(--line-soft)] bg-coal-800 text-[10.5px]">
                  <div className="grid grid-cols-3 border-b border-[color:var(--line-soft)]">
                    <div className="border-r border-[color:var(--line-soft)] px-2 py-1">
                      <div className="mb-0.5 font-semibold text-sky-glow">ours</div>
                      <pre className="whitespace-pre-wrap text-chalk-200">{h.ours || "(empty)"}</pre>
                    </div>
                    <div className="border-r border-[color:var(--line-soft)] px-2 py-1">
                      <div className="mb-0.5 font-semibold text-amber-soft">theirs</div>
                      <pre className="whitespace-pre-wrap text-chalk-200">{h.theirs || "(empty)"}</pre>
                    </div>
                    <div className="px-2 py-1">
                      <div className="mb-0.5 font-semibold text-emerald-400">proposed</div>
                      <pre className="whitespace-pre-wrap text-chalk-200">{h.proposed || "(empty)"}</pre>
                    </div>
                  </div>
                  {h.rationale ? (
                    <div className="px-2 py-1 text-[10px] italic text-chalk-300">{h.rationale}</div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {/* Editable whole-file textarea */}
          <div>
            <div className="mb-1 text-[10.5px] font-medium text-violet-soft">
              edit the merged content before applying
            </div>
            <textarea
              value={content}
              onChange={(e) => onContentChange(e.target.value)}
              rows={8}
              className="mono w-full resize-y rounded-[12px] border border-[color:var(--line-strong)] bg-coal-800 px-2.5 py-2 text-[11px] text-chalk-100 focus:border-violet-soft/50 focus:outline-none"
              spellCheck={false}
            />
          </div>
          <p className="text-[10.5px] text-chalk-300">
            Proposals are advisory. Nothing is written until you click "Apply resolved merge".
          </p>
        </div>
      ) : null}
    </div>
  );
}

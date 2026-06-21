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
import { useState } from "react";
import { AlertTriangle, CheckCircle2, GitMerge, RefreshCw } from "lucide-react";
import { api } from "../../lib/api.js";
import type {
  GitFileResolution,
  GitResolutionProposal,
  GitResolvedFile,
  GitApplyResult,
} from "../../lib/types.js";
import { Chip } from "../design/Chip.js";
import { cn } from "../design/cn.js";

type Props = {
  source: string;
  target: string;
  conflictedFiles: string[];
  onApplied: (result: GitApplyResult) => void;
};

type FileState = {
  resolution: GitFileResolution;
  content: string; // editable text for "proposed" files
  accepted: boolean;
};

export function ConflictResolver({ source, target, conflictedFiles, onApplied }: Props) {
  const [proposal, setProposal] = useState<GitResolutionProposal | null>(null);
  const [fileStates, setFileStates] = useState<FileState[]>([]);
  const [proposing, setProposing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<GitApplyResult | null>(null);

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
        // For "proposed" files, join all hunk proposed values as the initial content.
        // This is a simplification - full file content would require the backend
        // to return whole-file text; here we surface the proposed hunks.
        const content =
          f.status === "proposed"
            ? f.hunks.map((h) => h.proposed).join("\n\n")
            : "";
        return { resolution: f, content, accepted: f.status === "proposed" };
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

  return (
    <div className="space-y-3">
      {/* Conflict file list */}
      <div>
        <div className="text-[11.5px] text-fog-400 mb-2">
          {conflictedFiles.length} conflicted file{conflictedFiles.length === 1 ? "" : "s"}:
        </div>
        <ul className="space-y-0.5">
          {conflictedFiles.map((f) => (
            <li key={f} className="mono text-[11.5px] text-rose-300 px-2 py-0.5 bg-rose-500/5 border border-rose-400/15">
              {f}
            </li>
          ))}
        </ul>
      </div>

      {/* Proposal controls */}
      {!proposal ? (
        <div className="space-y-2">
          <p className="text-[11.5px] text-fog-400">
            Ask the supervisor to propose resolutions. Proposals are advisory - nothing is written until you apply.
          </p>
          <button
            type="button"
            onClick={() => void fetchProposal()}
            disabled={proposing}
            className="h-8 px-3 border border-white/10 bg-ink-200 hover:bg-ink-100 text-[12px] text-fog-200 flex items-center gap-1.5 disabled:opacity-50"
          >
            <GitMerge className="h-3.5 w-3.5" strokeWidth={1.6} />
            {proposing ? "Asking supervisor…" : "Ask supervisor to propose"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11.5px] text-fog-300">
              {proposal.files.length} file{proposal.files.length === 1 ? "" : "s"} in proposal
            </span>
            <button
              type="button"
              onClick={() => void fetchProposal()}
              disabled={proposing}
              className="h-7 px-2 border border-white/10 bg-ink-200 hover:bg-ink-100 text-[11px] text-fog-400 flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3 w-3", proposing && "animate-spin")} strokeWidth={1.6} />
              Re-ask
            </button>
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
            <div className="flex items-center gap-2 border border-emerald-400/30 bg-emerald-500/5 px-3 py-2 text-[12px] text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.7} />
              Merge applied. New commit: <span className="mono">{applyResult.mergedSha.slice(0, 8)}</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void applyResolved()}
              disabled={applying || acceptedCount === 0}
              className="h-8 px-3 border border-emerald-400/30 bg-emerald-500/10 hover:bg-emerald-500/15 text-[12px] text-emerald-300 flex items-center gap-1.5 disabled:opacity-50"
            >
              <GitMerge className="h-3.5 w-3.5" strokeWidth={1.6} />
              {applying
                ? "Applying…"
                : `Apply resolved merge (${acceptedCount} file${acceptedCount === 1 ? "" : "s"})`}
            </button>
          )}
        </div>
      )}

      {error ? (
        <div className="flex items-start gap-2 border border-rose-400/30 bg-rose-500/5 px-3 py-2 text-[12px] text-rose-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" strokeWidth={1.7} />
          {error}
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
    binary: { label: "binary", tone: "text-amber-300" },
    unparseable: { label: "unparseable", tone: "text-fog-400" },
  };
  const s = statusLabel[resolution.status];

  return (
    <div className={cn(
      "border overflow-hidden",
      resolution.status === "proposed" && accepted
        ? "border-violet-soft/25 bg-ink-100"
        : "border-white/[0.07] bg-ink-200",
    )}>
      {/* File header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          className="flex-1 flex items-center gap-2 text-left min-w-0"
        >
          <span className="mono text-[11.5px] text-fog-100 truncate">{resolution.file}</span>
          <span className={cn("text-[10.5px] font-mono", s.tone)}>{s.label}</span>
          {resolution.note ? (
            <span className="text-[10.5px] text-fog-500 truncate">{resolution.note}</span>
          ) : null}
        </button>
        {resolution.status === "proposed" ? (
          <label className="flex items-center gap-1.5 shrink-0 cursor-pointer">
            <input
              type="checkbox"
              checked={accepted}
              onChange={onToggleAccepted}
              className="accent-violet-500 w-3.5 h-3.5"
            />
            <span className="text-[11px] text-fog-400">include</span>
          </label>
        ) : null}
      </div>

      {/* Content for non-proposed files */}
      {resolution.status !== "proposed" ? (
        <div className="border-t border-white/[0.05] px-3 py-2 text-[11.5px] text-fog-400">
          {resolution.status === "refusedSecret"
            ? "Contains secret-like content - resolve manually."
            : resolution.status === "binary"
              ? "Binary file - resolve manually."
              : "Could not parse conflict markers - resolve manually."}
          {resolution.note ? (
            <span className="block mt-0.5 text-fog-500">{resolution.note}</span>
          ) : null}
        </div>
      ) : null}

      {/* Hunk view and editable merge content */}
      {resolution.status === "proposed" && expanded ? (
        <div className="border-t border-white/[0.05] space-y-2 p-3">
          {/* Hunk reference table */}
          {resolution.hunks.length > 0 ? (
            <div className="space-y-2 mb-3">
              {resolution.hunks.map((h) => (
                <div key={h.index} className="border border-white/[0.05] bg-ink-300 text-[10.5px] font-mono">
                  <div className="grid grid-cols-3 border-b border-white/[0.05]">
                    <div className="px-2 py-1 border-r border-white/[0.05]">
                      <div className="text-fog-500 mb-0.5">ours</div>
                      <pre className="whitespace-pre-wrap text-sky-glow/80">{h.ours || "(empty)"}</pre>
                    </div>
                    <div className="px-2 py-1 border-r border-white/[0.05]">
                      <div className="text-fog-500 mb-0.5">theirs</div>
                      <pre className="whitespace-pre-wrap text-amber-300/80">{h.theirs || "(empty)"}</pre>
                    </div>
                    <div className="px-2 py-1">
                      <div className="text-fog-500 mb-0.5">proposed</div>
                      <pre className="whitespace-pre-wrap text-emerald-300/80">{h.proposed || "(empty)"}</pre>
                    </div>
                  </div>
                  {h.rationale ? (
                    <div className="px-2 py-1 text-fog-500 italic text-[10px]">{h.rationale}</div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {/* Editable whole-file textarea */}
          <div>
            <div className="text-[10.5px] text-fog-500 mb-1">
              edit the merged content before applying:
            </div>
            <textarea
              value={content}
              onChange={(e) => onContentChange(e.target.value)}
              rows={8}
              className="w-full mono text-[11px] text-fog-100 bg-ink-300 border border-white/[0.08] px-2 py-1.5 resize-y focus:outline-none focus:border-violet-soft/40"
              spellCheck={false}
            />
          </div>
          <p className="text-[10.5px] text-fog-500">
            Proposals are advisory. Nothing is written until you click "Apply resolved merge".
          </p>
        </div>
      ) : null}
    </div>
  );
}

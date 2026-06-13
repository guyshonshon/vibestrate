import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  GitMerge,
  RefreshCw,
} from "lucide-react";
import {
  api,
  type MergeAdviceDto,
  type MergeAnalysisDto,
  type MergeOverviewRowDto,
} from "../../lib/api.js";
import { Chip, type ChipTone } from "../../components/design/Chip.js";
import { cn } from "../../components/design/cn.js";

type Props = {
  /** null = hub list of merge-ready runs; set = the merge window for one run. */
  runId: string | null;
  onOpenMergeRun: (runId: string | null) => void;
  onOpenRun: (runId: string) => void;
};

/**
 * Merge window (T13 slice 1b, design/merge-advisor.md). Two levels with
 * different costs: the hub list renders the CHEAP overview (lanes + topology;
 * no scratch-worktree preview, no recommendation - a recommendation computed
 * blind to conflicts would lie), and the per-run window fetches the full
 * deterministic advice. All advice is read-only; the only mutating actions
 * are the existing apply/finish, embedded unchanged with their existing
 * confirmation UX and server-side gates.
 */
export function MergePage({ runId, onOpenMergeRun, onOpenRun }: Props) {
  return runId === null ? (
    <MergeHub onOpenMergeRun={onOpenMergeRun} onOpenRun={onOpenRun} />
  ) : (
    <MergeWindow runId={runId} onBack={() => onOpenMergeRun(null)} onOpenRun={onOpenRun} />
  );
}

// ── lane rendering (shared) ──────────────────────────────────────────────────

type Lanes = NonNullable<MergeOverviewRowDto["assurance"]>["lanes"];

const LANE_TONES: Record<string, ChipTone> = {
  passed: "emerald",
  approved: "emerald",
  not_applicable: "neutral",
  skipped_inert_diff: "neutral",
  failed: "rose",
  changes_requested: "rose",
  missing: "amber",
  environment: "amber",
  not_run: "amber",
};

function laneTone(status: string): ChipTone {
  return LANE_TONES[status] ?? "amber";
}

function LaneChips({
  assurance,
}: {
  assurance: MergeOverviewRowDto["assurance"];
}) {
  if (!assurance) {
    return <Chip tone="amber">no assurance record</Chip>;
  }
  const lanes: [string, string][] = [
    ["validation", assurance.lanes.validation],
    ["review", assurance.lanes.review],
    ["verification", assurance.lanes.verification],
  ];
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {lanes.map(([lane, status]) => (
        <Chip key={lane} tone={laneTone(status)}>
          {lane}: {status.replace(/_/g, " ")}
        </Chip>
      ))}
      {!assurance.anyRealCheckPassed ? (
        <Chip tone="amber">no real check ran</Chip>
      ) : null}
    </span>
  );
}

function TopologyLine({ row }: { row: { topology: MergeOverviewRowDto["topology"] } }) {
  const t = row.topology;
  return (
    <span className="mono text-[11px] text-fog-500">
      {t.aheadOfMain} ahead · {t.behindMain} behind · {t.filesTouched} file
      {t.filesTouched === 1 ? "" : "s"}
    </span>
  );
}

// ── hub list ─────────────────────────────────────────────────────────────────

function MergeHub({
  onOpenMergeRun,
  onOpenRun,
}: {
  onOpenMergeRun: (runId: string) => void;
  onOpenRun: (runId: string) => void;
}) {
  const [rows, setRows] = useState<MergeOverviewRowDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.integrationOverview();
      setRows(r.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="flex items-center gap-2.5">
        <GitMerge className="h-4.5 w-4.5 text-emerald-300" strokeWidth={1.7} />
        <h1 className="text-[16px] font-semibold text-fog-100">Merge window</h1>
        <span className="text-[11px] text-fog-500">
          advice is read-only · merging stays explicit · never pushed
        </span>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="ml-auto h-7 w-7 rounded-md border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] flex items-center justify-center disabled:opacity-50"
          aria-label="Refresh"
        >
          <RefreshCw className={cn("h-3.5 w-3.5 text-fog-300", busy && "animate-spin")} strokeWidth={1.7} />
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
          {error}
        </div>
      ) : null}

      {rows === null && !error ? (
        <div className="mt-6 text-[12.5px] text-fog-400">Loading merge-ready runs…</div>
      ) : null}

      {rows !== null && rows.length === 0 ? (
        <div className="mt-6 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-6 text-[12.5px] text-fog-400">
          No merge-ready runs. A run lands here when its checks make it
          merge-ready; until then there is nothing to merge.
        </div>
      ) : null}

      <ul className="mt-4 space-y-2">
        {(rows ?? []).map((r) => (
          <li
            key={r.runId}
            className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3 hover:border-emerald-400/25"
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenMergeRun(r.runId)}
                className="text-left text-[13px] font-medium text-fog-100 hover:text-emerald-200 truncate"
              >
                {r.task}
              </button>
              <span className="ml-auto" />
              <TopologyLine row={r} />
              <button
                type="button"
                onClick={() => onOpenRun(r.runId)}
                className="text-[11px] text-fog-400 hover:text-fog-200"
              >
                open run
              </button>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="mono text-[10.5px] text-fog-500 truncate max-w-[260px]">
                {r.branchName}
              </span>
              {!r.branchExists ? <Chip tone="rose">branch missing</Chip> : null}
              {r.topology.protectedPathHits.length > 0 ? (
                <Chip tone="rose">
                  protected paths ({r.topology.protectedPathHits.length})
                </Chip>
              ) : null}
              <LaneChips assurance={r.assurance} />
            </div>
            <div className="mt-2">
              <button
                type="button"
                onClick={() => onOpenMergeRun(r.runId)}
                className="h-6.5 rounded-md border border-emerald-400/25 bg-emerald-500/10 px-2 text-[11px] text-emerald-200 hover:bg-emerald-500/20"
              >
                Get merge advice
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── per-run merge window ─────────────────────────────────────────────────────

function MergeWindow({
  runId,
  onBack,
  onOpenRun,
}: {
  runId: string;
  onBack: () => void;
  onOpenRun: (runId: string) => void;
}) {
  const [advice, setAdvice] = useState<MergeAdviceDto | null>(null);
  const [notReady, setNotReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [into, setInto] = useState("integration/main");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [finishable, setFinishable] = useState<string | null>(null);

  const [analysis, setAnalysis] = useState<MergeAnalysisDto | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotReady(false);
    try {
      const r = await api.adviseIntegration([runId]);
      if (r.advice.length === 0) {
        setNotReady(true);
        setAdvice(null);
      } else {
        setAdvice(r.advice[0] ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [runId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function act(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setActionError(null);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const warnings = advice?.flags.filter((f) => f.severity === "warning") ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onBack}
          className="h-7 w-7 rounded-md border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] flex items-center justify-center"
          aria-label="Back to merge list"
        >
          <ArrowLeft className="h-3.5 w-3.5 text-fog-300" strokeWidth={1.7} />
        </button>
        <GitMerge className="h-4 w-4 text-emerald-300" strokeWidth={1.7} />
        <h1 className="text-[15px] font-semibold text-fog-100 truncate">
          {advice?.task ?? runId}
        </h1>
        <button
          type="button"
          onClick={() => onOpenRun(runId)}
          className="ml-auto text-[11px] text-fog-400 hover:text-fog-200 shrink-0"
        >
          open run
        </button>
      </div>

      {loading ? (
        <div className="mt-5 text-[12.5px] text-fog-400">
          Computing advice (dry-run merge + topology)…
        </div>
      ) : null}
      {error ? (
        <div className="mt-4 rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
          {error}
        </div>
      ) : null}
      {notReady ? (
        <div className="mt-4 rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[12.5px] text-fog-300">
          This run is not merge-ready (anymore). Go back to the merge list.
        </div>
      ) : null}

      {advice ? (
        <>
          {/* headline + recommendation */}
          <section
            className={cn(
              "mt-4 rounded-lg border p-4",
              warnings.length > 0
                ? "border-amber-400/25 bg-amber-500/[0.04]"
                : "border-emerald-400/20 bg-emerald-500/[0.03]",
            )}
          >
            <div className="text-[13.5px] text-fog-100">{advice.headline}</div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Chip tone={advice.recommendation === "finish-now" ? "emerald" : advice.recommendation === "resolve-first" ? "rose" : "amber"}>
                {advice.recommendation}
              </Chip>
              <Chip tone="neutral">shape: {advice.predictedShape}</Chip>
              <span className="text-[11px] text-fog-500">
                {advice.recommendationReason}
              </span>
            </div>
            <div className="mt-1.5 text-[10.5px] text-fog-500">
              advisor persona: {advice.personaId} · deterministic - computed
              from git facts + check lanes, no model output
            </div>
          </section>

          {/* flags */}
          {advice.flags.length > 0 ? (
            <section className="mt-3 rounded-lg border border-white/[0.07] bg-white/[0.02] p-4">
              <div className="text-[12px] font-medium text-fog-200">
                Concerns ({advice.flags.length})
              </div>
              <ul className="mt-2 space-y-2">
                {advice.flags.map((f, i) => (
                  <li key={`${f.id}-${i}`}>
                    <details>
                      <summary className="cursor-pointer text-[12.5px] text-fog-100 flex items-center gap-2">
                        {f.severity === "warning" ? (
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-300 shrink-0" strokeWidth={1.8} />
                        ) : (
                          <span className="text-fog-500">·</span>
                        )}
                        <span>{f.summary}</span>
                        <Chip tone={f.severity === "warning" ? "amber" : "neutral"}>
                          {f.severity}
                        </Chip>
                      </summary>
                      <p className="mt-1 ml-5 text-[11.5px] text-fog-400">{f.detail}</p>
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* facts: lanes, topology, conflicts */}
          <section className="mt-3 rounded-lg border border-white/[0.07] bg-white/[0.02] p-4 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <LaneChips assurance={advice.assurance} />
            </div>
            <div className="flex items-center gap-3">
              <span className="mono text-[10.5px] text-fog-500 truncate max-w-[280px]">
                {advice.topology.branchName}
              </span>
              <TopologyLine row={advice} />
            </div>
            {advice.preview ? (
              advice.preview.clean ? (
                <div className="text-[12px] text-emerald-300">
                  Dry-run merge applies cleanly.
                </div>
              ) : (
                <div className="text-[12px] text-rose-300">
                  Dry-run merge: {advice.preview.note}
                  {advice.preview.conflictedFiles.length > 0 ? (
                    <span className="mono text-[11px]">
                      {" "}
                      ({advice.preview.conflictedFiles.join(", ")})
                    </span>
                  ) : null}
                </div>
              )
            ) : null}
            {advice.manualSteps ? (
              <ul className="space-y-1">
                {advice.manualSteps.map((s) => (
                  <li key={s} className="mono text-[11px] text-fog-400">
                    {s}
                  </li>
                ))}
              </ul>
            ) : null}
            <details>
              <summary className="cursor-pointer text-[11.5px] text-fog-400">
                Developer detail
              </summary>
              <pre className="mt-1 whitespace-pre-wrap mono text-[11px] text-fog-400">
                {advice.detail}
              </pre>
            </details>
          </section>

          {/* actions - the existing gated integrate/finish, unchanged semantics */}
          <section className="mt-3 rounded-lg border border-white/[0.07] bg-white/[0.02] p-4">
            <div className="text-[12px] font-medium text-fog-200">
              Act on it
            </div>
            <div className="mt-1 text-[11px] text-fog-500">
              Integrating creates a dedicated branch (never main). Completing
              the merge runs a local git merge into main - explicit, gated,
              never pushed.
            </div>
            {advice.preview && !advice.preview.clean ? (
              <div className="mt-1 text-[11px] text-amber-300">
                The dry-run conflicted: integrating will stop at the conflict
                and leave the integration worktree ready for you to resolve.
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={into}
                onChange={(e) => setInto(e.target.value)}
                placeholder="integration/branch"
                className="h-7 w-[200px] rounded-md bg-white/[0.025] border border-white/[0.08] px-2.5 text-[11.5px] text-fog-100 mono focus:outline-none focus:border-emerald-400/35"
              />
              {/* Apply stays enabled on a conflicted preview - integrate
                  stops at the conflict and leaves a mergeable worktree, the
                  same in-UI resolve-first flow the Runs page offers (UI/CLI
                  parity; adversarial-review fix). */}
              <button
                type="button"
                disabled={busy !== null || !into.trim()}
                onClick={() =>
                  act("apply", async () => {
                    const res = await api.applyIntegration(into.trim(), [runId]);
                    setMsg(
                      res.stoppedAt
                        ? `Stopped at ${res.stoppedAt} (conflicts). Resolve in ${res.worktreePath}.`
                        : `Integrated into ${res.integrationBranch}. Review it - main is untouched.`,
                    );
                    setFinishable(res.stoppedAt ? null : res.integrationBranch);
                  })
                }
                className="h-7 rounded-md border border-emerald-400/30 bg-emerald-500/15 px-2.5 text-[11.5px] text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
              >
                {busy === "apply" ? "Integrating…" : "Integrate this run"}
              </button>
              {finishable ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => {
                    // Explicit, spelled-out confirm: this is the only place
                    // the product touches main - locally, never pushed (P7b).
                    if (
                      !window.confirm(
                        `Merge "${finishable}" into main now?\n\nThis runs a LOCAL git merge of the reviewed integration branch into main. Nothing is pushed. Refused if the tree is dirty, the integration is partial, or a policy objects.`,
                      )
                    ) {
                      return;
                    }
                    void act("finish", async () => {
                      const r = await api.finishIntegration(finishable);
                      setMsg(
                        `Merged ${r.integrationBranch} into ${r.intoBranch} @ ${r.mergedSha.slice(0, 10)} (local only - not pushed).`,
                      );
                      setFinishable(null);
                    });
                  }}
                  className="h-7 rounded-md border border-violet-soft/40 bg-violet-soft/15 px-2.5 text-[11.5px] text-violet-200 hover:bg-violet-soft/25 disabled:opacity-50"
                >
                  {busy === "finish" ? "Merging…" : "Complete merge to main"}
                </button>
              ) : null}
            </div>
            {msg ? (
              <div className="mt-2 text-[11.5px] text-emerald-300">{msg}</div>
            ) : null}
            {actionError ? (
              <div className="mt-2 text-[11.5px] text-rose-300">
                {actionError}
              </div>
            ) : null}
          </section>

          {/* Analyze deeper - optional LLM pass; advisory prose, never a
              merge verdict, never changes the recommendation above. */}
          <section className="mt-3 rounded-lg border border-violet-soft/20 bg-violet-soft/[0.03] p-4">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-medium text-fog-200">
                Analyze deeper
              </span>
              <span className="text-[10.5px] text-fog-500">
                optional · reads the diff with a local provider · advisory only
              </span>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() =>
                  act("analyze", async () => {
                    setAnalyzeError(null);
                    try {
                      const r = await api.analyzeIntegration(runId);
                      setAnalysis(r.result);
                    } catch (e) {
                      setAnalyzeError(e instanceof Error ? e.message : String(e));
                    }
                  })
                }
                className="ml-auto h-7 rounded-md border border-violet-soft/40 bg-violet-soft/15 px-2.5 text-[11.5px] text-violet-200 hover:bg-violet-soft/25 disabled:opacity-50"
              >
                {busy === "analyze" ? "Analyzing…" : analysis ? "Re-analyze" : "Analyze the diff"}
              </button>
            </div>
            {analyzeError ? (
              <div className="mt-2 text-[11.5px] text-rose-300">{analyzeError}</div>
            ) : null}
            {analysis ? (
              <div className="mt-3">
                <div className="text-[12.5px] text-fog-100">
                  {analysis.analysis.summary}
                </div>
                <div className="mt-1 text-[10.5px] text-fog-500">
                  confidence: {analysis.analysis.confidence} · {analysis.context.filesInDiff} files
                  {analysis.context.redactedTokenCount > 0
                    ? ` · ${analysis.context.redactedTokenCount} secret token(s) redacted`
                    : ""}
                  {analysis.context.truncated ? " · diff truncated" : ""}
                  {analysis.context.suppressedSecretFiles.length > 0
                    ? ` · ${analysis.context.suppressedSecretFiles.length} secret-like file(s) suppressed`
                    : ""}
                </div>
                {analysis.analysis.findings.length > 0 ? (
                  <ul className="mt-2 space-y-1.5">
                    {analysis.analysis.findings.map((f, i) => (
                      <li key={`${f.area}-${i}`} className="text-[12px] text-fog-200">
                        <Chip
                          tone={
                            f.severity === "concern"
                              ? "rose"
                              : f.severity === "caution"
                                ? "amber"
                                : "neutral"
                          }
                        >
                          {f.severity}
                        </Chip>{" "}
                        <span className="font-medium">{f.area}</span> - {f.detail}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-2 text-[12px] text-fog-400">
                    No specific risks stood out in the diff.
                  </div>
                )}
                {analysis.analysis.caveats.length > 0 ? (
                  <div className="mt-2 text-[11px] text-fog-500">
                    Could not verify: {analysis.analysis.caveats.join("; ")}
                  </div>
                ) : null}
                <div className="mt-2 text-[10px] text-fog-600">
                  Advisory only - the recommendation above is unchanged.
                  Cached at {analysis.cachedArtifactPath}.
                </div>
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}

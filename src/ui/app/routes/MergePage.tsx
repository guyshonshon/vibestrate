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
import { Button } from "../../components/design/Button.js";
import { StatTile } from "../../components/design/StatTile.js";
import { PageShell, PageHeader, Section } from "../../components/layout/PageShell.js";
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

/** Compact inline topology, for the dense hub rows. */
function TopologyLine({ row }: { row: { topology: MergeOverviewRowDto["topology"] } }) {
  const t = row.topology;
  return (
    <span className="mono text-[11px] text-chalk-400">
      {t.aheadOfMain} ahead · {t.behindMain} behind · {t.filesTouched} file
      {t.filesTouched === 1 ? "" : "s"}
    </span>
  );
}

/** Topology as framed stat tiles, for the per-run facts section. */
function TopologyTiles({ row }: { row: { topology: MergeOverviewRowDto["topology"] } }) {
  const t = row.topology;
  return (
    <div className="flex flex-wrap items-stretch gap-1">
      <StatTile value={t.aheadOfMain} label="ahead" />
      <StatTile value={t.behindMain} label="behind" />
      <StatTile
        value={t.filesTouched}
        label={t.filesTouched === 1 ? "file" : "files"}
      />
    </div>
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
    <PageShell>
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            <GitMerge className="h-5 w-5 text-emerald-400" strokeWidth={1.9} aria-hidden />
            Merge window
          </span>
        }
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void load()}
            disabled={busy}
            aria-label="Refresh"
            iconLeft={
              <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} strokeWidth={1.9} aria-hidden />
            }
          >
            Refresh
          </Button>
        }
      >
        <p className="mt-2 text-[12.5px] text-chalk-300">
          Advice is read-only. Merging stays explicit, and nothing is ever pushed.
        </p>
      </PageHeader>

      {error ? (
        <div className="mb-4 rounded-[12px] border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-[13px] text-rose-300">
          {error} - retry with Refresh above.
        </div>
      ) : null}

      {rows === null && !error ? (
        <div className="text-[12.5px] text-chalk-300">Loading merge-ready runs…</div>
      ) : null}

      {rows !== null && rows.length === 0 ? (
        <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-6">
          <div className="text-[13px] font-semibold text-chalk-100">
            No merge-ready runs yet
          </div>
          <p className="mt-1.5 text-[12.5px] text-chalk-300">
            A run lands here once its checks make it merge-ready. Queue and
            complete a run, then come back to merge it.
          </p>
          <div className="mt-3">
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Check again
            </Button>
          </div>
        </div>
      ) : null}

      {rows !== null && rows.length > 0 ? (
        <Section>
          <ul className="space-y-2">
            {rows.map((r) => (
              <li
                key={r.runId}
                className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4 transition hover:border-emerald-400/25"
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenMergeRun(r.runId)}
                    className="truncate text-left text-[13px] font-semibold text-chalk-100 transition hover:text-emerald-300"
                  >
                    {r.task}
                  </button>
                  <span className="ml-auto" />
                  <TopologyLine row={r} />
                  <button
                    type="button"
                    onClick={() => onOpenRun(r.runId)}
                    className="text-[11.5px] font-semibold text-chalk-300 transition hover:text-chalk-100"
                  >
                    open run
                  </button>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="mono max-w-[260px] truncate text-[10.5px] text-chalk-400">
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
                <div className="mt-3">
                  <Button
                    size="sm"
                    onClick={() => onOpenMergeRun(r.runId)}
                    className="border border-emerald-400/25 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                  >
                    Get merge advice
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </PageShell>
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
    <PageShell>
      <PageHeader
        title={
          <span className="flex min-w-0 items-center gap-2.5">
            <GitMerge className="h-5 w-5 shrink-0 text-emerald-400" strokeWidth={1.9} aria-hidden />
            <span className="truncate">{advice?.task ?? runId}</span>
          </span>
        }
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={onBack}
              aria-label="Back to merge list"
              iconLeft={<ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden />}
            >
              Back
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onOpenRun(runId)}>
              open run
            </Button>
          </>
        }
      />

      {loading ? (
        <div className="text-[12.5px] text-chalk-300">
          Computing advice (dry-run merge + topology)…
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-[12px] border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-[13px] text-rose-300">
          {error} - go back and retry, or open the run to inspect it.
        </div>
      ) : null}
      {notReady ? (
        <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4">
          <div className="text-[12.5px] text-chalk-300">
            This run is not merge-ready (anymore).
          </div>
          <div className="mt-3">
            <Button variant="secondary" size="sm" onClick={onBack}>
              Back to merge list
            </Button>
          </div>
        </div>
      ) : null}

      {advice ? (
        <>
          {/* headline + recommendation */}
          <section
            className={cn(
              "mb-3 rounded-[18px] border p-4",
              warnings.length > 0
                ? "border-amber-soft/25 bg-amber-soft/[0.04]"
                : "border-emerald-400/20 bg-emerald-500/[0.03]",
            )}
          >
            <div className="text-[13.5px] text-chalk-100">{advice.headline}</div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Chip tone={advice.recommendation === "finish-now" ? "emerald" : advice.recommendation === "resolve-first" ? "rose" : "amber"}>
                {advice.recommendation}
              </Chip>
              <Chip tone="neutral">shape: {advice.predictedShape}</Chip>
              <span className="text-[11.5px] text-chalk-300">
                {advice.recommendationReason}
              </span>
            </div>
            <div className="mt-1.5 text-[10.5px] text-chalk-400">
              advisor persona: {advice.personaId} · deterministic - computed
              from git facts + check lanes, no model output
            </div>
          </section>

          {/* flags */}
          {advice.flags.length > 0 ? (
            <section className="mb-3 rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4">
              <div className="text-[12.5px] font-semibold text-chalk-100">
                Concerns ({advice.flags.length})
              </div>
              <ul className="mt-2 space-y-2">
                {advice.flags.map((f, i) => (
                  <li key={`${f.id}-${i}`}>
                    <details>
                      <summary className="flex cursor-pointer items-center gap-2 text-[12.5px] text-chalk-100">
                        {f.severity === "warning" ? (
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-soft" strokeWidth={1.9} aria-hidden />
                        ) : (
                          <span className="text-chalk-400">·</span>
                        )}
                        <span>{f.summary}</span>
                        <Chip tone={f.severity === "warning" ? "amber" : "neutral"}>
                          {f.severity}
                        </Chip>
                      </summary>
                      <p className="ml-5 mt-1 text-[11.5px] text-chalk-300">{f.detail}</p>
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* facts: lanes, topology, conflicts */}
          <section className="mb-3 space-y-2 rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <LaneChips assurance={advice.assurance} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="mono max-w-[280px] truncate text-[10.5px] text-chalk-400">
                {advice.topology.branchName}
              </span>
              <TopologyTiles row={advice} />
            </div>
            {advice.preview ? (
              advice.preview.clean ? (
                <div className="text-[12.5px] text-emerald-400">
                  Dry-run merge applies cleanly.
                </div>
              ) : (
                <div className="text-[12.5px] text-rose-300">
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
                  <li key={s} className="mono text-[11px] text-chalk-300">
                    {s}
                  </li>
                ))}
              </ul>
            ) : null}
            <details>
              <summary className="cursor-pointer text-[11.5px] text-chalk-300">
                Developer detail
              </summary>
              <pre className="mono mt-1 whitespace-pre-wrap text-[11px] text-chalk-300">
                {advice.detail}
              </pre>
            </details>
          </section>

          {/* actions - the existing gated integrate/finish, unchanged semantics */}
          <section className="mb-3 rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4">
            <div className="text-[12.5px] font-semibold text-chalk-100">
              Act on it
            </div>
            <div className="mt-1 text-[11.5px] text-chalk-300">
              Integrating creates a dedicated branch (never main). Completing
              the merge runs a local git merge into main - explicit, gated,
              never pushed.
            </div>
            {advice.preview && !advice.preview.clean ? (
              <div className="mt-1 text-[11.5px] text-amber-soft">
                The dry-run conflicted: integrating will stop at the conflict
                and leave the integration worktree ready for you to resolve.
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={into}
                onChange={(e) => setInto(e.target.value)}
                placeholder="integration/branch"
                className="mono h-9 w-[200px] rounded-[14px] border border-[color:var(--line-strong)] bg-coal-800 px-3 py-2.5 text-[13px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none"
              />
              {/* Apply stays enabled on a conflicted preview - integrate
                  stops at the conflict and leaves a mergeable worktree, the
                  same in-UI resolve-first flow the Runs page offers (UI/CLI
                  parity; adversarial-review fix). */}
              <Button
                size="sm"
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
                className="border border-emerald-400/30 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
              >
                {busy === "apply" ? "Integrating…" : "Integrate this run"}
              </Button>
              {finishable ? (
                <Button
                  size="sm"
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
                  className="border border-violet-soft/40 bg-violet-soft/15 text-violet-soft hover:bg-violet-soft/25"
                >
                  {busy === "finish" ? "Merging…" : "Complete merge to main"}
                </Button>
              ) : null}
            </div>
            {msg ? (
              <div className="mt-2 text-[11.5px] text-emerald-400">{msg}</div>
            ) : null}
            {actionError ? (
              <div className="mt-2 text-[11.5px] text-rose-300">
                {actionError}
              </div>
            ) : null}
          </section>

          {/* Analyze deeper - optional LLM pass; advisory prose, never a
              merge verdict, never changes the recommendation above. */}
          <section className="rounded-[18px] border border-violet-soft/20 bg-violet-soft/[0.03] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] font-semibold text-chalk-100">
                Analyze deeper
              </span>
              <span className="text-[10.5px] text-chalk-400">
                optional · reads the diff with a local provider · advisory only
              </span>
              <Button
                size="sm"
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
                className="ml-auto border border-violet-soft/40 bg-violet-soft/15 text-violet-soft hover:bg-violet-soft/25"
              >
                {busy === "analyze" ? "Analyzing…" : analysis ? "Re-analyze" : "Analyze the diff"}
              </Button>
            </div>
            {analyzeError ? (
              <div className="mt-2 text-[11.5px] text-rose-300">{analyzeError}</div>
            ) : null}
            {analysis ? (
              <div className="mt-3">
                <div className="text-[12.5px] text-chalk-100">
                  {analysis.analysis.summary}
                </div>
                <div className="mt-1 text-[10.5px] text-chalk-400">
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
                      <li key={`${f.area}-${i}`} className="text-[12px] text-chalk-100">
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
                        <span className="font-semibold">{f.area}</span> - {f.detail}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-2 text-[12px] text-chalk-300">
                    No specific risks stood out in the diff.
                  </div>
                )}
                {analysis.analysis.caveats.length > 0 ? (
                  <div className="mt-2 text-[11px] text-chalk-400">
                    Could not verify: {analysis.analysis.caveats.join("; ")}
                  </div>
                ) : null}
                <div className="mt-2 text-[10px] text-chalk-400">
                  Advisory only - the recommendation above is unchanged.
                  Cached at {analysis.cachedArtifactPath}.
                </div>
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </PageShell>
  );
}

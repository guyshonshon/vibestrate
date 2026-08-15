import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, Check, Pause, Play, Square, X } from "lucide-react";
import { api } from "../../lib/api.js";
import { navigate } from "../../app/App.js";
import type { ApprovalRequest, RunState, RunStatus, VibestrateEvent } from "../../lib/types.js";
import { ActivityList, DiffBar, RadialStat, StageTimeline, StatusLabel } from "./viz.js";
import { statusMessage } from "../mission/runPhase.js";
import { Button } from "../design/Button.js";
import { Skeleton, SkeletonBlock, SkeletonRows } from "../design/Skeleton.js";
import { ErrorView } from "../../lib/error-view.js";
import { settle, errorOf, valueOr } from "../../lib/settled.js";

const ACTIVE: RunStatus[] = [
  "planning",
  "planned",
  "architecting",
  "architected",
  "executing",
  "validating",
  "reviewing",
  "fixing",
  "verifying",
  "waiting_for_approval",
  "paused",
];

const card = "rounded-[22px] border border-[color:var(--line)] bg-coal-600 p-6";
const tile = "rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-5";
const lbl = "text-[12px] font-semibold text-violet-vivid";

export function RunControlPage({ runId }: { runId: string }) {
  const [run, setRun] = useState<RunState | null>(null);
  const [events, setEvents] = useState<VibestrateEvent[]>([]);
  const [diff, setDiff] = useState<{ insertions: number; deletions: number; files: number } | null>(null);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  // This is a kiosk: someone stands in front of it and decides whether to
  // approve, abort or merge. Each sub-fetch is isolated so one failure does not
  // blank the screen, but none of them may fail invisibly - a swallowed diff
  // reads as "changed nothing", a swallowed approvals list hides the Approve /
  // Reject buttons entirely, and a swallowed run left the page stuck on
  // "Loading run…" forever. Keyed by panel so each renders its own recovery.
  const [panelErrors, setPanelErrors] = useState<{
    run?: unknown;
    events?: unknown;
    diff?: unknown;
    approvals?: unknown;
  }>({});
  // Bumping this re-runs the load effect, which is how Retry re-triggers a load
  // function defined inside the effect's closure.
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [r, ev, df, ap] = await Promise.all([
        settle(api.getRun(runId)),
        settle(api.listEvents(runId).then((e) => e.slice(-40))),
        settle(api.getDiff(runId).then((s) => (s ? { ...s.totals } : null))),
        settle(api.listApprovals(runId).then((l) => l.filter((a) => a.status === "pending"))),
      ]);
      if (cancelled) return;
      if (r.ok) setRun(r.value);
      setEvents(valueOr(ev, [] as VibestrateEvent[]));
      if (df.ok) setDiff(df.value);
      setApprovals(valueOr(ap, [] as ApprovalRequest[]));
      setPanelErrors({
        run: errorOf(r),
        events: errorOf(ev),
        diff: errorOf(df),
        approvals: errorOf(ap),
      });
    };
    void load();
    const id = window.setInterval(() => void load(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [runId, retryTick]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const act = async (kind: "pause" | "resume" | "abort") => {
    try {
      if (kind === "pause") await api.pauseRun(runId);
      else if (kind === "resume") await api.resumeRun(runId);
      else await api.abortRun(runId);
      setToast(`${kind} requested`);
    } catch (e) {
      setToast(e instanceof Error ? e.message : String(e));
    }
  };
  const decide = async (a: ApprovalRequest, approve: boolean) => {
    try {
      if (approve) await api.approveApproval({ runId, approvalId: a.id });
      else await api.rejectApproval({ runId, approvalId: a.id });
      setToast(approve ? "approved" : "rejected");
    } catch (e) {
      setToast(e instanceof Error ? e.message : String(e));
    }
  };

  if (!run) {
    // Never sit on "Loading" once we know the fetch failed - the kiosk would
    // otherwise spin forever on a deleted or unreachable run.
    if (panelErrors.run)
      return (
        <div className="font-jakarta min-h-screen bg-coal-900 px-10 py-7 text-chalk-100">
          <ErrorView
            err={panelErrors.run}
            actions={[
              { label: "Mission control", onClick: () => navigate({ kind: "mission" }) },
              { label: "All runs", onClick: () => navigate({ kind: "runs" }) },
            ]}
            onRetry={() => setRetryTick((t) => t + 1)}
          />
        </div>
      );
    return (
      <div className="font-jakarta min-h-screen bg-coal-900 text-chalk-100">
        <Skeleton label="Loading the run" className="mx-auto max-w-[1080px] px-10 py-7">
          <div className="mb-5 flex items-center justify-between">
            <SkeletonBlock h={28} w={148} />
            <SkeletonBlock tone="text" h={12} w={108} />
          </div>
          <div className={card}>
            <div className="flex items-start justify-between gap-5">
              <div className="flex min-w-0 flex-col gap-2">
                <SkeletonBlock tone="text" h={12} w={92} />
                <SkeletonBlock h={28} w={360} />
                <SkeletonBlock tone="text" h={12} w={220} />
              </div>
              <div className="flex shrink-0 gap-2">
                <SkeletonBlock h={42} w={124} radius={12} />
                <SkeletonBlock h={42} w={110} radius={12} />
              </div>
            </div>
            <SkeletonBlock className="mt-7" h={40} w="100%" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className={tile}>
              <SkeletonBlock tone="text" h={12} w={44} />
              <SkeletonBlock className="mt-3" h={22} w="72%" />
            </div>
            <div className={`${tile} flex items-center justify-center`}>
              <SkeletonBlock w={104} h={104} radius={999} />
            </div>
          </div>
          <div className={`${tile} mt-4`}>
            <SkeletonBlock tone="text" h={12} w={72} />
            <SkeletonRows className="mt-3" rows={5} lead="dot" trailing />
          </div>
        </Skeleton>
      </div>
    );
  }

  const isActive = ACTIVE.includes(run.status);
  const pending = approvals[0];
  const loops = run.maxReviewLoops > 0 ? run.reviewLoopCount / run.maxReviewLoops : 0;

  // Approve/Reject/Abort/Review-diff carry a status intent (affirm/destructive/
  // violet) that `design/Button` has no variant for, so they stay bare
  // intent-tinted ghosts (primitives-contract §4). Pause/Resume is a plain
  // neutral action, so it renders through `Button` instead.
  const controls = pending ? (
    <>
      <button onClick={() => decide(pending, true)} className="flex items-center gap-1.5 rounded-[12px] bg-emerald-500/15 px-4 py-2.5 text-[13px] font-bold text-emerald-400 hover:bg-emerald-500/25">
        <Check className="h-4 w-4" /> Approve
      </button>
      <button onClick={() => decide(pending, false)} className="flex items-center gap-1.5 rounded-[12px] bg-rose-500/15 px-4 py-2.5 text-[13px] font-bold text-rose-300 hover:bg-rose-500/25">
        <X className="h-4 w-4" /> Reject
      </button>
    </>
  ) : isActive ? (
    <>
      <Button
        variant="secondary"
        size="lg"
        onClick={() => act(run.pauseRequested ? "resume" : "pause")}
        iconLeft={run.pauseRequested ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
      >
        {run.pauseRequested ? "Resume" : "Pause"}
      </Button>
      <button onClick={() => act("abort")} className="flex items-center gap-1.5 rounded-[12px] px-4 py-2.5 text-[13px] font-semibold text-rose-300 hover:bg-rose-500/10">
        <Square className="h-4 w-4" /> Abort
      </button>
    </>
  ) : (
    <button onClick={() => navigate({ kind: "run", runId })} className="flex items-center gap-1.5 rounded-[12px] bg-violet-soft/15 px-4 py-2.5 text-[13px] font-bold text-violet-soft hover:bg-violet-soft/25">
      Review diff <ArrowUpRight className="h-4 w-4" />
    </button>
  );

  return (
    <div className="font-jakarta min-h-screen bg-coal-900 text-chalk-100">
      <div className="mx-auto max-w-[1080px] px-10 py-7">
        <div className="mb-5 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ kind: "mission" })}
            iconLeft={<ArrowLeft className="h-3.5 w-3.5" />}
          >
            Mission control
          </Button>
          <button onClick={() => navigate({ kind: "run", runId })} className="flex items-center gap-1 text-[12.5px] font-semibold text-violet-soft hover:text-violet-soft/80">
            Full inspector <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {toast ? (
          <div className="mb-4 rounded-[12px] border border-violet-soft/30 bg-violet-soft/10 px-4 py-2.5 text-[13px] text-chalk-100">{toast}</div>
        ) : null}

        {panelErrors.run ? (
          // We still have the last good snapshot, so the page renders - but the
          // status/timeline below is frozen at that snapshot, and on a kiosk a
          // stale "executing" must not be mistaken for a live one.
          <ErrorView
            compact
            className="mb-4"
            err={panelErrors.run}
            override={{
              title: "Run status is stale",
              hint: "The last refresh failed, so everything below is a snapshot. Retry to resume live updates.",
            }}
            onRetry={() => setRetryTick((t) => t + 1)}
          />
        ) : null}

        {panelErrors.approvals ? (
          <ErrorView
            compact
            className="mb-4"
            err={panelErrors.approvals}
            override={{
              title: "Can't load pending approvals",
              hint: "Approve / Reject are hidden until this loads. Retry, or decide from the full inspector.",
            }}
            onRetry={() => setRetryTick((t) => t + 1)}
          />
        ) : null}

        <div className={card}>
          <div className="flex items-start justify-between gap-5">
            <div className="min-w-0">
              <StatusLabel status={run.status} />
              <h1 className="mt-1.5 truncate text-[26px] font-extrabold tracking-[-0.02em] text-chalk-100">
                {run.displayName || run.task}
              </h1>
              <div className="mt-1 text-[13px] text-chalk-300">{statusMessage(run.status)}</div>
              {run.branchName ? (
                <div className="mt-1 truncate font-mono text-meta text-chalk-400">{run.branchName}</div>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">{controls}</div>
          </div>
          <div className="mt-7">
            <StageTimeline status={run.status} />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className={tile}>
            <div className={lbl}>Diff</div>
            <div className="mt-3">
              {/* +0/-0 reads as "this run changed nothing". When the fetch is
               * what failed, that is a lie about the artifact being reviewed. */}
              {panelErrors.diff ? (
                <ErrorView
                  compact
                  err={panelErrors.diff}
                  onRetry={() => setRetryTick((t) => t + 1)}
                  override={{
                    title: "Couldn't load the diff",
                    hint: "The change totals are unavailable, not zero.",
                  }}
                />
              ) : (
                <DiffBar diff={diff} />
              )}
            </div>
          </div>
          <div className={`${tile} flex items-center`}>
            <RadialStat value={loops} center={`${run.reviewLoopCount}/${run.maxReviewLoops}`} label="review loops" />
          </div>
        </div>

        <div className={`mt-4 ${card}`}>
          <h2 className={`mb-3 ${lbl}`}>Activity</h2>
          {panelErrors.events ? (
            <ErrorView
              compact
              err={panelErrors.events}
              onRetry={() => setRetryTick((t) => t + 1)}
              override={{
                title: "Couldn't load recent activity",
                hint: "The run may still be progressing - this feed is stale, not empty.",
              }}
            />
          ) : (
            <ActivityList events={events} max={10} />
          )}
        </div>
      </div>
    </div>
  );
}

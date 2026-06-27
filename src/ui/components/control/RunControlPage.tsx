import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, Check, Pause, Play, Square, X } from "lucide-react";
import { api } from "../../lib/api.js";
import { navigate } from "../../app/App.js";
import type { ApprovalRequest, RunState, RunStatus, VibestrateEvent } from "../../lib/types.js";
import { ActivityList, DiffBar, RadialStat, StageTimeline, StatusLabel } from "./viz.js";

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

const card = "rounded-[22px] border border-white/[0.06] bg-coal-600 p-6";
const tile = "rounded-[18px] border border-white/[0.06] bg-coal-600 p-5";
const lbl = "text-[12px] font-semibold text-chalk-400";

export function RunControlPage({ runId }: { runId: string }) {
  const [run, setRun] = useState<RunState | null>(null);
  const [events, setEvents] = useState<VibestrateEvent[]>([]);
  const [diff, setDiff] = useState<{ insertions: number; deletions: number; files: number } | null>(null);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [r, ev, df, ap] = await Promise.all([
        api.getRun(runId).catch(() => null),
        api.listEvents(runId).then((e) => e.slice(-40)).catch(() => [] as VibestrateEvent[]),
        api.getDiff(runId).then((s) => (s ? { ...s.totals } : null)).catch(() => null),
        api.listApprovals(runId).then((l) => l.filter((a) => a.status === "pending")).catch(() => [] as ApprovalRequest[]),
      ]);
      if (cancelled) return;
      if (r) setRun(r);
      setEvents(ev);
      setDiff(df);
      setApprovals(ap);
    };
    void load();
    const id = window.setInterval(() => void load(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [runId]);

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
    return (
      <div className="font-jakarta flex min-h-screen items-center justify-center bg-coal-800 text-chalk-400">
        Loading run…
      </div>
    );
  }

  const isActive = ACTIVE.includes(run.status);
  const pending = approvals[0];
  const loops = run.maxReviewLoops > 0 ? run.reviewLoopCount / run.maxReviewLoops : 0;

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
      <button onClick={() => act(run.pauseRequested ? "resume" : "pause")} className="flex items-center gap-1.5 rounded-[12px] bg-coal-500 px-4 py-2.5 text-[13px] font-semibold text-chalk-100 hover:bg-coal-400">
        {run.pauseRequested ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        {run.pauseRequested ? "Resume" : "Pause"}
      </button>
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
          <button onClick={() => navigate({ kind: "mission" })} className="flex items-center gap-2 text-[13px] font-semibold text-chalk-400 hover:text-chalk-100">
            <ArrowLeft className="h-4 w-4" /> Mission control
          </button>
          <button onClick={() => navigate({ kind: "run", runId })} className="flex items-center gap-1 text-[12.5px] font-semibold text-violet-soft hover:text-violet-soft/80">
            Full inspector <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {toast ? (
          <div className="mb-4 rounded-[12px] border border-violet-soft/30 bg-violet-soft/10 px-4 py-2.5 text-[13px] text-chalk-100">{toast}</div>
        ) : null}

        {/* hero band (v2) */}
        <div className={card}>
          <div className="flex items-start justify-between gap-5">
            <div className="min-w-0">
              <StatusLabel status={run.status} />
              <h1 className="mt-1.5 truncate text-[26px] font-extrabold tracking-[-0.02em] text-white">
                {run.displayName || run.task}
              </h1>
              {run.branchName ? (
                <div className="mt-1.5 truncate font-mono text-[11.5px] text-chalk-400">{run.branchName}</div>
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
              <DiffBar diff={diff} />
            </div>
          </div>
          <div className={`${tile} flex items-center`}>
            <RadialStat value={loops} center={`${run.reviewLoopCount}/${run.maxReviewLoops}`} label="review loops" />
          </div>
        </div>

        <div className={`mt-4 ${card}`}>
          <h2 className="mb-3 text-[15px] font-bold text-chalk-100">Activity</h2>
          <ActivityList events={events} max={10} />
        </div>
      </div>
    </div>
  );
}

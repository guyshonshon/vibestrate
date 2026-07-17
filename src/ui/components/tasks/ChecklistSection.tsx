import { useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  GripVertical,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../../lib/api.js";
import { reorderByDrop } from "../../lib/reorder.js";
import type { ChecklistItem, Task, TaskComment } from "../../lib/types.js";
import { Button } from "../design/Button.js";
import { cn } from "../design/cn.js";
import { Section } from "../layout/PageShell.js";
import { StepDetailDrawer } from "./StepDetailDrawer.js";
import { CARD, INPUT } from "./sectionChrome.js";

export function ChecklistSection({
  task,
  comments,
  onChanged,
  onOpenTask,
  onOpenRun,
}: {
  task: Task;
  comments: TaskComment[];
  onChanged: () => Promise<void> | void;
  onOpenTask: (taskId: string) => void;
  onOpenRun: (runId: string) => void;
}) {
  const items = task.checklist ?? [];
  const [openStepId, setOpenStepId] = useState<string | null>(null);
  const openStep = openStepId
    ? (items.find((i) => i.id === openStepId) ?? null)
    : null;
  const [text, setText] = useState("");
  const [objective, setObjective] = useState("");
  const [acceptance, setAcceptance] = useState("");
  const [fileHintsInput, setFileHintsInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [proposed, setProposed] = useState<string[] | null>(null);
  const [planQ, setPlanQ] = useState<{
    questions: {
      id: string;
      question: string;
      why: string;
      kind: "choice" | "text";
      options: string[];
    }[];
    answers: Record<string, string>;
  } | null>(null);
  const [stepMode, setStepMode] = useState(false);
  const [launched, setLaunched] = useState<string | null>(null);
  // Manual step authoring is the escape hatch, not the default - the supervisor
  // plans the breakdown. The form stays hidden until the user opts into it.
  const [manualAdd, setManualAdd] = useState(false);
  const done = items.filter((i) => i.status === "done").length;
  const pending = items.filter((i) => i.status !== "done").length;
  const pct = items.length === 0 ? 0 : Math.round((done / items.length) * 100);

  async function pickup() {
    setLaunched(null);
    await run("pickup", async () => {
      await api.spawnRun({
        task: task.title,
        taskId: task.id,
        flow: { id: "pickup" },
        checklistMode: stepMode ? "step" : "continuous",
      });
      setLaunched(
        `Pick-up run started (${stepMode ? "step-by-step" : "continuous"}). Watch it in Runs / Mission Control.`,
      );
    });
  }

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    await run("add", async () => {
      if (task.runMode === "supervised") {
        const fileHints = fileHintsInput
          .split(",")
          .map((f) => f.trim())
          .filter((f) => f.length > 0);
        await api.addChecklistItem(task.id, t, {
          objective: objective.trim() || undefined,
          acceptanceCheck: acceptance.trim() || undefined,
          fileHints: fileHints.length > 0 ? fileHints : undefined,
        });
        setObjective("");
        setAcceptance("");
        setFileHintsInput("");
      } else {
        await api.addChecklistItem(task.id, t);
      }
      setText("");
    });
  }

  // Enhance is a toggle: while it's thinking, clicking again aborts it. The
  // abort cancels the in-flight request (the client stops waiting and discards
  // any result); it does not claim to halt server-side compute.
  const enhanceCtl = useRef<AbortController | null>(null);
  async function enhance(answers?: { question: string; answer: string }[]) {
    if (busy === "enhance") {
      enhanceCtl.current?.abort();
      return;
    }
    setProposed(null);
    const ctl = new AbortController();
    enhanceCtl.current = ctl;
    setBusy("enhance");
    setError(null);
    try {
      const r = await api.enhanceChecklist(task.id, {
        apply: false,
        answers,
        signal: ctl.signal,
      });
      setProposed(r.proposal.items);
      await onChanged();
    } catch (e) {
      if (!(e instanceof Error) || e.name !== "AbortError") {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(null);
      enhanceCtl.current = null;
    }
  }

  // Guided plan: ask a bounded round of clarifying questions first, then break
  // down using the answers. If the model has nothing to ask, go straight to the
  // breakdown (seamless).
  const planCtl = useRef<AbortController | null>(null);
  async function startPlan() {
    if (busy === "plan") {
      planCtl.current?.abort();
      return;
    }
    setProposed(null);
    setPlanQ(null);
    const ctl = new AbortController();
    planCtl.current = ctl;
    setBusy("plan");
    setError(null);
    try {
      const r = await api.planQuestions(task.id, { signal: ctl.signal });
      if (r.proposal.questions.length === 0) {
        setBusy(null);
        planCtl.current = null;
        await enhance();
        return;
      }
      setPlanQ({ questions: r.proposal.questions, answers: {} });
    } catch (e) {
      if (!(e instanceof Error) || e.name !== "AbortError") {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy((b) => (b === "plan" ? null : b));
      planCtl.current = null;
    }
  }

  async function buildFromAnswers() {
    const pq = planQ;
    if (!pq) return;
    const answers = pq.questions
      .map((q) => ({ question: q.question, answer: (pq.answers[q.id] ?? "").trim() }))
      .filter((a) => a.answer.length > 0);
    setPlanQ(null);
    await enhance(answers.length > 0 ? answers : undefined);
  }

  async function acceptProposed() {
    const toAdd = proposed ?? [];
    await run("accept", async () => {
      for (const t of toAdd) {
        await api.addChecklistItem(task.id, t);
      }
      setProposed(null);
    });
  }

  // Drop `draggingId` at the position currently occupied by `targetId`.
  function reorderTo(targetId: string) {
    const dragId = draggingId;
    setDraggingId(null);
    setOverId(null);
    if (!dragId || dragId === targetId) return;
    const before = items.map((i) => i.id);
    const after = reorderByDrop(before, dragId, targetId);
    if (after.join("") === before.join("")) return;
    void run(`move-${dragId}`, () => api.reorderChecklist(task.id, after));
  }

  return (
    <>
    {openStep ? (
      <StepDetailDrawer
        task={task}
        item={openStep}
        comments={comments}
        onClose={() => setOpenStepId(null)}
        onChanged={onChanged}
        onOpenRun={onOpenRun}
        onPromote={() => {
          // Already detached: navigate to the card. Else detach it now.
          if (openStep.promotedTaskId) {
            onOpenTask(openStep.promotedTaskId);
            return;
          }
          void run(`p-${openStep.id}`, () =>
            api.promoteChecklistItem(task.id, openStep.id),
          );
        }}
      />
    ) : null}
    <Section
      title={
        <span className="flex items-center gap-2.5">
          Checklist
          {items.length > 0 ? (
            <>
              <span className="font-mono text-[11px] font-medium tabular-nums text-chalk-300">
                {done}/{items.length}
              </span>
              <span className="h-1 w-24 overflow-hidden rounded-full bg-coal-500">
                <span
                  className="block h-full bg-emerald-400 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </span>
            </>
          ) : null}
        </span>
      }
      action={
        <button
          type="button"
          onClick={() => enhance()}
          disabled={busy !== null && busy !== "enhance"}
          title={
            busy === "enhance"
              ? "Thinking… click to abort"
              : "Propose a checklist with an AI assist (read-only - you choose whether to add the items)"
          }
          className={cn(
            "inline-flex items-center gap-1 rounded-[10px] px-2 py-1 text-[11.5px] font-semibold transition disabled:opacity-50",
            busy === "enhance"
              ? "bg-rose-500/10 text-rose-300 hover:bg-rose-500/15"
              : "bg-violet-soft/10 text-violet-soft hover:bg-violet-soft/15",
          )}
        >
          {busy === "enhance" ? (
            <X className="h-3 w-3" strokeWidth={1.9} />
          ) : (
            <Sparkles className="h-3 w-3" strokeWidth={1.9} />
          )}
          {busy === "enhance" ? "Abort" : "Enhance"}
        </button>
      }
    >
      <div className={CARD}>
        {proposed ? (
          <div className="mb-2.5 rounded-[12px] border border-violet-soft/25 bg-violet-soft/10 p-2.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-violet-soft">
                Proposed ({proposed.length}) - not added yet
              </span>
              <button
                type="button"
                onClick={acceptProposed}
                disabled={busy !== null || proposed.length === 0}
                className="ml-auto rounded-[8px] bg-violet-soft/15 px-2 py-0.5 text-[11px] font-semibold text-violet-soft transition hover:bg-violet-soft/25 disabled:opacity-50"
              >
                {busy === "accept" ? "Adding…" : "Add all"}
              </button>
              <button
                type="button"
                onClick={() => setProposed(null)}
                disabled={busy !== null}
                className="rounded-[8px] bg-coal-600 px-2 py-0.5 text-[11px] text-chalk-300 transition hover:text-chalk-100 disabled:opacity-50"
              >
                Dismiss
              </button>
            </div>
            <ol className="mt-1.5 space-y-0.5">
              {proposed.map((t, i) => (
                <li key={i} className="text-[12px] text-chalk-100">
                  <span className="font-mono text-chalk-400">{i + 1}.</span> {t}
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {/* Guided plan: the clarifying-questions round before the breakdown. */}
        {planQ ? (
          <div className="mb-2.5 rounded-[12px] border border-violet-soft/25 bg-violet-soft/[0.06] p-3">
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-violet-soft" strokeWidth={1.9} />
              <span className="text-[12px] font-semibold text-chalk-100">
                A few questions before I break this down
              </span>
              <span className="text-[10.5px] text-chalk-400">
                answer what you can - skip the rest
              </span>
            </div>
            <div className="space-y-2.5">
              {planQ.questions.map((q) => (
                <div key={q.id}>
                  <div className="text-[12px] font-medium text-chalk-100">{q.question}</div>
                  {q.why ? (
                    <div className="text-[10.5px] text-chalk-400">{q.why}</div>
                  ) : null}
                  {q.kind === "choice" && q.options.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {q.options.map((opt) => {
                        const active = planQ.answers[q.id] === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() =>
                              setPlanQ((p) =>
                                p
                                  ? {
                                      ...p,
                                      answers: {
                                        ...p.answers,
                                        [q.id]: active ? "" : opt,
                                      },
                                    }
                                  : p,
                              )
                            }
                            className={cn(
                              "rounded-[9px] border px-2.5 py-1 text-[11.5px] transition",
                              active
                                ? "border-violet-soft/50 bg-violet-soft/15 text-violet-soft"
                                : "border-[color:var(--line-soft)] bg-coal-500 text-chalk-300 hover:text-chalk-100",
                            )}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <input
                      value={planQ.answers[q.id] ?? ""}
                      onChange={(e) =>
                        setPlanQ((p) =>
                          p
                            ? { ...p, answers: { ...p.answers, [q.id]: e.target.value } }
                            : p,
                        )
                      }
                      placeholder="Your answer…"
                      className={cn(INPUT, "mt-1.5 w-full")}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={buildFromAnswers}
                disabled={busy !== null}
                iconLeft={<Sparkles className="h-3 w-3" strokeWidth={1.9} />}
              >
                Build the steps
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPlanQ(null);
                  void enhance();
                }}
                disabled={busy !== null}
              >
                Skip, just break it down
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => setPlanQ(null)}
                disabled={busy !== null}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {items.length === 0 && !proposed && !planQ && !manualAdd ? (
          <div className="flex flex-col items-start gap-2.5 rounded-[12px] border border-violet-soft/25 bg-violet-soft/[0.06] px-4 py-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-soft" strokeWidth={1.9} />
              <span className="text-[13px] font-semibold text-chalk-100">
                Let the supervisor plan this
              </span>
            </div>
            <p className="max-w-[46ch] text-[12px] leading-relaxed text-chalk-300">
              Describe what you want in the task above (and any references). The
              supervisor asks a couple of clarifying questions, then breaks it into
              an ordered set of steps you can review, reorder and run - you don't
              have to write every step by hand.
            </p>
            <div className="mt-0.5 flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={startPlan}
                disabled={busy !== null && busy !== "plan"}
                iconLeft={
                  busy === "plan" ? (
                    <X className="h-3 w-3" strokeWidth={1.9} />
                  ) : (
                    <Sparkles className="h-3 w-3" strokeWidth={1.9} />
                  )
                }
              >
                {busy === "plan" ? "Thinking… abort" : "Plan the steps"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setManualAdd(true)}
                iconLeft={<Plus className="h-3 w-3" strokeWidth={1.9} />}
              >
                Add manually
              </Button>
            </div>
          </div>
        ) : null}

        {items.length > 0 ? (
          <ul className="space-y-1" onDragOver={(e) => e.preventDefault()}>
            {items.map((item) => (
              <ChecklistRow
                key={item.id}
                item={item}
                isSaga={task.runMode === "supervised"}
                busy={busy}
                dragging={draggingId === item.id}
                dragOver={overId === item.id && draggingId !== item.id}
                onDragStart={() => setDraggingId(item.id)}
                onDragEnter={() => {
                  if (draggingId && draggingId !== item.id) setOverId(item.id);
                }}
                onDragEnd={() => {
                  setDraggingId(null);
                  setOverId(null);
                }}
                onDrop={() => reorderTo(item.id)}
                onToggle={() =>
                  run(`s-${item.id}`, () =>
                    api.updateChecklistItem(task.id, item.id, {
                      status: item.status === "done" ? "pending" : "done",
                    }),
                  )
                }
                onRemove={() =>
                  run(`r-${item.id}`, () =>
                    api.removeChecklistItem(task.id, item.id),
                  )
                }
                onOpen={() => setOpenStepId(item.id)}
              />
            ))}
          </ul>
        ) : null}

        {items.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-[12px] border border-[color:var(--line-soft)] bg-coal-500 px-2.5 py-2">
            <button
              type="button"
              onClick={pickup}
              disabled={busy !== null || pending === 0}
              title="Execute the checklist item-by-item in one run (a commit per item)."
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-violet-soft/15 px-2.5 py-1 text-[12px] font-semibold text-violet-soft transition hover:bg-violet-soft/25 disabled:opacity-50"
            >
              {busy === "pickup"
                ? "Starting…"
                : `Run checklist (${pending} item${pending === 1 ? "" : "s"})`}
            </button>
            <label className="flex items-center gap-1.5 text-[11.5px] text-chalk-300">
              <input
                type="checkbox"
                checked={stepMode}
                onChange={(e) => setStepMode(e.target.checked)}
                className="h-3.5 w-3.5 accent-violet-soft"
              />
              step-by-step
            </label>
            {launched ? (
              <span className="text-[10.5px] text-emerald-400">{launched}</span>
            ) : (
              <span className="ml-auto text-[10.5px] text-chalk-400">
                one worktree · a commit per item · summaries carried forward
              </span>
            )}
          </div>
        ) : null}

        {/* Manual authoring is the escape hatch: a reveal button when steps
            exist, the form itself only when opted in. */}
        {items.length > 0 && !manualAdd ? (
          <button
            type="button"
            onClick={() => setManualAdd(true)}
            className="mt-2.5 inline-flex items-center gap-1.5 text-[12px] font-medium text-chalk-300 transition hover:text-chalk-100"
          >
            <Plus className="h-3 w-3" strokeWidth={1.9} /> Add a step manually
          </button>
        ) : null}

        {manualAdd ? (
          <form onSubmit={add} className="mt-2.5 flex gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Step title…"
                autoFocus
                className={cn(INPUT, "flex-1")}
              />
              {task.runMode === "supervised" ? (
                <>
                  <input
                    value={objective}
                    onChange={(e) => setObjective(e.target.value)}
                    placeholder="Objective (optional)…"
                    className={cn(INPUT, "flex-1")}
                  />
                  <input
                    value={acceptance}
                    onChange={(e) => setAcceptance(e.target.value)}
                    placeholder="Acceptance check (optional)…"
                    className={cn(INPUT, "flex-1")}
                  />
                  <input
                    value={fileHintsInput}
                    onChange={(e) => setFileHintsInput(e.target.value)}
                    placeholder="File hints (comma-separated, optional)…"
                    className={cn(INPUT, "flex-1")}
                  />
                </>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                disabled={busy === "add" || !text.trim()}
                iconLeft={<Plus className="h-3 w-3" strokeWidth={1.9} />}
              >
                {busy === "add" ? "Adding…" : "Add"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setManualAdd(false)}
              >
                Done
              </Button>
            </div>
          </form>
        ) : null}

        {error ? (
          <div className="mt-2 rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-[11.5px] text-rose-300">
            {error}
          </div>
        ) : null}
      </div>
    </Section>
    </>
  );
}

function ChecklistRow({
  item,
  isSaga,
  busy,
  dragging,
  dragOver,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDrop,
  onToggle,
  onRemove,
  onOpen,
}: {
  item: ChecklistItem;
  isSaga: boolean;
  busy: string | null;
  dragging: boolean;
  dragOver: boolean;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
  onToggle: () => void;
  onRemove: () => void;
  onOpen: () => void;
}) {
  // Drag is initiated only from the grip handle. We flip the row's draggable
  // flag on grip mousedown.
  const [grabbed, setGrabbed] = useState(false);
  const anyBusy = busy !== null;
  const done = item.status === "done";
  // Status beyond the done-check is RUN-DERIVED (the run drives in_progress /
  // blocked); it is shown read-only, never as an editable control.
  const runState =
    item.status === "in_progress"
      ? { label: "running", tone: "text-violet-soft" }
      : item.status === "blocked"
        ? { label: "blocked", tone: "text-amber-soft" }
        : null;
  const hasDetail = !!(
    isSaga &&
    (item.objective || item.acceptanceCheck || item.fileHints?.length)
  );

  return (
    <li
      draggable={grabbed}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragEnd={() => {
        setGrabbed(false);
        onDragEnd();
      }}
      onDrop={(e) => {
        e.preventDefault();
        setGrabbed(false);
        onDrop();
      }}
      onClick={onOpen}
      role="button"
      title="Open this step"
      className={cn(
        "group flex cursor-pointer gap-2 rounded-[10px] border bg-coal-500 px-2.5 py-2 transition hover:border-violet-soft/40 hover:bg-coal-500/70",
        hasDetail ? "items-start" : "items-center",
        dragging
          ? "border-violet-soft/50 opacity-50"
          : dragOver
            ? "border-violet-soft/60 ring-1 ring-violet-soft/40"
            : "border-[color:var(--line-soft)]",
      )}
    >
      <span
        role="button"
        aria-label="Drag to reorder"
        title="Drag to reorder"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={() => setGrabbed(true)}
        onMouseUp={() => setGrabbed(false)}
        className={cn(
          "shrink-0 cursor-grab text-chalk-500 opacity-0 transition hover:text-chalk-200 active:cursor-grabbing group-hover:opacity-100",
          hasDetail && "mt-0.5",
        )}
      >
        <GripVertical className="h-3.5 w-3.5" strokeWidth={1.9} />
      </span>
      {/* Done-check: a real V checkbox, the only manual status transition. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        disabled={anyBusy}
        aria-pressed={done}
        title={done ? "Mark not done" : "Mark done"}
        className={cn(
          "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] border transition disabled:opacity-50",
          hasDetail && "mt-0.5",
          done
            ? "border-emerald-400 bg-emerald-400 text-coal-900"
            : "border-[color:var(--line-strong)] text-transparent hover:border-emerald-400/60",
        )}
      >
        <Check className="h-3 w-3" strokeWidth={2.6} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "min-w-0 truncate text-[12.5px]",
              done ? "text-chalk-400 line-through" : "text-chalk-100",
            )}
          >
            {item.text}
          </span>
          {runState ? (
            <span className={cn("shrink-0 font-mono text-[10px]", runState.tone)}>
              {runState.label}
            </span>
          ) : null}
          {item.promotedTaskId ? (
            <span className="shrink-0 font-mono text-[10px] text-chalk-400">
              detached
            </span>
          ) : null}
        </div>
        {isSaga && item.objective ? (
          <div className="mt-0.5 truncate text-[10.5px]">
            <span className="font-medium text-violet-soft">objective</span>{" "}
            <span className="text-chalk-300">{item.objective}</span>
          </div>
        ) : null}
        {isSaga && item.acceptanceCheck ? (
          <div className="truncate text-[10.5px]">
            <span className="font-medium text-violet-soft">accept</span>{" "}
            <span className="text-chalk-300">{item.acceptanceCheck}</span>
          </div>
        ) : null}
        {isSaga && item.fileHints?.length ? (
          <div className="truncate text-[10.5px]">
            <span className="font-medium text-violet-soft">files</span>{" "}
            <span className="text-chalk-300">{item.fileHints.join(", ")}</span>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        disabled={anyBusy}
        title="Remove step"
        className={cn(
          "shrink-0 text-chalk-500 opacity-0 transition hover:text-rose-300 disabled:opacity-50 group-hover:opacity-100",
          hasDetail && "mt-0.5",
        )}
      >
        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.9} />
      </button>
      {/* Prominent "configure this step" affordance. */}
      <ChevronRight
        className={cn(
          "h-4 w-4 shrink-0 text-chalk-500 transition group-hover:text-violet-soft",
          hasDetail && "mt-0.5",
        )}
        strokeWidth={2}
        aria-hidden
      />
    </li>
  );
}

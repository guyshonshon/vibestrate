import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  ExternalLink,
  GitBranch,
  Lock,
  Plus,
  X,
} from "lucide-react";
import { api } from "../../lib/api.js";
import { cn } from "../design/cn.js";
import { Button } from "../design/Button.js";
import { Select } from "../design/Select.js";
import { Chip, type ChipTone } from "../design/Chip.js";
import type {
  ChecklistItem,
  ChecklistItemStatus,
  Task,
  TaskComment,
} from "../../lib/types.js";

// Local recipes (match TaskDetailPage idiom; contract §6).
const INPUT =
  "rounded-[12px] border border-[color:var(--line-strong)] bg-coal-800 px-3 py-2 text-[13px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none";
const CARD = "rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4";

const STEP_STATUSES: ChecklistItemStatus[] = [
  "pending",
  "in_progress",
  "done",
  "blocked",
];

function statusTone(s: ChecklistItemStatus): ChipTone {
  return s === "done"
    ? "emerald"
    : s === "in_progress"
      ? "violet"
      : s === "blocked"
        ? "amber"
        : "neutral";
}

// A labelled section heading inside the drawer body. Colour-carried label
// (contract: labels carry colour, not grey).
function Block({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="font-mono text-[11px] font-medium text-violet-soft">
          {label}
        </span>
        {hint ? <span className="text-[10.5px] text-chalk-400">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

// One read-only "inherited from parent" row: a coloured label, the value, and a
// jump-to-parent affordance. The parent OWNS this; the step only shows it.
function InheritedRow({
  label,
  value,
  empty,
}: {
  label: string;
  value: React.ReactNode;
  empty?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[color:var(--line-soft)] py-[7px] text-[12px] last:border-0">
      <span className="shrink-0 text-chalk-300">{label}</span>
      <span
        className={cn(
          "min-w-0 text-right",
          empty ? "text-chalk-400" : "font-medium text-chalk-100",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * The per-step detail surface - "a task in a task". Opens as a right-side drawer
 * over the parent task page so the parent context stays visible behind it.
 *
 * The split the owner asked for:
 *  - The PARENT owns the shared scaffolding (context, flow + crew, git, runs,
 *    blockers). Here it is shown READ-ONLY, labelled "from parent" - the step
 *    inherits it, it does not own a copy.
 *  - The step OWNS its authoring (title/objective/accept/file hints), its
 *    status, its run outcome (supervised runs only), and its own comments.
 */
export function StepDetailDrawer({
  task,
  item,
  comments,
  onClose,
  onChanged,
  onOpenRun,
  onPromote,
}: {
  task: Task;
  item: ChecklistItem;
  comments: TaskComment[];
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  onOpenRun: (runId: string) => void;
  onPromote: () => void;
}) {
  const isSupervised = task.runMode === "supervised";
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Editable authoring drafts, kept in sync when the item changes underneath us.
  const [title, setTitle] = useState(item.text);
  const [objective, setObjective] = useState(item.objective ?? "");
  const [acceptance, setAcceptance] = useState(item.acceptanceCheck ?? "");
  const [fileHints, setFileHints] = useState((item.fileHints ?? []).join(", "));
  const [newComment, setNewComment] = useState("");
  useEffect(() => {
    setTitle(item.text);
    setObjective(item.objective ?? "");
    setAcceptance(item.acceptanceCheck ?? "");
    setFileHints((item.fileHints ?? []).join(", "));
  }, [item.id, item.text, item.objective, item.acceptanceCheck, item.fileHints]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // This step's own comments: target "step" + targetRef === item id. The parent
  // page already loaded every comment; we just project here.
  const stepComments = useMemo(
    () =>
      comments
        .filter((c) => c.target === "step" && c.targetRef === item.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [comments, item.id],
  );

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

  const dirty =
    title.trim() !== item.text ||
    objective.trim() !== (item.objective ?? "") ||
    acceptance.trim() !== (item.acceptanceCheck ?? "") ||
    fileHints.trim() !== (item.fileHints ?? []).join(", ");

  async function saveAuthoring() {
    const t = title.trim();
    if (!t) return;
    const hints = fileHints
      .split(",")
      .map((f) => f.trim())
      .filter((f) => f.length > 0);
    await run("save", () =>
      api.updateChecklistItem(task.id, item.id, {
        text: t,
        objective: objective.trim(),
        acceptanceCheck: acceptance.trim(),
        fileHints: hints,
      }),
    );
  }

  async function addComment() {
    const body = newComment.trim();
    if (!body) return;
    await run("comment", async () => {
      await api.addTaskComment({
        taskId: task.id,
        body,
        target: "step",
        targetRef: item.id,
      });
      setNewComment("");
    });
  }

  const blockers = task.dependencies ?? [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      {/* Scrim - clicking it closes, parent context stays visible behind. */}
      <button
        type="button"
        aria-label="Close step"
        onClick={onClose}
        className="absolute inset-0 bg-coal-900/60 backdrop-blur-[1px]"
      />
      <div className="relative flex h-full w-full max-w-[560px] flex-col border-l border-[color:var(--line)] bg-coal-700 shadow-2xl">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-[color:var(--line)] px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10.5px] font-medium text-chalk-400">
                step in {task.id}
              </span>
              <Chip tone={statusTone(item.status)} contained>
                {item.status.replace(/_/g, " ")}
              </Chip>
              {item.provenance === "conductor" ? (
                <Chip tone="violet" contained>
                  conductor
                </Chip>
              ) : null}
            </div>
            <div className="mt-1 truncate text-[14px] font-semibold text-chalk-100">
              {item.text}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-[8px] p-1 text-chalk-400 transition hover:bg-coal-500 hover:text-chalk-100"
          >
            <X className="h-4 w-4" strokeWidth={1.9} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* ── Authoring (step-owned, editable) ──────────────────── */}
          <Block label="this step" hint="what this unit of work is">
            <div className={cn(CARD, "space-y-2")}>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Step title…"
                className={cn(INPUT, "w-full")}
              />
              {isSupervised ? (
                <>
                  <input
                    value={objective}
                    onChange={(e) => setObjective(e.target.value)}
                    placeholder="Objective (what done looks like)…"
                    className={cn(INPUT, "w-full")}
                  />
                  <input
                    value={acceptance}
                    onChange={(e) => setAcceptance(e.target.value)}
                    placeholder="Acceptance check…"
                    className={cn(INPUT, "w-full")}
                  />
                  <input
                    value={fileHints}
                    onChange={(e) => setFileHints(e.target.value)}
                    placeholder="File hints (comma-separated)…"
                    className={cn(INPUT, "w-full")}
                  />
                </>
              ) : (
                <p className="text-[11px] text-chalk-400">
                  Objective / acceptance / file hints apply to supervised tasks -
                  switch this task to supervised to author per-step detail.
                </p>
              )}
              <div className="flex items-center gap-2 pt-0.5">
                <Select
                  value={item.status}
                  ariaLabel="Step status"
                  className="min-w-[130px]"
                  disabled={busy !== null}
                  onChange={(v) =>
                    run("status", () =>
                      api.updateChecklistItem(task.id, item.id, {
                        status: v as ChecklistItemStatus,
                      }),
                    )
                  }
                  options={STEP_STATUSES.map((s) => ({ value: s, label: s }))}
                />
                <Button
                  variant="primary"
                  size="sm"
                  className="ml-auto"
                  disabled={busy !== null || !dirty || !title.trim()}
                  onClick={saveAuthoring}
                >
                  {busy === "save" ? "Saving…" : dirty ? "Save" : "Saved"}
                </Button>
              </div>
            </div>
          </Block>

          {/* ── Step activity (step-owned outcome) ────────────────── */}
          <Block label="step activity" hint="the run that executed this step">
            <div className={CARD}>
              {item.runId ? (
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => onOpenRun(item.runId!)}
                    className="inline-flex items-center gap-1.5 font-mono text-[12px] text-chalk-300 transition hover:text-chalk-100"
                  >
                    <ExternalLink className="h-3 w-3" strokeWidth={1.9} />
                    {item.runId}
                  </button>
                  {item.outcomeSummary ? (
                    <p className="text-[12px] text-chalk-200">{item.outcomeSummary}</p>
                  ) : null}
                  {item.commitSha ? (
                    <div className="font-mono text-[11px] text-chalk-400">
                      commit {item.commitSha.slice(0, 10)}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="text-[12px] text-chalk-400">
                  {isSupervised
                    ? "Not run yet. A supervised run sequences this step and records its outcome here."
                    : "Plain tasks run holistically - per-step run outcomes are recorded for supervised tasks."}
                </div>
              )}
            </div>
          </Block>

          {/* ── Inherited from parent (read-only) ─────────────────── */}
          <Block label="from parent" hint="shared scaffolding the parent owns">
            <div className={CARD}>
              <InheritedRow
                label="Context"
                value={
                  task.contextSources && task.contextSources.length > 0
                    ? `${task.contextSources.length} source${task.contextSources.length === 1 ? "" : "s"}`
                    : "none"
                }
                empty={!task.contextSources || task.contextSources.length === 0}
              />
              <InheritedRow
                label="Crew"
                value={
                  task.assignedRoles.length > 0
                    ? task.assignedRoles.join(", ")
                    : "default"
                }
                empty={task.assignedRoles.length === 0}
              />
              <InheritedRow
                label="Git"
                value={
                  task.branchName ? (
                    <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                      <GitBranch className="h-3 w-3" strokeWidth={1.9} />
                      {task.branchName}
                    </span>
                  ) : (
                    "no branch yet"
                  )
                }
                empty={!task.branchName}
              />
              <InheritedRow
                label="Blockers"
                value={
                  blockers.length > 0 ? (
                    <span className="inline-flex items-center gap-1 text-amber-soft">
                      <Lock className="h-3 w-3" strokeWidth={1.9} />
                      {blockers.length} blocking task
                      {blockers.length === 1 ? "" : "s"}
                    </span>
                  ) : (
                    "none - parent can run"
                  )
                }
                empty={blockers.length === 0}
              />
              <p className="mt-2 text-[10.5px] leading-relaxed text-chalk-400">
                The parent task owns context, crew, git and blockers; every step
                inherits them. Edit them on the parent.
              </p>
            </div>
          </Block>

          {/* ── Step comments (step-owned) ────────────────────────── */}
          <Block label="comments" hint="scoped to this step">
            <div className={cn(CARD, "space-y-2")}>
              <div className="flex gap-2">
                <input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newComment.trim()) {
                      e.preventDefault();
                      void addComment();
                    }
                  }}
                  placeholder="Comment on this step…"
                  className={cn(INPUT, "flex-1")}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  className="self-stretch"
                  disabled={busy === "comment" || !newComment.trim()}
                  onClick={addComment}
                  iconLeft={<Plus className="h-3 w-3" strokeWidth={1.9} />}
                >
                  {busy === "comment" ? "…" : "Add"}
                </Button>
              </div>
              {stepComments.length === 0 ? (
                <div className="text-[11.5px] text-chalk-400">
                  No comments on this step yet.
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {stepComments.map((c) => (
                    <li
                      key={c.id}
                      className={cn(
                        "rounded-[10px] border border-[color:var(--line-soft)] bg-coal-500 px-3 py-2",
                        c.resolved && "opacity-60",
                      )}
                    >
                      <div className="flex items-center gap-2 text-[10.5px] text-chalk-400">
                        <span className="font-medium text-chalk-300">{c.author}</span>
                        <span>{new Date(c.createdAt).toLocaleString()}</span>
                        {c.resolved ? (
                          <span className="text-emerald-400">resolved</span>
                        ) : null}
                        {!c.resolved ? (
                          <button
                            type="button"
                            onClick={() =>
                              run(`resolve-${c.id}`, () =>
                                api.resolveTaskComment({ taskId: task.id, commentId: c.id }),
                              )
                            }
                            className="ml-auto text-chalk-400 transition hover:text-emerald-400"
                          >
                            resolve
                          </button>
                        ) : null}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-[12px] text-chalk-100">
                        {c.body}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Block>

          {error ? (
            <div className="rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-[11.5px] text-rose-300">
              {error}
            </div>
          ) : null}
        </div>

        {/* Footer - the "detach" escape hatch, kept visually distinct from open. */}
        <div className="flex items-center gap-2 border-t border-[color:var(--line)] px-5 py-3">
          {item.promotedTaskId ? (
            <span className="text-[11px] text-chalk-400">
              Detached to its own card.
            </span>
          ) : (
            <span className="text-[11px] text-chalk-400">
              Need this to stand alone?
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            disabled={busy !== null}
            onClick={onPromote}
            iconLeft={<ArrowUpRight className="h-3 w-3" strokeWidth={1.9} />}
          >
            {item.promotedTaskId ? "Open detached card" : "Detach into its own card"}
          </Button>
        </div>
      </div>
    </div>
  );
}

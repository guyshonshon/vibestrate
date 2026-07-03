import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, ExternalLink, GitBranch, Lock, Plus, X } from "lucide-react";
import { api } from "../../lib/api.js";
import { navigate } from "../../app/App.js";
import { cn } from "../design/cn.js";
import { Button } from "../design/Button.js";
import { StatTile } from "../design/StatTile.js";
import { Breadcrumbs } from "../layout/Breadcrumbs.js";
import type { ChecklistItem, Task, TaskComment } from "../../lib/types.js";

// Canonical input recipe (primitives-contract §6).
const INPUT =
  "w-full rounded-[14px] border border-[color:var(--line-strong)] bg-coal-800 px-3 py-2.5 text-[13px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none";

// Status as flat tinted text (contract §7 - not a pill, not a dot+sentence).
function statusTextTone(s: ChecklistItem["status"]): string {
  return s === "done"
    ? "text-emerald-400"
    : s === "in_progress"
      ? "text-violet-soft"
      : s === "blocked"
        ? "text-amber-soft"
        : "text-chalk-300";
}

/**
 * A drawer section - the Mission Control card idiom, verbatim from
 * `ConductorPanel` (`rounded-[18px] border border-[color:var(--line)]
 * bg-coal-600 p-4`, a `text-[14px] font-semibold text-chalk-100` header with an
 * optional action by its title). Composing this instead of hand-rolling labels
 * is what keeps the drawer on the branding canvas.
 */
function DrawerSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[14px] font-semibold text-chalk-100">{title}</h3>
        {action ?? null}
      </div>
      {children}
    </section>
  );
}

/**
 * The per-step detail surface - "a task in a task". A right-side drawer over the
 * parent task page (portalled to <body> so no ancestor stacking context clamps
 * the fixed panel). Its chrome is the Mission Control canvas idiom: a
 * PageHeader-style title and `DrawerSection` cards, not hand-rolled labels.
 *
 * The owner's split:
 *  - The PARENT owns the shared scaffolding (context, crew, git, blockers); it
 *    is shown here READ-ONLY as StatTiles labelled "inherited", because every
 *    step shares one container.
 *  - The step OWNS its authoring, status, run outcome (supervised only), and
 *    its own comments.
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

  // Escape closes; lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

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
  const ctxCount = task.contextSources?.length ?? 0;

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex justify-end font-jakarta" role="dialog" aria-modal="true">
      {/* Scrim - parent context stays visible behind. */}
      <button
        type="button"
        aria-label="Close step"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div className="relative flex h-full w-full max-w-[580px] flex-col border-l border-[color:var(--line)] bg-[color:var(--background)] shadow-2xl">
        {/* ── Header (PageHeader idiom, contained) ─────────────────── */}
        <div className="shrink-0 border-b border-[color:var(--line)] px-6 pb-4 pt-5">
          <Breadcrumbs
            className="mb-2"
            items={[
              { label: "Board", onClick: () => navigate({ kind: "board" }) },
              { label: task.title, onClick: onClose },
              { label: "Step", muted: true },
            ]}
          />
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-1.5 flex items-center gap-2 font-mono text-[11px] font-medium">
                <span className={statusTextTone(item.status)}>
                  {item.status.replace(/_/g, " ")}
                </span>
                {item.provenance === "conductor" ? (
                  <span className="text-violet-soft">conductor</span>
                ) : null}
                <span className="text-chalk-500">· configure this step</span>
              </div>
              <h1 className="text-[22px] font-extrabold leading-tight tracking-[-0.02em] text-chalk-100">
                {item.text}
              </h1>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 px-1.5"
            >
              <X className="h-4 w-4" strokeWidth={1.9} />
            </Button>
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────────── */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {/* Authoring (step-owned) */}
          <DrawerSection
            title="This step"
            action={
              <Button
                variant="primary"
                size="sm"
                disabled={busy !== null || !dirty || !title.trim()}
                onClick={saveAuthoring}
              >
                {busy === "save" ? "Saving…" : dirty ? "Save" : "Saved"}
              </Button>
            }
          >
            <div className="space-y-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Step title…"
                className={INPUT}
              />
              {isSupervised ? (
                <>
                  <input
                    value={objective}
                    onChange={(e) => setObjective(e.target.value)}
                    placeholder="Objective (what done looks like)…"
                    className={INPUT}
                  />
                  <input
                    value={acceptance}
                    onChange={(e) => setAcceptance(e.target.value)}
                    placeholder="Acceptance check…"
                    className={INPUT}
                  />
                  <input
                    value={fileHints}
                    onChange={(e) => setFileHints(e.target.value)}
                    placeholder="File hints (comma-separated)…"
                    className={INPUT}
                  />
                </>
              ) : (
                <p className="text-[11.5px] leading-relaxed text-chalk-300">
                  Objective, acceptance check and file hints apply to supervised
                  tasks - switch this task to supervised to author per-step detail.
                </p>
              )}
              {/* Status is RUN-DERIVED (a run drives in_progress / blocked); the
                  only manual transition is marking the step done. */}
              <div className="flex items-center gap-2 pt-0.5">
                <span className="text-[11.5px] font-medium text-violet-soft">
                  status
                </span>
                <span className={cn("text-[12px] font-medium", statusTextTone(item.status))}>
                  {item.status.replace(/_/g, " ")}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  className="ml-auto"
                  disabled={busy !== null}
                  onClick={() =>
                    run("done", () =>
                      api.updateChecklistItem(task.id, item.id, {
                        status: item.status === "done" ? "pending" : "done",
                      }),
                    )
                  }
                >
                  {item.status === "done" ? "Reopen" : "Mark done"}
                </Button>
              </div>
            </div>
          </DrawerSection>

          {/* Step activity (step-owned outcome) */}
          <DrawerSection title="Activity">
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
                  <p className="text-[12.5px] leading-relaxed text-chalk-200">
                    {item.outcomeSummary}
                  </p>
                ) : null}
                {item.commitSha ? (
                  <div className="font-mono text-[11px] text-chalk-400">
                    commit {item.commitSha.slice(0, 10)}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-[12.5px] leading-relaxed text-chalk-300">
                {isSupervised
                  ? "Not run yet. A supervised run sequences this step and records its outcome here."
                  : "Plain tasks run holistically - per-step run outcomes are recorded for supervised tasks."}
              </p>
            )}
          </DrawerSection>

          {/* Inherited from parent (read-only StatTiles) */}
          <DrawerSection title="Inherited from parent">
            <div className="flex flex-wrap gap-2">
              <StatTile
                value={ctxCount > 0 ? ctxCount : "none"}
                label="context"
                tone={ctxCount > 0 ? "violet" : "default"}
              />
              <StatTile
                value={task.assignedRoles.length > 0 ? task.assignedRoles.length : "default"}
                label="crew"
                tone={task.assignedRoles.length > 0 ? "violet" : "default"}
              />
              <StatTile
                value={task.branchName ? task.branchName : "none"}
                label="branch"
                icon={task.branchName ? <GitBranch className="h-3 w-3" strokeWidth={1.9} /> : undefined}
                tone={task.branchName ? "default" : "default"}
              />
              <StatTile
                value={blockers.length}
                label="blockers"
                icon={blockers.length > 0 ? <Lock className="h-3 w-3" strokeWidth={1.9} /> : undefined}
                tone={blockers.length > 0 ? "amber" : "default"}
              />
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-chalk-300">
              The parent task owns context, crew, git and blockers; every step
              inherits them. Edit them on the parent.
            </p>
          </DrawerSection>

          {/* Step comments (step-owned) */}
          <DrawerSection title="Comments">
            <div className="space-y-2">
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
                  className={INPUT}
                />
                <Button
                  variant="secondary"
                  size="md"
                  disabled={busy === "comment" || !newComment.trim()}
                  onClick={addComment}
                  iconLeft={<Plus className="h-3 w-3" strokeWidth={1.9} />}
                >
                  {busy === "comment" ? "…" : "Add"}
                </Button>
              </div>
              {stepComments.length === 0 ? (
                <div className="text-[11.5px] text-chalk-300">
                  No comments on this step yet.
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {stepComments.map((c) => (
                    <li
                      key={c.id}
                      className={cn(
                        "rounded-[12px] border border-[color:var(--line-soft)] bg-coal-500 px-3 py-2",
                        c.resolved && "opacity-60",
                      )}
                    >
                      <div className="flex items-center gap-2 text-[10.5px] text-chalk-400">
                        <span className="font-medium text-chalk-300">{c.author}</span>
                        <span>{new Date(c.createdAt).toLocaleString()}</span>
                        {c.resolved ? (
                          <span className="text-emerald-400">resolved</span>
                        ) : (
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
                        )}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-[12.5px] text-chalk-100">
                        {c.body}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </DrawerSection>

          {error ? (
            <div className="rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-[11.5px] text-rose-300">
              {error}
            </div>
          ) : null}
        </div>

        {/* ── Footer - the detach escape hatch, distinct from "open" ── */}
        <div className="flex shrink-0 items-center gap-3 border-t border-[color:var(--line)] px-6 py-3">
          <span className="text-[11.5px] text-chalk-300">
            {item.promotedTaskId
              ? "Detached to its own card."
              : "Need this to stand alone?"}
          </span>
          <Button
            variant="secondary"
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
    </div>,
    document.body,
  );
}

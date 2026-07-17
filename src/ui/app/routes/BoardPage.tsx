// The task board - a coarse human kanban (roadmap -> tasks -> runs). On the
// Mission Control canvas (PageShell `fill`) with a left meta-rail: the metric
// stack + roadmap filter live in the rail, the kanban fills the rest. See
// docs/design/primitives-contract.md ("Page canvas") + the live /canvas route.
// Cards are click-to-open + inline-renamable; drag is a narrow "dismiss"
// gesture only (see components/board/dnd.ts for the honest-drop rules).

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  Ban,
  CircleCheck,
  Hourglass,
  Plus,
  Sparkles,
} from "lucide-react";
import { api } from "../../lib/api.js";
import { ErrorView } from "../../lib/error-view.js";
import type {
  Priority,
  RoadmapItem,
  Task,
  TaskSuggestion,
} from "../../lib/types.js";
import { cn } from "../../components/design/cn.js";
import { useToast, ToastView } from "../../components/design/useToast.js";
import { Button } from "../../components/design/Button.js";
import { Select } from "../../components/design/Select.js";
import { MetricCard } from "../../components/design/MetricCard.js";
import { SegmentedControl } from "../../components/design/SegmentedControl.js";
import { PageShell, PageHeader } from "../../components/layout/PageShell.js";
import { LedgerView } from "../../components/ledger/LedgerView.js";
import { BoardColumn, COLUMNS } from "../../components/board/BoardColumn.js";
import { BoardToolbar } from "../../components/board/BoardToolbar.js";
import { RoadmapRail } from "../../components/board/RoadmapRail.js";
import {
  coarseColumnOf,
  validDropTargets,
  type CoarseId,
} from "../../components/board/dnd.js";

// The Board's top-level tabs: the kanban itself, or the project ledger folded in
// here (the standalone Ledger nav item was retired). An interactive switch.
export type BoardTab = "board" | "ledger";
const BOARD_TABS: { value: BoardTab; label: string }[] = [
  { value: "board", label: "Board" },
  { value: "ledger", label: "Ledger" },
];

// ── Page ─────────────────────────────────────────────────────────────────

export function BoardPage({
  tab = "board",
  onSwitchTab,
  onOpenTask,
  onOpenRun,
}: {
  /** Which top-level tab is active: the kanban board or the ledger. */
  tab?: BoardTab;
  onSwitchTab: (tab: BoardTab) => void;
  onOpenTask: (taskId: string) => void;
  onOpenRun: (runId: string) => void;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [items, setItems] = useState<RoadmapItem[]>([]);
  const [suggestions, setSuggestions] = useState<TaskSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { toast, showToast } = useToast(4000);

  const [showRoadmapForm, setShowRoadmapForm] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [newRoadmapTitle, setNewRoadmapTitle] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskRoadmap, setNewTaskRoadmap] = useState<string>("");
  const [newTaskMode, setNewTaskMode] = useState<"plain" | "supervised">("plain");
  const [busy, setBusy] = useState(false);

  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<"any" | Priority>("any");
  const [roadmapFilter, setRoadmapFilter] = useState<string | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const taskTitleRef = useRef<HTMLInputElement | null>(null);
  const roadmapTitleRef = useRef<HTMLInputElement | null>(null);
  const taskFormRef = useRef<HTMLDivElement | null>(null);
  const roadmapFormRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const [t, r, sg] = await Promise.all([
        api.listTasks(),
        api.listRoadmap(),
        api.suggestNext().catch(() => [] as TaskSuggestion[]),
      ]);
      setTasks(t);
      setItems(r);
      setSuggestions(sg);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(load, 4000);
    return () => window.clearInterval(interval);
  }, [load]);


  // Focus the title field when a form expands (the inputs stay mounted so the
  // bar can animate open, so autoFocus can't carry it).
  useEffect(() => {
    if (showTaskForm) taskTitleRef.current?.focus();
  }, [showTaskForm]);
  useEffect(() => {
    if (showRoadmapForm) roadmapTitleRef.current?.focus();
  }, [showRoadmapForm]);

  // Close the new-task / roadmap popovers on outside click or Escape.
  useEffect(() => {
    if (!showTaskForm && !showRoadmapForm) return;
    const close = () => {
      setShowTaskForm(false);
      setShowRoadmapForm(false);
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (taskFormRef.current?.contains(t) || roadmapFormRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [showTaskForm, showRoadmapForm]);

  async function submitRoadmap(e: FormEvent) {
    e.preventDefault();
    if (!newRoadmapTitle.trim()) return;
    setBusy(true);
    try {
      await api.addRoadmapItem({ title: newRoadmapTitle.trim() });
      setNewRoadmapTitle("");
      setShowRoadmapForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitTask(e: FormEvent) {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    setBusy(true);
    try {
      await api.addTask({
        title: newTaskTitle.trim(),
        roadmapItemId: newTaskRoadmap || null,
        runMode: newTaskMode,
      });
      setNewTaskTitle("");
      setNewTaskRoadmap("");
      setNewTaskMode("plain");
      setShowTaskForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const handleRename = useCallback(
    async (taskId: string, nextTitle: string) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task || task.title === nextTitle) return;
      setTasks((cur) =>
        cur.map((t) => (t.id === taskId ? { ...t, title: nextTitle } : t)),
      );
      try {
        await api.patchTask(taskId, { title: nextTitle });
        showToast({ kind: "ok", text: `Renamed ${taskId}` });
      } catch (err) {
        showToast({
          kind: "err",
          text: err instanceof Error ? err.message : String(err),
        });
        await load();
      }
    },
    [tasks, load],
  );

  const handleDelete = useCallback(
    async (taskId: string) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;
      if (
        !window.confirm(
          `Remove task "${task.title}"?\n\nThis permanently deletes the card and its comments. Its runs, transcripts, and git worktree (if any) are left in place. It refuses if a run is still live.`,
        )
      ) {
        return;
      }
      // Optimistic: drop the card now; reconcile on failure.
      setTasks((cur) => cur.filter((t) => t.id !== taskId));
      try {
        const { worktreePath } = await api.deleteTask(taskId);
        showToast({
          kind: "ok",
          text: worktreePath
            ? `Removed ${taskId} (worktree left at ${worktreePath})`
            : `Removed ${taskId}`,
        });
      } catch (err) {
        showToast({
          kind: "err",
          text: err instanceof Error ? err.message : String(err),
        });
        await load();
      }
    },
    [tasks, load],
  );

  const handleDropTask = useCallback(
    async (taskId: string, columnId: CoarseId) => {
      setDragTaskId(null);
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;
      if (!validDropTargets(task).has(columnId)) return; // snap back - no honest move
      try {
        // archived is the only honest drop target (cancelTask).
        await api.cancelTask(taskId);
        showToast({ kind: "ok", text: `Archived ${taskId}` });
        await load();
      } catch (err) {
        showToast({
          kind: "err",
          text: err instanceof Error ? err.message : String(err),
        });
        await load();
      }
    },
    [tasks, load],
  );

  const handleStart = useCallback(
    async (taskId: string) => {
      try {
        await api.queueTask(taskId);
        showToast({ kind: "ok", text: `Started ${taskId}` });
        await load();
      } catch (err) {
        showToast({
          kind: "err",
          text: err instanceof Error ? err.message : String(err),
        });
        await load();
      }
    },
    [load],
  );

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (roadmapFilter && t.roadmapItemId !== roadmapFilter) return false;
      if (priorityFilter !== "any" && t.priority !== priorityFilter)
        return false;
      if (query) {
        const q = query.toLowerCase();
        if (!t.title.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [tasks, roadmapFilter, priorityFilter, query]);

  // Counts for the metric cards.
  const counts = useMemo(() => {
    const active = tasks.filter((t) =>
      ["ready", "queued", "running", "review", "waiting_for_approval"].includes(
        t.status,
      ),
    ).length;
    const waiting = tasks.filter(
      (t) => t.status === "waiting_for_approval",
    ).length;
    const blocked = tasks.filter(
      (t) => t.status === "blocked" || t.status === "failed",
    ).length;
    const done = tasks.filter((t) => t.status === "done").length;
    return { active, waiting, blocked, done };
  }, [tasks]);

  const tabControl = (
    <SegmentedControl
      className="mt-3"
      options={BOARD_TABS}
      value={tab}
      onChange={onSwitchTab}
    />
  );

  // The ledger tab reuses the same page shell + header (title "Board" + the
  // segmented control); its body is the self-scrolling LedgerView. Board-data
  // errors (listTasks) don't gate it - it fetches its own state.
  if (tab === "ledger") {
    return (
      <PageShell variant="fill">
        <PageHeader className="mb-4" title="Board">
          {tabControl}
        </PageHeader>
        <LedgerView onOpenRun={onOpenRun} />
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell variant="fill">
        <PageHeader className="mb-4" title="Board">
          {tabControl}
        </PageHeader>
        <ErrorView err={error} onRetry={() => void load()} />
      </PageShell>
    );
  }

  const roadmapOptions = [
    { value: "", label: "No roadmap link" },
    ...items.map((i) => ({ value: i.id, label: i.title })),
  ];
  const total = tasks.length || 1;
  const draggedTask = dragTaskId ? tasks.find((t) => t.id === dragTaskId) ?? null : null;
  const draggedTargets = draggedTask ? validDropTargets(draggedTask) : null;

  return (
    <PageShell variant="fill">
      <PageHeader
        className="mb-4"
        title={
          <span className="flex items-baseline gap-2.5">
            Tasks
            <span className="text-[14px] font-semibold tabular-nums text-chalk-400">
              {tasks.length}
            </span>
          </span>
        }
        actions={
          <>
            {suggestions[0] ? (
              <button
                type="button"
                onClick={() => onOpenTask(suggestions[0]!.taskId)}
                title={suggestions[0]!.reason}
                className="inline-flex max-w-[280px] items-center gap-1.5 rounded-[10px] border border-violet-soft/30 bg-violet-soft/10 px-2.5 py-1.5 text-[12.5px] transition hover:bg-violet-soft/15"
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-violet-soft" strokeWidth={1.8} />
                <span className="shrink-0 font-semibold text-violet-soft">Suggested:</span>
                <span className="truncate text-chalk-100">{suggestions[0]!.title}</span>
              </button>
            ) : null}
            <div ref={roadmapFormRef} className="relative">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowRoadmapForm((v) => !v);
                  setShowTaskForm(false);
                }}
                iconLeft={<Plus className="h-3.5 w-3.5" strokeWidth={1.9} />}
              >
                Roadmap item
              </Button>
              <FormPopover open={showRoadmapForm} width="w-[280px]">
                <form onSubmit={submitRoadmap} className="flex flex-col gap-2">
                  <input
                    ref={roadmapTitleRef}
                    value={newRoadmapTitle}
                    onChange={(e) => setNewRoadmapTitle(e.target.value)}
                    placeholder="Build onboarding flow"
                    className="w-full rounded-[12px] border border-[color:var(--line-strong)] bg-coal-800 px-3 py-2 text-[13px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none"
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    className="w-full"
                    disabled={busy || !newRoadmapTitle.trim()}
                  >
                    Add initiative
                  </Button>
                </form>
              </FormPopover>
            </div>
            <div ref={taskFormRef} className="relative">
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setShowTaskForm((v) => !v);
                  setShowRoadmapForm(false);
                }}
                iconLeft={<Plus className="h-3.5 w-3.5" strokeWidth={1.9} />}
              >
                New task
              </Button>
              <FormPopover open={showTaskForm} width="w-[320px]">
                <form onSubmit={submitTask} className="flex flex-col gap-2">
                  <input
                    ref={taskTitleRef}
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="Create setup wizard"
                    className="w-full rounded-[12px] border border-[color:var(--line-strong)] bg-coal-800 px-3 py-2 text-[13px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none"
                  />
                  <Select
                    value={newTaskRoadmap}
                    onChange={setNewTaskRoadmap}
                    options={roadmapOptions}
                    ariaLabel="Link to a roadmap initiative"
                    placeholder="No roadmap link"
                    className="w-full"
                  />
                  <Select
                    value={newTaskMode}
                    onChange={(v) => setNewTaskMode(v as "plain" | "supervised")}
                    options={[
                      { value: "plain", label: "Plain run" },
                      { value: "supervised", label: "Supervised (steps)" },
                    ]}
                    ariaLabel="Run mode"
                    className="w-full"
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    className="w-full"
                    disabled={busy || !newTaskTitle.trim()}
                  >
                    Add task
                  </Button>
                </form>
              </FormPopover>
            </div>
          </>
        }
      >
        {tabControl}
        <ToastView
          toast={toast}
          variant="inline"
          iconStrokeWidth={2}
          className="mt-3 inline-flex items-center gap-1.5 rounded-[10px] border px-3 py-1.5 text-[11.5px]"
        />
      </PageHeader>

      {/* ── Metric strip (top) ────────────────────────────────────── */}
      <div className="mb-3 grid shrink-0 grid-cols-2 gap-2.5 md:grid-cols-4">
        <MetricCard
          icon={<Activity className="h-3 w-3" strokeWidth={2} />}
          label="Active"
          value={counts.active}
          hint="in flight"
          tone="violet"
          share={counts.active / total}
        />
        <MetricCard
          icon={<Hourglass className="h-3 w-3" strokeWidth={2} />}
          label="Awaiting"
          value={counts.waiting}
          hint={counts.waiting > 0 ? "your turn" : "nothing"}
          tone="amber"
          share={counts.waiting / total}
        />
        <MetricCard
          icon={<Ban className="h-3 w-3" strokeWidth={2} />}
          label="Blocked"
          value={counts.blocked}
          hint={counts.blocked > 0 ? "attention" : "all clear"}
          tone="rose"
          share={counts.blocked / total}
        />
        <MetricCard
          icon={<CircleCheck className="h-3 w-3" strokeWidth={2} />}
          label="Done"
          value={counts.done}
          hint="shipped"
          tone="emerald"
          share={counts.done / total}
        />
      </div>

      {/* ── Board: one filter container (roadmap + search + priority) + kanban ── */}
      {tasks.length === 0 ? (
        <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 px-6 py-12 text-center">
          <div className="text-[15px] font-semibold text-chalk-100">No tasks yet.</div>
          <p className="mt-1 text-[12.5px] text-chalk-300">
            Click <span className="font-semibold text-chalk-100">New task</span> above to start the first one.
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-3 shrink-0 rounded-[14px] border border-[color:var(--line)] bg-coal-650 p-2.5">
            {items.length > 0 ? (
              <>
                <RoadmapRail
                  items={items}
                  tasks={tasks}
                  active={roadmapFilter}
                  onSelect={setRoadmapFilter}
                />
                <div className="my-2.5 h-px bg-[color:var(--line-soft)]" />
              </>
            ) : null}
            <BoardToolbar
              query={query}
              onQuery={setQuery}
              priority={priorityFilter}
              onPriority={setPriorityFilter}
              tasksShown={filtered.length}
              totalTasks={tasks.length}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-x-auto pb-4">
            <div
              className="grid h-full gap-2.5"
              style={{
                gridTemplateColumns: `repeat(${COLUMNS.length}, minmax(196px, 1fr))`,
                minWidth: COLUMNS.length * 204,
              }}
            >
              {COLUMNS.map((col) => {
                const colTasks = filtered.filter((t) => coarseColumnOf(t) === col.id);
                const dropHint: "valid" | "dim" | null = draggedTargets
                  ? draggedTargets.has(col.id)
                    ? "valid"
                    : "dim"
                  : null;
                return (
                  <BoardColumn
                    key={col.id}
                    column={col}
                    tasks={colTasks}
                    allTasks={tasks}
                    items={items}
                    onOpenTask={onOpenTask}
                    onRename={handleRename}
                    onDelete={handleDelete}
                    onStart={handleStart}
                    dragTaskId={dragTaskId}
                    dropHint={dropHint}
                    onDropTask={handleDropTask}
                    onDragStartTask={setDragTaskId}
                    onDragEndTask={() => setDragTaskId(null)}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

// A popover that grows out of its trigger button: absolutely anchored directly
// below the button (right-aligned), scaling up from the top-right corner where
// the button sits. The parent <div> is `relative` and holds the button.
function FormPopover({
  open,
  width,
  children,
}: {
  open: boolean;
  width: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "absolute right-0 top-full z-30 mt-2 origin-top-right transition-all duration-150 ease-out",
        width,
        open ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0",
      )}
    >
      <div className="rounded-[14px] border border-[color:var(--line)] bg-coal-700 p-3 shadow-2xl">
        {children}
      </div>
    </div>
  );
}

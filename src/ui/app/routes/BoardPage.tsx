// The task board - a coarse human kanban (roadmap -> tasks -> runs). On the
// Mission Control canvas (PageShell `fill`) with a left meta-rail: the metric
// stack + roadmap filter live in the rail, the kanban fills the rest. See
// docs/design/primitives-contract.md ("Page canvas") + the live /canvas route.
// Cards are click-to-open + inline-renamable; drag-and-drop is intentionally not
// wired (the server only exposes named transitions - queue / cancel / terminate).

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  Ban,
  Bolt,
  Check,
  CircleCheck,
  Files,
  FlaskConical,
  Hourglass,
  Layers,
  LayoutGrid,
  ListChecks,
  Lock,
  MessageSquare,
  Pencil,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Unlock,
  X,
} from "lucide-react";
import { api } from "../../lib/api.js";
import type {
  Priority,
  RoadmapItem,
  Task,
  TaskSuggestion,
} from "../../lib/types.js";
import { cn } from "../../components/design/cn.js";
import { Chip } from "../../components/design/Chip.js";
import type { ChipTone } from "../../components/design/Chip.js";
import { Button } from "../../components/design/Button.js";
import { Select } from "../../components/design/Select.js";
import { MetricCard } from "../../components/design/MetricCard.js";
import { PageShell, PageHeader } from "../../components/layout/PageShell.js";

// ── Columns ──────────────────────────────────────────────────────────────

type CoarseId =
  | "planned"
  | "in_progress"
  | "needs_testing"
  | "completed"
  | "archived";

type ColumnTone = { dot: string; text: string; band: string };
type ColumnDef = {
  id: CoarseId;
  label: string;
  tone: ColumnTone;
};

// The board is a *coarse* human kanban (Phase 3) - not the orchestrator's fine
// run stages, which live in Mission Control. A card's column is derived from its
// status + the archived / needs-testing overlays (see coarseColumnOf). Each
// column carries a colour identity (tinted header band + count) so the eye lands
// on the right lane fast.
const COLUMNS: ColumnDef[] = [
  { id: "planned",       label: "Planned",       tone: { dot: "bg-chalk-400",   text: "text-chalk-300",   band: "bg-white/[0.025]" } },
  { id: "in_progress",   label: "In progress",   tone: { dot: "bg-emerald-400", text: "text-emerald-400", band: "bg-emerald-400/[0.08]" } },
  { id: "needs_testing", label: "Needs testing", tone: { dot: "bg-amber-soft",  text: "text-amber-soft",  band: "bg-amber-soft/[0.08]" } },
  { id: "completed",     label: "Completed",      tone: { dot: "bg-sky-glow",    text: "text-sky-glow",    band: "bg-sky-glow/[0.08]" } },
  { id: "archived",      label: "Archived",       tone: { dot: "bg-chalk-400",   text: "text-chalk-400",   band: "bg-white/[0.015]" } },
];

// Mirror of the canonical coarseColumn() in roadmap-types (server/UI type split).
function coarseColumnOf(task: Task): CoarseId {
  if (task.archived) return "archived";
  if (task.needsTesting) return "needs_testing";
  switch (task.status) {
    case "backlog":
    case "ready":
      return "planned";
    case "done":
      return "completed";
    case "cancelled":
      return "archived";
    default:
      return "in_progress";
  }
}

// Honest drag targets: drag is a "dismiss" gesture, never an execution. The only
// safe, real move on a derived board is archiving a non-live card (-> Archived =
// cancelTask). Starting a task is an explicit action (the card's Start button),
// not a drag side effect. Everything else has no API and is not a valid drop
// (the card snaps back). (A true management-stage board - draggable lanes like
// "Needs planning" - needs a settable stage field; that's a separate slice.)
function validDropTargets(task: Task): Set<CoarseId> {
  const targets = new Set<CoarseId>();
  if (task.archived || task.status === "done" || task.status === "cancelled") {
    return targets; // terminal - no honest move
  }
  const live = task.status === "running" || task.currentRunId != null;
  if (!live) targets.add("archived"); // cancelTask (live cards use the run controls)
  return targets;
}

const PRIORITY_LABEL: Record<Priority, { label: string; cls: string }> = {
  low:    { label: "low",  cls: "text-chalk-400" },
  medium: { label: "med",  cls: "text-violet-soft" },
  high:   { label: "high", cls: "text-amber-soft" },
};

const TONE_SWATCH: Record<ChipTone, string> = {
  neutral: "bg-chalk-400",
  violet: "bg-violet-soft",
  sky: "bg-sky-glow",
  emerald: "bg-emerald-400",
  amber: "bg-amber-soft",
  rose: "bg-rose-400",
};

const ROADMAP_TONES: ChipTone[] = ["violet", "sky", "emerald", "amber", "rose"];
function roadmapToneFor(id: string): ChipTone {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return ROADMAP_TONES[h % ROADMAP_TONES.length]!;
}

const AGENT_TONES: ChipTone[] = ["violet", "sky", "emerald", "amber", "rose"];
function roleTone(id: string): ChipTone {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AGENT_TONES[h % AGENT_TONES.length]!;
}

// ── Page ─────────────────────────────────────────────────────────────────

export function BoardPage({
  onOpenTask,
}: {
  onOpenTask: (taskId: string) => void;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [items, setItems] = useState<RoadmapItem[]>([]);
  const [suggestions, setSuggestions] = useState<TaskSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

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

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Focus the title field when a form expands (the inputs stay mounted so the
  // bar can animate open, so autoFocus can't carry it).
  useEffect(() => {
    if (showTaskForm) taskTitleRef.current?.focus();
  }, [showTaskForm]);
  useEffect(() => {
    if (showRoadmapForm) roadmapTitleRef.current?.focus();
  }, [showRoadmapForm]);

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
        setToast({ kind: "ok", text: `Renamed ${taskId}` });
      } catch (err) {
        setToast({
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
        setToast({
          kind: "ok",
          text: worktreePath
            ? `Removed ${taskId} (worktree left at ${worktreePath})`
            : `Removed ${taskId}`,
        });
      } catch (err) {
        setToast({
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
        setToast({ kind: "ok", text: `Archived ${taskId}` });
        await load();
      } catch (err) {
        setToast({
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
        setToast({ kind: "ok", text: `Started ${taskId}` });
        await load();
      } catch (err) {
        setToast({
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

  if (error) {
    return (
      <PageShell>
        <div className="rounded-[12px] border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-[13px] text-rose-300">
          {error}
        </div>
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
          </>
        }
      >
        <MorphForm open={showRoadmapForm}>
          <form onSubmit={submitRoadmap} className="flex max-w-[640px] gap-2 pt-3">
            <input
              ref={roadmapTitleRef}
              value={newRoadmapTitle}
              onChange={(e) => setNewRoadmapTitle(e.target.value)}
              placeholder="Build onboarding flow"
              className="flex-1 rounded-[12px] border border-[color:var(--line-strong)] bg-coal-800 px-3 py-2 text-[13px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none"
            />
            <Button type="submit" variant="secondary" size="md" disabled={busy || !newRoadmapTitle.trim()}>
              Add
            </Button>
          </form>
        </MorphForm>
        <MorphForm open={showTaskForm}>
          <form onSubmit={submitTask} className="flex max-w-[760px] flex-wrap items-center gap-2 pt-3">
            <input
              ref={taskTitleRef}
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Create setup wizard"
              className="min-w-[240px] flex-1 rounded-[12px] border border-[color:var(--line-strong)] bg-coal-800 px-3 py-2 text-[13px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none"
            />
            <Select
              value={newTaskRoadmap}
              onChange={setNewTaskRoadmap}
              options={roadmapOptions}
              ariaLabel="Link to a roadmap initiative"
              placeholder="No roadmap link"
            />
            <Select
              value={newTaskMode}
              onChange={(v) => setNewTaskMode(v as "plain" | "supervised")}
              options={[
                { value: "plain", label: "Plain run" },
                { value: "supervised", label: "Supervised (steps)" },
              ]}
              ariaLabel="Run mode"
            />
            <Button type="submit" variant="secondary" size="md" disabled={busy || !newTaskTitle.trim()}>
              Add
            </Button>
          </form>
        </MorphForm>

        {toast ? (
          <div
            role="status"
            className={cn(
              "mt-3 inline-flex items-center gap-1.5 rounded-[10px] border px-3 py-1.5 text-[11.5px]",
              toast.kind === "ok"
                ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
                : "border-rose-400/30 bg-rose-500/10 text-rose-300",
            )}
          >
            {toast.kind === "ok" ? (
              <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            ) : (
              <X className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            )}
            {toast.text}
          </div>
        ) : null}
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

      {/* ── Roadmap filter rail (horizontal) ──────────────────────── */}
      {items.length > 0 ? (
        <div className="mb-3 shrink-0">
          <RoadmapRail
            items={items}
            tasks={tasks}
            active={roadmapFilter}
            onSelect={setRoadmapFilter}
          />
        </div>
      ) : null}

      {/* ── Board: toolbar + kanban ───────────────────────────────── */}
      {tasks.length === 0 ? (
        <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 px-6 py-12 text-center">
          <div className="text-[15px] font-semibold text-chalk-100">No tasks yet.</div>
          <p className="mt-1 text-[12.5px] text-chalk-300">
            Click <span className="font-semibold text-chalk-100">New task</span> above to start the first one.
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-3 shrink-0">
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

// A bar that morphs open from the action button: it expands its height (grid
// 0fr -> 1fr) while scaling up from the top-right, where the trigger sits.
function MorphForm({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        "grid origin-top-right transition-all duration-200 ease-out",
        open
          ? "scale-100 grid-rows-[1fr] opacity-100"
          : "pointer-events-none scale-[0.97] grid-rows-[0fr] opacity-0",
      )}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

// ── Roadmap rail (horizontal filter) ────────────────────────────────────

function RoadmapRail({
  items,
  tasks,
  active,
  onSelect,
}: {
  items: RoadmapItem[];
  tasks: Task[];
  active: string | null;
  onSelect: (id: string | null) => void;
}) {
  const totalLinked = tasks.filter((t) => t.roadmapItemId).length;
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      <span className="mr-0.5 shrink-0 text-[12px] font-bold text-violet-vivid">Roadmap</span>
      <RoadmapChip
        label="All initiatives"
        meta={`${totalLinked} linked`}
        tone="violet"
        active={active === null}
        onClick={() => onSelect(null)}
        all
      />
      {items.map((rm) => {
        const linked = tasks.filter((t) => t.roadmapItemId === rm.id).length;
        return (
          <RoadmapChip
            key={rm.id}
            label={rm.title}
            meta={`${linked} - ${rm.status}`}
            tone={roadmapToneFor(rm.id)}
            priority={rm.priority}
            active={active === rm.id}
            onClick={() => onSelect(rm.id === active ? null : rm.id)}
          />
        );
      })}
    </div>
  );
}

function RoadmapChip({
  label,
  meta,
  tone,
  priority,
  active,
  onClick,
  all,
}: {
  label: string;
  meta: string;
  tone: ChipTone;
  priority?: Priority;
  active: boolean;
  onClick: () => void;
  all?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-[10px] border px-3 py-1.5 text-left transition",
        active
          ? "border-violet-soft/45 bg-violet-soft/10"
          : "border-[color:var(--line)] bg-coal-600 hover:bg-coal-500",
      )}
    >
      {all ? (
        <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-violet-soft" strokeWidth={1.9} />
      ) : (
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TONE_SWATCH[tone])} />
      )}
      <span className="max-w-[160px] truncate text-[12px] font-medium text-chalk-100">{label}</span>
      <span className="shrink-0 text-[10.5px] text-chalk-400">{meta}</span>
      {priority ? (
        <span
          className={cn(
            "shrink-0 text-[10px] font-semibold",
            priority === "high"
              ? "text-amber-soft"
              : priority === "medium"
                ? "text-violet-soft"
                : "text-chalk-400",
          )}
        >
          {priority}
        </span>
      ) : null}
    </button>
  );
}

// ── Toolbar ─────────────────────────────────────────────────────────────

function BoardToolbar({
  query,
  onQuery,
  priority,
  onPriority,
  tasksShown,
  totalTasks,
}: {
  query: string;
  onQuery: (v: string) => void;
  priority: "any" | Priority;
  onPriority: (v: "any" | Priority) => void;
  tasksShown: number;
  totalTasks: number;
}) {
  const priorities: Array<"any" | Priority> = ["any", "low", "medium", "high"];
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[240px] max-w-[360px] flex-1">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-chalk-400"
          strokeWidth={1.9}
        />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Filter by title…"
          className="w-full rounded-[12px] border border-[color:var(--line-strong)] bg-coal-800 py-2 pl-8 pr-3 text-[13px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none"
        />
        {query ? (
          <button
            type="button"
            onClick={() => onQuery("")}
            aria-label="Clear filter"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-chalk-400 hover:text-chalk-100"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.9} />
          </button>
        ) : null}
      </div>
      <div className="inline-flex rounded-[10px] border border-[color:var(--line)] bg-coal-700 p-[3px]">
        {priorities.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPriority(p)}
            className={cn(
              "rounded-[8px] px-2.5 py-1 text-[12px] font-semibold capitalize transition",
              priority === p
                ? "bg-coal-500 text-chalk-100"
                : "text-chalk-400 hover:text-chalk-100",
            )}
          >
            {p === "any" ? "any" : p}
          </button>
        ))}
      </div>
      <span className="ml-auto text-[11.5px] text-chalk-400">
        showing <span className="tabular-nums text-chalk-100">{tasksShown}</span>/{totalTasks}
      </span>
    </div>
  );
}

// ── Column ──────────────────────────────────────────────────────────────

function BoardColumn({
  column,
  tasks,
  allTasks,
  items,
  onOpenTask,
  onRename,
  onDelete,
  onStart,
  dragTaskId,
  dropHint,
  onDropTask,
  onDragStartTask,
  onDragEndTask,
}: {
  column: ColumnDef;
  tasks: Task[];
  allTasks: Task[];
  items: RoadmapItem[];
  onOpenTask: (taskId: string) => void;
  onRename: (taskId: string, nextTitle: string) => Promise<void> | void;
  onDelete: (taskId: string) => Promise<void> | void;
  onStart: (taskId: string) => void;
  dragTaskId: string | null;
  dropHint: "valid" | "dim" | null;
  onDropTask: (taskId: string, columnId: CoarseId) => void;
  onDragStartTask: (taskId: string) => void;
  onDragEndTask: () => void;
}) {
  const urgent = column.id === "needs_testing" && tasks.length > 0;

  return (
    <section
      data-column={column.id}
      onDragOver={(e) => {
        if (dropHint === "valid") e.preventDefault(); // allow drop
      }}
      onDrop={(e) => {
        if (dropHint !== "valid") return;
        e.preventDefault();
        const id = e.dataTransfer.getData("text/plain");
        if (id) onDropTask(id, column.id);
      }}
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-[16px] border bg-coal-700 transition",
        urgent ? "border-amber-soft/40" : "border-[color:var(--line)]",
        dropHint === "valid" && "border-violet-soft/60 ring-1 ring-violet-soft/40",
        dropHint === "dim" && "opacity-45",
      )}
    >
      <header
        className={cn(
          "flex items-center justify-between border-b border-[color:var(--line-soft)] px-3 py-2.5",
          column.tone.band,
        )}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", column.tone.dot)} />
          <span className="truncate text-[12px] font-semibold text-chalk-100">
            {column.label}
          </span>
        </div>
        <span className={cn("tabular-nums text-[11px] font-semibold", column.tone.text)}>
          {tasks.length}
        </span>
      </header>

      <ol className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
        {tasks.length === 0 ? (
          <li className="select-none py-6 text-center text-[11px] text-chalk-400">
            empty
          </li>
        ) : (
          tasks.map((t) => {
            const openDeps = t.dependencies.filter((depId) => {
              const dep = allTasks.find((tt) => tt.id === depId);
              return !dep || (dep.status !== "done" && dep.status !== "cancelled");
            });
            const unlocks = allTasks.filter((tt) =>
              tt.dependencies.includes(t.id),
            ).length;
            const roadmap = t.roadmapItemId
              ? items.find((rm) => rm.id === t.roadmapItemId) ?? null
              : null;
            const canDrag = validDropTargets(t).size > 0;
            const dragging = dragTaskId === t.id;
            return (
              <li key={t.id}>
                {t.runMode === "supervised" ? (
                  <SagaCard
                    task={t}
                    onOpen={onOpenTask}
                    canDrag={canDrag}
                    dragging={dragging}
                    onDragStartTask={onDragStartTask}
                    onDragEndTask={onDragEndTask}
                  />
                ) : (
                  <TaskCard
                    task={t}
                    roadmap={roadmap}
                    blockedBy={openDeps.length}
                    unlocks={unlocks}
                    onOpen={onOpenTask}
                    onRename={onRename}
                    onDelete={onDelete}
                    onStart={onStart}
                    canDrag={canDrag}
                    dragging={dragging}
                    onDragStartTask={onDragStartTask}
                    onDragEndTask={onDragEndTask}
                  />
                )}
              </li>
            );
          })
        )}
      </ol>
    </section>
  );
}

// ── Supervised card (compact container) ─────────────────────────────────

function SagaCard({
  task,
  onOpen,
  canDrag,
  dragging,
  onDragStartTask,
  onDragEndTask,
}: {
  task: Task;
  onOpen: (taskId: string) => void;
  canDrag: boolean;
  dragging: boolean;
  onDragStartTask: (taskId: string) => void;
  onDragEndTask: () => void;
}) {
  const checklist = task.checklist ?? [];
  const total = checklist.length;
  const done = checklist.filter((c) => c.status === "done").length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const draggedRef = useRef(false);
  return (
    <div
      role="button"
      tabIndex={0}
      draggable={canDrag}
      onDragStart={(e) => {
        draggedRef.current = true;
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStartTask(task.id);
      }}
      onDragEnd={() => {
        onDragEndTask();
        window.setTimeout(() => {
          draggedRef.current = false;
        }, 60);
      }}
      onClick={() => {
        if (draggedRef.current) return;
        onOpen(task.id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(task.id);
      }}
      data-task-id={task.id}
      className={cn(
        "group block w-full rounded-[11px] bg-violet-soft/[0.1] px-2.5 py-2 transition hover:bg-violet-soft/[0.15]",
        canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        dragging && "opacity-40",
      )}
    >
      <div className="flex items-center gap-1.5">
        <Layers className="h-3.5 w-3.5 text-violet-soft" strokeWidth={1.9} />
        <Chip tone="violet" contained>supervised</Chip>
        <span className="ml-auto font-display text-[12px] font-bold tabular-nums text-chalk-200">
          {done}/{total}
        </span>
      </div>
      <div className="mt-1.5 line-clamp-2 break-words text-[12px] font-semibold leading-snug text-chalk-100">
        {task.title}
      </div>
      <div className="mt-2 flex items-center gap-1" aria-label={`${done} of ${total} steps done`}>
        {total === 0 ? (
          <span className="text-[10px] text-chalk-300">no steps yet</span>
        ) : (
          checklist.map((c) => (
            <span
              key={c.id}
              className={cn(
                "h-1 flex-1 rounded-full",
                c.status === "done"
                  ? "bg-violet-soft"
                  : c.status === "in_progress"
                    ? "bg-violet-soft/50"
                    : "bg-coal-500",
              )}
            />
          ))
        )}
      </div>
      {total > 0 ? (
        <div className="mt-1 tabular-nums text-[10px] text-chalk-400">{pct}%</div>
      ) : null}
    </div>
  );
}

// ── Task card (compact, contained) ──────────────────────────────────────

function TaskCard({
  task,
  roadmap,
  blockedBy,
  unlocks,
  onOpen,
  onRename,
  onDelete,
  onStart,
  canDrag,
  dragging,
  onDragStartTask,
  onDragEndTask,
}: {
  task: Task;
  roadmap: RoadmapItem | null;
  blockedBy: number;
  unlocks: number;
  onOpen: (taskId: string) => void;
  onRename: (taskId: string, nextTitle: string) => Promise<void> | void;
  onDelete: (taskId: string) => Promise<void> | void;
  onStart: (taskId: string) => void;
  canDrag: boolean;
  dragging: boolean;
  onDragStartTask: (taskId: string) => void;
  onDragEndTask: () => void;
}) {
  const prio = PRIORITY_LABEL[task.priority];
  const isRunning = task.status === "running";
  const isFailed = task.status === "failed";
  const isWaiting = task.status === "waiting_for_approval";
  const isDone = task.status === "done" || task.status === "cancelled";
  // Startable = explicit run is meaningful: not terminal, not already live.
  const startable =
    !isDone && !task.archived && !isRunning && task.currentRunId == null;
  // Suppress the click-to-open that a browser may fire right after a drag.
  const draggedRef = useRef(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const committedRef = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(task.title);
  }, [editing, task.title]);

  useEffect(() => {
    if (editing) {
      committedRef.current = false;
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = async () => {
    if (committedRef.current) return;
    committedRef.current = true;
    const next = draft.trim();
    setEditing(false);
    if (next && next !== task.title) {
      await onRename(task.id, next);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void commit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      committedRef.current = true;
      setEditing(false);
      setDraft(task.title);
    }
  };

  const rmTone: ChipTone | null = roadmap ? roadmapToneFor(roadmap.id) : null;

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={canDrag && !editing}
      onDragStart={(e) => {
        draggedRef.current = true;
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStartTask(task.id);
      }}
      onDragEnd={() => {
        onDragEndTask();
        window.setTimeout(() => {
          draggedRef.current = false;
        }, 60);
      }}
      onClick={(e) => {
        if (editing) return;
        if (draggedRef.current) return; // a drag just happened - don't open
        const target = e.target as HTMLElement;
        if (target.closest("[data-no-open]")) return;
        onOpen(task.id);
      }}
      onKeyDown={(e) => {
        if (editing) return;
        if (e.key === "Enter") onOpen(task.id);
      }}
      data-task-id={task.id}
      className={cn(
        "group relative block w-full overflow-hidden rounded-[11px] px-2.5 py-2 text-left transition",
        canDrag && !editing ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        dragging && "opacity-40",
        isWaiting
          ? "bg-amber-soft/[0.1] hover:bg-amber-soft/[0.14]"
          : isFailed
            ? "bg-rose-500/[0.1] hover:bg-rose-500/[0.14]"
            : isDone
              ? "bg-coal-600 opacity-70"
              : "bg-coal-600 hover:bg-coal-500",
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn("text-[10.5px] font-semibold", prio.cls)}>{prio.label}</span>
        {isWaiting ? (
          <Chip tone="amber" contained>
            <Hourglass className="h-2.5 w-2.5" strokeWidth={1.9} /> approval
          </Chip>
        ) : null}
        {isRunning ? <Chip tone="emerald" contained>running</Chip> : null}
        {isFailed ? (
          <Chip tone="rose" contained>
            <Bolt className="h-2.5 w-2.5" strokeWidth={1.9} /> failed
          </Chip>
        ) : null}
        {task.needsTesting ? (
          <Chip tone="amber" contained>
            <FlaskConical className="h-2.5 w-2.5" strokeWidth={1.9} /> testing
          </Chip>
        ) : null}
        <span className="ml-auto shrink-0 font-display text-[10px] font-bold tabular-nums text-chalk-400">
          {task.currentRunId
            ? task.currentRunId.slice(0, 8)
            : task.runIds.length > 0
              ? `${task.runIds.length} run`
              : ""}
        </span>
      </div>

      <div className="mt-1.5 flex items-start gap-1">
        {editing ? (
          <input
            ref={inputRef}
            data-no-open
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={onKey}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 border-b border-violet-soft/45 bg-transparent px-0.5 text-[12px] font-semibold leading-snug text-chalk-100 outline-none"
          />
        ) : (
          <div
            className={cn(
              "line-clamp-2 flex-1 break-words text-[12px] font-semibold leading-snug",
              isDone ? "text-chalk-400 line-through" : "text-chalk-100",
            )}
          >
            {task.title}
          </div>
        )}
        {startable ? (
          <button
            type="button"
            data-no-open
            onClick={(e) => {
              e.stopPropagation();
              onStart(task.id);
            }}
            className="shrink-0 p-0.5 text-chalk-400 opacity-0 transition-opacity hover:text-violet-soft group-hover:opacity-100"
            title="Start task"
            aria-label="Start task"
          >
            <Play className="h-3 w-3" strokeWidth={1.9} />
          </button>
        ) : null}
        <button
          type="button"
          data-no-open
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          className="shrink-0 p-0.5 text-chalk-400 opacity-0 transition-opacity hover:text-chalk-100 group-hover:opacity-100"
          title="Rename"
          aria-label="Rename task"
        >
          <Pencil className="h-3 w-3" strokeWidth={1.9} />
        </button>
        <button
          type="button"
          data-no-open
          onClick={(e) => {
            e.stopPropagation();
            void onDelete(task.id);
          }}
          className="shrink-0 p-0.5 text-chalk-400 opacity-0 transition-opacity hover:text-rose-300 group-hover:opacity-100"
          title="Remove task"
          aria-label="Remove task"
        >
          <Trash2 className="h-3 w-3" strokeWidth={1.9} />
        </button>
      </div>

      {roadmap && rmTone ? (
        <div className="mt-1.5 flex items-center gap-1.5 truncate text-[10.5px] text-chalk-200">
          <span className={cn("h-1 w-1 shrink-0 rounded-full", TONE_SWATCH[rmTone])} />
          <span className="truncate">{roadmap.title}</span>
        </div>
      ) : null}

      {task.requiredSkills.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {task.requiredSkills.slice(0, 2).map((sid) => (
            <Chip key={sid} tone="sky" contained className="max-w-[92px]">
              <span className="truncate">{sid}</span>
            </Chip>
          ))}
          {task.requiredSkills.length > 2 ? (
            <span className="text-[10px] text-chalk-400">+{task.requiredSkills.length - 2}</span>
          ) : null}
        </div>
      ) : null}

      {task.assignedRoles.length > 0 ||
      task.commentsCount > 0 ||
      task.touchedFiles.length > 0 ||
      (task.checklist?.length ?? 0) > 0 ||
      blockedBy > 0 ||
      unlocks > 0 ? (
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-[color:var(--line-soft)] pt-1.5">
          {task.assignedRoles.length > 0 ? (
            <RoleStack roleIds={task.assignedRoles} />
          ) : (
            <span className="text-[10px] text-chalk-400">unassigned</span>
          )}
          <div className="flex items-center gap-1.5 tabular-nums text-[10px] text-chalk-300">
            {(task.checklist?.length ?? 0) > 0 ? (
              <span
                className="inline-flex items-center gap-0.5"
                title={`${task.checklist!.filter((c) => c.status === "done").length}/${task.checklist!.length} checklist items done`}
              >
                <ListChecks className="h-2.5 w-2.5" strokeWidth={1.9} />
                {task.checklist!.filter((c) => c.status === "done").length}/
                {task.checklist!.length}
              </span>
            ) : null}
            {task.commentsCount > 0 ? (
              <span className="inline-flex items-center gap-0.5">
                <MessageSquare className="h-2.5 w-2.5" strokeWidth={1.9} />
                {task.commentsCount}
              </span>
            ) : null}
            {task.touchedFiles.length > 0 ? (
              <span className="inline-flex items-center gap-0.5">
                <Files className="h-2.5 w-2.5" strokeWidth={1.9} />
                {task.touchedFiles.length}
              </span>
            ) : null}
            {blockedBy > 0 ? (
              <span
                className="inline-flex items-center gap-0.5 text-rose-300/90"
                title={`Blocked by ${blockedBy} unfinished dependency`}
              >
                <Lock className="h-2.5 w-2.5" strokeWidth={1.9} />
                {blockedBy}
              </span>
            ) : null}
            {unlocks > 0 ? (
              <span
                className="inline-flex items-center gap-0.5"
                title={`${unlocks} task(s) depend on this one`}
              >
                <Unlock className="h-2.5 w-2.5" strokeWidth={1.9} />
                {unlocks}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RoleStack({ roleIds }: { roleIds: string[] }) {
  const max = 3;
  const shown = roleIds.slice(0, max);
  const extra = roleIds.length - max;
  const solid: Record<ChipTone, string> = {
    neutral: "#6a7186",
    violet: "#6951f0",
    sky: "#5fa6ff",
    emerald: "#10b981",
    amber: "#f59e0b",
    rose: "#e11d48",
  };
  return (
    <div className="flex items-center -space-x-1">
      {shown.map((id) => {
        const tone = roleTone(id);
        const initial =
          id.replace(/[^a-zA-Z]/g, "").charAt(0).toUpperCase() || "?";
        return (
          <span
            key={id}
            className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] leading-none text-white ring-2 ring-coal-600"
            style={{ background: solid[tone] }}
            title={id}
          >
            {initial}
          </span>
        );
      })}
      {extra > 0 ? (
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-coal-400 text-[8.5px] tabular-nums text-chalk-300 ring-2 ring-coal-600">
          +{extra}
        </span>
      ) : null}
    </div>
  );
}

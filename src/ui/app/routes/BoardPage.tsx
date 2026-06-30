// The task board - a coarse human kanban (roadmap -> tasks -> runs). Re-skinned
// onto the Mission Control canvas (PageShell `fill` archetype + design
// primitives); see docs/design/primitives-contract.md ("Page canvas") and the
// live /canvas route. Cards are click-to-open + inline-renamable; drag-and-drop
// is intentionally not wired because the server only exposes a handful of named
// transitions (queue / cancel / terminate) - partial DnD was misleading.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  Bolt,
  Check,
  Files,
  FlaskConical,
  Hourglass,
  Layers,
  LayoutGrid,
  ListChecks,
  Lock,
  MessageSquare,
  Pencil,
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
import { Chip, ToneDot } from "../../components/design/Chip.js";
import type { ChipTone } from "../../components/design/Chip.js";
import { Button } from "../../components/design/Button.js";
import { Select } from "../../components/design/Select.js";
import { StatTile } from "../../components/design/StatTile.js";
import { PageShell, PageHeader, Section } from "../../components/layout/PageShell.js";

// ── Columns ──────────────────────────────────────────────────────────────

type CoarseId =
  | "planned"
  | "in_progress"
  | "needs_testing"
  | "completed"
  | "archived";

type ColumnDef = {
  id: CoarseId;
  label: string;
  dot: string;
  bar: string;
};

// The board is a *coarse* human kanban (Phase 3) - not the orchestrator's fine
// run stages, which live in Mission Control. A card's column is derived from its
// status + the archived / needs-testing overlays (see coarseColumnOf).
const COLUMNS: ColumnDef[] = [
  { id: "planned",       label: "Planned",      dot: "bg-chalk-400",   bar: "bg-[color:var(--line-strong)]" },
  { id: "in_progress",   label: "In progress",  dot: "bg-emerald-400", bar: "bg-emerald-400/70" },
  { id: "needs_testing", label: "Needs testing", dot: "bg-amber-soft", bar: "bg-amber-soft/70" },
  { id: "completed",     label: "Completed",    dot: "bg-sky-glow",    bar: "bg-sky-glow/70" },
  { id: "archived",      label: "Archived",     dot: "bg-chalk-400",   bar: "bg-[color:var(--line-strong)]" },
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

  // Counts for the stat tiles.
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
        {suggestions[0] ? (
          <button
            type="button"
            onClick={() => onOpenTask(suggestions[0]!.taskId)}
            title={`Suggested next - ${suggestions[0]!.reason}`}
            className="mt-2 inline-flex max-w-[420px] items-center gap-1.5 rounded-[10px] border border-violet-soft/30 bg-violet-soft/10 px-2.5 py-1 text-[12px] text-chalk-100 transition hover:bg-violet-soft/15"
          >
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-violet-soft" strokeWidth={1.8} />
            <span className="text-chalk-400">next:</span>
            <span className="truncate">{suggestions[0]!.title}</span>
          </button>
        ) : null}

        {showRoadmapForm ? (
          <form onSubmit={submitRoadmap} className="mt-3 flex max-w-[640px] gap-2">
            <input
              autoFocus
              value={newRoadmapTitle}
              onChange={(e) => setNewRoadmapTitle(e.target.value)}
              placeholder="Build onboarding flow"
              className="flex-1 rounded-[12px] border border-[color:var(--line-strong)] bg-coal-800 px-3 py-2 text-[13px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none"
            />
            <Button type="submit" variant="secondary" size="md" disabled={busy || !newRoadmapTitle.trim()}>
              Add
            </Button>
          </form>
        ) : null}
        {showTaskForm ? (
          <form onSubmit={submitTask} className="mt-3 flex max-w-[760px] flex-wrap items-center gap-2">
            <input
              autoFocus
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
        ) : null}

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

      {/* Stat tiles */}
      <div className="mb-4 grid shrink-0 grid-cols-2 gap-2.5 md:grid-cols-4">
        <StatTile size="lg" value={counts.active} label="active" tone="violet" />
        <StatTile size="lg" value={counts.waiting} label="awaiting approval" tone="amber" />
        <StatTile size="lg" value={counts.blocked} label="blocked" tone="rose" />
        <StatTile size="lg" value={counts.done} label="done" tone="emerald" />
      </div>

      {/* Roadmap rail. With zero initiatives the rail is just an "All
       * initiatives" filter over nothing - the "Roadmap item" button is the
       * way in, so hide the rail until there's something to filter. */}
      {items.length > 0 ? (
        <Section className="mb-4 shrink-0" title={`Roadmap - ${items.length} initiatives`}>
          <RoadmapRail
            items={items}
            tasks={tasks}
            active={roadmapFilter}
            onSelect={setRoadmapFilter}
          />
        </Section>
      ) : null}

      {/* Toolbar - pointless with zero tasks (the empty state says what to do). */}
      {tasks.length > 0 ? (
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
      ) : null}

      {/* Kanban - fills the remaining viewport height */}
      {tasks.length === 0 ? (
        <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 px-6 py-12 text-center">
          <div className="text-[15px] font-semibold text-chalk-100">No tasks yet.</div>
          <p className="mt-1 text-[12.5px] text-chalk-300">
            Click <span className="font-semibold text-chalk-100">New task</span> above to start the first one.
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-x-auto pb-5">
          <div
            className="grid h-full gap-2.5"
            style={{
              gridTemplateColumns: `repeat(${COLUMNS.length}, minmax(208px, 1fr))`,
              minWidth: COLUMNS.length * 216,
            }}
          >
            {COLUMNS.map((col) => {
              const colTasks = filtered.filter((t) => coarseColumnOf(t) === col.id);
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
                />
              );
            })}
          </div>
        </div>
      )}
    </PageShell>
  );
}

// ── Roadmap rail ────────────────────────────────────────────────────────

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
    <div className="flex items-stretch gap-2.5 overflow-x-auto pb-1">
      <RoadmapChip
        label="All initiatives"
        meta={`${totalLinked} linked tasks`}
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
            meta={`${linked} tasks - ${rm.status}`}
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
        "relative min-w-[200px] shrink-0 rounded-[12px] border px-3.5 py-2.5 text-left transition",
        active
          ? "border-violet-soft/55 bg-violet-soft/10"
          : "border-[color:var(--line)] bg-coal-600 hover:bg-coal-500",
      )}
    >
      <div className="flex items-center gap-2">
        {all ? (
          <LayoutGrid className="h-3.5 w-3.5 text-violet-soft" strokeWidth={1.9} />
        ) : (
          <span className={cn("h-1.5 w-1.5 rounded-full", TONE_SWATCH[tone])} />
        )}
        <span className="truncate text-[12.5px] font-semibold text-chalk-100">{label}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-chalk-400">
        <span className="truncate">{meta}</span>
        {priority ? (
          <span
            className={cn(
              "font-semibold",
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
      </div>
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
      <div className="inline-flex rounded-[10px] border border-[color:var(--line)] bg-coal-600 p-[3px]">
        {priorities.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPriority(p)}
            className={cn(
              "rounded-[8px] px-2.5 py-1 text-[12px] font-semibold capitalize transition",
              priority === p
                ? "bg-coal-400 text-chalk-100"
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
}: {
  column: ColumnDef;
  tasks: Task[];
  allTasks: Task[];
  items: RoadmapItem[];
  onOpenTask: (taskId: string) => void;
  onRename: (taskId: string, nextTitle: string) => Promise<void> | void;
  onDelete: (taskId: string) => Promise<void> | void;
}) {
  const urgent = column.id === "needs_testing" && tasks.length > 0;

  return (
    <section
      data-column={column.id}
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-[16px] border bg-coal-600",
        urgent ? "border-amber-soft/40" : "border-[color:var(--line)]",
      )}
    >
      <div className={cn("h-[2px]", column.bar)} />
      <header className="flex items-center justify-between border-b border-[color:var(--line-soft)] px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", column.dot)} />
          <span className="truncate text-[12px] font-semibold text-chalk-100">
            {column.label}
          </span>
        </div>
        <span className="tabular-nums text-[11px] text-chalk-400">{tasks.length}</span>
      </header>

      <ol className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-1.5">
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
            return (
              <li key={t.id}>
                {t.runMode === "supervised" ? (
                  <SagaCard task={t} onOpen={onOpenTask} />
                ) : (
                  <TaskCard
                    task={t}
                    roadmap={roadmap}
                    blockedBy={openDeps.length}
                    unlocks={unlocks}
                    onOpen={onOpenTask}
                    onRename={onRename}
                    onDelete={onDelete}
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
}: {
  task: Task;
  onOpen: (taskId: string) => void;
}) {
  const checklist = task.checklist ?? [];
  const total = checklist.length;
  const done = checklist.filter((c) => c.status === "done").length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(task.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(task.id);
      }}
      data-task-id={task.id}
      className="group block w-full cursor-pointer rounded-[12px] border border-violet-soft/25 bg-violet-soft/[0.06] px-2.5 py-2 transition hover:border-violet-soft/50 hover:bg-violet-soft/10"
    >
      <div className="flex items-center gap-1.5">
        <Layers className="h-3.5 w-3.5 text-violet-soft" strokeWidth={1.9} />
        <Chip tone="violet">supervised</Chip>
        <span className="ml-auto tabular-nums text-[10px] text-chalk-300">
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
                    : "bg-coal-400",
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

// ── Task card (compact) ─────────────────────────────────────────────────

function TaskCard({
  task,
  roadmap,
  blockedBy,
  unlocks,
  onOpen,
  onRename,
  onDelete,
}: {
  task: Task;
  roadmap: RoadmapItem | null;
  blockedBy: number;
  unlocks: number;
  onOpen: (taskId: string) => void;
  onRename: (taskId: string, nextTitle: string) => Promise<void> | void;
  onDelete: (taskId: string) => Promise<void> | void;
}) {
  const prio = PRIORITY_LABEL[task.priority];
  const isRunning = task.status === "running";
  const isFailed = task.status === "failed";
  const isWaiting = task.status === "waiting_for_approval";
  const isDone = task.status === "done" || task.status === "cancelled";
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
      onClick={(e) => {
        if (editing) return;
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
        "group relative block w-full cursor-pointer rounded-[12px] border px-2.5 py-2 text-left transition",
        isWaiting
          ? "border-amber-soft/40 bg-amber-soft/[0.06]"
          : isFailed
            ? "border-rose-400/40 bg-rose-500/[0.06]"
            : isDone
              ? "border-[color:var(--line-soft)] bg-coal-500/40 opacity-75"
              : "border-[color:var(--line)] bg-coal-500/40 hover:border-violet-soft/45 hover:bg-coal-500",
      )}
    >
      {roadmap && rmTone ? (
        <span
          className={cn("absolute bottom-2.5 left-0 top-2.5 w-[2px] rounded-full", TONE_SWATCH[rmTone])}
          aria-label={roadmap.title}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn("text-[10.5px] font-semibold", prio.cls)}>{prio.label}</span>
        {isWaiting ? (
          <Chip tone="amber">
            <Hourglass className="h-2.5 w-2.5" strokeWidth={1.9} /> approval
          </Chip>
        ) : null}
        {isRunning ? <Chip tone="emerald">running</Chip> : null}
        {isFailed ? (
          <Chip tone="rose">
            <Bolt className="h-2.5 w-2.5" strokeWidth={1.9} /> failed
          </Chip>
        ) : null}
        {task.needsTesting ? (
          <Chip tone="amber">
            <FlaskConical className="h-2.5 w-2.5" strokeWidth={1.9} /> needs testing
          </Chip>
        ) : null}
        <span className="ml-auto shrink-0 tabular-nums text-[10px] text-chalk-400">
          {task.currentRunId
            ? task.currentRunId.slice(0, 10)
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
        <div className="mt-1 flex items-center gap-1 truncate text-[10px] text-chalk-300">
          <span className={cn("h-1 w-1 rounded-full", TONE_SWATCH[rmTone])} />
          <span className="truncate">{roadmap.title}</span>
        </div>
      ) : null}

      {task.requiredSkills.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {task.requiredSkills.slice(0, 2).map((sid) => (
            <span key={sid} className="inline-flex items-center gap-1 text-[10px] text-chalk-300">
              <ToneDot tone="sky" />
              <span className="max-w-[80px] truncate">{sid}</span>
            </span>
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
          <div className="flex items-center gap-1.5 tabular-nums text-[10px] text-chalk-400">
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

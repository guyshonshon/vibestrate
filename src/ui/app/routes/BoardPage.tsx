// Mission Control v3 board — compact layout.
// Cards are still click-to-open + inline-renamable; drag-and-drop is
// intentionally not wired because the server only exposes a handful
// of named transitions (queue / cancel / terminate) — partial DnD
// support was misleading, so we drop it entirely.

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
  Bolt,
  Files,
  FlaskConical,
  Grid3X3,
  Hourglass,
  ListChecks,
  Lock,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Unlock,
  X,
} from "lucide-react";
import { api } from "../../lib/api.js";
import type {
  Priority,
  RoadmapItem,
  Task,
  TaskStatus,
} from "../../lib/types.js";
import { cn } from "../../components/design/cn.js";
import { Chip, ToneDot } from "../../components/design/Chip.js";
import type { ChipTone } from "../../components/design/Chip.js";

// ── Columns ──────────────────────────────────────────────────────────────

type ColumnTone = "fog" | "sky" | "violet" | "emerald" | "amber" | "rose";

type ColumnDef = {
  id: string;
  label: string;
  statuses: TaskStatus[];
  tone: ColumnTone;
  accent: string;
};

const COLUMNS: ColumnDef[] = [
  { id: "ideas",   label: "Ideas",      statuses: ["backlog"],              tone: "fog",     accent: "rgba(255,255,255,0.04)" },
  { id: "ready",   label: "Ready",      statuses: ["ready"],                tone: "sky",     accent: "rgba(124,197,255,0.5)" },
  { id: "queued",  label: "Queued",     statuses: ["queued"],               tone: "violet",  accent: "rgba(167,139,250,0.45)" },
  { id: "running", label: "Running",    statuses: ["running"],              tone: "emerald", accent: "rgba(74,222,128,0.55)" },
  { id: "waiting", label: "Approval",   statuses: ["waiting_for_approval"], tone: "amber",   accent: "rgba(251,191,36,0.55)" },
  { id: "review",  label: "Review",     statuses: ["review"],               tone: "sky",     accent: "rgba(124,197,255,0.5)" },
  { id: "blocked", label: "Blocked",    statuses: ["blocked", "failed"],    tone: "rose",    accent: "rgba(244,114,128,0.5)" },
  { id: "done",    label: "Done",       statuses: ["done", "cancelled"],    tone: "emerald", accent: "rgba(74,222,128,0.35)" },
];

const COLUMN_TONE: Record<ColumnTone, { dot: string; text: string }> = {
  fog:     { dot: "bg-fog-500",     text: "text-fog-300"     },
  sky:     { dot: "bg-sky-glow",    text: "text-sky-glow"    },
  violet:  { dot: "bg-violet-soft", text: "text-violet-soft" },
  emerald: { dot: "bg-emerald-400", text: "text-emerald-300" },
  amber:   { dot: "bg-amber-300",   text: "text-amber-300"   },
  rose:    { dot: "bg-rose-400",    text: "text-rose-300"    },
};

const PRIORITY_PILL: Record<Priority, { label: string; cls: string }> = {
  low:    { label: "low",  cls: "border-white/10 text-fog-400 bg-white/[0.025]" },
  medium: { label: "med",  cls: "border-violet-soft/35 text-violet-soft bg-violet-soft/10" },
  high:   { label: "high", cls: "border-amber-400/40 text-amber-300 bg-amber-500/10" },
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
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  const [showRoadmapForm, setShowRoadmapForm] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [newRoadmapTitle, setNewRoadmapTitle] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskRoadmap, setNewTaskRoadmap] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<"any" | Priority>("any");
  const [roadmapFilter, setRoadmapFilter] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [t, r] = await Promise.all([api.listTasks(), api.listRoadmap()]);
      setTasks(t);
      setItems(r);
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
      });
      setNewTaskTitle("");
      setNewTaskRoadmap("");
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

  // Counts for the KPI tiles.
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
      <div className="relative z-10 w-full px-6 pt-6">
        <div className="glass px-5 py-4 text-[13px] text-rose-300 border border-rose-400/30">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-10 flex flex-col h-full min-h-0">
      {/* ── Compact header row ────────────────────────────────────── */}
      <section className="w-full px-6 pt-5 shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-baseline gap-3 min-w-0">
            <span className="eyebrow">Board</span>
            <span className="text-fog-500">·</span>
            <h1 className="text-[15px] font-semibold tracking-tight text-fog-100">
              Tasks{" "}
              <span className="mono text-[12px] text-fog-500 num-tabular">
                {tasks.length}
              </span>
            </h1>
            <span className="text-[11.5px] text-fog-500 hidden md:inline">
              roadmap → tasks → runs
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setShowRoadmapForm((v) => !v);
                setShowTaskForm(false);
              }}
              className="h-7 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2.5 text-[11.5px] text-fog-200 hover:bg-white/[0.06]"
            >
              <Plus className="h-3 w-3" strokeWidth={1.7} />
              Roadmap item
            </button>
            <button
              type="button"
              onClick={() => {
                setShowTaskForm((v) => !v);
                setShowRoadmapForm(false);
              }}
              className="h-7 inline-flex items-center gap-1.5 rounded-md border border-violet-soft/35 bg-gradient-to-b from-violet-mid/40 to-violet-deep/60 px-2.5 text-[11.5px] font-medium text-white hover:from-violet-mid/55 hover:to-violet-deep/75"
            >
              <Plus className="h-3 w-3" strokeWidth={1.7} />
              New task
            </button>
          </div>
        </div>

        {/* Inline forms — keep the layout from jumping by sharing the
            same width as the header above. */}
        {showRoadmapForm ? (
          <form onSubmit={submitRoadmap} className="mt-3 flex gap-2 max-w-[640px]">
            <input
              autoFocus
              value={newRoadmapTitle}
              onChange={(e) => setNewRoadmapTitle(e.target.value)}
              placeholder="Build onboarding flow"
              className="mono flex-1 h-8 rounded-md border border-white/[0.1] bg-white/[0.03] px-2.5 text-[12px] text-fog-100 placeholder:text-fog-500 focus:outline-none focus:border-violet-soft/40"
            />
            <button
              type="submit"
              disabled={busy || !newRoadmapTitle.trim()}
              className="h-8 px-3 rounded-md border border-white/10 bg-white/[0.05] text-[11.5px] text-fog-100 hover:bg-white/[0.08] disabled:opacity-50"
            >
              Add
            </button>
          </form>
        ) : null}
        {showTaskForm ? (
          <form
            onSubmit={submitTask}
            className="mt-3 flex gap-2 max-w-[760px] flex-wrap"
          >
            <input
              autoFocus
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Create setup wizard"
              className="mono flex-1 min-w-[240px] h-8 rounded-md border border-white/[0.1] bg-white/[0.03] px-2.5 text-[12px] text-fog-100 placeholder:text-fog-500 focus:outline-none focus:border-violet-soft/40"
            />
            <select
              value={newTaskRoadmap}
              onChange={(e) => setNewTaskRoadmap(e.target.value)}
              className="mono h-8 rounded-md border border-white/[0.1] bg-white/[0.03] px-2 text-[11.5px] text-fog-100"
            >
              <option value="">no roadmap link</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.title}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={busy || !newTaskTitle.trim()}
              className="h-8 px-3 rounded-md border border-white/10 bg-white/[0.05] text-[11.5px] text-fog-100 hover:bg-white/[0.08] disabled:opacity-50"
            >
              Add
            </button>
          </form>
        ) : null}

        {toast ? (
          <div
            role="status"
            className={cn(
              "mt-3 inline-block rounded-md border px-2.5 py-1 text-[11.5px]",
              toast.kind === "ok"
                ? "border-emerald-400/30 bg-emerald-500/5 text-emerald-300"
                : "border-rose-400/30 bg-rose-500/5 text-rose-300",
            )}
          >
            {toast.kind === "ok" ? "✓ " : "✗ "}
            {toast.text}
          </div>
        ) : null}
      </section>

      {/* ── KPI tiles (half-height of the original) ──────────────── */}
      <section className="w-full px-6 mt-4 shrink-0">
        <BoardKpiStrip counts={counts} />
      </section>

      {/* ── Roadmap rail (wider chips, single row) ───────────────── */}
      <section className="w-full px-6 mt-4 shrink-0">
        <div className="eyebrow mb-2">
          Roadmap · {items.length} initiatives
        </div>
        <RoadmapRail
          items={items}
          tasks={tasks}
          active={roadmapFilter}
          onSelect={setRoadmapFilter}
        />
      </section>

      {/* ── Toolbar: filter + count ──────────────────────────────── */}
      <section className="w-full px-6 mt-3 shrink-0">
        <BoardToolbar
          query={query}
          onQuery={setQuery}
          priority={priorityFilter}
          onPriority={setPriorityFilter}
          tasksShown={filtered.length}
          totalTasks={tasks.length}
        />
      </section>

      {/* ── Kanban — fills the remaining viewport height ─────────── */}
      <section className="mt-4 flex-1 min-h-0 flex flex-col">
        {tasks.length === 0 ? (
          <div className="w-full px-6">
            <div className="glass px-6 py-10 text-center">
              <div className="text-[15px] font-medium text-fog-100">
                No tasks yet.
              </div>
              <p className="text-[12.5px] text-fog-400 mt-1">
                Click <span className="mono text-fog-200">New task</span> above
                to start the first one.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto pb-5 px-6 board-scroll w-full flex-1 min-h-0">
            <div
              className="grid gap-2.5 h-full"
              style={{
                gridTemplateColumns: `repeat(${COLUMNS.length}, minmax(204px, 1fr))`,
                minWidth: COLUMNS.length * 212,
              }}
            >
              {COLUMNS.map((col) => {
                const colTasks = filtered.filter((t) =>
                  col.statuses.includes(t.status),
                );
                return (
                  <BoardColumn
                    key={col.id}
                    column={col}
                    tasks={colTasks}
                    allTasks={tasks}
                    items={items}
                    onOpenTask={onOpenTask}
                    onRename={handleRename}
                  />
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// ── KPI strip (half-height of the original) ─────────────────────────────

function BoardKpiStrip({
  counts,
}: {
  counts: { active: number; waiting: number; blocked: number; done: number };
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
      <KpiTile label="Active" value={counts.active} tone="violet" sub="in flight or queued" />
      <KpiTile
        label="Awaiting approval"
        value={counts.waiting}
        tone="amber"
        sub={counts.waiting > 0 ? "your turn" : "nothing pending"}
      />
      <KpiTile
        label="Blocked"
        value={counts.blocked}
        tone="rose"
        sub={counts.blocked > 0 ? "needs attention" : "all clear"}
      />
      <KpiTile label="Done" value={counts.done} tone="emerald" sub="all-time" />
    </div>
  );
}

function KpiTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub: string;
  tone: ColumnTone;
}) {
  const t = COLUMN_TONE[tone];
  return (
    <div className="glass relative overflow-hidden px-3 py-2">
      <div className="flex items-center justify-between">
        <div className="eyebrow text-[10px]">{label}</div>
        <span
          className={cn("w-1.5 h-1.5 rounded-full", t.dot)}
          style={{ boxShadow: "0 0 10px currentColor" }}
        />
      </div>
      <div className="mt-0.5 flex items-baseline justify-between gap-2">
        <div className="text-[20px] font-semibold tracking-tight num-tabular leading-none">
          {value}
        </div>
        <div className="text-[10.5px] text-fog-400 truncate">{sub}</div>
      </div>
    </div>
  );
}

// ── Roadmap rail (original wide chips) ──────────────────────────────────

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
    <div className="flex items-stretch gap-2.5 overflow-x-auto pb-1 board-scroll">
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
            meta={`${linked} tasks · ${rm.status}`}
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
  const swatch: Record<ChipTone, string> = {
    neutral: "bg-fog-400",
    violet: "bg-violet-soft",
    sky: "bg-sky-glow",
    emerald: "bg-emerald-400",
    amber: "bg-amber-300",
    rose: "bg-rose-400",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-xl border px-3.5 py-2.5 text-left transition relative overflow-hidden min-w-[200px]",
        active
          ? "border-violet-soft/45 bg-violet-soft/[0.08] ring-1 ring-violet-soft/30"
          : "border-white/[0.08] bg-white/[0.018] hover:bg-white/[0.035]",
      )}
    >
      <div className="flex items-center gap-2">
        {all ? (
          <Grid3X3 className="h-3 w-3 text-violet-soft" strokeWidth={1.7} />
        ) : (
          <span
            className={cn("w-1.5 h-1.5 rounded-full", swatch[tone])}
            style={{ boxShadow: "0 0 8px currentColor" }}
          />
        )}
        <span className="text-[12.5px] text-fog-100 font-medium truncate">
          {label}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[10.5px] text-fog-500 mono">
        <span className="truncate">{meta}</span>
        {priority ? (
          <span
            className={cn(
              "uppercase tracking-[0.12em] text-[9.5px]",
              priority === "high"
                ? "text-amber-300"
                : priority === "medium"
                  ? "text-violet-soft"
                  : "text-fog-500",
            )}
          >
            {priority}
          </span>
        ) : null}
      </div>
    </button>
  );
}

// ── Toolbar (filter + count) ────────────────────────────────────────────

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
    <div className="flex items-center gap-3 flex-wrap">
      <div className="relative flex-1 min-w-[240px] max-w-[360px]">
        <Search
          className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fog-500"
          strokeWidth={1.7}
        />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Filter by title…"
          className="w-full h-8 pl-8 pr-3 rounded-md bg-white/[0.025] border border-white/[0.08] text-[12px] text-fog-100 placeholder:text-fog-500 focus:outline-none focus:border-violet-soft/35 focus:bg-white/[0.04]"
        />
        {query ? (
          <button
            type="button"
            onClick={() => onQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-fog-500 hover:text-fog-200"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.7} />
          </button>
        ) : null}
      </div>
      <div className="inline-flex rounded-md border border-white/[0.08] bg-white/[0.025] p-[2px]">
        {priorities.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPriority(p)}
            className={cn(
              "h-[26px] px-2.5 rounded text-[11.5px] font-medium",
              priority === p
                ? "bg-white/[0.08] text-fog-100"
                : "text-fog-400 hover:text-fog-100",
            )}
          >
            {p === "any" ? "Any" : p}
          </button>
        ))}
      </div>
      <span className="ml-auto text-[11px] text-fog-500 mono">
        showing <span className="text-fog-200 num-tabular">{tasksShown}</span>
        /{totalTasks}
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
}: {
  column: ColumnDef;
  tasks: Task[];
  allTasks: Task[];
  items: RoadmapItem[];
  onOpenTask: (taskId: string) => void;
  onRename: (taskId: string, nextTitle: string) => Promise<void> | void;
}) {
  const tone = COLUMN_TONE[column.tone];
  const isRunning = column.id === "running";
  const urgent = column.id === "waiting" && tasks.length > 0;

  return (
    <section
      data-column={column.id}
      className={cn(
        "flex flex-col rounded-xl border surface-ink-100-55 backdrop-blur-xl h-full min-h-0",
        urgent ? "border-amber-400/25" : "border-white/[0.06]",
      )}
      style={{
        boxShadow: urgent
          ? "0 0 0 1px rgba(251,191,36,0.08) inset, 0 8px 24px -16px rgba(251,191,36,0.25)"
          : undefined,
      }}
    >
      <div
        className="h-[2px] rounded-t-xl"
        style={{
          background: `linear-gradient(90deg, ${column.accent} 0%, transparent 100%)`,
        }}
      />
      <header className="px-3 py-2.5 flex items-center justify-between border-b border-white/[0.05]">
        <div className="flex items-center gap-1.5 min-w-0">
          {isRunning ? (
            <span className={cn("pulse-dot", tone.text)} />
          ) : (
            <span className={cn("w-1.5 h-1.5 rounded-full", tone.dot)} />
          )}
          <span className="mono text-[10px] uppercase tracking-[0.14em] text-fog-300 truncate">
            {column.label}
          </span>
        </div>
        <span className="mono text-[10px] num-tabular text-fog-500">
          {tasks.length}
        </span>
      </header>

      <ol className="flex-1 min-h-0 p-1.5 space-y-1.5 overflow-y-auto board-scroll">
        {tasks.length === 0 ? (
          <li className="text-center py-6 text-[10.5px] text-fog-500 mono select-none">
            — empty —
          </li>
        ) : (
          tasks.map((t) => {
            const openDeps = t.dependencies.filter((depId) => {
              const dep = allTasks.find((tt) => tt.id === depId);
              return (
                !dep || (dep.status !== "done" && dep.status !== "cancelled")
              );
            });
            const unlocks = allTasks.filter((tt) =>
              tt.dependencies.includes(t.id),
            ).length;
            const roadmap = t.roadmapItemId
              ? items.find((rm) => rm.id === t.roadmapItemId) ?? null
              : null;
            return (
              <li key={t.id}>
                <TaskCard
                  task={t}
                  roadmap={roadmap}
                  blockedBy={openDeps.length}
                  unlocks={unlocks}
                  onOpen={onOpenTask}
                  onRename={onRename}
                />
              </li>
            );
          })
        )}
      </ol>
    </section>
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
}: {
  task: Task;
  roadmap: RoadmapItem | null;
  blockedBy: number;
  unlocks: number;
  onOpen: (taskId: string) => void;
  onRename: (taskId: string, nextTitle: string) => Promise<void> | void;
}) {
  const prio = PRIORITY_PILL[task.priority];
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
  const rmSwatch: Record<ChipTone, string> = {
    neutral: "bg-fog-400",
    violet: "bg-violet-soft",
    sky: "bg-sky-glow",
    emerald: "bg-emerald-400",
    amber: "bg-amber-300",
    rose: "bg-rose-400",
  };

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
        "group block w-full text-left rounded-lg border px-2.5 py-2 transition relative card-hover cursor-pointer",
        isWaiting
          ? "border-amber-400/30 bg-amber-500/[0.05]"
          : isFailed
            ? "border-rose-400/25 bg-rose-500/[0.04]"
            : isDone
              ? "border-white/[0.05] bg-white/[0.012] opacity-80"
              : "border-white/[0.07] bg-white/[0.022] hover:bg-white/[0.04]",
      )}
    >
      {roadmap && rmTone ? (
        <span
          className={cn(
            "absolute left-0 top-2.5 bottom-2.5 w-[2px] rounded-r-full",
            rmSwatch[rmTone],
          )}
          aria-label={roadmap.title}
        />
      ) : null}

      <div className="flex items-center gap-1 flex-wrap">
        <span
          className={cn(
            "mono text-[9px] uppercase tracking-[0.12em] inline-flex items-center rounded border px-1 py-[1px]",
            prio.cls,
          )}
        >
          {prio.label}
        </span>
        {isWaiting ? (
          <Chip
            tone="amber"
            className="!text-[9px] !px-1 !py-[1px] !rounded !uppercase !tracking-[0.12em] !font-normal"
          >
            <Hourglass className="h-2.5 w-2.5" strokeWidth={1.7} /> approval
          </Chip>
        ) : null}
        {isRunning ? (
          <Chip
            tone="emerald"
            className="!text-[9px] !px-1 !py-[1px] !rounded !uppercase !tracking-[0.12em] !font-normal"
          >
            <span className="pulse-dot" /> running
          </Chip>
        ) : null}
        {isFailed ? (
          <Chip
            tone="rose"
            className="!text-[9px] !px-1 !py-[1px] !rounded !uppercase !tracking-[0.12em] !font-normal"
          >
            <Bolt className="h-2.5 w-2.5" strokeWidth={1.7} /> failed
          </Chip>
        ) : null}
        {task.needsTesting ? (
          <Chip
            tone="amber"
            className="!text-[9px] !px-1 !py-[1px] !rounded !uppercase !tracking-[0.12em] !font-normal"
          >
            <FlaskConical className="h-2.5 w-2.5" strokeWidth={1.7} /> needs testing
          </Chip>
        ) : null}
        <span className="ml-auto mono text-[9px] text-fog-500 num-tabular shrink-0">
          {task.currentRunId
            ? task.currentRunId.slice(0, 10)
            : task.runIds.length > 0
              ? `${task.runIds.length} run`
              : "—"}
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
            className="flex-1 bg-transparent text-[12px] leading-snug font-medium text-fog-100 outline-none border-b border-violet-soft/45 px-0.5"
          />
        ) : (
          <div
            className={cn(
              "flex-1 text-[12px] leading-snug font-medium break-words",
              isDone ? "text-fog-400 line-through-soft" : "text-fog-100",
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
          className="opacity-0 group-hover:opacity-100 transition-opacity text-fog-500 hover:text-fog-200 p-0.5 shrink-0"
          title="Rename"
          aria-label="Rename task"
        >
          <Pencil className="h-3 w-3" strokeWidth={1.7} />
        </button>
      </div>

      {roadmap && rmTone ? (
        <div className="mt-1 flex items-center gap-1 text-[9.5px] mono text-fog-500 truncate">
          <span className={cn("w-1 h-1 rounded-full", rmSwatch[rmTone])} />
          <span className="truncate">{roadmap.title}</span>
        </div>
      ) : null}

      {task.requiredSkills.length > 0 ? (
        <div className="mt-1.5 flex items-center gap-1 flex-wrap">
          {task.requiredSkills.slice(0, 2).map((sid) => (
            <span
              key={sid}
              className="inline-flex items-center gap-1 rounded-full border border-white/[0.07] bg-white/[0.02] px-1.5 py-[1px] text-[9.5px] text-fog-300"
            >
              <ToneDot tone="sky" />
              <span className="truncate max-w-[80px]">{sid}</span>
            </span>
          ))}
          {task.requiredSkills.length > 2 ? (
            <span className="mono text-[9.5px] text-fog-500">
              +{task.requiredSkills.length - 2}
            </span>
          ) : null}
        </div>
      ) : null}

      {(task.assignedRoles.length > 0 ||
        task.commentsCount > 0 ||
        task.touchedFiles.length > 0 ||
        (task.checklist?.length ?? 0) > 0 ||
        blockedBy > 0 ||
        unlocks > 0) ? (
        <div className="mt-2 pt-1.5 border-t border-white/[0.04] flex items-center justify-between gap-2">
          {task.assignedRoles.length > 0 ? (
            <RoleStack roleIds={task.assignedRoles} />
          ) : (
            <span className="mono text-[9.5px] text-fog-500">unassigned</span>
          )}
          <div className="flex items-center gap-1.5 text-[9.5px] text-fog-500 mono">
            {(task.checklist?.length ?? 0) > 0 ? (
              <span
                className="inline-flex items-center gap-0.5"
                title={`${task.checklist!.filter((c) => c.status === "done").length}/${task.checklist!.length} checklist items done`}
              >
                <ListChecks className="h-2.5 w-2.5" strokeWidth={1.7} />
                {task.checklist!.filter((c) => c.status === "done").length}/
                {task.checklist!.length}
              </span>
            ) : null}
            {task.commentsCount > 0 ? (
              <span className="inline-flex items-center gap-0.5">
                <MessageSquare className="h-2.5 w-2.5" strokeWidth={1.7} />
                {task.commentsCount}
              </span>
            ) : null}
            {task.touchedFiles.length > 0 ? (
              <span className="inline-flex items-center gap-0.5">
                <Files className="h-2.5 w-2.5" strokeWidth={1.7} />
                {task.touchedFiles.length}
              </span>
            ) : null}
            {blockedBy > 0 ? (
              <span
                className="inline-flex items-center gap-0.5 text-rose-300/90"
                title={`Blocked by ${blockedBy} unfinished dependency`}
              >
                <Lock className="h-2.5 w-2.5" strokeWidth={1.7} />
                {blockedBy}
              </span>
            ) : null}
            {unlocks > 0 ? (
              <span
                className="inline-flex items-center gap-0.5"
                title={`${unlocks} task(s) depend on this one`}
              >
                <Unlock className="h-2.5 w-2.5" strokeWidth={1.7} />
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
  const gradient: Record<ChipTone, string> = {
    neutral: "linear-gradient(135deg,#9aa0b3,#6a7186)",
    violet: "linear-gradient(135deg,#a78bfa,#6951f0)",
    sky: "linear-gradient(135deg,#7cc5ff,#5fa6ff)",
    emerald: "linear-gradient(135deg,#6ee7b7,#10b981)",
    amber: "linear-gradient(135deg,#fcd34d,#f59e0b)",
    rose: "linear-gradient(135deg,#fda4af,#e11d48)",
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
            className="w-4 h-4 rounded ring-2 ring-ink-100 flex items-center justify-center font-serif leading-none text-[9px] text-white"
            style={{ background: gradient[tone] }}
            title={id}
          >
            {initial}
          </span>
        );
      })}
      {extra > 0 ? (
        <span className="w-4 h-4 rounded ring-2 ring-ink-100 bg-white/[0.06] flex items-center justify-center text-[8.5px] mono text-fog-300">
          +{extra}
        </span>
      ) : null}
    </div>
  );
}

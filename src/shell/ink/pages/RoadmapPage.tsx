import React, { useMemo, useReducer, useState } from "react";
import { Box, Text, useInput, useApp } from "ink";
import type { Task } from "../../../roadmap/roadmap-types.js";
import {
  buildBoard,
  clampCursor,
  moveCursor,
  selectedTask,
} from "../roadmap/board.js";
import {
  initTaskForm,
  reduceTaskForm,
  validateTaskForm,
  type TaskFormState,
} from "../roadmap/form.js";
import { TaskForm } from "../components/TaskForm.js";
import {
  createTask,
  editTask,
  deleteTask,
  queueTask,
  markReady,
} from "../roadmap/task-actions.js";
import { editInEditor } from "../roadmap/editor-handoff.js";
import { spawnAmacoDetached } from "../runner/command-runner.js";
import { CARD_PROPS, FOCAL_CARD_PROPS, clip, taskStatusToken } from "../theme.js";
import { AccentHeader, SelectionMark, StatusPill } from "../components/visuals.js";

type Props = {
  projectRoot: string;
  tasks: Task[];
  /** Surface scheduler-offline warnings on the Q (queue) toast. */
  schedulerLiveness: import("../../../scheduler/scheduler-liveness.js").SchedulerLiveness;
  refresh: () => Promise<void>;
  onToast: (kind: "ok" | "err" | "info", message: string) => void;
  ui: {
    cursor: { col: number; row: number };
    formOpen: boolean;
    pendingDeleteTaskId: string | null;
  };
  setCursor: (cursor: { col: number; row: number }) => void;
  openForm: () => void;
  closeForm: () => void;
  setPendingDelete: (taskId: string | null) => void;
  /** When true, this page is the focused content — drive useInput. */
  active: boolean;
};

export function RoadmapPage({
  projectRoot,
  tasks,
  schedulerLiveness,
  refresh,
  onToast,
  ui,
  setCursor,
  openForm,
  closeForm,
  setPendingDelete,
  active,
}: Props) {
  const board = useMemo(() => buildBoard(tasks), [tasks]);
  const cursor = clampCursor(board, ui.cursor);
  const selected = selectedTask(board, cursor);
  const [form, dispatchForm] = useReducer(
    reduceTaskForm,
    null as unknown as TaskFormState,
    () => initTaskForm("create", null),
  );
  // Track which mode the form should re-init into next time it opens.
  // The reducer's initial value is set on first render; subsequent
  // openings re-seed via useEffect-like flow below.
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const { exit } = useApp();
  void exit;

  // When formOpen flips on, re-init the form for the current mode.
  React.useEffect(() => {
    if (!ui.formOpen) return;
    if (formMode === "edit" && selected) {
      dispatchForm({ type: "focus", field: "title" });
      const seeded = initTaskForm("edit", selected.id, {
        title: selected.title,
        description: selected.description,
        priority: selected.priority,
        effort: selected.effort ?? "",
        providerOverride: selected.providerOverride ?? "",
        readOnly: selected.readOnly,
      });
      // Reset by issuing field actions for each value (the reducer
      // doesn't have a single "init" action by design — the seed object
      // captures the same state).
      for (const k of Object.keys(seeded) as (keyof TaskFormState)[]) {
        if (
          k === "title" ||
          k === "description" ||
          k === "priority" ||
          k === "effort" ||
          k === "providerOverride" ||
          k === "readOnly"
        ) {
          dispatchForm({ type: "field", field: k, value: seeded[k] as never });
        }
      }
    } else {
      const seeded = initTaskForm("create", null);
      for (const k of ["title", "description", "providerOverride"] as const) {
        dispatchForm({ type: "field", field: k, value: seeded[k] });
      }
      dispatchForm({ type: "field", field: "priority", value: "medium" });
      dispatchForm({ type: "field", field: "effort", value: "" });
      dispatchForm({ type: "field", field: "readOnly", value: false });
      dispatchForm({ type: "focus", field: "title" });
    }
  }, [ui.formOpen, formMode, selected]);

  const submit = async (): Promise<void> => {
    const v = validateTaskForm(form);
    if (!v.ok) {
      dispatchForm({ type: "errors", value: v.errors });
      return;
    }
    const r =
      formMode === "edit" && form.existingId
        ? await editTask(projectRoot, form.existingId, v.value)
        : await createTask(projectRoot, v.value);
    onToast(r.ok ? "ok" : "err", r.message);
    if (r.ok) {
      closeForm();
      await refresh();
    }
  };

  const handleEditDescription = async (): Promise<void> => {
    try {
      const next = await editInEditor(form.description);
      dispatchForm({ type: "field", field: "description", value: next });
    } catch (err) {
      onToast(
        "err",
        `editor failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  useInput(
    (input, key) => {
      // Form modal owns input when open.
      if (ui.formOpen) {
        if (key.escape) {
          closeForm();
          return;
        }
        if (key.tab) {
          dispatchForm({
            type: "focus.cycle",
            direction: key.shift ? -1 : 1,
          });
          return;
        }
        // ↑ / ↓ also cycle fields, since a lot of users reach for
        // arrows before they think of Tab. This is safe even when a
        // TextInput is focused: ink-text-input doesn't bind ↑/↓.
        if (key.upArrow) {
          dispatchForm({ type: "focus.cycle", direction: -1 });
          return;
        }
        if (key.downArrow) {
          dispatchForm({ type: "focus.cycle", direction: 1 });
          return;
        }
        if (key.return) {
          // Enter on the last field submits; otherwise advance to the
          // next field so the form behaves like a typical wizard.
          if (form.focused === "readOnly") {
            void submit();
          } else {
            dispatchForm({ type: "focus.cycle", direction: 1 });
          }
          return;
        }
        if (input === "D") {
          void handleEditDescription();
          return;
        }
        // ←/→ on enum pickers
        if (key.leftArrow || key.rightArrow) {
          const delta = key.leftArrow ? -1 : 1;
          if (form.focused === "priority") {
            const order = ["low", "medium", "high"];
            const idx = order.indexOf(form.priority);
            const next = order[(idx + delta + order.length) % order.length]!;
            dispatchForm({ type: "field", field: "priority", value: next });
            return;
          }
          if (form.focused === "effort") {
            const order = ["", "low", "medium", "high"];
            const idx = order.indexOf(form.effort);
            const next = order[(idx + delta + order.length) % order.length]!;
            dispatchForm({ type: "field", field: "effort", value: next });
            return;
          }
        }
        if (input === " " && form.focused === "readOnly") {
          dispatchForm({
            type: "field",
            field: "readOnly",
            value: !form.readOnly,
          });
          return;
        }
        // Otherwise: the focused TextInput swallows the key.
        return;
      }

      // Delete confirmation
      if (ui.pendingDeleteTaskId) {
        const id = ui.pendingDeleteTaskId;
        setPendingDelete(null);
        if (input === "y" || input === "Y") {
          void deleteTask(projectRoot, id).then(async (r) => {
            onToast(r.ok ? "ok" : "err", r.message);
            await refresh();
          });
        } else {
          onToast("info", "delete cancelled.");
        }
        return;
      }

      if (!active) return;

      if (key.leftArrow || input === "h") {
        const next = moveCursor(board, cursor, "left");
        setCursor(next);
        return;
      }
      if (key.rightArrow || input === "l") {
        const next = moveCursor(board, cursor, "right");
        setCursor(next);
        return;
      }
      if (key.upArrow || input === "k") {
        const next = moveCursor(board, cursor, "up");
        setCursor(next);
        return;
      }
      if (key.downArrow || input === "j") {
        const next = moveCursor(board, cursor, "down");
        setCursor(next);
        return;
      }
      if (input === "n") {
        setFormMode("create");
        openForm();
        return;
      }
      if (input === "e" && selected) {
        setFormMode("edit");
        openForm();
        return;
      }
      if (input === "d" && selected) {
        setPendingDelete(selected.id);
        return;
      }
      if (input === "Q" && selected) {
        // capital-Q queues the task. lowercase q is reserved for quit.
        void queueTask(projectRoot, selected.id).then(async (r) => {
          if (!r.ok) {
            onToast("err", r.message);
            await refresh();
            return;
          }
          // Loud-by-default: tell the user where the queued task
          // goes next. If the scheduler isn't actually running,
          // surface that immediately + suggest the fix.
          const liveMsg = schedulerLiveness.pickingUpWork
            ? `${r.message} · ${schedulerLiveness.summary}`
            : `${r.message} · ${schedulerLiveness.summary}`;
          onToast(
            schedulerLiveness.pickingUpWork ? "ok" : "info",
            liveMsg,
          );
          await refresh();
        });
        return;
      }
      if (input === "c" && selected && selected.status === "backlog") {
        void markReady(projectRoot, selected.id).then(async (r) => {
          onToast(r.ok ? "ok" : "err", r.message);
          await refresh();
        });
        return;
      }
      // Enter or "r" runs the selected task in the background. We
      // spawn `amaco run --task <id> "<title>"` detached so the
      // panel stays responsive — output streams into the per-run
      // event log + the Runs page.
      if ((key.return || input === "r" || input === "R") && selected) {
        if (selected.currentRunId) {
          onToast(
            "info",
            `Task already linked to run ${selected.currentRunId}. Open Runs to inspect.`,
          );
          return;
        }
        const { pid } = spawnAmacoDetached({
          projectRoot,
          argv: ["run", "--task", selected.id, selected.title],
        });
        onToast(
          "ok",
          `Started \`amaco run --task ${selected.id}\` (pid ${pid ?? "—"}). Switch to [2] Runs to watch.`,
        );
        void refresh();
        return;
      }
    },
    { isActive: active },
  );

  const activeColumn = board.columns[cursor.col] ?? null;
  const boardEmpty = tasks.length === 0;
  return (
    <Box flexDirection="column">
      <AccentHeader title="Roadmap" hint={`${tasks.length} total`} />

      {boardEmpty ? (
        <Box marginTop={1} flexDirection="column">
          <Text color="cyan" bold>Your roadmap is empty — start here</Text>
          <Box marginTop={1} flexDirection="column">
            <Text>
              <Text color="cyan">1.</Text>
              <Text>  Press </Text>
              <Text color="cyan">n</Text>
              <Text> to define a task </Text>
              <Text dimColor>(a durable unit of work)</Text>
            </Text>
            <Text>
              <Text color="cyan">2.</Text>
              <Text>  Press </Text>
              <Text color="cyan">↵</Text>
              <Text> on it to run </Text>
              <Text dimColor>(creates a new run under [4] Runs)</Text>
            </Text>
            <Text>
              <Text color="cyan">3.</Text>
              <Text>  Or press </Text>
              <Text color="cyan">Q</Text>
              <Text> to queue it for the scheduler </Text>
              <Text dimColor>([3] Queue)</Text>
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>
              shortcut: <Text color="cyan">!</Text> opens the runner —{" "}
              <Text>amaco tasks add "title"</Text>
            </Text>
          </Box>
        </Box>
      ) : null}

      {/* Status rail — colored status pills with the active state in
          inverse-on-status-color so each workflow phase has its own
          visual identity. */}
      <Box marginTop={1}>
        <StatusRail columns={board.columns} activeIndex={cursor.col} />
      </Box>

      {/* Tasks for the active state, then the focal detail card. */}
      <Box marginTop={1} {...CARD_PROPS} flexDirection="column">
        <Text dimColor>
          {activeColumn ? activeColumn.label.toLowerCase() : "—"} ·{" "}
          {activeColumn?.tasks.length ?? 0} task
          {(activeColumn?.tasks.length ?? 0) === 1 ? "" : "s"}
        </Text>
        <Box marginTop={1} flexDirection="column">
          {activeColumn && activeColumn.tasks.length > 0 ? (
            activeColumn.tasks.slice(0, 8).map((t, ri) => (
              <TaskRow
                key={t.id}
                task={t}
                selected={ri === cursor.row}
              />
            ))
          ) : (
            <Text dimColor>
              no tasks in this state — press <Text color="cyan">n</Text> to
              create one
            </Text>
          )}
          {activeColumn && activeColumn.tasks.length > 8 ? (
            <Text dimColor>+ {activeColumn.tasks.length - 8} more</Text>
          ) : null}
        </Box>
      </Box>

      <Box marginTop={1} {...FOCAL_CARD_PROPS} flexDirection="column">
        {selected ? (
          <TaskDetail task={selected} />
        ) : (
          <Text dimColor>
            select a task with <Text color="cyan">↑↓</Text> · cycle state with{" "}
            <Text color="cyan">←→</Text> · <Text color="cyan">n</Text> creates one
          </Text>
        )}
      </Box>

      {ui.pendingDeleteTaskId ? (
        <Box marginTop={1}>
          <Text color="yellow">
            confirm delete of {ui.pendingDeleteTaskId} — press{" "}
            <Text bold>y</Text> to confirm · any other key to cancel
          </Text>
        </Box>
      ) : null}
      {ui.formOpen ? (
        <Box marginTop={1}>
          <TaskForm
            form={form}
            dispatch={dispatchForm}
            onSubmit={submit}
            onCancel={closeForm}
            onEditDescription={handleEditDescription}
          />
        </Box>
      ) : null}
    </Box>
  );
}

/**
 * Compact horizontal rail of workflow states, joined by `│`. The
 * active state is inverse-cyan; the rest are dim but the count
 * stays full-strength so the user can see distribution at a glance.
 */
function StatusRail({
  columns,
  activeIndex,
}: {
  columns: ReadonlyArray<{ id: string; label: string; tasks: Task[] }>;
  activeIndex: number;
}) {
  return (
    <Box flexWrap="wrap">
      <Text>
        {columns.map((c, i) => {
          const active = i === activeIndex;
          const token = taskStatusToken(c.id);
          return (
            <React.Fragment key={c.id}>
              {i > 0 ? <Text dimColor>{"   "}</Text> : null}
              <StatusPill
                token={{ ...token, label: c.label.toLowerCase() }}
                count={c.tasks.length}
                active={active}
              />
            </React.Fragment>
          );
        })}
      </Text>
    </Box>
  );
}

function TaskRow({ task, selected }: { task: Task; selected: boolean }) {
  const tok = taskStatusToken(task.status);
  return (
    <Box>
      <SelectionMark selected={selected} />
      <Text>
        <Text color={tok.color}>{tok.glyph}</Text>
        <Text> </Text>
        <Text bold={selected}>
          {clip(task.title, 38).padEnd(38)}
        </Text>
        <Text dimColor>  prio </Text>
        <Text>{task.priority.padEnd(6)}</Text>
        <Text dimColor>  effort </Text>
        <Text>{(task.effort ?? "—").padEnd(6)}</Text>
        {task.readOnly ? <Text color="yellow">  ◉ read-only</Text> : null}
        <Text dimColor>  {clip(task.id, 24)}</Text>
      </Text>
    </Box>
  );
}

function TaskDetail({ task }: { task: Task }) {
  return (
    <Box flexDirection="column">
      <Text bold>{task.title}</Text>
      <Box marginTop={1} flexDirection="column">
        <DetailRow label="ID" value={task.id} mono />
        <DetailRow label="Status" value={task.status} />
        <DetailRow label="Priority" value={task.priority} />
        <DetailRow label="Effort" value={task.effort ?? "—"} />
        <DetailRow
          label="Mode"
          value={task.readOnly ? "read-only" : "writable"}
          tint={task.readOnly ? "yellow" : undefined}
        />
        {task.providerOverride ? (
          <DetailRow label="Provider" value={task.providerOverride} />
        ) : null}
        {task.validationProfile ? (
          <DetailRow label="Profile" value={task.validationProfile} />
        ) : null}
        {task.runIds.length > 0 ? (
          <DetailRow label="Runs" value={task.runIds.join(", ")} mono />
        ) : null}
      </Box>
      {task.description ? (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Description</Text>
          {task.description
            .split("\n")
            .slice(0, 6)
            .map((line, i) => (
              <Text key={i}>{line}</Text>
            ))}
          {task.description.split("\n").length > 6 ? (
            <Text dimColor>
              … {task.description.split("\n").length - 6} more lines · press{" "}
              <Text color="cyan">e</Text> then <Text color="cyan">D</Text> to
              edit in $EDITOR
            </Text>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}

const DETAIL_LABEL_WIDTH = 10;

function DetailRow({
  label,
  value,
  mono,
  tint,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tint?: "yellow" | "red";
}) {
  return (
    <Box>
      <Text>
        <Text dimColor>{label.padEnd(DETAIL_LABEL_WIDTH)}</Text>
        <Text color={tint}>{value}</Text>
      </Text>
    </Box>
  );
  void mono;
}

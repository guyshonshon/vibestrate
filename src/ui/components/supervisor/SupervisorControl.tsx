import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Square, Play, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { api } from "../../lib/api.js";
import type {
  SupervisorMessageView,
  SupervisorPauseView,
  SupervisorThreadView,
} from "../../lib/api/supervisors.js";
import { Button } from "../design/Button.js";
import { ErrorView } from "../../lib/error-view.js";

// The Supervisor Control surface: a conversation with the project's supervisor
// that persists, plus the stop button.
//
// The action trail is the point, not decoration. A supervisor that can create
// tasks and start runs has to be answerable for it, so every action it took
// renders inline on the message that caused it - including the ones it refused,
// which are the ones you would otherwise assume had worked.

const INTENT_LABEL: Record<string, string> = {
  "task.create": "made a task",
  "checklist.add": "added TODOs",
  "run.start": "started a run",
  answer: "answered",
};

function ActionChip({ action }: { action: NonNullable<SupervisorMessageView["action"]> }) {
  const tone = action.ok
    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
    : "border-amber-400/30 bg-amber-400/10 text-amber-200";
  return (
    <div className={`mt-2 flex items-start gap-2 rounded-[10px] border px-2.5 py-1.5 ${tone}`}>
      {action.ok ? (
        <CheckCircle2 className="mt-[1px] h-3.5 w-3.5 shrink-0" strokeWidth={2} />
      ) : (
        <XCircle className="mt-[1px] h-3.5 w-3.5 shrink-0" strokeWidth={2} />
      )}
      <div className="min-w-0">
        <div className="text-[11.5px] font-semibold">
          {INTENT_LABEL[action.intent] ?? action.intent}
          {action.undone ? " (undone)" : ""}
        </div>
        <div className="text-[11.5px] opacity-90">{action.summary}</div>
      </div>
    </div>
  );
}

function Bubble({ message }: { message: SupervisorMessageView }) {
  const mine = message.role === "user";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-[12px] px-3 py-2 ${
          mine
            ? "bg-violet-soft/15 text-chalk-100"
            : "border border-[color:var(--line-soft)] bg-coal-800 text-chalk-200"
        }`}
      >
        <p className="whitespace-pre-wrap text-[12.5px] leading-snug">{message.text}</p>
        {message.action ? <ActionChip action={message.action} /> : null}
      </div>
    </div>
  );
}

export function SupervisorControl() {
  const [thread, setThread] = useState<SupervisorThreadView | null>(null);
  const [pause, setPause] = useState<SupervisorPauseView | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const [{ threads }, { pause: p }] = await Promise.all([
        api.listThreads(),
        api.getSupervisorPause(),
      ]);
      setPause(p);
      const newest = threads[0];
      const t = newest
        ? (await api.getThread(newest.id)).thread
        : (await api.createThread()).thread;
      setThread(t);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [thread?.messages.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !thread || busy) return;
    setBusy(true);
    setDraft("");
    try {
      const { thread: updated } = await api.supervisorTurn(thread.id, text);
      setThread(updated);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const togglePause = async () => {
    if (!pause) return;
    try {
      const { pause: next } = await api.setSupervisorPause(!pause.paused);
      setPause(next);
    } catch (err) {
      setError(err);
    }
  };

  return (
    <section className="flex h-full min-h-[420px] flex-col rounded-[14px] border border-[color:var(--line-soft)] bg-coal-900">
      <header className="flex items-center justify-between gap-3 border-b border-[color:var(--line-soft)] px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold text-chalk-100">Supervisor</h2>
          <p className="truncate text-[11.5px] text-chalk-300">
            {pause?.paused
              ? pause.reason || "Stopped. It will answer, but not act."
              : "Ask it anything, or tell it what you want built."}
          </p>
        </div>
        <Button
          variant={pause?.paused ? "primary" : "secondary"}
          size="sm"
          iconLeft={
            pause?.paused ? (
              <Play className="h-3.5 w-3.5" strokeWidth={1.9} />
            ) : (
              <Square className="h-3.5 w-3.5" strokeWidth={1.9} />
            )
          }
          onClick={togglePause}
        >
          {pause?.paused ? "Resume" : "Stop"}
        </Button>
      </header>

      <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
        {error ? <ErrorView compact err={error} onRetry={() => void load()} /> : null}
        {thread && thread.messages.length === 0 && !error ? (
          <p className="text-[12.5px] text-chalk-300">
            It knows this project: the tasks, the runs that have happened, and what your
            checks say. Ask what it would do next, or describe the thing you want built.
          </p>
        ) : null}
        {thread?.messages.map((m) => (
          <Bubble key={m.id} message={m} />
        ))}
        {busy ? (
          <div className="flex items-center gap-2 text-[12px] text-chalk-300">
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
            Thinking
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <div className="flex items-end gap-2 border-t border-[color:var(--line-soft)] px-3 py-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
          }}
          rows={2}
          placeholder="Describe what you want, or ask a question"
          className="block w-full resize-y rounded-[10px] border border-[color:var(--line-soft)] bg-coal-800 px-3 py-2 text-[12.5px] text-chalk-100 placeholder:text-chalk-400 focus:outline-none focus:ring-1 focus:ring-violet-soft/50"
        />
        <Button
          variant="primary"
          size="sm"
          disabled={busy || !draft.trim()}
          iconLeft={<Send className="h-3.5 w-3.5" strokeWidth={1.9} />}
          onClick={() => void send()}
        >
          Send
        </Button>
      </div>
    </section>
  );
}

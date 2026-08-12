import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Square, Play, CheckCircle2, XCircle } from "lucide-react";
import { api } from "../../lib/api.js";
import type {
  SupervisorMessageView,
  SupervisorPauseView,
  SupervisorThreadView,
} from "../../lib/api/supervisors.js";
import { ErrorView } from "../../lib/error-view.js";

// The supervisor conversation for one run.
//
// Shaped like a chat you think in rather than a support widget. The load-bearing
// choice is that the SUPERVISOR is not bubbled: its text runs full width at a
// readable measure, the way Claude and ChatGPT render an assistant, and only
// your own message gets a container. Bubbles on both sides is what makes a panel
// read as a helpdesk.
//
// What is kept that neither of those has: the action chip. A supervisor that
// created a task or started a run has to show it inline, refusals included -
// that trail is the point of the feature, not decoration.

const INTENT_LABEL: Record<string, string> = {
  "task.create": "Made a task",
  "checklist.add": "Added TODOs",
  "run.start": "Started a run",
  answer: "Answered",
};

/** Readable measure. Prose wider than roughly 70 characters is measurably
 *  harder to track back to the next line. */
const MEASURE = "max-w-[68ch]";

function ActionNote({ action }: { action: NonNullable<SupervisorMessageView["action"]> }) {
  const ok = action.ok;
  return (
    <div
      className={`mt-3 inline-flex items-start gap-2 rounded-[10px] border px-3 py-2 ${
        ok
          ? "border-emerald/30 bg-emerald/10 text-emerald"
          : "border-amber-400/30 bg-amber-400/10 text-amber-200"
      }`}
    >
      {ok ? (
        <CheckCircle2 className="mt-[1px] h-3.5 w-3.5 shrink-0" strokeWidth={2} />
      ) : (
        <XCircle className="mt-[1px] h-3.5 w-3.5 shrink-0" strokeWidth={2} />
      )}
      <span className="text-[12px] leading-snug">
        <span className="font-semibold">
          {INTENT_LABEL[action.intent] ?? action.intent}
          {action.undone ? " (undone)" : ""}
        </span>
        <span className="opacity-90"> {action.summary}</span>
      </span>
    </div>
  );
}

function Turn({ message }: { message: SupervisorMessageView }) {
  if (message.role === "user") {
    // Your own words get a container so the eye can find where you spoke,
    // without the tail-and-balloon treatment.
    return (
      <div className="flex justify-end">
        <div className={`${MEASURE} rounded-[14px] bg-violet-soft/14 px-4 py-2.5`}>
          <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-chalk-100">
            {message.text}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className={MEASURE}>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-violet-soft">
        Supervisor
      </div>
      <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-chalk-200">
        {message.text}
      </p>
      {message.action ? <ActionNote action={message.action} /> : null}
    </div>
  );
}

export function SupervisorControl({ runId }: { runId: string }) {
  const [thread, setThread] = useState<SupervisorThreadView | null>(null);
  const [pause, setPause] = useState<SupervisorPauseView | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const load = useCallback(async () => {
    try {
      const [{ threads }, { pause: p }] = await Promise.all([
        api.listThreads(runId),
        api.getSupervisorPause(),
      ]);
      setPause(p);
      const newest = threads[0];
      // Scoped to THIS run: with runs genuinely concurrent, a shared thread
      // would leave "do it" without a referent and the transcript unable to say
      // which run you meant.
      const t = newest
        ? (await api.getThread(newest.id)).thread
        : (await api.createThread(runId)).thread;
      setThread(t);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, [runId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [thread?.messages.length, busy]);

  /** Grow the composer with its content, up to a point, the way both reference
   *  chats do. Past that it scrolls rather than eating the transcript. */
  const autoGrow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || !thread || busy) return;
    setBusy(true);
    setDraft("");
    autoGrow(inputRef.current);
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

  const empty = thread && thread.messages.length === 0 && !error;

  return (
    <section className="flex h-full min-h-[520px] flex-col overflow-hidden rounded-[18px] border border-[color:var(--line)] bg-coal-900">
      <header className="flex items-center justify-between gap-3 border-b border-[color:var(--line-soft)] px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${pause?.paused ? "bg-amber-400" : "bg-emerald"}`}
          />
          <h2 className="text-[13px] font-semibold text-chalk-100">Supervisor</h2>
          <span className="text-[11.5px] text-chalk-300">
            {pause?.paused ? "answering only" : "watching this run"}
          </span>
        </div>
        <button
          type="button"
          onClick={togglePause}
          className="inline-flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[12px] font-medium text-chalk-200 hover:bg-white/5"
        >
          {pause?.paused ? (
            <>
              <Play className="h-3.5 w-3.5" strokeWidth={1.9} /> Resume
            </>
          ) : (
            <>
              <Square className="h-3.5 w-3.5" strokeWidth={1.9} /> Stop
            </>
          )}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-7">
          {error ? <ErrorView compact err={error} onRetry={() => void load()} /> : null}

          {empty ? (
            <div className="pt-10 text-center">
              <p className="text-[15px] font-semibold text-chalk-100">
                What do you want to know about this run?
              </p>
              <p className="mx-auto mt-2 max-w-[46ch] text-[13px] leading-relaxed text-chalk-300">
                It can tell you what the run is doing, what to look at in the diff before
                you approve it, or take something new down onto its task.
              </p>
            </div>
          ) : null}

          {thread?.messages.map((m) => (
            <Turn key={m.id} message={m} />
          ))}

          {busy ? (
            <div className={MEASURE}>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-violet-soft">
                Supervisor
              </div>
              <span className="inline-block h-3.5 w-[7px] animate-[vibestrate-caret_1s_steps(1)_infinite] bg-chalk-300 align-middle" />
            </div>
          ) : null}

          <div ref={endRef} />
        </div>
      </div>

      <div className="px-5 pb-5">
        <div className="mx-auto w-full max-w-[760px]">
          <div className="flex items-end gap-2 rounded-[16px] border border-[color:var(--line-soft)] bg-coal-800 px-3 py-2.5 focus-within:border-violet-soft/50">
            <textarea
              ref={inputRef}
              value={draft}
              rows={1}
              onChange={(e) => {
                setDraft(e.target.value);
                autoGrow(e.currentTarget);
              }}
              onKeyDown={(e) => {
                // Enter sends, Shift+Enter is a newline. What both reference
                // chats do, and what fingers already expect.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Ask about this run, or say what you want done"
              className="max-h-[200px] flex-1 resize-none bg-transparent py-1 text-[13.5px] leading-relaxed text-chalk-100 placeholder:text-chalk-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy || !draft.trim()}
              aria-label="Send"
              className="mb-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-vivid text-white transition-opacity disabled:opacity-30"
            >
              <ArrowUp className="h-4 w-4" strokeWidth={2.2} />
            </button>
          </div>
          <p className="mt-1.5 text-center text-[11px] text-chalk-400">
            Enter to send, Shift+Enter for a new line
          </p>
        </div>
      </div>
    </section>
  );
}

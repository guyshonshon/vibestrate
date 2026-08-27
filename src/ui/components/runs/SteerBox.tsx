import { useMemo, useState } from "react";
import { SendHorizonal } from "lucide-react";
import { Button } from "../design/Button.js";
import { Select } from "../design/Select.js";
import { api, ApiError } from "../../lib/api.js";
import type { RunState } from "../../lib/types.js";

/**
 * Redirect a live run without stopping it.
 *
 * The note is queued, not applied: the orchestrator drains it at the next STEP
 * boundary, because a code-writing seat holds an open worktree and cutting into
 * it between two writes leaves half-written files behind. The copy says
 * "queued" rather than "sent" so the delay is expected rather than read as a
 * hang.
 *
 * The step target is a Select built from the run's own steps, never free text:
 * `drainGuidanceFor` matches a step id exactly, so a typo would leave the note
 * waiting forever while the sender was told it landed.
 */
export function SteerBox({
  runId,
  run,
  onQueued,
}: {
  runId: string;
  run: RunState;
  onQueued?: (run: RunState) => void;
}) {
  const [note, setNote] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn" | "err"; text: string } | null>(null);

  // Only steps that have not run yet can still receive a note.
  const options = useMemo(() => {
    const steps = run.flow?.steps ?? [];
    const pending = steps.filter((s) => s.status !== "passed" && s.status !== "skipped");
    return [
      { value: "", label: "Whichever step runs next" },
      ...pending.map((s) => ({ value: s.id, label: s.id })),
    ];
  }, [run.flow?.steps]);

  const waiting = run.pendingGuidance?.length ?? 0;

  const send = async (): Promise<void> => {
    const text = note.trim();
    if (!text || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.steerRun(runId, text, target || null);
      setNote("");
      onQueued?.(res.run);
      setMsg(
        res.live
          ? {
              tone: "ok",
              text: `Queued for ${target || "the next step"}. It lands at the next step boundary.`,
            }
          : // `live` is a real process probe, so this is not a maybe: nothing is
            // running to read the note.
            {
              tone: "warn",
              text: "Queued, but no process is running this run - nothing will read it.",
            },
      );
    } catch (err) {
      setMsg({
        tone: "err",
        text: err instanceof ApiError ? err.message : "Could not queue that note.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void send();
        }}
        rows={3}
        maxLength={4000}
        placeholder="Tell the run what to do differently - use the existing retry helper, do not add a dependency…"
        className="w-full resize-y rounded-[12px] border border-[color:var(--line-soft)] bg-coal-700 px-3 py-2 text-[13px] leading-relaxed text-chalk-100 outline-none placeholder:text-chalk-400 focus:border-violet-soft"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={target}
          onChange={setTarget}
          options={options}
          ariaLabel="Which step should read this"
          className="min-w-[200px]"
        />
        <Button
          size="sm"
          variant="primary"
          disabled={busy || note.trim().length === 0}
          onClick={() => void send()}
          iconLeft={<SendHorizonal className="h-3.5 w-3.5" strokeWidth={1.9} />}
        >
          {busy ? "Queueing…" : "Queue note"}
        </Button>
        {waiting > 0 ? (
          <span className="text-meta text-chalk-300">
            {waiting} waiting to be read
          </span>
        ) : null}
        <span className="ml-auto text-meta text-chalk-400">⌘↵ to send</span>
      </div>
      {msg ? (
        <p
          className={
            msg.tone === "err"
              ? "text-[12.5px] text-rose-300"
              : msg.tone === "warn"
                ? "text-[12.5px] text-amber-soft"
                : "text-[12.5px] text-chalk-300"
          }
        >
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}

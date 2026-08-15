import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowUp, Square, CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import { api, ApiError } from "../../lib/api.js";
import type {
  SupervisorActionRecordView,
  SupervisorMessageView,
  SupervisorNavigateTarget,
  SupervisorPauseView,
  SupervisorThreadView,
  SupervisorTurnChunk,
} from "../../lib/api/supervisors.js";
import { navigate } from "../../app/App.js";
import type { Route } from "../../app/route.js";
import { ErrorView } from "../../lib/error-view.js";
import { AttachButton, AttachmentStrip, useAttachments } from "../design/Attachments.js";
import { Button } from "../design/Button.js";
import { EffortScale } from "../design/EffortScale.js";
import { Select } from "../design/Select.js";
import { SegmentedControl } from "../design/SegmentedControl.js";
import { Skeleton, SkeletonBlock, SkeletonText } from "../design/Skeleton.js";

// The supervisor conversation for one run.
//
// Both sides are contained. The supervisor's answer sits in a card of its own
// rather than running loose on the panel ground: unbubbled assistant text works
// on a full page, but inside a bordered panel it reads as though it fell out of
// the layout, and an answer that carries actions and a reasoning disclosure
// needs an edge to hold them.
//
// What is kept that neither of those has: the action chip. A supervisor that
// created a task or started a run has to show it inline, refusals included -
// that trail is the point of the feature, not decoration.
//
// A turn streams (see api/supervisors.streamSupervisorTurn), which is what makes
// three things possible at once: your message lands the instant you send it, the
// reasoning is available while it happens, and the send control can become a
// stop that actually kills the provider CLI rather than just stopping the wait.

/** Two labels per intent, because the chip renders refusals too and a red-bordered
 *  card that reads "Started a run" is worse than no chip at all. */
const INTENT_LABEL: Record<string, { ok: string; refused: string }> = {
  "task.create": { ok: "Made a task", refused: "Did not make a task" },
  "checklist.add": { ok: "Added TODOs", refused: "Did not add TODOs" },
  "run.start": { ok: "Started a run", refused: "Did not start a run" },
  answer: { ok: "Answered", refused: "Answered" },
};

/** The assistant's column. The wrapper around it is already capped at 760px,
 *  which is inside the readable measure, so this only has to not exceed it. */
const MEASURE = "max-w-full";

/** Your own message stops well short of the column.
 *
 *  It used to share MEASURE at 68ch - about 918px, wider than the 760px wrapper
 *  it sits in, so it never constrained anything and the bubble rendered at 736
 *  of 760. A bubble that fills the column has no shape to distinguish it from
 *  the supervisor's full-width prose, which is the one visual cue telling you
 *  who said what. */
const USER_MEASURE = "max-w-[74%]";

/**
 * Every route an answer is allowed to send you to, written out by hand.
 *
 * `serializeRoute` is not a validator - it will happily serialize any string as
 * a runId - so a model-adjacent action is matched against this table instead.
 * Every entry here is either parameterless or carries an explicitly null id, so
 * nothing in it can be steered by model-supplied text. The two id-bearing routes
 * are handled separately, and only against an id the executor itself committed
 * to in the same message.
 */
const SAFE_ROUTES: Record<string, Route> = {
  mission: { kind: "mission" },
  compose: { kind: "compose" },
  runs: { kind: "runs" },
  board: { kind: "board" },
  workspace: { kind: "workspace" },
  proposals: { kind: "proposals" },
  settings: { kind: "settings" },
  policies: { kind: "policies" },
  project: { kind: "project" },
  flows: { kind: "flows" },
  metrics: { kind: "metrics" },
  providers: { kind: "providers" },
  supervisors: { kind: "supervisors" },
  ledger: { kind: "ledger" },
  profiles: { kind: "profiles" },
  config: { kind: "config" },
  dashboard: { kind: "dashboard" },
  "crew-editor": { kind: "crew-editor", crewId: null },
  "flow-editor": { kind: "flow-editor", flowId: null },
  crew: { kind: "crew", crewId: null },
  flow: { kind: "flow", flowId: null },
  consult: { kind: "consult", taskId: null },
};

function toSafeRoute(
  target: SupervisorNavigateTarget,
  record: SupervisorActionRecordView | null,
): Route | null {
  const safe = SAFE_ROUTES[target.kind];
  if (safe) return safe;
  // An id only travels when the server already put it in this message's action
  // record, so the destination is one the executor really produced.
  if (target.kind === "run" && record?.targetKind === "run" && record.targetId) {
    return { kind: "run", runId: record.targetId };
  }
  if (target.kind === "task" && record?.targetKind === "task" && record.targetId) {
    return { kind: "task", taskId: record.targetId };
  }
  return null;
}

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
          {(ok ? INTENT_LABEL[action.intent]?.ok : INTENT_LABEL[action.intent]?.refused) ??
            action.intent}
          {action.undone ? " (undone)" : ""}
        </span>
        <span className="opacity-90"> {action.summary}</span>
      </span>
    </div>
  );
}

/** The buttons under an answer. Neither kind fires anything: `prompt` fills the
 *  composer so you still press send, `navigate` changes the hash. An action that
 *  fails the route check is not rendered - a dead button is worse than none. */
function AnswerActions({
  message,
  onPrompt,
}: {
  message: SupervisorMessageView;
  onPrompt: (text: string) => void;
}) {
  const usable = useMemo(() => {
    const out: { label: string; run: () => void }[] = [];
    for (const a of message.actions ?? []) {
      if (a.kind === "prompt") {
        if (a.label && a.prompt) out.push({ label: a.label, run: () => onPrompt(a.prompt) });
        continue;
      }
      const route = toSafeRoute(a.route, message.action);
      if (route && a.label) out.push({ label: a.label, run: () => navigate(route) });
    }
    return out;
  }, [message, onPrompt]);
  if (usable.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {usable.map((a, i) => (
        <Button
          key={i}
          size="sm"
          variant={i === 0 ? "secondary" : "outline"}
          onClick={a.run}
          iconRight={<ArrowRight className="h-3.5 w-3.5" strokeWidth={1.9} />}
        >
          {a.label}
        </Button>
      ))}
    </div>
  );
}

/** Everything in a turn that is not the answer itself. Text chunks are the
 *  answer and are rendered as prose; folding them in here replays the reply a
 *  second time, in mono, mislabelled as tool calls. */
const reasoningOnly = (chunks: SupervisorTurnChunk[]) =>
  chunks.filter((c) => c.kind !== "text");

/** The reasoning trail: thinking, tool calls and sub-agent hops, collapsed.
 *  Rendered only by a caller that already found non-text chunks, so the control
 *  never appears over an empty disclosure. */
function ThinkingTrail({
  chunks,
  open,
  onToggle,
}: {
  chunks: SupervisorTurnChunk[];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="mb-2">
      {/* Pulled flush with the prose below it: the button's own padding would
          otherwise indent it past the column every other line starts on. */}
      <Button size="sm" variant="ghost" className="-ml-2.5" onClick={onToggle}>
        {open ? "Hide thinking" : "Show thinking"}
      </Button>
      {open ? (
        <div className="mt-2 max-h-[260px] overflow-y-auto border-l-2 border-[color:var(--line)] pl-3">
          {chunks.map((c, i) =>
            c.kind === "thinking" ? (
              <p
                key={i}
                className="my-1 whitespace-pre-wrap text-[13px] italic leading-relaxed text-chalk-200"
              >
                {c.text}
              </p>
            ) : (
              <p key={i} className="mono my-0.5 truncate text-meta text-chalk-300">
                <span className="font-semibold text-violet-soft">
                  {c.kind === "subagent" ? "agent" : "tool"}
                </span>{" "}
                {c.text}
              </p>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

function UserSaid({ text }: { text: string }) {
  // Your own words get a container so the eye can find where you spoke,
  // without the tail-and-balloon treatment.
  return (
    <div className="flex justify-end">
      <div className={`${USER_MEASURE} rounded-[14px] bg-violet-soft/14 px-4 py-2.5`}>
        <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-chalk-100">
          {text}
        </p>
      </div>
    </div>
  );
}

function SupervisorSaid({ children }: { children: ReactNode }) {
  return (
    <div className={MEASURE}>
      <div className="rounded-[14px] border border-[color:var(--line)] bg-coal-700 px-4 py-3">
        <div className="mb-1.5 text-meta font-semibold uppercase tracking-wide text-violet-soft">
          Supervisor
        </div>
        {children}
      </div>
    </div>
  );
}

function Turn({
  message,
  trail,
  trailOpen,
  onToggleTrail,
  onPrompt,
}: {
  message: SupervisorMessageView;
  /** The live transcript this answer was streamed from, when the turn happened
   *  in this session. Reasoning is not persisted, so on a reloaded thread there
   *  is nothing to disclose and the control is absent. */
  trail: SupervisorTurnChunk[] | undefined;
  trailOpen: boolean;
  onToggleTrail: () => void;
  onPrompt: (text: string) => void;
}) {
  if (message.role === "user") return <UserSaid text={message.text} />;
  return (
    <SupervisorSaid>
      {trail && trail.length > 0 ? (
        <ThinkingTrail chunks={trail} open={trailOpen} onToggle={onToggleTrail} />
      ) : null}
      <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-chalk-100">
        {message.text}
      </p>
      {message.action ? <ActionNote action={message.action} /> : null}
      <AnswerActions message={message} onPrompt={onPrompt} />
    </SupervisorSaid>
  );
}

/** One turn in flight, or the terminal state of the last one. Held apart from
 *  the thread so a stopped or failed turn keeps what you typed on screen with a
 *  way forward, instead of vanishing on the way to the server. */
type LiveTurn = {
  text: string;
  phase: "sending" | "thinking" | "streaming" | "stopped" | "failed";
  chunks: SupervisorTurnChunk[];
  /** Set when the server echoes the persisted user message, at which point the
   *  thread owns the echo and this block stops drawing its own. */
  userMessageId: string | null;
  error: unknown;
};

const IN_FLIGHT = new Set(["sending", "thinking", "streaming"]);

export function SupervisorControl({
  runId,
  compact = false,
}: {
  /** The run this conversation is about, or null for the project-level thread
   *  on Mission Control. A project thread is the only one allowed to start a
   *  run: inside run X's panel "do it" would have two referents, so the
   *  executor refuses run.start there. */
  runId: string | null;
  /** Shorter on Mission Control, where it sits above the composer rather than
   *  filling a tab. */
  compact?: boolean;
}) {
  const [thread, setThread] = useState<SupervisorThreadView | null>(null);
  const [pause, setPause] = useState<SupervisorPauseView | null>(null);
  const [draft, setDraft] = useState("");
  const attachments = useAttachments();
  const [turn, setTurn] = useState<LiveTurn | null>(null);
  const [effort, setEffort] = useState("");
  const [profileId, setProfileId] = useState("");
  const [profiles, setProfiles] = useState<{ id: string; label: string }[]>([]);
  const [effortLevels, setEffortLevels] = useState<string[]>([]);
  /** Reasoning kept against the answer it produced, for this session only. */
  const [trails, setTrails] = useState<Record<string, SupervisorTurnChunk[]>>({});
  const [openTrails, setOpenTrails] = useState<Record<string, boolean>>({});
  /** The turn in flight has no message id to key on yet, and it stays open
   *  across turns once you ask for it. */
  const [liveTrailOpen, setLiveTrailOpen] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const busy = turn !== null && IN_FLIGHT.has(turn.phase);

  const load = useCallback(async () => {
    try {
      const [{ threads }, { pause: p }] = await Promise.all([
        api.listThreads(runId ?? undefined),
        api.getSupervisorPause(),
      ]);
      setPause(p);
      const newest = threads[0];
      // Scoped to THIS run: with runs genuinely concurrent, a shared thread
      // would leave "do it" without a referent and the transcript unable to say
      // which run you meant.
      const t = newest
        ? (await api.getThread(newest.id)).thread
        : (await api.createThread(runId ?? undefined)).thread;
      setThread(t);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, [runId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Abandon a turn in flight when the panel goes away, so an unmounted chat is
  // not still holding a provider CLI open.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Which effort ladder applies. The turn resolves its own assist target the
  // way every assist does - the default crew's planner seat, else its first
  // role (resolveAssistTarget in src/core/assist/assist-runner.ts) - so the
  // levels shown are that provider's and no other. An unreadable catalog is
  // indistinguishable here from a provider with no ladder, and both mean the
  // same thing: no per-turn choice to offer, so no control.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [crews, catalog, profs] = await Promise.all([
          api.getCrews(),
          api.getProviderCatalog(),
          api.getProfiles(),
        ]);
        if (cancelled) return;
        setProfiles(
          profs.profiles.map((pr) => ({ id: pr.id, label: pr.label ?? pr.id })),
        );
        const crew =
          crews.crews.find((c) => c.id === crews.defaultCrew) ?? crews.crews[0];
        const role =
          crew?.roles.find((r) => r.seats.includes("planner")) ?? crew?.roles[0];
        // The ladder belongs to whoever will actually answer: the picked
        // profile when there is one, else the seat the turn would resolve to.
        const chosen = profileId ? profs.profiles.find((pr) => pr.id === profileId) : null;
        const provider = chosen?.provider ?? role?.provider;
        setEffortLevels(provider ? catalog.catalog[provider]?.powerLevels ?? [] : []);
      } catch {
        if (!cancelled) setEffortLevels([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  // Drive the panel's own scroll container rather than calling scrollIntoView
  // on a sentinel. On a nested scroller that walks up to the nearest scrollable
  // ancestor, which here moved the panel by 11px of 580 and left the newest
  // messages - including any action chip - below the fold on load. Setting
  // scrollTop cannot escape the element it is called on.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [thread?.messages.length, turn?.phase, turn?.chunks.length]);

  /** Grow the composer with its content, up to a point, the way both reference
   *  chats do. Past that it scrolls rather than eating the transcript. */
  const autoGrow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  const fillComposer = useCallback((text: string) => {
    setDraft(text);
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    // Height follows content, and the caret belongs after the text you are
    // about to edit rather than at the start of it.
    window.requestAnimationFrame(() => {
      autoGrow(el);
      el.setSelectionRange(text.length, text.length);
    });
  }, []);

  const run = useCallback(
    async (message: string) => {
      if (!thread) return;
      const controller = new AbortController();
      abortRef.current = controller;
      // The echo is state, not a request: it renders before the fetch is even
      // issued, and survives every terminal state except a completed turn,
      // which replaces it with the server's own record.
      setTurn({
        text: message,
        phase: "sending",
        chunks: [],
        userMessageId: null,
        error: null,
      });
      const chunks: SupervisorTurnChunk[] = [];
      try {
        await api.streamSupervisorTurn(
          thread.id,
          { text: message, effort: effort || null, profileId: profileId || null },
          (event) => {
            switch (event.type) {
              case "user": {
                const persisted = event.message;
                setThread((t) =>
                  t ? { ...t, messages: [...t.messages, persisted] } : t,
                );
                setTurn((cur) => (cur ? { ...cur, userMessageId: persisted.id } : cur));
                break;
              }
              case "chunk": {
                chunks.push(event.chunk);
                setTurn((cur) =>
                  cur
                    ? {
                        ...cur,
                        phase:
                          event.chunk.kind === "text" || cur.phase === "streaming"
                            ? "streaming"
                            : "thinking",
                        chunks: [...chunks],
                      }
                    : cur,
                );
                break;
              }
              case "done": {
                const answered = event.thread;
                const last = answered.messages[answered.messages.length - 1];
                const reasoning = reasoningOnly(chunks);
                if (last && reasoning.length > 0) {
                  setTrails((cur) => ({ ...cur, [last.id]: reasoning }));
                }
                setThread(answered);
                setTurn(null);
                break;
              }
              case "error": {
                // Re-raise as the classified error the rest of the client
                // throws. A bare Error would make describeError use the same
                // sentence for the headline and the detail, printing it twice.
                const e = event.error;
                const failure = new ApiError(e.status ?? 500, e.message, {
                  kind: e.kind,
                  title: e.title,
                  hint: e.hint,
                });
                setTurn((cur) =>
                  cur ? { ...cur, phase: "failed", chunks: [...chunks], error: failure } : cur,
                );
                break;
              }
            }
          },
          controller.signal,
        );
      } catch (err) {
        // A stop is an abort, so the socket is gone before the server can say
        // anything about it. The terminal record it writes is picked up by the
        // next thread read; until then this block IS the record on screen.
        const stopped = controller.signal.aborted;
        setTurn((cur) =>
          cur
            ? {
                ...cur,
                phase: stopped ? "stopped" : "failed",
                chunks: [...chunks],
                error: stopped ? null : err,
              }
            : cur,
        );
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [thread, effort],
  );

  const send = () => {
    const text = draft.trim();
    if (!text || !thread || busy) return;
    // Attachments belong to the message that carries them, so they leave the
    // composer with the draft rather than lingering into the next turn.
    const message = `${text}${attachments.note}`;
    setDraft("");
    attachments.clear();
    autoGrow(inputRef.current);
    void run(message);
  };

  const setActing = async (next: boolean) => {
    if (!pause) return;
    try {
      const { pause: updated } = await api.setSupervisorPause(!next);
      setPause(updated);
    } catch (err) {
      setError(err);
    }
  };

  const empty = thread && thread.messages.length === 0 && !turn && !error;
  const liveTrail = reasoningOnly(turn?.chunks ?? []);
  const liveText = turn?.chunks.filter((c) => c.kind === "text").map((c) => c.text).join("") ?? "";

  return (
    <section
      className={`flex flex-col overflow-hidden rounded-[18px] border border-[color:var(--line)] bg-coal-900 ${
        // A conversation needs room to be read. The empty thread still gets a
        // shorter box, because reserving the full panel for a prompt and a
        // composer leaves a void that reads as something failing to load.
        compact ? (empty ? "h-[330px]" : "h-[560px]") : "h-full min-h-[680px]"
      }`}
    >
      <header className="flex items-center justify-between gap-3 border-b border-[color:var(--line-soft)] px-5 py-3">
        {/* The control on the right is a PERMISSION, not a transport. It decides
            whether the supervisor may make a task, add TODOs or start a run;
            stopping it does not stop this conversation, which is why the stop
            for a turn in flight lives on the composer where your hand already
            is. Same sentence the CLI prints for `vibe supervisor stop`. */}
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold text-chalk-100">Supervisor</h2>
        </div>
        <SegmentedControl
          value={pause?.paused ? "answers" : "acts"}
          onChange={(v) => void setActing(v === "acts")}
          options={[
            // The CLI's own sentence for the paused half, kept word for word so
            // `vibe supervisor stop` and this switch describe one thing.
            { value: "answers", label: "Answers only" },
            { value: "acts", label: "Answers and acts" },
          ]}
        />
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-7">
          {error ? <ErrorView compact inset err={error} onRetry={() => void load()} /> : null}

          {!thread && !error ? (
            // The thread is fetched (or created) on mount, so the transcript
            // area was blank until it answered.
            <Skeleton label="Loading the conversation" className="flex flex-col gap-7">
              <div className="flex justify-end">
                <SkeletonBlock h={44} w="56%" radius={14} />
              </div>
              <div className="max-w-full">
                <SkeletonBlock className="mb-1.5" tone="text" h={11} w={84} />
                <SkeletonText lines={4} size={13} gap={9} />
              </div>
            </Skeleton>
          ) : null}

          {empty ? (
            <div className={compact ? "text-center" : "pt-10 text-center"}>
              <p className="text-[15px] font-semibold text-chalk-100">
                {runId ? "What do you want to know about this run?" : "What are we building?"}
              </p>
              <p className="mx-auto mt-2 max-w-[46ch] text-[14px] leading-relaxed text-chalk-100">
                {runId
                  ? "It can tell you what the run is doing, what to look at in the diff before you approve it, or take something new down onto its task."
                  : "Think out loud, or ask it to make the task and get started."}
              </p>
            </div>
          ) : null}

          {thread?.messages.map((m) => (
            <Turn
              key={m.id}
              message={m}
              trail={trails[m.id]}
              trailOpen={openTrails[m.id] ?? false}
              onToggleTrail={() =>
                setOpenTrails((cur) => ({ ...cur, [m.id]: !cur[m.id] }))
              }
              onPrompt={fillComposer}
            />
          ))}

          {turn ? (
            <>
              {turn.userMessageId === null ? <UserSaid text={turn.text} /> : null}
              <SupervisorSaid>
                {liveTrail.length > 0 ? (
                  <ThinkingTrail
                    chunks={liveTrail}
                    open={liveTrailOpen}
                    onToggle={() => setLiveTrailOpen((v) => !v)}
                  />
                ) : null}

                {liveText ? (
                  <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-chalk-100">
                    {liveText}
                    {turn.phase === "streaming" ? (
                      <span className="ml-0.5 inline-block h-3.5 w-[7px] animate-[vibestrate-caret_1s_steps(1)_infinite] bg-chalk-300 align-middle" />
                    ) : null}
                  </p>
                ) : IN_FLIGHT.has(turn.phase) ? (
                  <Skeleton label="The supervisor is working">
                    <SkeletonText lines={3} size={13} gap={9} />
                  </Skeleton>
                ) : null}

                {turn.phase === "stopped" ? (
                  // In place, where the answer was forming. It says what it did
                  // and what it did NOT do: a run the executor already started
                  // stays started, so this never claims to have undone anything.
                  <div className="mt-3 inline-flex items-center gap-3 rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 px-3 py-2">
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-chalk-100">
                      <Square className="h-3.5 w-3.5 text-amber-300" strokeWidth={2.2} />
                      Stopped
                    </span>
                    <Button size="sm" variant="secondary" onClick={() => fillComposer(turn.text)}>
                      Ask again
                    </Button>
                  </div>
                ) : null}

                {turn.phase === "failed" ? (
                  <ErrorView
                    compact
                    inset
                    className="mt-3"
                    err={turn.error}
                    onRetry={() => void run(turn.text)}
                  />
                ) : null}
              </SupervisorSaid>
            </>
          ) : null}
        </div>
      </div>

      {/* Hard against the bottom of the panel. The hint used to live here
          permanently, which put a line of chrome under the field and read as
          dead space; it now appears only while you are actually typing. */}
      <div className="shrink-0 px-5 pb-4">
        <div className="mx-auto w-full max-w-[760px]">
          <div className="rounded-[16px] border border-[color:var(--line-soft)] bg-coal-800 px-3 py-2.5 focus-within:border-violet-soft/50">
            <AttachmentStrip
              items={attachments.items}
              onRemove={attachments.remove}
              className="mb-2"
            />
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
                  send();
                }
              }}
              placeholder={
                runId
                  ? "Ask about this run, or say what you want done"
                  : "Ask anything, or say what you want built"
              }
              className="max-h-[200px] w-full resize-none bg-transparent py-1 text-[14.5px] leading-relaxed text-chalk-100 placeholder:text-chalk-400 focus:outline-none"
            />
            <div className="mt-1.5 flex items-end gap-3">
              <AttachButton onAdd={attachments.add} disabled={busy} className="shrink-0" />
              {/* Per turn, not a setting: it rides on this send and resolves
                  against the same provider the turn would have used anyway.
                  Nothing here writes a profile. */}
              {/* Who answers THIS turn. A profile is a provider plus a model,
                  so changing it changes the effort ladder beside it - the
                  levels always belong to whoever is about to reply. Nothing
                  here is saved: the project's supervisor is unchanged. */}
              {profiles.length > 1 ? (
                <div className="w-[152px] shrink-0">
                  <Select
                    ariaLabel="profile for this turn"
                    value={profileId}
                    onChange={(v) => {
                      setProfileId(v);
                      // The old value may not exist on the new provider's
                      // ladder, and sending one it does not have is refused.
                      setEffort("");
                    }}
                    disabled={busy}
                    options={[
                      { value: "", label: "Default profile" },
                      ...profiles.map((pr) => ({ value: pr.id, label: pr.label })),
                    ]}
                  />
                </div>
              ) : null}
              {effortLevels.length > 0 ? (
                <div className="min-w-0 max-w-[280px] flex-1">
                  <EffortScale
                    levels={effortLevels}
                    value={effort}
                    onChange={setEffort}
                    disabled={busy}
                  />
                </div>
              ) : null}
              {busy ? (
                // The stop sits where send sits, because that is where your hand
                // already is. It kills the model process for the leg in flight.
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  aria-label="Stop"
                  className="ml-auto mb-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-rose-400/40 bg-rose-500/15 text-rose-200 transition-colors hover:bg-rose-500/25"
                >
                  <Square className="h-3.5 w-3.5 fill-current" strokeWidth={2.2} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={send}
                  disabled={!draft.trim()}
                  aria-label="Send"
                  className="ml-auto mb-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-vivid text-white transition-opacity disabled:opacity-30"
                >
                  <ArrowUp className="h-4 w-4" strokeWidth={2.2} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

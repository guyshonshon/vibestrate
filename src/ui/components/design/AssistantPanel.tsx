// The supervisor sitting inside a maker: the draft you are holding plus one
// instruction, and back comes a PROPOSED revision of that same draft.
//
// Incremental on purpose. The one-shot drafters return a whole new artifact,
// which is the wrong tool once someone is mid-edit: accepting a fresh draft
// throws away the work they have open. So this posts the CURRENT draft, renders
// what the reply would change, and applies it only when the owner says so.
//
// Two rules this component is built around:
//  - It never writes. `onApply` hands the revision to the editor's own update
//    path; the editor's Save button stays the only thing that reaches disk.
//  - An instruction with no edit in it is a SUCCESS. "Why is this seat
//    uncovered?" comes back as an answer with `revision: null`, and the panel
//    renders the answer rather than faking a diff.
//
// Generic by construction: it knows an endpoint, an opaque draft, and how to
// hand a revision back. Everything artifact-specific arrives as `renderChange`,
// so the Flow maker and the Crew maker mount the same component.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { jsonPost } from "../../lib/api/http.js";
import { ErrorView } from "../../lib/error-view.js";
import { Button } from "./Button.js";
import { Skeleton, SkeletonBlock, SkeletonText } from "./Skeleton.js";
import { cn } from "./cn.js";

/** Mirrors the instruction cap both revise routes enforce, so an over-long
 *  instruction is stopped while it is being typed rather than after a round
 *  trip that spends a provider call. */
export const MAX_INSTRUCTION = 1_000;

/** The two things this panel renders. `revision` is null when the instruction
 *  was a question, which is a success with nothing to apply. */
export type AssistantReply<TRevision> = {
  answer: string;
  revision: TRevision | null;
};

type Phase<TRevision> =
  | { kind: "idle" }
  | { kind: "thinking" }
  | { kind: "answered"; answer: string }
  | { kind: "proposed"; answer: string; revision: TRevision }
  // The change list is FROZEN at the moment it is applied. `renderChange`
  // compares the revision against the caller's draft, and the apply just changed
  // that draft - re-rendering it would report "nothing to change" about the
  // edit that had just been made.
  | { kind: "applied"; answer: string; changes: ReactNode }
  | { kind: "failed"; error: unknown };

export function AssistantPanel<TRevision>({
  endpoint,
  draft,
  parseReply,
  purpose,
  placeholder,
  examples = [],
  renderChange,
  onApply,
  className,
}: {
  /** POST target. The body is `{ ...draft, instruction }` - both revise routes
   *  take the artifact's own fields flat beside the instruction. */
  endpoint: string;
  /** The draft as the service reads it back, opaque here on purpose: the crew
   *  route wants `{crewId, crew}`, the flow route `{flow, problems, crewId}`. */
  draft: Record<string, unknown>;
  /** Pull the answer and the revision out of the endpoint's reply. Required
   *  rather than defaulted, because the two revise routes nest them
   *  differently and a wrong guess would silently render an empty proposal. */
  parseReply: (raw: unknown) => AssistantReply<TRevision>;
  /** One line naming what this assistant edits. */
  purpose: string;
  placeholder?: string;
  /** Instructions worth trying, filled into the box when clicked. */
  examples?: string[];
  /** What the revision would change, in the caller's own vocabulary. */
  renderChange: (revision: TRevision) => ReactNode;
  /** Apply to the caller's draft. Must not save. */
  onApply: (revision: TRevision) => void;
  className?: string;
}) {
  const [instruction, setInstruction] = useState("");
  const [phase, setPhase] = useState<Phase<TRevision>>({ kind: "idle" });
  const inFlight = useRef<AbortController | null>(null);

  // A reply that lands after the editor moved on is noise at best and a stale
  // proposal at worst, so the request is aborted rather than ignored.
  useEffect(() => () => inFlight.current?.abort(), []);

  const over = instruction.length - MAX_INSTRUCTION;
  const sendable =
    instruction.trim().length > 0 && over <= 0 && phase.kind !== "thinking";

  async function send(): Promise<void> {
    if (!sendable) return;
    inFlight.current?.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    setPhase({ kind: "thinking" });
    try {
      const raw = await jsonPost<unknown>(
        endpoint,
        { ...draft, instruction: instruction.trim() },
        ctrl.signal,
      );
      if (ctrl.signal.aborted) return;
      const reply = parseReply(raw);
      setPhase(
        reply.revision === null
          ? { kind: "answered", answer: reply.answer }
          : { kind: "proposed", answer: reply.answer, revision: reply.revision },
      );
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setPhase({ kind: "failed", error: err });
    }
  }

  function dismiss(): void {
    inFlight.current?.abort();
    setPhase({ kind: "idle" });
  }

  return (
    <section
      className={cn(
        "rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-soft" strokeWidth={1.9} aria-hidden />
        <h3 className="text-[13.5px] font-bold text-chalk-100">Supervisor</h3>
      </div>
      <p className="mt-1 max-w-[64ch] text-meta leading-[1.5] text-chalk-200">
        {purpose}
      </p>

      <div className="mt-3">
        <textarea
          value={instruction}
          rows={3}
          spellCheck
          placeholder={placeholder}
          onChange={(e) => setInstruction(e.target.value)}
          // Cmd/Ctrl+Enter matches every other multi-line send in the app; a
          // bare Enter has to stay a newline in a box that takes sentences.
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
          }}
          className={cn(
            "w-full resize-y rounded-[12px] border bg-coal-800 px-3 py-2.5 text-[13px] leading-[1.55] text-chalk-100 outline-none placeholder:text-chalk-300/70",
            over > 0
              ? "border-rose-400/60"
              : "border-[color:var(--line-strong)] focus:border-violet-soft/50",
          )}
        />
        {over > 0 ? (
          <span className="mt-1 block text-meta text-rose-300">
            {over.toLocaleString()} characters over the{" "}
            {MAX_INSTRUCTION.toLocaleString()} the supervisor takes.
          </span>
        ) : null}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Button
          variant="primary"
          size="sm"
          disabled={!sendable}
          onClick={() => void send()}
        >
          {phase.kind === "thinking" ? "Thinking…" : "Ask"}
        </Button>
        {/* Outlined, not ghost: an example is a control that fills the box, and
            a row of ghost buttons reads as a sentence someone forgot to style. */}
        {instruction.length === 0
          ? examples.map((ex) => (
              <Button
                key={ex}
                variant="outline"
                size="sm"
                onClick={() => setInstruction(ex)}
              >
                {ex}
              </Button>
            ))
          : null}
      </div>

      {phase.kind === "thinking" ? (
        // Shaped like the answer that replaces it - a short reply over a list of
        // changes - so nothing on the page jumps when it lands.
        <Skeleton label="Asking the supervisor" className="mt-3.5 flex flex-col gap-3">
          <SkeletonText lines={2} size={11} />
          <div className="flex flex-col gap-2">
            <SkeletonBlock tone="text" h={11} w="62%" />
            <SkeletonBlock tone="text" h={11} w="48%" />
          </div>
          <div className="flex gap-1.5">
            <SkeletonBlock w={92} h={28} />
            <SkeletonBlock w={72} h={28} />
          </div>
        </Skeleton>
      ) : null}

      {phase.kind === "failed" ? (
        <ErrorView
          compact
          inset
          className="mt-3.5"
          err={phase.error}
          override={{ title: "The supervisor could not answer" }}
          onRetry={() => void send()}
          actions={[{ label: "Dismiss", onClick: dismiss, variant: "ghost" }]}
        />
      ) : null}

      {phase.kind === "answered" ||
      phase.kind === "proposed" ||
      phase.kind === "applied" ? (
        <div className="mt-3.5 rounded-[14px] border border-[color:var(--line-strong)] bg-coal-800 p-3.5">
          {phase.answer.trim().length > 0 ? (
            <p className="max-w-[70ch] whitespace-pre-wrap text-[12.5px] leading-[1.6] text-chalk-200">
              {phase.answer}
            </p>
          ) : null}

          {phase.kind !== "answered" ? (
            <div
              className={cn(
                phase.answer.trim().length > 0 && "mt-3",
                phase.kind === "applied" && "opacity-70",
              )}
            >
              {phase.kind === "applied" ? phase.changes : renderChange(phase.revision)}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {phase.kind === "proposed" ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  // Rendered BEFORE the apply, so the summary describes the
                  // draft the owner accepted this against.
                  const changes = renderChange(phase.revision);
                  onApply(phase.revision);
                  setPhase({ kind: "applied", answer: phase.answer, changes });
                  setInstruction("");
                }}
              >
                Apply to the draft
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={dismiss}>
              Dismiss
            </Button>
            {phase.kind === "applied" ? (
              <span className="text-meta text-chalk-200">
                In the draft. Saving is still yours.
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

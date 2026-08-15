import { useState } from "react";
import { Compass } from "lucide-react";
import { api } from "../../lib/api.js";
import { Button } from "../design/Button.js";
import { cn } from "../design/cn.js";
import { launchGeneratedWalkthrough } from "../onboarding/TourOverlay.js";
import {
  buildWalkthroughRequest,
  describeWalkthroughRefusal,
  parseGeneratedWalkthrough,
} from "../../lib/guides/generated.js";

/**
 * "Show me how": the walkthrough for a question nobody wrote a guide for.
 *
 * The five authored walkthroughs cover the five things everyone does first.
 * Everything else used to get prose. This asks the ordinary read-only consult
 * for a sequence instead, and every step it returns is checked against the real
 * route table and the real list of ringable controls before anything opens
 * (lib/guides/generated.ts). What survives runs through the SAME overlay the
 * authored walkthroughs run through.
 *
 * It navigates and points, and that is the whole of its privilege - the same
 * ceiling a model-authored button has. A step can land you on the new-flow form
 * and say what the field is for; it cannot type in it.
 *
 * Nothing survives the gate means nothing is shown, and the reason is on screen.
 * A walkthrough that points at a control this app does not have is worse than
 * the prose it replaced.
 */
export function ShowMeHow({
  ask,
  answer,
  label = "Show me how",
  disabled = false,
  className,
}: {
  /** What the user asked, in their words. */
  ask: string;
  /** The answer to carry out, when this is offered under one. */
  answer?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  async function build() {
    if (busy) return;
    setBusy(true);
    setRefused(null);
    try {
      const res = await api.consult({
        question: buildWalkthroughRequest({ ask, ...(answer ? { answer } : {}) }),
      });
      const parsed = parseGeneratedWalkthrough(res.answer.answer);
      if (!parsed.ok) {
        setRefused(describeWalkthroughRefusal(parsed.reason));
        return;
      }
      launchGeneratedWalkthrough(parsed.walkthrough);
    } catch (err) {
      setRefused(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("flex flex-col items-start gap-1.5", className)}>
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled || busy}
        onClick={() => void build()}
        iconLeft={<Compass className="h-3.5 w-3.5" strokeWidth={1.9} />}
      >
        {busy ? "Building the walkthrough…" : label}
      </Button>
      {refused ? (
        <p className="text-meta leading-relaxed text-amber-soft">{refused}</p>
      ) : null}
    </div>
  );
}

/**
 * The same thing with its own question box, for the walkthrough catalog: the
 * five authored ones are what most people need, and this is the row for
 * everything else.
 */
export function ShowMeHowCard({ className }: { className?: string }) {
  const [ask, setAsk] = useState("");
  return (
    <div
      className={cn(
        "flex w-full flex-col rounded-[14px] border border-[color:var(--line)] bg-coal-500 p-3",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Compass className="h-4 w-4 shrink-0 text-violet-soft" strokeWidth={1.9} aria-hidden />
        <span className="min-w-0 flex-1 text-[13.5px] font-bold text-chalk-100">Show me how</span>
      </div>
      <p className="mt-1 text-[13px] leading-snug text-chalk-300">
        A walkthrough built for your question, for the things below it does not cover.
      </p>
      <input
        value={ask}
        onChange={(e) => setAsk(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        placeholder="e.g. add a review step to a flow"
        aria-label="What to walk through"
        className="mt-2 w-full rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 px-2.5 py-1.5 text-[13px] text-chalk-100 placeholder:text-chalk-300 outline-none focus:border-violet-soft/50"
      />
      <ShowMeHow ask={ask} disabled={!ask.trim()} className="mt-2" />
    </div>
  );
}

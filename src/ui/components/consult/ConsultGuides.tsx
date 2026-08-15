import { ArrowLeft, ArrowRight, Compass, MessagesSquare, MapPin } from "lucide-react";
import { GUIDES, type Guide, type GuideStep } from "../../lib/guides/guides.js";
import { Button } from "../design/Button.js";
import { cn } from "../design/cn.js";

/**
 * The walkthrough half of consult: the authored catalog, rendered.
 *
 * A walkthrough is written down (lib/guides/guides.ts) rather than asked of a
 * model, so it cannot invent a control that does not exist. The conversation
 * beside it is the supervisor, which is a separate, gated path - these
 * components never call a model and never write anything. The only thing they
 * do is move you: "Take me there" opens the walkthrough on that step, and the
 * overlay navigates and rings the control.
 *
 * These render the catalog as cards because the consult surface has room to
 * show what each walkthrough covers; the help overlay's `GuideLauncher` renders
 * the same catalog as a button row where it does not. One catalog, two
 * presentations, no second list of titles.
 */

/** The two things consult can be asked. Picked by starting, not by a toggle. */
export type ConsultMode = "choose" | "project" | "vibestrate";

const CARD_BASE =
  "flex w-full flex-col rounded-[14px] border p-3 text-left transition border-[color:var(--line)] bg-coal-500 hover:border-violet-soft/50 hover:bg-coal-400";

/**
 * One walkthrough. The whole card is the control, which is FlowCard's picker
 * idiom - there is no second thing to click, so a button inside the card would
 * only be a smaller version of the card.
 */
function GuideCard({ guide, onStart }: { guide: Guide; onStart: () => void }) {
  return (
    <button type="button" onClick={onStart} className={CARD_BASE}>
      <div className="flex items-center gap-2">
        <Compass className="h-4 w-4 shrink-0 text-violet-soft" strokeWidth={1.9} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-chalk-100">
          {guide.title}
        </span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-violet-soft" strokeWidth={1.9} aria-hidden />
      </div>
      <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-chalk-300">
        {guide.summary}
      </p>
      <span className="mt-2 text-meta text-violet-soft">
        {guide.steps.length} steps
      </span>
    </button>
  );
}

/**
 * One walkthrough, opened: what it covers, and the button that moves you.
 *
 * This is where "Take me there" lives. It is deliberately NOT in the
 * walkthrough overlay - a tour that has already started drives itself, and
 * asking someone being shown around to press a button makes them do the
 * walking. Here you asked a question, so nothing moves until you say so.
 */
export function GuideDetail({
  guide,
  onBack,
  onGoToStep,
  onWalkThrough,
  className,
}: {
  guide: Guide;
  onBack: () => void;
  /** Opens the walkthrough AT this step, which navigates and rings the control. */
  onGoToStep: (step: GuideStep) => void;
  /** Runs the whole thing from the top. */
  onWalkThrough: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={onBack}
          iconLeft={<ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.9} />}
        >
          Walkthroughs
        </Button>
      </div>
      <div>
        <div className="text-[13.5px] font-bold text-chalk-100">{guide.title}</div>
        <p className="mt-0.5 text-[13px] leading-snug text-chalk-300">{guide.summary}</p>
      </div>
      <Button
        variant="secondary"
        size="sm"
        className="self-start"
        onClick={onWalkThrough}
        iconLeft={<Compass className="h-3.5 w-3.5" strokeWidth={1.9} />}
      >
        Walk me through it
      </Button>
      <ol className="flex flex-col gap-2">
        {guide.steps.map((step, i) => (
          <li
            key={step.id}
            className="rounded-[12px] border border-[color:var(--line)] bg-coal-500 p-2.5"
          >
            <div className="flex items-start gap-2">
              <span className="mono mt-[2px] shrink-0 text-meta text-violet-soft">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-chalk-100">{step.title}</div>
                <p className="mt-0.5 text-[13px] leading-snug text-chalk-200">{step.body}</p>
                {step.todo ? (
                  <p className="mt-1 text-[13px] leading-snug text-violet-soft">{step.todo}</p>
                ) : null}
                {step.route ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => onGoToStep(step)}
                    iconLeft={<MapPin className="h-3.5 w-3.5" strokeWidth={1.9} />}
                  >
                    Take me there
                  </Button>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Every walkthrough there is. Opening one shows what it covers, and the
 *  button that takes you to each step. */
export function GuideList({
  onStart,
  className,
}: {
  onStart: (guide: Guide) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      {GUIDES.map((guide) => (
        <GuideCard key={guide.id} guide={guide} onStart={() => onStart(guide)} />
      ))}
    </div>
  );
}

/**
 * Sits under the project composer when what is being typed is a product
 * question. Offering rather than intercepting: the ask still works, but the
 * walkthrough is one click away instead of behind a model guessing at it.
 */
export function GuideOffer({
  guide,
  onStart,
  className,
}: {
  guide: Guide;
  onStart: () => void;
  className?: string;
}) {
  return (
    <Button
      variant="secondary"
      size="sm"
      className={className}
      iconLeft={<Compass className="h-3 w-3 text-violet-soft" strokeWidth={1.9} />}
      onClick={onStart}
    >
      Walk me through: {guide.title}
    </Button>
  );
}

/**
 * The entry point, shown before either side has been chosen. The two things
 * the surface does are the controls, so which one you are in is the shape of
 * the screen rather than a word naming a mode.
 *
 * The copy carries the one distinction that matters, because the two sides have
 * different privileges: consult reads and advises, the supervisor can act and
 * says so with its own permission switch.
 */
export function ConsultModeChooser({
  onChoose,
  elevated = false,
  className,
}: {
  onChoose: (mode: Exclude<ConsultMode, "choose">) => void;
  /** Floating free of a panel, so the cards carry their own shadow. */
  elevated?: boolean;
  className?: string;
}) {
  const card = cn(CARD_BASE, elevated && "shadow-2xl shadow-black/50");
  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <button type="button" onClick={() => onChoose("project")} className={card}>
        <div className="flex items-center gap-2">
          <MessagesSquare className="h-4 w-4 shrink-0 text-violet-soft" strokeWidth={1.9} aria-hidden />
          <span className="min-w-0 flex-1 text-[13.5px] font-bold text-chalk-100">
            Ask about this project
          </span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-violet-soft" strokeWidth={1.9} aria-hidden />
        </div>
        <p className="mt-1 text-[13px] leading-snug text-chalk-300">
          Answers from your files, config and runs. Nothing changes until you apply it.
        </p>
      </button>
      <button type="button" onClick={() => onChoose("vibestrate")} className={card}>
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4 shrink-0 text-violet-soft" strokeWidth={1.9} aria-hidden />
          <span className="min-w-0 flex-1 text-[13.5px] font-bold text-chalk-100">
            Work in Vibestrate
          </span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-violet-soft" strokeWidth={1.9} aria-hidden />
        </div>
        <p className="mt-1 text-[13px] leading-snug text-chalk-300">
          Walkthroughs that land you on the control, and a supervisor that can work the
          project with you.
        </p>
      </button>
    </div>
  );
}

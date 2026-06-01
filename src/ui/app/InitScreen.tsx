import { Fragment, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { api } from "../lib/api.js";
import { cn } from "../components/design/cn.js";

type Status = {
  initialized: boolean;
  isGitRepo: boolean;
  projectName: string;
  projectRoot: string;
};

type InitResult = Awaited<ReturnType<typeof api.initProject>>;
export type InitVariant = 1 | 2 | 3;

/**
 * First-run onboarding - the product's first impression, built to the
 * vibestrate-marketing brief: hard-edged slabs, hairline borders, the near-black
 * ground, the real wordmark asset, violet only as the single active signal. Three
 * layout variants (?initv=1|2|3) to compare; the shared container owns the init
 * call + states, the variant owns the idle composition.
 */
export function InitScreen({
  status,
  variant = 1,
  onEntered,
}: {
  status: Status;
  variant?: InitVariant;
  onEntered: () => void;
}) {
  const [phase, setPhase] = useState<"idle" | "working" | "done" | "error">(
    "idle",
  );
  const [result, setResult] = useState<InitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function initialize() {
    setPhase("working");
    setError(null);
    try {
      const r = await api.initProject();
      setResult(r);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }

  if (!status.isGitRepo) {
    return (
      <Frame>
        <NeedsGitCard status={status} />
      </Frame>
    );
  }
  if (phase === "done" && result) {
    return (
      <Frame>
        <DoneCard result={result} projectName={status.projectName} onEntered={onEntered} />
      </Frame>
    );
  }

  const ready = {
    working: phase === "working",
    error,
    onInitialize: () => void initialize(),
  };
  return (
    <Frame wide={variant === 2}>
      {variant === 1 ? (
        <ReadyMinimal {...ready} />
      ) : variant === 2 ? (
        <ReadyRail {...ready} />
      ) : (
        <ReadyFramed {...ready} />
      )}
    </Frame>
  );
}

function Frame({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-ink-0 px-6 text-fog-100">
      <div className={cn("w-full fade-up", wide ? "max-w-[620px]" : "max-w-[460px]")}>
        {children}
      </div>
    </div>
  );
}

function Brandmark({ center = true }: { center?: boolean }) {
  return (
    <div className={cn("flex flex-col", center ? "items-center" : "items-start")}>
      <img src="./logo-icon.png" alt="" className="h-11 w-11 rounded-[22%]" decoding="async" />
      <img
        src="./logo-wordmark.png"
        alt="Vibestrate"
        className="mt-4 h-[26px] w-auto opacity-95"
        decoding="async"
      />
    </div>
  );
}

/** The single active-signal CTA: a solid violet slab, hard edges, no glow. */
function VioletCta({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-11 w-full items-center justify-center gap-2 rounded-md",
        "bg-violet-deep text-[14px] font-medium text-white",
        "border border-violet-soft/30 transition-[filter] hover:brightness-110",
        "disabled:opacity-60 disabled:pointer-events-none",
      )}
    >
      {children}
    </button>
  );
}

function CtaLabel({ working }: { working: boolean }) {
  return (
    <>
      {working ? "Setting up your project" : "Initialize project"}
      {!working ? <ArrowRight size={16} /> : null}
    </>
  );
}

function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="mt-6 rounded-md border border-rose-400/30 bg-rose-500/5 px-4 py-3 text-[13px] text-rose-300">
      {error}
    </p>
  );
}

type ReadyProps = {
  working: boolean;
  error: string | null;
  onInitialize: () => void;
};

// ── Variant 1: centered minimal ─────────────────────────────────────────────
function ReadyMinimal({ working, error, onInitialize }: ReadyProps) {
  return (
    <>
      <Brandmark />
      <h1 className="text-display mt-10 text-center text-[26px] leading-[1.12]">
        Set up your project
      </h1>
      <p className="mx-auto mt-3 max-w-[40ch] text-center text-[14.5px] leading-relaxed text-fog-300">
        Vibestrate runs AI coding flows on your machine, under your supervision.
      </p>
      <div className="mt-8">
        <VioletCta disabled={working} onClick={onInitialize}>
          <CtaLabel working={working} />
        </VioletCta>
        {working ? <div className="meter mt-3" /> : null}
      </div>
      <p className="mt-4 text-center text-[12.5px] leading-relaxed text-fog-500">
        Creates a local <span className="mono text-fog-400">.vibestrate/</span> with
        your config, crew, roles, and flows.
      </p>
      <ErrorNote error={error} />
    </>
  );
}

// ── Variant 2: procedural rail (the page hints at the product) ──────────────
function ReadyRail({ working, error, onInitialize }: ReadyProps) {
  const steps = ["Task", "Flow", "Crew", "Run", "Review"];
  return (
    <>
      <Brandmark />
      <h1 className="text-display mt-10 text-center text-[27px] leading-[1.12]">
        One task, into a supervised run
      </h1>
      <p className="mx-auto mt-3 max-w-[46ch] text-center text-[14.5px] leading-relaxed text-fog-300">
        Vibestrate turns a task into a reviewed, multi-agent run - on your machine.
        Set this project up to begin.
      </p>

      <div className="mt-9 flex items-center justify-center">
        {steps.map((s, i) => (
          <Fragment key={s}>
            {i > 0 ? <span className="h-px w-5 bg-white/12" /> : null}
            <span className="rounded-md border border-white/10 bg-ink-100 px-3 py-1.5 text-[11.5px] font-medium text-fog-300">
              {s}
            </span>
          </Fragment>
        ))}
      </div>

      <div className="mx-auto mt-9 max-w-[360px]">
        <VioletCta disabled={working} onClick={onInitialize}>
          <CtaLabel working={working} />
        </VioletCta>
        {working ? <div className="meter mt-3" /> : null}
      </div>
      <ErrorNote error={error} />
    </>
  );
}

// ── Variant 3: framed ticket slab (engineered / instrument) ─────────────────
function ReadyFramed({ working, error, onInitialize }: ReadyProps) {
  return (
    <div className="relative rounded-lg border border-white/12 bg-ink-50 p-8">
      {/* technical corner label - a measurement mark, not an eyebrow */}
      <span className="mono absolute right-3 top-3 text-[10px] uppercase tracking-[0.18em] text-fog-500">
        setup
      </span>
      <Brandmark center={false} />
      <h1 className="text-display mt-8 text-[28px] leading-[1.1]">
        Set up your project
      </h1>
      <p className="mt-3 max-w-[42ch] text-[14px] leading-relaxed text-fog-300">
        Vibestrate runs AI coding flows on your machine, under your supervision. It
        scaffolds a local <span className="mono text-fog-200">.vibestrate/</span> with
        your config, crew, roles, and flows.
      </p>
      <div className="mt-8">
        <VioletCta disabled={working} onClick={onInitialize}>
          <CtaLabel working={working} />
        </VioletCta>
        {working ? <div className="meter mt-3" /> : null}
      </div>
      <ErrorNote error={error} />
    </div>
  );
}

// ── Shared: post-init + needs-git ───────────────────────────────────────────
function DoneCard({
  result,
  projectName,
  onEntered,
}: {
  result: InitResult;
  projectName: string;
  onEntered: () => void;
}) {
  const ready = result.detections.filter((d) => d.available);
  return (
    <>
      <Brandmark />
      <h1 className="text-display mt-10 text-center text-[26px] leading-[1.12]">
        {projectName} is ready
      </h1>
      <p className="mx-auto mt-3 max-w-[40ch] text-center text-[14.5px] leading-relaxed text-fog-300">
        {ready.length > 0
          ? `${ready.length} provider${ready.length === 1 ? "" : "s"} detected and ready to run.`
          : "Add a provider in Crew when you're ready to run."}
      </p>
      {result.detections.length > 0 ? (
        <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-white/10 bg-white/8">
          {result.detections.map((d) => (
            <div
              key={d.id}
              className={cn(
                "flex items-center gap-2 bg-ink-100 px-3 py-2.5 text-[13px]",
                d.available ? "text-fog-100" : "text-fog-500",
              )}
            >
              {d.available ? (
                <Check size={14} className="shrink-0 text-emerald-400" strokeWidth={2.25} />
              ) : (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-fog-500" />
              )}
              <span className="truncate">{d.label}</span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-8">
        <VioletCta onClick={onEntered}>
          Enter Vibestrate
          <ArrowRight size={16} />
        </VioletCta>
      </div>
    </>
  );
}

function NeedsGitCard({ status }: { status: Status }) {
  return (
    <>
      <Brandmark />
      <h1 className="text-display mt-10 text-center text-[26px] leading-[1.12]">
        Add git first
      </h1>
      <p className="mx-auto mt-3 max-w-[40ch] text-center text-[14.5px] leading-relaxed text-fog-300">
        Vibestrate runs every task in an isolated git worktree, so this folder needs
        to be a repository before setup.
      </p>
      <div className="mt-8 rounded-md border border-white/10 bg-ink-100 px-4 py-4">
        <div className="mono truncate text-[12.5px] text-fog-300">{status.projectRoot}</div>
        <p className="mt-3 text-[13.5px] leading-relaxed text-fog-400">
          Run this, then reload - setup continues automatically.
        </p>
        <div className="mono mt-3 rounded border border-white/10 bg-ink-200 px-3 py-2 text-[12.5px] text-fog-100">
          git init
        </div>
      </div>
    </>
  );
}

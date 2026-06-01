import { useState } from "react";
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

/**
 * First-run onboarding - the product's first impression, built to the
 * vibestrate-marketing brief: hard-edged slabs, hairline borders, the near-black
 * ground, the real wordmark asset, and violet only as the single active signal
 * (the CTA). No glass, glow, blooms, or font-rendered wordmark.
 */
export function InitScreen({
  status,
  onEntered,
}: {
  status: Status;
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

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-ink-0 px-6 text-fog-100">
      <div className="w-full max-w-[460px] fade-up">
        <Brandmark />
        {status.isGitRepo ? (
          phase === "done" && result ? (
            <DoneCard result={result} projectName={status.projectName} onEntered={onEntered} />
          ) : (
            <ReadyCard
              working={phase === "working"}
              error={error}
              onInitialize={() => void initialize()}
            />
          )
        ) : (
          <NeedsGitCard status={status} />
        )}
      </div>
    </div>
  );
}

function Brandmark() {
  return (
    <div className="flex flex-col items-center">
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

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-display mt-10 text-center text-[26px] leading-[1.12]">
      {children}
    </h1>
  );
}

function Lead({ children }: { children: React.ReactNode }) {
  return (
    <p className="mx-auto mt-3 max-w-[40ch] text-center text-[14.5px] leading-relaxed text-fog-300">
      {children}
    </p>
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

function ReadyCard({
  working,
  error,
  onInitialize,
}: {
  working: boolean;
  error: string | null;
  onInitialize: () => void;
}) {
  return (
    <>
      <Heading>Set up your project</Heading>
      <Lead>
        Vibestrate runs AI coding flows on your machine,
        <br />
        under your supervision.
      </Lead>

      <div className="mt-8">
        <VioletCta disabled={working} onClick={onInitialize}>
          {working ? "Setting up your project" : "Initialize project"}
          {!working ? <ArrowRight size={16} /> : null}
        </VioletCta>
        {working ? <div className="meter mt-3" /> : null}
      </div>

      <p className="mt-4 text-center text-[12.5px] leading-relaxed text-fog-500">
        Creates a local <span className="mono text-fog-400">.vibestrate/</span> with
        your config, crew, roles, and flows.
      </p>

      {error ? (
        <p className="mt-6 rounded-md border border-rose-400/30 bg-rose-500/5 px-4 py-3 text-[13px] text-rose-300">
          {error}
        </p>
      ) : null}
    </>
  );
}

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
      <Heading>{projectName} is ready</Heading>
      <Lead>
        {ready.length > 0
          ? `${ready.length} provider${ready.length === 1 ? "" : "s"} detected and ready to run.`
          : "Add a provider in Crew when you're ready to run."}
      </Lead>

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
      <Heading>Add git first</Heading>
      <Lead>
        Vibestrate runs every task in an isolated git worktree, so this folder needs
        to be a repository before setup.
      </Lead>
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

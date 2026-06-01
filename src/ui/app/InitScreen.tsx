import { useEffect, useState } from "react";
import { ArrowRight, Check, FolderGit2, Sparkle } from "lucide-react";
import { api } from "../lib/api.js";
import { Button } from "../components/design/Button.js";
import { cn } from "../components/design/cn.js";

type Status = {
  initialized: boolean;
  isGitRepo: boolean;
  projectName: string;
  projectRoot: string;
};

type InitResult = Awaited<ReturnType<typeof api.initProject>>;

/**
 * First-run onboarding. Shown by the gate when a project has no `.vibestrate/`.
 * It initializes the project in place (parity with `vibe init`) and hands the
 * user into the dashboard - the product's first impression, so it leans on the
 * editorial display type and a single, confident call to action.
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
    <div className="relative min-h-screen w-full overflow-hidden bg-ink-0 text-fog-100">
      <div className="vibestrate-backdrop" />
      {/* a soft violet bloom behind the card for depth */}
      <div
        className="pointer-events-none fixed left-1/2 top-[34%] -translate-x-1/2 -translate-y-1/2"
        style={{
          width: 760,
          height: 520,
          background:
            "radial-gradient(closest-side, rgba(139,124,255,0.16), transparent 70%)",
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-[600px] flex-col items-center justify-center px-6 py-16">
        <span className="relative mb-7 h-14 w-14 overflow-hidden rounded-2xl ring-1 ring-violet-soft/40 shadow-[0_10px_40px_-8px_rgba(139,124,255,0.6)] fade-up">
          <img
            src="./logo.png"
            alt="Vibestrate"
            className="block h-full w-full object-cover"
          />
        </span>

        {status.isGitRepo ? (
          phase === "done" && result ? (
            <DoneCard
              result={result}
              projectName={status.projectName}
              onEntered={onEntered}
            />
          ) : (
            <ReadyCard
              projectName={status.projectName}
              phase={phase}
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

function Hero({
  title,
  children,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="text-center fade-up fade-up-delay-1">
      <h1 className="text-display text-[34px] leading-[1.08] sm:text-[40px]">
        {title}
      </h1>
      <p className="mx-auto mt-4 max-w-[42ch] text-[15.5px] leading-relaxed text-fog-300">
        {children}
      </p>
    </div>
  );
}

function ReadyCard({
  projectName,
  phase,
  error,
  onInitialize,
}: {
  projectName: string;
  phase: "idle" | "working" | "done" | "error";
  error: string | null;
  onInitialize: () => void;
}) {
  const working = phase === "working";
  return (
    <>
      <Hero
        title={
          <>
            Welcome to{" "}
            <span className="font-serif italic text-violet-soft">Vibestrate</span>
          </>
        }
      >
        The local-first way to supervise AI coding flows. Let's set up{" "}
        <span className="text-fog-100">{projectName}</span> - it stays entirely on
        your machine.
      </Hero>

      <div className="mt-9 w-full fade-up fade-up-delay-2">
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          iconRight={<ArrowRight size={16} />}
          disabled={working}
          onClick={onInitialize}
        >
          {working ? "Setting up your project…" : "Initialize project"}
        </Button>
        {working ? <div className="meter mt-3" /> : null}
      </div>

      <ul className="mt-8 w-full space-y-2.5 text-[14px] text-fog-300 fade-up fade-up-delay-3">
        {[
          "Scaffolds .vibestrate/ - your config, crew, roles, and flows",
          "Detects the AI providers already installed on your machine",
          "Writes a sensible default crew and flow so you can run immediately",
        ].map((line) => (
          <li key={line} className="flex items-start gap-2.5">
            <Sparkle
              size={15}
              className="mt-0.5 shrink-0 text-violet-soft"
              strokeWidth={1.75}
            />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      {error ? (
        <p className="mt-6 w-full rounded-xl border border-rose-400/30 bg-rose-500/5 px-4 py-3 text-[13px] text-rose-300">
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
      <Hero title={<>You're all set</>}>
        <span className="text-fog-100">{projectName}</span> is initialized.{" "}
        {ready.length > 0
          ? `${ready.length} provider${ready.length === 1 ? "" : "s"} ready to run.`
          : "Add a provider in Crew when you're ready to run."}
      </Hero>

      {result.detections.length > 0 ? (
        <div className="mt-8 grid w-full grid-cols-2 gap-2 fade-up fade-up-delay-2">
          {result.detections.map((d) => (
            <div
              key={d.id}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[13px]",
                d.available
                  ? "border-violet-soft/25 bg-violet-soft/[0.06] text-fog-100"
                  : "border-white/8 bg-white/[0.02] text-fog-400",
              )}
            >
              {d.available ? (
                <Check size={15} className="shrink-0 text-emerald-400" strokeWidth={2} />
              ) : (
                <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-fog-500" />
              )}
              <span className="truncate">{d.label}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-9 w-full fade-up fade-up-delay-3">
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          iconRight={<ArrowRight size={16} />}
          onClick={onEntered}
        >
          Enter Vibestrate
        </Button>
      </div>
    </>
  );
}

function NeedsGitCard({ status }: { status: Status }) {
  return (
    <>
      <Hero
        title={
          <>
            One step before{" "}
            <span className="font-serif italic text-violet-soft">Vibestrate</span>
          </>
        }
      >
        Vibestrate runs on top of git - every run happens in an isolated worktree,
        so this folder needs to be a repository first.
      </Hero>

      <div className="mt-8 w-full rounded-2xl glass px-5 py-4 fade-up fade-up-delay-2">
        <div className="flex items-center gap-2.5 text-fog-200">
          <FolderGit2 size={16} className="text-violet-soft" />
          <span className="mono truncate text-[12.5px] text-fog-300">
            {status.projectRoot}
          </span>
        </div>
        <p className="mt-3 text-[14px] leading-relaxed text-fog-300">
          Initialize git in this folder, then reload this page - the setup will
          continue automatically.
        </p>
        <div className="mono mt-3 rounded-lg border border-white/10 bg-ink-200/60 px-3 py-2 text-[12.5px] text-fog-200">
          git init
        </div>
      </div>
    </>
  );
}

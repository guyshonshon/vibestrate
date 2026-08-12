import { useState } from "react";
import type { ReactNode } from "react";
import { ArrowRight, Check, Loader2, Minus } from "lucide-react";
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
 * First-run onboarding - the product's first impression, built on the same
 * card/token system as the rest of the dashboard (the Mission Control idiom)
 * so this gate reads as the same product as what it leads into.
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

  async function initialize(gitInit = false) {
    setPhase("working");
    setError(null);
    try {
      const r = await api.initProject(gitInit ? { gitInit: true } : undefined);
      setResult(r);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-coal-800 px-6 font-jakarta text-chalk-100">
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
        ) : phase === "done" && result ? (
          <DoneCard result={result} projectName={status.projectName} onEntered={onEntered} />
        ) : (
          <NeedsGitCard
            status={status}
            working={phase === "working"}
            error={error}
            onGitInit={() => void initialize(true)}
          />
        )}
      </div>
    </div>
  );
}

function Brandmark() {
  return (
    <div className="flex flex-col items-center">
      <img src="./logo-icon.png" alt="" className="h-11 w-11 rounded-[22%]" decoding="async" />
      {/* logo-wordmark.png is DARK ink (#1A0D40) on transparent - an earlier
          note here said white, which is why this fell back to set text. It reads
          as-is on the light canvas and inverts to near-white on the dark one. */}
      <img
        src="./logo-wordmark.png"
        alt="vibestrate"
        className="mt-4 h-[26px] w-auto dark:brightness-0 dark:invert"
        decoding="async"
      />
    </div>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <h1 className="mt-10 text-center text-[26px] font-extrabold leading-[1.15] tracking-[-0.02em] text-chalk-100">
      {children}
    </h1>
  );
}

function Lead({ children }: { children: ReactNode }) {
  return (
    <p className="mx-auto mt-3 max-w-[40ch] text-center text-[14.5px] leading-relaxed text-chalk-300">
      {children}
    </p>
  );
}

/** The single active-signal CTA: full-width primary button, busy state swaps the arrow for a spinner. */
function Cta({
  children,
  disabled,
  busy,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="primary"
      size="lg"
      className="w-full"
      disabled={disabled}
      onClick={onClick}
      iconLeft={busy ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} /> : undefined}
      iconRight={!busy ? <ArrowRight size={16} /> : undefined}
    >
      {children}
    </Button>
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
        Vibestrate runs coding flows on your machine,
        <br />
        under your supervision.
      </Lead>

      <div className="mt-8">
        <Cta busy={working} disabled={working} onClick={onInitialize}>
          {working ? "Setting up your project" : "Initialize project"}
        </Cta>
      </div>

      <p className="mt-4 text-center text-[12.5px] leading-relaxed text-chalk-400">
        Creates a local <span className="mono text-chalk-300">.vibestrate/</span> with
        your config, crew, roles, and flows.
      </p>

      {error ? (
        <p className="mt-6 rounded-[12px] border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-300">
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
        <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-[18px] border border-[color:var(--line)] bg-[color:var(--line)]">
          {result.detections.map((d) => (
            <div
              key={d.id}
              className={cn(
                "flex items-center gap-2 bg-coal-600 px-3 py-2.5 text-[13px]",
                d.available ? "text-chalk-100" : "text-chalk-400",
              )}
            >
              {d.available ? (
                <Check size={14} className="shrink-0 text-emerald-400" strokeWidth={2.25} />
              ) : (
                <Minus size={14} className="shrink-0 text-chalk-400" strokeWidth={2.25} />
              )}
              <span className="truncate">{d.label}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-8">
        <Cta onClick={onEntered}>Enter Vibestrate</Cta>
      </div>
    </>
  );
}

function NeedsGitCard({
  status,
  working,
  error,
  onGitInit,
}: {
  status: Status;
  working: boolean;
  error: string | null;
  onGitInit: () => void;
}) {
  return (
    <>
      <Heading>Add git first</Heading>
      <Lead>
        Vibestrate runs every task in an isolated git worktree, so this folder needs
        to be a repository before setup.
      </Lead>
      <div className="mt-8 rounded-[18px] border border-[color:var(--line)] bg-coal-600 px-4 py-4">
        <div className="mono truncate text-[12.5px] text-chalk-300">{status.projectRoot}</div>
        <p className="mt-3 text-[13.5px] leading-relaxed text-chalk-300">
          Vibestrate can create the repository for you: it writes a starter{" "}
          <span className="mono text-chalk-200">.gitignore</span> and makes an
          initial commit only when no secret-like files (such as{" "}
          <span className="mono text-chalk-200">.env</span>) would be swept in -
          otherwise it initializes without committing and tells you why.
        </p>
        <div className="mt-4">
          <Cta busy={working} disabled={working} onClick={onGitInit}>
            {working ? "Initializing repository" : "Initialize git + set up project"}
          </Cta>
        </div>
        {error ? (
          <p className="mt-4 rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-300">
            {error}
          </p>
        ) : null}
      </div>
    </>
  );
}

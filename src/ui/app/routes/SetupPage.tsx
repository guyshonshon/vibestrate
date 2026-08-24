// The guided path from an empty folder to a first run, in the browser.
//
// Everything here was previously only reachable by typing `vibe init`, then
// `vibe doctor --fix`, then `vibe provider setup`, then editing project.yml.
// The dashboard could already initialise a project and configure providers; it
// could not run doctor at all, so the docs had to send people to a terminal for
// the one step that tells them what is wrong. That is the gap this closes.
//
// The checklist is not a second opinion about setup - every step reads its
// state out of doctor's own findings, which is the same report `vibe doctor`
// prints. A new check added to the doctor service appears here without being
// re-implemented; an id this file does not know about lands in the last step
// rather than vanishing.
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  CircleAlert,
  CircleDashed,
  RefreshCw,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { PageShell, PageHeader, Section } from "../../components/layout/PageShell.js";
import { Deck, Cell } from "../../components/layout/Deck.js";
import { Button } from "../../components/design/Button.js";
import { ErrorState } from "../../components/design/ErrorState.js";
import { StatTile } from "../../components/design/StatTile.js";
import { api } from "../../lib/api.js";
import type { DoctorFindingDto, DoctorReportDto } from "../../lib/api/project.js";
import { navigate } from "../App.js";

type SetupStatus = Awaited<ReturnType<typeof api.getSetupStatus>>;

/** Worst-wins, so a step with one failure never reads as fine. */
type StepState = "fail" | "warn" | "ok" | "pending";

type StepDef = {
  id: string;
  title: string;
  blurb: string;
  /** Which doctor findings answer for this step. */
  owns: (findingId: string) => boolean;
};

// Ordered the way the work actually has to happen: you cannot configure a
// project that is not a repository, or point a role at a model you have not
// connected. The ids come from src/setup/doctor-service.ts.
const STEPS: StepDef[] = [
  {
    id: "repo",
    title: "A repository to work in",
    blurb:
      "Runs fork a branch from your trunk and work in a separate copy, so a run needs a git repository with at least one commit.",
    owns: (id) => id === "git-installed" || id === "git-repo",
  },
  {
    id: "init",
    title: "Initialise the project",
    blurb:
      "Writes `.vibestrate/` - the config, a role file per crew member, and the rules file every agent reads.",
    owns: (id) => id === "config-present" || id === "config-valid" || id === "project-detected",
  },
  {
    id: "model",
    title: "Connect a model",
    blurb:
      "Vibestrate spawns the coding CLIs you already have. At least one has to be installed, signed in, and pointed at by your crew.",
    owns: (id) => id.startsWith("provider-") || id === "agent-provider-refs",
  },
  {
    id: "tests",
    title: "Point it at your tests",
    blurb:
      "Your own commands are the referee in a run. Without them the reviewer is judging on prose alone.",
    owns: (id) => id.startsWith("validation-"),
  },
  {
    id: "rest",
    title: "Everything else doctor checks",
    blurb: "Prompt files, skills, the hard guards, and anything else that would bite mid-run.",
    // The catch-all: anything no earlier step claimed. Computed below, so a
    // finding added to the doctor service is never silently dropped.
    owns: () => true,
  },
];

function worst(findings: DoctorFindingDto[]): StepState {
  if (findings.length === 0) return "pending";
  if (findings.some((f) => f.severity === "fail")) return "fail";
  if (findings.some((f) => f.severity === "warn")) return "warn";
  return "ok";
}

function StateMark({ state }: { state: StepState }) {
  if (state === "ok") return <Check className="h-4 w-4 text-emerald-400" strokeWidth={2.4} />;
  if (state === "fail") return <CircleAlert className="h-4 w-4 text-rose-400" strokeWidth={2.2} />;
  if (state === "warn") return <TriangleAlert className="h-4 w-4 text-amber-400" strokeWidth={2.2} />;
  return <CircleDashed className="h-4 w-4 text-chalk-400" strokeWidth={2} />;
}

function Finding({ finding }: { finding: DoctorFindingDto }) {
  return (
    <li className="flex items-start gap-2.5 py-1.5">
      <span className="mt-0.5 shrink-0">
        <StateMark state={finding.severity === "ok" ? "ok" : finding.severity} />
      </span>
      <span className="min-w-0">
        <span className="text-[13.5px] text-chalk-100">{finding.title}</span>
        {finding.detail ? (
          <span className="mt-0.5 block text-meta text-chalk-300">{finding.detail}</span>
        ) : null}
        {finding.fixHint && finding.severity !== "ok" ? (
          <span className="mt-0.5 block text-meta text-chalk-300">{finding.fixHint}</span>
        ) : null}
      </span>
    </li>
  );
}

export function SetupPage() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [report, setReport] = useState<DoctorReportDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "check" | "fix" | "init">(null);
  const [lastFix, setLastFix] = useState<{ applied: string[]; skipped: string[] } | null>(null);

  const load = useCallback(async () => {
    setBusy("check");
    setError(null);
    try {
      const [s, r] = await Promise.all([api.getSetupStatus(), api.getDoctorReport()]);
      setStatus(s);
      setReport(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function initialize(gitInit: boolean) {
    setBusy("init");
    setError(null);
    try {
      await api.initProject({ gitInit });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  }

  async function fix() {
    setBusy("fix");
    setError(null);
    try {
      const result = await api.applyDoctorFixes();
      setLastFix({ applied: result.applied, skipped: result.skipped });
      setReport(result.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const findings = report?.findings ?? [];
  // Assign each finding to the FIRST step that claims it, so the catch-all only
  // receives what nothing else wanted.
  const byStep = new Map<string, DoctorFindingDto[]>(STEPS.map((s) => [s.id, []]));
  for (const finding of findings) {
    const step = STEPS.find((s) => s.owns(finding.id)) ?? STEPS[STEPS.length - 1];
    byStep.get(step!.id)!.push(finding);
  }

  const fails = findings.filter((f) => f.severity === "fail").length;
  const warns = findings.filter((f) => f.severity === "warn").length;
  const fixable = findings.some((f) => f.severity !== "ok" && f.fixable);
  const ready = report !== null && fails === 0 && (status?.initialized ?? false);

  return (
    <PageShell>
      <PageHeader
        title="Setup"
        actions={
          <div className="flex items-center gap-2">
            {/* Page-level, not per-step: the repair pass is one call that fixes
                whatever it can anywhere in the report, and a fixable finding
                can sit under any step. Hanging the button off one step hid it
                whenever the only repairable thing was under a different one. */}
            {fixable ? (
              <Button
                variant="primary"
                onClick={() => void fix()}
                disabled={busy !== null}
                iconLeft={<Wrench className="h-4 w-4" />}
              >
                {busy === "fix" ? "Fixing…" : "Fix what's safe"}
              </Button>
            ) : null}
            <Button
              variant="ghost"
              onClick={() => void load()}
              disabled={busy !== null}
              iconLeft={<RefreshCw className="h-4 w-4" />}
            >
              {busy === "check" ? "Checking…" : "Re-check"}
            </Button>
          </div>
        }
      >
        <p className="text-[14px] text-chalk-300">
          Everything a run needs, checked here rather than in a terminal. The same report{" "}
          <code className="text-chalk-200">vibe doctor</code> prints.
        </p>
      </PageHeader>

      {error ? (
        <div className="mb-4">
          <ErrorState
            compact
            title="Could not read the project's setup."
            detail={error}
            actions={[{ label: "Try again", onClick: () => void load() }]}
          />
        </div>
      ) : null}

      <Deck>
        <Cell>
          <StatTile
            value={ready ? "Ready" : status?.initialized ? "Needs work" : "Not set up"}
            label="Status"
            tone={ready ? "emerald" : fails > 0 ? "rose" : "default"}
          />
        </Cell>
        <Cell>
          <StatTile value={fails} label={fails === 1 ? "Failure" : "Failures"} tone={fails > 0 ? "rose" : "default"} />
        </Cell>
        <Cell>
          <StatTile value={warns} label={warns === 1 ? "Warning" : "Warnings"} tone={warns > 0 ? "amber" : "default"} />
        </Cell>
        <Cell>
          <StatTile value={findings.length} label="Checks run" />
        </Cell>

        {/* One cell, full width, because the steps ARE a timeline: they are
            numbered, they are read in order, and each one's state is the reason
            the next one matters. Packing them as cards would let the eye start
            in the middle of a sequence. */}
        <Cell size="full" reason="timeline">

      {status && !status.initialized ? (
        <Section title="Start here">
          <p className="mb-3 text-[13.5px] text-chalk-300">
            {status.isGitRepo
              ? `${status.projectName} is a git repository with no .vibestrate/ yet.`
              : `${status.projectName} is not a git repository yet. A run forks a branch, so it needs one.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() => void initialize(false)}
              disabled={busy !== null}
              iconLeft={<ArrowRight className="h-4 w-4" />}
            >
              {busy === "init" ? "Initialising…" : "Initialise this project"}
            </Button>
            {status.isGitRepo ? null : (
              <Button variant="secondary" onClick={() => void initialize(true)} disabled={busy !== null}>
                Create a git repository first
              </Button>
            )}
          </div>
        </Section>
      ) : null}

      {STEPS.map((step, index) => {
        const owned = byStep.get(step.id) ?? [];
        const state = worst(owned);
        return (
          <Section
            key={step.id}
            title={
              <span className="flex items-center gap-2.5">
                <StateMark state={state} />
                <span>
                  {index + 1}. {step.title}
                </span>
              </span>
            }
            action={
              step.id === "model" ? (
                <Button variant="ghost" size="sm" onClick={() => navigate({ kind: "providers" })}>
                  Providers
                </Button>
              ) : step.id === "tests" ? (
                <Button variant="ghost" size="sm" onClick={() => navigate({ kind: "config" })}>
                  Edit config
                </Button>
              ) : undefined
            }
          >
            <p className="mb-1.5 text-[13.5px] text-chalk-300">{step.blurb}</p>
            {owned.length === 0 ? (
              <p className="text-meta text-chalk-300">
                Nothing checked yet - doctor stops before this once an earlier step fails.
              </p>
            ) : (
              <ul className="divide-y divide-[color:var(--line)]">
                {owned.map((f) => (
                  <Finding key={f.id} finding={f} />
                ))}
              </ul>
            )}
          </Section>
        );
      })}

      {lastFix ? (
        <Section title="Last repair">
          {lastFix.applied.length === 0 ? (
            <p className="text-[13.5px] text-chalk-300">
              Nothing was safe to fix automatically. Whatever is left needs a decision, not a default.
            </p>
          ) : (
            <ul className="text-[13.5px] text-chalk-100">
              {lastFix.applied.map((line) => (
                <li key={line} className="py-0.5">
                  {line}
                </li>
              ))}
            </ul>
          )}
          {lastFix.skipped.length > 0 ? (
            <p className="mt-2 text-meta text-chalk-300">Skipped: {lastFix.skipped.join(", ")}</p>
          ) : null}
        </Section>
      ) : null}

      <Section title={`${STEPS.length + 1}. Start your first run`}>
        <p className="mb-3 text-[13.5px] text-chalk-300">
          {ready
            ? "Nothing is stopping a run. Describe one behaviour in one file, with tests that already say whether it worked."
            : "Clear the failures above first - a run that starts on a broken setup fails several minutes in."}
        </p>
        <Button
          variant={ready ? "primary" : "secondary"}
          onClick={() => navigate({ kind: "compose" })}
          disabled={!ready}
          iconLeft={<ArrowRight className="h-4 w-4" />}
        >
          New run
        </Button>
      </Section>

      {report && report.recommendedNextSteps.length > 0 ? (
        <Section title="Doctor's recommended next steps">
          <ul className="text-[13.5px] text-chalk-100">
            {report.recommendedNextSteps.map((line) => (
              <li key={line} className="py-0.5">
                {line}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
        </Cell>
      </Deck>
    </PageShell>
  );
}

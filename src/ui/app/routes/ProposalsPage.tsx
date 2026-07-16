import { useEffect, useState } from "react";
import { CheckCircle2, Compass, FileText } from "lucide-react";
import { api } from "../../lib/api.js";
import type {
  ProposalDryRunResponse,
  ProposalSummary,
} from "../../lib/types.js";
import { Button } from "../../components/design/Button.js";
import { Chip } from "../../components/design/Chip.js";
import {
  PageShell,
  PageHeader,
  Section,
} from "../../components/layout/PageShell.js";

const INPUT =
  "w-full rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 px-3 text-[13px] text-chalk-100 placeholder:text-chalk-400 outline-none focus:border-violet-soft/50 disabled:opacity-60";

/** Provenance of a proposal, derived from its id: the Spec-up chain writes
 *  `spec-up-<runId>`; `vibe roadmap plan` / the Generate action write
 *  `<timestamp>-<slug>`. One store, two sources - label which. */
function proposalOrigin(id: string): { label: string; tone: string } {
  return id.startsWith("spec-up-")
    ? { label: "From Spec-up", tone: "text-violet-soft" }
    : { label: "Ad-hoc plan", tone: "text-chalk-400" };
}

export function ProposalsPage({
  onOpenProposal,
}: {
  onOpenProposal: (id: string) => void;
}) {
  const [proposals, setProposals] = useState<ProposalSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [goal, setGoal] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  async function load() {
    try {
      setProposals(await api.listProposals());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function generate() {
    const g = goal.trim();
    if (!g || generating) return;
    setGenerating(true);
    setGenError(null);
    try {
      const r = await api.planRoadmap({ goal: g });
      setGoal("");
      await load();
      onOpenProposal(r.proposalId);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    void load();
    const i = setInterval(load, 4000);
    return () => clearInterval(i);
  }, []);

  if (error)
    return (
      <PageShell>
        <PageHeader title="Roadmap proposals" />
        <div className="rounded-[14px] border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-[12.5px] text-rose-300">
          {error}
        </div>
      </PageShell>
    );

  return (
    <PageShell>
      <PageHeader
        title={
          <span className="flex items-baseline gap-2.5">
            Roadmap proposals
            <span className="mono num-tabular text-[14px] font-semibold text-chalk-400">
              {proposals.length}
            </span>
          </span>
        }
      >
        <p className="mt-2 max-w-[760px] rounded-[14px] border border-[color:var(--line)] bg-coal-600 px-4 py-3 text-[12.5px] leading-relaxed text-chalk-300">
          One inbox for every roadmap draft, whether the planner wrote it from a
          broad goal here or it came out of a spec-up run. Review, dry-run, then
          accept to create the roadmap items and tasks.
        </p>
      </PageHeader>

      <Section title="New proposal">
        <div className="rounded-[16px] border border-[color:var(--line)] bg-coal-600 p-3">
          <div className="flex items-center gap-2">
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void generate();
              }}
              disabled={generating}
              placeholder="Plan a roadmap for a broad goal, e.g. Build the first public beta"
              className={`${INPUT} h-9`}
            />
            <Button
              variant="primary"
              onClick={() => void generate()}
              disabled={!goal.trim() || generating}
              iconLeft={<Compass className="h-3.5 w-3.5" strokeWidth={2} />}
            >
              {generating ? "Planning…" : "Generate proposal"}
            </Button>
          </div>
          {genError ? (
            <div className="mt-2 text-[11.5px] text-rose-300">{genError}</div>
          ) : null}
          <div className="mt-2 text-[11px] text-chalk-400">
            {generating ? (
              "Running the local planner agent - this can take a moment."
            ) : (
              <>
                Runs the local planner agent · CLI:{" "}
                <code className="mono rounded-[6px] bg-coal-500 px-1 py-0.5 text-chalk-300">
                  vibe roadmap plan "&lt;goal&gt;"
                </code>
              </>
            )}
          </div>
        </div>
      </Section>

      <Section title="Drafts">
        {proposals.length === 0 ? (
          <div className="rounded-[16px] border border-[color:var(--line)] bg-coal-600 px-6 py-10 text-center text-[12.5px] text-chalk-300">
            No proposals yet. Describe a goal above and generate your first one.
          </div>
        ) : (
          <ol className="space-y-2">
            {proposals.map((p) => {
              const origin = proposalOrigin(p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onOpenProposal(p.id)}
                    className="flex w-full items-center gap-3 rounded-[12px] border border-[color:var(--line)] bg-coal-600 p-3 text-left transition hover:bg-coal-500"
                  >
                    {p.accepted ? (
                      <CheckCircle2
                        className="h-4 w-4 text-emerald"
                        strokeWidth={1.6}
                      />
                    ) : (
                      <FileText
                        className="h-4 w-4 text-violet-soft"
                        strokeWidth={1.6}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="mono truncate text-[12.5px] text-chalk-100">
                        {p.id}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-chalk-400">
                        <span className={origin.tone}>{origin.label}</span>
                        <span>·</span>
                        <span>
                          {p.accepted
                            ? `accepted ${p.acceptedAt ? new Date(p.acceptedAt).toLocaleString() : ""}`
                            : `draft · modified ${new Date(p.modifiedAt).toLocaleString()}`}
                        </span>
                      </div>
                    </div>
                    <span className="mono text-[10.5px] text-chalk-400">
                      {p.byteSize}b
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </Section>
    </PageShell>
  );
}

export function ProposalDetailPage({
  proposalId,
  onAccepted,
  onBack,
}: {
  proposalId: string;
  onAccepted: () => void;
  onBack: () => void;
}) {
  const [body, setBody] = useState<string>("");
  const [accepted, setAccepted] = useState<{ acceptedAt: string } | null>(null);
  const [preview, setPreview] = useState<ProposalDryRunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"dryrun" | "accept" | null>(null);
  const [allowUnresolved, setAllowUnresolved] = useState(false);

  async function load() {
    try {
      const [g, dry] = await Promise.all([
        api.getProposal(proposalId),
        api.dryRunProposal({
          id: proposalId,
          allowUnresolvedDependencies: allowUnresolved,
        }),
      ]);
      setBody(g.body);
      setAccepted(g.accepted);
      setPreview(dry);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void load();
  }, [proposalId, allowUnresolved]);

  async function refreshDry() {
    setBusy("dryrun");
    try {
      const dry = await api.dryRunProposal({
        id: proposalId,
        allowUnresolvedDependencies: allowUnresolved,
      });
      setPreview(dry);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function accept() {
    setBusy("accept");
    try {
      await api.acceptProposal({
        id: proposalId,
        allowUnresolvedDependencies: allowUnresolved,
      });
      onAccepted();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  if (error)
    return (
      <PageShell>
        <PageHeader
          title="Proposal"
          actions={
            <Button variant="secondary" size="sm" onClick={onBack}>
              Back to proposals
            </Button>
          }
        />
        <div className="rounded-[14px] border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-[12.5px] text-rose-300">
          {error}
        </div>
      </PageShell>
    );

  const errorList = preview?.errors ?? [];
  const warnList = preview?.warnings ?? [];
  const acceptDisabled =
    accepted !== null || errorList.length > 0 || preview === null;

  return (
    <PageShell>
      <PageHeader
        title={
          <span className="flex items-baseline gap-2.5">
            <span className="mono text-[16px] font-semibold text-chalk-100">
              {proposalId}
            </span>
            {accepted ? (
              <Chip tone="emerald">
                Accepted {new Date(accepted.acceptedAt).toLocaleString()}
              </Chip>
            ) : null}
          </span>
        }
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={onBack}>
              ← Back
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={refreshDry}
              disabled={busy !== null}
            >
              {busy === "dryrun" ? "Refreshing…" : "Dry-run"}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={accept}
              disabled={busy !== null || acceptDisabled}
            >
              {busy === "accept" ? "Accepting…" : "Accept proposal"}
            </Button>
          </>
        }
      >
        <label className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-chalk-300">
          <input
            type="checkbox"
            checked={allowUnresolved}
            onChange={(e) => setAllowUnresolved(e.target.checked)}
          />
          allow unresolved dependencies
        </label>
      </PageHeader>

      <div className="grid grid-cols-[1fr_1fr] gap-4">
        <section className="flex flex-col overflow-hidden rounded-[16px] border border-[color:var(--line)] bg-coal-600">
          <header className="border-b border-[color:var(--line)] px-3 py-2 text-[12px] font-semibold text-chalk-300">
            Raw markdown
          </header>
          <pre className="mono flex-1 overflow-auto whitespace-pre-wrap p-3 text-[12px] text-chalk-300">
            {body || ""}
          </pre>
        </section>
        <section className="flex flex-col gap-3 overflow-y-auto rounded-[16px] border border-[color:var(--line)] bg-coal-600 p-3">
          <div className="text-[12px] font-semibold text-chalk-300">Preview</div>
          {preview === null ? (
            <div className="text-[12px] text-chalk-300">Loading…</div>
          ) : (
            <>
              <div className="text-[12.5px] text-chalk-100">
                Will create:{" "}
                <span className="mono text-chalk-300">
                  {preview.willCreate.roadmapItems.length} roadmap item(s),{" "}
                  {preview.willCreate.tasks.length} task(s),{" "}
                  {preview.willCreate.dependencyEdges.length} dependency edge(s)
                </span>
              </div>
              {preview.willCreate.roadmapItems.length > 0 ? (
                <div>
                  <div className="text-[11.5px] font-semibold text-chalk-300">
                    Roadmap items
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {preview.willCreate.roadmapItems.map((r) => (
                      <li
                        key={r.title}
                        className="mono text-[12px] text-chalk-200"
                      >
                        + {r.title}{" "}
                        <span className="text-chalk-400">({r.priority})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {preview.willCreate.tasks.length > 0 ? (
                <div>
                  <div className="text-[11.5px] font-semibold text-chalk-300">
                    Tasks
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {preview.willCreate.tasks.map((t) => (
                      <li
                        key={t.title}
                        className="mono text-[12px] text-chalk-200"
                      >
                        + {t.title}{" "}
                        <span className="text-chalk-400">
                          ({t.priority}, risk {t.riskLevel})
                          {t.dependencies.length > 0
                            ? ` ← ${t.dependencies.join(", ")}`
                            : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {preview.cycle.length > 0 ? (
                <div className="rounded-[10px] border border-rose-400/30 bg-rose-500/10 p-2 text-[12px] text-rose-300">
                  Cycle: {preview.cycle.join(" → ")} → {preview.cycle[0]}
                </div>
              ) : null}
              {warnList.length > 0 ? (
                <div className="rounded-[10px] border border-amber-soft/40 bg-amber-soft/10 p-2 text-[12px] text-amber-soft">
                  <div className="text-[11.5px] font-semibold">
                    Warnings ({warnList.length})
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {warnList.map((w, i) => (
                      <li key={i}>· {w.message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {errorList.length > 0 ? (
                <div className="rounded-[10px] border border-rose-400/30 bg-rose-500/10 p-2 text-[12px] text-rose-300">
                  <div className="text-[11.5px] font-semibold">
                    Errors ({errorList.length})
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {errorList.map((e, i) => (
                      <li key={i}>· {e.message}</li>
                    ))}
                  </ul>
                  <div className="mt-2 text-[11px]">
                    Accept is disabled until errors are fixed in the proposal
                    Markdown.
                  </div>
                </div>
              ) : null}
              {accepted ? (
                <div className="rounded-[10px] border border-emerald/30 bg-emerald/10 p-2 text-[12px] text-emerald">
                  This proposal was already accepted.
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </PageShell>
  );
}

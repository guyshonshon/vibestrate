import { useEffect, useState } from "react";
import { CheckCircle2, FileText } from "lucide-react";
import { api } from "../../lib/api.js";
import type {
  ProposalDryRunResponse,
  ProposalSummary,
} from "../../lib/types.js";

export function ProposalsPage({
  onOpenProposal,
}: {
  onOpenProposal: (id: string) => void;
}) {
  const [proposals, setProposals] = useState<ProposalSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setProposals(await api.listProposals());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void load();
    const i = setInterval(load, 4000);
    return () => clearInterval(i);
  }, []);

  if (error)
    return <div className="px-6 py-8 text-vibestrate-fail">{error}</div>;

  return (
    <div className="relative z-10 mx-auto max-w-[1280px] px-6 pt-5 pb-12">
      <section className="flex items-baseline gap-3 flex-wrap">
        <span className="eyebrow">Proposals</span>
        <span className="text-fog-500">·</span>
        <h1 className="text-[15px] font-semibold tracking-tight text-fog-100">
          Roadmap proposals{" "}
          <span className="mono text-[12px] text-fog-500 num-tabular">
            {proposals.length}
          </span>
        </h1>
        <span className="text-[11.5px] text-fog-500 mono ml-auto">
          generate one:{" "}
          <code className="bg-white/[0.04] rounded px-1 py-0.5 text-fog-200">
            vibestrate roadmap plan "&lt;goal&gt;"
          </code>
        </span>
      </section>
      <p className="text-[12.5px] text-fog-400 mt-2 max-w-[760px]">
        Drafts produced by the planner agent. Review, dry-run, then accept to
        create the corresponding roadmap items and tasks.
      </p>

      {proposals.length === 0 ? (
        <div className="glass mt-5 px-6 py-10 text-center text-[12.5px] text-fog-400">
          No proposals yet.
        </div>
      ) : (
        <ol className="mt-5 space-y-2">
          {proposals.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onOpenProposal(p.id)}
                className="flex w-full items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.022] hover:bg-white/[0.04] p-3 text-left transition"
              >
                {p.accepted ? (
                  <CheckCircle2
                    className="h-4 w-4 text-emerald-300"
                    strokeWidth={1.6}
                  />
                ) : (
                  <FileText
                    className="h-4 w-4 text-violet-soft"
                    strokeWidth={1.6}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="mono truncate text-[12.5px] text-fog-100">
                    {p.id}
                  </div>
                  <div className="text-[11px] text-fog-500">
                    {p.accepted
                      ? `accepted ${p.acceptedAt ? new Date(p.acceptedAt).toLocaleString() : ""}`
                      : `draft · modified ${new Date(p.modifiedAt).toLocaleString()}`}
                  </div>
                </div>
                <span className="mono text-[10.5px] text-fog-500">
                  {p.byteSize}b
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
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
      <div className="px-6 py-8 text-vibestrate-fail">
        {error}
        <div className="mt-2">
          <button
            onClick={onBack}
            className="rounded border border-vibestrate-border bg-vibestrate-panel-2 px-2 py-1 text-[12px] text-vibestrate-fg-dim hover:bg-vibestrate-panel"
          >
            Back to proposals
          </button>
        </div>
      </div>
    );

  const errorList = preview?.errors ?? [];
  const warnList = preview?.warnings ?? [];
  const acceptDisabled =
    accepted !== null || errorList.length > 0 || preview === null;

  return (
    <div className="relative z-10 mx-auto max-w-[1280px] px-6 pt-5 pb-12">
      <button
        type="button"
        onClick={onBack}
        className="text-[11.5px] text-fog-400 hover:text-fog-100"
      >
        ← back to proposals
      </button>
      <section className="mt-2 flex items-baseline gap-3 flex-wrap">
        <span className="eyebrow">Proposal</span>
        <span className="text-fog-500">·</span>
        <h1 className="mono text-[14px] text-fog-100">{proposalId}</h1>
        {accepted ? (
          <span className="text-[12px] text-emerald-300">
            ✓ Accepted {new Date(accepted.acceptedAt).toLocaleString()}
          </span>
        ) : null}
      </section>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1.5 text-[11.5px] text-fog-300">
          <input
            type="checkbox"
            checked={allowUnresolved}
            onChange={(e) => setAllowUnresolved(e.target.checked)}
          />
          allow unresolved dependencies
        </label>
        <button
          type="button"
          onClick={refreshDry}
          disabled={busy !== null}
          className="h-8 px-3 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] text-[12px] text-fog-100 disabled:opacity-50"
        >
          {busy === "dryrun" ? "Refreshing…" : "Dry-run"}
        </button>
        <button
          type="button"
          onClick={accept}
          disabled={busy !== null || acceptDisabled}
          className="h-8 px-3 rounded-lg bg-gradient-to-b from-emerald-500/30 to-emerald-700/50 border border-emerald-400/40 text-emerald-100 text-[12px] hover:from-emerald-500/45 disabled:opacity-50"
        >
          {busy === "accept" ? "Accepting…" : "Accept proposal"}
        </button>
      </div>

      <div className="grid grid-cols-[1fr_1fr] gap-4 mt-5">
        <section className="flex flex-col rounded border border-vibestrate-border bg-vibestrate-panel">
          <header className="border-b border-vibestrate-border px-3 py-1.5 text-[10.5px] uppercase tracking-[0.14em] text-vibestrate-fg-muted">
            raw markdown
          </header>
          <pre className="vibestrate-mono flex-1 overflow-auto whitespace-pre-wrap p-3 text-[12px] text-vibestrate-fg">
            {body || ""}
          </pre>
        </section>
        <section className="flex flex-col gap-3 overflow-y-auto rounded border border-vibestrate-border bg-vibestrate-panel p-3">
          <div className="text-[10.5px] uppercase tracking-[0.14em] text-vibestrate-fg-muted">
            preview
          </div>
          {preview === null ? (
            <div className="text-[12px] text-vibestrate-fg-muted">Loading…</div>
          ) : (
            <>
              <div className="text-[12.5px] text-vibestrate-fg">
                Will create:{" "}
                <span className="vibestrate-mono">
                  {preview.willCreate.roadmapItems.length} roadmap item(s),{" "}
                  {preview.willCreate.tasks.length} task(s),{" "}
                  {preview.willCreate.dependencyEdges.length} dependency edge(s)
                </span>
              </div>
              {preview.willCreate.roadmapItems.length > 0 ? (
                <div>
                  <div className="text-[10.5px] uppercase tracking-[0.14em] text-vibestrate-fg-muted">
                    roadmap items
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {preview.willCreate.roadmapItems.map((r) => (
                      <li
                        key={r.title}
                        className="vibestrate-mono text-[12px] text-vibestrate-fg"
                      >
                        + {r.title}{" "}
                        <span className="text-vibestrate-fg-muted">({r.priority})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {preview.willCreate.tasks.length > 0 ? (
                <div>
                  <div className="text-[10.5px] uppercase tracking-[0.14em] text-vibestrate-fg-muted">
                    tasks
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {preview.willCreate.tasks.map((t) => (
                      <li
                        key={t.title}
                        className="vibestrate-mono text-[12px] text-vibestrate-fg"
                      >
                        + {t.title}{" "}
                        <span className="text-vibestrate-fg-muted">
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
                <div className="rounded border border-vibestrate-fail/40 bg-vibestrate-fail/5 p-2 text-[12px] text-vibestrate-fail">
                  Cycle: {preview.cycle.join(" → ")} → {preview.cycle[0]}
                </div>
              ) : null}
              {warnList.length > 0 ? (
                <div className="rounded border border-vibestrate-warn/40 bg-vibestrate-warn/5 p-2 text-[12px] text-vibestrate-warn">
                  <div className="text-[10.5px] uppercase tracking-[0.14em]">
                    warnings ({warnList.length})
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {warnList.map((w, i) => (
                      <li key={i}>· {w.message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {errorList.length > 0 ? (
                <div className="rounded border border-vibestrate-fail/40 bg-vibestrate-fail/5 p-2 text-[12px] text-vibestrate-fail">
                  <div className="text-[10.5px] uppercase tracking-[0.14em]">
                    errors ({errorList.length})
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
                <div className="rounded border border-vibestrate-success/40 bg-vibestrate-success/5 p-2 text-[12px] text-vibestrate-success">
                  This proposal was already accepted.
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

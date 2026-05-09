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
    return <div className="px-6 py-8 text-amaco-fail">{error}</div>;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-amaco-border bg-amaco-panel px-6 py-4">
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
          proposals
        </div>
        <h1 className="mt-1 text-[16px] font-medium">Roadmap proposals</h1>
        <div className="mt-1 text-[12.5px] text-amaco-fg-dim">
          Drafts produced by the planner agent. Review, dry-run, then accept to
          create the corresponding roadmap items and tasks.
        </div>
        <div className="mt-2 text-[11.5px] text-amaco-fg-muted">
          Generate one with:{" "}
          <code className="amaco-mono rounded bg-amaco-panel-2 px-1 py-0.5">
            amaco roadmap plan "&lt;goal&gt;"
          </code>
        </div>
      </header>
      {proposals.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-[13px] text-amaco-fg-muted">
          No proposals yet. Run{" "}
          <code className="amaco-mono mx-1 rounded bg-amaco-panel-2 px-1 py-0.5">
            amaco roadmap plan "&lt;goal&gt;"
          </code>{" "}
          to draft one.
        </div>
      ) : (
        <ol className="flex-1 space-y-2 overflow-y-auto p-3">
          {proposals.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => onOpenProposal(p.id)}
                className="flex w-full items-center gap-3 rounded border border-amaco-border bg-amaco-panel-2 p-3 text-left hover:bg-amaco-panel"
              >
                {p.accepted ? (
                  <CheckCircle2
                    className="h-4 w-4 text-amaco-success"
                    strokeWidth={1.5}
                  />
                ) : (
                  <FileText
                    className="h-4 w-4 text-amaco-accent"
                    strokeWidth={1.5}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="amaco-mono truncate text-[12.5px] text-amaco-fg">
                    {p.id}
                  </div>
                  <div className="text-[11px] text-amaco-fg-muted">
                    {p.accepted
                      ? `accepted ${p.acceptedAt ? new Date(p.acceptedAt).toLocaleString() : ""}`
                      : `draft · modified ${new Date(p.modifiedAt).toLocaleString()}`}
                  </div>
                </div>
                <span className="amaco-mono text-[10.5px] text-amaco-fg-muted">
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
      <div className="px-6 py-8 text-amaco-fail">
        {error}
        <div className="mt-2">
          <button
            onClick={onBack}
            className="rounded border border-amaco-border bg-amaco-panel-2 px-2 py-1 text-[12px] text-amaco-fg-dim hover:bg-amaco-panel"
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
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="border-b border-amaco-border bg-amaco-panel px-6 py-4">
        <button
          onClick={onBack}
          className="text-[11.5px] text-amaco-fg-muted hover:text-amaco-fg"
        >
          ← back to proposals
        </button>
        <div className="mt-1 text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
          proposal
        </div>
        <h1 className="mt-0.5 amaco-mono text-[14px] text-amaco-fg">
          {proposalId}
        </h1>
        {accepted ? (
          <div className="mt-1 text-[12px] text-amaco-success">
            Accepted {new Date(accepted.acceptedAt).toLocaleString()}
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1 text-[11.5px] text-amaco-fg-dim">
            <input
              type="checkbox"
              checked={allowUnresolved}
              onChange={(e) => setAllowUnresolved(e.target.checked)}
            />
            allow unresolved dependencies
          </label>
          <button
            onClick={refreshDry}
            disabled={busy !== null}
            className="rounded border border-amaco-border bg-amaco-panel-2 px-2.5 py-1 text-[12px] text-amaco-fg-dim hover:bg-amaco-panel disabled:opacity-50"
          >
            {busy === "dryrun" ? "Refreshing…" : "Dry-run"}
          </button>
          <button
            onClick={accept}
            disabled={busy !== null || acceptDisabled}
            className="rounded border border-amaco-success/40 bg-amaco-success/10 px-2.5 py-1 text-[12px] text-amaco-success hover:bg-amaco-success/15 disabled:opacity-50"
          >
            {busy === "accept" ? "Accepting…" : "Accept proposal"}
          </button>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-[1fr_1fr] gap-3 overflow-hidden p-3">
        <section className="flex flex-col rounded border border-amaco-border bg-amaco-panel">
          <header className="border-b border-amaco-border px-3 py-1.5 text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
            raw markdown
          </header>
          <pre className="amaco-mono flex-1 overflow-auto whitespace-pre-wrap p-3 text-[12px] text-amaco-fg">
            {body || ""}
          </pre>
        </section>
        <section className="flex flex-col gap-3 overflow-y-auto rounded border border-amaco-border bg-amaco-panel p-3">
          <div className="text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
            preview
          </div>
          {preview === null ? (
            <div className="text-[12px] text-amaco-fg-muted">Loading…</div>
          ) : (
            <>
              <div className="text-[12.5px] text-amaco-fg">
                Will create:{" "}
                <span className="amaco-mono">
                  {preview.willCreate.roadmapItems.length} roadmap item(s),{" "}
                  {preview.willCreate.tasks.length} task(s),{" "}
                  {preview.willCreate.dependencyEdges.length} dependency edge(s)
                </span>
              </div>
              {preview.willCreate.roadmapItems.length > 0 ? (
                <div>
                  <div className="text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
                    roadmap items
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {preview.willCreate.roadmapItems.map((r) => (
                      <li
                        key={r.title}
                        className="amaco-mono text-[12px] text-amaco-fg"
                      >
                        + {r.title}{" "}
                        <span className="text-amaco-fg-muted">({r.priority})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {preview.willCreate.tasks.length > 0 ? (
                <div>
                  <div className="text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
                    tasks
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {preview.willCreate.tasks.map((t) => (
                      <li
                        key={t.title}
                        className="amaco-mono text-[12px] text-amaco-fg"
                      >
                        + {t.title}{" "}
                        <span className="text-amaco-fg-muted">
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
                <div className="rounded border border-amaco-fail/40 bg-amaco-fail/5 p-2 text-[12px] text-amaco-fail">
                  Cycle: {preview.cycle.join(" → ")} → {preview.cycle[0]}
                </div>
              ) : null}
              {warnList.length > 0 ? (
                <div className="rounded border border-amaco-warn/40 bg-amaco-warn/5 p-2 text-[12px] text-amaco-warn">
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
                <div className="rounded border border-amaco-fail/40 bg-amaco-fail/5 p-2 text-[12px] text-amaco-fail">
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
                <div className="rounded border border-amaco-success/40 bg-amaco-success/5 p-2 text-[12px] text-amaco-success">
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

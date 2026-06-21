import { useEffect, useState } from "react";
import { ChevronRight, FileText } from "lucide-react";
import { api } from "../../lib/api.js";

// ── In-run Shape draft review ────────────────────────────────────────────────
// On a `shape` run, surface the four CTO drafts (scope / spec / architecture /
// risks) as readable, collapsible sections so the user reviews them in one place
// before approving -> roadmap (the approve action lives in SpecUpRunActions,
// rendered alongside this). Read-only: the drafts are each step's output.md,
// fetched through the guarded artifact route. Sections that haven't been
// produced yet (a still-running shape run) are skipped.

const DRAFTS = [
  { key: "scope", path: "flows/scope/output.md", label: "Scope" },
  { key: "spec", path: "flows/spec/output.md", label: "Specification" },
  { key: "architecture", path: "flows/architecture/output.md", label: "Architecture + provisioning" },
  { key: "risks", path: "flows/risks/output.md", label: "Risks" },
] as const;

type Loaded = { key: string; label: string; content: string };

export function SpecUpReview({ runId, flowId }: { runId: string; flowId: string | undefined }) {
  const [docs, setDocs] = useState<Loaded[] | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set(["scope"]));

  useEffect(() => {
    if (flowId !== "spec-up") return;
    let live = true;
    void (async () => {
      const results = await Promise.all(
        DRAFTS.map(async (d): Promise<Loaded | null> => {
          const content = await api.readArtifact(runId, d.path).catch(() => null);
          return content && content.trim()
            ? { key: d.key, label: d.label, content }
            : null;
        }),
      );
      if (live) setDocs(results.filter((r): r is Loaded => r !== null));
    })();
    return () => {
      live = false;
    };
  }, [runId, flowId]);

  if (flowId !== "spec-up") return null;
  if (!docs || docs.length === 0) return null;

  return (
    <section
      style={{
        border: "1px solid var(--s-line)",
        borderRadius: 14,
        background: "var(--s-slab)",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px" }}>
        <FileText size={15} style={{ color: "var(--s-accent-bright)" }} />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--s-ink)" }}>
          Shape draft - review before approving
        </span>
      </div>
      {docs.map((d) => {
        const isOpen = open.has(d.key);
        return (
          <div key={d.key} style={{ borderTop: "1px solid var(--s-line)" }}>
            <button
              onClick={() =>
                setOpen((prev) => {
                  const next = new Set(prev);
                  if (next.has(d.key)) next.delete(d.key);
                  else next.add(d.key);
                  return next;
                })
              }
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 16px",
                cursor: "pointer",
                background: "transparent",
                border: "none",
                color: "var(--s-ink)",
                textAlign: "left",
              }}
            >
              <ChevronRight
                size={14}
                style={{
                  color: "var(--s-ink-faint)",
                  transform: isOpen ? "rotate(90deg)" : "none",
                  transition: "transform 120ms",
                }}
              />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{d.label}</span>
            </button>
            {isOpen ? (
              <div
                style={{
                  padding: "0 18px 16px 38px",
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: "var(--s-ink-dim)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  maxHeight: 460,
                  overflow: "auto",
                }}
              >
                {d.content.trim()}
              </div>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}

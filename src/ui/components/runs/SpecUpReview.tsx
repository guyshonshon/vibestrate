import { useEffect, useState } from "react";
import { ChevronRight, FileText, Pencil } from "lucide-react";
import { api } from "../../lib/api.js";

// ── In-run Spec-up draft review + edit ─────────────────────────────────────────
// On a `spec-up` run, surface the four CTO drafts (scope / spec / architecture /
// risks) as readable, collapsible sections so the user reviews them in one place
// before approving -> roadmap (the approve action lives in SpecUpRunActions). Each
// section is editable in place before the build via the guarded artifact route
// (closed section set, secret-refusal, block-after-approve, broker gate,
// symlink/hardlink-safe write). Once the build is approved the section is `frozen`
// (read-only). Sections not yet produced (a still-running run) are skipped.

const DRAFTS = [
  { key: "scope", label: "Scope" },
  { key: "spec", label: "Specification" },
  { key: "architecture", label: "Architecture + provisioning" },
  { key: "risks", label: "Risks" },
] as const;

type Loaded = { key: string; label: string; content: string; hash: string; frozen: boolean };

export function SpecUpReview({ runId, flowId }: { runId: string; flowId: string | undefined }) {
  const [docs, setDocs] = useState<Loaded[] | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set(["scope"]));
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function loadAll(): Promise<void> {
    const results = await Promise.all(
      DRAFTS.map(async (d): Promise<Loaded | null> => {
        const r = await api.getSpecUpArtifact(runId, d.key).catch(() => null);
        return r && r.content.trim()
          ? { key: d.key, label: d.label, content: r.content, hash: r.hash, frozen: r.frozen }
          : null;
      }),
    );
    setDocs(results.filter((r): r is Loaded => r !== null));
  }

  useEffect(() => {
    if (flowId !== "spec-up") return;
    let live = true;
    void (async () => {
      const results = await Promise.all(
        DRAFTS.map(async (d): Promise<Loaded | null> => {
          const r = await api.getSpecUpArtifact(runId, d.key).catch(() => null);
          return r && r.content.trim()
            ? { key: d.key, label: d.label, content: r.content, hash: r.hash, frozen: r.frozen }
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

  function startEdit(d: Loaded) {
    setEditingKey(d.key);
    setDraft(d.content);
    setErr(null);
    setOpen((prev) => new Set(prev).add(d.key));
  }

  async function save(d: Loaded) {
    setSaving(true);
    setErr(null);
    try {
      await api.editSpecUpArtifact(runId, d.key, draft, d.hash);
      setEditingKey(null);
      setDraft("");
      await loadAll(); // re-read content + fresh hash + frozen
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

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
          Spec-up draft - review + edit before approving
        </span>
      </div>
      {docs.map((d) => {
        const isOpen = open.has(d.key);
        const isEditing = editingKey === d.key;
        return (
          <div key={d.key} style={{ borderTop: "1px solid var(--s-line)" }}>
            <div style={{ display: "flex", alignItems: "center", padding: "10px 16px", gap: 8 }}>
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
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
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
                {d.frozen ? (
                  <span style={{ fontSize: 11, color: "var(--s-ink-faint)" }}>
                    approved (frozen)
                  </span>
                ) : null}
              </button>
              {!d.frozen && !isEditing ? (
                <button
                  onClick={() => startEdit(d)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 12,
                    color: "var(--s-ink-dim)",
                    background: "transparent",
                    border: "1px solid var(--s-line)",
                    borderRadius: 7,
                    padding: "3px 9px",
                    cursor: "pointer",
                  }}
                >
                  <Pencil size={12} /> Edit
                </button>
              ) : null}
            </div>
            {isOpen && isEditing ? (
              <div style={{ padding: "0 18px 14px 38px" }}>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  spellCheck={false}
                  style={{
                    width: "100%",
                    minHeight: 220,
                    resize: "vertical",
                    fontSize: 12.5,
                    lineHeight: 1.55,
                    fontFamily: "var(--s-mono, monospace)",
                    color: "var(--s-ink)",
                    background: "var(--s-bg, #0b0b0f)",
                    border: "1px solid var(--s-line)",
                    borderRadius: 8,
                    padding: 10,
                  }}
                />
                {err ? (
                  <div style={{ marginTop: 8, fontSize: 12, color: "var(--s-danger, #f08a8a)" }}>
                    {err}
                  </div>
                ) : null}
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button
                    onClick={() => void save(d)}
                    disabled={saving}
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: "var(--s-bg, #0b0b0f)",
                      background: "var(--s-accent-bright)",
                      border: "none",
                      borderRadius: 7,
                      padding: "6px 14px",
                      cursor: saving ? "default" : "pointer",
                      opacity: saving ? 0.6 : 1,
                    }}
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={() => {
                      setEditingKey(null);
                      setDraft("");
                      setErr(null);
                    }}
                    disabled={saving}
                    style={{
                      fontSize: 12.5,
                      color: "var(--s-ink-dim)",
                      background: "transparent",
                      border: "1px solid var(--s-line)",
                      borderRadius: 7,
                      padding: "6px 14px",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : isOpen ? (
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

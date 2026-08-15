import { useEffect, useState } from "react";
import { ChevronRight, FileText, Pencil } from "lucide-react";
import { ApiError, api } from "../../lib/api.js";
import { Button } from "../design/Button.js";
import { ErrorView } from "../../lib/error-view.js";
import { settle } from "../../lib/settled.js";

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
type FailedSection = { key: string; label: string; error: unknown };

/**
 * Read the four sections independently so one bad section cannot hide the other
 * three, and keep the failures: a dropped section would otherwise look exactly
 * like a section the run has not written yet, and the user is about to approve
 * this draft as if they had read all of it. A 404 IS "not produced yet".
 */
async function fetchSections(
  runId: string,
): Promise<{ docs: Loaded[]; failed: FailedSection[] }> {
  const settled = await Promise.all(
    DRAFTS.map(async (d) => ({ d, r: await settle(api.getSpecUpArtifact(runId, d.key)) })),
  );
  const docs: Loaded[] = [];
  const failed: FailedSection[] = [];
  for (const { d, r } of settled) {
    if (!r.ok) {
      if (!(r.error instanceof ApiError && r.error.status === 404))
        failed.push({ key: d.key, label: d.label, error: r.error });
      continue;
    }
    if (r.value.content.trim())
      docs.push({
        key: d.key,
        label: d.label,
        content: r.value.content,
        hash: r.value.hash,
        frozen: r.value.frozen,
      });
  }
  return { docs, failed };
}

export function SpecUpReview({ runId, flowId }: { runId: string; flowId: string | undefined }) {
  const [docs, setDocs] = useState<Loaded[] | null>(null);
  const [failed, setFailed] = useState<FailedSection[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set(["scope"]));
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function loadAll(): Promise<void> {
    const next = await fetchSections(runId);
    setDocs(next.docs);
    setFailed(next.failed);
  }

  useEffect(() => {
    if (flowId !== "spec-up") return;
    let live = true;
    void (async () => {
      const next = await fetchSections(runId);
      if (live) {
        setDocs(next.docs);
        setFailed(next.failed);
      }
    })();
    return () => {
      live = false;
    };
  }, [runId, flowId]);

  if (flowId !== "spec-up") return null;
  if (!docs || (docs.length === 0 && failed.length === 0)) return null;

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
    <section className="overflow-hidden rounded-[16px] border border-[color:var(--line)] bg-coal-600">
      <div className="flex items-center gap-2 px-4 py-3">
        <FileText size={15} className="text-violet-soft" />
        <span className="text-[13.5px] font-bold text-chalk-100">
          Spec-up draft - review + edit before approving
        </span>
      </div>
      {docs.map((d) => {
        const isOpen = open.has(d.key);
        const isEditing = editingKey === d.key;
        return (
          <div key={d.key} className="border-t border-[color:var(--line)]">
            <div className="flex items-center gap-2 pl-2 pr-3 py-1">
              <Button
                variant="ghost"
                size="md"
                className="flex-1 !justify-start"
                onClick={() =>
                  setOpen((prev) => {
                    const next = new Set(prev);
                    if (next.has(d.key)) next.delete(d.key);
                    else next.add(d.key);
                    return next;
                  })
                }
              >
                <ChevronRight
                  size={14}
                  className={`shrink-0 text-chalk-400 transition-transform duration-150 ${
                    isOpen ? "rotate-90" : ""
                  }`}
                />
                <span className="text-[13px] font-semibold">{d.label}</span>
                {d.frozen ? (
                  <span className="text-meta text-chalk-400">approved (frozen)</span>
                ) : null}
              </Button>
              {!d.frozen && !isEditing ? (
                <Button
                  variant="outline"
                  size="sm"
                  iconLeft={<Pencil size={12} />}
                  onClick={() => startEdit(d)}
                >
                  Edit
                </Button>
              ) : null}
            </div>
            {isOpen && isEditing ? (
              <div className="px-[18px] pb-3.5 pl-[38px]">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  spellCheck={false}
                  className="min-h-[220px] w-full resize-y rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 p-2.5 font-mono text-[12.5px] leading-[1.55] text-chalk-100 focus:border-violet-soft/50 focus:outline-none"
                />
                {err ? <div className="mt-2 text-[12px] text-rose-300">{err}</div> : null}
                <div className="mt-2.5 flex gap-2">
                  <Button variant="primary" size="sm" disabled={saving} onClick={() => void save(d)}>
                    {saving ? "Saving…" : "Save"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={saving}
                    onClick={() => {
                      setEditingKey(null);
                      setDraft("");
                      setErr(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : isOpen ? (
              <div className="max-h-[460px] overflow-auto px-[18px] pb-4 pl-[38px] text-[13px] leading-[1.6] text-chalk-300 whitespace-pre-wrap break-words">
                {d.content.trim()}
              </div>
            ) : null}
          </div>
        );
      })}
      {failed.map((f) => (
        <div key={f.key} className="border-t border-[color:var(--line)] px-[18px] py-3">
          <ErrorView
            compact
            err={f.error}
            onRetry={() => void loadAll()}
            override={{
              title: `Couldn't load the ${f.label.toLowerCase()} section`,
              hint: "This section exists but could not be read, so the draft above is incomplete. Retry before approving.",
            }}
          />
        </div>
      ))}
    </section>
  );
}

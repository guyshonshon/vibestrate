import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { api } from "../../lib/api.js";
import type { Note } from "../../lib/types.js";
import { NoteComposer } from "./NoteComposer.js";

export function NotesPanel({ runId }: { runId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const list = await api.listNotes(runId, true);
        if (!cancelled) {
          setNotes(list);
          setError(null);
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
  }, [runId]);

  async function handleResolve(noteId: string) {
    try {
      const updated = await api.resolveNote(runId, noteId);
      setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const open = notes.filter((n) => !n.resolved);
  const resolved = notes.filter((n) => n.resolved);

  return (
    <div className="space-y-3">
      <NoteComposer
        runId={runId}
        onAdd={(note) => setNotes((prev) => [note, ...prev])}
      />
      {error ? (
        <div className="text-[12px] text-vibestrate-fail">{error}</div>
      ) : null}
      <Section title={`Open (${open.length})`} notes={open} onResolve={handleResolve} />
      {resolved.length > 0 ? (
        <Section
          title={`Resolved (${resolved.length})`}
          notes={resolved}
          onResolve={() => {}}
          dim
        />
      ) : null}
    </div>
  );
}

function Section({
  title,
  notes,
  onResolve,
  dim,
}: {
  title: string;
  notes: Note[];
  onResolve: (id: string) => void;
  dim?: boolean;
}) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-vibestrate-fg-muted">
        {title}
      </div>
      {notes.length === 0 ? (
        <div className="mt-1 text-[12px] text-vibestrate-fg-muted">—</div>
      ) : (
        <ul className="mt-1.5 space-y-1.5">
          {notes.map((n) => (
            <li
              key={n.id}
              className={`rounded border border-vibestrate-border bg-vibestrate-panel-2 p-2 ${
                dim ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-center gap-2 text-[11px] text-vibestrate-fg-muted">
                <span className="vibestrate-mono rounded border border-vibestrate-border bg-vibestrate-panel px-1 py-0.5">
                  {n.scope}
                </span>
                <span className="vibestrate-mono truncate">{n.target}</span>
                <span className="ml-auto vibestrate-mono">
                  {new Date(n.createdAt).toLocaleTimeString()}
                </span>
                {!n.resolved ? (
                  <button
                    onClick={() => onResolve(n.id)}
                    className="ml-1 inline-flex items-center gap-1 rounded border border-vibestrate-border bg-vibestrate-panel px-1.5 py-0.5 text-[10.5px] text-vibestrate-fg-dim hover:text-vibestrate-fg"
                  >
                    <Check className="h-3 w-3" strokeWidth={1.5} /> resolve
                  </button>
                ) : null}
              </div>
              <div className="mt-1.5 whitespace-pre-wrap text-[12.5px] text-vibestrate-fg">
                {n.message}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

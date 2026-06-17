import { useState } from "react";
import { api } from "../../lib/api.js";
import type { Note } from "../../lib/types.js";
import { Select } from "../design/Select.js";

type Props = {
  runId: string;
  defaultScope?: Note["scope"];
  defaultTarget?: string;
  onAdd: (note: Note) => void;
};

const SCOPES: Note["scope"][] = [
  "run",
  "stage",
  "artifact",
  "file",
  "validation",
  "event",
];

export function NoteComposer({
  runId,
  defaultScope = "run",
  defaultTarget = "",
  onAdd,
}: Props) {
  const [scope, setScope] = useState<Note["scope"]>(defaultScope);
  const [target, setTarget] = useState(defaultTarget || runId);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() || !target.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const note = await api.addNote({
        runId,
        scope,
        target: target.trim(),
        message: message.trim(),
      });
      onAdd(note);
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Select
          value={scope}
          ariaLabel="Note scope"
          className="min-w-[120px]"
          onChange={(v) => setScope(v as Note["scope"])}
          options={SCOPES.map((s) => ({ value: s, label: s }))}
        />
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="target (run id, stage, file path, etc.)"
          className="vibestrate-mono flex-1 border border-vibestrate-border bg-vibestrate-panel-2 px-2 py-1 text-[11.5px] text-vibestrate-fg placeholder-vibestrate-fg-muted"
        />
      </div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Note…"
        rows={2}
        className="block w-full resize-y border border-vibestrate-border bg-vibestrate-panel-2 px-2 py-1.5 text-[12.5px] text-vibestrate-fg placeholder-vibestrate-fg-muted"
      />
      <div className="flex items-center justify-between gap-2">
        {error ? (
          <span className="text-[11.5px] text-vibestrate-fail">{error}</span>
        ) : (
          <span />
        )}
        <button
          type="submit"
          disabled={saving || !message.trim()}
          className="border border-vibestrate-border bg-vibestrate-panel-2 px-2.5 py-1 text-[12px] text-vibestrate-fg hover:bg-vibestrate-panel disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Add note"}
        </button>
      </div>
    </form>
  );
}

import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import type { ProfileView, Task } from "../../lib/types.js";
import { Select } from "../design/Select.js";

export function TaskRunMode({
  task,
  onPatched,
}: {
  task: Task;
  onPatched: (next: Task) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<ProfileView[]>([]);

  useEffect(() => {
    api
      .getProfiles()
      .then((r) => setProfiles(r.profiles))
      .catch(() => {});
  }, []);

  async function setField<K extends "profileOverride" | "readOnly">(
    field: K,
    value:
      | "low"
      | "medium"
      | "high"
      | null
      | boolean
      | string,
  ): Promise<void> {
    setBusy(field);
    setError(null);
    try {
      // Cast through the patch shape - the api method accepts a partial
      // and we know `field` matches `value` by construction.
      const next = await api.patchTask(task.id, {
        [field]: value as never,
      });
      onPatched(next);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const providerOptions = [
    { value: "", label: "Default (crew's provider)" },
    ...profiles.map((p) => ({
      value: p.id,
      label: p.label,
      hint: p.model ?? p.provider,
    })),
  ];

  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-[color:var(--line)] bg-coal-600 p-3">
      <label className="flex flex-col gap-1.5">
        <span
          className="text-[11px] font-medium text-violet-soft"
          title="Pin every agent in runs spawned from this task to a specific configured profile. Wins over effort."
        >
          Provider
        </span>
        <Select
          value={task.profileOverride ?? ""}
          disabled={busy !== null}
          ariaLabel="Provider override"
          className="w-full"
          options={providerOptions}
          onChange={(v) => {
            if (v === (task.profileOverride ?? "")) return;
            void setField("profileOverride", v.length === 0 ? null : v);
          }}
        />
      </label>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={task.readOnly ?? false}
          disabled={busy !== null}
          onChange={(e) => void setField("readOnly", e.target.checked)}
          className="h-3.5 w-3.5 accent-violet-soft"
        />
        <span
          className="text-[12px] font-medium text-chalk-200"
          title="Investigation-only: runs spawned from this task skip executor + fix loop and refuse apply/validate/revert."
        >
          Read-only
        </span>
      </label>

      {error ? (
        <div className="rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-[11.5px] text-rose-300">
          {error}
        </div>
      ) : null}
    </div>
  );
}

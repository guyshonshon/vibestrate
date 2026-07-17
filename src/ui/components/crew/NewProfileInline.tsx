import { useState } from "react";
import type { api } from "../../lib/api.js";
import type { ProviderCatalog } from "../../lib/types.js";
import { Button } from "../design/Button.js";
import { SuggestInput } from "../design/SuggestInput.js";
import { EffortScale } from "../design/EffortScale.js";
import { cn } from "../design/cn.js";

const EMPTY_CAPS = { models: [], modelEnabled: false, powerLevels: [] };

// Inline "create a profile and use it here" form, opened from a Role's profile
// row - the connected path so you can mint a preset (e.g. claude-cheap) right
// where a role needs it.
export function NewProfileInline({
  providers,
  catalog,
  existingProfileIds,
  saving,
  onCancel,
  onCreate,
}: {
  providers: string[];
  catalog: ProviderCatalog;
  existingProfileIds: Set<string>;
  saving: boolean;
  onCancel: () => void;
  onCreate: (input: Parameters<typeof api.createProfile>[0]) => void;
}) {
  const [id, setId] = useState("");
  const [provider, setProvider] = useState(providers[0] ?? "");
  const [model, setModel] = useState("");
  const [power, setPower] = useState("");
  const caps = catalog[provider] ?? EMPTY_CAPS;
  const idTaken = existingProfileIds.has(id.trim());
  const valid =
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id.trim()) && !idTaken && !!provider;
  const inputCls =
    "rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 px-2 py-1.5 text-[12px] text-chalk-100 placeholder:text-chalk-400 outline-none focus:border-violet-soft/50";

  return (
    <div className="mt-2.5 rounded-[16px] border border-violet-soft/25 bg-coal-800 p-3">
      <div className="mb-2 text-[12px] font-semibold text-violet-vivid">
        New profile for this role
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="id (e.g. claude-cheap)"
          className={cn(inputCls, "w-[160px]", idTaken && "border-rose-400/50")}
          autoFocus
        />
        <select value={provider} onChange={(e) => setProvider(e.target.value)} className={inputCls}>
          {providers.length === 0 ? <option value="">(no providers)</option> : null}
          {providers.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {caps.modelEnabled ? (
          <SuggestInput value={model} onChange={setModel} suggestions={caps.models} placeholder="model" className={cn(inputCls, "w-[130px]")} />
        ) : null}
      </div>
      {caps.powerLevels.length ? (
        <div className="mt-3">
          <div className="mb-1.5 text-[12px] font-semibold text-violet-vivid">
            Effort
          </div>
          <EffortScale levels={caps.powerLevels} value={power} onChange={setPower} />
        </div>
      ) : null}
      <div className="mt-2.5 flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={!valid || saving}
          onClick={() =>
            onCreate({
              id: id.trim(),
              provider,
              model: model.trim() || undefined,
              power: power.trim() || undefined,
            })
          }
        >
          Create and use
        </Button>
      </div>
    </div>
  );
}

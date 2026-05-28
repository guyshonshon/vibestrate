import { useValidationProfiles } from "../../lib/useValidationProfiles.js";

type Props = {
  value: string | null;
  onChange: (next: string | null) => void;
  /** Optional id from suggestion's own validationProfile to highlight as recommended. */
  suggestedFromMarker?: string | null;
  disabled?: boolean;
  label?: string;
};

/**
 * Small inline dropdown for picking a validation profile. Shows the implicit
 * default plus every named profile with its command preview underneath. When
 * a suggestion declares its own `VALIDATION_PROFILE` we mark that option as
 * "(from marker)" so the user can see why it's preselected.
 */
export function ProfileSelect({
  value,
  onChange,
  suggestedFromMarker,
  disabled,
  label = "Validation profile",
}: Props) {
  const { profiles, loading, error } = useValidationProfiles();
  const selected = value ?? "default";
  const found = profiles.find((p) => p.profileName === selected);

  return (
    <div className="flex flex-col gap-1 text-[10.5px]">
      <label className="flex items-center gap-1.5 text-vibestrate-fg-dim">
        <span>{label}</span>
        <select
          value={selected}
          onChange={(e) => {
            const next = e.target.value;
            onChange(next === "default" ? null : next);
          }}
          disabled={disabled || loading || profiles.length === 0}
          className="rounded border border-vibestrate-border bg-vibestrate-panel-2 px-1.5 py-0.5 text-[11px] text-vibestrate-fg disabled:opacity-50"
        >
          {profiles.map((p) => (
            <option key={p.profileName} value={p.profileName}>
              {p.profileName}
              {p.profileName === suggestedFromMarker ? "  (from marker)" : ""}
              {p.hasCommands ? "" : "  (empty)"}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <span className="text-vibestrate-fail">{error}</span>
      ) : found ? (
        <span className="vibestrate-mono truncate text-vibestrate-fg-muted">
          {found.commands.length === 0
            ? "(no commands — validation will report no_commands_configured)"
            : `→ ${found.commands.join("  ·  ")}`}
        </span>
      ) : null}
    </div>
  );
}

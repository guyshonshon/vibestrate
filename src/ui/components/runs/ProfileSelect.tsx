import { useValidationProfiles } from "../../lib/useValidationProfiles.js";
import { Select } from "../design/Select.js";

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
      <label className="flex items-center gap-1.5 text-vibestrate-fg">
        <span>{label}</span>
        <Select
          value={selected}
          ariaLabel={label}
          className="min-w-[150px]"
          disabled={disabled || loading || profiles.length === 0}
          onChange={(v) => onChange(v === "default" ? null : v)}
          options={profiles.map((p) => ({
            value: p.profileName,
            label: p.profileName,
            hint:
              p.profileName === suggestedFromMarker
                ? "(from marker)"
                : p.hasCommands
                  ? undefined
                  : "(empty)",
          }))}
        />
      </label>
      {error ? (
        <span className="text-vibestrate-fail">{error}</span>
      ) : found ? (
        <span className="vibestrate-mono truncate text-vibestrate-fg-muted">
          {found.commands.length === 0
            ? "(no commands - validation will report no_commands_configured)"
            : `→ ${found.commands.join("  ·  ")}`}
        </span>
      ) : null}
    </div>
  );
}

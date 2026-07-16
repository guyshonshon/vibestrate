import { useState } from "react";

/**
 * A field for a value that has known options but isn't closed: it renders a real
 * dropdown of the suggestions (so you can actually pick one) plus a "Custom…"
 * entry that swaps to a free text input - for models/levels a CLI adds or
 * renames, or providers like Ollama that expose whatever you've pulled. When
 * there are no suggestions it's just the empty option + Custom.
 */
export function SuggestInput({
  value,
  onChange,
  suggestions,
  placeholder,
  className,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  // Custom mode when the value isn't one of the suggestions (and isn't empty).
  const [custom, setCustom] = useState(
    value !== "" && !suggestions.includes(value),
  );

  if (custom) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={className}
          disabled={disabled}
          autoFocus
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setCustom(false);
            onChange("");
          }}
          title="back to the list"
          className="shrink-0 rounded-[8px] px-1.5 py-1 text-[11px] text-chalk-400 transition hover:text-chalk-100"
        >
          list
        </button>
      </span>
    );
  }

  return (
    <select
      value={suggestions.includes(value) ? value : ""}
      disabled={disabled}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "__custom__") {
          setCustom(true);
          onChange("");
        } else {
          onChange(v);
        }
      }}
      className={className}
    >
      <option value="">{placeholder ?? "—"}</option>
      {suggestions.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
      <option value="__custom__">Custom…</option>
    </select>
  );
}

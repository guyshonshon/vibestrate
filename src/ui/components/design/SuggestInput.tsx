import { useId } from "react";

/**
 * A text input with a datalist of suggestions - shows known options (e.g. a
 * provider's models or effort levels) while still accepting any typed value.
 * Used by the Profile editor so fields aren't blank guesses, but stay open for
 * models/levels a CLI adds or renames.
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
  const id = useId();
  return (
    <>
      <input
        list={suggestions.length ? id : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
        disabled={disabled}
      />
      {suggestions.length ? (
        <datalist id={id}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      ) : null}
    </>
  );
}

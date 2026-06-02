import { cn } from "./cn.js";

const ULTRA = "ultracode";

/**
 * Effort picker rendered as an ordered Faster -> Smarter scale (not a dropdown),
 * matching how effort actually works: a ladder of levels. `ultracode` (when a
 * provider offers it) sits apart as the top tier - xhigh + workflows. Clicking
 * the active level clears it. Generic over whatever ordered levels a provider
 * exposes (claude: low..ultracode; codex: minimal..high).
 */
export function EffortScale({
  value,
  onChange,
  levels,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  levels: string[];
  disabled?: boolean;
}) {
  const main = levels.filter((l) => l !== ULTRA);
  const hasUltra = levels.includes(ULTRA);
  const offLadder = value !== "" && !levels.includes(value);

  const pill = (level: string, ultra = false) =>
    cn(
      "flex-1 rounded-md px-1.5 py-1 text-[11px] leading-none transition-colors text-center",
      value === level
        ? "bg-violet-deep text-white"
        : ultra
          ? "border border-violet-soft/30 text-violet-soft hover:bg-violet-soft/10"
          : "border border-white/10 text-fog-300 hover:border-violet-soft/40 hover:text-fog-100",
      disabled && "opacity-50 pointer-events-none",
    );

  return (
    <div>
      <div className="flex items-center justify-between px-0.5 text-[9.5px] uppercase tracking-[0.16em] text-fog-500">
        <span>Faster</span>
        <span>Smarter</span>
      </div>
      <div className="mt-1 flex items-stretch gap-1">
        {main.map((l) => (
          <button
            key={l}
            type="button"
            disabled={disabled}
            onClick={() => onChange(value === l ? "" : l)}
            className={pill(l)}
          >
            {l}
          </button>
        ))}
        {hasUltra ? (
          <>
            <span className="mx-0.5 self-center text-fog-700 select-none">┆</span>
            <button
              type="button"
              disabled={disabled}
              title="xhigh + workflows"
              onClick={() => onChange(value === ULTRA ? "" : ULTRA)}
              className={pill(ULTRA, true)}
            >
              ultracode
            </button>
          </>
        ) : null}
      </div>
      <div className="mt-1 text-[10px] text-fog-500">
        {value === ULTRA
          ? "ultracode = xhigh + workflows"
          : offLadder
            ? `custom: ${value}`
            : value
              ? `effort: ${value}`
              : "no effort set"}
      </div>
    </div>
  );
}

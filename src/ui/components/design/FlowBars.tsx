// The flow step bar-meter - the signature "more colors" visual on every flow
// card. The bar chart reads a flow's shape (count, rhythm) AND its makeup at a
// glance, coloured by step FUNCTION (build / review / check / gate) via the one
// shared `stepKind` map - so the meter and the step list never disagree. Shared
// by Mission Control's composer and the Flows catalog.
import {
  STEP_GROUP_HEX,
  STEP_GROUP_HEX_UNKNOWN,
  stepKindGroup,
} from "./stepKind.js";

export function FlowBars({
  steps,
  on = true,
  height = "h-6",
}: {
  steps: Array<{ kind?: string }>;
  /** Dim the bars when the card isn't selected (composer picker). */
  on?: boolean;
  /** Tailwind height class for the meter (default h-6). */
  height?: string;
}) {
  const shown = steps.slice(0, 10);
  const bars: Array<{ kind?: string }> = shown.length > 0 ? shown : [{}];
  return (
    <div className={`my-2.5 flex ${height} items-end gap-[3px]`} aria-hidden>
      {bars.map((s, i) => (
        <span
          key={i}
          className="flex-1 rounded-[2px]"
          style={{
            // Count-only rows (hub cards) have no kind - stay grey rather than
            // imply every step is "build".
            background: s.kind
              ? STEP_GROUP_HEX[stepKindGroup(s.kind)]
              : STEP_GROUP_HEX_UNKNOWN,
            opacity: on ? 1 : 0.42,
            height: `${9 + ((i * 5) % 11)}px`,
          }}
        />
      ))}
    </div>
  );
}

// Shared chrome for the metrics panels.

// Status-categorical outcome colours (merged / changes / failed) are read from
// the theme tokens so they flip under :root.light instead of being hardcoded.
// Non-categorical viz (latency, tokens, spend, heatmap, leaderboard) stays the
// single-hue violet house style.
export const CSS = {
  emerald: "var(--color-emerald, #34d399)",
  amber: "var(--color-amber-soft, #fb923c)",
  rose: "var(--color-fail, #fb7185)",
  violet: "var(--color-violet-soft, #a78bfa)",
} as const;

// Card shell recipe (primitives-contract §5): coal-600 surface, hairline border,
// plus a restrained top-lit inset highlight for LOUD/Raycast surface layering
// (a single 1px highlight, never a decorative gradient background).
export const CARD =
  "rounded-[20px] border border-[color:var(--line)] bg-coal-600 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

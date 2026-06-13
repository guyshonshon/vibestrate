import { cn } from "../../components/design/cn.js";

/**
 * The consult "AI thinking" orb. A layered, morphing sphere driven entirely by
 * CSS (see .orb rules in index.css) so it never blocks the main thread. Two
 * states: `idle` (calm breathing - used as the dock's resting icon) and
 * `thinking` (majestic morph + conic shimmer - shown while a consult runs).
 */
export function ConsultOrb({
  state = "idle",
  size = 56,
  className,
}: {
  state?: "idle" | "thinking";
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("orb", state === "thinking" ? "orb--thinking" : "orb--idle", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <div className="orb__halo" />
      <div className="orb__ring" />
      <div className="orb__blob orb__blob--a" />
      <div className="orb__blob orb__blob--b" />
      <div className="orb__core" />
    </div>
  );
}

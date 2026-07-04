// Shared ring geometry for the annular-segment charts (the Crew seat-coverage
// relation ring and the Metrics proportion rings). One source for the arc math
// so the two chart components share a shape language instead of forking it
// (primitives-contract §5a/§11).

/** Point on a circle at angle `rad` (radians, 0 = +x, clockwise in SVG space). */
export function polar(
  cx: number,
  cy: number,
  r: number,
  rad: number,
): [number, number] {
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

/**
 * An annular sector (ring wedge) from angle `a0` to `a1` (radians), inner radius
 * `ri` to outer radius `ro`. The large-arc flag is derived from the span, so the
 * same helper draws both narrow seat arcs (< 180deg) and wide proportion
 * segments (> 180deg).
 */
export function annularPath(
  cx: number,
  cy: number,
  ri: number,
  ro: number,
  a0: number,
  a1: number,
): string {
  const largeArc = a1 - a0 > Math.PI ? 1 : 0;
  const [x0o, y0o] = polar(cx, cy, ro, a0);
  const [x1o, y1o] = polar(cx, cy, ro, a1);
  const [x1i, y1i] = polar(cx, cy, ri, a1);
  const [x0i, y0i] = polar(cx, cy, ri, a0);
  return `M ${x0o} ${y0o} A ${ro} ${ro} 0 ${largeArc} 1 ${x1o} ${y1o} L ${x1i} ${y1i} A ${ri} ${ri} 0 ${largeArc} 0 ${x0i} ${y0i} Z`;
}

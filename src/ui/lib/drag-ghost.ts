/**
 * Replace the browser's default drag image (a faded snapshot of the dragged
 * element, which for a tall provider row looks clumsy) with a compact, branded
 * pill showing what's being dragged. Best-effort and self-contained: it inlines
 * its styles so it never depends on a stylesheet, and removes the throwaway
 * node on the next tick once the browser has snapshotted it.
 *
 * No-op outside the browser (so it's safe to import anywhere).
 */
export function setDragGhost(
  dataTransfer: DataTransfer | null,
  label: string,
): void {
  if (typeof document === "undefined" || !dataTransfer) return;

  const ghost = document.createElement("div");
  ghost.textContent = label;
  Object.assign(ghost.style, {
    position: "fixed",
    top: "-1000px",
    left: "-1000px",
    padding: "7px 13px",
    borderRadius: "10px",
    background: "rgba(20,18,28,0.92)",
    color: "#e9e6f2",
    border: "1px solid rgba(167,139,250,0.55)",
    font: "500 12.5px ui-sans-serif, system-ui, -apple-system, sans-serif",
    boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
    pointerEvents: "none",
    whiteSpace: "nowrap",
    zIndex: "9999",
  } satisfies Partial<CSSStyleDeclaration>);

  document.body.appendChild(ghost);
  dataTransfer.setDragImage(ghost, 14, 18);
  // The browser snapshots the node synchronously for the drag image; drop it
  // right after so it never lingers in the DOM.
  setTimeout(() => ghost.remove(), 0);
}

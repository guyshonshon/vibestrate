import { useEffect, useRef, useState, type ReactNode } from "react";

export type ContextMenuItem = {
  /** Stable identifier — also the React key. */
  id: string;
  /** Shown text. Use a `divider:` prefix to render a separator instead. */
  label: string;
  /** Optional short hint shown to the right of the label. */
  hint?: string;
  /** Tint the row by intent. `danger` is red, `accent` is cyan. */
  tone?: "danger" | "accent";
  /** When true, the row is shown disabled and onSelect is not called. */
  disabled?: boolean;
  /** Fires when the user picks this item. */
  onSelect?: () => void | Promise<void>;
};

type ContextMenuTriggerProps = {
  items: ContextMenuItem[];
  children: (handlers: {
    onContextMenu: (e: React.MouseEvent) => void;
  }) => ReactNode;
};

/**
 * Renders its child via a function so the consumer can spread the
 * `onContextMenu` handler onto whatever element makes sense (a row,
 * a card, etc). Right-clicking opens a small floating menu anchored
 * to the cursor. Clicking outside / Esc closes it.
 *
 * No portal needed: the menu is absolutely positioned within the
 * normal DOM flow at a fixed (clientX, clientY) location.
 */
export function ContextMenuTrigger({
  items,
  children,
}: ContextMenuTriggerProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!pos) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setPos(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPos(null);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [pos]);

  return (
    <>
      {children({
        onContextMenu: (e) => {
          e.preventDefault();
          // Skip when there are zero non-divider items.
          const real = items.filter((i) => !i.label.startsWith("divider:"));
          if (real.length === 0) return;
          setPos({ x: e.clientX, y: e.clientY });
        },
      })}
      {pos ? (
        <div
          ref={menuRef}
          role="menu"
          style={{
            position: "fixed",
            top: pos.y,
            left: pos.x,
            zIndex: 9999,
          }}
          className="min-w-[200px] rounded border border-amaco-border bg-amaco-panel py-1 shadow-lg"
        >
          {items.map((item) => {
            if (item.label.startsWith("divider:")) {
              return (
                <div
                  key={item.id}
                  className="my-1 h-px bg-amaco-border"
                  role="separator"
                />
              );
            }
            const tone =
              item.tone === "danger"
                ? "text-amaco-fail hover:bg-amaco-fail/10"
                : item.tone === "accent"
                  ? "text-amaco-accent hover:bg-amaco-accent/10"
                  : "text-amaco-fg hover:bg-amaco-panel-2";
            return (
              <button
                key={item.id}
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setPos(null);
                  if (item.disabled) return;
                  void item.onSelect?.();
                }}
                className={`flex w-full items-center justify-between gap-3 px-3 py-1 text-left text-[12.5px] ${tone} disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <span>{item.label}</span>
                {item.hint ? (
                  <span className="amaco-mono text-[10.5px] text-amaco-fg-muted">
                    {item.hint}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </>
  );
}

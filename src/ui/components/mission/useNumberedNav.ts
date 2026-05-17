import { useEffect } from "react";

/**
 * Keyboard hook: press [1]–[7] (when not focused inside an input) to
 * jump to the corresponding numbered surface. Each id should match
 * the `id` prop the target section/aside renders with.
 *
 * Also wires `?` to dispatch a custom `amaco:help-overlay` event so
 * any registered help overlay can toggle.
 */
export function useNumberedNav(map: Record<string, string>) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (isTyping) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "?") {
        window.dispatchEvent(new CustomEvent("amaco:help-overlay"));
        return;
      }
      if (!/^[1-9]$/.test(e.key)) return;
      const id = map[e.key];
      if (!id) return;
      const el = document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [map]);
}

/** Light/dark toggle. Reads + persists via lib/theme; the icon shows the
 * theme you'll switch TO. */
import { Moon, Sun } from "lucide-react";
import { useTheme } from "../../lib/theme.js";

export function ThemeToggle({
  className = "h-9 w-9 rounded-[11px]",
}: {
  /** Controls size/shape/border; defaults to the sidebar pill. */
  className?: string;
}) {
  const { theme, toggle } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className={`flex items-center justify-center text-chalk-400 transition hover:bg-coal-500 hover:text-chalk-100 ${className}`}
    >
      {theme === "dark" ? (
        <Sun className="h-[18px] w-[18px]" />
      ) : (
        <Moon className="h-[18px] w-[18px]" />
      )}
    </button>
  );
}

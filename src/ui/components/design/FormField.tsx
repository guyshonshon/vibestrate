import type { ReactNode } from "react";

/**
 * A labelled form control for settings-style panels: bold accent label above
 * the control, wrapped in a real <label> so clicking the text focuses the
 * input.
 */
export function FormField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-[12px] font-semibold text-violet-vivid">
        {label}
      </div>
      {children}
    </label>
  );
}

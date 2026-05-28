/**
 * Brand mark — the rendered logo + wordmark used by the TopBar (and
 * any future surface that needs an Vibestrate lockup). Uses /logo.png from
 * Vite's public dir; the wordmark sits in Instrument Serif italic to
 * match the editorial accent ("brief" / "ideas" / etc.) the design
 * system leans on.
 */
export function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="relative w-7 h-7 rounded-lg overflow-hidden ring-1 ring-violet-soft/40 shadow-[0_4px_18px_-4px_rgba(139,124,255,0.6)]">
        <img
          src="./logo.png"
          alt="Vibestrate"
          width={28}
          height={28}
          className="w-full h-full object-cover block"
        />
      </span>
      <span className="text-display italic text-[19px] leading-none text-fog-100 tracking-tight">
        Vibestrate
      </span>
    </div>
  );
}

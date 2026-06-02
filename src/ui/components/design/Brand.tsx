/**
 * Brand mark - the icon + wordmark lockup used by the TopBar (and any surface
 * that needs a Vibestrate lockup). Both are the real brand assets from Vite's
 * public dir: the circuit-V icon and the official wordmark image (so the
 * letterforms match the brand instead of a font approximation).
 */
export function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="relative h-7 w-7 overflow-hidden rounded-lg ring-1 ring-violet-soft/40 shadow-[0_4px_18px_-4px_rgba(139,124,255,0.6)]">
        <img
          src="./logo-icon.png"
          alt=""
          width={28}
          height={28}
          className="block h-full w-full object-cover"
        />
      </span>
      <img
        src="./logo-wordmark.png"
        alt="Vibestrate"
        className="h-[15px] w-auto opacity-95"
        decoding="async"
      />
    </div>
  );
}

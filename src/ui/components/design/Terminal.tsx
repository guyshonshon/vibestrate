import { useEffect, useRef, useState } from "react";
import { cn } from "./cn.js";

export type TerminalLine = {
  tag: string;
  text: string;
  color?: "violet" | "sky" | "emerald" | "amber" | "fog" | "rose";
};

const TAG: Record<string, string> = {
  violet: "text-violet-soft",
  sky: "text-sky-glow",
  emerald: "text-emerald-300",
  amber: "text-amber-300",
  fog: "text-fog-400",
  rose: "text-rose-300",
};

function LineRow({ line, dim = false }: { line: TerminalLine; dim?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 mono text-[12px] leading-[1.55]",
        dim && "opacity-60",
      )}
    >
      <span
        className={cn(
          "uppercase tracking-[0.1em] w-[76px] shrink-0 text-[10px] pt-[2px]",
          TAG[line.color ?? "fog"] ?? "text-fog-400",
        )}
      >
        {line.tag}
      </span>
      <span className="text-fog-200/90 break-words min-w-0 flex-1">
        {line.text}
      </span>
    </div>
  );
}

/**
 * Streamed terminal that scrolls through a fixed list of lines. The
 * real Live tail in Run Detail uses the existing LiveOutputPanel; this
 * component is for the Mission Control mini-preview and the placeholder
 * preview in run cards.
 */
function useStream(
  lines: TerminalLine[],
  intervalMs: number,
  max: number,
  paused: boolean,
): TerminalLine[] {
  const [buf, setBuf] = useState<TerminalLine[]>(() =>
    lines.slice(0, Math.min(3, lines.length)),
  );
  const iRef = useRef<number>(Math.min(3, lines.length));
  useEffect(() => {
    if (paused) return;
    if (lines.length === 0) return;
    const id = window.setInterval(() => {
      iRef.current = (iRef.current + 1) % lines.length;
      setBuf((prev) => {
        const next = [...prev, lines[iRef.current]!];
        return next.slice(-max);
      });
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [lines, intervalMs, max, paused]);
  return buf;
}

export function MiniTerminal({
  lines,
  paused = false,
}: {
  lines: TerminalLine[];
  paused?: boolean;
}) {
  const buf = useStream(lines, 1100, 6, paused);
  return (
    <div className="relative rounded-lg border border-white/[0.06] bg-black/40 px-3 py-2.5 overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-soft/40 to-transparent" />
      <div className="space-y-[3px]">
        {buf.length === 0 ? (
          <div className="mono text-[11px] text-fog-500">
            no recent events
          </div>
        ) : (
          buf.map((l, i) => (
            <LineRow
              key={`${i}-${l.text}`}
              line={l}
              dim={i < buf.length - 3}
            />
          ))
        )}
      </div>
    </div>
  );
}

export function LiveTerminal({
  lines,
  paused = false,
  title = "live · sandboxed shell",
}: {
  lines: TerminalLine[];
  paused?: boolean;
  title?: string;
}) {
  const buf = useStream(lines, 850, 14, paused);
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [buf.length]);
  return (
    <div className="relative flex flex-col rounded-xl border border-white/[0.08] bg-black/55 overflow-hidden min-h-0 h-full">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-soft/40 to-transparent" />
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06] bg-black/30">
        <div className="flex items-center gap-2">
          <span className="flex gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-400/70" />
            <span className="w-2 h-2 rounded-full bg-amber-300/70" />
            <span className="w-2 h-2 rounded-full bg-emerald-400/70" />
          </span>
          <span className="mono text-[11px] text-fog-400 ml-2">{title}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="mono text-[10.5px] text-fog-500 uppercase tracking-[0.14em]">
            {paused ? "paused" : "streaming"}
          </span>
          <span
            className={cn(
              "inline-block w-1.5 h-1.5 rounded-full",
              paused ? "bg-amber-300" : "bg-emerald-400 animate-pulse",
            )}
          />
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-[3px]">
        {buf.map((l, i) => (
          <LineRow key={`${i}-${l.text}`} line={l} />
        ))}
        <div className="flex items-center gap-2 mono text-[12px] text-fog-400 pt-1">
          <span className="text-violet-soft">›</span>
          <span className="text-fog-300">waiting for next tool call</span>
          <span className="caret" />
        </div>
        <div ref={endRef} />
      </div>
    </div>
  );
}

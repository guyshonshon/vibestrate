import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

export type ProviderCliTerminalLine = {
  stream: "stdout" | "stderr";
  chunk: string;
  at: string;
};

export function ProviderCliTerminal({
  lines,
  streamName,
}: {
  lines: ProviderCliTerminalLine[];
  streamName: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const writtenRef = useRef(0);

  useEffect(() => {
    if (!hostRef.current) return;
    const term = new Terminal({
      convertEol: true,
      cursorBlink: false,
      cursorStyle: "block",
      disableStdin: true,
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
      fontSize: 12.5,
      lineHeight: 1.35,
      scrollback: 4000,
      theme: {
        background: "#0b0e13",
        foreground: "#cfd8e3",
        cursor: "#cfd8e3",
        black: "#0b0e13",
        blue: "#58a6ff",
        cyan: "#7dd3fc",
        green: "#7ee787",
        magenta: "#d2a8ff",
        red: "#ff7b72",
        white: "#cfd8e3",
        yellow: "#d29922",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* ignore */
      }
    });
    ro.observe(hostRef.current);

    return () => {
      ro.disconnect();
      try {
        term.dispose();
      } catch {
        /* ignore */
      }
      termRef.current = null;
      fitRef.current = null;
      writtenRef.current = 0;
    };
  }, []);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.reset();
    writtenRef.current = 0;
  }, [streamName]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    if (writtenRef.current > lines.length) {
      term.reset();
      writtenRef.current = 0;
    }
    for (const line of lines.slice(writtenRef.current)) {
      if (line.stream === "stderr") {
        term.write(`\x1b[33m${line.chunk}\x1b[0m`);
      } else {
        term.write(line.chunk);
      }
    }
    writtenRef.current = lines.length;
  }, [lines]);

  return (
    <div
      ref={hostRef}
      className="min-h-[320px] overflow-hidden rounded-b border-t border-vibestrate-border-soft bg-[#0b0e13]"
    />
  );
}

type Item = {
  command: string;
  exitCode: number;
  status: "passed" | "failed";
  durationMs: number;
};

export function ValidationCommandResult({ item }: { item: Item }) {
  const ok = item.status === "passed";
  return (
    <div
      className={`flex items-center gap-3 rounded border px-2.5 py-1.5 ${
        ok
          ? "border-vibestrate-success/30 bg-vibestrate-success/5"
          : "border-vibestrate-fail/30 bg-vibestrate-fail/5"
      }`}
    >
      <span
        className={`vibestrate-mono text-[11px] ${
          ok ? "text-vibestrate-success" : "text-vibestrate-fail"
        }`}
      >
        {ok ? "PASS" : "FAIL"}
      </span>
      <span className="vibestrate-mono flex-1 truncate text-[12px] text-vibestrate-fg">
        {item.command}
      </span>
      <span className="vibestrate-mono text-[11px] text-vibestrate-fg-muted">
        exit {item.exitCode} · {item.durationMs}ms
      </span>
    </div>
  );
}

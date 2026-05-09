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
          ? "border-amaco-success/30 bg-amaco-success/5"
          : "border-amaco-fail/30 bg-amaco-fail/5"
      }`}
    >
      <span
        className={`amaco-mono text-[11px] ${
          ok ? "text-amaco-success" : "text-amaco-fail"
        }`}
      >
        {ok ? "PASS" : "FAIL"}
      </span>
      <span className="amaco-mono flex-1 truncate text-[12px] text-amaco-fg">
        {item.command}
      </span>
      <span className="amaco-mono text-[11px] text-amaco-fg-muted">
        exit {item.exitCode} · {item.durationMs}ms
      </span>
    </div>
  );
}

type Item = {
  command: string;
  exitCode: number;
  status: "passed" | "failed" | "environment";
  durationMs: number;
};

export function ValidationCommandResult({ item }: { item: Item }) {
  // "environment" = the toolchain wasn't there (command not found) - the
  // command never validated anything. Amber, not red: nothing failed.
  const tone =
    item.status === "passed"
      ? {
          box: "border-vibestrate-success/30 bg-vibestrate-success/5",
          text: "text-vibestrate-success",
          label: "PASS",
        }
      : item.status === "environment"
        ? {
            box: "border-amber-400/30 bg-amber-500/5",
            text: "text-amber-300",
            label: "ENV",
          }
        : {
            box: "border-vibestrate-fail/30 bg-vibestrate-fail/5",
            text: "text-vibestrate-fail",
            label: "FAIL",
          };
  return (
    <div
      className={`flex items-center gap-3 rounded border px-2.5 py-1.5 ${tone.box}`}
    >
      <span
        className={`vibestrate-mono text-[11px] ${tone.text}`}
        title={
          item.status === "environment"
            ? "Toolchain missing in the worktree - the command could not run; nothing was validated and nothing failed."
            : undefined
        }
      >
        {tone.label}
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

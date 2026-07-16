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
          box: "border-emerald/30 bg-emerald/10",
          text: "text-emerald",
          label: "PASS",
        }
      : item.status === "environment"
        ? {
            box: "border-amber-soft/40 bg-amber-soft/10",
            text: "text-amber-soft",
            label: "ENV",
          }
        : {
            box: "border-rose-400/30 bg-rose-500/10",
            text: "text-rose-300",
            label: "FAIL",
          };
  return (
    <div
      className={`flex items-center gap-3 rounded-[10px] border px-2.5 py-1.5 ${tone.box}`}
    >
      <span
        className={`mono text-[11px] font-semibold ${tone.text}`}
        title={
          item.status === "environment"
            ? "Toolchain missing in the worktree - the command could not run; nothing was validated and nothing failed."
            : undefined
        }
      >
        {tone.label}
      </span>
      <span className="mono flex-1 truncate text-[12px] text-chalk-100">
        {item.command}
      </span>
      <span className="mono text-[11px] text-chalk-400">
        exit {item.exitCode} · {item.durationMs}ms
      </span>
    </div>
  );
}

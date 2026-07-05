import { ShieldAlert } from "lucide-react";

export function SecretDiffWarning({ message }: { message?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-[12px] border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-[13px] text-rose-300">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} aria-hidden />
      <span>
        {message ??
          "Diff body suppressed - this file looks like a secret, so only its name is shown. Review it directly in the worktree if you need the contents."}
      </span>
    </div>
  );
}

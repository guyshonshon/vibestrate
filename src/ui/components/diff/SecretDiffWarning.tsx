import { ShieldAlert } from "lucide-react";

export function SecretDiffWarning({ message }: { message?: string }) {
  return (
    <div className="flex items-start gap-2 rounded border border-vibestrate-warn/40 bg-vibestrate-warn/5 p-2 text-[12px] text-vibestrate-warn">
      <ShieldAlert className="mt-0.5 h-3.5 w-3.5" strokeWidth={1.5} />
      <span>
        {message ??
          "Diff body suppressed — this file looks like a secret. Filename only."}
      </span>
    </div>
  );
}

// Surfaces errors that a React ErrorBoundary cannot catch - async failures,
// event-handler throws, and unhandled promise rejections - as a dismissible
// toast stack, so a failure shows in the UI instead of only the F12 console.
import { useEffect, useState } from "react";

type Toast = { id: number; msg: string };

function reasonText(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === "string") return reason;
  try {
    return JSON.stringify(reason);
  } catch {
    return String(reason);
  }
}

export function GlobalErrorOverlay() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let next = 0;
    const push = (msg: string) => {
      const id = next++;
      // Cap the stack so a thrashing error loop can't fill the screen.
      setToasts((prev) => [...prev.slice(-4), { id, msg }]);
    };
    const onError = (e: ErrorEvent) => {
      // Ignore resource-load errors (no `error` object) - those are network
      // noise, not app crashes.
      if (!e.error && !e.message) return;
      push(e.message || reasonText(e.error));
    };
    const onRejection = (e: PromiseRejectionEvent) =>
      push(`Unhandled promise rejection: ${reasonText(e.reason)}`);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex max-w-md flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-start gap-2 rounded-[12px] border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[11.5px] text-rose-300 shadow-xl"
        >
          <span className="mt-px shrink-0 text-rose-400">!</span>
          <span className="min-w-0 flex-1 break-words">{t.msg}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
            className="shrink-0 text-rose-300/70 hover:text-rose-300"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

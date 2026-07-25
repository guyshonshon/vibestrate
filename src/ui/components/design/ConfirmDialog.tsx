import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button.js";
import { cn } from "./cn.js";
import {
  createConfirmController,
  type ConfirmController,
  type PendingKind,
} from "./confirm-controller.js";

/**
 * In-app replacement for `window.confirm` / `window.prompt`.
 *
 * The native dialogs cannot be styled, break out of the app's own surface, and
 * render in the browser's chrome rather than the product. Every one of them
 * here gates a destructive action (abort a run, delete a flow, apply or undo a
 * merge, revert a patch), so the replacement is written to FAIL CLOSED:
 *
 * - Only a click on the confirm button resolves `true`.
 * - Escape, the backdrop, the cancel button, and unmounting the provider all
 *   resolve `false`.
 * - A second request while one is open resolves the FIRST as `false` rather
 *   than dropping it, so no caller is left awaiting a promise that never
 *   settles and no consent leaks between prompts.
 * - Calling outside the provider throws instead of returning a default. A
 *   silent `true` would run a destructive action with no consent, and a silent
 *   `false` would look like the user declined - both are worse than a crash
 *   that surfaces the wiring mistake.
 */

export type ConfirmOptions = {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the confirm action in the destructive tone. */
  danger?: boolean;
};

export type PromptOptions = ConfirmOptions & {
  initial?: string;
  placeholder?: string;
  /** Reject empty input rather than resolving an empty string. */
  required?: boolean;
};

export type ConfirmApi = {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  promptText: (opts: PromptOptions) => Promise<string | null>;
};

const Ctx = createContext<ConfirmApi | null>(null);

/** The dialog API. Throws outside the provider - see the fail-closed note. */
export function useConfirm(): ConfirmApi {
  const api = useContext(Ctx);
  if (!api) {
    throw new Error(
      "useConfirm must be used inside <ConfirmProvider>. Refusing to fall back " +
        "to a default answer for a destructive action.",
    );
  }
  return api;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{ kind: PendingKind; opts: unknown } | null>(
    null,
  );
  // The settlement rules live in confirm-controller.ts (pure, unit-tested);
  // this component only renders whatever it says is current.
  const ctrl = useRef<ConfirmController | null>(null);
  if (!ctrl.current) ctrl.current = createConfirmController(setPending);

  useEffect(() => {
    const c = ctrl.current!;
    // Unmounting with a request open must not strand the awaiting caller.
    return () => c.dispose();
  }, []);

  const api = useMemo<ConfirmApi>(
    () => ({
      confirm: (opts) =>
        new Promise<boolean>((resolve) => {
          ctrl.current!.open("confirm", opts, (v) => resolve(v as boolean));
        }),
      promptText: (opts) =>
        new Promise<string | null>((resolve) => {
          ctrl.current!.open("prompt", opts, (v) => resolve(v as string | null));
        }),
    }),
    [],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      {pending ? (
        <Dialog
          kind={pending.kind}
          opts={pending.opts as ConfirmOptions & PromptOptions}
          onCancel={() => ctrl.current!.decline()}
          onAccept={(v) => ctrl.current!.accept(v)}
        />
      ) : null}
    </Ctx.Provider>
  );
}

function Dialog({
  kind,
  opts,
  onCancel,
  onAccept,
}: {
  kind: PendingKind;
  opts: ConfirmOptions & PromptOptions;
  onCancel: () => void;
  onAccept: (value: string) => void;
}) {
  const isPrompt = kind === "prompt";
  const promptOpts = isPrompt ? opts : null;
  const [draft, setDraft] = useState(promptOpts?.initial ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // A prompt focuses its field; a confirm focuses the dialog itself rather
    // than the confirm button. These gate destructive actions, so landing
    // focus on the destructive control would let a stray Enter fire it.
    if (isPrompt) inputRef.current?.focus();
    else cardRef.current?.focus();
  }, [isPrompt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  const blocked = !!(isPrompt && promptOpts?.required && !draft.trim());
  const submit = () => {
    if (blocked) return;
    onAccept(draft);
  };

  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4"
      onClick={onCancel}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={opts.title}
        tabIndex={-1}
        className="w-full max-w-[440px] rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-5 shadow-2xl shadow-black/50 focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[15px] font-bold text-chalk-100">{opts.title}</h2>
        {opts.message ? (
          <div className="mt-2 text-[12.5px] leading-[1.55] text-chalk-300">
            {opts.message}
          </div>
        ) : null}
        {isPrompt ? (
          <input
            ref={inputRef}
            value={draft}
            placeholder={promptOpts?.placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            className="mt-3 w-full rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 px-2.5 py-1.5 text-[13px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none"
          />
        ) : null}
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {opts.cancelLabel ?? "Cancel"}
          </Button>
          <Button
            variant={opts.danger ? "danger" : "primary"}
            size="sm"
            disabled={blocked}
            className={cn(blocked && "opacity-50")}
            onClick={submit}
          >
            {opts.confirmLabel ?? (isPrompt ? "Save" : "Confirm")}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

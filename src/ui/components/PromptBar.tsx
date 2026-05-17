import { useEffect, useRef, useState } from "react";

export type PromptEffort = "low" | "medium" | "high" | "";

export type PromptSubmit =
  | { kind: "run"; task: string; effort: PromptEffort; readOnly: boolean }
  | { kind: "create-task"; title: string }
  | { kind: "queue-task"; taskId: string }
  | { kind: "nav"; target: "home" | "board" | "queue" | "runs" | "settings" }
  | { kind: "help" };

type Props = {
  busy: boolean;
  onSubmit: (input: PromptSubmit) => void | Promise<void>;
};

/**
 * Always-visible "CLI-like" composer at the top of the Home page.
 * Free text dispatches as `run`. Slash commands cover the things you
 * would otherwise have to click into a different page for:
 *
 *   /run <prompt>     — spawn a run (same as plain text)
 *   /task <title>     — create a backlog task
 *   /queue <taskId>   — enqueue an existing task
 *   /board            — jump to the board
 *   /queue            — jump to the queue page
 *   /runs             — jump to the runs list
 *   /settings         — jump to settings
 *   /help             — show the inline cheatsheet
 *
 * Enter submits, Shift+Enter inserts a newline.
 */
export function PromptBar({ busy, onSubmit }: Props) {
  const [text, setText] = useState("");
  const [effort, setEffort] = useState<PromptEffort>("");
  const [readOnly, setReadOnly] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // Cmd/Ctrl+K from anywhere focuses the prompt — same affordance every
  // CLI-style chat surface has.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      if (((isMac && e.metaKey) || (!isMac && e.ctrlKey)) && e.key === "k") {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setParseError(null);
    const parsed = parsePromptInput(trimmed, { effort, readOnly });
    if (parsed.kind === "error") {
      setParseError(parsed.message);
      return;
    }
    void onSubmit(parsed);
    setText("");
    setReadOnly(false);
    setEffort("");
  }

  const previewVerb = previewVerbFor(text);

  return (
    <div className="border-b border-amaco-border bg-amaco-panel-2/60 px-6 py-3">
      <div className="flex items-start gap-3">
        <div className="flex shrink-0 items-center gap-1 pt-1.5 text-[12px] text-amaco-fg-muted">
          <span className="amaco-mono text-amaco-accent">amaco</span>
          <span className="amaco-mono">›</span>
        </div>
        <div className="flex-1">
          <textarea
            ref={ref}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (parseError) setParseError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={Math.min(6, Math.max(1, text.split("\n").length))}
            disabled={busy}
            placeholder="Type a task to run, or /help for commands  ·  Enter to submit, Shift+Enter for newline"
            className="w-full resize-none rounded border border-amaco-border bg-amaco-panel px-3 py-1.5 text-[13px] text-amaco-fg placeholder:text-amaco-fg-muted focus:border-amaco-accent focus:outline-none disabled:opacity-60"
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-amaco-fg-muted">
            <EffortSelector value={effort} onChange={setEffort} />
            <label className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={readOnly}
                onChange={(e) => setReadOnly(e.target.checked)}
                className="h-3 w-3 accent-amaco-warn"
              />
              <span>read-only</span>
            </label>
            <button
              type="button"
              onClick={() => setHelpOpen((v) => !v)}
              className="amaco-mono rounded border border-amaco-border px-1.5 text-[10.5px] hover:bg-amaco-panel"
            >
              {helpOpen ? "/help ✓" : "/help"}
            </button>
            <span className="amaco-mono text-[10.5px] opacity-70">
              {previewVerb ? `→ ${previewVerb}` : "free text → spawn run"}
            </span>
            <span className="ml-auto amaco-mono text-[10.5px] opacity-70">
              ⌘K focus · ⏎ submit
            </span>
          </div>
          {parseError ? (
            <div className="mt-1 text-[11.5px] text-amaco-fail">
              {parseError}
            </div>
          ) : null}
          {helpOpen ? <PromptHelp /> : null}
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={busy || text.trim().length === 0}
          className="shrink-0 rounded border border-amaco-accent/40 bg-amaco-accent/10 px-3 py-1.5 text-[12.5px] font-medium text-amaco-accent hover:bg-amaco-accent/20 disabled:opacity-50"
        >
          {busy ? "Running…" : "Run"}
        </button>
      </div>
    </div>
  );
}

function EffortSelector({
  value,
  onChange,
}: {
  value: PromptEffort;
  onChange: (v: PromptEffort) => void;
}) {
  const options: { v: PromptEffort; label: string }[] = [
    { v: "", label: "default" },
    { v: "low", label: "low" },
    { v: "medium", label: "med" },
    { v: "high", label: "high" },
  ];
  return (
    <span className="inline-flex items-center gap-0.5 rounded border border-amaco-border bg-amaco-panel">
      <span className="px-1.5 text-[10.5px] uppercase tracking-[0.1em] text-amaco-fg-muted">
        effort
      </span>
      {options.map((o) => (
        <button
          key={o.v || "default"}
          onClick={() => onChange(o.v)}
          className={`amaco-mono px-1.5 text-[10.5px] ${
            value === o.v
              ? "bg-amaco-accent/15 text-amaco-accent"
              : "text-amaco-fg-dim hover:bg-amaco-panel-2"
          }`}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

function PromptHelp() {
  const rows: { cmd: string; what: string }[] = [
    { cmd: "<free text>", what: "Spawn a run with this prompt as the task." },
    { cmd: "/run <prompt>", what: "Same as free text — explicit form." },
    { cmd: "/task <title>", what: "Create a backlog task (no run yet)." },
    { cmd: "/queue <taskId>", what: "Enqueue an existing task." },
    { cmd: "/board", what: "Go to the board." },
    { cmd: "/queue", what: "Go to the queue page." },
    { cmd: "/runs", what: "Go to the all-runs list." },
    { cmd: "/settings", what: "Go to settings." },
  ];
  return (
    <div className="mt-2 rounded border border-amaco-border bg-amaco-panel p-2 text-[11.5px]">
      <div className="mb-1 text-[10.5px] uppercase tracking-[0.12em] text-amaco-fg-muted">
        Slash commands
      </div>
      <table className="w-full">
        <tbody>
          {rows.map((r) => (
            <tr key={r.cmd} className="align-top">
              <td className="amaco-mono w-40 py-0.5 pr-3 text-amaco-accent">
                {r.cmd}
              </td>
              <td className="py-0.5 text-amaco-fg-dim">{r.what}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function previewVerbFor(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  if (!t.startsWith("/")) return "spawn run";
  const [cmd] = t.slice(1).split(/\s+/, 1);
  switch (cmd) {
    case "run":
      return "spawn run";
    case "task":
      return "create task";
    case "queue":
      return t.length > "/queue".length ? "queue task" : "open queue page";
    case "board":
      return "open board";
    case "runs":
      return "open all runs";
    case "settings":
      return "open settings";
    case "help":
      return "show help";
    default:
      return cmd ? `unknown: /${cmd}` : null;
  }
}

type ParsedOk = PromptSubmit;
type ParsedErr = { kind: "error"; message: string };
export type Parsed = ParsedOk | ParsedErr;

/** Pure parser — exported so it can be unit-tested. */
export function parsePromptInput(
  input: string,
  opts: { effort: PromptEffort; readOnly: boolean },
): Parsed {
  const trimmed = input.trim();
  if (!trimmed) return { kind: "error", message: "Type something first." };
  if (!trimmed.startsWith("/")) {
    return {
      kind: "run",
      task: trimmed,
      effort: opts.effort,
      readOnly: opts.readOnly,
    };
  }
  const sp = trimmed.indexOf(" ");
  const cmd = (sp === -1 ? trimmed.slice(1) : trimmed.slice(1, sp)).toLowerCase();
  const rest = sp === -1 ? "" : trimmed.slice(sp + 1).trim();
  switch (cmd) {
    case "run":
      if (!rest) return { kind: "error", message: "/run needs a prompt." };
      return {
        kind: "run",
        task: rest,
        effort: opts.effort,
        readOnly: opts.readOnly,
      };
    case "task":
      if (!rest) return { kind: "error", message: "/task needs a title." };
      return { kind: "create-task", title: rest };
    case "queue":
      if (!rest) return { kind: "nav", target: "queue" };
      return { kind: "queue-task", taskId: rest };
    case "board":
      return { kind: "nav", target: "board" };
    case "runs":
      return { kind: "nav", target: "runs" };
    case "home":
      return { kind: "nav", target: "home" };
    case "settings":
      return { kind: "nav", target: "settings" };
    case "help":
      return { kind: "help" };
    default:
      return { kind: "error", message: `Unknown command: /${cmd}` };
  }
}

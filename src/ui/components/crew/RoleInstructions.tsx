// The one Role instructions surface, shared by the Crew page's role cards and
// the Crew editor.
//
// A role file is JSON on disk - {schemaVersion, id, prompt} - but `prompt` is
// the only field a person reads or writes, and showing the envelope around it
// buried that text behind escaped newlines. So the envelope becomes labels, the
// prompt becomes set text at a reading measure, and the literal file stays one
// segment away for when the bytes are what you need.

import { useMemo, useState, type ReactNode } from "react";
import { Copy, ExternalLink, FileJson, PenLine } from "lucide-react";
import { api } from "../../lib/api.js";
import { describeError } from "../../lib/error-view.js";
import { Button } from "../design/Button.js";
import { ErrorState } from "../design/ErrorState.js";
import { SegmentedControl } from "../design/SegmentedControl.js";
import { StatTile } from "../design/StatTile.js";
import { cn } from "../design/cn.js";
import {
  MAX_PROMPT_CHARS,
  ROLE_FILE_SCHEMA_VERSION,
  roleFileJson,
} from "./crew-editor-model.js";

export type RoleInstructionsMode = "read" | "edit" | "file";

const MODES: { value: RoleInstructionsMode; label: string }[] = [
  { value: "read", label: "Read" },
  { value: "edit", label: "Edit" },
  { value: "file", label: "Role file" },
];

/** One inset body for all three modes, so switching mode does not move the
 *  surface around. The border COLOUR is separate because the over-cap state
 *  swaps it: cn() is clsx, not tailwind-merge, so two border-colour classes on
 *  one element both ship and the winner is whichever Tailwind emitted last. */
const BODY_SURFACE = "w-full rounded-[12px] border bg-coal-800 px-3 py-2.5";
const BODY_BORDER = "border-[color:var(--line-strong)]";

/** The two read-only modes cap their height and scroll. Against the shared
 *  surface the cut lands on a real edge, where a bare max-height sheared the
 *  last line off in mid-air. The textarea is left uncapped so `resize-y` still
 *  means something. */
const BODY_PANEL = `${BODY_SURFACE} ${BODY_BORDER} max-h-[360px]`;

/** The role file is named after the role it defines and the loader refuses a
 *  file whose `id` disagrees with its basename, so the path is the authority on
 *  what the file's `id` says. */
function roleFileId(promptPath: string, fallback: string): string {
  const base = promptPath
    .replace(/^.*[\\/]/, "")
    .replace(/\.json$/, "")
    .trim();
  return base || fallback;
}

// ─── prompt as set text ─────────────────────────────────────────────────────

/** `marker` is the number the author wrote, not a position: a list broken in two
 *  by a nested block would otherwise restart at 1, which silently renumbers the
 *  owner's own instructions. `depth` comes from the source indent. */
type ListItem = { text: string; marker: string | null; depth: number };

type PromptBlock =
  | { kind: "heading"; text: string; level: number }
  | { kind: "list"; items: ListItem[]; ordered: boolean }
  | { kind: "code"; text: string }
  | { kind: "para"; text: string };

const MAX_LIST_DEPTH = 2;

/** Written out rather than computed so Tailwind's scanner emits the classes. */
const INDENT = ["", "pl-4", "pl-8"] as const;

function indentDepth(ws: string): number {
  return Math.min(MAX_LIST_DEPTH, Math.floor(ws.replace(/\t/g, "  ").length / 2));
}

/**
 * A deliberately small structural pass over prompt text: headings, bullet and
 * numbered lists, fenced code, everything else a paragraph. Not a Markdown
 * implementation - a role prompt is prose an owner typed, and the goal is that
 * its existing shape survives into the page instead of collapsing into one grey
 * block. Anything unrecognised falls through as a paragraph, so no input can
 * lose text here.
 */
export function parsePromptBlocks(text: string): PromptBlock[] {
  const blocks: PromptBlock[] = [];
  let para: string[] = [];
  let list: { items: ListItem[]; ordered: boolean } | null = null;
  let fence: string[] | null = null;

  const flushPara = () => {
    if (para.length > 0) {
      blocks.push({ kind: "para", text: para.join("\n") });
      para = [];
    }
  };
  const flushList = () => {
    if (list !== null) {
      blocks.push({ kind: "list", items: list.items, ordered: list.ordered });
      list = null;
    }
  };
  const flush = () => {
    flushPara();
    flushList();
  };

  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    if (fence !== null) {
      if (/^\s*```/.test(line)) {
        blocks.push({ kind: "code", text: fence.join("\n") });
        fence = null;
      } else {
        fence.push(line);
      }
      continue;
    }
    if (/^\s*```/.test(line)) {
      flush();
      fence = [];
      continue;
    }
    if (line.trim() === "") {
      flush();
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading?.[1] !== undefined && heading[2] !== undefined) {
      flush();
      blocks.push({
        kind: "heading",
        level: heading[1].length,
        text: heading[2].trim(),
      });
      continue;
    }
    const bullet = /^(\s*)[-*•]\s+(.+)$/.exec(line);
    if (bullet?.[1] !== undefined && bullet[2] !== undefined) {
      flushPara();
      if (list === null || list.ordered) {
        flushList();
        list = { items: [], ordered: false };
      }
      list.items.push({
        text: bullet[2],
        marker: null,
        depth: indentDepth(bullet[1]),
      });
      continue;
    }
    const ordered = /^(\s*)(\d+)[.)]\s+(.+)$/.exec(line);
    if (
      ordered?.[1] !== undefined &&
      ordered[2] !== undefined &&
      ordered[3] !== undefined
    ) {
      flushPara();
      if (list === null || !list.ordered) {
        flushList();
        list = { items: [], ordered: true };
      }
      list.items.push({
        text: ordered[3],
        marker: ordered[2],
        depth: indentDepth(ordered[1]),
      });
      continue;
    }
    flushList();
    para.push(line);
  }
  // An unterminated fence still renders as code - dropping it would silently
  // delete the tail of the prompt from the page.
  if (fence !== null && fence.length > 0) {
    blocks.push({ kind: "code", text: fence.join("\n") });
  }
  flush();
  return blocks;
}

/** Backticked spans and `**bold**`, which is what role prompts actually use to
 *  name a tool or press a rule. Everything else stays literal. */
function inlineSpans(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      out.push(
        <code
          key={key++}
          className="mono rounded-[6px] bg-coal-800 px-1 py-0.5 text-[12px] text-violet-soft"
        >
          {m[1]}
        </code>,
      );
    } else if (m[2] !== undefined) {
      out.push(
        <strong key={key++} className="font-semibold text-chalk-100">
          {m[2]}
        </strong>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function PromptProse({ text }: { text: string }) {
  const blocks = useMemo(() => parsePromptBlocks(text), [text]);
  return (
    // A reading measure, not the card's width: a prompt set to the full page ran
    // ~180 characters a line, which is the one thing on this surface a person
    // actually reads end to end.
    <div className="max-w-[72ch] space-y-2.5">
      {blocks.map((b, i) => {
        if (b.kind === "heading") {
          return (
            <div
              key={i}
              className={cn(
                "font-semibold text-chalk-100",
                b.level <= 2 ? "text-[14px]" : "text-[13px]",
              )}
            >
              {inlineSpans(b.text)}
            </div>
          );
        }
        if (b.kind === "code") {
          return (
            <pre
              key={i}
              className="mono overflow-x-auto rounded-[10px] border border-[color:var(--line)] bg-coal-800 px-3 py-2 text-[12px] leading-[1.55] text-chalk-200"
            >
              {b.text}
            </pre>
          );
        }
        if (b.kind === "list") {
          return (
            <ul key={i} className="space-y-1">
              {b.items.map((item, j) => (
                <li
                  key={j}
                  className={cn(
                    "flex gap-2 text-[13px] leading-[1.6] text-chalk-200",
                    INDENT[item.depth],
                  )}
                >
                  {item.marker !== null ? (
                    <span className="num-tabular shrink-0 font-semibold text-violet-soft">
                      {item.marker}.
                    </span>
                  ) : (
                    <span className="mt-[8px] h-1 w-1 shrink-0 rounded-full bg-violet-soft" />
                  )}
                  <span className="min-w-0">{inlineSpans(item.text)}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p
            key={i}
            className="whitespace-pre-wrap text-[13px] leading-[1.65] text-chalk-200"
          >
            {inlineSpans(b.text)}
          </p>
        );
      })}
    </div>
  );
}

// ─── the file path, as a control ────────────────────────────────────────────

type PathFailure = { title: string; detail?: string; hint?: string };

/**
 * Where the instructions live, and a way to get there. Clicking hands the path
 * to the configured editor through the same `/api/editor/open` route the file
 * viewer and the diff rows use, so the path guard and the audit entry are the
 * ones already in place. Copying is the fallback the failure offers, because
 * editor handoff is off until an owner sets a command and a dead link that only
 * reports that is not a way forward.
 */
function RoleFilePathRow({ path, disabled }: { path: string; disabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [failure, setFailure] = useState<PathFailure | null>(null);

  const cut = path.lastIndexOf("/");
  const dir = cut === -1 ? "" : path.slice(0, cut + 1);
  const name = cut === -1 ? path : path.slice(cut + 1);

  async function open() {
    setBusy(true);
    setNote(null);
    setFailure(null);
    try {
      const r = await api.openInEditor({ path });
      if (r.ok) {
        setNote(`Opened in ${r.command ?? "your editor"}.`);
      } else {
        setFailure({
          title: "Your editor did not open this file",
          detail: r.message,
          hint: "The command ran and exited without opening it. Run vibe editor set <command> to point the handoff somewhere else.",
        });
      }
    } catch (err) {
      const d = describeError(err);
      setFailure({ title: d.title, detail: d.detail, hint: d.hint });
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(path);
      setFailure(null);
      setNote("Path copied.");
    } catch {
      setFailure({
        title: "This browser blocked the clipboard",
        hint: "The path is written out above, so it can be copied by hand.",
      });
    }
  }

  return (
    <div>
      <Button
        variant="secondary"
        size="sm"
        disabled={busy || disabled}
        onClick={() => void open()}
        title={`Open ${path} in your editor`}
        className="w-full"
        iconLeft={
          <FileJson
            className="h-3.5 w-3.5 shrink-0 text-violet-soft"
            strokeWidth={1.9}
            aria-hidden
          />
        }
        iconRight={
          <ExternalLink
            className="h-3.5 w-3.5 shrink-0 text-chalk-300"
            strokeWidth={1.9}
            aria-hidden
          />
        }
      >
        {/* The middle span carries the width so the icons sit at the two edges.
            Button's own `justify-center` cannot be overridden from className -
            cn() is clsx, not tailwind-merge, so both classes would ship. */}
        <span className="mono flex w-full min-w-0 items-baseline text-left">
          <span className="truncate text-chalk-300">{dir}</span>
          <span className="shrink-0 text-chalk-100">{name}</span>
        </span>
      </Button>
      {note !== null ? (
        <p className="mt-1.5 text-meta text-chalk-300">{note}</p>
      ) : null}
      {failure !== null ? (
        <ErrorState
          compact
          className="mt-2"
          title={failure.title}
          detail={failure.detail}
          hint={failure.hint}
          actions={[
            { label: "Copy path", onClick: () => void copy(), variant: "primary" },
            { label: "Try again", onClick: () => void open(), variant: "secondary" },
          ]}
        />
      ) : null}
    </div>
  );
}

// ─── the surface ────────────────────────────────────────────────────────────

export function RoleInstructions({
  roleId,
  promptPath,
  value,
  onChange,
  disabled = false,
  defaultMode = "read",
  loadError = null,
  onRetryLoad,
  action,
  rows = 12,
}: {
  /** The role's config key, used only when the path cannot name the file. */
  roleId: string;
  /** Project-relative path of the JSON role file. */
  promptPath: string;
  /** The prompt text - the file's `prompt` field, never the whole envelope. */
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  defaultMode?: RoleInstructionsMode;
  /** Set when the role file could not be read or parsed. */
  loadError?: string | null;
  onRetryLoad?: () => void;
  /** The host's save control. Sits alone in the footer so it reads as the
   *  surface's primary action. */
  action?: ReactNode;
  rows?: number;
}) {
  const [mode, setMode] = useState<RoleInstructionsMode>(defaultMode);
  const [copiedFile, setCopiedFile] = useState(false);
  const fileId = roleFileId(promptPath, roleId);
  const overCap = value.length > MAX_PROMPT_CHARS;
  const empty = value.trim() === "";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-violet-vivid">
          Instructions
        </span>
        <SegmentedControl
          options={MODES}
          value={mode}
          onChange={(v) => setMode(v)}
        />
      </div>

      {/* The envelope's two fields, as facts rather than syntax. schemaVersion
          is the schema literal because the read route parses every role file
          through it: a file carrying any other version fails with a 422 and
          never reaches this component. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <StatTile value={fileId} label="id" />
        <StatTile value={ROLE_FILE_SCHEMA_VERSION} label="schema" />
        <StatTile
          value={value.length.toLocaleString()}
          label={overCap ? `over ${MAX_PROMPT_CHARS.toLocaleString()}` : "characters"}
          tone={overCap ? "rose" : "default"}
        />
      </div>

      <div className="mt-2">
        <RoleFilePathRow path={promptPath} disabled={disabled} />
      </div>

      {loadError !== null ? (
        <ErrorState
          compact
          className="mt-2.5"
          title="This role's file could not be read"
          detail={loadError}
          hint="Write the instructions here and save. That rewrites the file through the same check the loader uses."
          actions={[
            { label: "Write instructions", onClick: () => setMode("edit"), variant: "primary" },
            ...(onRetryLoad
              ? [{ label: "Read it again", onClick: onRetryLoad, variant: "secondary" as const }]
              : []),
          ]}
        />
      ) : null}

      <div className="mt-2.5">
        {mode === "edit" ? (
          <textarea
            value={value}
            disabled={disabled}
            spellCheck={false}
            rows={rows}
            placeholder="You review a diff against the plan it claims to implement. You name what is wrong and where, and you do not edit files."
            onChange={(e) => onChange(e.target.value)}
            className={cn(
              BODY_SURFACE,
              overCap ? "border-rose-400/50" : BODY_BORDER,
              "mono resize-y text-[12px] leading-[1.6] text-chalk-100 outline-none placeholder:text-chalk-300/60 focus:border-violet-soft/50",
            )}
          />
        ) : mode === "file" ? (
          <div>
            {/* Wrapped, not scrolled sideways: JSON.stringify puts the whole
                prompt on one line, which measured 20,779px for a 2.8k prompt.
                The copy button still yields the exact bytes. */}
            <pre
              className={cn(
                BODY_PANEL,
                "mono overflow-y-auto whitespace-pre-wrap break-words text-[12px] leading-[1.55] text-chalk-200",
              )}
            >
              {roleFileJson(fileId, value)}
            </pre>
            <div className="mt-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  // Safe to degrade silently: the bytes stay on screen to
                  // select by hand, and nothing here asserts a copy happened.
                  void navigator.clipboard
                    .writeText(roleFileJson(fileId, value))
                    .then(() => setCopiedFile(true))
                    .catch(() => {});
                }}
                iconLeft={<Copy className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden />}
              >
                {copiedFile ? "Copied" : "Copy the file"}
              </Button>
            </div>
          </div>
        ) : empty ? (
          // A file that failed to load is also empty here, and the error above
          // already carries the same "write it" fork - so only the genuinely
          // blank file gets this one.
          loadError !== null ? null : (
            <div className="rounded-[12px] border border-[color:var(--line)] bg-coal-800/60 px-4 py-6 text-center">
              <p className="text-[13px] text-chalk-300">
                This role works from an empty file.
              </p>
              <div className="mt-3 flex justify-center">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={disabled}
                  onClick={() => setMode("edit")}
                  iconLeft={<PenLine className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
                >
                  Write its instructions
                </Button>
              </div>
            </div>
          )
        ) : (
          <div className={cn(BODY_PANEL, "overflow-y-auto")}>
            <PromptProse text={value} />
          </div>
        )}
      </div>

      {action ? <div className="mt-3 flex justify-end">{action}</div> : null}
    </div>
  );
}

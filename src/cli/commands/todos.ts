// `vibe todos` - review the TODO markers `vibe learn` harvested and promote the
// real ones onto the Board.
//
// UI/CLI parity: everything the TODO surface in the dashboard can do is here
// too. Nothing is ever created without an explicit selection.
//
// Fingerprints are the handle rather than titles: they are short, unambiguous,
// and TAB-completable, where a title containing spaces is neither.

import { Command } from "commander";
import { detectProject } from "../../project/project-detector.js";
import {
  TodoPromoteService,
  TodoPromoteError,
  type TodoOverview,
  type TodoView,
} from "../../roadmap/todo-promote-service.js";
import { tabCompleteInput } from "../ui/tab-complete-input.js";
import { color, header, indent, symbol } from "../ui/format.js";

type Priority = "low" | "medium" | "high";

function isPriority(v: string): v is Priority {
  return v === "low" || v === "medium" || v === "high";
}

async function overviewFor(): Promise<{ root: string; view: TodoOverview }> {
  const { projectRoot } = await detectProject(process.cwd());
  const view = await new TodoPromoteService(projectRoot).overview();
  return { root: projectRoot, view };
}

function short(fingerprint: string): string {
  return fingerprint.slice(0, 8);
}

function printItem(item: TodoView): void {
  const marker = color.bold(item.marker);
  console.log(
    indent(
      `${color.dim(short(item.fingerprint))}  ${marker}  ${item.suggestedTitle}`,
    ),
  );
  console.log(indent(color.dim(`      ${item.path}:${item.line}`)));
}

/**
 * Resolve a user-supplied fingerprint prefix to exactly one full fingerprint.
 *
 * Fails closed on ambiguity: two candidates sharing a prefix is an error, never
 * a silent pick, because promoting the wrong card is invisible until later.
 */
export function resolveFingerprint(
  input: string,
  candidates: string[],
): { ok: true; fingerprint: string } | { ok: false; error: string } {
  const exact = candidates.find((c) => c === input);
  if (exact) return { ok: true, fingerprint: exact };
  const matches = candidates.filter((c) => c.startsWith(input));
  if (matches.length === 1) return { ok: true, fingerprint: matches[0]! };
  if (matches.length === 0) {
    return { ok: false, error: `No TODO matches "${input}".` };
  }
  return {
    ok: false,
    error: `"${input}" is ambiguous (${matches.map(short).join(", ")}). Use more characters.`,
  };
}

/** Prompt with TAB completion when the command was given no fingerprints. */
async function promptForFingerprint(
  items: TodoView[],
  message: string,
): Promise<string[]> {
  if (items.length === 0) return [];
  const picked = await tabCompleteInput({
    message,
    candidates: items.map((t) => ({
      value: short(t.fingerprint),
      hint: `${t.marker}  ${t.suggestedTitle}`,
    })),
  });
  return [picked];
}

function printOverview(view: TodoOverview, showAll: boolean): void {
  if (!view.present) {
    console.log("No TODO scan yet.");
    console.log(
      indent(`${symbol.arrow()} Scan the codebase: ${color.bold("vibe learn")}`),
    );
    return;
  }
  if (view.stale) {
    console.log(color.dim("(scanned at an older commit - run `vibe learn` to refresh)"));
  }

  const promotable = view.items.filter((t) => t.state === "promotable" && !t.lowSignal);
  console.log(
    header(
      `TODOs: ${view.counts.promotable} to review, ${view.counts.onBoard} on the board, ${view.counts.dismissed} dismissed`,
    ),
  );

  if (promotable.length === 0) {
    console.log("");
    console.log(
      view.counts.onBoard + view.counts.dismissed > 0
        ? "Everything worth reviewing has been handled."
        : "Nothing above the substance bar. Markers like `// TODO: fix` are counted but not offered.",
    );
  } else {
    // Grouped by area: a flat list of 60 rows is the chore this replaces.
    const byArea = new Map<string, TodoView[]>();
    for (const item of promotable) {
      byArea.set(item.area, [...(byArea.get(item.area) ?? []), item]);
    }
    for (const [area, items] of [...byArea.entries()].sort()) {
      console.log("");
      console.log(color.bold(area));
      for (const item of items) printItem(item);
    }
  }

  if (showAll) {
    for (const state of ["on_board", "dismissed"] as const) {
      const items = view.items.filter((t) => t.state === state);
      if (items.length === 0) continue;
      console.log("");
      console.log(color.bold(state === "on_board" ? "On the board" : "Dismissed"));
      for (const item of items) printItem(item);
    }
  }

  for (const note of view.notes) {
    console.log("");
    console.log(indent(`${symbol.warn()} ${note}`));
  }

  if (promotable.length > 0) {
    console.log("");
    console.log(
      indent(
        `${symbol.arrow()} Promote: ${color.bold("vibe todos promote <fingerprint>")} (TAB completes)`,
      ),
    );
  }
}

export function buildTodosCommand(): Command {
  const cmd = new Command("todos").description(
    "Review the TODO markers `vibe learn` found in your code, and promote the real ones onto the Board.",
  );

  cmd
    .option("--all", "also list the ones already on the board and the dismissed ones")
    .option("--json", "emit JSON")
    .action(async (opts: { all?: boolean; json?: boolean }) => {
      const { view } = await overviewFor();
      if (opts.json) {
        console.log(JSON.stringify(view, null, 2));
        return;
      }
      printOverview(view, Boolean(opts.all));
    });

  cmd
    .command("promote [fingerprints...]")
    .description(
      "Promote harvested TODOs onto the Board. Omit the fingerprint to pick one with TAB.",
    )
    .option("--title <title>", "override the card title (single selection only)")
    .option("--priority <priority>", "override the card priority: low | medium | high")
    .option("--json", "emit JSON")
    .action(
      async (
        fingerprints: string[],
        opts: { title?: string; priority?: string; json?: boolean },
      ) => {
        process.exit(await cmdPromote(fingerprints, opts));
      },
    );

  cmd
    .command("dismiss [fingerprints...]")
    .description(
      "Set TODOs aside so later scans stop offering them. Reversible with `undismiss`.",
    )
    .action(async (fingerprints: string[]) => {
      process.exit(await cmdDismissal(fingerprints, "dismiss"));
    });

  cmd
    .command("undismiss [fingerprints...]")
    .description("Bring dismissed TODOs back into the review list.")
    .action(async (fingerprints: string[]) => {
      process.exit(await cmdDismissal(fingerprints, "undismiss"));
    });

  return cmd;
}

async function cmdPromote(
  fingerprints: string[],
  opts: { title?: string; priority?: string; json?: boolean },
): Promise<number> {
  const { root, view } = await overviewFor();
  if (!view.present) {
    console.error(
      `${symbol.fail()} No TODO scan yet. Run ${color.bold("vibe learn")} first.`,
    );
    return 1;
  }

  if (opts.priority && !isPriority(opts.priority)) {
    console.error(
      `${symbol.fail()} --priority must be low, medium, or high (got "${opts.priority}").`,
    );
    return 1;
  }

  const promotable = view.items.filter((t) => t.state === "promotable" && !t.lowSignal);
  let requested = fingerprints;
  if (requested.length === 0) {
    if (promotable.length === 0) {
      console.log("Nothing left to promote.");
      return 0;
    }
    requested = await promptForFingerprint(promotable, "Promote which TODO?");
  }

  if (opts.title && requested.length !== 1) {
    console.error(
      `${symbol.fail()} --title applies to a single TODO; ${requested.length} were selected.`,
    );
    return 1;
  }

  const candidates = promotable.map((t) => t.fingerprint);
  const selections: Array<{
    fingerprint: string;
    overrides?: { title?: string; priority?: Priority };
  }> = [];
  for (const raw of requested) {
    const resolved = resolveFingerprint(raw, candidates);
    if (!resolved.ok) {
      // "No match" is misleading when the TODO exists but is not promotable.
      // Say which, so the next command is obvious instead of a guess.
      const known = resolveFingerprint(
        raw,
        view.items.map((t) => t.fingerprint),
      );
      if (known.ok) {
        const item = view.items.find((t) => t.fingerprint === known.fingerprint)!;
        const why =
          item.state === "on_board"
            ? `is already on the board${item.taskId ? ` as ${item.taskId}` : ""}`
            : item.state === "dismissed"
              ? "was dismissed - bring it back with `vibe todos undismiss`"
              : "is too vague to promote";
        console.error(`${symbol.fail()} That TODO ${why}.`);
        return 1;
      }
      console.error(`${symbol.fail()} ${resolved.error}`);
      return 1;
    }
    selections.push({
      fingerprint: resolved.fingerprint,
      overrides:
        opts.title || opts.priority
          ? {
              ...(opts.title ? { title: opts.title } : {}),
              ...(opts.priority && isPriority(opts.priority)
                ? { priority: opts.priority }
                : {}),
            }
          : undefined,
    });
  }

  try {
    const result = await new TodoPromoteService(root).promote({ selections });
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return result.failed.length > 0 ? 1 : 0;
    }
    for (const p of result.promoted) {
      console.log(`${symbol.ok()} ${color.bold(p.title)} ${color.dim(`(${p.taskId})`)}`);
    }
    for (const s of result.skipped) {
      console.log(`${symbol.warn()} ${short(s.fingerprint)} skipped: ${s.reason}`);
    }
    for (const f of result.failed) {
      console.error(`${symbol.fail()} ${short(f.fingerprint)} failed: ${f.reason}`);
    }
    if (result.promoted.length > 0) {
      console.log("");
      console.log(indent(`${symbol.arrow()} See them: ${color.bold("vibe tasks list")}`));
    }
    return result.failed.length > 0 ? 1 : 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${err instanceof TodoPromoteError || err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}

async function cmdDismissal(
  fingerprints: string[],
  mode: "dismiss" | "undismiss",
): Promise<number> {
  const { root, view } = await overviewFor();
  if (!view.present) {
    console.error(
      `${symbol.fail()} No TODO scan yet. Run ${color.bold("vibe learn")} first.`,
    );
    return 1;
  }

  const pool = view.items.filter((t) =>
    mode === "dismiss"
      ? t.state === "promotable" && !t.lowSignal
      : t.state === "dismissed",
  );
  let requested = fingerprints;
  if (requested.length === 0) {
    if (pool.length === 0) {
      console.log(mode === "dismiss" ? "Nothing to dismiss." : "Nothing is dismissed.");
      return 0;
    }
    requested = await promptForFingerprint(
      pool,
      mode === "dismiss" ? "Dismiss which TODO?" : "Bring back which TODO?",
    );
  }

  const candidates = pool.map((t) => t.fingerprint);
  const resolved: string[] = [];
  for (const raw of requested) {
    const r = resolveFingerprint(raw, candidates);
    if (!r.ok) {
      console.error(`${symbol.fail()} ${r.error}`);
      return 1;
    }
    resolved.push(r.fingerprint);
  }

  try {
    const service = new TodoPromoteService(root);
    if (mode === "dismiss") await service.dismiss(resolved);
    else await service.undismiss(resolved);
    console.log(
      `${symbol.ok()} ${resolved.length} TODO${resolved.length === 1 ? "" : "s"} ${
        mode === "dismiss" ? "dismissed" : "brought back"
      }.`,
    );
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}

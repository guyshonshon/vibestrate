import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";

/**
 * Suspend the panel, drop the user into `$EDITOR` on a temp file
 * pre-seeded with `initial`, wait for the editor to exit, then read
 * the buffer back. Used by the task-form to edit long descriptions.
 *
 * The temp file is best-effort cleaned up on exit. We never pass the
 * user-supplied string through a shell — argv only, with a sane
 * fallback to `nano` then `vi`.
 */
export async function editInEditor(initial: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-form-"));
  const file = path.join(dir, "description.md");
  await fs.writeFile(file, initial, "utf8");

  const editor = process.env.VISUAL || process.env.EDITOR || "nano";
  // EDITOR can hold args ("code -w"), so split on whitespace and pass
  // as argv. No shell expansion. Most editors accept a single file
  // path as the last arg.
  const [cmd, ...args] = editor.split(/\s+/).filter(Boolean);
  if (!cmd) {
    await fs.rm(dir, { recursive: true, force: true });
    return initial;
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, [...args, file], {
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", () => resolve());
  });

  let content = initial;
  try {
    content = await fs.readFile(file, "utf8");
  } catch {
    // fall through with the original buffer
  }
  await fs.rm(dir, { recursive: true, force: true });
  return content;
}

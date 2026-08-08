import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * What a supply-chain scanner sees when this package is published.
 *
 * A CLI that spawns local binaries and reads files by path trips the same
 * heuristics a credential stealer does, so the difference has to be structural
 * and checkable rather than a matter of reading the code and trusting it. Each
 * assertion below is one of the signals scanners actually key on.
 *
 * This is a publish-surface guard, not a proof of safety. It cannot tell you the
 * code is benign; it tells you the shapes that make a package look - and be -
 * dangerous are absent, and that adding one has to be deliberate.
 */

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
  files: string[];
};

describe("what the registry would receive", () => {
  /**
   * The single loudest signal. An install lifecycle script runs on every
   * consumer's machine, unprompted, with their credentials in scope - which is
   * why it is the delivery vehicle for nearly every npm supply-chain attack.
   * `prepublishOnly` is fine: it runs on the publisher's machine, not theirs.
   */
  it("runs no code on install", () => {
    const forbidden = ["preinstall", "install", "postinstall", "prepare"];
    const present = forbidden.filter((s) => s in pkg.scripts);
    expect(present, "an install-time script executes on every consumer").toEqual([]);
  });

  /**
   * A published CLI has no business shipping a `src/` path. It used to: the
   * role prompts and a stray `ui/lib/types.ts` sat under `src/` inside a
   * package containing no source, so `node_modules/vibestrate/src/...` looked
   * like a packaging accident and invited imports that were never supported.
   */
  it("ships no source path", () => {
    expect(pkg.files.filter((f) => f.startsWith("src/"))).toEqual([]);
  });

  it("ships no secret-shaped path", () => {
    const bad = /(^|\/)\.env|\.pem$|\.key$|id_rsa|(^|\/)\.npmrc|secret|credential/i;
    expect(pkg.files.filter((f) => bad.test(f))).toEqual([]);
  });

  /**
   * A closed allow-list of environment variables. The point is not that reading
   * env is wrong - it is that a NEW read should be a decision someone made on
   * purpose, not a line that arrived with a feature. Anything outside its own
   * namespace or the standard terminal conventions has to be added here first.
   */
  it("reads only environment variables it declares", () => {
    const ALLOWED = new Set([
      // Its own.
      "VIBESTRATE_API_TOKEN",
      "VIBESTRATE_PARENT_PID",
      "VIBESTRATE_UI_URL",
      "VIBESTRATE_WORKSPACE_FILE",
      // Standard terminal conventions.
      "EDITOR",
      "VISUAL",
      "SHELL",
      "NO_COLOR",
      // User-configured outbound webhook, set by the user, used only when set.
      "SLACK_WEBHOOK_URL",
      // A placeholder in help text, not a read.
      "VAR_NAME",
    ]);
    const found = new Set<string>();
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(e.name)) {
          const text = readFileSync(full, "utf8");
          for (const m of text.matchAll(
            /process\.env(?:\.([A-Za-z_][A-Za-z0-9_]*)|\["([^"]+)"\])/g,
          )) {
            const name = m[1] ?? m[2];
            if (name) found.add(name);
          }
        }
      }
    };
    walk(path.join(ROOT, "src"));
    const undeclared = [...found].filter((n) => !ALLOWED.has(n)).sort();
    expect(
      undeclared,
      "add it to the allow-list above, with a note on why it is read",
    ).toEqual([]);
  });

  /**
   * The installer is the one script users are told to pipe into a shell, so it
   * must not itself fetch and run anything. It may only check the runtime and
   * hand off to a package manager.
   */
  it("has an installer that fetches no code", () => {
    const sh = readFileSync(path.join(ROOT, "install.sh"), "utf8")
      .split("\n")
      .filter((l) => !l.trim().startsWith("#"))
      .join("\n");
    expect(sh, "installer must not pipe a download into a shell").not.toMatch(
      /\b(curl|wget)\b[^\n|]*\|\s*(ba|z|fi)?sh/,
    );
    expect(sh, "installer must not eval").not.toMatch(/\beval\b/);
  });
});

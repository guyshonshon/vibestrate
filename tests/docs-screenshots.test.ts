import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The docs ship 4K screenshots of the dashboard. A screenshot is a claim: "the
 * UI shows these words". Prose has gates - the handbook corpus is recompiled and
 * diffed, and check:cli refuses an invented command - but nothing notices when a
 * button is renamed and a picture keeps showing the old label. That kind of rot
 * is invisible until a reader hits it, and a confident wrong picture is worse
 * than confident wrong prose because nobody thinks to doubt it.
 *
 * `docs/screenshots.json` records, per screenshot, the labels it depicts AND the
 * components that render them. Each label is asserted against that shot's own
 * sources, never the whole tree: a repo-wide sweep gated nothing, because
 * "Block" matched 86 files and "Advise" resolved against ConsultPage while the
 * policies screenshot's caption contradicted the picture. Scoping is what turns
 * this from a green light into a check.
 *
 * Deliberately NOT a file-hash or mtime check. mtime is meaningless after a git
 * checkout, and hashing the depicted components fails on padding tweaks that
 * change nothing a reader would see - a gate that cries wolf gets bypassed. The
 * label is the part a screenshot actually promises.
 *
 * The PNGs live in the marketing repo (it serves the docs site), so this checks
 * the claim, not the pixels.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const uiRoot = join(repoRoot, "src", "ui");

type Manifest = {
  shots: Record<string, { asset: string; sources: string[]; labels: string[] }>;
};

const manifest = JSON.parse(
  readFileSync(join(repoRoot, "docs", "screenshots.json"), "utf8"),
) as Manifest;

/** Every UI source file, read once - the label scan is a substring sweep. */
function uiSources(dir = uiRoot): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...uiSources(full));
    else if ([".ts", ".tsx"].includes(extname(entry))) out.push(full);
  }
  return out;
}

const sources = uiSources().map((path) => ({
  // Normalised to `/`: `join` yields backslashes on Windows, while the
  // manifest's `sources` prefixes are POSIX. Without this `startsWith` matched
  // nothing there, every scoped shot saw an empty scope, and the Windows CI leg
  // failed on all 19 of them while macOS and Linux stayed green.
  rel: path.slice(uiRoot.length + 1).split(sep).join("/"),
  text: readFileSync(path, "utf8"),
}));

/** The files one shot depicts, by path prefix - see `sources` in the manifest. */
function scopeFor(prefixes: string[]) {
  return sources.filter((f) => prefixes.some((prefix) => f.rel.startsWith(prefix)));
}

describe("docs screenshots", () => {
  const shots = Object.entries(manifest.shots);

  it("describes at least one screenshot", () => {
    expect(shots.length).toBeGreaterThan(0);
  });

  it.each(shots)("%s still shows the labels it claims", (name, shot) => {
    expect(shot.labels.length).toBeGreaterThan(0);
    const scope = scopeFor(shot.sources);
    expect(scope.length, `${name} names sources that match no file under src/ui`).toBeGreaterThan(0);
    const missing = shot.labels.filter((label) => !scope.some((f) => f.text.includes(label)));
    expect(
      missing,
      `${shot.asset} shows ${missing.map((m) => `"${m}"`).join(", ")}, but none of the ` +
        `components it depicts (${shot.sources.join(", ")}) contain that text any more. ` +
        `Either the UI was renamed and the screenshot is now lying to readers - re-capture ` +
        `it with demo/rec/docs-shots.mjs in the vibestrate-marketing repo - or the label ` +
        `moved to another component and docs/screenshots.json needs updating to match.`,
    ).toEqual([]);
  });
});

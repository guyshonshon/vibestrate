import { describe, it, expect } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

/**
 * Design-law guardrail.
 *
 * The design primitives contract names a hard-no list, and a legacy sweep
 * cleared it out of `src/ui`. Prose does not keep it cleared - every one of
 * these came back at least once while the sweep was still running, reintroduced
 * by hand in a file nobody thought to re-check. This test is the thing that
 * fails the build instead, named after the invariant it defends.
 *
 * Adding a pattern here is only legitimate once the count is already zero.
 * A category that still has known survivors belongs in the sweep inventory,
 * not here - a failing guardrail teaches people to skip it.
 */

const UI_ROOT = path.join(process.cwd(), "src", "ui");

async function tsxFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await tsxFiles(full)));
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** Every banned pattern, with the reason a reader needs to fix it properly. */
const BANNED: Array<{ name: string; re: RegExp; why: string }> = [
  {
    name: "retired token generation",
    re: /\b(?:text|bg|border)-(?:fog|ink)-\d|vibestrate-(?:fg|fail|mono)/,
    why: "fog-*/ink-*/vibestrate-* are the pre-coal/chalk generation. Use coal-*/chalk-*/violet-* (see src/ui/index.css).",
  },
  {
    name: "undefined chalk-500",
    re: /chalk-500/,
    why: "Only chalk-100/200/300/400 are defined; chalk-500 silently renders as inherited colour.",
  },
  {
    name: "orphaned --s-* scene variable",
    re: /var\(--s-(?:ink|accent|danger|ok|soft|warn|glass|fg-muted|mono)/,
    why: "These resolve only under [data-scene], which nothing sets - they render as no colour at all.",
  },
  {
    name: "var(--popover)",
    re: /var\(--popover\)/,
    why: "Not a token in this system. Popover surfaces use bg-coal-700.",
  },
  {
    name: "animate-pulse",
    re: /animate-pulse/,
    why: "The one banned animation - no pulsing or breathing. Use a static skeleton or the Loader2 spinner idiom.",
  },
  {
    name: "white-alpha hairline or fill",
    re: /(?:border|bg|ring|divide)-white\//,
    why: "White-alpha does not invert for the light theme - it is why un-migrated surfaces looked wrong there. Use border-[color:var(--line)] for hairlines, or a real token at alpha (e.g. bg-chalk-400/[0.08]) for a fill.",
  },
  {
    name: "keyword rounding",
    re: /\brounded-(?:sm|md|lg|xl|2xl|3xl)(?=["'\s}])/,
    why: "The system uses an explicit bracket scale so radii cannot drift: rounded-[6px]/[8px]/[10px]/[12px]/[14px]/[18px]. rounded-full stays legal for dots and avatars.",
  },
  {
    name: "type-ladder class fighting an inline size",
    re: /\bt-(?:page|num|section|card|body|label|meta)\b[^"'`]*\btext-\[[0-9.]+px\]|\btext-\[[0-9.]+px\][^"'`]*\bt-(?:page|num|section|card|body|label|meta)\b/,
    why: "cn() is clsx, not tailwind-merge, so both classes ship and the plain .t-* rule wins - the inline size is dead and the element renders at the ladder's size. PageHero carried five of these and measured small for exactly that reason. Use the ladder class alone, or write the size and drop the t-*.",
  },
];

/**
 * Route pages that are allowed not to compose a `Deck`, and why. Everything
 * else must: the width law (primitives-contract §0b) is what stops a card from
 * inheriting the monitor, and a new page that skips it is the drift this
 * catches. Shrinking this list is progress; growing it needs a real reason
 * written next to the name.
 */
const DECKLESS_PAGES: Record<string, string> = {
  "BoardPage.tsx": "fill archetype - the kanban owns the viewport and scrolls its own columns",
  "CodebasePage.tsx": "fill archetype - a two-pane search tool that owns its own height",
  "FlowBuilderPage.tsx":
    "fill archetype - a draggable two-pane editor whose panes scroll themselves, so a Deck's shared width would fight the divider",
  "SourcePage.tsx": "fill archetype - a wrapper that swaps three full-height git views",
  "PoliciesPage.tsx": "9-line route wrapper; the Deck is in PoliciesPanel, which it renders",
  "CanvasPage.tsx": "gitignored local-only styleguide, not part of the product",
  "page-skeletons.tsx":
    "not a page - shared loading shapes the routes import, so it mirrors each page's Deck rather than owning one",
};

/** Every `--color-<name>-soft` custom property index.css actually defines. */
async function definedSoftTokens(): Promise<Set<string>> {
  const css = await readFile(path.join(UI_ROOT, "index.css"), "utf8");
  return new Set(
    [...css.matchAll(/--color-([a-z][a-z0-9-]*-soft)\s*:/g)].map((m) => m[1]!),
  );
}

describe("UI design drift", () => {
  // Same failure as the `chalk-500` entry above, generalised: a Tailwind colour
  // class naming a custom token that index.css never defines renders as NO
  // colour, silently, in a build that succeeds and a typecheck that passes.
  // `-soft` is a custom suffix (violet-soft, amber-soft), never part of
  // Tailwind's own palette, so every use of one has to resolve to a real
  // variable - and unlike the numeric palette there is no built-in fallback to
  // mask it. Caught in review once already: a `text-emerald-soft` icon, when
  // only violet-soft and amber-soft exist.
  it("only uses -soft colour tokens that index.css defines", async () => {
    const defined = await definedSoftTokens();
    expect(defined.size).toBeGreaterThan(0); // guard against a silently empty parse

    const offences: string[] = [];
    for (const file of await tsxFiles(UI_ROOT)) {
      const text = await readFile(file, "utf8");
      text.split("\n").forEach((line, i) => {
        for (const m of line.matchAll(
          /\b(?:text|bg|border|ring|fill|stroke|from|via|to|decoration|outline|shadow|accent|caret|divide)-([a-z][a-z0-9-]*-soft)\b/g,
        )) {
          const token = m[1]!;
          if (defined.has(token)) continue;
          offences.push(
            `${path.relative(process.cwd(), file)}:${i + 1} uses "${token}", which index.css does not define ` +
              `(defined: ${[...defined].sort().join(", ")}).\n    ${line.trim().slice(0, 120)}`,
          );
        }
      });
    }
    expect(offences.join("\n")).toBe("");
  });

  it("keeps the contract's hard-no list out of src/ui", async () => {
    const files = await tsxFiles(UI_ROOT);
    expect(files.length).toBeGreaterThan(100); // guard against a silently empty walk

    const offences: string[] = [];
    for (const file of files) {
      const text = await readFile(file, "utf8");
      text.split("\n").forEach((line, i) => {
        for (const { name, re, why } of BANNED) {
          if (re.test(line)) {
            offences.push(
              `${path.relative(process.cwd(), file)}:${i + 1} [${name}] ${why}\n    ${line.trim().slice(0, 120)}`,
            );
          }
        }
      });
    }
    expect(offences.join("\n")).toBe("");
  });

  it("keeps every route page on the Deck", async () => {
    const routes = path.join(UI_ROOT, "app", "routes");
    const files = (await readdir(routes)).filter((f) => f.endsWith(".tsx"));
    expect(files.length).toBeGreaterThan(15); // guard against a silently empty walk

    const offences: string[] = [];
    for (const name of files) {
      if (name in DECKLESS_PAGES) continue;
      const text = await readFile(path.join(routes, name), "utf8");
      if (!text.includes("layout/Deck")) {
        offences.push(
          `src/ui/app/routes/${name} lays itself out without a Deck. Compose layout/Deck + Cell (primitives-contract 0b), or add it to DECKLESS_PAGES with the reason.`,
        );
      }
    }
    expect(offences.join("\n")).toBe("");
  });
});

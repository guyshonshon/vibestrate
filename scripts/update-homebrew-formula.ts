#!/usr/bin/env node
//
// Render the Homebrew formula for a PUBLISHED version.
//
//   pnpm tsx scripts/update-homebrew-formula.ts [version] [--out <path>]
//
// Reads the tarball url and its sha256 from the npm registry rather than
// computing them locally, so the formula can only ever describe a build that
// actually shipped. A local `npm pack` would produce a different digest from
// the published artifact the moment anything about the pack differs, and the
// failure would show up as a checksum mismatch on a user's machine.
//
// Prints the formula to stdout, or writes it with --out. It does NOT push
// anywhere: the tap is its own repository, and publishing to it is a separate,
// deliberate step (see .github/MAINTAINING.md).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

/** The npm registry's metadata for one published version. */
export async function fetchPublished(
  version: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ tarball: string }> {
  const res = await fetchImpl(`https://registry.npmjs.org/vibestrate/${version}`);
  if (!res.ok) {
    throw new Error(
      `npm has no vibestrate@${version} (HTTP ${res.status}). ` +
        `Publish it first - the formula is rendered from what shipped, not from the working tree.`,
    );
  }
  const meta = (await res.json()) as { dist?: { tarball?: unknown } };
  const tarball = meta?.dist?.tarball;
  // npm serves `integrity` (sha512, base64) on modern packuments and `shasum`
  // (sha1) on all of them. Homebrew wants sha256, which is in neither, so it
  // has to be computed from the bytes.
  if (typeof tarball !== "string") {
    throw new Error(`vibestrate@${version} has no dist.tarball in its packument`);
  }
  return { tarball };
}

/** sha256 of the published tarball, over the bytes npm actually serves. */
export async function sha256Of(url: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`could not download ${url} (HTTP ${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(bytes).digest("hex");
}

/** Fill the template. Pure, so the rendering is testable without a network. */
export function renderFormula(
  template: string,
  { url, sha256, nodeFloor }: { url: string; sha256: string; nodeFloor: number },
): string {
  const out = template
    .replaceAll("__URL__", url)
    .replaceAll("__SHA256__", sha256)
    .replaceAll("__NODE_FLOOR__", String(nodeFloor));
  const leftover = out.match(/__[A-Z0-9_]+__/);
  if (leftover) throw new Error(`formula still contains a placeholder: ${leftover[0]}`);
  return out;
}

/** The major from package.json's `engines.node` - the one floor everything echoes. */
export function nodeFloorFrom(pkgJson: string): number {
  const raw = (JSON.parse(pkgJson) as { engines?: { node?: string } })?.engines?.node;
  const m = /(\d+)/.exec(raw ?? "");
  if (!m) throw new Error(`could not read a major version out of engines.node (${raw})`);
  return Number(m[1]);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  const out = outIdx === -1 ? null : args[outIdx + 1];
  const positional = args.filter((a, i) => !a.startsWith("--") && i !== outIdx + 1);
  const pkgJson = readFileSync(join(repoRoot, "package.json"), "utf8");
  const version = positional[0] ?? (JSON.parse(pkgJson) as { version: string }).version;

  const { tarball } = await fetchPublished(version);
  const sha256 = await sha256Of(tarball);
  const template = readFileSync(join(repoRoot, "packaging/homebrew/vibestrate.rb.tmpl"), "utf8");
  const formula = renderFormula(template, {
    url: tarball,
    sha256,
    nodeFloor: nodeFloorFrom(pkgJson),
  });

  if (out) {
    writeFileSync(out, formula);
    process.stderr.write(`wrote ${out} for vibestrate@${version}\n`);
  } else {
    process.stdout.write(formula);
  }
}

// Only run when invoked directly, so the helpers above stay importable.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}

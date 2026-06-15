// ── Run id generation ────────────────────────────────────────────────────────
//
// Short, memorable, docker-style run ids: `<adjective>-<noun>` (e.g.
// `bold-lovelace`). Replaces the old `YYYYMMDD-HHMMSS-<full-task-slug>` ids,
// which were long and unwieldy as directory / ref / display names. The human
// label for a run is its task / displayName (see runLabel), not the id, so the
// id can be a short opaque handle. Run lists order by `startedAt`, not by id.
//
// Uniqueness ("no duplications") is enforced at creation: makeUniqueRunId checks
// the project's existing run dirs and retries, falling back to a short suffix if
// the (small) word space is exhausted.

import { existsSync } from "node:fs";
import { runDir } from "./paths.js";

// Lowercase, letters-only words so an id is always filesystem- and git-ref-safe.
const ADJECTIVES = [
  "bold", "brave", "calm", "clever", "cosmic", "crisp", "curious", "daring",
  "deft", "eager", "electric", "fancy", "fierce", "frosty", "gentle", "glad",
  "golden", "happy", "hidden", "jolly", "keen", "lively", "lucid", "lunar",
  "mellow", "merry", "mighty", "noble", "polished", "prime", "quiet", "rapid",
  "ruby", "sage", "scarlet", "serene", "sharp", "shiny", "silent", "smooth",
  "snappy", "solar", "spry", "stellar", "sturdy", "sunny", "swift", "tidy",
  "vivid", "warm", "witty", "zen", "amber", "azure", "brisk", "lush",
];

const NOUNS = [
  "lovelace", "turing", "hopper", "curie", "newton", "tesla", "darwin", "bohr",
  "euler", "gauss", "fermi", "hawking", "noether", "ramanujan", "kepler",
  "pascal", "babbage", "shannon", "lamarr", "franklin", "feynman", "galileo",
  "maxwell", "planck", "dijkstra", "knuth", "ritchie", "torvalds", "berners",
  "falcon", "otter", "lynx", "heron", "ibex", "marten", "raven", "finch",
  "comet", "nova", "quartz", "cedar", "delta", "harbor", "meadow", "summit",
  "willow", "cobalt", "ember", "river", "canyon", "maple", "orbit", "pixel",
  "vector", "atlas", "cyan", "flux",
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/** A random `<adjective>-<noun>` name (not uniqueness-checked). */
export function randomRunName(): string {
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}`;
}

/**
 * A short docker-style run id guaranteed unique against `isTaken`. Tries plain
 * `adjective-noun` names first (most ids), then appends a 2-char suffix if the
 * word space is locally exhausted. `isTaken` defaults to "never taken" for
 * callers that don't need the check (e.g. tests).
 */
export function makeRunId(isTaken: (id: string) => boolean = () => false): string {
  for (let i = 0; i < 50; i += 1) {
    const id = randomRunName();
    if (!isTaken(id)) return id;
  }
  for (let i = 0; i < 10000; i += 1) {
    const id = `${randomRunName()}-${Math.random().toString(36).slice(2, 4)}`;
    if (!isTaken(id)) return id;
  }
  // Astronomically unlikely; fail loud rather than risk a collision.
  throw new Error("Could not generate a unique run id.");
}

/** makeRunId, checking uniqueness against the project's existing run dirs. */
export function makeUniqueRunId(projectRoot: string): string {
  return makeRunId((id) => existsSync(runDir(projectRoot, id)));
}

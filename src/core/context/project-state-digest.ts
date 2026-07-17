// ── Durable, auto-derived project STATE digest ───────────────────────────────
//
// `.vibestrate/STATE.md` is the machine-owned half of the project's memory: a
// human-readable digest of the continuity ledger, regenerated each run boundary.
// It is a REGENERABLE CACHE over `project.ledger` (the source of truth) - losing
// it is harmless. It is deliberately a SEPARATE file from `VIBESTRATE.md` (which
// stays human/advisor-authored), so the orchestrator never rewrites authored
// intent. See docs/design/durable-project-memory.md.

import path from "node:path";
import { promises as fs } from "node:fs";
import { vibestrateRoot } from "../../utils/paths.js";
import { ensureDir } from "../../utils/fs.js";
import { redactSecretsInText } from "../diff-service.js";
import {
  LedgerStore,
  deriveLedgerState,
  renderLedgerBrief,
  STALE_OPEN_WORK_DAYS,
  type LedgerState,
} from "./project-ledger.js";

export function projectStatePath(projectRoot: string): string {
  return path.join(vibestrateRoot(projectRoot), "STATE.md");
}

/**
 * Pure: the machine-owned `STATE.md` body for a ledger state. Self-describing as
 * auto-derived + regenerable so a human (or an agent) knows not to hand-edit it
 * and where the authored intent lives. Same state + `generatedAt` => same body.
 */
export function renderProjectStateDigest(
  state: LedgerState,
  generatedAt: string,
): string {
  const header = [
    "# Project state (auto-derived)",
    "",
    "> Machine-owned: regenerated each run from `.vibestrate/project.ledger`.",
    "> Do not hand-edit - changes are overwritten. Authored project intent,",
    "> conventions, and lessons live in `VIBESTRATE.md`.",
    "",
    `_Generated ${generatedAt}._`,
    "",
  ].join("\n");
  return `${header}${renderLedgerBrief(state, {
    limit: 10,
    maxDetail: 240,
    now: generatedAt,
    staleAfterDays: STALE_OPEN_WORK_DAYS,
  })}\n`;
}

/**
 * Regenerate `.vibestrate/STATE.md` from the current ledger. Best-effort: a
 * hiccup never fails a run (the caller wraps in try/catch). Concurrency-safe
 * WITHOUT a mutex: it re-derives from the freshest ledger and writes via
 * temp+rename, so a reader never sees a torn file and last-writer-wins is
 * *correct* (the last writer had the newest ledger). Secret-redacted on the way
 * out as defense-in-depth.
 */
export async function writeProjectStateDigest(
  projectRoot: string,
  generatedAt: string,
): Promise<void> {
  const entries = await new LedgerStore(projectRoot).read();
  if (entries.length === 0) return; // nothing recorded yet - don't create a noise file
  const state = deriveLedgerState(entries);
  const body = redactSecretsInText(
    renderProjectStateDigest(state, generatedAt),
  ).redacted;
  const target = projectStatePath(projectRoot);
  const tmp = `${target}.tmp.${process.pid}`;
  await ensureDir(vibestrateRoot(projectRoot));
  await fs.writeFile(tmp, body, "utf8");
  await fs.rename(tmp, target); // atomic on the same filesystem
}

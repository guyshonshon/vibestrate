// Guarded spec-up artifact edit: let a human edit a spec-up run's scope / spec /
// architecture / risks markdown BEFORE approving the build, so the edited spec is
// what seeds the build. This is a browser->filesystem write, so every guard is
// load-bearing (pre-act adversarial review, recorded on the feature branch):
//
//  - the section is a CLOSED set; the path is SERVER-BUILT (`flows/<section>/output.md`),
//    never client-supplied;
//  - secret-shaped content is REFUSED (never persist a secret into a doc that seeds
//    a build prompt) and the refusal is audited;
//  - edits are blocked once the build was approved (the snapshot already seeded it);
//  - an optional `baseHash` gives optimistic concurrency (reject a stale clobber);
//  - the write routes through the Action Broker (`file.write`) and a non-allow
//    verdict is surfaced as an actionable error, not a generic failure;
//  - the actual write is symlink/hardlink-safe (ArtifactStore.writeGuarded: O_NOFOLLOW
//    + nlink check + realpath containment anchored to the run's artifacts dir).
//
// Provider exposure of any secret a spec-up AGENT wrote into these artifacts is
// already closed at consumption: the build materializes the approved spec as a file
// context source, which runs `redactSecretsInText` (core/context-sources.ts). This
// guard is the human-edit half of that same no-secrets posture.

import { createHash } from "node:crypto";
import { ArtifactStore } from "../core/artifact-store.js";
import {
  createActionBroker,
  gateAction,
  type ActionRequest,
} from "../safety/action-broker.js";
import { redactSecretsInText } from "../core/diff-service.js";
import { assertSafeRunId } from "../server/security.js";
import { APPROVED_SPEC_PATH, SPEC_UP_SPEC_STEPS } from "./spec-up-chain.js";

/** The editable spec-up sections (the spec-producing step outputs). */
export const EDITABLE_SPEC_UP_SECTIONS = SPEC_UP_SPEC_STEPS;
/** Bound the edited body (a spec doc, not a payload dump). */
export const MAX_SPEC_UP_EDIT_BYTES = 256 * 1024;

export type SpecUpEditCode =
  | "bad-section"
  | "too-large"
  | "already-approved"
  | "missing"
  | "secret"
  | "stale"
  | "blocked"
  | "write-failed";

export class SpecUpEditError extends Error {
  constructor(
    readonly code: SpecUpEditCode,
    message: string,
  ) {
    super(message);
    this.name = "SpecUpEditError";
  }
}

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/** sha256 of an artifact's current on-disk content (for the optimistic-concurrency
 *  baseHash). Returns null if the section/artifact can't be read. */
export async function specUpArtifactHash(
  projectRoot: string,
  runId: string,
  section: string,
): Promise<string | null> {
  if (!(EDITABLE_SPEC_UP_SECTIONS as readonly string[]).includes(section)) return null;
  const store = new ArtifactStore(projectRoot, runId);
  const rel = `flows/${section}/output.md`;
  if (!(await store.exists(rel))) return null;
  return sha256(await store.read(rel));
}

/** Read a spec-up section's current content + hash + whether it is frozen (the
 *  build was already approved). Returns null for an unknown section or a run with
 *  no such artifact. The hash is the `baseHash` the editor echoes back on save. */
export async function readSpecUpSection(
  projectRoot: string,
  runId: string,
  section: string,
): Promise<{ content: string; hash: string; frozen: boolean } | null> {
  if (!(EDITABLE_SPEC_UP_SECTIONS as readonly string[]).includes(section)) return null;
  const store = new ArtifactStore(projectRoot, runId);
  const rel = `flows/${section}/output.md`;
  if (!(await store.exists(rel))) return null;
  const content = await store.read(rel);
  const frozen = await store.exists(APPROVED_SPEC_PATH);
  return { content, hash: sha256(content), frozen };
}

/**
 * Edit one spec-up section's artifact, guarded. Throws `SpecUpEditError` (with a
 * machine `code`) for every refusal so the route/CLI can map it. On success returns
 * the absolute path written and the new content hash.
 */
export async function editSpecUpArtifact(input: {
  projectRoot: string;
  runId: string;
  section: string;
  content: string;
  /** sha256 of the content the caller loaded; reject if the file changed since. */
  baseHash?: string | null;
}): Promise<{ path: string; hash: string }> {
  assertSafeRunId(input.runId);

  // 1. Closed section set FIRST - a bad section is a clean error, not a path throw.
  if (!(EDITABLE_SPEC_UP_SECTIONS as readonly string[]).includes(input.section)) {
    throw new SpecUpEditError(
      "bad-section",
      `"${input.section}" is not an editable spec-up section. Allowed: ${EDITABLE_SPEC_UP_SECTIONS.join(", ")}.`,
    );
  }
  const content = input.content ?? "";

  // 2. Size cap on the BYTE length (not UTF-16 code units).
  if (Buffer.byteLength(content, "utf8") > MAX_SPEC_UP_EDIT_BYTES) {
    throw new SpecUpEditError(
      "too-large",
      `Edited content exceeds ${MAX_SPEC_UP_EDIT_BYTES} bytes.`,
    );
  }

  const store = new ArtifactStore(input.projectRoot, input.runId);
  const rel = `flows/${input.section}/output.md`;
  const subject = {
    path: rel,
    purpose: "spec-up-artifact-edit",
    section: input.section,
  };
  const broker = createActionBroker(input.projectRoot, input.runId);

  // 3. Blocked once the build was approved - the snapshot already seeded the build,
  //    so a post-approve edit would silently NOT take effect.
  if (await store.exists(APPROVED_SPEC_PATH)) {
    throw new SpecUpEditError(
      "already-approved",
      "This spec-up run was already approved and built - its spec is frozen. Start a new run to change the plan.",
    );
  }

  // 4. The artifact must already exist - pins the edit to a real spec-up run that
  //    produced a spec (a non-spec-up run has no flows/<section>/output.md).
  if (!(await store.exists(rel))) {
    throw new SpecUpEditError(
      "missing",
      `No "${input.section}" artifact for run "${input.runId}" - is this a spec-up run that produced a spec?`,
    );
  }

  // 5. Secret-refusal (audited): never persist secret-shaped tokens into a doc that
  //    seeds a build prompt.
  const { count } = redactSecretsInText(content);
  if (count > 0) {
    await broker.record(
      { runId: input.runId, kind: "file.write", subject, proposedBy: "ui" },
      {
        effect: "deny",
        ruleIds: ["spec-up.edit.secret"],
        reason: `edited content contained ${count} secret-shaped value(s)`,
      },
      { ok: false, summary: "spec-up edit refused: secret-shaped content" },
    );
    throw new SpecUpEditError(
      "secret",
      `Refusing to save: the text contains ${count} secret-shaped value(s). Remove them (use env: references in config, never inline secrets).`,
    );
  }

  // 6. Optimistic concurrency: reject a stale overwrite (another tab/CLI edited it).
  if (input.baseHash) {
    const currentHash = sha256(await store.read(rel));
    if (currentHash !== input.baseHash) {
      throw new SpecUpEditError(
        "stale",
        `The "${input.section}" artifact changed since you loaded it. Reload and re-apply your edit.`,
      );
    }
  }

  // 7. Broker gate (file.write). A non-allow verdict (a project file.write policy,
  //    or a policy-load failure that fails closed) is surfaced as an actionable
  //    error - there is no approval queue for this route, so we never leave it hung.
  const request: ActionRequest = {
    runId: input.runId,
    kind: "file.write",
    subject,
    proposedBy: "ui",
  };
  const gate = await gateAction(broker, request);
  if (!gate.allowed) {
    throw new SpecUpEditError(
      "blocked",
      `A file.write policy is blocking spec-up edits (${gate.effect}): ${gate.reason}. Allow file.write or adjust the policy to edit the spec.`,
    );
  }

  // 8. CRLF -> LF, then the symlink/hardlink-safe write.
  const normalized = content.replace(/\r\n/g, "\n");
  let written: string;
  try {
    written = await store.writeGuarded(rel, normalized);
  } catch (err) {
    throw new SpecUpEditError(
      "write-failed",
      `Could not write the artifact safely: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  await broker.record(request, gate.decision, {
    ok: true,
    summary: `spec-up ${input.section} edited`,
    data: { path: rel },
  });
  return { path: written, hash: sha256(normalized) };
}

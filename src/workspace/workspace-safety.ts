// ── Workspace safety guard (Multi-project slice f) ──────────────────────────
//
// One fail-closed gate that EVERY cross-project action (launch, abort, enqueue)
// must pass before it can touch another project root. The threat it closes: a
// cross-root operation is a wider capability than the single-project server was
// built around, so we never trust a caller-supplied path. A target is allowed
// only when it is:
//   1. a path that resolves to a real directory,
//   2. present in the user-owned registry (or the served/current root itself),
//   3. an initialized Vibestrate project (`.vibestrate/project.yml` exists).
// Anything else is refused with a clear error rather than silently acted on.
//
// This is the (f) "per-root safety review for a shared server": the dashboard
// stays single-served, but the few endpoints that reach other roots all funnel
// through here, so the review surface is exactly one module.

import path from "node:path";
import { pathExists } from "../utils/fs.js";
import { projectConfigPath, vibestrateRoot } from "../utils/paths.js";
import { WorkspaceStore } from "./workspace-store.js";

export class WorkspaceSafetyError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
    this.name = "WorkspaceSafetyError";
  }
}

export type ResolvedProject = {
  /** Absolute, normalized project root. */
  root: string;
  /** Registry label (or the basename when the served root isn't registered). */
  label: string;
  /** True for the project this server/CLI is itself rooted in. */
  isCurrent: boolean;
};

export type WorkspaceSafetyDeps = {
  /** The root the server/CLI is serving — always allowed as a target. */
  currentRoot: string;
  /** Defaults to the real user-level registry; injectable for tests. */
  store?: WorkspaceStore;
};

/**
 * Resolve a caller-supplied project selector (absolute path **or** registry
 * label) to a vetted project root. Fail-closed: throws `WorkspaceSafetyError`
 * unless the target is registered (or is the current root) AND initialized.
 */
export async function resolveTargetProject(
  selector: string,
  deps: WorkspaceSafetyDeps,
): Promise<ResolvedProject> {
  const currentRoot = path.resolve(deps.currentRoot);
  const store = deps.store ?? new WorkspaceStore();
  const projects = await store.list();

  const sel = (selector ?? "").trim();
  if (!sel) throw new WorkspaceSafetyError("A target project is required.");

  // Match by registry label first (exact), then by normalized path.
  const byLabel = projects.find((p) => p.label === sel);
  const asPath = path.resolve(sel);
  const byPath = projects.find((p) => p.root === asPath);

  let root: string;
  let label: string;
  if (byLabel) {
    root = byLabel.root;
    label = byLabel.label;
  } else if (byPath) {
    root = byPath.root;
    label = byPath.label;
  } else if (asPath === currentRoot) {
    // The served root may not be registered yet — still always allowed.
    root = currentRoot;
    label = path.basename(currentRoot) || currentRoot;
  } else {
    throw new WorkspaceSafetyError(
      `"${selector}" is not a registered project. Add it with \`vibe workspace add\` first.`,
    );
  }

  // Defence in depth: the registry could name a path that has since been
  // removed or never initialized. Refuse rather than spawn into nothing.
  if (!(await pathExists(vibestrateRoot(root)))) {
    throw new WorkspaceSafetyError(
      `Project "${label}" has no .vibestrate/ directory — run \`vibe init\` there first.`,
    );
  }
  if (!(await pathExists(projectConfigPath(root)))) {
    throw new WorkspaceSafetyError(
      `Project "${label}" is not initialized (no project.yml) — run \`vibe init\` there first.`,
    );
  }

  return { root, label, isCurrent: root === currentRoot };
}

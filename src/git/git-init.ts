// ── Guarded git onboarding (run-experience batch P7a) ───────────────────────
//
// `vibe init` can offer to create the git repository it needs - but only on an
// EXPLICIT yes (an interactive confirm, or the dedicated --git-init flag /
// gitInit body field; a generic --yes never implies it - creating repo history
// must never be a side effect).
//
// The initial commit is guarded, not automatic:
// a directory that was never a repo can contain .env files, credentials, and
// build junk. We write a starter .gitignore first, then scan what WOULD be
// staged - any secret-like path means NO commit (git init still succeeds, the
// reason is reported, staging stays a human activity). A commit is harder to
// walk back than a working-tree change.

import path from "node:path";
import { promises as fs } from "node:fs";
import { execa } from "execa";
import { isSecretLikePath } from "../core/diff-service.js";
import { pathExists } from "../utils/fs.js";

const STARTER_GITIGNORE = `node_modules/
dist/
build/
out/
coverage/
*.log
.DS_Store
.env
.env.*
`;

export type GitInitResult = {
  ok: boolean;
  initialized: boolean;
  /** Wrote (not overwrote) a starter .gitignore. */
  gitignoreWritten: boolean;
  /** The initial commit sha, when one was made. */
  commitSha: string | null;
  /** Why the initial commit was skipped (null when committed / not attempted). */
  commitSkippedReason: string | null;
  error: string | null;
};

const none: Omit<GitInitResult, "ok" | "error"> = {
  initialized: false,
  gitignoreWritten: false,
  commitSha: null,
  commitSkippedReason: null,
};

/**
 * Initialize a git repository at `projectRoot` with a guarded initial commit.
 * Refuses when the directory is already inside a repo (never nest).
 */
export async function initGitRepository(input: {
  projectRoot: string;
  /** Attempt the guarded initial commit after init (default true). */
  commit?: boolean;
}): Promise<GitInitResult> {
  const root = input.projectRoot;
  const inRepo = await execa("git", ["rev-parse", "--git-dir"], {
    cwd: root,
    reject: false,
  });
  if (inRepo.exitCode === 0) {
    return {
      ...none,
      ok: false,
      error:
        "Already inside a git repository - refusing to nest a new one. Run vibe init directly.",
    };
  }

  const init = await execa("git", ["init", "-b", "main"], {
    cwd: root,
    reject: false,
  });
  if (init.exitCode !== 0) {
    // Older git without -b: fall back to plain init.
    const plain = await execa("git", ["init"], { cwd: root, reject: false });
    if (plain.exitCode !== 0) {
      return {
        ...none,
        ok: false,
        error: `git init failed: ${plain.stderr || plain.stdout || init.stderr}`,
      };
    }
  }

  let gitignoreWritten = false;
  const giPath = path.join(root, ".gitignore");
  if (!(await pathExists(giPath))) {
    await fs.writeFile(giPath, STARTER_GITIGNORE, "utf8");
    gitignoreWritten = true;
  }

  if (input.commit === false) {
    return { ...none, ok: true, initialized: true, gitignoreWritten, error: null };
  }

  // What WOULD be staged (respects the .gitignore we just wrote).
  // Adversarial-review hardening, both load-bearing:
  //   --untracked-files=all : default porcelain collapses an untracked dir to
  //     one `dir/` entry, so a `secrets/id_rsa` INSIDE it was invisible to the
  //     scan and `git add -A` then committed it. -uall lists every file.
  //   -z (NUL records)      : git C-quotes paths with spaces/unicode
  //     (`?? "my key.pem"`), which broke the $-anchored secret patterns; NUL
  //     records arrive raw. Rename records carry a second NUL-separated path -
  //     both are scanned.
  const status = await execa(
    "git",
    ["status", "--porcelain", "--untracked-files=all", "-z"],
    { cwd: root, reject: false },
  );
  const records = status.stdout.split("\0").filter(Boolean);
  const wouldStage: string[] = [];
  for (let i = 0; i < records.length; i++) {
    const rec = records[i]!;
    if (rec.length < 4) continue;
    wouldStage.push(rec.slice(3));
    // R/C records are followed by the original path as its own NUL field.
    if (rec[0] === "R" || rec[0] === "C") {
      const orig = records[i + 1];
      if (orig) {
        wouldStage.push(orig);
        i += 1;
      }
    }
  }
  const secretLike = wouldStage.filter((p) => isSecretLikePath(p));
  if (secretLike.length > 0) {
    return {
      ...none,
      ok: true,
      initialized: true,
      gitignoreWritten,
      commitSkippedReason: `secret-like file(s) would be committed: ${secretLike
        .slice(0, 5)
        .join(", ")} - repository initialized WITHOUT a commit; review and stage manually.`,
      error: null,
    };
  }
  if (wouldStage.length === 0) {
    return {
      ...none,
      ok: true,
      initialized: true,
      gitignoreWritten,
      commitSkippedReason: "nothing to commit",
      error: null,
    };
  }

  // Stage the VETTED list explicitly - never `git add -A`. A scanner miss then
  // means an unstaged file, not a leaked commit (fail-closed by construction).
  let stageError: string | null = null;
  const CHUNK = 200;
  for (let i = 0; i < wouldStage.length && !stageError; i += CHUNK) {
    const add = await execa(
      "git",
      ["add", "--", ...wouldStage.slice(i, i + CHUNK)],
      { cwd: root, reject: false },
    );
    if (add.exitCode !== 0) {
      stageError = add.stderr || add.stdout || "git add failed";
    }
  }
  const commit = stageError
    ? null
    : await execa("git", ["commit", "-m", "chore: initial commit (vibe init)"], {
        cwd: root,
        reject: false,
      });
  if (stageError || !commit || commit.exitCode !== 0) {
    return {
      ...none,
      ok: true,
      initialized: true,
      gitignoreWritten,
      commitSkippedReason: `commit failed: ${
        stageError ?? (commit ? commit.stderr || commit.stdout : "unknown")
      }`,
      error: null,
    };
  }
  const sha = await execa("git", ["rev-parse", "HEAD"], {
    cwd: root,
    reject: false,
  });
  return {
    ok: true,
    initialized: true,
    gitignoreWritten,
    commitSha: sha.exitCode === 0 ? sha.stdout.trim() : null,
    commitSkippedReason: null,
    error: null,
  };
}

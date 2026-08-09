/**
 * Per-run artifact I/O, scoped to one run's artifacts directory.
 *
 * Caller-supplied paths are untrusted: the read/write/exists helpers below
 * resolve through resolveArtifactPath, which refuses absolute paths, ".."
 * segments, and anything that lands outside this run's artifacts dir. Adding a
 * helper that joins a caller path itself would step around that guard.
 *
 * Two write paths: `write`/`writeJson` for content this process produced, and
 * `writeGuarded` for content of untrusted origin, which additionally refuses
 * symlinked and hardlinked targets (see its own comment for the mechanics).
 *
 * `relPath` returns a run-relative POSIX key, not a native path - the value is
 * stored, returned, and compared, so it must not carry Windows separators.
 */
import path from "node:path";
import { promises as fs, constants as fsConstants } from "node:fs";
import { ensureDir, writeText, readText, pathExists } from "../../utils/fs.js";
import { runArtifactsDir, runDir, isPathInside, safeJoin } from "../../utils/paths.js";
import { isSecretLikePath } from "../diff-service.js";

/**
 * Bounds one response so a runaway artifact cannot exhaust memory. Set well
 * above the inline file-view cap on purpose: artifacts are this app's own
 * output, and the two the run detail fetches most - the assembled prompt and a
 * step's full provider stdout - have no upstream cap and routinely run past
 * any figure sized for browsing source files. Refusing those would break the
 * live timeline rather than protect it.
 */
const MAX_ARTIFACT_READ_BYTES = 8 * 1024 * 1024;

export type ArtifactReadFailure =
  | "not-found"
  | "not-a-file"
  | "escapes-root"
  | "secret-like"
  | "too-large"
  | "unreadable";

/** Carries a code so HTTP callers branch on it rather than parsing a message. */
export class ArtifactReadError extends Error {
  constructor(
    readonly code: ArtifactReadFailure,
    message: string,
  ) {
    super(message);
    this.name = "ArtifactReadError";
  }
}

export type GuardedArtifactEntry = { path: string; size: number };

export type GuardedArtifactRead =
  | { kind: "file"; text: string }
  | { kind: "directory"; entries: GuardedArtifactEntry[] };

export class ArtifactStore {
  constructor(
    private readonly projectRoot: string,
    private readonly runId: string,
  ) {}

  /** The run this store belongs to (used to scope broker action records). */
  get runIdValue(): string {
    return this.runId;
  }

  get rootDir(): string {
    return runDir(this.projectRoot, this.runId);
  }

  get artifactsDir(): string {
    return runArtifactsDir(this.projectRoot, this.runId);
  }

  async init(): Promise<void> {
    await ensureDir(this.artifactsDir);
  }

  resolveArtifactPath(relativePath: string): string {
    if (path.isAbsolute(relativePath)) {
      throw new Error(`Artifact paths must be relative: ${relativePath}`);
    }
    const segments = relativePath.split(/[\\/]/).filter(Boolean);
    if (segments.some((s) => s === "..")) {
      throw new Error(`Artifact paths must not contain '..': ${relativePath}`);
    }
    const target = safeJoin(this.artifactsDir, ...segments);
    if (!isPathInside(this.artifactsDir, target)) {
      throw new Error(`Artifact path traversal blocked: ${relativePath}`);
    }
    return target;
  }

  async write(relativePath: string, content: string): Promise<string> {
    const target = this.resolveArtifactPath(relativePath);
    await writeText(target, content);
    return target;
  }

  /**
   * Symlink/hardlink-safe overwrite for content of UNTRUSTED origin (e.g. a
   * browser edit), reusing the merge-service applyResolvedMerge hardening pattern.
   * `write()` uses fs.writeFile, which FOLLOWS a symlink and could escape the run
   * dir or clobber a hardlinked file; this refuses a symlinked leaf, a parent that
   * resolves outside THIS run's artifacts dir, and a hardlinked target (nlink > 1),
   * and opens with O_NOFOLLOW so a TOCTOU re-link between check and open can't
   * escape. The caller must ensure the parent dir already exists (a missing parent
   * fails closed). Containment is anchored to the run's artifacts dir, not the
   * project root - stricter than the donor pattern.
   */
  async writeGuarded(relativePath: string, content: string): Promise<string> {
    const target = this.resolveArtifactPath(relativePath); // rejects absolute / '..' / traversal
    const lst = await fs.lstat(target).catch(() => null);
    if (lst?.isSymbolicLink()) {
      throw new Error(`Refusing to write a symlinked artifact path: ${relativePath}`);
    }
    const realRoot = await fs.realpath(this.artifactsDir);
    const realParent = await fs.realpath(path.dirname(target)).catch(() => null);
    const inside =
      realParent === realRoot || (realParent?.startsWith(realRoot + path.sep) ?? false);
    if (!realParent || !inside) {
      throw new Error(`Refusing to write outside the run artifacts dir: ${relativePath}`);
    }
    // Open WITHOUT O_TRUNC so the nlink check runs before any truncation - a
    // hardlinked target must not be zeroed before we reject it. O_NOFOLLOW makes
    // the symlink refusal ATOMIC on POSIX; on Windows it is a no-op, so the
    // symlink defense there fails closed via the (non-atomic) lstat check above:
    // a symlinked leaf is still REFUSED, but a re-link between the lstat and the
    // open (TOCTOU) is not closed atomically. Accepted residual on Windows (no
    // O_NOFOLLOW equivalent); the lstat + realpath-containment guards remain.
    const fh = await fs.open(
      target,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_NOFOLLOW,
    );
    try {
      const st = await fh.stat();
      if (st.nlink > 1) {
        throw new Error(
          `Refusing to write a hardlinked artifact (nlink ${st.nlink}): ${relativePath}`,
        );
      }
      await fh.truncate(0);
      await fh.write(content, 0, "utf8");
    } finally {
      await fh.close();
    }
    return target;
  }

  async writeJson(relativePath: string, value: unknown): Promise<string> {
    const target = this.resolveArtifactPath(relativePath);
    const text = `${JSON.stringify(value, null, 2)}\n`;
    await writeText(target, text);
    return target;
  }

  async read(relativePath: string): Promise<string> {
    const target = this.resolveArtifactPath(relativePath);
    return readText(target);
  }

  async exists(relativePath: string): Promise<boolean> {
    const target = this.resolveArtifactPath(relativePath);
    return pathExists(target);
  }

  /**
   * Resolve `relativePath` for a read by an UNTRUSTED caller (the HTTP API),
   * proving containment against real paths rather than string shapes.
   *
   * `resolveArtifactPath` alone is lexical: path.resolve does not touch the
   * disk and isPathInside compares strings, so it proves only that the
   * requested PATH lands inside the artifacts dir - not that the bytes behind
   * it do. Every subsequent stat/read follows symlinks, and a run writes into
   * its own artifacts dir, so an agent can plant a link and have the dashboard
   * serve whatever it points at.
   *
   * Three containment facts, in order, because each defeats a different link:
   * the artifacts dir itself must really live under the project (a run can
   * `rm -rf` its own artifacts dir and re-create it as a link, which would
   * otherwise make the escape target the "root" and every path under it
   * contained); the leaf must not be a symlink; and the leaf's parent must
   * really resolve inside the artifacts dir, since a linked intermediate
   * directory escapes just as well as a linked leaf.
   */
  private async resolveForRead(relativePath: string): Promise<{
    target: string;
    entry: Awaited<ReturnType<typeof fs.lstat>>;
  }> {
    const realRoot = await this.realArtifactsRoot();
    let target: string;
    try {
      target = this.resolveArtifactPath(relativePath);
    } catch {
      throw new ArtifactReadError("escapes-root", "Path escapes artifacts directory.");
    }
    const entry = await fs.lstat(target).catch(() => null);
    if (!entry) {
      throw new ArtifactReadError("not-found", "Artifact not found.");
    }
    // Redundant with the isFile() allow-list below, which already rejects a
    // symlink - kept because it names the actual cause, and "this artifact is
    // a symlink" is something an operator can act on where "not a regular
    // file" is not. Deleting it loses the message, not the defense.
    if (entry.isSymbolicLink()) {
      throw new ArtifactReadError("escapes-root", "Refusing to read a symlinked artifact.");
    }
    const realParent = await fs.realpath(path.dirname(target)).catch(() => null);
    if (!realParent || !isPathInside(realRoot, realParent)) {
      throw new ArtifactReadError("escapes-root", "Path escapes artifacts directory.");
    }
    return { target, entry };
  }

  /** The artifacts dir's real path, proven to still live under the project. */
  private async realArtifactsRoot(): Promise<string> {
    const realRoot = await fs.realpath(this.artifactsDir).catch(() => null);
    if (!realRoot) {
      throw new ArtifactReadError("not-found", "Run artifacts directory not found.");
    }
    const realProject = await fs.realpath(this.projectRoot).catch(() => null);
    if (!realProject || !isPathInside(realProject, realRoot)) {
      throw new ArtifactReadError("escapes-root", "Artifacts directory escapes the project.");
    }
    return realRoot;
  }

  /**
   * Read one artifact, or list it when the path names a directory, for an
   * untrusted caller. Failures are typed so the HTTP layer maps them to a
   * status instead of parsing messages - an unmapped throw there becomes a 500
   * and an issue record, which turns a probe loop into a write amplifier.
   */
  async readGuarded(relativePath: string): Promise<GuardedArtifactRead> {
    const { target, entry } = await this.resolveForRead(relativePath);
    if (entry.isDirectory()) {
      return { kind: "directory", entries: await this.walk(target) };
    }
    // Not a directory and not a symlink still leaves FIFOs, sockets and device
    // nodes, and mkfifo needs no privilege. Reading a FIFO blocks inside the
    // libuv threadpool, which has four slots and no timeout on this path, so
    // four requests would wedge every file operation the dashboard makes.
    if (!entry.isFile()) {
      throw new ArtifactReadError("not-a-file", "Artifact is not a regular file.");
    }
    // Refuses a secret-like NAME, which is a defense against an agent copying
    // a key into artifacts - NOT against the symlink above, whose link name is
    // whatever the attacker chose. The two are unrelated; neither substitutes.
    //
    // Matched on the RESOLVED path, not the caller's string. The patterns are
    // all $-anchored, and resolveArtifactPath drops empty segments, so "id_rsa/"
    // names the same file while failing every pattern - one trailing slash and
    // the refusal is gone. Every other guard here already works off `target`.
    if (isSecretLikePath(target)) {
      throw new ArtifactReadError("secret-like", "Refusing to read a secret-like artifact path.");
    }
    // O_NOFOLLOW makes the leaf refusal atomic: the lstat above can be undone
    // by a re-link before this open, and the attacker is a local process
    // writing to this very directory. O_NONBLOCK covers the same race for the
    // other blocking shape - a leaf swapped for a FIFO, where O_NOFOLLOW does
    // nothing and a plain open would park in the threadpool until a writer
    // appeared. Read off the handle rather than by path, since re-opening
    // would reintroduce the window. On Windows O_NOFOLLOW is a no-op, so there
    // the lstat refusal stands alone (non-atomic); creating a symlink there
    // needs Developer Mode or admin. A racing swap of a PARENT directory is
    // closed by none of this: Node has no openat/RESOLVE_BENEATH.
    const fh = await this.openForRead(target);
    try {
      const stat = await fh.stat();
      if (!stat.isFile()) {
        throw new ArtifactReadError("not-a-file", "Artifact is not a regular file.");
      }
      if (stat.size > MAX_ARTIFACT_READ_BYTES) {
        throw new ArtifactReadError(
          "too-large",
          `Artifact is ${(stat.size / 1024).toFixed(1)} KB - larger than the ${(
            MAX_ARTIFACT_READ_BYTES / 1024
          ).toFixed(0)} KB read limit.`,
        );
      }
      // readFile runs to EOF rather than to the size just stat'd, so a file
      // still being appended to can come back over the cap. That needs a local
      // writer racing this read, and the cost is a large response, not an
      // escape - left open rather than reading a fixed byte count, which would
      // truncate an artifact mid-write.
      return { kind: "file", text: await fh.readFile("utf8") };
    } finally {
      await fh.close();
    }
  }

  /**
   * Open a leaf for reading, with every failure typed.
   *
   * A bare fs.open throws a plain Error carrying the ABSOLUTE path, which the
   * HTTP layer cannot map and so returns as a 500 with that path in the body,
   * recording an issue on the way. ELOOP is not hypothetical here: it is what
   * O_NOFOLLOW produces when it wins its race, so the guard working correctly
   * was the thing generating the unmapped 500.
   */
  private async openForRead(target: string): Promise<Awaited<ReturnType<typeof fs.open>>> {
    try {
      return await fs.open(
        target,
        fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK,
      );
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        throw new ArtifactReadError("not-found", "Artifact not found.");
      }
      if (code === "ELOOP") {
        throw new ArtifactReadError("escapes-root", "Refusing to read a symlinked artifact.");
      }
      throw new ArtifactReadError("unreadable", "Artifact could not be opened.");
    }
  }

  /** Recursive listing of the whole artifacts dir for an untrusted caller. */
  async listGuarded(): Promise<GuardedArtifactEntry[]> {
    return this.walk(await this.realArtifactsRoot());
  }

  /**
   * Allow-list walk: only regular files are listed and only real directories
   * are descended. readdir's dirents carry lstat semantics, so a symlink is
   * neither - which matters, because a symlink to a directory reports
   * isDirectory() false and would otherwise fall through to a stat that
   * follows it, listing an outside tree as if the run had produced it.
   */
  private async walk(root: string): Promise<GuardedArtifactEntry[]> {
    const out: GuardedArtifactEntry[] = [];
    const visit = async (current: string, rel: string): Promise<void> => {
      const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => null);
      if (!entries) return;
      for (const entry of entries) {
        const abs = path.join(current, entry.name);
        const next = rel ? path.posix.join(rel, entry.name) : entry.name;
        if (entry.isDirectory()) {
          await visit(abs, next);
        } else if (entry.isFile()) {
          const stat = await fs.stat(abs).catch(() => null);
          if (stat) out.push({ path: next, size: stat.size });
        }
      }
    };
    await visit(root, "");
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }

  relPath(absolutePath: string): string {
    // POSIX-normalize: this is a STORED/RETURNED key (run-relative), used in
    // results, JSON, comparisons, and API routes, so it must be stable across
    // platforms. path.relative yields native separators (backslashes on
    // Windows); normalize to "/". (resolveArtifactPath splits on [\\/], so a
    // POSIX key still resolves for fs I/O.) Matches path-guard's convention.
    return path.relative(this.rootDir, absolutePath).replace(/\\/g, "/");
  }
}

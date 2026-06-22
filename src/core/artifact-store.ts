import path from "node:path";
import { promises as fs, constants as fsConstants } from "node:fs";
import { ensureDir, writeText, readText, pathExists } from "../utils/fs.js";
import { runArtifactsDir, runDir, isPathInside, safeJoin } from "../utils/paths.js";

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
   * browser edit), reusing the merge-service applyResolvedMerge BLOCKER pattern.
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
    // hardlinked target must not be zeroed before we reject it.
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

  relPath(absolutePath: string): string {
    return path.relative(this.rootDir, absolutePath);
  }
}

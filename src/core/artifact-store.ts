import path from "node:path";
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

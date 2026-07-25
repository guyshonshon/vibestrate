import fs from "node:fs/promises";
import path from "node:path";

const isWindows = process.platform === "win32";

/**
 * Write a fixture CLI that the host OS will actually execute, and return its
 * path.
 *
 * A file named `foo` carrying `#!/usr/bin/env node` is executable on POSIX and
 * is NOT a program on Windows: Windows decides executability by extension
 * (PATHEXT) and has no shebang support. Node's spawn resolves neither, so
 * execa resolves the command itself - and it will only find an extensionless
 * file if something has already told it which extension to try.
 *
 * So the fixture has to differ per platform, exactly like the real thing does:
 * an npm-installed provider CLI is `claude` on POSIX and `claude.cmd` on
 * Windows. Tests spawn the returned path, or the bare `name` via PATH; both
 * resolve on both platforms.
 */
export async function writeFakeNodeCli(
  dir: string,
  name: string,
  source: string,
): Promise<string> {
  await fs.mkdir(dir, { recursive: true });

  if (!isWindows) {
    const file = path.join(dir, name);
    await fs.writeFile(file, `#!/usr/bin/env node\n${source}`);
    await fs.chmod(file, 0o755);
    return file;
  }

  // The .cmd shim is the program; the .js beside it holds the logic. `%*`
  // forwards argv verbatim, which is also what the npm-generated shims do.
  const script = path.join(dir, `${name}.js`);
  await fs.writeFile(script, source);
  const shim = path.join(dir, `${name}.cmd`);
  await fs.writeFile(
    shim,
    `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`,
  );
  return shim;
}

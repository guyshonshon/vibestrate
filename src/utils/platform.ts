/**
 * Platform detection seam - the single source of truth for "are we on Windows".
 * Pure: takes the platform string so callers and tests can pass an explicit
 * value; defaults to the live `process.platform`.
 */
export type Platform = NodeJS.Platform;

export function isWindows(platform: Platform = process.platform): boolean {
  return platform === "win32";
}

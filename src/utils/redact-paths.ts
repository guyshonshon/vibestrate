/**
 * Strip machine-specific absolute prefixes out of text that leaves the server.
 *
 * Filesystem errors interpolate the path they failed on, and those strings end
 * up in HTTP bodies and SSE frames - which can reach a client that is not the
 * machine running the server. The project root becomes `<project>` and the home
 * directory `~`, which says the same thing without the username or the layout
 * above it. Anything recorded locally (the issues stream) keeps the original:
 * there the absolute path is the useful part.
 */
import os from "node:os";

export function relativizeRoot(text: string, projectRoot: string): string {
  if (!text) return text;
  const home = os.homedir();
  const out = projectRoot ? text.split(projectRoot).join("<project>") : text;
  return home ? out.split(home).join("~") : out;
}

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
  // A root of "/" is every separator in the string; substituting it shreds the
  // message and hides nothing. Project first, then home: the reverse order
  // would rewrite a project living under home before its own prefix matched.
  const usable = (root: string): boolean => root.length > 1;
  const home = os.homedir();
  const out = usable(projectRoot) ? text.split(projectRoot).join("<project>") : text;
  return usable(home) ? out.split(home).join("~") : out;
}

import path from "node:path";
import fs from "node:fs/promises";
import {
  buildMcpConfigFile,
  type ResolvedMcpServer,
} from "./mcp-resolve.js";

/**
 * Materialize a resolved server set as a `<dir>/mcp.json` file and
 * return the absolute path. Returns `null` when the resolved set is
 * empty — callers don't pass --mcp-config in that case.
 *
 * The directory is created if necessary. We write 0o600 so the file
 * is only readable by the run owner — MCP server `env` blocks
 * sometimes carry tokens.
 */
export async function writeMcpConfigFile(input: {
  dir: string;
  servers: ReadonlyArray<ResolvedMcpServer>;
}): Promise<string | null> {
  if (input.servers.length === 0) return null;
  await fs.mkdir(input.dir, { recursive: true });
  const file = path.join(input.dir, "mcp.json");
  const body = JSON.stringify(buildMcpConfigFile(input.servers), null, 2);
  await fs.writeFile(file, body, { encoding: "utf8", mode: 0o600 });
  return file;
}

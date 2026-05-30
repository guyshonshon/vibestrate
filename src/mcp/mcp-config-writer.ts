import path from "node:path";
import fs from "node:fs/promises";
import {
  buildMcpConfigFile,
  type ResolvedMcpServer,
} from "./mcp-resolve.js";
import {
  gateAction,
  type ActionBroker,
  type ActionRequest,
} from "../safety/action-broker.js";

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
  /** S0 Action Broker — when provided, this secret-bearing config write crosses
   *  the boundary (fail-closed: a deny throws). */
  broker?: ActionBroker;
  runId?: string;
}): Promise<string | null> {
  if (input.servers.length === 0) return null;
  const file = path.join(input.dir, "mcp.json");

  // ── Action Broker boundary (S0): file.write ───────────────────────────
  if (input.broker && input.runId) {
    const action: ActionRequest = {
      runId: input.runId,
      kind: "file.write",
      // Path only — never the body (it can carry MCP server tokens).
      subject: { path: file, purpose: "mcp.json", serverCount: input.servers.length },
      proposedBy: "system",
    };
    const gate = await gateAction(input.broker, action);
    if (!gate.allowed) {
      throw new Error(`Action broker ${gate.effect} file.write (mcp.json): ${gate.reason}`);
    }
    await fs.mkdir(input.dir, { recursive: true });
    const body = JSON.stringify(buildMcpConfigFile(input.servers), null, 2);
    await fs.writeFile(file, body, { encoding: "utf8", mode: 0o600 });
    await input.broker.record(action, gate.decision, {
      ok: true,
      summary: `wrote mcp.json (${input.servers.length} server(s))`,
    });
    return file;
  }

  await fs.mkdir(input.dir, { recursive: true });
  const body = JSON.stringify(buildMcpConfigFile(input.servers), null, 2);
  await fs.writeFile(file, body, { encoding: "utf8", mode: 0o600 });
  return file;
}

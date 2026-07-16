// Project config: read-only grouped view + schema-driven editor.
import { jsonGet, jsonPost } from "./http.js";
import type {
  ConfigViewResponse,
  ConfigFieldsResponse,
} from "../types.js";

export const configApi = {
  // ─── config (read-only grouped view) ──────────────────────────────────────
  async getConfigView(): Promise<ConfigViewResponse> {
    return jsonGet("/api/config/view");
  },
  // ─── config (schema-driven editor) ────────────────────────────────────────
  /** Every settable leaf key with its type/enum/default/description + current
   *  value - the source the Config editor renders. */
  async getConfigFields(): Promise<ConfigFieldsResponse> {
    return jsonGet("/api/config/fields");
  },
  /** Set a single config value (parity with `vibe config set <key> <value>`).
   *  Server validates the key against the schema allowlist and the value against
   *  the Zod schema; a bad key/value surfaces as a thrown ApiError (400). */
  async setConfigValue(key: string, value: string): Promise<{ value: unknown }> {
    return jsonPost("/api/config/set", { key, value });
  },
};

// Live integration smoke against the real hub at vibestrate.com. Network
// tests never run in CI - opt in with VIBESTRATE_HUB_LIVE=1. The fake-fetch
// unit suite (flow-hub tests) covers the contract; this proves the *live*
// server still matches it.
import { describe, it, expect } from "vitest";
import { searchHubFlows, pullHubFlow } from "../src/flows/hub/hub-client.js";

const live = process.env.VIBESTRATE_HUB_LIVE === "1";

describe.skipIf(!live)("flows hub - live contract (VIBESTRATE_HUB_LIVE=1)", () => {
  it("search returns normalized rows with refs", async () => {
    const r = await searchHubFlows({ limit: 5 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.length).toBeGreaterThan(0);
    for (const f of r.value) {
      expect(f.ref).toMatch(/^[^:]+:.+$/);
      // Normalization: live `summary`/`publishedBy` land in the canonical fields.
      expect(f.description ?? null).not.toBeUndefined();
    }
  }, 30_000);

  it("pull verifies the checksum and carries flow YAML", async () => {
    const search = await searchHubFlows({ limit: 1 });
    expect(search.ok).toBe(true);
    if (!search.ok || !search.value[0]) return;
    const pulled = await pullHubFlow({ ref: search.value[0].ref });
    expect(pulled.ok).toBe(true);
    if (!pulled.ok) return;
    expect(pulled.value.content.length).toBeGreaterThan(0);
  }, 30_000);

  it("pulling a nonexistent ref fails with a clear reason", async () => {
    const r = await pullHubFlow({ ref: "definitely-not-a-flow:9.9.9" });
    expect(r.ok).toBe(false);
  }, 30_000);
});

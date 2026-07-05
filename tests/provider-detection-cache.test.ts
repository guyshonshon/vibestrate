import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  detectAllProvidersCached,
  resetDetectionCache,
  KNOWN_PROVIDERS,
  type ProviderDetectionRunner,
} from "../src/providers/provider-detection.js";

/**
 * A fake detection runner that counts how many `<command> --version` probes
 * it receives. Each full `detectAllProviders` sweep probes every known
 * provider once, so one detection run == KNOWN_PROVIDERS.length calls. The
 * runner never spawns a real process.
 */
function countingRunner(): { runner: ProviderDetectionRunner; sweeps: () => number } {
  let calls = 0;
  const runner: ProviderDetectionRunner = async () => {
    calls += 1;
    return { exitCode: 127, stdout: "", stderr: "not found" };
  };
  return { runner, sweeps: () => calls / KNOWN_PROVIDERS.length };
}

describe("detectAllProvidersCached", () => {
  beforeEach(() => {
    resetDetectionCache();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    resetDetectionCache();
  });

  it("runs detection ONCE for two calls within the TTL", async () => {
    const { runner, sweeps } = countingRunner();

    const a = await detectAllProvidersCached(runner);
    const b = await detectAllProvidersCached(runner);

    expect(a).toHaveLength(KNOWN_PROVIDERS.length);
    expect(b).toBe(a); // same cached array instance
    expect(sweeps()).toBe(1);
  });

  it("de-duplicates concurrent (overlapping) calls into one run", async () => {
    const { runner, sweeps } = countingRunner();

    // Both start before the first resolves -> they must share one in-flight run.
    const [a, b] = await Promise.all([
      detectAllProvidersCached(runner),
      detectAllProvidersCached(runner),
    ]);

    expect(a).toBe(b);
    expect(sweeps()).toBe(1);
  });

  it("re-detects after the TTL expires", async () => {
    const { runner, sweeps } = countingRunner();

    await detectAllProvidersCached(runner);
    expect(sweeps()).toBe(1);

    // Advance past the 30s TTL.
    vi.advanceTimersByTime(31_000);

    await detectAllProvidersCached(runner);
    expect(sweeps()).toBe(2);
  });

  it("re-detects when forceRefresh bypasses the cache", async () => {
    const { runner, sweeps } = countingRunner();

    await detectAllProvidersCached(runner);
    expect(sweeps()).toBe(1);

    // Still inside the TTL, but forced -> fresh run.
    await detectAllProvidersCached(runner, { forceRefresh: true });
    expect(sweeps()).toBe(2);

    // The forced result repopulates the cache, so a follow-up is served cached.
    await detectAllProvidersCached(runner);
    expect(sweeps()).toBe(2);
  });
});

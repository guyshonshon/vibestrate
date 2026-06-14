import { describe, it, expect, vi, afterEach } from "vitest";
import { startSpinner } from "../src/cli/ui/spinner.js";

// The spinner writes to process.stderr and branches on stderr.isTTY. These tests
// mock the write + toggle isTTY, restoring both afterward.
describe("startSpinner", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("non-TTY: one static line, no animation, stop() is a safe no-op", () => {
    const write = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const orig = process.stderr.isTTY;
    (process.stderr as unknown as { isTTY: boolean }).isTTY = false;
    try {
      const sp = startSpinner("Consulting");
      expect(write).toHaveBeenCalledTimes(1);
      expect(write).toHaveBeenCalledWith("Consulting...\n");
      expect(() => {
        sp.stop();
        sp.stop();
      }).not.toThrow();
      expect(write).toHaveBeenCalledTimes(1); // stop wrote nothing on non-TTY
    } finally {
      (process.stderr as unknown as { isTTY: boolean }).isTTY = orig;
    }
  });

  it("TTY: animates on an interval; stop() clears the line and is idempotent", () => {
    vi.useFakeTimers();
    const write = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const orig = process.stderr.isTTY;
    (process.stderr as unknown as { isTTY: boolean }).isTTY = true;
    try {
      const sp = startSpinner("Working");
      const afterInitial = write.mock.calls.length;
      expect(afterInitial).toBeGreaterThanOrEqual(1); // immediate first frame
      expect(write.mock.calls.some((c) => String(c[0]).includes("Working"))).toBe(true);

      vi.advanceTimersByTime(250); // several frames tick
      const afterTicks = write.mock.calls.length;
      expect(afterTicks).toBeGreaterThan(afterInitial);

      sp.stop();
      expect(write.mock.calls.length).toBe(afterTicks + 1); // one clear write
      // idempotent + no further frames after stop
      sp.stop();
      vi.advanceTimersByTime(500);
      expect(write.mock.calls.length).toBe(afterTicks + 1);
    } finally {
      (process.stderr as unknown as { isTTY: boolean }).isTTY = orig;
    }
  });
});

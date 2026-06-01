import { describe, it, expect } from "vitest";
import { nextQueuePolicy, QUEUE_POLICIES } from "../src/shell/ink/queue/queue-actions.js";

describe("nextQueuePolicy", () => {
  it("cycles fifo → priority → fair → fifo", () => {
    expect(nextQueuePolicy("fifo")).toBe("priority");
    expect(nextQueuePolicy("priority")).toBe("fair");
    expect(nextQueuePolicy("fair")).toBe("fifo");
  });
  it("falls back to the first policy for an unknown value", () => {
    expect(nextQueuePolicy("nonsense")).toBe(QUEUE_POLICIES[0]);
  });
});

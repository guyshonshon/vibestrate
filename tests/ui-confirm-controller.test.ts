import { describe, it, expect } from "vitest";
import { createConfirmController } from "../src/ui/components/design/confirm-controller.js";

/**
 * These dialogs replaced window.confirm on destructive paths - aborting a run,
 * deleting a flow, applying and undoing a merge. What matters is not how they
 * look but that ONLY an explicit accept resolves `true`, and that no caller is
 * ever left awaiting a promise that never settles.
 */
describe("confirm controller fail-closed rules", () => {
  it("resolves true only on an explicit accept", () => {
    const c = createConfirmController();
    let got: unknown;
    c.open("confirm", { title: "Abort run?" }, (v) => (got = v));
    c.accept("");
    expect(got).toBe(true);
  });

  it("declines on cancel / Escape / backdrop", () => {
    const c = createConfirmController();
    let got: unknown;
    c.open("confirm", { title: "Delete flow?" }, (v) => (got = v));
    c.decline();
    expect(got).toBe(false);
  });

  it("declines rather than stranding the caller when torn down", () => {
    const c = createConfirmController();
    let got: unknown = "unsettled";
    c.open("confirm", { title: "Apply merge?" }, (v) => (got = v));
    c.dispose();
    expect(got).toBe(false);
  });

  it("declines a superseded request, so consent cannot leak to the next one", () => {
    const c = createConfirmController();
    let first: unknown = "unsettled";
    let second: unknown = "unsettled";
    c.open("confirm", { title: "Undo merge?" }, (v) => (first = v));
    c.open("confirm", { title: "Revert patch?" }, (v) => (second = v));
    expect(first).toBe(false); // settled the moment it was superseded
    c.accept("");
    expect(second).toBe(true);
    expect(first).toBe(false); // and accepting the second never revisits it
  });

  it("a prompt declines as null and accepts as its text", () => {
    const c = createConfirmController();
    let cancelled: unknown = "unsettled";
    c.open("prompt", { title: "Duplicate as:" }, (v) => (cancelled = v));
    c.decline();
    expect(cancelled).toBeNull();

    let saved: unknown;
    c.open("prompt", { title: "Duplicate as:" }, (v) => (saved = v));
    c.accept("profile-copy");
    expect(saved).toBe("profile-copy");
  });

  it("accepting with nothing open is inert", () => {
    const c = createConfirmController();
    expect(() => c.accept("")).not.toThrow();
    expect(c.current()).toBeNull();
  });

  it("tracks what is on screen so the view cannot render a stale request", () => {
    const seen: Array<string | null> = [];
    const c = createConfirmController((n) => seen.push(n ? n.kind : null));
    c.open("confirm", {}, () => {});
    c.accept("");
    c.open("prompt", {}, () => {});
    c.decline();
    expect(seen).toEqual(["confirm", null, "prompt", null]);
  });
});

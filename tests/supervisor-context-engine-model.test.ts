import { describe, expect, it } from "vitest";
import { modelContextEngine } from "../src/supervisor/context-engine-model.js";
import { viewForStep, enrichStep } from "../src/supervisor/context-engine.js";

/**
 * The model tier judges RELEVANCE, which is the thing a keyword list could not
 * do (see the calibration recorded in context-engine.ts).
 *
 * Its safety property is narrower than "trust the model": it answers with token
 * ids drawn from a list, and the system reads the bytes from the artifact those
 * ids name. So a hallucinating model can pick the wrong artifact, or name one
 * that does not exist, and still cannot put a single word into a seat's prompt
 * that some step did not actually produce.
 */
function view(candidates: { token: string; label: string; content: string }[]) {
  return viewForStep({
    step: { id: "review", label: "Review", seat: "reviewer", inputs: ["findings"], requiredInputs: ["findings"] },
    outputs: new Map([
      ["findings", { token: "findings", label: "Findings", content: "declared, never a candidate" }],
      ...candidates.map((c) => [c.token, c] as const),
    ]),
    task: "build a booking API",
  });
}

/** An assist runner that answers with whatever JSON the test dictates.
 *  Matches AssistProviderRunner: the answer arrives on `normalized`. */
function runnerAnswering(json: unknown) {
  return async () => ({
    exitCode: 0,
    normalized: { responseText: JSON.stringify(json), metrics: null },
    stderr: "",
    stdout: "",
  });
}

describe("context engine, model tier", () => {
  it("injects the artifact's OWN bytes, never the model's prose", async () => {
    const real = "ARCHITECTURE: we rejected polling for the latency budget.";
    const engine = modelContextEngine({
      projectRoot: process.cwd(),
      runner: runnerAnswering({
        selections: [
          // The model's `reason` is its own words and is carried as the reason.
          // Any content it tried to supply would have nowhere to go.
          { token: "architecture", reason: "the reviewer would re-litigate a settled decision" },
        ],
      }),
    });

    const result = await engine.proposeInjections(
      view([{ token: "architecture", label: "Architecture", content: real }]),
    );

    expect(result.injections).toHaveLength(1);
    // The injected content is the artifact, verbatim.
    expect(result.injections[0]?.content).toBe(real);
    expect(result.injections[0]?.reason).toContain("re-litigate");
    expect(result.injections[0]?.source).toBe("model-selected:architecture");
  });

  it("a hallucinated token resolves to nothing and is recorded", async () => {
    // The reason the answer is ids rather than prose: an invented id looks up
    // to nothing, where invented prose would have gone straight into a prompt.
    const engine = modelContextEngine({
      projectRoot: process.cwd(),
      runner: runnerAnswering({
        selections: [
          { token: "a-file-that-was-never-produced", reason: "sounds important" },
        ],
      }),
    });

    const result = await engine.proposeInjections(
      view([{ token: "architecture", label: "Architecture", content: "real content" }]),
    );

    expect(result.injections).toEqual([]);
    expect(result.note).toContain("naming no real artifact");
    expect(result.note).toContain("a-file-that-was-never-produced");
  });

  it("cannot reach an input the step already declares", async () => {
    // `findings` is declared, so it is not a candidate and not in the model's
    // prompt at all. Selecting it resolves to nothing, exactly like any other
    // token that is not on the list.
    const engine = modelContextEngine({
      projectRoot: process.cwd(),
      runner: runnerAnswering({
        selections: [{ token: "findings", reason: "I would like to restate this" }],
      }),
    });

    const result = await engine.proposeInjections(
      view([{ token: "architecture", label: "Architecture", content: "real" }]),
    );
    expect(result.injections).toEqual([]);
    expect(result.note).toContain("naming no real artifact");
  });

  it("selecting nothing is a legible answer, not a silent one", async () => {
    const engine = modelContextEngine({
      projectRoot: process.cwd(),
      runner: runnerAnswering({ selections: [] }),
    });
    const result = await engine.proposeInjections(
      view([{ token: "architecture", label: "Architecture", content: "real" }]),
    );
    expect(result.injections).toEqual([]);
    expect(result.note).toContain("none would change what this step does");
  });

  it("a provider failure is silence, and the step is unaffected", async () => {
    const engine = modelContextEngine({
      projectRoot: process.cwd(),
      runner: async () => {
        throw new Error("provider CLI missing");
      },
    });
    const result = await enrichStep(
      engine,
      view([{ token: "architecture", label: "Architecture", content: "real" }]),
    );
    expect(result.injections).toEqual([]);
    // enrichStep caught nothing - the engine handled it and reported a note,
    // so this is a deliberate degrade rather than an unhandled throw.
    expect(result.error).toBeNull();
    expect(result.note).toContain("did not run");
  });

  it("caps how many it may select, whatever the model asks for", async () => {
    const engine = modelContextEngine({
      projectRoot: process.cwd(),
      runner: runnerAnswering({
        selections: [
          { token: "a", reason: "r" },
          { token: "b", reason: "r" },
          { token: "c", reason: "r" },
          { token: "d", reason: "r" },
        ],
      }),
    });
    const result = await engine.proposeInjections(
      view([
        { token: "a", label: "A", content: "1" },
        { token: "b", label: "B", content: "2" },
        { token: "c", label: "C", content: "3" },
        { token: "d", label: "D", content: "4" },
      ]),
    );
    expect(result.injections.length).toBeLessThanOrEqual(2);
  });
});

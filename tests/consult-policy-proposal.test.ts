import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import {
  persistConsultPreferenceProposal,
  type ConsultAnswer,
  type ConsultResult,
} from "../src/consult/consult.js";
import { listPolicies } from "../src/project/project-policy-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({ exitCode: 127, stdout: "", stderr: "" });

function result(proposedPreference: ConsultAnswer["proposedPreference"]): ConsultResult {
  const answer: ConsultAnswer = {
    answer: "ok",
    confidence: "low",
    caveats: [],
    usedContext: [],
    recommendedActions: [],
    proposedManualUpdate: null,
    proposedPreference,
  };
  return {
    answer,
    usedSources: [],
    notes: [],
    sections: {
      recentActivity: [],
      openIntents: [],
      mentionedNeverWorked: [],
      suggestedNextSteps: [],
      housekeeping: [],
    },
    providerId: "p",
    profileId: "f",
    model: null,
    effort: null,
  };
}

describe("consult -> project policy proposal", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-consultpref-"));
    await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
    await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
    await execa("git", ["config", "user.name", "x"], { cwd: dir });
    await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
    await execa("git", ["add", "."], { cwd: dir });
    await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
    await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  });

  it("persists a proposed policy PENDING at project scope (advise tier, inert until confirmed)", async () => {
    const id = await persistConsultPreferenceProposal(
      dir,
      result({ statement: "do not use em-dash characters", correction: "use a hyphen", rationale: "the owner asked" }),
    );
    expect(id).toBe("do-not-use-em-dash-characters");
    const list = await listPolicies(dir);
    const got = list.find((p) => p.id === id)!;
    expect(got.source).toBe("supervisor-proposed");
    expect(got.confirmedAt).toBeNull(); // inert - the owner must confirm it
    expect(got.tier).toBe("advise"); // a model can never author a block
    expect(got.matcher).toBeNull();
  });

  it("does nothing when the consult proposed no policy", async () => {
    expect(await persistConsultPreferenceProposal(dir, result(null))).toBeNull();
  });
});

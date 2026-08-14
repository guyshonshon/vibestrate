// The crew editor's save plan is the one place a UI claim can become a lie: it
// decides which edits the dashboard reports as SAVED and which it hands back to
// the owner to paste. Only two routes write anything (PATCH a role's fields,
// PUT a role's prompt), so every other edit has to land in the manual bucket.
// Each test below fails if a change is promoted into `writable` that no route
// can actually perform.

import { describe, it, expect } from "vitest";
import { parse as parseYaml } from "yaml";
import type { CrewView, DiscoveredFlow } from "../src/ui/lib/types.js";
import {
  computeFlowFit,
  crewToEditorState,
  planCrewSave,
  rebaseRole,
  roleFileJson,
  seatVocabulary,
  validateEditorState,
  type CrewEditorState,
  type LoadedRolePrompt,
} from "../src/ui/components/crew/crew-editor-model.js";
import { parseRoleFile } from "../src/agents/role-schema.js";

function crewView(): CrewView {
  return {
    id: "review-heavy",
    label: "Review heavy",
    maxReviewLoops: null,
    roles: [
      {
        id: "executor",
        label: "Executor",
        seats: ["implementer"],
        profile: "claude-main",
        profileConfigured: true,
        provider: "claude",
        providerConfigured: true,
        permissions: "code_write",
        skills: [],
      },
      {
        id: "reviewer",
        label: "Reviewer",
        seats: ["reviewer"],
        profile: "codex-main",
        profileConfigured: true,
        provider: "codex",
        providerConfigured: true,
        permissions: "review_only",
        skills: [],
      },
    ],
  };
}

function prompts(): LoadedRolePrompt[] {
  return [
    {
      ok: true,
      roleId: "executor",
      promptPath: ".vibestrate/roles/executor.json",
      content: "You implement the plan.",
    },
    {
      ok: true,
      roleId: "reviewer",
      promptPath: ".vibestrate/roles/reviewer.json",
      content: "You review the diff.",
    },
  ];
}

function loaded(): CrewEditorState {
  return crewToEditorState(crewView(), prompts());
}

function flow(id: string, seats: string[], stepSeats: (string | undefined)[]): DiscoveredFlow {
  return {
    id,
    version: 1,
    label: id,
    description: "",
    source: { kind: "builtin", ref: id },
    definitionPath: null,
    definition: {
      id,
      version: 1,
      label: id,
      description: "",
      seats: Object.fromEntries(seats.map((s) => [s, { label: s }])),
      steps: stepSeats.map((seat, i) => ({
        id: `s${i}`,
        label: `s${i}`,
        kind: "agent-turn" as const,
        seat,
        inputs: [],
        outputs: [],
        optional: i > 0,
      })),
    },
  };
}

describe("planCrewSave", () => {
  it("reports a freshly loaded crew as clean", () => {
    const plan = planCrewSave(loaded());
    expect(plan.writable).toHaveLength(0);
    expect(plan.manual).toHaveLength(0);
    expect(plan.clean).toBe(true);
  });

  it("patches only the fields that changed", () => {
    const state = loaded();
    state.roles[0]!.permissions = "read_only";
    const plan = planCrewSave(state);
    expect(plan.manual).toHaveLength(0);
    expect(plan.writable).toHaveLength(1);
    const op = plan.writable[0]!;
    expect(op.kind).toBe("fields");
    if (op.kind !== "fields") throw new Error("expected a fields op");
    // Sending untouched keys would let an unrelated concurrent edit be
    // overwritten by whatever this page happened to load.
    expect(Object.keys(op.patch)).toEqual(["permissions"]);
    expect(op.patch.permissions).toBe("read_only");
  });

  it("treats a reordered seat list as no change", () => {
    const state = loaded();
    state.roles[0]!.seats = ["implementer"];
    state.roles[1]!.seats = ["reviewer"];
    expect(planCrewSave(state).clean).toBe(true);
  });

  it("writes a changed prompt through the prompt route", () => {
    const state = loaded();
    state.roles[1]!.prompt = "You review the diff against the plan.";
    const plan = planCrewSave(state);
    expect(plan.manual).toHaveLength(0);
    expect(plan.writable).toHaveLength(1);
    const op = plan.writable[0]!;
    expect(op.kind).toBe("prompt");
    if (op.kind !== "prompt") throw new Error("expected a prompt op");
    expect(op.roleId).toBe("reviewer");
    expect(op.content).toBe("You review the diff against the plan.");
  });

  it("rewrites the prompt of a role whose file never parsed, without being edited", () => {
    const state = crewToEditorState(crewView(), [
      prompts()[0]!,
      { ok: false, roleId: "reviewer", error: "not valid JSON" },
    ]);
    state.roles[1]!.prompt = "You review the diff.";
    const plan = planCrewSave(state);
    expect(plan.writable.map((o) => o.kind)).toEqual(["prompt"]);
  });

  it("never claims it can add a role", () => {
    const state = loaded();
    state.roles.push({
      key: "k-new",
      id: "verifier",
      label: "Verifier",
      seats: ["verifier"],
      profile: "claude-main",
      permissions: "verify_only",
      skills: [],
      prompt: "You run the checks.",
      promptPath: "",
      baseline: null,
      loadError: null,
    });
    const plan = planCrewSave(state);
    expect(plan.writable).toHaveLength(0);
    expect(plan.manual).toHaveLength(1);
    // Both halves have to reach the owner: a crew entry pointing at a file
    // nobody wrote stops the first run before an agent starts.
    const paths = plan.manual[0]!.blocks.map((b) => b.path);
    expect(paths).toContain(".vibestrate/roles/verifier.json");
    expect(paths).toContain(".vibestrate/project.yml");
  });

  it("never claims it can remove a role, and names the file to delete", () => {
    const state = loaded();
    const gone = state.roles[1]!.baseline!;
    state.roles = [state.roles[0]!];
    state.removed = [gone];
    const plan = planCrewSave(state);
    expect(plan.writable).toHaveLength(0);
    expect(plan.manual).toHaveLength(1);
    expect(plan.manual[0]!.reason).toContain(".vibestrate/roles/reviewer.json");
  });

  it("never patches a renamed role under either id", () => {
    const state = loaded();
    state.roles[1]!.id = "critic";
    state.roles[1]!.permissions = "read_only";
    const plan = planCrewSave(state);
    // The rename covers the whole role: patching "critic" would 404 and
    // patching "reviewer" would edit the entry the owner is replacing.
    expect(plan.writable).toHaveLength(0);
    expect(plan.manual).toHaveLength(1);
    expect(plan.manual[0]!.title).toContain("critic");
  });

  it("sends the crew's own label and review loops to the manual bucket", () => {
    const state = loaded();
    state.label = "Paranoid";
    state.maxReviewLoops = 3;
    const plan = planCrewSave(state);
    expect(plan.writable).toHaveLength(0);
    expect(plan.manual).toHaveLength(2);
  });

  it("emits a crew block for a new crew that parses back to the crew shape", () => {
    const state: CrewEditorState = {
      crewId: "solo",
      label: "Solo",
      maxReviewLoops: 2,
      baseline: null,
      removed: [],
      roles: [
        {
          key: "k1",
          id: "executor",
          label: "executor",
          seats: ["implementer"],
          profile: "claude-main",
          permissions: "code_write",
          skills: ["testing"],
          prompt: "You implement.",
          promptPath: "",
          baseline: null,
          loadError: null,
        },
      ],
    };
    const plan = planCrewSave(state);
    expect(plan.writable).toHaveLength(0);
    const yamlBlock = plan.manual[0]!.blocks.find((b) => b.title === "The crew block")!;
    const parsed = parseYaml(yamlBlock.body) as Record<string, any>;
    expect(parsed.solo.label).toBe("Solo");
    expect(parsed.solo.maxReviewLoops).toBe(2);
    expect(parsed.solo.roles.executor).toEqual({
      seats: ["implementer"],
      profile: "claude-main",
      prompt: ".vibestrate/roles/executor.json",
      permissions: "code_write",
      skills: ["testing"],
    });
    // A label equal to the role id was never written, so re-emitting one would
    // invent config the owner did not author.
    expect(parsed.solo.roles.executor.label).toBeUndefined();
  });
});

describe("role files", () => {
  it("names the file's id after its path, not the crew's key for the role", () => {
    // A role file is rejected when its declared id does not match its basename,
    // and several crews may key one shared file differently.
    const json = roleFileJson("planner", "You plan.");
    const parsed = parseRoleFile(json, ".vibestrate/roles/planner.json");
    expect(parsed.id).toBe("planner");
    expect(parsed.prompt).toBe("You plan.");
  });

  it("produces a role file the loader accepts for a role added in the editor", () => {
    const state = loaded();
    state.roles.push({
      key: "k-new",
      id: "verifier",
      label: "Verifier",
      seats: ["verifier"],
      profile: "claude-main",
      permissions: "verify_only",
      skills: [],
      prompt: "You run the checks.",
      promptPath: "",
      baseline: null,
      loadError: null,
    });
    const block = planCrewSave(state).manual[0]!.blocks.find((b) =>
      b.path.endsWith("verifier.json"),
    )!;
    expect(() => parseRoleFile(block.body, block.path)).not.toThrow();
  });
});

describe("rebaseRole", () => {
  it("clears exactly the ops that landed and leaves the rest pending", () => {
    const state = loaded();
    state.roles[0]!.permissions = "read_only";
    state.roles[0]!.prompt = "You implement, carefully.";
    // The fields call succeeded, the prompt call did not.
    state.roles[0] = rebaseRole(state.roles[0]!, { fields: true, prompt: false });
    const plan = planCrewSave(state);
    expect(plan.writable.map((o) => o.kind)).toEqual(["prompt"]);
  });

  it("keeps a role added in the editor out of the baseline", () => {
    const added = {
      key: "k-new",
      id: "verifier",
      label: "Verifier",
      seats: ["verifier"],
      profile: "claude-main",
      permissions: "verify_only",
      skills: [],
      prompt: "You run the checks.",
      promptPath: "",
      baseline: null,
      loadError: null,
    };
    expect(rebaseRole(added, { fields: true, prompt: true }).baseline).toBeNull();
  });
});

describe("computeFlowFit", () => {
  const state = loaded();

  it("blocks a flow whose seat no role takes", () => {
    const fits = computeFlowFit(state.roles, [
      flow("audit", ["auditor"], ["auditor"]),
    ]);
    expect(fits[0]!.status).toBe("blocked");
    expect(fits[0]!.missing).toEqual(["auditor"]);
  });

  it("counts an OPTIONAL step's seat, because resolution fills it before anything is skipped", () => {
    const fits = computeFlowFit(state.roles, [
      flow("build", ["implementer", "auditor"], ["implementer", "auditor"]),
    ]);
    expect(fits[0]!.status).toBe("blocked");
    expect(fits[0]!.missing).toEqual(["auditor"]);
  });

  it("flags a seat two roles take, which stops resolution just as hard", () => {
    const both = loaded();
    both.roles[1]!.seats = ["reviewer", "implementer"];
    const fits = computeFlowFit(both.roles, [
      flow("build", ["implementer"], ["implementer"]),
    ]);
    expect(fits[0]!.status).toBe("contested");
    expect(fits[0]!.contested).toEqual(["implementer"]);
  });

  it("ignores a declared seat no step asks for", () => {
    const fits = computeFlowFit(state.roles, [
      flow("build", ["implementer", "unused"], ["implementer"]),
    ]);
    expect(fits[0]!.status).toBe("ready");
  });

  it("ranks the broken flows first", () => {
    const fits = computeFlowFit(state.roles, [
      flow("ok", ["implementer"], ["implementer"]),
      flow("broken", ["auditor"], ["auditor"]),
    ]);
    expect(fits.map((f) => f.flowId)).toEqual(["broken", "ok"]);
  });
});

describe("seatVocabulary", () => {
  it("keeps a seat the crew uses that no installed flow declares", () => {
    const state = loaded();
    state.roles[0]!.seats = ["implementer", "legacy-seat"];
    const seats = seatVocabulary([flow("build", ["implementer"], ["implementer"])], state.roles);
    // Dropping it from the picker would silently strip it on the next save.
    expect(seats).toEqual(["implementer", "legacy-seat", "reviewer"]);
  });
});

describe("validateEditorState", () => {
  const ctx = { takenCrewIds: ["review-heavy"] };

  it("accepts a loaded crew as-is", () => {
    expect(validateEditorState(loaded(), ctx)).toEqual([]);
  });

  it("refuses an empty prompt, which the role-file schema rejects on load", () => {
    const state = loaded();
    state.roles[0]!.prompt = "   ";
    expect(validateEditorState(state, ctx).map((p) => p.code)).toEqual(["role-prompt"]);
  });

  it("refuses two roles sharing an id, which would silently drop one", () => {
    const state = loaded();
    state.roles[1]!.id = "executor";
    expect(validateEditorState(state, ctx).map((p) => p.code)).toContain("role-id-dupe");
  });

  it("refuses a role id that cannot be a role-file name", () => {
    const state = loaded();
    state.roles[0]!.id = "not a seat token";
    expect(validateEditorState(state, ctx).map((p) => p.code)).toContain("role-id");
  });

  it("refuses a new crew whose id is already taken", () => {
    const state = loaded();
    state.baseline = null;
    expect(validateEditorState(state, ctx).map((p) => p.code)).toContain("crew-id-taken");
  });

  it("refuses a role with no seats", () => {
    const state = loaded();
    state.roles[0]!.seats = [];
    expect(validateEditorState(state, ctx).map((p) => p.code)).toContain("role-seats");
  });
});

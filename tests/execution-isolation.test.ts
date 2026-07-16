import { describe, it, expect } from "vitest";
import { projectConfigSchema } from "../src/project/config-schema.js";
import { validateConfigPath } from "../src/project/config-introspection.js";
import {
  executionConfigSchema,
  isolationModeSchema,
} from "../src/core/execution/execution-backend-schema.js";

const minimal = {
  project: { name: "x" },
  providers: { claude: { type: "cli", command: "claude" } },
  profiles: { "claude-balanced": { provider: "claude" } },
  crews: {
    default: {
      roles: {
        planner: { seats: ["planner"], profile: "claude-balanced", prompt: "p", permissions: "read_only" },
        executor: { seats: ["implementer"], profile: "claude-balanced", prompt: "p", permissions: "code_write" },
      },
    },
  },
  defaultCrew: "default",
} as const;

describe("execution.isolation config (T14 slice 1)", () => {
  it("defaults to OFF - confinement is opt-in", () => {
    // execution block omitted entirely
    const omitted = projectConfigSchema.parse(minimal);
    expect(omitted.execution.isolation).toBe("off");
    expect(omitted.execution.backend).toBe("local-worktree");

    // execution present but isolation omitted
    const partial = projectConfigSchema.parse({ ...minimal, execution: { backend: "local-worktree" } });
    expect(partial.execution.isolation).toBe("off");
  });

  it("accepts the sandboxed mode and rejects anything else", () => {
    const on = executionConfigSchema.parse({ isolation: "sandboxed" });
    expect(on.isolation).toBe("sandboxed");
    expect(isolationModeSchema.safeParse("on").success).toBe(false);
    expect(isolationModeSchema.safeParse("docker").success).toBe(false);
  });

  it("is a schema-valid settable key (CLI `config set` + web parity, T8)", () => {
    // The schema-driven config layer (validateConfigPath) auto-exposes it - so
    // `vibe config set execution.isolation sandboxed` and the web raw-YAML editor
    // both reach it with no bespoke wiring.
    expect(validateConfigPath("execution.isolation").ok).toBe(true);
    expect(validateConfigPath("execution.backend").ok).toBe(true);
  });
});

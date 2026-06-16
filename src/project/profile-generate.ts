import { z } from "zod";
import { runAssist } from "../assist/assist-runner.js";
import { substituteParams } from "../flows/runtime/prompt-params.js";
import { resolveProfileForFlow, type ProjectProfile } from "./project-profile.js";
import type { FlowParam } from "../flows/schemas/flow-schema.js";

// ── Generate a default (Profiling, P4) ───────────────────────────────────────
//
// The ONLY place a provider touches the profiling loop, and it's strictly:
// optional, user-initiated, one-shot, read-only, and never auto-committed. A
// param may declare `generate: { instruction }`; when the user clicks "Generate"
// (CLI or dashboard) we interpolate the param's instruction with OTHER known
// profile values and ask `runAssist` for one typed value. The result is a
// SUGGESTION the user reviews/edits/accepts - this function never writes the
// profile. Works on any configured provider; required on none (if no provider /
// offline, `runAssist` throws and the field stays a normal manual input).

export class ProfileGenerateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileGenerateError";
  }
}

/** Build the type-appropriate output schema + a human JSON sketch for the model.
 *  Everything comes back as `{ value }`; we stringify it for the form/profile. */
function outputSchemaFor(def: FlowParam): {
  schema: z.ZodType<{ value: string | number | boolean }, z.ZodTypeDef, unknown>;
  hint: string;
} {
  switch (def.type) {
    case "number":
      return { schema: z.object({ value: z.number() }), hint: '{ "value": 42 }' };
    case "boolean":
      return { schema: z.object({ value: z.boolean() }), hint: '{ "value": true }' };
    case "enum": {
      const values = (def.values ?? []) as [string, ...string[]];
      return {
        schema: z.object({ value: z.enum(values) }),
        hint: `{ "value": "<one of: ${values.join(", ")}>" }`,
      };
    }
    case "path":
    case "string":
    default:
      return {
        schema: z.object({ value: z.string().min(1) }),
        hint: '{ "value": "..." }',
      };
  }
}

/**
 * Generate one suggested value for a `generate`-enabled param. Pure-ish: the
 * only side effect is the single gated, read-only provider call inside
 * `runAssist` (audited under the `assist` bucket). Throws ProfileGenerateError
 * for a bad request (unknown / non-generatable / secret param) and surfaces
 * AssistError as-is when the provider call itself fails.
 */
export async function generateParamSuggestion(input: {
  projectRoot: string;
  flowId: string;
  param: string;
  defs: Record<string, FlowParam>;
  profile: ProjectProfile;
  signal?: AbortSignal;
}): Promise<{ suggestion: string }> {
  const def = input.defs[input.param];
  if (!def) {
    throw new ProfileGenerateError(
      `Flow "${input.flowId}" has no param "${input.param}".`,
    );
  }
  if (def.secret) {
    throw new ProfileGenerateError(
      `Param "${input.param}" is a secret - secrets are collected as env var names, never generated.`,
    );
  }
  if (!def.generate) {
    throw new ProfileGenerateError(
      `Param "${input.param}" declares no \`generate\` hint, so there is nothing to generate.`,
    );
  }

  // Interpolate other KNOWN profile values into the instruction; a secret value
  // resolves to its [secret:name] placeholder (never the literal). An unknown
  // {{params.x}} is left visible rather than blanked.
  const known = resolveProfileForFlow(input.profile, input.flowId, input.defs);
  const substitution: Record<string, string> = {};
  for (const [name, p] of Object.entries(known)) {
    if (name === input.param) continue;
    substitution[name] = p.secret ? `[secret:${name}]` : p.value;
  }
  const instruction = substituteParams(def.generate.instruction, substitution);

  const { schema, hint } = outputSchemaFor(def);
  const result = await runAssist({
    projectRoot: input.projectRoot,
    label: `profile-generate:${input.flowId}.${input.param}`,
    instruction:
      `Generate a single value for the project setting "${input.param}". ${instruction}\n` +
      `Return only the value, typed as requested - no commentary.`,
    schema,
    schemaHint: hint,
    auditBucket: "assist",
    signal: input.signal,
  });
  return { suggestion: String(result.parsed.value) };
}

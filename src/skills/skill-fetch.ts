// ── Skill fetching + AI overview (Phase 5) ──────────────────────────────────
//
// Fetch a skill (a markdown file) from a URL and install it into
// `.vibestrate/skills/`, guarded like every other external content (SSRF +
// bounded + secret-redacted). The "AI overview" is a read-only assist run
// (§8) that judges a candidate skill against the local skills + crew: is it
// helpful, already present, or conflicting?

import path from "node:path";
import { z } from "zod";
import { writeText } from "../utils/fs.js";
import { projectSkillsDir } from "../utils/paths.js";
import { isPathInside } from "../utils/paths.js";
import { fetchGuardedText } from "../core/guarded-fetch.js";
import { redactSecretsInText } from "../core/diff-service.js";
import { discoverSkills } from "./skill-discovery.js";
import { runAssist, type AssistProviderRunner } from "../assist/assist-runner.js";
import type { FetchImpl } from "../flows/runtime/flow-portability.js";
import type { LoadedConfig } from "../project/config-loader.js";

const MAX_SKILL_BYTES = 256 * 1024;

export type SkillFetchResult =
  | { ok: true; name: string; relPath: string; redactedSecrets: number }
  | { ok: false; reason: string };

/** A safe flat skill filename from a URL basename or an explicit name. */
function safeSkillName(input: { url: string; name?: string }): string | null {
  const raw =
    input.name ??
    decodeURIComponent(new URL(input.url).pathname.split("/").pop() ?? "")
      .replace(/\.(md|markdown)$/i, "");
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return /^[a-z0-9][a-z0-9._-]*$/.test(slug) ? slug : null;
}

/**
 * Download a skill markdown and install it as `.vibestrate/skills/<name>.md`.
 * SSRF-guarded + bounded; secret-shaped content is redacted before it's written
 * (a skill is injected into prompts). Returns the install path or a reason.
 */
export async function installSkillFromUrl(input: {
  projectRoot: string;
  url: string;
  name?: string;
  fetchImpl?: FetchImpl;
  allowPrivateHosts?: boolean;
}): Promise<SkillFetchResult> {
  let name: string | null;
  try {
    name = safeSkillName({ url: input.url, name: input.name });
  } catch {
    return { ok: false, reason: `Invalid URL: ${input.url}` };
  }
  if (!name) {
    return { ok: false, reason: "Could not derive a safe skill name; pass --name." };
  }
  const got = await fetchGuardedText({
    url: input.url,
    fetchImpl: input.fetchImpl,
    allowPrivateHosts: input.allowPrivateHosts,
    maxBytes: MAX_SKILL_BYTES,
  });
  if (!got.ok) return { ok: false, reason: got.reason };
  if (!got.text.trim()) return { ok: false, reason: "The fetched skill was empty." };

  const { redacted, count } = redactSecretsInText(got.text);
  const skillsDir = projectSkillsDir(input.projectRoot);
  const dest = path.join(skillsDir, `${name}.md`);
  if (!isPathInside(skillsDir, dest)) {
    return { ok: false, reason: "Refusing to write outside the skills directory." };
  }
  await writeText(dest, redacted.endsWith("\n") ? redacted : `${redacted}\n`);
  return {
    ok: true,
    name,
    relPath: path.relative(input.projectRoot, dest),
    redactedSecrets: count,
  };
}

export const skillAssessmentSchema = z.object({
  verdict: z.enum(["helpful", "already_present", "conflicting"]),
  reason: z.string().min(1).max(600),
  overlaps: z.array(z.string()).max(20).optional(),
});
export type SkillAssessment = z.infer<typeof skillAssessmentSchema>;

/**
 * Read-only AI overview of a candidate skill against the project's local skills.
 * Judges helpful / already_present / conflicting. Reuses the assist primitive
 * (no worktree, broker-gated). `runner` is a test seam.
 */
export async function assessSkill(input: {
  projectRoot: string;
  skillText: string;
  loaded?: LoadedConfig;
  runner?: AssistProviderRunner;
}): Promise<SkillAssessment> {
  const local = await discoverSkills(input.projectRoot);
  const localList = local.length
    ? local
        .map((s) => `- ${s.name}${s.description ? `: ${s.description}` : ""}`)
        .join("\n")
    : "(none)";
  const instruction = [
    "A candidate skill is being considered for this project. Judge how it relates to the project's existing skills.",
    "Return a verdict:",
    "- helpful: it adds genuinely new, useful guidance not already covered.",
    "- already_present: a local skill already covers substantially the same ground.",
    "- conflicting: it contradicts or duplicates a local skill in a way that would confuse agents.",
    "List the names of any local skills it overlaps with.",
    "",
    "Project's local skills:",
    localList,
    "",
    "Candidate skill (markdown):",
    input.skillText.slice(0, 6000),
  ].join("\n");

  return (
    await runAssist({
      projectRoot: input.projectRoot,
      label: "skill:assess",
      instruction,
      schema: skillAssessmentSchema,
      schemaHint:
        '{ "verdict": "helpful|already_present|conflicting", "reason": "…", "overlaps": ["skill-name"] }',
      loaded: input.loaded,
      runner: input.runner,
    })
  ).parsed;
}

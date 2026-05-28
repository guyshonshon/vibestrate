import type { LoadedSkill } from "../skills/skill-schema.js";
import type { PermissionProfile } from "../permissions/permission-schema.js";
import type { ValidationResults } from "./validation-runner.js";

export type PriorArtifact = {
  label: string;
  content: string;
};

export type PromptBuildInput = {
  roleId: string;
  task: string;
  rules: string;
  rolePromptTemplate: string;
  skills: LoadedSkill[];
  priorArtifacts: PriorArtifact[];
  permission: PermissionProfile;
  permissionName: string;
  worktreePath: string | null;
  branchName: string | null;
  projectName: string;
  validationResults?: ValidationResults | null;
  additionalNotes?: string;
  /**
   * Pre-rendered "# Human Annotations" section (see annotations-service). The
   * user's file-pinned notes that opted into agent sharing; injected verbatim
   * so the whole crew acknowledges them. Empty/undefined → no section.
   */
  humanAnnotations?: string;
  /** Per-run brevity directive. Appends a short "be concise" section. */
  concise?: boolean;
};

const COMMON_BOUNDARIES = `You are running under Vibestrate.
Do not push.
Do not merge.
Respect your role and permission boundaries.
If blocked, say so clearly.
Do not fake results.`;

const WRITE_BOUNDARIES = `All code changes must happen only in the git worktree.
Do not edit secrets.
Do not weaken tests just to pass validation.
Do not make unrelated broad refactors.`;

const READ_ONLY_BOUNDARIES = `You are read-only.
Review artifacts and diff.
Do not edit files.`;

function renderPermissionSection(
  name: string,
  profile: PermissionProfile,
  worktreePath: string | null,
  branchName: string | null,
): string {
  const lines = [
    `# Permissions`,
    ``,
    `Profile: ${name}`,
    `Allow write: ${profile.allowWrite}`,
    `Allow shell: ${profile.allowShell}`,
    `Cwd policy: ${profile.cwd}`,
  ];
  if (worktreePath) lines.push(`Worktree: ${worktreePath}`);
  if (branchName) lines.push(`Branch: ${branchName}`);
  if (profile.forbiddenPaths?.length) {
    lines.push(``, `Forbidden paths:`);
    for (const p of profile.forbiddenPaths) lines.push(`- ${p}`);
  }
  if (profile.forbiddenOperations?.length) {
    lines.push(``, `Forbidden operations:`);
    for (const op of profile.forbiddenOperations) lines.push(`- ${op}`);
  }
  return lines.join("\n");
}

function renderSkills(skills: LoadedSkill[]): string {
  if (skills.length === 0) return "";
  const sections = [`# Attached Skills`, ``];
  for (const s of skills) {
    sections.push(`## ${s.name}`, ``, s.content.trim(), ``);
  }
  return sections.join("\n");
}

function renderPriorArtifacts(artifacts: PriorArtifact[]): string {
  if (artifacts.length === 0) return "";
  const sections = [`# Prior Artifacts`, ``];
  for (const a of artifacts) {
    sections.push(`## ${a.label}`, ``, a.content.trim(), ``);
  }
  return sections.join("\n");
}

function renderValidation(results: ValidationResults | null | undefined): string {
  if (!results) return "";
  const lines = [`# Validation Results`, ``];
  if (results.commands.length === 0) {
    lines.push(`No validation commands configured.`);
  } else {
    lines.push(
      `Total: ${results.summary.total}, Passed: ${results.summary.passed}, Failed: ${results.summary.failed}`,
      ``,
    );
    for (const c of results.commands) {
      lines.push(
        `- ${c.command} → exit ${c.exitCode} (${c.status}) in ${c.durationMs}ms`,
      );
    }
  }
  return lines.join("\n");
}

export function buildRolePrompt(input: PromptBuildInput): string {
  const sections: string[] = [];

  sections.push(`# Vibestrate Agent: ${input.roleId}`);
  sections.push(``);
  sections.push(`Project: ${input.projectName}`);
  sections.push(`Task: ${input.task}`);
  sections.push(``);

  sections.push(`# Safety Boundaries`);
  sections.push(``);
  sections.push(COMMON_BOUNDARIES);

  if (input.permission.allowWrite) {
    sections.push(``);
    sections.push(WRITE_BOUNDARIES);
  } else {
    sections.push(``);
    sections.push(READ_ONLY_BOUNDARIES);
  }

  sections.push(``);
  sections.push(
    renderPermissionSection(
      input.permissionName,
      input.permission,
      input.worktreePath,
      input.branchName,
    ),
  );

  sections.push(``);
  sections.push(`# Project Rules`);
  sections.push(``);
  sections.push(input.rules.trim());

  if (input.humanAnnotations && input.humanAnnotations.trim().length > 0) {
    sections.push(``);
    sections.push(input.humanAnnotations.trim());
  }

  const skills = renderSkills(input.skills);
  if (skills) {
    sections.push(``);
    sections.push(skills);
  }

  const priors = renderPriorArtifacts(input.priorArtifacts);
  if (priors) {
    sections.push(``);
    sections.push(priors);
  }

  const validation = renderValidation(input.validationResults);
  if (validation) {
    sections.push(``);
    sections.push(validation);
  }

  sections.push(``);
  sections.push(`# Role Instructions`);
  sections.push(``);
  sections.push(input.rolePromptTemplate.trim());

  if (input.additionalNotes) {
    sections.push(``);
    sections.push(`# Additional Notes`);
    sections.push(``);
    sections.push(input.additionalNotes.trim());
  }

  if (input.concise) {
    sections.push(``);
    sections.push(`# Response Style: Concise`);
    sections.push(``);
    sections.push(
      [
        "The user enabled concise mode for this run. Optimize for token efficiency:",
        "- No preamble, no recap of the prompt, no \"I'll now …\" lines.",
        "- Prefer unified diffs to re-stating surrounding code.",
        "- Use bullets over paragraphs when listing.",
        "- Skip section headings inside short responses.",
        "- Only include rationale that materially changes the decision.",
        "- It's better to ask a one-line clarifying question than to over-explain.",
      ].join("\n"),
    );
  }

  return `${sections.join("\n")}\n`;
}

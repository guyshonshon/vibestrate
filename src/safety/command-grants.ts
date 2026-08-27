/**
 * What a shell-capable seat is allowed to run.
 *
 * WHY THIS EXISTS. `--permission-mode acceptEdits` auto-approves file edits but
 * NOT Bash. In headless `claude -p`, a command outside the allow rules waits
 * for an approval nobody can give: the call hangs and the turn produces
 * nothing. Measured on a real run - a reviewer seat made 39 Bash attempts and
 * collected 21 "This command requires approval" results while its own profile
 * said `allowShell: true`. Every "the tests were never executed" refusal in the
 * benchmark program traces back here.
 *
 * WHAT THIS IS NOT. It is not a sandbox. Any interpreter in the list is a full
 * shell (`node -e "..."`), so a narrow rule does not contain anything. Its
 * value is blast-radius-by-default and an auditable record of what a seat was
 * permitted to run. Real containment is `execution.isolation` and the
 * container backend with its egress allowlist.
 */

/** Read-only inspection every judging seat needs; none of these mutate. */
const INSPECTION = [
  "Bash(git status:*)",
  "Bash(git diff:*)",
  "Bash(git log:*)",
  "Bash(git show:*)",
  "Bash(ls:*)",
  "Bash(cat:*)",
  "Bash(head:*)",
  "Bash(tail:*)",
  "Bash(wc:*)",
  "Bash(grep:*)",
  "Bash(rg:*)",
  "Bash(find:*)",
];

/**
 * The language runtimes a seat needs to RUN the thing it is judging.
 *
 * Included by default because of what the grant is and is not. Scoping buys
 * blast-radius-by-default and an auditable record - it does not contain
 * anything, since any interpreter here is already a full shell (`node -e`).
 * Excluding them bought no safety and cost the whole feature: a project with
 * no `commands.validate` gave its reviewer inspection-only rules, so it could
 * read the code and never execute it - which is the exact silent failure this
 * module exists to end. Package INSTALLERS are deliberately absent; those
 * reach the network and belong in an explicit `allowedCommands`.
 */
const RUNTIMES = [
  "Bash(node:*)",
  "Bash(python:*)",
  "Bash(python3:*)",
  "Bash(pytest:*)",
  "Bash(go:*)",
  "Bash(cargo:*)",
];

/** The leading binary of a shell command, as a claude tool rule prefix. */
function ruleForCommand(command: string): string | null {
  const first = command.trim().split(/\s+/)[0];
  if (!first || first.includes("/") || /[^\w.-]/.test(first)) return null;
  return `Bash(${first}:*)`;
}

/**
 * The grant for one turn.
 *
 * An explicit `allowedCommands` on the permission profile always wins. With
 * none, the grant is derived from the project's OWN declared validation
 * commands plus read-only inspection - so a seat can run the checks the
 * project already says define "working", and nothing else.
 */
export function resolveCommandGrants(input: {
  profileAllowedCommands?: readonly string[] | null;
  validateCommands?: readonly string[];
}): string[] {
  if (input.profileAllowedCommands && input.profileAllowedCommands.length > 0) {
    return [...input.profileAllowedCommands];
  }
  const derived = new Set([...INSPECTION, ...RUNTIMES]);
  for (const command of input.validateCommands ?? []) {
    const rule = ruleForCommand(command);
    if (rule) derived.add(rule);
  }
  return [...derived];
}

// GENERATED FILE - DO NOT EDIT BY HAND.
//
// Compiled from docs/content/**.md, docs/content/_nav.json and
// docs/generated/*.json by `tsx src/consult/handbook/build-handbook.ts`.
// Edit the docs and regenerate; tests/consult-handbook.test.ts fails if this
// file and the docs disagree.
//
// It is a module, not a data file, on purpose: the retriever imports it
// statically so the corpus is bundled into dist/index.js and there is no path
// a project could shadow. See handbook-compile.ts for the full rationale.
import type { HandbookCorpus } from "./handbook-compile.js";

export const HANDBOOK_CORPUS: HandbookCorpus = {
  "schemaVersion": 1,
  "lexicon": "22 512 abort acceptanc access act activity adaptiv add-flow add-provider add-skill advanc advi advisor agent aider allow allowlist already alway amp analysi analyz analyze-risk analyze-test annotat answerer anti anti-pattern anyth api apply apply-only approv arbiter arbitrat architect architectur archiv arg array artifact ask assist assum assuranc attach attend audit auth authenticat author authz auto auto-retri autonomy backend backoff banner bas becom behavior behind best-effort big big-pictur block blocker board bound branch brand brief broader broker budget builder built built-in bundl c0 canva cap cap-and-continu capability car catalog cau caveat ceil challeng challenge-respons challenger chatbot cheap checklist claud claude-cod clean cleanly cli clo clock cloud cmd co coar codeba codebas codex coding-agent command commit complet concept concurrency concurrent conductor confidenc config configurabl configurat confinement confirm conflict constraint consult container context continu continuou contract control control-character correctness cost create-and-run creator credenti crew crush csrf ctrl ctrl-k curat cursor customiz daemon daily dashboard debug-fail decid decis decision-summary dedicat deeper default-allow default-deny definit delay deliberately deny detach detail deterministic diff directory-map disposabl doc docker doctor doesn dollar doorway downgrad downgrade-model draft drop dry dry-run earlier editor effect effort egress email enabl end enforc enforcement enhanc enter environment ephemer esc escalat event everyth execut executor exhaust exist expect explicit export express extend extern fail-clo fallback fast featur fell fifty fil filesystem fill first first-run fixer flag flight flow forbid form fresh fully gap gap-fill gat gateway gemini generat getting-start git git-tree-merg glanc glob glossary good goos guard guid halt hand handoff hard harden head headless hero high hint hold hom honest honor horizont http http-api hub human id imag implement implementat implementation-review implementer in-progress index info informat inherit init initializ inject input insid inspect inspect-progress inspector inst installat instruct intak integrat interactiv invariant isn isolat item itself json key kind label last leak learn least leav ledger legibility len library lifecycl limit link liter liv loc localhost localhost-proxy log look loop loopback loudly machin main manu map max mcp md ment merg merge_ready methodology metric micro micro-plan min minimalism mod model mov ms narrow nativ navigator ndjson network never newer non non-cli non-loopback noth notificat nudg nul objectiv ollama onc opencod operat opt-in orb orchestrator os outcom outsid over-stuf overview overwrit owner owner-only packet panel panel-review param parameter parent parity past patch path pattern pau paus pause-resum pct per per-pha per-provider permiss persona pha pick pick-up pickup pickup-analysi pickup-review pictur pid pin plain plan plan-only plan-review planner plausibl plausible-but-wrong point policy policy-gat ponytail post post-turn postur pre pre-publish predict prefix preserv preset preset-ready preview proc profil progress project project-param prompt propo protect provider provider-auth provider-nativ proxy prun publish push quality quality-arbitrat quest queu quota qwen rang rat rate-limit re re-run re-sequenc reach read-only read-writ readonly ready real reason recogniz recommendat record red redact reduc reduce-effort referenc refin refu register remot renam reorder repeat replay report repository request requir resilienc resolv respect respons restor resum retent retri retry reu reus revalidat review review-authz review-correctness review-inject review-item review-risk review-secret review-security-risk review-test reviewer rewind right risk risky roadmap rol root round router routin rul run runtim safety saga sandbox scaffold scan scheduler schema scop scor seat second-review secret secret-scan security security-review seed selector sequenc sequentially servic sess setup sharpen shell shift simplify skill skip snapshot soft sourc sovereignty spec spec-up spec-up-intak spec-up-review spec-up-roadmap spend ssrf stabl stag standard stat statu stay step step-by-step strict stuf subcommand subscript suggest summary supers supervi supervis supervised-task supervisor supervisor-control surfac switcher synthesiz tab target task task-lifecycl teach telemetry termin test thorough threshold tier tighten timelin timeout token touch transient tre troubleshoot truth turn twic ui unattend unavailabl understand undo unprotect unsaf unsandbox until unver usag usd user-request using validat ver verbatim verdict verifier verify veto vib vibestrat vibestrate-md vibestrate_param visibl vs wait waiting_for_approv walkthrough wall warn weak web welcom whol why-a-human wider window without workflow workspac worktr worktre yaml yellow yes yml zero zero-egress",
  "entries": [
    {
      "id": "cli/abort",
      "kind": "cli",
      "title": "vibe abort",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Mark a run as aborted (does not delete the worktree).",
      "titleTerms": "abort",
      "terms": "a abort as delet doe mark not run the vib worktre",
      "body": "```text\nvibe abort - Mark a run as aborted (does not delete the worktree).\n```"
    },
    {
      "id": "cli/approvals",
      "kind": "cli",
      "title": "vibe approvals",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Inspect and resolve human-approval requests for a paused run.",
      "titleTerms": "approv",
      "terms": "a and approv chang for guidanc human human-approv inspect json list not paus reject request request-chang resolv run show vib",
      "body": "```text\nvibe approvals - Inspect and resolve human-approval requests for a paused run.\n  vibe approvals list [--json] - Show all approval requests for a run.\n  vibe approvals show [--json] - Show a single approval request in detail.\n  vibe approvals approve [--note] - Approve a pending approval. Resumes the run if it is waiting.\n  vibe approvals reject [--note] - Reject a pending approval. The run will be marked `blocked`.\n  vibe approvals request-changes [--guidance] - Return an agent-requested gate with guidance; the stage re-runs with it.\n```"
    },
    {
      "id": "cli/assurance",
      "kind": "cli",
      "title": "vibe assurance",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Show a run's Run Assurance verdict (evidence-backed; from the Action Broker log + review/verification).",
      "titleTerms": "assuranc",
      "terms": "a act assuranc back broker evidenc evidence-back from json log review run s show the verdict verificat vib",
      "body": "```text\nvibe assurance [--json] - Show a run's Run Assurance verdict (evidence-backed; from the Action Broker log + review/verification).\n```"
    },
    {
      "id": "cli/audit",
      "kind": "cli",
      "title": "vibe audit",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Show a run's audit tree (flow steps, per-step attempts incl. retries/fallbacks, control events).",
      "titleTerms": "audit",
      "terms": "a attempt audit control event fallback flow incl json per per-step retry run s show step tre vib",
      "body": "```text\nvibe audit [--json] - Show a run's audit tree (flow steps, per-step attempts incl. retries/fallbacks, control events).\n```"
    },
    {
      "id": "cli/budget",
      "kind": "cli",
      "title": "vibe budget",
      "source": "CLI reference (generated from the command tree)",
      "summary": "View or configure the daily spend cap (and what happens when it's hit).",
      "titleTerms": "budget",
      "terms": "act and budget cap configur daily day fallback happen hit it limit max max-time-day max-time-run max-turns-day max-turns-run off on on-limit or run s set show spend the tim turn vib view warn what when",
      "body": "```text\nvibe budget - View or configure the daily spend cap (and what happens when it's hit).\n  vibe budget show - Show the configured cap, action, and today's spend so far.\n  vibe budget set [--cap --action --warn --fallback --max-turns-run --max-time-run --max-turns-day --max-time-day --on-limit] - Set the daily spend cap and/or the action taken when it's reached.\n  vibe budget off - Remove the daily spend cap.\n```"
    },
    {
      "id": "cli/bundles",
      "kind": "cli",
      "title": "vibe bundles",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Group reviewed suggestions into a review pass that applies, validates, and reverts as a unit.",
      "titleTerms": "bundl",
      "terms": "a add and apply approv as auto auto-revert-fail auto-revert-on-fail bundl clear creat descript fail group into json list not on pass preflight profil reject remov revert review set show smart smart-apply stop stop-on-validation-fail suggest that titl unit use use-suggestion-profil validat vib",
      "body": "```text\nvibe bundles - Group reviewed suggestions into a review pass that applies, validates, and reverts as a unit.\n  vibe bundles list [--json] - List every bundle (review pass) attached to a run.\n  vibe bundles create [--title --description --suggestion] - Create a new review pass (bundle) for a run.\n  vibe bundles add - Add a suggestion to a draft bundle.\n  vibe bundles remove - Remove a suggestion from a draft bundle.\n  vibe bundles approve [--note] - Approve a review pass (gate before apply).\n  vibe bundles reject [--note] - Reject a review pass.\n  vibe bundles apply [--validate --auto-revert-on-fail --profile] - Apply every suggestion in the review pass to the run worktree (all-or-nothing with rollback).\n  vibe bundles smart-apply [--stop-on-validation-fail --auto-revert-failing --profile --use-suggestion-profiles] - Apply suggestions one-by-one in order. Earlier successes stay applied if a later step fails.\n  vibe bundles validate [--profile] - Run commands.validate against the run worktree, attached to a bundle.\n  vibe bundles revert - Revert every suggestion in the review pass via git apply -R (worktree only).\n  vibe bundles preflight - Run a static-only preflight without modifying the worktree.\n  vibe bundles profile - Read or edit a review pass's validation profile metadata.\n    vibe bundles profile show - Print the bundle's current validation profile (if any).\n    vibe bundles profile set - Set the bundle's validation profile. Future validation runs use this profile. Does NOT re-run validation.\n    vibe bundles profile clear - Clear the bundle's validation profile back to default (commands.validate).\n```"
    },
    {
      "id": "cli/config",
      "kind": "cli",
      "title": "vibe config",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Show and edit .vibestrate/project.yml without hand-editing YAML.",
      "titleTerms": "config",
      "terms": "and config edit get hand hand-edit json key project set show validat vib vibestrat view without yaml yml",
      "body": "```text\nvibe config - Show and edit .vibestrate/project.yml without hand-editing YAML.\n  vibe config view [--json] - Readable, grouped view of the config - each section shows where it's editable.\n  vibe config show [--json] - Print the raw config YAML and validate it.\n  vibe config get [--json] - Print a single config value (dot-path, e.g. commands.validate).\n  vibe config set - Set a config value. Booleans/numbers/strings parsed automatically; arrays/objects via JSON (e.g. 'vibe config set commands.validate \"[\\\"pnpm test\\\"]\"').\n  vibe config keys - List every settable config key with its type, allowed values, and default (from the schema).\n  vibe config validate [--json] - Validate the project.yml file against the Vibestrate schema.\n```"
    },
    {
      "id": "cli/consult",
      "kind": "cli",
      "title": "vibe consult",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Ask the project orchestrator a question, answered from controlled project context (read-only).",
      "titleTerms": "consult",
      "terms": "a answer ask consult context control effort fil from json model only orchestrator profil project provider quest read read-only run task the vib",
      "body": "```text\nvibe consult [--task --run --file --profile --provider --model --effort --json] - Ask the project orchestrator a question, answered from controlled project context (read-only).\n```"
    },
    {
      "id": "cli/crew",
      "kind": "cli",
      "title": "vibe crew",
      "source": "CLI reference (generated from the command tree)",
      "summary": "List crews, show a crew's roles, and set the default (\"active\") crew.",
      "titleTerms": "crew",
      "terms": "a activ add and crew default draft json list preset rol s set show the use vib yaml",
      "body": "```text\nvibe crew - List crews, show a crew's roles, and set the default (\"active\") crew.\n  vibe crew list [--json] - List configured crews (the default is marked).\n  vibe crew show [--json] - Show a crew's roles, profiles, and seats (default crew if omitted).\n  vibe crew use - Set the default (\"active\") crew - runs without --crew use it.\n  vibe crew draft [--yaml --json] - Turn an English description into an editable Crew draft (supervisor-assisted). Draft only - never writes; adopting it means saving the printed role files, then the block, into project.yml.\n  vibe crew presets - Ready-made crews (fast / thorough) tuned by provider effort.\n    vibe crew presets list [--json] - List available presets and whether they're installed.\n    vibe crew presets add - Install a preset crew (fast / thorough) into project.yml.\n```"
    },
    {
      "id": "cli/doctor",
      "kind": "cli",
      "title": "vibe doctor",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Check environment, config, providers, and recommend next steps.",
      "titleTerms": "doctor",
      "terms": "and check config doctor environment fix json next provider recommend step vib",
      "body": "```text\nvibe doctor [--json --fix] - Check environment, config, providers, and recommend next steps.\n```"
    },
    {
      "id": "cli/editor",
      "kind": "cli",
      "title": "vibe editor",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Configure and test the local editor handoff used by the dashboard.",
      "titleTerms": "editor",
      "terms": "and arg by configur dashboard detect editor handoff lin loc set test the used vib",
      "body": "```text\nvibe editor - Configure and test the local editor handoff used by the dashboard.\n  vibe editor detect - Probe known editors (code, code-insiders, cursor) for availability.\n  vibe editor set [--args] - Enable editor handoff and store the command (default args use --goto path:line:column).\n  vibe editor test [--line] - Open a file (default: README.md) using the configured editor command.\n```"
    },
    {
      "id": "cli/flows",
      "kind": "cli",
      "title": "vibe flows",
      "source": "CLI reference (generated from the command tree)",
      "summary": "List and inspect Flow run recipes from built-ins and .vibestrate/flows.",
      "titleTerms": "flow",
      "terms": "allow allow-token-to-custom-host and arbitrat bas base-url built built-in clear crew custom draft export export-arbitrat fil flow from handl host hub import ins inspect install json list nam out overwrit publish recip risk run show suggest to token url use vers vib vibestrat yaml yes",
      "body": "```text\nvibe flows - List and inspect Flow run recipes from built-ins and .vibestrate/flows.\n  vibe flows list [--json] - Show every discovered Flow.\n  vibe flows show [--json --crew] - Print a Flow's seats, ordered steps, and crew seat-coverage.\n  vibe flows use [--clear] - Set the default Flow applied to runs without --flow (always shown), or --clear it.\n  vibe flows suggest [--file --risk --json] - Suggest a Flow from task risk signals and local Flow outcomes.\n  vibe flows draft [--crew --yaml --json] - Turn an English description into an editable Flow draft (supervisor-assisted). Draft only - never writes; adopt it with `flows import`.\n  vibe flows export [--out --json] - Export a Flow as canonical YAML (for sharing / backup).\n  vibe flows import [--overwrite --json] - Import a Flow from a local file path or an http(s) URL into .vibestrate/flows/.\n  vibe flows export-arbitration [--out] - Export a Quality Arbitration run as local JSON evidence for later evaluation.\n  vibe flows hub - Browse + install Flows from the community hub (vibestrate.com/api/hub).\n    vibe flows hub list [--base-url --json] - List (or search) Flows in the hub.\n    vibe flows hub install [--base-url --overwrite] - Pull + verify + install a hub Flow (by ref) into .vibestrate/flows/.\n    vibe flows hub publish [--version --name --handle --base-url --allow-token-to-custom-host --yes --json] - Publish a project flow to the hub (public, immutable).\n```"
    },
    {
      "id": "cli/gateways",
      "kind": "cli",
      "title": "vibe gateways",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Inspect and toggle notification delivery gateways.",
      "titleTerms": "gateway",
      "terms": "and delivery disabl enabl gateway inspect json list notificat test toggl vib",
      "body": "```text\nvibe gateways - Inspect and toggle notification delivery gateways.\n  vibe gateways list [--json] - Show available gateways and their enabled/valid status.\n  vibe gateways test - Send a test message through a gateway (no real notification persisted).\n  vibe gateways enable - Enable a configured gateway.\n  vibe gateways disable - Disable a gateway. Existing config is preserved.\n```"
    },
    {
      "id": "cli/guide",
      "kind": "cli",
      "title": "vibe guide",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Manage VIBESTRATE.md (the agent's operating guide for this project) and its proposals.",
      "titleTerms": "guid",
      "terms": "agent all and apply for guid init its manag md operat project propos reject s show the thi vib vibestrat",
      "body": "```text\nvibe guide - Manage VIBESTRATE.md (the agent's operating guide for this project) and its proposals.\n  vibe guide show - Print the project's VIBESTRATE.md (or note that there is none).\n  vibe guide init - Scaffold a starter VIBESTRATE.md at the project root (refuses if one exists).\n  vibe guide proposals [--all] - List open VIBESTRATE.md proposals (e.g. from consult).\n    vibe guide proposals show - Show a proposal's full suggested text.\n  vibe guide apply - Apply a proposal - append its text to VIBESTRATE.md (guarded write).\n  vibe guide reject - Reject a proposal (keeps it on record, marked rejected).\n```"
    },
    {
      "id": "cli/init",
      "kind": "cli",
      "title": "vibe init",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Initialize Vibestrate in the current project (.vibestrate/ scaffold).",
      "titleTerms": "init",
      "terms": "current f git git-init in init initializ interactiv project scaffold the vib vibestrat yes",
      "body": "```text\nvibe init [-f --yes --interactive --git-init] - Initialize Vibestrate in the current project (.vibestrate/ scaffold).\n```"
    },
    {
      "id": "cli/integrate",
      "kind": "cli",
      "title": "vibe integrate",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Preview + integrate merge-ready run branches into a dedicated branch (never main, never push).",
      "titleTerms": "integrat",
      "terms": "a advis analyz apply branch confirm dedicat finish integrat into json list main merg merge-ready never preview push ready run vib",
      "body": "```text\nvibe integrate - Preview + integrate merge-ready run branches into a dedicated branch (never main, never push).\n  vibe integrate list - List merge-ready runs (integration candidates).\n  vibe integrate preview - Dry-run merge the selected (or all) merge-ready branches; show conflicts.\n  vibe integrate advise [--json] - Read-only merge advice for the selected (or all) merge-ready runs: risk flags, assurance lanes, topology, dry-run conflicts, and a deterministic recommendation. Mutates nothing.\n  vibe integrate analyze [--json] - Optional read-only LLM pass over the run's redacted diff vs main: semantic risk narrative (never a merge verdict). Spawns a local provider; caches markdown under the run.\n  vibe integrate apply [--into] - Integrate the selected (or all) merge-ready branches into --into <branch>.\n  vibe integrate finish [--confirm] - Merge a complete, clean integration branch into main - locally, with explicit confirmation, never pushed. Refuses partial integrations, dirty trees, and conflicts.\n```"
    },
    {
      "id": "cli/learn",
      "kind": "cli",
      "title": "vibe learn",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Regenerate .vibestrate/CODEBASE.md, an auto-derived map of the project's stack, layout, and routes.",
      "titleTerms": "learn",
      "terms": "an and auto auto-deriv codebas deriv layout learn map md of project regenerat rout s show stack the vib vibestrat",
      "body": "```text\nvibe learn - Regenerate .vibestrate/CODEBASE.md, an auto-derived map of the project's stack, layout, and routes.\n  vibe learn show - Print the current CODEBASE.md (run `vibe learn` first if there is none).\n```"
    },
    {
      "id": "cli/ledger",
      "kind": "cli",
      "title": "vibe ledger",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Show the project continuity brief (what shipped, what's open).",
      "titleTerms": "ledger",
      "terms": "add brief continuity detail json kind ledger limit open project s ship show statu tag the titl vib what",
      "body": "```text\nvibe ledger [--json --limit] - Show the project continuity brief (what shipped, what's open).\n  vibe ledger add [--kind --title --detail --tags --status --json] - Hand-add a ledger entry - the same write path the dashboard's \"Add entry\" form uses.\n```"
    },
    {
      "id": "cli/logs",
      "kind": "cli",
      "title": "vibe logs",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Show the captured provider stdout/stderr stream for a run (the model's live CLI output).",
      "titleTerms": "log",
      "terms": "a captur cli follow for liv log model output provider run s show stderr stdout stream the vib",
      "body": "```text\nvibe logs [--follow --stream] - Show the captured provider stdout/stderr stream for a run (the model's live CLI output).\n```"
    },
    {
      "id": "cli/notifications",
      "kind": "cli",
      "title": "vibe notifications",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Inspect and manage local Vibestrate notifications.",
      "titleTerms": "notificat",
      "terms": "all and attent attention-only inspect json list loc manag notificat only read read-all resolv set test unread unread-only vib vibestrat",
      "body": "```text\nvibe notifications - Inspect and manage local Vibestrate notifications.\n  vibe notifications list [--unread-only --attention-only --json] - Show notifications.\n  vibe notifications read - Mark a notification read.\n  vibe notifications resolve - Mark a notification resolved.\n  vibe notifications read-all - Mark every unread notification as read.\n  vibe notifications settings - Show current notification settings and configured gateways.\n  vibe notifications test - Send a tiny test notification through a configured gateway.\n```"
    },
    {
      "id": "cli/params",
      "kind": "cli",
      "title": "vibe params",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Durable project parameters: typed param answers persisted + reused across runs.",
      "titleTerms": "param",
      "terms": "accept across answer durabl flow generat get json list param parameter persist project reus run set typ unset vib",
      "body": "```text\nvibe params - Durable project parameters: typed param answers persisted + reused across runs.\n  vibe params list [--json] - List every stored param answer (secrets shown as env refs).\n  vibe params get - Print one stored value (secrets shown as env refs).\n  vibe params set [--flow] - Set one or more values: `vibe params set --flow <id> name=Acme niche=SaaS`. With --flow, keys are flow params (type-checked, secret-aware). Without it, keys are raw param keys (bare = project-global).\n  vibe params generate [--flow --accept] - Draft a value for a `generate`-enabled param via a provider (optional, user-initiated, reviewed). Prints a suggestion; --accept stores it.\n  vibe params unset - Remove stored values by key (explicit, never automatic).\n```"
    },
    {
      "id": "cli/path",
      "kind": "cli",
      "title": "vibe path",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Show a run's workspace (worktree path + branch) so you can cd into it.",
      "titleTerms": "path",
      "terms": "a branch can cd into it json path run s show so vib workspac worktre you",
      "body": "```text\nvibe path [--cd --json] - Show a run's workspace (worktree path + branch) so you can cd into it.\n```"
    },
    {
      "id": "cli/pause",
      "kind": "cli",
      "title": "vibe pause",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Request that an active run pause at the next stage boundary.",
      "titleTerms": "paus",
      "terms": "activ an at boundary next paus request run stag that the vib",
      "body": "```text\nvibe pause - Request that an active run pause at the next stage boundary.\n```"
    },
    {
      "id": "cli/policies",
      "kind": "cli",
      "title": "vibe policies",
      "source": "CLI reference (generated from the command tree)",
      "summary": "The project's rule surface: owner-authored tiered policies (advise = reviewer-checked; block = deterministic merge-cap) plus the hard, fail-closed security gates in .vibestrate/policies/.",
      "titleTerms": "policy",
      "terms": "add advis allow allow-termin apply author block cap check clos config confirm deterministic doctor draft fail fail-clos fix flag forbid forbid-main-writ forbid-merg forbid-push forbid-secret gat glob hard harden harden-read-only in json len limit list main matcher merg merge-cap migrat only owner owner-author plu policy project push read recent regex reject remov reviewer reviewer-check rul s secret security snippet strict strict-apply-only suggest surfac termin test the tier vib vibestrat writ",
      "body": "```text\nvibe policies - The project's rule surface: owner-authored tiered policies (advise = reviewer-checked; block = deterministic merge-cap) plus the hard, fail-closed security gates in .vibestrate/policies/.\n  vibe policies add [--fix --lens --block --matcher] - Add a project policy (active immediately). advise by default; --block for a deterministic merge-cap.\n  vibe policies remove - Remove a project policy.\n  vibe policies confirm - Confirm a pending (supervisor-proposed) policy - it goes live.\n  vibe policies reject - Reject a pending (supervisor-proposed) policy - removes it.\n  vibe policies migrate - Lift legacy persona-scoped preferences into project policies and remove the old keys.\n  vibe policies draft [--json] - Turn an English rule into an editable policy draft (supervisor-assisted). Draft only - never writes; adopt it with `policies add`.\n  vibe policies suggest [--limit --json] - Propose candidate policies from recent runs' diffs (supervisor-assisted). Draft only - never writes.\n  vibe policies test [--regex --flags --glob --snippet --recent --limit --surface --json] - Dry-run a matcher against a diff snippet or recent runs (read-only). Give an existing block-policy id, or --regex.\n  vibe policies list [--json] - List the project's policies (owner-authored tiered rules) and the hard security gates in .vibestrate/policies/*.yml.\n  vibe policies check [--surface --json] - Apply the loaded policy rules to a patch file (unified diff). Read-only - never applies, never executes.\n  vibe policies doctor [--json] - Validate rule YAML, list malformed files, surface duplicate ids and empty-rule files.\n… (deeper entries trimmed to fit)\n```"
    },
    {
      "id": "cli/profile",
      "kind": "cli",
      "title": "vibe profile",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Runtime presets (provider + model/power) that Crew roles run on.",
      "titleTerms": "profil",
      "terms": "add crew duplicat forc json label list max max-token model on power preset profil provider remov rol run runtim set that timeout token vib",
      "body": "```text\nvibe profile - Runtime presets (provider + model/power) that Crew roles run on.\n  vibe profile list [--json] - List profiles, grouped by provider, with how many roles use each.\n  vibe profile add [--provider --label --model --power --max-tokens --timeout] - Create a new profile.\n  vibe profile set [--label --model --power --max-tokens --timeout --provider] - Edit an existing profile's fields.\n  vibe profile duplicate - Copy a profile under a new id (e.g. claude -> claude-cheap).\n  vibe profile remove [--force] - Delete a profile (refuses if a role uses it, unless --force).\n```"
    },
    {
      "id": "cli/provider",
      "kind": "cli",
      "title": "vibe provider",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Inspect, configure, and test local coding-CLI providers.",
      "titleTerms": "provider",
      "terms": "and catalog cli cod coding-cli configur detect dry dry-run forc inspect json list loc provider refresh remov run set setup test vib yes",
      "body": "```text\nvibe provider - Inspect, configure, and test local coding-CLI providers.\n  vibe provider detect [--json] - Scan PATH for known local coding CLIs (claude/codex/opencode/aider/ollama).\n  vibe provider list [--json] - Show providers configured in this project.\n  vibe provider test [--yes] - Send a tiny no-op prompt to a configured provider and look for the magic token.\n  vibe provider set [--yes] - Assign every default agent to use the given provider.\n  vibe provider setup - Flowd provider setup wizard.\n  vibe provider remove [--yes] - Remove a provider from project.yml (refuses if a role still uses it).\n  vibe provider catalog [--json] - Show the provider capability catalog (built-in + your .vibestrate/providers-catalog.yml overlay).\n  vibe provider refresh [--force --dry-run] - Detect each provider's real models/efforts (codex `debug models` JSON, else --help scraping) and write them to the catalog overlay. Refreshes stale built-in lists; local only.\n```"
    },
    {
      "id": "cli/queue",
      "kind": "cli",
      "title": "vibe queue",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Manage the local task scheduler queue.",
      "titleTerms": "queu",
      "terms": "add drain exit exit-when-drain json list loc manag paus queu remov resum run scheduler sourc statu task the vib when",
      "body": "```text\nvibe queue - Manage the local task scheduler queue.\n  vibe queue list [--json] - Show the queue and running tasks.\n  vibe queue add [--source] - Add a task to the queue.\n  vibe queue remove - Remove a task from the queue.\n  vibe queue run [--exit-when-drained] - Start the local scheduler loop and process queued tasks.\n  vibe queue pause - Pause the scheduler (new tasks will not start).\n  vibe queue resume - Resume the scheduler.\n  vibe queue status [--json] - Print scheduler state and recent conflict warnings.\n```"
    },
    {
      "id": "cli/rename",
      "kind": "cli",
      "title": "vibe rename",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Give a run a friendly display name (the run id stays the same).",
      "titleTerms": "renam",
      "terms": "a display friendly giv id nam renam run sam stay the vib",
      "body": "```text\nvibe rename - Give a run a friendly display name (the run id stays the same).\n```"
    },
    {
      "id": "cli/replay",
      "kind": "cli",
      "title": "vibe replay",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Read-only inspector for a persisted run (mirrors the Replay tab in the dashboard).",
      "titleTerms": "replay",
      "terms": "a dashboard for in inspector json mirror only persist read read-only replay run tab the vib",
      "body": "```text\nvibe replay [--json] - Read-only inspector for a persisted run (mirrors the Replay tab in the dashboard).\n```"
    },
    {
      "id": "cli/resume",
      "kind": "cli",
      "title": "vibe resume",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Clear a pending pause request or resume a paused run.",
      "titleTerms": "resum",
      "terms": "a clear or paus pend request resum run vib",
      "body": "```text\nvibe resume - Clear a pending pause request or resume a paused run.\n```"
    },
    {
      "id": "cli/roadmap",
      "kind": "cli",
      "title": "vibe roadmap",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Manage local roadmap items (.vibestrate/roadmap/roadmap.json).",
      "titleTerms": "roadmap",
      "terms": "accept add allow allow-unresolved-dependency archiv d dependency descript dry dry-run id init item json list loc manag p pars plan priority propos provider roadmap run show statu titl unresolv updat vib vibestrat",
      "body": "```text\nvibe roadmap - Manage local roadmap items (.vibestrate/roadmap/roadmap.json).\n  vibe roadmap init - Create the .vibestrate/roadmap/ scaffold if missing.\n  vibe roadmap add [-d -p --json] - Add a roadmap item.\n  vibe roadmap list [--json] - List roadmap items.\n  vibe roadmap show [--json] - Show a single roadmap item.\n  vibe roadmap update [--title --description --status --priority] - Update a roadmap item.\n  vibe roadmap archive - Archive a roadmap item (keeps history).\n  vibe roadmap proposals [--json] - List roadmap proposals stored in .vibestrate/roadmap/proposals/.\n  vibe roadmap proposal - Inspect, parse, and accept individual proposals.\n    vibe roadmap proposal show - Print a proposal's raw Markdown body.\n    vibe roadmap proposal parse [--json] - Parse a proposal and print the typed preview.\n  vibe roadmap accept [--dry-run --allow-unresolved-dependencies --json] - Accept a parsed proposal (creates roadmap items + tasks atomically).\n  vibe roadmap plan [--id --provider] - Run the configured local planner provider on a broad goal and save the output as a proposal draft.\n```"
    },
    {
      "id": "cli/run",
      "kind": "cli",
      "title": "vibe run",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Run the default plan→architect→implement→review→verify workflow.",
      "titleTerms": "run",
      "terms": "architect brief checklist concis context context-fil context-url crew default fil flow flow-brief flow-context flow-skip from i implement mod only param permiss permission-mod plan port preview profil read read-only resum resume-from resume-stag review rol run seat seat-rol select skill skip stag step step-profil supervisor task the ui ui-port unattend url verify vib workflow",
      "body": "```text\nvibe run [--ui --ui-port --task --crew --profile --read-only --permission-mode --unattended --skills --concise --flow --supervisor --select --step-profile --seat-role --flow-brief --flow-context --flow-skip --param -i --resume-from --resume-stage --preview --checklist --context-file --context-url] - Run the default plan→architect→implement→review→verify workflow.\n```"
    },
    {
      "id": "cli/runs",
      "kind": "cli",
      "title": "vibe runs",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Manage runs and their rewind snapshots.",
      "titleTerms": "run",
      "terms": "and dry dry-run keep manag orphan prun rewind run snapshot their vib y",
      "body": "```text\nvibe runs - Manage runs and their rewind snapshots.\n  vibe runs prune [--keep --orphans --run --dry-run -y] - Delete rewind-snapshot refs you choose to drop: orphans (run dir gone), beyond a keep-N window, or one run. Shows the plan and confirms first; never purges on its own.\n```"
    },
    {
      "id": "cli/setup",
      "kind": "cli",
      "title": "vibe setup",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Flowd wizard for provider, validation commands, and run defaults.",
      "titleTerms": "setup",
      "terms": "and command default flowd for provider run setup validat vib wizard",
      "body": "```text\nvibe setup - Flowd wizard for provider, validation commands, and run defaults.\n```"
    },
    {
      "id": "cli/shell",
      "kind": "cli",
      "title": "vibe shell",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Interactive terminal panel. For the full dashboard + scheduler + browser in one shot, use `vibe ui` instead.",
      "titleTerms": "shell",
      "terms": "browser dashboard for full in instead interactiv onc one panel refresh scheduler shell shot termin the ui use vib",
      "body": "```text\nvibe shell [--refresh --once] - Interactive terminal panel. For the full dashboard + scheduler + browser in one shot, use `vibe ui` instead.\n```"
    },
    {
      "id": "cli/skills",
      "kind": "cli",
      "title": "vibe skills",
      "source": "CLI reference (generated from the command tree)",
      "summary": "List, inspect, and assign skills (.vibestrate/skills and .claude/skills).",
      "titleTerms": "skill",
      "terms": "and assess assign claud fetch inspect json list nam overwrit show skill unassign vib vibestrat",
      "body": "```text\nvibe skills - List, inspect, and assign skills (.vibestrate/skills and .claude/skills).\n  vibe skills list [--json] - Show every discovered skill and which agents use it.\n  vibe skills show - Print a skill's full SKILL.md body.\n  vibe skills assign - Attach a skill to an agent (writes to .vibestrate/project.yml).\n  vibe skills unassign - Remove a skill from an agent.\n  vibe skills fetch [--name --assess --overwrite] - Fetch a skill markdown from an http(s) URL into .vibestrate/skills/ (guarded + secret-redacted).\n```"
    },
    {
      "id": "cli/spec-up",
      "kind": "cli",
      "title": "vibe spec-up",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Plan before you build: discovery -> spec -> architecture -> roadmap (a chain of read-only runs).",
      "titleTerms": "spec spec-up up",
      "terms": "a all answer approv architectur befor build chain developer discovery edit fil flow for for-non-developer json non of only persona plan proc quest read read-only roadmap run simplify spec spec-up start suggest up vib you",
      "body": "```text\nvibe spec-up - Plan before you build: discovery -> spec -> architecture -> roadmap (a chain of read-only runs).\n  vibe spec-up start [--persona --flow] - Start spec-up: launch the intake run that asks the gap questions.\n  vibe spec-up questions [--json] - Show the intake run's gap questions (and their ids).\n  vibe spec-up answer [--answer --proceed] - Answer a round's questions; loops to a gap-check round or builds the spec.\n  vibe spec-up simplify [--for-non-developer] - Explain a question in plain language (what it asks + what it affects).\n  vibe spec-up suggest [--all] - Draft an answer grounded in your prior answers (you still decide). --all for every blank.\n  vibe spec-up approve - Approve the spec-up draft and launch the roadmap synthesis run.\n  vibe spec-up build [--flow] - Approve the spec-up draft and BUILD it: run the chosen flow seeded with the approved spec.\n  vibe spec-up roadmap - Turn a finished spec-up-roadmap run into a reviewable proposal.\n  vibe spec-up edit [--file] - Edit a spec-up section (scope/spec/architecture/risks) before the build, via $EDITOR or --file. Guarded: secret-refusing, blocked after approve.\n```"
    },
    {
      "id": "cli/status",
      "kind": "cli",
      "title": "vibe status",
      "source": "CLI reference (generated from the command tree)",
      "summary": "List Vibestrate runs in this project.",
      "titleTerms": "statu",
      "terms": "in json list project run statu thi vib vibestrat",
      "body": "```text\nvibe status [--json] - List Vibestrate runs in this project.\n```"
    },
    {
      "id": "cli/suggestions",
      "kind": "cli",
      "title": "vibe suggestions",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Inspect and act on review suggestions captured for a run.",
      "titleTerms": "suggest",
      "terms": "a act and apply approv auto auto-revert-on-fail captur clear fail for inspect json list not on profil reject revert review run set show suggest validat vib",
      "body": "```text\nvibe suggestions - Inspect and act on review suggestions captured for a run.\n  vibe suggestions list [--json] - List every suggestion attached to a run.\n  vibe suggestions show - Show one suggestion in detail (including any proposed patch).\n  vibe suggestions approve [--note] - Approve a suggestion (creates and resolves an approval record).\n  vibe suggestions reject [--note] - Reject a suggestion. Records a rejection in approvals.json.\n  vibe suggestions apply [--validate --auto-revert-on-fail --profile] - Apply an approved suggestion's proposedPatch inside the run's worktree (git apply, never push/merge).\n  vibe suggestions validate [--profile] - Run the project's commands.validate inside the run's worktree against an applied suggestion.\n  vibe suggestions revert - Revert a previously-applied suggestion using the captured patch (git apply -R).\n  vibe suggestions profile - Read or edit a suggestion's validation profile metadata.\n    vibe suggestions profile show - Print the suggestion's current validation profile (if any).\n    vibe suggestions profile set - Set the suggestion's validation profile. Future validation runs use this profile. Does NOT re-run validation.\n    vibe suggestions profile clear - Clear the suggestion's validation profile back to default (commands.validate).\n```"
    },
    {
      "id": "cli/supervisor",
      "kind": "cli",
      "title": "vibe supervisor",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Supervisor personas (the orchestrator's judgment posture).",
      "titleTerms": "supervisor",
      "terms": "adopt archetyp default json judgment list orchestrator persona postur reason remov resum s statu stop supervisor the vib",
      "body": "```text\nvibe supervisor - Supervisor personas (the orchestrator's judgment posture).\n  vibe supervisor list [--json] - List the resolved supervisor personas (built-ins + project).\n  vibe supervisor archetypes [--json] - List the curated supervisor archetypes you can adopt.\n  vibe supervisor adopt - Adopt a curated archetype into this project's personas.\n  vibe supervisor default - Set the project's default supervisor (built-in or a project persona).\n  vibe supervisor remove - Remove a project persona (not a built-in or the active default).\n  vibe supervisor stop [--reason] - Stop the supervisor acting. It still answers.\n  vibe supervisor resume - Let the supervisor act again.\n  vibe supervisor status [--json] - Whether the supervisor may act right now.\n```"
    },
    {
      "id": "cli/tasks",
      "kind": "cli",
      "title": "vibe tasks",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Manage local tasks: backlog → queued → running → done.",
      "titleTerms": "task",
      "terms": "acceptanc add all apply archiv backlog cancel check checklist comment d delet don edit enhanc fil flow json list loc manag mov objectiv only p paus pickup profil promot provider queu read read-only ready remov report resum roadmap run sequenc show skill statu step suggest supervis task unarchiv uncheck vib y",
      "body": "```text\nvibe tasks - Manage local tasks: backlog → queued → running → done.\n  vibe tasks add [-d -p --roadmap --skills --files --provider --read-only --supervised --json] - Create a task.\n  vibe tasks list [--status --json] - List tasks.\n  vibe tasks suggest [--all --json] - Suggest which backlog card to pick up next (ready + priority).\n  vibe tasks show [--json] - Show a task with comments and run history.\n  vibe tasks comment - Add a comment to a task.\n  vibe tasks ready - Mark a task ready to run.\n  vibe tasks cancel - Cancel a task.\n  vibe tasks archive - Archive a task (files it into the board's Archived column).\n  vibe tasks unarchive - Un-archive a task.\n  vibe tasks delete [-y] - Permanently remove a task card (refuses while its run is live).\n  vibe tasks queue - Add a task to the scheduler queue.\n  vibe tasks run - Run this task now (foreground). A supervised task sequences its steps (the Conductor); a plain task runs the default flow once.\n  vibe tasks sequence [--json] - Sequence a supervised task's steps in order (the Conductor). The stable entry the scheduler spawns; `run` delegates here for supervised tasks.\n  vibe tasks status [--json] - Show a supervised task's live conductor status (lifecycle, steps, invariants, halt).\n  vibe tasks pause - Pause a supervised task's live run (between steps).\n  vibe tasks resume - Resume a paused supervised task, or re-sequence a halted one from the clean tip.\n  vibe tasks pickup [--step --flow] - Execute the task's checklist item-by-item (pick-up flow). Continuous by default; --step pauses between items.\n  vibe tasks checklist - Manage a task's in-card checklist (the ordered breakdown of items).\n… (deeper entries trimmed to fit)\n```"
    },
    {
      "id": "cli/telemetry",
      "kind": "cli",
      "title": "vibe telemetry",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Opt-in OpenTelemetry export of a run's metrics to your own collector (off by default).",
      "titleTerms": "telemetry",
      "terms": "a auth by collector default endpoint export in metric of off open opt opt-in own run s telemetry to trac vib your",
      "body": "```text\nvibe telemetry - Opt-in OpenTelemetry export of a run's metrics to your own collector (off by default).\n  vibe telemetry trace - Print the OTLP trace JSON for a run (no network - inspect before exporting).\n  vibe telemetry export [--endpoint --auth] - Export a run's metrics as an OTLP trace to a collector (Langfuse, Tempo, Jaeger…).\n```"
    },
    {
      "id": "cli/terminal",
      "kind": "cli",
      "title": "vibe terminal",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Inspect and close dashboard terminal sessions. Sessions are user-launched from the dashboard; this CLI never spawns one.",
      "titleTerms": "termin",
      "terms": "and are cli clos dashboard from inspect json launch list never one sess spawn termin the thi user user-launch vib",
      "body": "```text\nvibe terminal - Inspect and close dashboard terminal sessions. Sessions are user-launched from the dashboard; this CLI never spawns one.\n  vibe terminal list [--json] - List every terminal session ever opened in this project (live + closed).\n  vibe terminal close - Mark a terminal session as closed. Only affects live sessions in the running dashboard process; closed sessions are already terminal.\n```"
    },
    {
      "id": "cli/ui",
      "kind": "cli",
      "title": "vibe ui",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Start the local supervisor dashboard for this project.",
      "titleTerms": "ui",
      "terms": "dashboard for host loc no no-open no-scheduler open port project scheduler start supervisor the thi ui vib",
      "body": "```text\nvibe ui [--port --host --no-open --no-scheduler] - Start the local supervisor dashboard for this project.\n```"
    },
    {
      "id": "cli/validation",
      "kind": "cli",
      "title": "vibe validation",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Inspect validation profiles configured under commands.validationProfiles.",
      "titleTerms": "validat",
      "terms": "all clear clear-referenc command configur doctor dry dry-run inspect json migrat profil referenc renam run show under usag validat vib",
      "body": "```text\nvibe validation - Inspect validation profiles configured under commands.validationProfiles.\n  vibe validation profiles [--json] - List the implicit default + every named validation profile.\n  vibe validation usage [--json] - Show how often each validation profile has actually run (`commands.validate` use counts as 'default').\n  vibe validation profile - Inspect, manage, and migrate validation profile references.\n    vibe validation profile show [--json] - Show the resolved commands for a named profile (or 'default').\n    vibe validation profile migrate [--dry-run --clear --all --run] - Rewrite suggestion and bundle records that reference <fromProfile> to point at <toProfile>. Use --clear to migrate to the default profile.\n    vibe validation profile clear-references [--dry-run --all --run] - Clear every suggestion/bundle that references <profileName> back to the default profile.\n    vibe validation profile rename [--dry-run --all --run] - Rename a validation profile in project.yml AND migrate every suggestion/bundle reference in one atomic operation. Preserves the profile's description and commands. Refuses if <toProfile> already exists.\n    vibe validation profile doctor [--all --run --json] - Audit every suggestion + bundle for stale validation-profile references. Default scope matches `vibe doctor` (recent 50 runs); use --all to lift the cap.\n    vibe validation profile migrations [--json] - List previously-applied profile migrations.\n```"
    },
    {
      "id": "cli/welcome",
      "kind": "cli",
      "title": "vibe welcome",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Guided, resumable walkthrough: providers -> crew -> flows -> your first run.",
      "titleTerms": "welcom",
      "terms": "crew first flow guid provider reset resumabl run vib walkthrough welcom your",
      "body": "```text\nvibe welcome [--reset] - Guided, resumable walkthrough: providers -> crew -> flows -> your first run.\n```"
    },
    {
      "id": "cli/workspace",
      "kind": "cli",
      "title": "vibe workspace",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Track + switch between multiple Vibestrate projects (a user-level registry).",
      "titleTerms": "workspac",
      "terms": "a add all between clos forc json level list multipl no no-open open overview project rang registry remov switch track user user-level vib vibestrat workspac",
      "body": "```text\nvibe workspace - Track + switch between multiple Vibestrate projects (a user-level registry).\n  vibe workspace list [--json] - List registered projects (live ● / dormant ○).\n  vibe workspace add - Register a project directory (default: the current directory).\n  vibe workspace remove - Remove a project from the workspace registry (leaves it on disk).\n  vibe workspace open [--all --no-open] - Open a project's dashboard, starting it (server + scheduler) if dormant.\n  vibe workspace close [--all --force] - Shut down a project's dashboard + scheduler (refuses if busy unless --force).\n  vibe workspace overview [--range --json] - Cross-project rollup: runs + cost across every registered project.\n```"
    },
    {
      "id": "config/adaptiveSpecUp",
      "kind": "config",
      "title": "project.yml: adaptiveSpecUp",
      "source": "Configuration schema (generated from the Zod schema)",
      "summary": "Keys under `adaptiveSpecUp` in .vibestrate/project.yml.",
      "titleTerms": "adaptiv spec up",
      "terms": "adaptiv spec up",
      "body": "```yaml\nadaptiveSpecUp: enum default: \"auto\"\n```"
    },
    {
      "id": "config/budget",
      "kind": "config",
      "title": "project.yml: budget",
      "source": "Configuration schema (generated from the Zod schema)",
      "summary": "Keys under `budget` in .vibestrate/project.yml.",
      "titleTerms": "budget",
      "terms": "act budget cap clock daily day fallback limit max min on pct per profil run spend threshold turn usd wall warn",
      "body": "```yaml\nbudget: object default: {\"spendCapDailyUsd\":null,\"capAction\":\"stop\",\"warnThresholdPct\":0.8,\"maxTurnsPerRun\":null,\"maxWallClockMinPerRun\":null,\"maxTurnsPerDay\":null,\"maxWallClockMinPerDay\":null,\"onLimit\":\"stop\"}\n  budget.spendCapDailyUsd: number | null default: null\n  budget.capAction: enum default: \"stop\"\n  budget.warnThresholdPct: number default: 0.8\n  budget.fallbackProfile: string\n  budget.maxTurnsPerRun: number | null default: null\n  budget.maxWallClockMinPerRun: number | null default: null\n  budget.maxTurnsPerDay: number | null default: null\n  budget.maxWallClockMinPerDay: number | null default: null\n  budget.onLimit: enum default: \"stop\"\n```"
    },
    {
      "id": "config/codebaseMapRoles",
      "kind": "config",
      "title": "project.yml: codebaseMapRoles",
      "source": "Configuration schema (generated from the Zod schema)",
      "summary": "Keys under `codebaseMapRoles` in .vibestrate/project.yml.",
      "titleTerms": "codebas map rol",
      "terms": "codebas map rol",
      "body": "```yaml\ncodebaseMapRoles: array<string> default: [\"planner\"]\n```"
    },
    {
      "id": "config/commands",
      "kind": "config",
      "title": "project.yml: commands",
      "source": "Configuration schema (generated from the Zod schema)",
      "summary": "Keys under `commands` in .vibestrate/project.yml.",
      "titleTerms": "command",
      "terms": "by chang command profil scop validat",
      "body": "```yaml\ncommands: object default: {\"validate\":[],\"scopeValidationByChange\":true,\"validationProfiles\":{}}\n  commands.validate: array<string> default: []\n  commands.scopeValidationByChange: boolean default: true\n  commands.validationProfiles: record<string, object> default: {}\n```"
    },
    {
      "id": "config/commits",
      "kind": "config",
      "title": "project.yml: commits",
      "source": "Configuration schema (generated from the Zod schema)",
      "summary": "Keys under `commits` in .vibestrate/project.yml.",
      "titleTerms": "commit",
      "terms": "author co commit email nam",
      "body": "```yaml\ncommits: object default: {\"coAuthor\":true,\"coAuthorName\":\"Vibestrate\",\"coAuthorEmail\":\"noreply@vibestrate.com\"}\n  commits.coAuthor: boolean default: true\n  commits.coAuthorName: string default: \"Vibestrate\"\n  commits.coAuthorEmail: string default: \"noreply@vibestrate.com\"\n```"
    },
    {
      "id": "config/crews",
      "kind": "config",
      "title": "project.yml: crews",
      "source": "Configuration schema (generated from the Zod schema)",
      "summary": "Keys under `crews` in .vibestrate/project.yml.",
      "titleTerms": "crew",
      "terms": "crew",
      "body": "```yaml\ncrews: record<string, object> default: {}\n```"
    },
    {
      "id": "config/defaultCrew",
      "kind": "config",
      "title": "project.yml: defaultCrew",
      "source": "Configuration schema (generated from the Zod schema)",
      "summary": "Keys under `defaultCrew` in .vibestrate/project.yml.",
      "titleTerms": "crew default",
      "terms": "crew default",
      "body": "```yaml\ndefaultCrew: string default: \"default\"\n```"
    },
    {
      "id": "config/defaultFlow",
      "kind": "config",
      "title": "project.yml: defaultFlow",
      "source": "Configuration schema (generated from the Zod schema)",
      "summary": "Keys under `defaultFlow` in .vibestrate/project.yml.",
      "titleTerms": "default flow",
      "terms": "default flow",
      "body": "```yaml\ndefaultFlow: string | null default: null\n```"
    },
    {
      "id": "config/defaultPersona",
      "kind": "config",
      "title": "project.yml: defaultPersona",
      "source": "Configuration schema (generated from the Zod schema)",
      "summary": "Keys under `defaultPersona` in .vibestrate/project.yml.",
      "titleTerms": "default persona",
      "terms": "default persona",
      "body": "```yaml\ndefaultPersona: string default: \"staff-engineer\"\n```"
    },
    {
      "id": "config/editor",
      "kind": "config",
      "title": "project.yml: editor",
      "source": "Configuration schema (generated from the Zod schema)",
      "summary": "Keys under `editor` in .vibestrate/project.yml.",
      "titleTerms": "editor",
      "terms": "arg command editor enabl",
      "body": "```yaml\neditor: object default: {\"enabled\":false,\"command\":\"code\",\"args\":[\"--goto\",\"{file}:{line}:{column}\"]}\n  editor.enabled: boolean default: false\n  editor.command: string default: \"code\"\n  editor.args: array<string> default: [\"--goto\",\"{file}:{line}:{column}\"]\n```"
    },
    {
      "id": "config/execution",
      "kind": "config",
      "title": "project.yml: execution",
      "source": "Configuration schema (generated from the Zod schema)",
      "summary": "Keys under `execution` in .vibestrate/project.yml.",
      "titleTerms": "execut",
      "terms": "allow backend container egress execut imag isolat limit mod on pid readonly root unavailabl",
      "body": "```yaml\nexecution: object default: {\"backend\":\"local-worktree\",\"isolation\":\"off\",\"container\":{\"image\":\"node:22-bookworm-slim\",\"onUnavailable\":\"fail\",\"readonlyRoot\":true,\"pidsLimit\":512,\"egress\":{\"mode\":\"open\",\"allow\":[]}}}\n  execution.backend: enum default: \"local-worktree\"\n  execution.isolation: enum default: \"off\"\n  execution.container: object default: {\"image\":\"node:22-bookworm-slim\",\"onUnavailable\":\"fail\",\"readonlyRoot\":true,\"pidsLimit\":512,\"egress\":{\"mode\":\"open\",\"allow\":[]}}\n    execution.container.image: string default: \"node:22-bookworm-slim\"\n    execution.container.onUnavailable: enum default: \"fail\"\n    execution.container.readonlyRoot: boolean default: true\n    execution.container.pidsLimit: number default: 512\n    execution.container.egress: object default: {\"mode\":\"open\",\"allow\":[]}\n      execution.container.egress.mode: enum default: \"open\"\n      execution.container.egress.allow: array<string> default: []\n```"
    },
    {
      "id": "config/flowSizing",
      "kind": "config",
      "title": "project.yml: flowSizing",
      "source": "Configuration schema (generated from the Zod schema)",
      "summary": "Keys under `flowSizing` in .vibestrate/project.yml.",
      "titleTerms": "flow siz",
      "terms": "flow siz",
      "body": "```yaml\nflowSizing: enum default: \"deterministic\"\n```"
    },
    {
      "id": "config/git",
      "kind": "config",
      "title": "project.yml: git",
      "source": "Configuration schema (generated from the Zod schema)",
      "summary": "Keys under `git` in .vibestrate/project.yml.",
      "titleTerms": "git",
      "terms": "branch clean dir environment git link main prefix requir retent run snapshot worktre",
      "body": "```yaml\ngit: object default: {\"mainBranch\":\"main\",\"branchPrefix\":\"vibestrate/\",\"worktreeDir\":\"../.vibestrate-worktrees\",\"requireCleanMain\":false,\"linkEnvironment\":\"auto\",\"snapshotRetentionRuns\":0}\n  git.mainBranch: string default: \"main\"\n  git.branchPrefix: string default: \"vibestrate/\"\n  git.worktreeDir: string default: \"../.vibestrate-worktrees\"\n  git.requireCleanMain: boolean default: false\n  git.linkEnvironment: enum default: \"auto\"\n  git.snapshotRetentionRuns: number default: 0\n```"
    },
    {
      "id": "config/merge",
      "kind": "config",
      "title": "project.yml: merge",
      "source": "Configuration schema (generated from the Zod schema)",
      "summary": "Keys under `merge` in .vibestrate/project.yml.",
      "titleTerms": "merg",
      "terms": "advisor behind branch fil integrat main merg path protect suggest touch when",
      "body": "```yaml\nmerge: object default: {\"advisor\":{\"suggestIntegrationBranchWhen\":{\"filesTouched\":25,\"protectedPaths\":true,\"behindMain\":50}}}\n  merge.advisor: object default: {\"suggestIntegrationBranchWhen\":{\"filesTouched\":25,\"protectedPaths\":true,\"behindMain\":50}}\n    merge.advisor.suggestIntegrationBranchWhen: object default: {\"filesTouched\":25,\"protectedPaths\":true,\"behindMain\":50}\n      merge.advisor.suggestIntegrationBranchWhen.filesTouched: number default: 25\n      merge.advisor.suggestIntegrationBranchWhen.protectedPaths: boolean default: true\n      merge.advisor.suggestIntegrationBranchWhen.behindMain: number default: 50\n```"
    },
    {
      "id": "config/methodologyRoles",
      "kind": "config",
      "title": "project.yml: methodologyRoles",
      "source": "Configuration schema (generated from the Zod schema)",
      "summary": "Keys under `methodologyRoles` in .vibestrate/project.yml.",
      "titleTerms": "methodology rol",
      "terms": "methodology rol",
      "body": "```yaml\nmethodologyRoles: array<string> default: [\"planner\"]\n```"
    },
    {
      "id": "config/permissions",
      "kind": "config",
      "title": "project.yml: permissions",
      "source": "Configuration schema (generated from the Zod schema)",
      "summary": "Keys under `permissions` in .vibestrate/project.yml.",
      "titleTerms": "permiss",
      "terms": "permiss profil",
      "body": "```yaml\npermissions: object default: {\"profiles\":{}}\n  permissions.profiles: record<string, object> default: {}\n```"
    },
    {
      "id": "config/personas",
      "kind": "config",
      "title": "project.yml: personas",
      "source": "Configuration schema (generated from the Zod schema)",
      "summary": "Keys under `personas` in .vibestrate/project.yml.",
      "titleTerms": "persona",
      "terms": "persona",
      "body": "```yaml\npersonas: record<string, object> default: {}\n```"
    },
    {
      "id": "config/policies",
      "kind": "config",
      "title": "project.yml: policies",
      "source": "Configuration schema (generated from the Zod schema)",
      "summary": "Keys under `policies` in .vibestrate/project.yml.",
      "titleTerms": "policy",
      "terms": "access allow apply approv artifact at auto branch chang default forbid harden interactiv main max merg mod ms only path permiss policy preserv protect push read requir round seat secret stag strict termin timeout unattend unprotect writ",
      "body": "```yaml\npolicies: object default: {\"defaultPermissionMode\":\"auto\",\"forbidMainBranchWrites\":true,\"forbidSecretsAccess\":true,\"forbidAutoPush\":true,\"forbidAutoMerge\":true,\"preserveArtifacts\":true,\"requireApprovalAtStages\":[],\"allowInteractiveTerminal\":false,\"strictApplyOnly\":false,\"hardenReadOnlySeats\":false,\"unattendedApprovalTimeoutMs\":0,\"approvalMaxChangeRounds\":3,\"protectedPaths\":[],\"unprotectedPaths\":[]}\n  policies.defaultPermissionMode: enum default: \"auto\"\n  policies.forbidMainBranchWrites: boolean default: true\n  policies.forbidSecretsAccess: boolean default: true\n  policies.forbidAutoPush: boolean default: true\n  policies.forbidAutoMerge: boolean default: true\n  policies.preserveArtifacts: boolean default: true\n  policies.requireApprovalAtStages: array<enum> default: []\n  policies.allowInteractiveTerminal: boolean default: false\n  policies.strictApplyOnly: boolean default: false\n  policies.hardenReadOnlySeats: boolean default: false\n  policies.unattendedApprovalTimeoutMs: number default: 0\n  policies.approvalMaxChangeRounds: number default: 3\n  policies.protectedPaths: array<string> default: []\n  policies.unprotectedPaths: array<string> default: []\n```"
    },
    {
      "id": "config/ponytail",
      "kind": "config",
      "title": "project.yml: ponytail",
      "source": "Configuration schema (generated from the Zod schema)",
      "summary": "Keys under `ponytail` in .vibestrate/project.yml.",
      "titleTerms": "ponytail",
      "terms": "ponytail",
      "body": "```yaml\nponytail: boolean default: true\n```"
    },
    {
      "id": "config/posture",
      "kind": "config",
      "title": "project.yml: posture",
      "source": "Configuration schema (generated from the Zod schema)",
      "summary": "Keys under `posture` in .vibestrate/project.yml.",
      "titleTerms": "postur",
      "terms": "apply approv auto postur sandbox",
      "body": "```yaml\nposture: object default: {\"autoApplySandbox\":false,\"autoApplyApproval\":false}\n  posture.autoApplySandbox: boolean default: false\n  posture.autoApplyApproval: boolean default: false\n```"
    },
    {
      "id": "config/profiles",
      "kind": "config",
      "title": "project.yml: profiles",
      "source": "Configuration schema (generated from the Zod schema)",
      "summary": "Keys under `profiles` in .vibestrate/project.yml.",
      "titleTerms": "profil",
      "terms": "profil",
      "body": "```yaml\nprofiles: record<string, unknown> default: {}\n```"
    },
    {
      "id": "config/project",
      "kind": "config",
      "title": "project.yml: project",
      "source": "Configuration schema (generated from the Zod schema)",
      "summary": "Keys under `project` in .vibestrate/project.yml.",
      "titleTerms": "project",
      "terms": "nam project typ",
      "body": "```yaml\nproject: object (required)\n  project.name: string (required)\n  project.type: string default: \"generic\"\n```"
    },
    {
      "id": "config/projectPolicies",
      "kind": "config",
      "title": "project.yml: projectPolicies",
      "source": "Configuration schema (generated from the Zod schema)",
      "summary": "Keys under `projectPolicies` in .vibestrate/project.yml.",
      "titleTerms": "policy project",
      "terms": "policy project",
      "body": "```yaml\nprojectPolicies: array<object> default: []\n```"
    },
    {
      "id": "config/providers",
      "kind": "config",
      "title": "project.yml: providers",
      "source": "Configuration schema (generated from the Zod schema)",
      "summary": "Keys under `providers` in .vibestrate/project.yml.",
      "titleTerms": "provider",
      "terms": "provider",
      "body": "```yaml\nproviders: record<string, object | object | object | object> (required)\n```"
    },
    {
      "id": "config/resilience",
      "kind": "config",
      "title": "project.yml: resilience",
      "source": "Configuration schema (generated from the Zod schema)",
      "summary": "Keys under `resilience` in .vibestrate/project.yml.",
      "titleTerms": "resilienc",
      "terms": "act after auto bas delay enabl exhaust fallback limit max min ms on pattern profil rat resilienc respect retry transient usag wait",
      "body": "```yaml\nresilience: object default: {\"enabled\":true,\"onExhausted\":\"fail\",\"autoFallback\":\"crew\",\"rateLimit\":{\"maxRetries\":5,\"baseDelayMs\":2000,\"maxDelayMs\":120000,\"patterns\":[],\"fallbackProfile\":null,\"respectRetryAfter\":true},\"transient\":{\"maxRetries\":4,\"baseDelayMs\":1000,\"maxDelayMs\":60000,\"patterns\":[],\"fallbackProfile\":null},\"usageLimit\":{\"action\":\"stop\",\"maxWaitMin\":60,\"maxWaits\":2,\"fallbackProfile\":null,\"patterns\":[]}}\n  resilience.enabled: boolean default: true\n  resilience.onExhausted: enum default: \"fail\"\n  resilience.autoFallback: enum default: \"crew\"\n  resilience.rateLimit: object default: {\"maxRetries\":5,\"baseDelayMs\":2000,\"maxDelayMs\":120000,\"patterns\":[],\"fallbackProfile\":null,\"respectRetryAfter\":true}\n    resilience.rateLimit.maxRetries: number (required)\n    resilience.rateLimit.baseDelayMs: number (required)\n    resilience.rateLimit.maxDelayMs: number (required)\n    resilience.rateLimit.patterns: array<string> default: []\n    resilience.rateLimit.fallbackProfile: string | null default: null\n    resilience.rateLimit.respectRetryAfter: boolean default: true\n  resilience.transient: object default: {\"maxRetries\":4,\"baseDelayMs\":1000,\"maxDelayMs\":60000,\"patterns\":[],\"fallbackProfile\":null}\n    resilience.transient.maxRetries: number (required)\n    resilience.transient.baseDelayMs: number (required)\n    resilience.transient.maxDelayMs: number (required)\n    resilience.transient.patterns: array<string> default: []\n    resilience.transient.fallbackProfile: string | null default: null\n  resilience.usageLimit: object default: {\"action\":\"stop\",\"maxWaitMin\":60,\"maxWaits\":2,\"fallbackProfile\":null,\"patterns\":[]}\n    resilience.usageLimit.action: enum default: \"stop\"\n    resilience.usageLimit.maxWaitMin: number default: 60\n… (deeper entries trimmed to fit)\n```"
    },
    {
      "id": "config/scheduler",
      "kind": "config",
      "title": "project.yml: scheduler",
      "source": "Configuration schema (generated from the Zod schema)",
      "summary": "Keys under `scheduler` in .vibestrate/project.yml.",
      "titleTerms": "scheduler",
      "terms": "concurrency concurrent conflict default max policy queu quota rol run scheduler sourc writ",
      "body": "```yaml\nscheduler: object default: {\"maxConcurrentRuns\":1,\"maxConcurrentWriteRoles\":1,\"conflictPolicy\":\"warn\",\"queuePolicy\":\"fifo\",\"sourceQuotas\":{}}\n  scheduler.maxConcurrentRuns: number default: 1\n  scheduler.maxConcurrentWriteRoles: number default: 1\n  scheduler.conflictPolicy: enum default: \"warn\"\n  scheduler.queuePolicy: enum default: \"fifo\"\n  scheduler.sourceQuotas: record<string, number> default: {}\n  scheduler.defaultSourceConcurrency: number\n```"
    },
    {
      "id": "config/session",
      "kind": "config",
      "title": "project.yml: session",
      "source": "Configuration schema (generated from the Zod schema)",
      "summary": "Keys under `session` in .vibestrate/project.yml.",
      "titleTerms": "sess",
      "terms": "max reus sess turn",
      "body": "```yaml\nsession: object default: {\"maxReuseTurns\":0}\n  session.maxReuseTurns: number default: 0\n```"
    },
    {
      "id": "config/supervised",
      "kind": "config",
      "title": "project.yml: supervised",
      "source": "Configuration schema (generated from the Zod schema)",
      "summary": "Keys under `supervised` in .vibestrate/project.yml.",
      "titleTerms": "supervis",
      "terms": "enabl id max profil rol spend step supervis supervisor usd",
      "body": "```yaml\nsupervised: object default: {\"maxSpendUsd\":null,\"maxSteps\":20,\"supervisor\":{\"enabled\":true,\"profile\":null,\"roleId\":\"reviewer\"}}\n  supervised.maxSpendUsd: number | null default: null\n  supervised.maxSteps: number | null default: 20\n  supervised.supervisor: object default: {\"enabled\":true,\"profile\":null,\"roleId\":\"reviewer\"}\n    supervised.supervisor.enabled: boolean default: true\n    supervised.supervisor.profile: string | null default: null\n    supervised.supervisor.roleId: string default: \"reviewer\"\n```"
    },
    {
      "id": "config/supervisorControl",
      "kind": "config",
      "title": "project.yml: supervisorControl",
      "source": "Configuration schema (generated from the Zod schema)",
      "summary": "Keys under `supervisorControl` in .vibestrate/project.yml.",
      "titleTerms": "control supervisor",
      "terms": "autonomy control supervisor",
      "body": "```yaml\nsupervisorControl: object default: {\"autonomy\":\"advise\"}\n  supervisorControl.autonomy: enum default: \"advise\"\n```"
    },
    {
      "id": "config/workflow",
      "kind": "config",
      "title": "project.yml: workflow",
      "source": "Configuration schema (generated from the Zod schema)",
      "summary": "Keys under `workflow` in .vibestrate/project.yml.",
      "titleTerms": "workflow",
      "terms": "human id loop max merg requir review workflow",
      "body": "```yaml\nworkflow: object default: {\"id\":\"default-plan-build-review\",\"maxReviewLoops\":null,\"requireHumanMerge\":true}\n  workflow.id: string default: \"default-plan-build-review\"\n  workflow.maxReviewLoops: number | null default: null\n  workflow.requireHumanMerge: boolean default: true\n```"
    },
    {
      "id": "docs/architecture/directory-map",
      "kind": "doc",
      "title": "Repository map",
      "source": "Vibestrate docs: architecture/directory-map",
      "summary": "A tour of the source tree, showing what lives where and where to start reading.",
      "titleTerms": "map repository",
      "terms": "a act action-broker adapter advisor agent and architectur assignment assist broker build builtin builtin-flow catalog claud claude-code-provider claude-stream-json cli cod code_writ codebas command config config-loader config-schema consult context cor crew crew-preset crew-registry crew-schema default default-prompt default-rol definit detach detached-run detect detector diff diff-servic dir directory directory-map discovery doc domain engin entry error error-format execut fetch flow flow-discovery flow-schema format frontend generat generate-docs-metadata git guard guarded-fetch hub index init integrat integration-servic json known known_provider level liv loader machin map mcp merg merge-advisor metadata metric notificat of only orchestrator output output-format path path-guard policy preset profil profile-schema profile-usag program project project-detector prompt provider provider-detect provider-runner provider-schema publish read read_only ready registry remain review roadmap rol role-registry role-schema run run-engin run-entry runner runtim safety saga scheduler schema script select select-workflow server servic setup shell show skill skill-assignment-servic skill-discovery skill-loader sourc spec spec-up src start stat state-machin stor stream stream-json supervisor termin test the to top top-level tour tre ts ui up usag util validat vib vibestrat what wher workflow workspac writ yml",
      "body": "This is a tour of `src/`, the source tree. The list isn't exhaustive, since small helpers are omitted, but every top-level directory and stable extension point appears here.\n\n## The frontends\n\n- `src/cli/` - the commander program, the command-line entry point. `index.ts` builds the command tree (exported as `buildVibestrateProgram` so the docs generator can introspect it without parsing argv); each command's implementation lives under `src/cli/commands/`, grouped by area. - `src/server/` - the local Fastify HTTP/SSE API behind `vibe ui`, one route module per domain, plus the static serving of the built dashboard. - `src/ui/` - the React dashboard SPA (Mission Control), built separately and served by the server. - `src/shell/` - the Ink TUI behind `vibe shell`.\n\nRead first: `src/cli/index.ts`, `src/server/server.ts`.\n\n## `src/core/`\n\nThe run engine and the surrounding plumbing. At the root live the hub modules everything shares: `orchestrator.ts` (drives a run through its flow steps), `state-machine.ts` (run statuses + transition allowlist), `diff-service.ts` (diffs + secret detection/redaction), `path-guard.ts` (refuses reads/writes outside known-safe roots), `guarded-fetch.ts`, `error-format.ts`, `run-entry.ts` (the headless build entry), and `detached-run.ts`.\n\nThe domain clusters:"
    },
    {
      "id": "docs/architecture/http-api",
      "kind": "doc",
      "title": "HTTP API",
      "source": "Vibestrate docs: architecture/http-api",
      "summary": "The local dashboard API, a versioned /api/v1 contract with optional bearer-token auth and the flow import, export, and create endpoints.",
      "titleTerms": "api http",
      "terms": "0 1 127 200 201 24 400 401 403 404 4317 500 a act advic advis an analyz and api apply approv architectur auth authenticat authorizat bas bearer bearer-token bind bound branch broker by character cheap clean clos complet confirm consult contract control control-character coverag creat creator crew cross cross-origin cross-sit csrf curl currency dashboard default definit delet deny descript draft endpoint exist export expos fail fail-clos favicon fetch fil file-or-url finish finish-now first flow flow-creat flow-delet flow-fork flow-import flow-patch fork format gat get git guard guid h health hex host http http-api id ids import in initializ input integrat json lan loc localhost loopback main merg merge-to-main ndjson need network new no non non-loopback now of off on only openssl option or origin our out overview overwrit patch path policy portability post preview problem project rand recommendat redact refus requir require_approv resolv resolve-first rol run s scan schema seat sec sec-fetch-sit secret secret-scan server sit siz sourc ssrf stag stage-on-integration-branch start target the to token token-gat tru ui unverifi unvers url v1 validat vers vib vibestrat vibestrate_api_token with writ yaml yml",
      "body": "`vibe ui` starts a Fastify server (default `http://127.0.0.1:4317`) that backs the dashboard. The same endpoints are a stable, scriptable contract: every dashboard action is an HTTP call, so anything the UI does, an external caller can do too.\n\n## Base URL and versioning\n\n- **Unversioned:** `/api/...` - what the bundled dashboard calls. - **Versioned:** `/api/v1/...` - the canonical contract for external callers.\n\n`/api/v1/ ` is rewritten to `/api/ ` before routing, so the two are the same handlers. Pin `/api/v1` in scripts; a future breaking payload change ships under a new prefix while `/api/v1` keeps working for a deprecation window. `/api/v1/health` and `/api/v1/flows` behave identically to their unversioned forms.\n\n## Binding and origin\n\nThe server binds loopback (`127.0.0.1`) by default and refuses cross-origin requests from anything but `localhost` / `127.0.0.1` / the configured host (a malformed `Origin` is refused too). To expose it on another interface, pass `vibe ui --host ` - but a non-loopback bind **requires a token** (below) or the server refuses to start.\n\n## Authentication\n\n```\n# expose on the LAN, token-gated\nVIBESTRATE_API_TOKEN=$(openssl rand -hex 24) vibe ui --host 0.0.0.0\ncurl -H \"Authorization: Bearer $VIBESTRATE_API_TOKEN\" \\\n  http://<host>:4317/api/v1/flows\n```"
    },
    {
      "id": "docs/architecture/overview",
      "kind": "doc",
      "title": "Architecture overview",
      "source": "Vibestrate docs: architecture/overview",
      "summary": "How Vibestrate's pieces fit together, from the orchestrator down to the local CLI binary.",
      "titleTerms": "architectur overview",
      "terms": "6 agent aider an api approv architectur artifact assert binary by claud cli cod code_writ codex command commander component control cor daemon default deliberately doe down driv executor export fastify fit for from gemini glob how id in invocat loc machin miss model mor no not ollama only orchestrator os overview own piec planner program project provider react read relat remot reviewer run s sandbox server src stag stage-by-stag stat telemetry the to together transit ts ui under validat vib vibestrat wait waiting_for_approv what workflow writ yml your",
      "body": "Vibestrate is a single Node process that orchestrates other local processes. There is no daemon, no service mesh, no cloud component."
    },
    {
      "id": "docs/cli/dashboard",
      "kind": "doc",
      "title": "Mission Control",
      "source": "Vibestrate docs: cli/dashboard",
      "summary": "The local dashboard for inspecting runs, approving gates, reading diffs, and steering the orchestrator.",
      "titleTerms": "control miss",
      "terms": "4317 a abort add all and approv audit banner between block board brand c canva chang claud cli cmd codebas config control crew ctrl ctrl-c ctrl-k dashboard diff do doe env execut fail fil flow for g gat headless hero id inspect inspector it jump k ledger list liv loc log merg metric miss mor no no-open not open orchestrator outcom p pag policy port profil project propos provider r read rol run sourc start statu steer step stop supervisor switcher tab the tre ui using vib watch what",
      "body": "Mission Control is Vibestrate's web UI. A Fastify process serves it on demand, starting only when you ask for it. It's fully local and never connects to a remote backend.\n\n## Start it\n\nOpen the dashboard with:\n\n```\nvibe ui\n```\n\nThe default port is `4317`. Pass `--port` to change it.\n\nIt opens your browser by default. `--no-open` keeps it headless.\n\nFirst visit, a short guided tour points out Runs, Flows, Board, Consult, and New run. Skip it any time, or take it again later from the help overlay (press `?`).\n\nYou can also start a run with the dashboard already attached:\n\n```\nvibe run \"Add audit logging\" --ui\n```\n\n## The pages\n\nMission Control's left sidebar is the app shell. It lists:"
    },
    {
      "id": "docs/cli/overview",
      "kind": "doc",
      "title": "CLI overview",
      "source": "Vibestrate docs: cli/overview",
      "summary": "The shape of the vibe command, how its subcommands group, and the conventions every command follows.",
      "titleTerms": "cli overview",
      "terms": "0 1 2 a abort acm activ advisory against agent alongsid an and any api api_key apply approv architect architectur are area arg as assign assuranc astro attach audit auth auto auto-open await browser built built-in cd chang cheap check cli codebas codebase-map command config configur confirm consult context control convent cor crew current custom dashboard deep deep-refactor deep-review default definit deploy descript detect discoverabl display doctor don draft durabl each editabl enter env error every export flow follow for framework friendlier from full generat get ghp git github giv group guidanc h handl heavy help high horizont how hub i id if implementat import in init input inspect inst interactiv interactively into invocat is it its json just key l leak learn ledger level list log login loop machin machine-readabl map md memory miss mor nam no no-open of one one-tim only open openai openai_api_key or overview palett param parity part past path paus payment per per-flow pick pip plan planner pnpm pre pre-publish preset print profil project project-param provider publish raw readabl recent redo refactor referenc refu refus regenerat reject remov renam render replay request request-chang resolv resum resume-from resume-stag reus review review-heavy reviewer risk rol run s safety sam scaffold schema secret see selector semver set setup shap shell show singl skill skip slug stag start statu stor strong structur subcommand suggest supervisor t task test the then thorough tim to token top top-level typ type-check typecheck ui under unset use using validat valu verb verify vers vib vibestrat vibestrate_hub_token vibestrate_param view warn welcom what wher whol with work worktre yaml yes yml you your your-github-login zod",
      "body": "The `vibe` command is how you work with Vibestrate from a terminal. Run `vibe --help` to see the live list of commands. The CLI reference page is generated from the same command tree, so it never drifts from what your install actually has.\n\n## Shape\n\n```\nvibe                       → open the interactive shell (no args)\nvibe <command>             → run a top-level command (init, run, status, ...)\nvibe <area> <verb>         → run a subcommand under an area (provider list, config set, ...)\n```\n\n## The core loop\n\n```\nvibe init                                 # one-time per project\nvibe doctor                                # verify env + config\nvibe run \"Your task description\"          # start a run\nvibe status                                # see active and recent runs\nvibe replay <runId>                        # inspect any past run\nvibe path <runId>                          # where the run's git worktree is (cd into it)\nvibe rename <runId> a friendlier name      # give the run a readable display name\n```\n\n```\nvibe run \"<same task>\" --resume-from <runId>                        # reuse plan + architecture, redo implementation\nvibe run \"<same task>\" --resume-from <runId> --resume-stage architecting  # reuse plan, redo from architecture\n```"
    },
    {
      "id": "docs/cli/shell",
      "kind": "doc",
      "title": "Interactive shell",
      "source": "Vibestrate docs: cli/shell",
      "summary": "The terminal panel vibe opens with no arguments, with a live status bar, tabbed pages, and an always-on command prompt.",
      "titleTerms": "interactiv shell",
      "terms": "0 00 1 10 2 30 9 a activ activity alway always-on an and approv argument autocomplet b bar body branch browser budget c cap cli command complet config context crew ctrl d daily default dismiss do doc e edit effort end enter esc f flag flow get git header help hi high hom htop i idl into j json k key layout lin liv low m main medium merg mod n navigat no o on only open opt p pag panel prefix profil project prompt q queu r read read-only red replay retent run select set shell shift show snapshot spac spend statu subcommand tab task termin the their they today usd using validat valu vib vibestrat view vim what with worktre writ yellow",
      "body": "Running `vibe` with no arguments opens the interactive shell: a terminal panel that keeps the project's context in front of you and gives you a prompt to drive Vibestrate without leaving the keyboard. It is built on Ink.\n\n```\nvibe\n```\n\nIt runs full-screen in the terminal's alternate screen buffer, the same way `vim` or `htop` do. The canvas is fixed: it never grows or scrolls as you type, and your previous terminal contents come back when you quit. It needs an interactive terminal. In a pipe or CI it prints a notice and exits.\n\n## Layout\n\nThe panel fills the terminal and is split into three bordered regions, top to bottom.\n\n### Autocomplete\n\n```\n▸ vibe config set git.▌\n    › git.mainBranch             = main\n      git.branchPrefix           = vibestrate/\n      git.snapshotRetentionRuns  = 0\n    Branch the run merges into (default main).\n    ⇥ complete · ↑↓ select · esc dismiss\n```"
    },
    {
      "id": "docs/cli/supervised-tasks",
      "kind": "doc",
      "title": "vibe tasks (supervised runs)",
      "source": "Vibestrate docs: cli/supervised-tasks",
      "summary": "Author and run supervised tasks - a task with ordered steps you define once and sequence later through the Conductor.",
      "titleTerms": "run supervis task vib",
      "terms": "a abc123 acceptanc add affect and author between board checklist cli com command compil conductor cover d dashboard defin descript don edit enhanc error fil halt handler id idl in invariant is item json later list machin machine-readabl max migrat mod model mov new next objectiv old on onc order output parity paus posit project re re-sequenc readabl relat reorder replac resum run schema sequenc set show spend src statu step supervis supervised-task supervisor tabl task task-abc123 text the thre through titl to tot ts typ updat usd using v1 v2 vib what with yml you zero",
      "body": "`vibe tasks` manages tasks, including **supervised** ones (`runMode: \"supervised\"`). A supervised task holds an ordered set of steps, each with a scoped objective, a done-when check, and optional file hints. Author the steps, then sequence them through a flow with `vibe tasks run` (the **Conductor**).\n\nSee supervised tasks for the concept.\n\n### `vibe tasks add --supervised `\n\nCreate a new supervised task.\n\n```\nvibe tasks add --supervised \"Migrate settings handler to the new schema\"\nvibe tasks add --supervised \"Migrate settings handler to the new schema\" -d \"Covers the three affected tables.\"\nvibe tasks add --supervised \"Migrate settings handler to the new schema\" --json\n```\n\nOptions:\n\n- `-d, --description ` - longer description attached to the supervised task card. - `--json` - emit the created task as JSON instead of the human-readable summary.\n\n### `vibe tasks checklist add `\n\nAdd a step to an existing supervised task.\n\n```\nvibe tasks checklist add task-abc123 \"Update the settings model\"\nvibe tasks checklist add task-abc123 \"Update the settings model\" \\\n  --objective \"Replace the old SettingsV1 type with SettingsV2 in src/models/settings.ts\" \\\n  --acceptance \"TS compiles with zero errors on the model file\" \\\n  --files \"src/models/settings.ts,src/types/settings.ts\"\n```\n\nOptions:\n\n### `vibe tasks run `\n\n```\nvibe tasks run task-abc123\n```\n\n### `vibe tasks status `\n\n```\nvibe tasks status task-abc123\nvibe tasks status task-abc123 --json\n```\n\n### `vibe tasks pause ` / `vibe tasks resume `\n\n```\nvibe tasks pause task-abc123\nvibe tasks resume task-abc123\n```"
    },
    {
      "id": "docs/concepts/annotation",
      "kind": "doc",
      "title": "Annotations",
      "source": "Vibestrate docs: concepts/annotation",
      "summary": "Pin short notes to your files so the agents read them during a run, without ever touching your code.",
      "titleTerms": "annotat",
      "terms": "a add agent annotat cod codebas concept dur env ever fil human json kept key lin not one pin project rang read resolv run runtim s saf safety see short so the them to touch ts vibestrat visibl what when whol without x your",
      "body": "An annotation is a short note you pin to a file in your codebase, telling the agents something they should know before they start work.\n\nIt works like a sticky note stuck to a page. The page stays exactly as it was, but anyone reading it sees your note first. Use one to say things like \"don't refactor this\", \"this function is the bug\", or \"match the pattern in `x.ts`\" without editing the file yourself.\n\nYou pin annotations from Mission Control's **Codebase** page. They never touch your source. They live in their own file, `.vibestrate/annotations.json`, off to the side. Annotations are entirely optional, and Vibestrate works exactly the same with none.\n\n## What a note pins to\n\nEvery note targets a file, and you can point it at a precise spot:\n\n- **Whole file** - leave the line blank. - **A line** - set a start line, or click the `+` that appears when you hover a line in the file viewer. - **A range** - set a start and end line.\n\n## When agents see them\n\nEach note has a **Visible to agents** toggle, on by default.\n\nWhen it's on, the note is shared. The moment a run starts, all open shared notes are added to every agent's prompt under a `# Human Annotations` section, so the whole crew treats them as instructions for the task.\n\nWhen it's off, the note is private. It stays in the dashboard for you only, and agents never see it.\n\nYou can flip the toggle off any time, or **resolve** a note to drop it from future prompts without deleting it. Resolved notes are kept, greyed out, and you can reopen them."
    },
    {
      "id": "docs/concepts/configuration",
      "kind": "doc",
      "title": "Configuration & settings",
      "source": "Vibestrate docs: concepts/configuration",
      "summary": "Where Vibestrate keeps its settings, and how to view and edit each one in the UI or the CLI.",
      "titleTerms": "configurat set",
      "terms": "10 10-styl 20 20-test adaptiv advis and anthropic anthropic_api_key api block budget cli cod code_writ codebas command commit concept config configurat crew deeper default doctor each edit editor env execut flow git going group how human human-readabl id in init instruct it its json keep key learn liv loc local-worktre machin machine-readabl map md merg methodology next not null one only or out parity permiss persona policy ponytail postur profil project prompt provider raw read read_only readabl resilienc rol rul run sam scheduler schema secret sess set show siz skill spec stay styl supervis test that the thing to ui untouch up vers vib vibestrat view what wher workflow worktre writ yml your",
      "body": "Almost everything you can tune about Vibestrate lives in one place: the `.vibestrate/` folder at the root of your project, created by `vibe init`.\n\nThe heart of it is a single file, `.vibestrate/project.yml` - your providers, profiles, crews, flows, policies, and validation commands all live there. It is plain YAML sitting inside your repo, yours to commit - commit it and your whole team runs the same setup.\n\nYou rarely need to open it by hand, though. Every setting has a place to view and edit it in both the dashboard and the CLI. That's a deliberate rule, not a coincidence (see UI and CLI parity below).\n\n## What lives in `project.yml`\n\nThe file is split into a handful of top-level sections. Each owns one slice of how a run behaves. The table below is the full top-level map - all 27 sections - with the concept page that explains each one where one exists:\n\n## Viewing your configuration\n\n```\nvibe config view          # grouped, human-readable\nvibe config view --json   # the same, machine-readable\nvibe config show          # the raw project.yml, untouched\n```"
    },
    {
      "id": "docs/concepts/consult",
      "kind": "doc",
      "title": "Consult",
      "source": "Vibestrate docs: concepts/consult",
      "summary": "An advisor that knows your real project. Ask it anything - it answers, and the most it can leave behind is a proposal waiting on you.",
      "titleTerms": "consult",
      "terms": "a about advis advisor an and answer anyth api apply ask assist at auth behind block can caveat chang cli concept confidenc confirm consult crew did diff fil flow from get git glanc guid heavier her honest id init is it itself know last leav left manag md most new noth null on policy post project propos quest real refactor reject review rout run s screen see server shell should src surfac t task that the thi tier ts until updat use verify vib vibestrat wait web what why with writ yml you your",
      "body": "**Consult** is the senior voice you can pull aside mid-build. Ask the orchestrator a question and get an answer grounded only in your project's real context. It never touches your code: no run starts, no file in your repository changes, nothing merges. It reads your project, weighs the trade-offs, and tells you what it would do, then stops - the decision stays yours.\n\nThere is one exception, and it is inert by design: if you state a durable rule while you're asking, consult can write down a **proposal** for you to confirm. **What consult can leave behind**, below, is the whole list.\n\nFor a conversation that persists, and that can act on what you say when you allow it, see Supervisor Control. Consult stays the one-shot way in.\n\n## Ask it anything\n\n```\nvibe consult \"Should this auth refactor use a heavier review flow?\"\nvibe consult \"Why did the last run block?\" --run <runId>\nvibe consult \"What's left here?\" --task <taskId>\nvibe consult \"...\" --file src/server/routes/consult.ts\n```\n\nIn the dashboard, the orb at the bottom-right opens the same thing from any screen.\n\n## What it knows about your project\n\nConsult is not a generic chatbot. What it knows about your work is *controlled* context and nothing more: your `VIBESTRATE.md`, your `project.yml` (providers, profiles, crews, policies), recent run outcomes and validation evidence, agent-visible annotations, and, when you pass them, a task, a run, or selected files. All of it is read-only, path-guarded, secret-redacted, and bounded."
    },
    {
      "id": "docs/concepts/crew",
      "kind": "doc",
      "title": "Crew",
      "source": "Vibestrate docs: concepts/crew",
      "summary": "Your set of AI workers, and which AI model each one uses.",
      "titleTerms": "crew",
      "terms": "a act add ai and are at backend backend-implementer broader builder by c0 character cheap claud claude-sonnet-deep cod code_writ concept crew dashboard deep deeper default each edit editor executor fast field fil fit from glanc glob going hand happen implementer install into is it its json label list loc look loop mad mak match max mcp model ndjson nul of on one only pag past permiss pick preset profil project prompt purpos read read_only ready ready-mad review rol role-field role-prompt role-skill run sav screen seat secret server set setup skill sonnet task than the them thorough use vib vibestrat what when whether which who worker workflow writ yml you your",
      "body": "A **Crew** is your set of AI workers. Each Flow lists the *kinds* of worker it needs - a builder, a reviewer, and so on. Your Crew is who actually shows up to fill those spots.\n\nA Crew lets you put a different model in each seat, so the one that builds the change is not the one that reviews it - they read the problem from their own angle and check each other's work, instead of a single model rubber-stamping its own. The disagreement is the point.\n\nThink of a Flow as a recipe that says \"you need a chef and a taster\". The Crew is the people you hire for those jobs, and you decide whether the chef is a fast cook or a careful one. The same recipe works no matter who you hire, which is why a Flow someone else wrote still runs with your own people.\n\nEach worker in a Crew is called a **Role**. A Role does two things: it says which steps it can cover, and it picks the actual AI model that does the work.\n\n```\ncrews:\n  default:\n    label: Default\n    roles:\n      backend-implementer:\n        label: Backend Implementer\n        seats: [implementer, executor, builder]\n        profile: claude-sonnet-deep\n        prompt: .vibestrate/roles/executor.json\n        permissions: code_write\n        skills: []\ndefaultCrew: default\n```\n\nThis says: a Crew named `default` (set as `defaultCrew`, the one used when you do not pick another) has one Role, `backend-implementer`. The `seats` list is the kinds of step this Role can cover. The `profile` is the setting that names the actual model and provider, so a Role never points at a model directly. See profile for how that works.\n\n## Picking who runs\n\n```\nvibe run \"task\" --crew default\n```"
    },
    {
      "id": "docs/concepts/flow",
      "kind": "doc",
      "title": "Flow",
      "source": "Vibestrate docs: concepts/flow",
      "summary": "The steps Vibestrate works through to finish your task - plan, build, check, fix.",
      "titleTerms": "flow",
      "terms": "a ai arbitrat at auth build chang check concept continu customiz dashboard deeper definit edit editor error fil finish fix flow from gat glanc going hub import is it keep model nam need never new on own permiss pick pin plan provider quality quality-arbitrat refactor repeat routin run s skip step sturdier task the through tighten to vib vibestrat when why work worth writ your",
      "body": "A **Flow** is the list of steps Vibestrate works through to finish your task.\n\nThink about hiring someone to remodel a kitchen. A good one doesn't just start swinging a hammer. They draw up a plan, do the work, walk through to check it, and fix anything that's off before they call it done. A Flow is that routine, written down, so every task gets the same care instead of depending on luck.\n\nWhen you run a task without choosing a Flow, Vibestrate uses the one it ships with:\n\n```\nvibe run \"Refactor provider permissions\"\n```\n\nThat default Flow goes Plan, then Build, then Check, then Fix:\n\nPlan Work out what to change before touching anything. Build Write the code. Check Run your tests, then review the change. Fix If the check finds problems, loop back, fix, and check again.\n\nFor most work, that is all you need.\n\n## Picking a sturdier Flow\n\nSome changes deserve more care. A change to login or payments might want a second reviewer to read the result with fresh eyes before it is blessed. For those, ask for a heavier Flow:\n\n```\nvibe run \"Tighten the auth checks\" --flow quality-arbitration\n```\n\nVibestrate ships a handful of built-in Flows. You can install more from the shared **hub**, or write your own. Browse the built-in Flows →\n\n## Why a Flow never names your AI\n\nThis is the part that makes a Flow shareable. A Flow describes the *steps*, and the *kind* of worker each step needs - \"this one needs a builder\", \"this one needs a reviewer\". It never says *which* AI model does the work; your Crew decides that. So you can take a Flow someone else wrote, off the hub, and run it with your own models and your own budget. The routine is shared; the workers are yours."
    },
    {
      "id": "docs/concepts/policies",
      "kind": "doc",
      "title": "Policies",
      "source": "Vibestrate docs: concepts/policies",
      "summary": "The project's one rule surface - tiered rules the active supervisor enforces, from soft advice to a hard merge block.",
      "titleTerms": "policy",
      "terms": "a activ add advic advis at block captur character choic cli concept confirm dash do em em-dash enforc eyebrow fix from gat glanc hard hyphen id it label list matcher merg migrat no no-em-dash no-eyebrow not one only option or owner owner-only pend persona policy preferenc project prompt propos reject remov rul run s sect security soft stay supervisor supervisor-propos surfac the tier to ui use vib vibestrat vs yml your",
      "body": "A **policy** is a rule the project enforces on every run. Policies belong to the *project*, not to one supervisor - so a rule like \"use a hyphen, not an em-dash\" holds no matter which supervisor reviews the work. The active supervisor is the *enforcer*: it carries the project's policies into the review. It does not own them.\n\nEach policy has a **tier** that decides how it is enforced:\n\n- **advise** - the supervisor injects the rule into the reviewer, and a model checks the change against it. A violation is flagged and rides the normal review and fix loop, the same way a correctness note does. This is the default, and the right tier for anything a human judges (\"no eyebrow labels\", \"don't over-engineer this\") - a model generalizes to paraphrases a brittle pattern would miss. An advise rule never blocks a merge on its own. - **block** - a deterministic matcher (a regex) over the run's changed lines. If it matches, the run lands `blocked` with the reason shown, **even if the reviewer approved**. A block is not a model verdict - it is a regex, so it can't false-positive-storm your merges or override the correctness review. It scans from the run's fork point (so changes a flow commits mid-run are caught), skips secret files, and fails closed if it can't read the diff.\n\nA block is **owner-only**. The supervisor can *propose* an advise rule from a consult (\"stop using em-dashes\"); it can never author a hard block. A proposed rule lands *pending* and does nothing until you confirm it."
    },
    {
      "id": "docs/concepts/ponytail",
      "kind": "doc",
      "title": "Ponytail - the minimalism posture",
      "source": "Vibestrate docs: concepts/ponytail",
      "summary": "Code-writing agents default to the smallest solution that works - question whether the task needs to exist, reach for the standard library, one line before fifty. On by default.",
      "titleTerms": "minimalism ponytail postur the",
      "terms": "a agent already an and befor by cod code-writ code-writer concept config crew deeper default do doe exist fals featur fifty fixer for going guard her implementer insid is it library lin mak nativ need on one only ponytail provenanc quest reach see set smallest solut standard stay task that the thi to trust vib what whether work writ writer",
      "body": "Left alone, a coding agent tends to over-build: a helper class where a function would do, a dependency where the standard library was fine, fifty lines where one was enough. **Ponytail** is the posture that pushes back. It injects a \"lazy senior dev\" ruleset into the agents that write code, so their default is the smallest change that actually works. It is on by default - the built-in backbone behavior for code-writing agents, not something you turn on - and you turn it off with `vibe config set ponytail false` (or the dashboard config editor) if you'd rather they not self-restrain.\n\n## What it makes an agent do\n\nBefore writing code, a ponytail agent climbs a ladder and stops at the first rung that answers the problem:\n\n**Does this need to exist?** The cheapest code is the code you don't write. Question the task itself before building it.\n\n**Is it already here?** Reach for something in the codebase before adding anything new.\n\n**Standard library?** Prefer what the language already ships over a new helper.\n\n**Native feature?** Prefer a platform or framework feature over a dependency.\n\n**One line before fifty?** The smallest version that works, not the most general one.\n\nThe result is smaller, less speculative diffs: fewer new files, fewer dependencies, less dead flexibility built \"just in case.\"\n\n## The guards stay on\n\nMinimal does not mean careless. The hard rules survive the posture: understand the problem before touching it, validate at trust boundaries, fail fast on bad input, and leave one runnable check behind. Ponytail trims the *speculative* work, not the correctness work."
    },
    {
      "id": "docs/concepts/profile",
      "kind": "doc",
      "title": "Profile",
      "source": "Vibestrate docs: concepts/profile",
      "summary": "A reusable preset that says how strong and expensive a Role runs - a Provider plus its model and effort.",
      "titleTerms": "profil",
      "terms": "1 4 5 a about actually add advanc agent allow and api at be budget budget_token built built-in by catalog claud claude-max cli codex codex-fast concept config crew deeper delet detect dial disallow duplicat effort effort_ignor enabl exampl expensiv fast fenc from get going gpt gpt-5 guard has how id ignor implement in insid is issu its itself label legibility list low max model ms nest no not off one opt opu orchestrat outsid overlay patch per per-profil plu point post power preset profil project provider providers-catalog quick refus remov reusabl rol run s say set shell sonnet sourc spend statu step step-profil strict strict-writer strong sub sub-agent task that the ther thi timeout to token tool used vib warn what writ writer yml",
      "body": "A **Profile** decides how strong and expensive a Role runs. It is a saved preset that bundles a **Provider** (where the work happens), the **model**, and the **effort** level, so a Role can point at it instead of naming a model itself.\n\n**A Role points at a Profile, not a model.** A Role names a Profile by its id, and the Profile holds the actual provider, model, and effort. So you swap the model for every Role on a Profile by editing one place, and a Role never hard-codes a model itself.\n\nThink of it like the drive modes on a car. \"Eco\" and \"Sport\" don't change who is driving. They change how hard the engine works. A Profile is that setting for an AI worker, saved with a name so you can reuse it. Keep a few per provider.\n\n## A quick example\n\n```\nprofiles:\n  codex-fast:\n    provider: codex\n    label: Codex fast\n    model: gpt-5.1\n    power: low\n  claude-max:\n    provider: claude\n    label: Claude Opus, max effort\n    model: opus\n    power: max\n```\n\nA Role points at one by its id, like `profile: claude-max`. Two Roles can share the same Profile. The same Role can also run on a stronger Profile for a single Step through a step override, without duplicating the Role.\n\n## Fencing off a role's tools\n\n```\nprofiles:\n  strict-writer:\n    provider: claude\n    model: opus\n    disallowedTools: [\"Task\"]   # no nested sub-agent orchestration\n```"
    },
    {
      "id": "docs/concepts/project-params",
      "kind": "doc",
      "title": "Project parameters",
      "source": "Vibestrate docs: concepts/project-params",
      "summary": "Fill your project's answers once, and every run reuses them.",
      "titleTerms": "parameter project",
      "terms": "a acm and answer api api_key astro bdd body boolean brand by check chosen ci cohesiv color concept deeper default deploy each edit enum env every explicit fail fail-fast fast fill flag flow for form framework generat glob going how id increment insid instruct is json just key list methodology nam never nich no now number onc openai openai_api_key option or palett param parameter path per per-flow planner profil project project-glob project-param prompt recogniz remov requir reu run s scaffold scop secret set shar stor str supersed tdd the them then token tru tty typ type-check unknown unset use user valu vib vibestrat vibestrate_param vibestrate_param_color_token x your",
      "body": "Some Flows need a few answers before they can do their job, like a project name, a brand color, or which framework to use. **Project parameters** let you give those answers once. Every later run reuses them, so Vibestrate stops asking you the same things over and over.\n\nThe Flow says what it needs (typed values like `projectName` or `framework`), you fill them in a single time, and the values are saved in `.vibestrate/project-params.json` (gitignored) and reused from then on.\n\n## Fill once, then run\n\n```\n# Fill once (the --flow form type-checks each value):\nvibe params set --flow scaffold projectName=Acme framework=astro\n\n# Now a run just uses them - no prompts, no flags:\nvibe run --flow scaffold\n\nvibe params list\n```\n\nIn the dashboard, the **Project parameters** panel on the Settings page does the same, and the Composer's parameter form prefills from the stored values.\n\nEach declared param has a type, and the form type-checks every value against it: `string`, `number`, `boolean`, `enum`, or `path`.\n\n## How a value is chosen\n\nAt run start each declared param resolves in this order:\n\n```\nexplicit --param / body.params   >   VIBESTRATE_PARAM_<NAME> env\n   >   project params   >   flow default   >   prompt (TTY) / fail-fast (CI)\n```\n\n## Secrets\n\n```\nvibe params set --flow deploy api_key=OPENAI_API_KEY   # stores env:OPENAI_API_KEY\n```\n\n## Generate a default (optional)\n\n```\nparams:\n  palette:\n    type: string\n    generate:\n      instruction: Generate a cohesive color palette for a {{params.niche}} brand\n```\n\n## Methodology (a recognized project-global param)\n\n```\nvibe params set methodology=tdd          # or: bdd, incremental\n```"
    },
    {
      "id": "docs/concepts/provider",
      "kind": "doc",
      "title": "Provider",
      "source": "Vibestrate docs: concepts/provider",
      "summary": "A local coding-agent CLI Vibestrate can drive. Vibestrate supplies the prompt; the provider supplies the model.",
      "titleTerms": "provider",
      "terms": "0 1 11434 127 4 5 a accept add advanc agent ai ai-compatibl aider all also amp anthropic anthropic-api anthropic_api_key any api apply arg assum auth auto auto-fil back balanc bas built built-in c can capability catalog claud claude-cod claude-haiku claude-pro claude-sonnet-4-5 claude-sonnet-deep clear cli cloud cod code_writ codex codex-balanc coding-agent com command commit common compatibl concept config configur crew crush cursor cursor-agent deep deeper default destinat doctor driv dry dry-run eco edit effort egress entry env env-ref exec exist explicitly extern extra family fil fill finetun flag flow for forc format from gap gap-fill gemini gemini_api_key going goos haiku help http http-api human implement in input insid isn it its json just key kind knob known known_provider level list liter loc localhost localhost-proxy login machin machine-readabl matter md messag mistak mod model my my-finetun mycli nam need never no no-auto-commit non non-cli not noth null ollama ollama-loc one only open openai openai_api_key opencod opu opus-deep or output output-format overlay own p permiss permission-mod power preset preset-ready pro prob profil project prompt provider providers-catalog proxy pull put qwen qwen3 r raw read read_only readabl ready real reason ref refresh replac reus review reviewer rol run run-wid saf safe-mod sam seat server sess set setup show sonnet sourc sovereignty stdin step step-profil submit suggest supply t test the ther to token tru turbo twic typ up url usag use user valu vib vibestrat view vs what wher why wid with would writ x yaml yes yml your zero zero-egress",
      "body": "A provider is the AI model you're using, wrapped so Vibestrate can talk to it. Claude Code, Codex, Ollama - Vibestrate doesn't care which, as long as it's installed on your machine.\n\nThink of Vibestrate as the manager and the provider as the worker it hands tasks to. Vibestrate writes the prompt; the provider runs the model and hands back the response (and, for providers that edit files, the file changes too). That's the whole contract - everything model-specific stays on the provider's side of that line.\n\nProviders are declared under `providers:` in `project.yml`. You declare each one either as a `cli` invocation (a command, its args, and how the prompt is fed in) or as a `claude-code` integration, which Vibestrate understands more deeply. Each provider advertises what it can do - reuse a session, report token usage, or hand back a session id - and Vibestrate drives them all through one uniform interface.\n\n> **Use `claude-code`, not `cli`, for Claude.** The deeper integration is what makes Vibestrate *permission-aware*: when a write-capable seat (`permissions: code_write`) runs on a `claude-code` provider, Vibestrate injects `--permission-mode acceptEdits` so the headless `claude -p` can actually apply its edits in the worktree. A seat's `code_write` only governs Vibestrate's own broker; the underlying CLI has its *own* permission gate, and a generic `cli` provider can't be granted through it (the flag is claude-specific). Read-only seats - and any read-only / strict-apply-only run - get no grant. Set your own `settings.permissionMode` to override the default.\n\n> **Provider vs profile vs role:** a *Provider* is the installed **CLI**; a *Profile* names a Provider plus how strong/expensive to run it; a *Role* runs on a Profile. Roles never point at a Provider directl\n…"
    },
    {
      "id": "docs/concepts/role",
      "kind": "doc",
      "title": "Role",
      "source": "Vibestrate docs: concepts/role",
      "summary": "One worker in your Crew - the instructions it follows, the model it runs on, and the kinds of step it can handle.",
      "titleTerms": "rol",
      "terms": "1 403 a accept and api approv arbiter architect are assembl assign builder built built-in can carry challenger claud claude-cod cli cod code_writ concept config content context crew deep deeper default deliberately edit executor field fil fixer flow follow get glob going handl how id implementer in init insid instruct into is it json kind label merg merge_ready mod model of on one only opu opus-deep outsid patch path permiss permission-mod planner post profil project prompt provider purpos put read read_only ready requir require_approv resolv reviewer rol role-field role-prompt role-skill run s schema seat shell six skill split step subject termin than the thi unassign verifier vers vib vibestrat vs what why wider work worker writ yml your",
      "body": "A **Role** is one worker in your Crew, and it says how that worker behaves and which kinds of step it can take on.\n\nThink of a Role like a job description on a team. The description says what this person does and which tasks they are allowed to pick up. It doesn't name the actual person. A Role works the same way: it points at a **profile** (which decides the model), and lists the **seats** (the kinds of step) it can fill in a flow.\n\n## What a Role carries\n\nA Role is one row inside a crew, under `crews. .roles`. There is no top-level `roles` map. Each Role carries:\n\n```\ncrews:\n  default:\n    roles:\n      reviewer:\n        label: Reviewer\n        seats: [reviewer, challenger]\n        profile: opus-deep\n        prompt: .vibestrate/roles/reviewer.json\n        permissions: read_only\n        skills: []\n```\n\n- A `prompt` pointing at its JSON role file - `{\"schemaVersion\": 1, \"id\": \"reviewer\", \"prompt\": \"...\"}`, where `prompt` holds the instructions. - A `profile` it runs on (it points at a Profile, never directly at a provider). - A `seats` list of step kinds it can fill. - A `permissions` profile and any attached `skills`.\n\n## Role vs Profile vs Provider\n\nThese three are easy to mix up:\n\n- A **Role** is the behavior - the Reviewer. - A **profile** is how strong or expensive it runs - `opus-deep`. - A **provider** is the installed CLI behind the Profile - `claude`.\n\nOne Profile can back many Roles, and one Provider can back many Profiles."
    },
    {
      "id": "docs/concepts/safety",
      "kind": "doc",
      "title": "Safety - Action Broker & policies",
      "source": "Vibestrate docs: concepts/safety",
      "summary": "How Vibestrate routes every real effect through one checkpoint, writes down what it decided, and lets you deny or hold actions for approval.",
      "titleTerms": "act broker policy safety",
      "terms": "120 40 a act activ advanc after again allow allowlist already and any api applicabl apply apply-only approv are ask assuranc attend audit auto auto-retri back backend backoff be befor behavior best best-effort block blocker both boundary broker budget by can cap caus ceil chang checkpoint claud cli clock clos codex command complet composer concept confidenc config configur confinement consult container continu control count coverag crew cross daily dashboard day decid default default-allow default-deny defens deny depth descript detail did didn diff docker doctor doe dollar don doorway dotenv dotenv-styl down downgrad downgrade-model dur effect effort egress env error every exec execut exhaust fail fail-clos failur fallback fell fetch field fil fix flag flow for forbid full fully gap gat get git glob guard hard harden harden-read-only hiccup hold hold-merge-for-review honest honor how human i id in information init install is isolat it its json kind let limit list liv load los loudly match max max-time-day max-turns-run may mcp md merg merge_ready messag min miss mod model nam nativ ndjson network never no no-network-install no-secret-writ not not_applicabl not_run noth nothing-to-verify npm of off on onc one only or os out packag pars partially partially_verifi pass patch path pattern paus per permiss permission-mod pip plan policy post post-turn postur preset preview profil project provider provider-nativ rat rate-limit read read-only ready real reduc reduce-effort refu refus regex request requir require_approv resilienc retri retries_exhaust retry retry-after review review_miss rid rout rul run runtim s safety sandbox scor seat secret set show sign skill so soft someth spawn spend start statu step step-by-step steps_failed_tolerat stop story stream stream-json strict strict-apply-only styl subscript t that the them then thi think through tim to today tolerat tool tool_us transient tru turn two unattend unbound unbounded_unattended_run unsaf unsandbox usag usage_limit usd use validat validation_miss verdict verifi verificat verification_not_run verify veto vib vibestrat wait waiting_for_approv wall warn was what when wher with writ yaml yml you zero",
      "body": "Nothing a run *does* to your machine happens without passing one checkpoint, and that checkpoint writes down what it decided and what actually happened.\n\nThink of a single doorway with a guard. Every time a run wants to do something real to your computer - start an AI provider, run a command, change a file, finish the run - it has to pass through that one doorway. The guard checks each request against your rules, decides yes or no, and logs the decision and the outcome.\n\nIn Vibestrate that doorway is the **Action Broker**. Every side-effecting operation a run performs - spawning a provider, running a validation command, applying or reverting a patch, writing a config file, opening a terminal, completing a run - crosses it.\n\n**One guarded doorway.** Every side-effecting operation crosses the single Action Broker. For each request the broker decides against an ordered chain of evaluators (first `deny` wins, otherwise the first `require_approval`, otherwise `allow`) and records the decision plus post-execution evidence as one line in `.vibestrate/runs/ /actions.ndjson`. Every decision is **honored fail-closed**: anything short of an explicit `allow` refuses the effect at the call site. What crosses the boundary is what a *run* does. Editing your own configuration - from the dashboard or the CLI - does not, and the list is below.\n\n**What the broker is not: a default-deny gate.** Resolution is **default-allow with a policy veto**. An effect that no policy matches is allowed, and policies can only *refuse* or *hold* - none of them can grant. So the broker is where you impose and record limits, not a whitelist you must satisfy to get anything done.\n\nWhat holds with **zero** policies configured is the layer underneath: the built-in patch-safety check (secret-bearing content\n…"
    },
    {
      "id": "docs/concepts/sandbox",
      "kind": "doc",
      "title": "Container isolation - run in a disposable Docker container",
      "source": "Vibestrate docs: concepts/sandbox",
      "summary": "Run each agent turn inside a throwaway Docker container so the blast radius is the container, not your machine - what it mounts, what it can't touch, and where it stops short.",
      "titleTerms": "a container disposabl docker in isolat run",
      "terms": "0 169 254 443 512 a admin agent all allow allowlist an and anthropic anthropic_api_key anthropic_base_url api aqf are auth aws back backend bas becom befor blast bomb by can cap cap-drop cap_net_admin carry claud cli clos codex com concept config confin connect container credenti cross default degrad deny disposabl do docker doe doesn drop each egress enetunreach enforcement environment exampl exec execut f fail fail-clos fall filesystem filter fit fork fork-bomb fresh fs gateway github github_token guard hard harden hom host how http http_proxy https_proxy imag in insid intern is isolat it json key label latest leak limit loc local-worktre localhost machin manag max mod model mount must my my-org narrow net network never new no no-new-privileg not npmj of on onc only open openai openai_api_key operat opt opt-in org out outsid own per permit pid pids-limit pretend privileg process project provider provider-auth proxy prun ps radiu rather reach read read-only read-writ readonly recommend refu registry rest rm root run runtim s safety sandbox secret security security-opt servic set short so ssh start stop t than the thi throwaway tmp to token too touch tru trust turn unavailabl url variabl vib vibestrat vibestrate-agent vm wall what wher worktre writ writabl yml you your",
      "body": "By default a run executes on your machine, bounded by a git worktree and the post-turn diff gate. For an unattended run, or a task you don't fully trust, you can move the agent off your host entirely: set `execution.backend: docker` and each provider turn runs inside a **disposable Docker container**. The blast radius becomes the container, and it's the same wall no matter which provider runs - which a provider's own sandbox can't do (that only confines its own process).\n\nThe container backend is a deliberate choice for an unattended or lower-trust run, not a tax on every run - `execution.backend: local-worktree` stays the default and nothing changes until you opt in. Turn it on with `vibe config set execution.backend docker` or the dashboard config editor.\n\n## Fail-closed: it refuses rather than pretend\n\n```\n# .vibestrate/project.yml\nexecution:\n  backend: docker            # default: local-worktree\n  container:\n    image: my-org/vibestrate-agent:latest  # MUST carry the provider CLI\n    onUnavailable: fail       # default. \"degrade\" = fall back to host (not recommended)\n    readonlyRoot: true        # default. read-only root fs; writable: worktree, /tmp, HOME\n    pidsLimit: 512            # default. max processes in the container (fork-bomb guard)\n```\n\n## Confining the network (egress allowlist)\n\n```\nvibe config set execution.container.egress.mode allowlist\n```\n\n```\nvibe config set execution.container.egress.allow '[\"registry.npmjs.org\", \".github.com\"]'\n```"
    },
    {
      "id": "docs/concepts/seat",
      "kind": "doc",
      "title": "Seat",
      "source": "Vibestrate docs: concepts/seat",
      "summary": "The empty chair a Flow step needs filled - a label, not a name, which is what keeps Flows shareable.",
      "titleTerms": "seat",
      "terms": "a agent agent-turn architectur ask brief chair chang cod concept deeper descript diff empty execut fil flow flow-schema for going how id implement implementer input insid is keep kind label mak nam need not output plan profil provider resolv respons response-turn review review-turn rol schema seat shareabl src step summary summary-turn task task-brief the ts turn what which",
      "body": "A **Seat** is an empty, labelled chair in a Flow that says \"this step needs someone to fill it.\" It is a contract, not a person: it names the *kind* of worker a step needs, and nothing about who.\n\nPicture a Flow as a table with chairs around it. One chair is labelled \"implementer\", another \"reviewer\". The Flow sets out the chairs and what each one is for. It never says who sits down. Your Crew does that, choosing a worker for each Seat when the task actually runs.\n\nThat gap is the whole point. Because a Flow only names chairs and never names your AI models, you can take a Flow someone else wrote and run it with your own workers. The chairs are shared. Who fills them is yours.\n\n## How a Flow asks for a Seat\n\nA Flow declares the Seats it needs, then points each step at one:\n\n```\nseats:\n  implementer:\n    label: Implementer\n    description: Makes code changes.\n\nsteps:\n  - id: implement\n    label: Implement\n    kind: agent-turn\n    seat: implementer\n    inputs: [task-brief, plan, architecture]\n    outputs: [execution, diff]\n```\n\nYour Crew fills the `implementer` seat with a worker (a Role) you've set up. You can name that Role anything - Backend Implementer, Executor, Coder - as long as it lists `implementer` in its own `seats`.\n\n## Which steps need a Seat\n\nNot every step does. A step that just runs your tests, or one that pauses for your approval, needs no Seat - nobody is sitting down to think. Steps where an AI does a turn of work do: `agent-turn`, `review-turn`, `response-turn`, and `summary-turn`.\n\n## Going deeper\n\nA Seat carries a `label` and an optional `description`, and nothing else - no model, no vendor. The worker who takes the Seat brings the model through its profile, so the same Flow can run on different AI depending on who fills the chair."
    },
    {
      "id": "docs/concepts/skill",
      "kind": "doc",
      "title": "Skill",
      "source": "Vibestrate docs: concepts/skill",
      "summary": "A markdown file you write once that loads alongside an agent's prompt, so it always knows the things that should be true about your codebase.",
      "titleTerms": "skill",
      "terms": "a about act agent alongsid alway an as assign attach auth auth-convent be cent claud codebas common concept convent crew currency deeper default different ephemer error error-handl every everyth executor extern fetch fil float for go going handl help id idempotency idempotent in includ info inlin inst integer is it key know lik liv load log logger look markdown md mistak money must ndjson never not onc oncall oncall-runbook one payment planner post process project prompt put real refund rol rul run runbook runtim s safety servic should sink skill so src stor stuck that the thi thing through to touch transact tru using vib vibestrat vs what when wher why with writ yml you your",
      "body": "A **skill** is a markdown file you write once, and any agent can read it. Use it for the things that should always be true about your codebase: your conventions, your security rules, the \"we don't do X here.\"\n\nThink of it as the note you'd hand a careful new colleague on their first day. You don't repeat the house rules every time you give them a task. You write them down once, point to them, and trust they'll be remembered.\n\nVibestrate discovers skills by filename. The filename minus `.md` is the skill id, and its contents load into an agent's prompt as extra context. So `auth-conventions.md` is the skill `auth-conventions`.\n\n## Why it helps\n\nMost \"the agent did the wrong thing\" problems trace back to context the agent didn't have. Skills fix that without retraining a model and without padding every task description with the same boilerplate.\n\n## What a skill looks like\n\nThere's no required format. It's markdown. Write it like documentation for a careful colleague.\n\n```\n# .vibestrate/skills/payments.md\n\nThis codebase handles real money. When touching `src/payments/`:\n\n- Always idempotent. Every external POST must include an idempotency key.\n- Currency is stored as integer cents. Never floats.\n- Refunds must go through `RefundService.process()` - never inline.\n- Log errors with `paymentLogger`, not the default logger (different sink).\n```\n\nThat's the whole skill. No frontmatter required.\n\n## Where skills live\n\nDrop a skill in either of two folders:\n\n## Attaching a skill to an agent\n\n```\ncrews:\n  default:\n    roles:\n      planner:\n        skills: [payments, error-handling]\n      executor:\n        skills: [payments]\n```\n\n```\nvibe run \"Refund a stuck transaction\" --skills payments,oncall-runbook\n```"
    },
    {
      "id": "docs/concepts/spec-up",
      "kind": "doc",
      "title": "Spec-up (plan before you build)",
      "source": "Vibestrate docs: concepts/spec-up",
      "summary": "Turn a vague brief into a scoped spec, an architecture, the risks, and a reviewable roadmap - before any code is written.",
      "titleTerms": "befor build plan spec spec-up up you",
      "terms": "1 2 a acceptanc adaptiv all an and answer any approv architectur at befor brief check cod command concept consult find flow gap gap-check gat get glanc honest how id in intak into is it limit off orb proc project quest real register reviewabl risk roadmap round run scop simplify spec spec-up spec-up-intak suggest the to turn up v1 vagu vib what wher written yml you",
      "body": "Most planning tools answer \"how do I write this change?\" Spec-up answers the question that comes before it: \"what are we actually building, and what did you not tell me yet?\"\n\nYou give it a brief - even a vague one, like \"a mini ecommerce store\" - and it surfaces the decisions the brief left unstated (do users sign in? how do you take payments? how many products? do you ship physical goods?), asks you those gap questions, and only then drafts the plan. Nothing it does touches your code: every step is a read-only run.\n\n## How it runs\n\n```\nintake  ->  (answer round 1)  ->  gap-check  ->  (answer round 2) ... ->  spec-up  ->  (you approve)  ->  roadmap\n```"
    },
    {
      "id": "docs/concepts/state",
      "kind": "doc",
      "title": "Run state",
      "source": "Vibestrate docs: concepts/state",
      "summary": "The status a run is in, what each one means, and the rules that keep moves between them honest.",
      "titleTerms": "run stat",
      "terms": "a abort allow allowed_transit and approv architect are at between block concept creat decid deeper each enforc error execut fail fix for gat going honest id in inspect is it json keep kind lifecycl matter mean merg merge_ready mov of one paus plan policy policy-gat ready replay request review rul run stat statu sticky termin that the them transit two user user-request validat verify vib vibestrat wait waiting_for_approv what why",
      "body": "A run always has one status, and you can check it at any moment to know exactly what the run is doing right now.\n\nThink of it like a package you've shipped. At any point it's in one definite place - \"out for delivery\", \"delivered\" - never two at once, and never somewhere the tracking made up. A run's status works the same way. It's always a single value, saved so you can read it back, and never a guess.\n\nThat saved value lives in `.vibestrate/runs/ /state.json`. The `status` comes from a fixed set of values, and Vibestrate validates it before writing it down.\n\n## The moves are enforced\n\nWhat makes the status trustworthy is that Vibestrate controls how a run gets from one status to the next. Every allowed move is written into an explicit list, the `ALLOWED_TRANSITIONS` allowlist. If something tries a move that isn't on the list, Vibestrate raises a `StateTransitionError` and stops, instead of letting the bad move happen quietly.\n\nThe four terminal states - `merge_ready`, `blocked`, `failed`, and `aborted` - have no way back out. Once a run reaches one of them, it stays there.\n\n## Why it matters\n\nThe state machine is what makes runs replayable, pausable, and auditable. When a run says it's `verifying`, that's the truth. The verifier is running, the previous artifacts are committed, and there's no in-between fuzz. When it says `merge_ready`, the diff is real and the validation passed.\n\n## The statuses\n\nThe canonical, generated list lives in the run-state reference.\n\n## Inspecting state\n\n```\nvibe status\nvibe status --json\nvibe replay <runId>\n```"
    },
    {
      "id": "docs/concepts/supervised-tasks",
      "kind": "doc",
      "title": "Supervised tasks (run modes)",
      "source": "Vibestrate docs: concepts/supervised-tasks",
      "summary": "A task has steps and a run mode - plain (one pass) or supervised (the Conductor sequences each step with its own review). One card for a whole feature.",
      "titleTerms": "mod run supervis task",
      "terms": "20 a acceptanc add and at author availabl card check cleanly com concept conductor context curat dashboard driv each enabl enhanc escalat fals featur fil for fresh from glanc ground halt has hint id invariant is its ledger manu max mod model new next not now objectiv one only or own packet pass paus plain plan plan-only proc profil project re re-ground re-sequenc refin relat remov reorder resum review run sequenc spend step supervis supervised-task supervisor task text the usd vib vs what whol with yml you",
      "body": "There is no separate \"saga\" kind of task. A Task has an ordered set of **steps**, and a **run mode** that decides how those steps run:\n\n- **plain** - the default flow runs the task in one holistic pass. - **supervised** - the **Conductor** sequences the steps one at a time, each with its own review (and the supervisor, invariants, Enhance, budget, and clean-halt described below). A single-step task is just the degenerate case.\n\nEach step carries:\n\n- a **text** label - what the step is called on the card, - an **objective** - the scoped brief an executor will receive, - an **acceptance check** - a plain-language done-when description, - optional **file hints** - paths or globs that are primary context for that step.\n\n## Plain vs supervised\n\nA plain task with a checklist is a lightweight to-do list run in one pass. A **supervised** task uses the objective + acceptance check as structured fields the Conductor uses to brief each step's run and verify it before the next one starts; the file hints narrow each step's context. Use supervised when the steps are distinct enough to run independently - each with its own executor turn, its own review, and its own verdict. Flipping a task to supervised turns on the whole bundle (per-step review, the supervisor, Enhance, the per-task budget, the run lock, clean-halt)."
    },
    {
      "id": "docs/concepts/supervisor",
      "kind": "doc",
      "title": "Supervisor",
      "source": "Vibestrate docs: concepts/supervisor",
      "summary": "The setting that decides how closely Vibestrate watches a run, and records every call it makes.",
      "titleTerms": "supervisor",
      "terms": "20251001 4 5 a advis an and apply approv at auto block call car cheap cheap-reviewer claud claude-haiku-4-5-20251001 closely concept cross cross-model decid deeper enforc engineer every for glanc going haiku honest how id it label len list look mak migrat mod model mor nudg on panel permiss permission-mod persona phas pick policy postur preferenc profil project provider record review reviewer risky run s sandbox sandbox-suggest seat security see set singl single-profil spec spec-up staff staff-engineer suggest supervisor that the thi unattend up vib vibestrat watch what wher who work you",
      "body": "A **supervisor** (its config calls it a **persona**) is the attitude Vibestrate brings to a run: how closely it should watch the work, and how strict it should be before calling the work done. It does no work itself. It sets the level of scrutiny and leaves a paper trail.\n\nThink of a building inspector. They don't pour the concrete or hang the drywall. They decide how hard to look, send the risky parts back for a second opinion, and write down every call they make so you can trust the sign-off. The supervisor plays that role for a run.\n\n## What it decides\n\n**More care for risky work.** Each supervisor knows which changes deserve extra caution. The built-in `staff-engineer` watches for things like logins, payments, database migrations, and concurrency. When a task matches, the run is automatically upgraded to a more thorough Flow, such as a multi-reviewer panel, and the exact words that triggered it get recorded. Upgrades only ever add care, never remove it.\n\n**An honest label on the review.** If the same AI that wrote the code also reviewed it, the run is marked `single-profile`. That is a self-check, and a self-check can only lower confidence, not raise it. If a genuinely different AI did the review, it's marked `cross-model`.\n\n## Picking who reviews\n\n```\npersonas:\n  staff-engineer:\n    label: Staff engineer\n    reviewerProfile: cheap-reviewer   # review seats run this Profile\nprofiles:\n  cheap-reviewer:\n    provider: claude\n    model: claude-haiku-4-5-20251001\n```"
    },
    {
      "id": "docs/concepts/supervisor-control",
      "kind": "doc",
      "title": "Supervisor Control",
      "source": "Vibestrate docs: concepts/supervisor-control",
      "summary": "A conversation with your project's supervisor that remembers, and - when you allow it - acts on what you say.",
      "titleTerms": "control supervisor",
      "terms": "40 a act advis afterward allow and answerer at autonomy be budget button cannot ceil clos concept config control conversat diff fail glanc into is it last let max max-turns-run md not noth on project reason remember resum reversibl review router run s say set start statu stop supervisor supervisor-control talk tell that the thing thread to turn verbatim vib vibestrat what when why will with without word writ you your",
      "body": "**Supervisor Control** is the first thing on Mission Control, above the composer. It is a conversation with the supervisor that persists, knows your project, and can put work where it belongs - so saying what you want out loud is a real way to start work, not a side channel.\n\nThere are two kinds of thread, and the difference matters:\n\n- **The project thread**, on Mission Control. This is the one that can start runs. - **A run's thread**, on that run's page beside the control centre. Scoped to one run, because runs are genuinely concurrent and a shared thread would leave \"do that again\" without a referent. It will not start a *second* run from inside the first; it offers to add the work to the task instead.\n\nConsult answers one question and forgets it. That is right for \"what would you do here\" and useless for someone you work alongside: every follow-up re-explains the project, and nothing it decided five minutes ago survives. Supervisor Control keeps the thread.\n\n## Talking to it\n\nType what you want. It answers from your real project context: the tasks, the runs that have happened, what your checks say, and the operating manual if you keep one.\n\nNot sure how to review a change it made? Ask it. That is the question it is best at, and the reason the panel exists rather than a second composer.\n\n## Letting it act\n\nOut of the box the supervisor **writes nothing**. It answers, suggests, and drafts, and that is all.\n\n```\nvibe config set supervisorControl.autonomy act\n```\n\n```\nvibe budget set --max-turns-run 40\n```\n\n## The stop button\n\n```\nvibe supervisor stop --reason \"reviewing the last diff\"\nvibe supervisor status\nvibe supervisor resume\n```"
    },
    {
      "id": "docs/concepts/task",
      "kind": "doc",
      "title": "Task",
      "source": "Vibestrate docs: concepts/task",
      "summary": "The plain-language brief you hand Vibestrate. One sentence kicks off a full plan, build, review, verify run.",
      "titleTerms": "task",
      "terms": "1 1-bas a accessibility add and append apply assuranc at audit authz back back-to-back bas between block break brief build but cap cap-and-continu chang check checklist concept configurabl consistency constraint context continu continuou correctness cost deriv detach don endpoint enhanc exist flow for from full glanc good hand handler happen health human ia id improv in in_progress includ inherit inject into is item json key kick languag len lib list log logger look mark merg merge_ready mov nam need never off one only open out outcom parent paus pend per per-item performanc pick pickup pickup-review plain plain-languag plan plausibl plausible-but-wrong practic print progress propos put read read-only ready relat reorder return review risk rout run sav secret security security-risk sentenc server set should skill src stabl stat statu step structur submit surfac task test the tip titl to ts up use user ux ux-ia valu verify vib vibestrat visu visual-consistency vs weak what when whol wrong yardstick you",
      "body": "A Task is what you want done, written in plain language, the way you would brief a capable colleague. You say what you want. Vibestrate works out the steps.\n\n```\nvibe run \"Add structured logging to the settings save handler\"\n```\n\nThat one line is a complete Task. You don't list files or set an order. The Flow decides the steps and your Crew does the work. The Task is just the brief.\n\n## A good Task vs a weak one\n\n```\nvibe run \"Add structured logging to the settings save handler in src/server/routes/settings.ts. Use the existing logger from src/lib/logger.ts. Include the user id and the changed keys, but never the values.\"\n```\n\n```\nvibe run \"Improve logging\"\n```\n\n## Checklists: break a Task into items\n\n```\nvibe tasks checklist add  <taskId> \"/health returns json\"\nvibe tasks checklist add  <taskId> \"test the endpoint\"\nvibe tasks checklist list <taskId>\nvibe tasks checklist check <taskId> <itemId>      # mark done\nvibe tasks checklist status <taskId> <itemId> in_progress\nvibe tasks checklist move <taskId> <itemId> 1     # reorder (1-based)\n```\n\n### Open a step\n\n```\nvibe tasks enhance <taskId>            # read-only: prints a proposed checklist\nvibe tasks enhance <taskId> --apply    # append the proposed items\n```\n\n## Pick up: run the whole checklist\n\n```\nvibe tasks pickup <taskId>          # continuous: items back-to-back\nvibe tasks pickup <taskId> --step   # pause between items for review\n```\n\n### Per-item review: the `pickup-review` flow\n\n```\nvibe tasks pickup <taskId> --flow pickup-review\n```\n\n```\nvibe run \"<task title>\" --task <taskId> --flow pickup-review --checklist continuous\n```"
    },
    {
      "id": "docs/concepts/vibestrate-md",
      "kind": "doc",
      "title": "VIBESTRATE.md",
      "source": "Vibestrate docs: concepts/vibestrate-md",
      "summary": "A committed manual at your project root that the orchestrator reads before every task, so you never re-explain your project.",
      "titleTerms": "md vibestrat",
      "terms": "a against and approv arbitrat architectur ask at author befor boundary build codebas codebase-map command commit concept configurat constraint convent credenti crew critic current development domain e every execut explain express extra flow g gat get goe guidanc head heavier how implementer in init install is isolat it its json known lean learn lesson lint locally machin machine-own manu map md mod model never not or orchestrat orchestrator order other own path planner policy prefer preferenc print project propos provider quality quality-arbitrat quest rank re re-explain read regenerat review risk rol root rul run sandbox secret show so stay task test that the thi to touch typecheck use validat vib vibestrat vibestrate-md what when who you your",
      "body": "`VIBESTRATE.md` is a committed file at your project root that tells the orchestrator what this project is and how you like it run. It reads the file before every task, so you never re-explain your project. It is durable, project-aware guidance the orchestrator leans on - advisory, not a hard rule: it shapes how a run is planned, but it can never override a code-enforced policy.\n\n## What goes in it\n\nKeep it concise and prune it. Suggested sections, written in plain prose:\n\n```\n# VIBESTRATE.md\n\n## Project Model\nWhat this project is, its domains, architecture boundaries, critical flows.\n\n## Development Commands\nInstall, test, typecheck, lint, build, run locally - in order.\n\n## Orchestration Preferences\nPreferred flows and crews; when to use heavier review; when to stay lean.\n\n## Risk Rules\nWhen to propose sandbox mode, approval gates, isolated execution, extra\nvalidation. (e.g. \"propose sandbox mode when a task touches provider execution\nor secret/credential paths.\")\n\n## Codebase Conventions · Known Constraints · Lessons Learned\n```\n\n## How it ranks against other guidance\n\nIt is distinct from `.vibestrate/rules.md`, and the precedence is explicit:\n\n| Layer | What it is | Enforced? | | --- | --- | --- | | **Policy** (`.vibestrate/policies/`) | Hard, code-enforced gates | Yes - code | | **`VIBESTRATE.md`** | The orchestrator's operating manual | No - advisory | | **`.vibestrate/rules.md`** | Per-turn prompt guidance for roles | No - advisory |\n\n## The codebase map: machine-owned, not authored\n\n```\nvibe learn                                 # regenerate the map\nvibe learn show                            # print the current CODEBASE.md\n```\n\n### Who gets the map\n\n```\ncodebaseMapRoles: [planner, implementer]\n```"
    },
    {
      "id": "docs/concepts/workflow",
      "kind": "doc",
      "title": "Workflow",
      "source": "Vibestrate docs: concepts/workflow",
      "summary": "The ordered sequence of stages a run moves through - plan, architect, execute, validate, review, fix, verify.",
      "titleTerms": "workflow",
      "terms": "0 a add and arbitrat architect architectur architecture-handoff array block breaker brief built built-in by ceil claud command common concept context continu contract crew decis decision-summary deeper default edit error every execut execution-handoff explicit express fail fast find finding-resolut finding-respon fix flow fresh from glob going handoff high how id in insid is long loop many max md mistak mov n of on one opt opt-in order output pag panel panel-review plan plan-handoff pnpm quality quality-arbitrat recip resolut respon resum resume-from resume-stag retry reus review run run-brief runner sam seat sequenc sess set siz skip stag stay step summary the through tie tie-breaker token too track turn typecheck typo validat verify vib when workflow",
      "body": "A workflow is the ordered set of stages a single task moves through, from \"submitted\" to \"ready to merge\". Each stage knows the status it starts in, the status it finishes in, and (for the stages where a model does the work) which kind of worker is responsible.\n\nThink of it like an assembly line. A part can't skip ahead to the end of the line and call itself finished. Vibestrate's state machine is the rail that keeps each run moving station by station, so a run can't jump from \"planning\" straight to \"merge_ready\" without doing the work in between. The orchestrator is what moves the part down the line.\n\n## The default workflow\n\nWhen you run a task without picking a different flow, you get the built-in **`default` flow**. It runs through seven stages, with a small loop in the middle that fixes problems and re-checks:\n\n```\nplanning → architecting → executing → validating → reviewing → verifying\n                                          ↑           ↓\n                                          └─ fixing ──┘\n```\n\nHere is what each stage does and who does it:\n\n## One runner, many recipes\n\n```\nvibe run \"...\"                  # the built-in default flow\nvibe run \"...\" --flow default   # the same flow, explicit\nvibe run \"...\" --flow quality-arbitration\n```\n\n### Fast tracks\n\n```\nvibe run \"fix the typo in the seat concept page\" --flow express\n```"
    },
    {
      "id": "docs/concepts/worktree",
      "kind": "doc",
      "title": "Worktree",
      "source": "Vibestrate docs: concepts/worktree",
      "summary": "Every run does its work in a separate copy of your project, so your real files are never touched.",
      "titleTerms": "worktre",
      "terms": "a abort after along and another are auto bar be block bold bold-lovelac branch bring can cd checkout concept copy d deeper default dir doe env environment every fail fil for git going id in its keep link liv lovelac main merg merge_ready modul never nod node_modul of off one pem prefix project quiet quiet-tur ready real remov run runtim s saf safety separat so t the thi tool touch tur venv vibestrat vibestrate-worktre what wher why work worktre written yml you your your-project",
      "body": "Every time Vibestrate works on a task, it does that work in a separate copy of your project. Your real files, the ones you edit yourself, are never touched.\n\nThat separate copy is a git **worktree**. Git can keep a second working folder of the same project, on its own branch, sitting right next to your main one. Picture it like a contractor building your new kitchen in a workshop down the street: same blueprints, but the mess stays out of your house until you choose to bring the finished work home.\n\nThe copy is created when the run starts, lives under `../.vibestrate-worktrees/` by default, and gets its own branch named ` ` - the run id itself, no slug appended.\n\n## Why this keeps you safe\n\nBecause the run works in its own folder on its own branch, you can keep coding in your real project at the same time. The two never collide, and git doesn't even notice the overlap.\n\nIt also means nothing is lost when a run goes wrong. If a run ends `blocked`, `failed`, or `aborted`, its copy stays on disk so you can open it, read the half-finished work, and pull out anything useful.\n\n## Where the copies live\n\n```\nyour-project/                  ← your real files\n../.vibestrate-worktrees/\n  bold-lovelace/                ← one run's copy\n  quiet-turing/                 ← another run's copy\n```\n\n```\ngit:\n  worktreeDir: ../.vibestrate-worktrees   # default\n  branchPrefix: vibestrate/                # default\n  linkEnvironment: auto                    # default; \"off\" for bare worktrees\n```\n\n## After the run\n\n```\ncd your-project\ngit worktree remove ../.vibestrate-worktrees/<runId>\ngit branch -D vibestrate/<runId>\n```"
    },
    {
      "id": "docs/extending/add-flow",
      "kind": "doc",
      "title": "Add a Flow",
      "source": "Vibestrate docs: extending/add-flow",
      "summary": "Write your own run recipe with seats, steps, and an optional pause for your approval.",
      "titleTerms": "a add flow",
      "terms": "a add add-flow agent agent-turn an and api approv approval-gat both builder can challenger chang clean clean-room com command commit common decid deep deeper diff exampl export extend fil fill flow flow-skip for from gat going got how http id import input it kind label mistak model narrativ not of one option opu opus-deep or out over over-stuf overwrit own paus plan planner post producer profil prototyp prototyper reason recip respons response-turn review review-turn reviewer rol room run s seat seat-rol send shar skip spec spik spike-and-decid step step-profil stuf summary summary-turn the ther to tru turn url v1 validat vib vibestrat with without writ yml you your",
      "body": "A custom Flow is written in YAML. Drop the file under `.vibestrate/flows/ /flow.yml` and Vibestrate finds it on its own. It checks the file against the schema when it loads, so a broken Flow fails loudly at the start instead of quietly partway through a run.\n\n## Steps\n\n```\n   id: spike-and-decide\n   version: 1\n   label: Spike and decide\n   description: Quick prototype with a built-in stop-and-check gate.\n\n   seats:\n     planner:\n       label: Planner\n       description: Plans the spike.\n     prototyper:\n       label: Prototyper\n       description: Builds the spike.\n\n   steps:\n     - id: plan\n       label: Plan the spike\n       kind: agent-turn\n       seat: planner\n       inputs: [task-brief]\n       outputs: [plan]\n\n     - id: prototype\n       label: Build the prototype\n       kind: agent-turn\n       seat: prototyper\n       inputs: [plan]\n       outputs: [diff]\n\n     - id: validate\n       label: Validate\n       kind: validation\n       inputs: [diff]\n       outputs: [validation]\n\n     - id: human-check\n       label: Stop and decide\n       kind: approval-gate\n       approval:\n         reason: Decide whether to keep the spike or rewrite from scratch.\n         requestedAction: continue\n```\n\n```\n   vibe flows list\n   vibe flows show spike-and-decide\n```\n\n```\n   vibe run \"Prototype the new search ranking\" --flow spike-and-decide\n```\n\n## Seats, not your models\n\n```\nvibe run \"...\" --flow spike-and-decide --step-profile prototype=opus-deep\n```\n\n## Optional steps\n\n```\nvibe run \"...\" --flow spike-and-decide --flow-skip plan\n```"
    },
    {
      "id": "docs/extending/add-provider",
      "kind": "doc",
      "title": "Add a provider",
      "source": "Vibestrate docs: extending/add-provider",
      "summary": "Tell Vibestrate how to run a local coding CLI it doesn't already know, or change the flags of one it does.",
      "titleTerms": "a add provider",
      "terms": "4 6 a add add-provider agent already and api apply arg assign can chang claud claude-cod claude-experiment claude-fast claude-sonnet-4-6 cli cod color command common confirm crew custom declar deeper default diff dir directory do doe doesn expect experiment extend fast fil flag going how id in input is it its json key know list loc mistak model my my-coding-cli my-model my-model-default no no-color of on one one-shot only or own p per per-provider permiss pick profil project prompt prompt-on-stdin provider put read read_only register report reviewer rol run seat send shot sonnet stdin t tak tell test the to touch typ usag verify vib vibestrat what with work worktre wrap yml",
      "body": "A **provider** is the local command-line tool that actually runs an AI model on your machine. Vibestrate's built-in detector already knows about these eleven: Claude Code, Codex, Gemini, OpenCode, Aider, Ollama, Qwen Code, Crush, Goose, Cursor, and Amp.\n\nIf you want to use a CLI it doesn't know about, or you want to change the flags it passes to one it does know, you declare your own under `providers:` in `project.yml`. Any local CLI works: if a command takes a prompt and returns a change, Vibestrate can drive it. There is no plugin to write and no SDK to learn - you point at the binary, say how the prompt gets in, and that is the whole contract. This guide walks through that, start to finish.\n\n## Declare a custom CLI provider\n\n```\nproviders:\n  my-model:\n    type: cli\n    command: my-coding-cli\n    args: [--prompt-on-stdin, --no-color]\n    input: stdin           # stdin | arg\n```\n\n## Assign the provider to a role\n\n```\nproviders:\n  my-model:\n    type: cli\n    command: my-coding-cli\n    args: [--prompt-on-stdin, --no-color]\n    input: stdin\n\nprofiles:\n  my-model-default: { provider: my-model }\n\ncrews:\n  default:\n    roles:\n      reviewer: { seats: [reviewer], profile: my-model-default, prompt: .vibestrate/roles/reviewer.json, permissions: read_only }\n```\n\n```\nvibe run \"...\" --profile my-model-default\n```\n\n## Verify it works\n\n```\nvibe provider list                 # confirms the provider is registered\nvibe provider test my-model        # sends a one-shot prompt\n```\n\n## Wrap Claude Code with custom flags\n\n```\nproviders:\n  claude-experimental:\n    type: claude-code\n    command: claude\n    args: [-p, --model, claude-sonnet-4-6]\n```"
    },
    {
      "id": "docs/extending/add-skill",
      "kind": "doc",
      "title": "Add a skill",
      "source": "Vibestrate docs: extending/add-skill",
      "summary": "Write a markdown file, save it under .vibestrate/skills/, and attach it to a role or run.",
      "titleTerms": "a add skill",
      "terms": "1 2 3 4 a about access add add-skill agent already an and anti anti-pattern apply arg at attach auth auth-convent be beat body bound bullet check claud command convent creat crew deeper default descript directory discover do env exampl explicitly extend fa field fil for form going good grant hav id in inspect is it json keep list mak mark markdown mcp md ment nam not of oncall oncall-runbook one only option or other pattern payment payment-rul permiss pg pg-mcp planner plu point postgr prefer profil project prompt query read read-only reason requir right rol rul run runbook s sav seat sentenc server sess short show skill specific src stat surfac that the thi thing titl to ts two under use vib vibestrat was way we what when writ x yml you",
      "body": "A skill is just a markdown file you write to teach your agents your project's conventions. There's no scaffold to run and no metadata form to fill in. You write the file, save it under `.vibestrate/skills/`, and Vibestrate's discovery picks it up on its own. There are two shapes: a flat file (this page's default) and a directory form for a skill that also needs an MCP server - see Pointing a skill at an MCP server below.\n\nHere are the steps, in order.\n\n## 2. Write the body\n\n```\n# Title - what this is about\n\n## When to use this\n\nOne or two sentences naming the surface this applies to.\n\n## Rules\n\n- Bullet list of conventions.\n- Be specific. \"We use X\" beats \"we prefer X\".\n\n## Examples\n\nShort examples of the right way to do the thing. Mark anti-patterns explicitly.\n```\n\n## 3. Check that it was discovered\n\n```\nvibe skills list\nvibe skills show <id>\n```\n\n## 4. Attach it\n\n```\ncrews:\n  default:\n    roles:\n      planner:\n        skills: [auth-conventions]\n        # ...plus the role's other required fields: seats, profile, prompt, permissions\n```\n\n```\nvibe run \"Add 2FA\" --skills auth-conventions\n```\n\n## Optional: pointing a skill at an MCP server\n\n```\n.vibestrate/skills/\n  postgres/\n    SKILL.md\n    .mcp.json\n```\n\n```\n---\nname: postgres\ndescription: Read-only Postgres access for query inspection.\n---\n\n# Postgres MCP\n\nThis skill grants agents read-only Postgres access for query inspection.\n```\n\n```\n{\n  \"mcpServers\": {\n    \"postgres\": {\n      \"command\": \"pg-mcp\",\n      \"args\": [\"--read-only\"]\n    }\n  }\n}\n```"
    },
    {
      "id": "docs/getting-started/big-picture",
      "kind": "doc",
      "title": "The big picture",
      "source": "Vibestrate docs: getting-started/big-picture",
      "summary": "Vibestrate is the frame your AI coding agents work in - one shared plan, rules the run enforces, and your call at the end. Task, Flow, and Crew, explained once.",
      "titleTerms": "big pictur the",
      "terms": "a actu add agent ai and any at behind big big-pictur builder call chair cod crew deeper don each end enforc explain flow fram get getting-start glanc going handler hav how in init is job label log of onc one pictur plan planner pricey profil provider reviewer rol routin rul run sav seat set shar start strong structur t task team the thi through to tool up vib vibestrat want work worker you your",
      "body": "Spend three minutes here before any commands. This is the one short read that makes everything click.\n\nVibestrate orchestrates the AI coding CLIs you already have. Hand it a job, it follows a set routine to get it done, and that routine is carried out by a team of AI workers you put together. Job, routine, team. The rest is just the real names for those three things.\n\nRunning several models on one job by hand is where the time goes: pasting the same context into a tool that has never seen the project, carrying the plan from one chat to the next, watching each one for drift. Vibestrate is the frame that work happens inside. Every worker on the job reads the same plan and the same project context, so nobody starts from zero and you never explain the project twice. Different models check each other along the way instead of one model rubber-stamping itself - see why a human stays in the loop.\n\nYou stay in control the whole way. The standards you set are rules the run enforces, not advice a model can talk itself out of. Each Task works in an isolated copy of your project, runs your checks, and stops at a clear outcome. It never pushes or merges for you - see the safety guarantees.\n\n## Task - the job you want done\n\nA **Task** is what you ask for, written in plain language, the way you'd brief a capable colleague:\n\n```\nvibe run \"Add structured logging to the settings save handler\"\n```"
    },
    {
      "id": "docs/getting-started/first-run",
      "kind": "doc",
      "title": "Your first run",
      "source": "Vibestrate docs: getting-started/first-run",
      "summary": "Give Vibestrate one small task and watch it go from idea to a finished, ready-to-merge change.",
      "titleTerms": "first run your",
      "terms": "a add adjectiv and anyth artifact at block bold bold-lovelac branch cd chang clean creat decis diff doesn don event fail finish first first-run flow for from get getting-start gh git giv go handler id idea it ll log look lovelac main md merg merge_ready ndjson never next noun one or output pick pr ready ready-to-merg review run sav scop see set small sourc start step step-id structur t task the to ui use verificat verify vib vibestrat vibestrate-worktre watch well well-scop what when worktre you",
      "body": "This walks you through a single task from start to finish: you describe what you want, Vibestrate does the work, and it stops with a finished change waiting for your approval.\n\n## Pick a small, well-scoped task\n\nVibestrate works best on the kind of task you'd hand a careful colleague: clear scope, a part of the code you can point to, and a way to tell when it's done. Don't open with \"refactor the whole login system.\" Start with something like \"add structured logging to the settings save handler.\"\n\n## Start the run\n\n```\nvibe run \"Add structured logging to the settings save handler\"\n```\n\nTo watch it work as it goes, add `--ui`:\n\n```\nvibe run \"Add structured logging to the settings save handler\" --ui\n```\n\nFrom here, Vibestrate does the rest on its own:\n\nLook Reads your project to learn its language, its tools, and how you run your tests. Copy Makes a separate working copy of your code (a git worktree), off to the side, under ../.vibestrate-worktrees/&lt;runId&gt;/. Build Plans the change, builds it, runs your tests, then reviews and verifies the result. Fix loop If the review finds a problem, it loops back, fixes it, and checks again. Stop Stops at one of three outcomes and leaves the call to you.\n\nThe run ends in one of three states:\n\nmerge_ready The change is ready for you. blocked It needs your call. failed Something went wrong.\n\n## What you'll see\n\n```\nRun bold-lovelace → merge_ready\n  worktree: ../.vibestrate-worktrees/bold-lovelace\n  branch:   vibestrate/bold-lovelace\n  artifacts: .vibestrate/runs/bold-lovelace/\n```\n\n## Look at what it changed\n\n```\ncd ../.vibestrate-worktrees/bold-lovelace\ngit diff main\n```"
    },
    {
      "id": "docs/getting-started/installation",
      "kind": "doc",
      "title": "Installation",
      "source": "Vibestrate docs: getting-started/installation",
      "summary": "Install Vibestrate and check your environment in two commands.",
      "titleTerms": "installat",
      "terms": "2 22 5 a add agent and artifact at attachment check cli cod coding-agent com command compos context creat crew curl doctor domain empty environment event every extra fil flow fs g get getting-start git gitignor got her hold in init initializ install installat instruct its js json least markdown md metric newer next nod npm on one onto option or per pnpm policy profil project provider read requirement rol rul run s sh skill sl start stat that turn two until vers vib vibestrat what yml you your",
      "body": "Vibestrate runs natively on macOS, Linux, and Windows. The full core loop works the same on every platform; the one Windows-only exception is the in-app terminal tab. See Native Windows support for the details.\n\n## Requirements\n\n- **Node.js 22 or newer.** Check with `node --version`. - **git 2.5 or newer.** Vibestrate creates and tears down worktrees, which need a modern git. - **pnpm or npm**, to install the package. - **At least one coding-agent CLI** on your PATH: Claude Code, Codex, Gemini, Aider, Ollama, OpenCode, or another supported provider. You can add one later. `vibe doctor` tells you what is missing.\n\n## Install\n\nOne line, macOS or Linux:\n\n```\ncurl -fsSL get.vibestrate.com | sh\n```\n\nOr with npm or pnpm, on any platform including Windows:\n\n```\nnpm install -g vibestrate\n# or\npnpm add -g vibestrate\n```\n\nPin a version through npm with `npm install -g vibestrate@ ` - `npm view vibestrate versions` lists what is published. Then check it:\n\n```\nvibe --version\n```\n\n## Initialize a project\n\nFrom the root of any git repository:\n\n```\nvibe init\n```\n\nThis creates a `.vibestrate/` directory with your project config, agent prompt templates, and the runs folder. It touches none of your existing files.\n\n```\nvibe doctor\n```\n\n## What got created\n\n```\n.vibestrate/\n  project.yml      providers, profiles, crews (roles), commands, policies\n  rules.md         project instructions agents read on every turn\n  rules/           optional extra instruction files, composed onto rules.md\n  roles/           one JSON role file per role, holding its instructions\n  skills/          markdown attachments that add domain context\n  flows/           your project's run Flows (empty until you add one)\n  runs/            run state, artifacts, metrics, events\n```"
    },
    {
      "id": "docs/getting-started/merging",
      "kind": "doc",
      "title": "Keep a change (Git and merging)",
      "source": "Vibestrate docs: getting-started/merging",
      "summary": "What Git is in one minute, and how to take a finished run from its safe copy into your real project.",
      "titleTerms": "a and chang git keep merg",
      "terms": "a advis advisor alway analyz and ask at best bold bold-lovelac branch cd chang checkout copy creat deterministic diff ff ff-only finish for from get getting-start gh git going how id in integrat into is it its keep locally look lovelac main manu merg merge_ready minut on one only open or pr project pull push ready real request review run saf shar sourc start tak the to vib vibestrat vibestrate-worktre what why worktre your",
      "body": "A run finishes at `merge_ready` with the change sitting on its own branch, in a separate copy of your project. This page is the last step: getting that change into your real code. New to Git? Start here. Otherwise, skip to taking the change.\n\n## Git in one minute\n\nVibestrate is built on **Git**, the standard tool for tracking versions of code. Three ideas are all you need.\n\n**A branch** is a parallel line of work. Your real code lives on a branch (usually `main`). A new change can grow on its own branch without disturbing `main`, until you decide to combine them.\n\n**A worktree** is a separate folder checked out to a branch. Vibestrate gives every run its own worktree under `../.vibestrate-worktrees/`, so the AI edits files there, never in your real project folder.\n\n**A merge** is folding one branch into another. Merging the run's branch into `main` is how a finished change actually becomes part of your project. It is the one step Vibestrate leaves entirely to you.\n\nSo a run never touches your files. It works in its own worktree, on a branch named `vibestrate/ ` (run ids are docker-style handles like `bold-lovelace`), and waits for you.\n\n## Look at what changed\n\nFrom the run's worktree, see every line it touched:\n\n```\ncd ../.vibestrate-worktrees/<runId>\ngit diff main\n```\n\nOr open the **Source** page in Mission Control, on its **Changes** tab, which shows the same diff file by file.\n\n## Ask the merge advisor\n\n```\nvibe integrate advise <runId>\n```\n\n## Take the change\n\n```\n# Open a pull request for review (best on a shared project)\ncd ../.vibestrate-worktrees/<runId>\ngh pr create\n\n# Or merge it into main locally\ngit checkout main\ngit merge --ff-only vibestrate/<runId>\n```"
    },
    {
      "id": "docs/getting-started/providers",
      "kind": "doc",
      "title": "Set up a provider",
      "source": "Vibestrate docs: getting-started/providers",
      "summary": "Tell Vibestrate which AI coding tools you have, then check each one can do the work.",
      "titleTerms": "a provider set up",
      "terms": "11434 4 4096 5 6 a ai alway and anthropic anthropic_api_key api bas can check choos claud claude-default claude-sonnet-4-6 cloud cod code_writ codex codex-default com crew deeper default detect did do doe each env executor get getting-start going hav http http-api id internet it json key liter liv loc localhost localhost-proxy machin max model nam never ollama on one only or over own permiss planner profil project prompt provider proxy qwen3 read read_only referenc reviewer rol run seat see server set setup sonnet start tell test the then they token tool typ up url vib vibestrat what wher which work writ yml you your",
      "body": "A *provider* is the AI tool that actually does the work. It can be a coding assistant already installed on your machine - Claude Code, Codex, Gemini, Aider, Ollama, OpenCode, and others - or a model Vibestrate reaches over the internet. Setting one up is two steps: tell Vibestrate it's there, then confirm it answers.\n\n## See what you have\n\n```\nvibe provider detect\n```\n\nThis checks each tool Vibestrate knows about and reports where it stands in one of three states:\n\n## Set it up and test it\n\n```\nvibe provider setup\n```\n\n```\nvibe provider test claude\nvibe provider test ollama\n```\n\n## Choose which one does the work\n\n```\nvibe provider set claude\n```\n\n```\nvibe run \"...\" --profile codex-default\n```\n\n```\nprofiles:\n  claude-default: { provider: claude }\n  codex-default:  { provider: codex }\n\ncrews:\n  default:\n    roles:\n      planner:  { seats: [planner],  profile: claude-default, prompt: .vibestrate/roles/planner.json,  permissions: read_only }\n      executor: { seats: [executor], profile: codex-default,  prompt: .vibestrate/roles/executor.json, permissions: code_write }\n      reviewer: { seats: [reviewer], profile: claude-default, prompt: .vibestrate/roles/reviewer.json, permissions: read_only }\n```\n\n## Models over the internet or on your own machine\n\n```\nproviders:\n  cloud:\n    type: http-api\n    api: anthropic\n    baseUrl: https://api.anthropic.com\n    model: claude-sonnet-4-6\n    apiKey: env:ANTHROPIC_API_KEY   # env reference only - never a literal key\n    maxTokens: 4096\n  local:\n    type: localhost-proxy\n    api: ollama\n    baseUrl: http://localhost:11434\n    model: qwen3.5\n    maxTokens: 4096\n```"
    },
    {
      "id": "docs/getting-started/skills",
      "kind": "doc",
      "title": "Attach skills",
      "source": "Vibestrate docs: getting-started/skills",
      "summary": "A short note you hand an agent so it knows your codebase's rules before it starts.",
      "titleTerms": "attach skill",
      "terms": "2 a add agent an and are auth auth-convent befor chang claud codebas convent cooky creat crew deeper default don enrollment error error-handl executor fa for from get getting-start go going hand handl http id inlin is it know lax list lucia md middlewar new not one only planner project requir review rol rout rul run s sam security security-review server sess short show sit skill skip so src start t thi thos to touch ts under use vib vibestrat when worth writ yml you your",
      "body": "A **skill** is a short note, written in plain markdown, that gets added to an agent's instructions before it starts work. It's how you teach an agent something about your project: how login works, the conventions you actually follow, the right way to handle a certain kind of change.\n\nThink of it as the briefing you'd give a new contractor on their first day. Instead of repeating \"we do it this way here\" every single time, you write it down once and hand it over.\n\n## Write one\n\nA skill is just a markdown file. Drop it in one of two folders:\n\n- `.vibestrate/skills/` - travels with your project, so anyone who clones the repo gets it too. Use this one by default. - `.claude/skills/` - picked up automatically if you already use Claude Code's skills locally.\n\nThe file name (without the `.md`) becomes the skill's name, so `auth-conventions.md` is the skill `auth-conventions`. Inside, just write plain prose. Agents read it the same way a person would:\n\n```\n# .vibestrate/skills/auth-conventions.md\n\nThis codebase uses Lucia for sessions. When touching auth:\n\n- Don't create session middleware inline - use `requireSession` from `src/server/auth.ts`.\n- Cookies are HttpOnly and SameSite=lax. Don't change those defaults.\n- New auth routes go under `src/server/routes/auth/`.\n```\n\n## Hand it to an agent\n\nName the skills you want in `project.yml`, per role. Roles live under `crews. .roles`, not a top-level `agents:` key:\n\n```\ncrews:\n  default:\n    roles:\n      planner:\n        skills: [auth-conventions, error-handling]\n      executor:\n        skills: [auth-conventions]\n```\n\n```\nvibe run \"Add 2FA enrollment\" --skills auth-conventions,security-review\n```\n\n```\nvibe skills list\nvibe skills show auth-conventions\n```"
    },
    {
      "id": "docs/getting-started/welcome",
      "kind": "doc",
      "title": "The guided walkthrough",
      "source": "Vibestrate docs: getting-started/welcome",
      "summary": "A resumable, skippable tour through providers, crew, flows, and your first run.",
      "titleTerms": "guid the walkthrough",
      "terms": "a and crew first flow from get getting-start go her if init initializ it json left not off project provider re remember reset resumabl run setup skippabl start stat through to tour vib vibestrat walk welcom welcome-stat what wher yet yml you your",
      "body": "If you'd rather be walked through the basics than read about them, run:\n\n```\nvibe welcome\n```\n\nIt's a guided tour through the same setup you'd otherwise do by hand: pick a provider, pick a crew, get a feel for flows, then see how to start your first run. Nothing here does anything new - it's a thin sequencer over `vibe provider setup`, crew presets, and the same commands documented elsewhere in these pages. Read the concept pages if you want the full picture; `vibe welcome` is the fast, guided version.\n\n## What it walks through\n\n- **Providers** - pick the AI model behind the work; reuses `vibe provider setup`. - **Crew** - optionally install a ready-made crew (fast or thorough), or skip and configure your own later. - **Flows** - see the flow Vibestrate runs by default, and how to browse more from the flows hub. - **Your first run** - a worked example of `vibe run \"...\"` to try next.\n\nEach step opens with a short explanation, then asks: continue, skip, or quit. Nothing is forced - skip anything you already know.\n\n## It remembers where you left off\n\nQuit partway through and `vibe welcome` picks up at the first step you haven't finished next time. Progress is saved to `.vibestrate/welcome-state.json` - a small, disposable file that only tracks which steps you've been through. Deleting it, or running `--reset`, never touches your actual provider, crew, or flow configuration - those changes (if you made any while walking through providers or crew) live in `project.yml` as usual, and stay put.\n\nTo start over from the beginning:\n\n```\nvibe welcome --reset\n```"
    },
    {
      "id": "docs/getting-started/why-a-human",
      "kind": "doc",
      "title": "Why a human stays in the loop",
      "source": "Vibestrate docs: getting-started/why-a-human",
      "summary": "AI is fast, but it guesses and it agrees with you. Vibestrate proves the work before a person makes the final call.",
      "titleTerms": "a human in loop stay the why",
      "terms": "a agre ai and at befor but call fast fin get getting-start glanc going guess honest human is it keep mak merg merge_ready person problem prov ready start the vibestrat why why-a-human with work you",
      "body": "AI can write code you could not write yourself - a security fix, a piece of WebGL you have never touched, a database migration. The catch: the same AI also makes things up, and it tends to agree with whatever you said. Trusting it blind is how bad code ships.\n\n**The honest problem.** An AI model is a confident guesser. It will invent a function that does not exist, miss an edge case, or hide a bug instead of fixing it, then tell you it is done - because agreeing is what a chat assistant is built to do. None of that is malice. It is just what a model is.\n\nVibestrate is built to catch that instead of trusting it. Every run plans, builds, then a different model reviews and verifies the change with fresh eyes - a model reviewing its own work can only lower confidence, a second model can catch what the first missed. It also runs your real tests and validation commands against the result, so \"it looks done\" is not enough. And it never gets ahead of you: a run works in a throwaway copy of your project and stops at `merge_ready` instead of pushing or merging on your behalf - see the safety guarantees. You read the diff, or let the merge advisor flag the risks, and you decide.\n\nYou do not need to know the security rule, the WebGL API, or the migration gotcha yourself - the AI brings that. What Vibestrate gives you is a way to trust the result without auditing every line: work done across models that see the problem differently, proven against your checks, handed back with the evidence and the decision. If you want to ask about a run instead of reading it cold, Consult is an advisor that knows your project, answers from evidence, and never touches your code."
    },
    {
      "id": "docs/getting-started/windows",
      "kind": "doc",
      "title": "Native Windows support",
      "source": "Vibestrate docs: getting-started/windows",
      "summary": "Vibestrate runs the full core loop natively on Windows - install, providers, runs, diffs, and merge - with PowerShell or cmd and no WSL. The one exception is the in-app terminal tab.",
      "titleTerms": "nativ support window",
      "terms": "after and app carv carve-out claud cmd cor diff docker doctor except full g get getting-start her in in-app init inst install is isolat loop merg natively next no not npm on one or out power provider ps1 recogniz right run shell start tab termin the vers vib vibestrat window with wsl",
      "body": "Vibestrate runs natively on Windows. The full core loop works on a plain Windows machine in PowerShell or cmd: you install the CLI, configure providers, run agent orchestrations, review diffs, and merge - all without WSL.\n\n```\nnpm install -g vibestrate\nvibe --version\n```\n\nFrom there the workflow is identical to every other platform. Run `vibe init` in a git repository, then `vibe doctor` to check your environment, then `vibe run` to start a task. The Installation and Your first run pages apply as written.\n\n## Providers on Windows\n\nClaude Code, Codex, and Gemini all run natively on Windows once their CLIs are installed with npm. Vibestrate runs their provider commands the same way it does on macOS and Linux.\n\nThe longer list of providers varies tool by tool - some are still POSIX-only. `vibe doctor` flags any provider it cannot find or run, so you always know where each one stands rather than discovering it mid-run.\n\n**\"`claude` is not recognized\" right after installing?** This is almost always Windows, not Vibestrate. Either the new npm global bin directory is not on your PATH yet (open a fresh terminal so the updated PATH loads), or PowerShell's execution policy is blocking the `.cmd`/`.ps1` shim. Fix the PATH or execution policy, confirm the provider runs on its own (for example `claude --version`), then run `vibe doctor` again."
    },
    {
      "id": "docs/glossary",
      "kind": "doc",
      "title": "Glossary",
      "source": "Vibestrate docs: glossary",
      "summary": "Plain-language definitions for the words you'll meet across these docs.",
      "titleTerms": "glossary",
      "terms": "1 2 3 a abort across act add advisory all api apply approv approval-gat archiv artifact assert assist at block board branch broker by checklist claud cli clos cloud coars cod code_writ column command complet context context-fil context-url continuou control creat crew dedicat default defin definit deny dir doc don effort endpoint enhanc every execut export fail fil flow for gat git glossary health high http http-api human human_review id implementer in in-progress in_progress init instruct integrat into item json kind label languag list ll loc localhost localhost-proxy low machin main md medium meet merg merge_ready miss model navigator ndjson need only open operat orchestrator overview patch pend permiss phas pick pick-up pickup plain plain-languag plan policy preview profil progress project propo propos provider proxy read read-only read_only ready remov replay requir require_approv return review roadmap rol root rout rul run seat segment sequentially server skill sourc stag stat statu step step-by-step task telemetry termin test the thes trac transit ui up url validat vib vibestrat word workflow workspac worktre writ yml you",
      "body": "Short, plain definitions for the words Vibestrate's docs use.\n\n**Action Broker.** The one checkpoint every real effect has to pass through, whether that's starting a provider, running a command, or writing a file. For each effect it decides allow, deny, or ask a human first, then writes down what it decided and why in `.vibestrate/runs/ /actions.ndjson`. This is where **Policy** actually gets enforced in the running code. It is default-allow with a policy veto - an effect nobody wrote a rule about proceeds - so it's where you impose limits, not a whitelist you have to satisfy. See Safety.\n\n**Crew.** Your local team of Roles. A run picks one Crew (default: `defaultCrew`) and matches the Flow's Seats to the Roles in it. See Crew.\n\n**Role.** One teammate inside a Crew. It carries instructions (a prompt), permissions, skills, the Profile it runs on, and the Seats it's allowed to fill. See Role.\n\n**Seat.** A spot a Flow step needs someone in (for example `implementer`). It's a request the Crew answers with a Role whose `seats` list includes that seat. See Seat.\n\n**Profile.** How strong and how expensive a Role runs: its provider, model, power, and timeout. Power is specific to each provider. See Profile.\n\n**Approval gate.** A spot in a workflow or Flow where Vibestrate stops and waits for a person to say yes before going on. You set it with `policies.requireApprovalAtStages`, or with a step of `kind: approval-gate` inside a Flow.\n\n**Context source.** A file or URL you hand to a run or task so its contents get pasted into **every** agent's prompt (`vibe run --context-file/--context-url`, or a task's context panel). Files are checked first so secret files are refused and secret-looking text is hidden; URLs are fetched safely, size-capped, and cleaned before any prompt sees\n…"
    },
    {
      "id": "docs/index",
      "kind": "doc",
      "title": "Vibestrate docs",
      "source": "Vibestrate docs: index",
      "summary": "Vibestrate is where your AI coding agents work together - one shared plan, one set of rules, one record. It runs the CLIs you already have and leaves the final call to you.",
      "titleTerms": "doc vibestrat",
      "terms": "a add add-skill advisor agent ai already an and ask audit call can chatbot cli cod concept control crew detail different doc extend fin flow fully hav her id in index is it leav log look machin mak many model not of on one own plan point record referenc rul run sentenc set shar skill start stay supervisor task the to together understand up vib vibestrat what wher work you your",
      "body": "You already have the models. What you don't have is somewhere to run them as a team - one plan, one set of rules, and a place to hand work between them, so you stop carrying context from tool to tool by hand.\n\nHand Vibestrate a task, including one you could not write yourself: a security fix, a piece of WebGL you have never touched. It breaks the work down, runs it across several models, and supervises the whole thing.\n\nAI can write that code. It also gets things wrong, and it tends to agree with whatever you said last. That is why the final call stays yours - see why a human stays in the loop.\n\n## The crew is the point\n\nVibestrate's real edge is running several AIs, of different models, on one task. One plans. Another builds. A different one reviews the change cold. Each model reads the problem from its own angle, and the disagreement between them is a feature, not a bug. Together they produce something better than any single model working alone.\n\nYou choose who does what, or let Vibestrate pick a sensible crew for you.\n\n## You stay in control\n\nIt never gets ahead of you. Every task runs in a separate, throwaway copy of your project, so your real files are never touched. Your checks run. Every prompt, output, and decision is recorded. Then it stops at one of three outcomes and leaves the call to you:\n\nmerge_ready The change is ready for you to keep. blocked It needs a decision from you. failed Something went wrong mid-run.\n\nIt never pushes your code and never merges for you - see the safety guarantees.\n\n## Run one in a sentence\n\n```\nvibe run \"Add audit logging to the settings flow\"\n```"
    },
    {
      "id": "docs/task-lifecycle",
      "kind": "doc",
      "title": "Task lifecycle",
      "source": "Vibestrate docs: task-lifecycle",
      "summary": "How a task moves through statuses, with the fix loop and the approval gates.",
      "titleTerms": "lifecycl task",
      "terms": "a abort and approv architect architectur ask at block budget can chang changes_request com creat decid deeper each event execut fail find finding-respon fix for gat going happy has hold how id it json jsonl lifecycl log loop max md merg merge_ready mov need path paus plan policy re re-run ready request requir respon rest resum review reviewer run see stag statu task task-lifecycl the through to until validat verificat verify vib vibestrat wait waiting_for_approv when wher with workflow writ you your yourself",
      "body": "Every task moves through a fixed sequence of statuses, and Vibestrate won't let it skip a step or jump backward. Think of it like a package working through delivery: it goes through sorted, in transit, and out for delivery in order, and each scan tells you exactly where it is right now.\n\n## The happy path\n\nWhen nothing goes wrong, a task walks through every status once and finishes ready to merge.\n\nThe full status sequence, in order:\n\n```\ncreated → planning → planned → architecting → architected\n       → executing → validating → reviewing → verifying → merge_ready\n```\n\nA successful run touches every non-terminal status once, lands in `merge_ready`, and leaves a diff on the worktree branch.\n\n## When the reviewer asks for changes\n\nThe review step can send work back. When it does, the task loops through a fix-and-recheck cycle instead of moving on.\n\n```\nreviewing → fixing → validating → reviewing → verifying → merge_ready\n```\n\n**The fix loop has a budget.** The reviewer can return `CHANGES_REQUESTED`, sending the run back into `fixing`. The fixer addresses the findings, validation re-runs, and the reviewer re-evaluates. Each round counts against the flow's loop budget (3 in the built-in flows); an optional `workflow.maxReviewLoops` global ceiling can lower it. Past the budget, the run goes to `blocked`.\n\n## When a stage needs your approval\n\nSome stages can be set to wait for you before they start. The task pauses at the gate and holds until you decide.\n\n```\n... → executing → waiting_for_approval → executing → ...\n```\n\n## When you pause it yourself\n\n```\n... → executing → paused → executing → ...\n```"
    },
    {
      "id": "docs/troubleshooting",
      "kind": "doc",
      "title": "Troubleshooting",
      "source": "Vibestrate docs: troubleshooting",
      "summary": "Concrete fixes for the issues people actually hit.",
      "titleTerms": "troubleshoot",
      "terms": "a abort actually add after again ai aider aider-install an and anthropic anthropic-ai approv arriv artifact at authenticat away bashrc befor behind bin blank block branch but cd chang claud claude-cod clean cli cod codex com command commit concret config configur confirm creat curl cwd d dashboard detect detected-needs-setup didn doctor fail fals fix flag flow for found fs g gateway gemini gemini-cli get git googl guidanc has hit http id in init initi insid inst install is is-inside-work-tre issu left list login m main md miss need never next no not notificat npm ollama onc openai operat or output pars pass path paus peopl pip pnpm policy prefix project provider push python ready real reject remov repository request request-chang requir resum rev rev-pars right run say set setup sh sign sl stag stall start stash statu step step-id stuck t tab test that the then to tre troubleshoot tru typecheck ui uncommit unexpect up validat vers vib vibestrat vibestrate-worktre wait waiting_for_approv walk which with wizard won work worktre yml your your-project zshrc",
      "body": "When something goes wrong, find the symptom that matches yours below, then run the fix. Each entry tells you what you'll see, what's usually behind it, the command that fixes it, and how to check it worked.\n\n**Start with `vibe doctor`.** Before you dig through the list, run it once. It checks your install, your providers, and your config in one pass, and most of the fixes below begin from what it reports.\n\n### `vibe: command not found` right after installing\n\n```\nnpm config get prefix\n# Add <prefix>/bin to your PATH in ~/.zshrc or ~/.bashrc\n```\n\n### `vibe init` says \"not a git repository\"\n\n```\ngit init\ngit add -A && git commit -m \"Initial commit\"\nvibe init\n```\n\n### `vibe doctor` says \"no providers ready\"\n\n```\n# Claude Code: npm install -g @anthropic-ai/claude-code, then run `claude` once to sign in\n# Codex:       npm install -g @openai/codex, then run `codex login`\n# Gemini:      npm install -g @google/gemini-cli, then run `gemini` once to authenticate\n# Aider:       python -m pip install aider-install && aider-install\n# Ollama:      curl -fsSL https://ollama.com/install.sh | sh\n```\n\n```\nvibe provider detect\nvibe provider setup\nvibe provider test <id>\n```"
    },
    {
      "id": "docs/workflows/create-and-run",
      "kind": "doc",
      "title": "Create and run a task",
      "source": "Vibestrate docs: workflows/create-and-run",
      "summary": "Go from a thing you need done to a finished change you can merge.",
      "titleTerms": "a and creat run task",
      "terms": "1 2 3 4 40 5 a abort add advis advisor also analyz and arbitrat audit away behind branch by can cd chang checkout claud claude-sonnet-deep commit config creat create-and-run deep deeper don fals ff ff-only fil finish flow for fram from full gh git go handler human id if inspect inspector integrat is it json just land lib log logger main merg need only or path pr preserv profil protect push quality quality-arbitrat re read read-only relat remov replay result review rout run sav server set shar sonnet sourc src start statu suggest task the thing to touch tru ts ui vib vibestrat vibestrate-worktre walk want watch what when workflow worktre you yourself",
      "body": "This guide takes you from \"I have a thing to do\" all the way to a change you can merge, step by step.\n\n## 1. Frame the task\n\nWrite the task description the way you'd brief a careful colleague. Name the file, name the convention, name the constraint. The more exact you are, the better the result.\n\nA good brief:\n\n> Add audit logging to the settings save handler at `src/server/routes/settings.ts`. Use the existing `auditLogger` from `src/lib/audit.ts`. Log the user id and the *keys* changed - never the values.\n\nA weak one:\n\n> Improve settings logging.\n\n## 2. Start the run\n\nKick off the task with one command:\n\n```\nvibe run \"Add audit logging to the settings save handler...\"\n```\n\nWant the dashboard open alongside the terminal? Add `--ui`:\n\n```\nvibe run \"...\" --ui\n```\n\nNeed more rigor than the default Flow? Pick a heavier one:\n\n```\nvibe run \"...\" --flow quality-arbitration\n```\n\nOverride which Profile (and so which provider) runs the work for just this run:\n\n```\nvibe run \"...\" --profile claude-sonnet-deep\n```\n\n## 4. Inspect the result\n\n```\nvibe status                  # what landed\nvibe replay <runId>          # full read-only inspector\n```\n\n## 5. Merge it yourself\n\n```\nvibe integrate advise <runId>\n```\n\n```\nvibe config set merge.advisor.suggestIntegrationBranchWhen.filesTouched 40\n# also: .protectedPaths (true/false), .behindMain <commits>\n```\n\n```\ncd ../.vibestrate-worktrees/<runId>\ngh pr create                  # if you want review by a human\ngit push                       # if you just want to share the branch\n```\n\n```\ngit checkout main\ngit merge --ff-only vibestrate/<runId>\n```\n\n```\nvibe abort <runId>\n# worktree is preserved for inspection; remove when you're done\n```"
    },
    {
      "id": "docs/workflows/debug-failed",
      "kind": "doc",
      "title": "Debug a failed run",
      "source": "Vibestrate docs: workflows/debug-failed",
      "summary": "How to figure out why a run ended in failed or blocked, and what to do next.",
      "titleTerms": "a debug fail run",
      "terms": "20 a after and api architect architectur artifact authenticat block bug chang clean cod command creat debug debug-fail decis delet diff directory do doesn drop dry dry-run earlier end event every everyth execut exist fail figur fil first fix flow for from get git gon housekeep how id if implement implementat in instead is it json just keep list main md miss most most-recent ndjson new next not noth of old one onward or orphan out output per per-phas permiss phas plan post preview project provider prun re re-run recent redo ref referenc relat replay requir rest restart restor restore-preview resum resume-from resume-stag retent reus review rewind rul run s sam scop scratch seed sharpen skill snapshot sourc stag start stat statu step step-id t task teach test the tighten to tru unsaf validat verificat verify vib vibestrat what when whos why with without workflow worktre y yml",
      "body": "When a task doesn't finish cleanly, this guide helps you find out why and decide what to do about it.\n\nA run can stop short for two different reasons. They feel similar, but they call for different responses: `failed` is a crash, `blocked` is a decision. One needs a fix; the other needs a call from you.\n\n## Start with `replay`\n\nOpen the read-only inspector for the run:\n\n```\nvibe replay <runId>\n```\n\nRead-only means you can look but not change anything. The status line tells you which stage threw the error, and the artifact list shows you what the run already recorded before it stopped.\n\n## Re-run after fixing\n\n```\ndiff .vibestrate/runs/<oldRunId>/artifacts/flows/plan/output.md \\\n     .vibestrate/runs/<newRunId>/artifacts/flows/plan/output.md\n```\n\n## Rewind instead of restarting\n\n```\n# Reuse the plan + architecture, redo the implementation onward:\nvibe run \"<same task>\" --resume-from <oldRunId> --resume-stage executing\n\n# Reuse just the plan, redo from architecture onward:\nvibe run \"<same task>\" --resume-from <oldRunId> --resume-stage architecting\n\n# Re-run everything from scratch (seeds nothing):\nvibe run \"<same task>\" --resume-from <oldRunId> --resume-stage planning\n```\n\n### Rewinding to review, fix, or verify (restores the run's code)\n\n```\nvibe run \"<same task>\" --resume-from <oldRunId> --resume-stage reviewing --preview\n```\n\n### Housekeeping: pruning snapshots\n\n```\nvibe runs prune                 # drop snapshots for runs whose directory is gone (orphans)\nvibe runs prune --keep 20       # keep the 20 most-recent runs, prune the rest\nvibe runs prune --run <id>      # drop one run's snapshots\nvibe runs prune --orphans --dry-run   # preview without deleting\n```"
    },
    {
      "id": "docs/workflows/git-tree-merge",
      "kind": "doc",
      "title": "Merge from the git tree",
      "source": "Vibestrate docs: workflows/git-tree-merge",
      "summary": "Explore your branches as a graph, predict a merge before you apply it, let the supervisor resolve conflicts, and undo with one click.",
      "titleTerms": "from git merg the tre",
      "terms": "a add already and api apply as ask befor branch chang clean click commit conflict dat do doe down env every explor ff fil git git-tree-merg graph guid head her history if inspect integrat it last let main merg mind mov never no no-ff not of one open or path predict propos push redact remov resolv see shap sourc supervisor target the to token tre undo up vib vibestrat vibestrate_api_token what whol with workflow you your",
      "body": "When you want to fold one branch into another - a finished run's branch into `main`, or two pieces of work together - the **Git tree** turns it into something you can see and reverse. It is the interactive, any-node-to-any-node evolution of the merge advisor: the same safety model, but you drive it from a graph instead of a list.\n\nOpen it from the **Source** page's **Tree** tab. Nothing on this page touches a real branch until you click Apply.\n\n## See the shape of your history\n\nThe left panel is the commit graph: a lane rail next to rich commit rows - each row carries the subject, the diff size (`+added -removed`), the author, and the short hash. Branch tips render as labelled ring nodes so a tip never looks like a plain commit, and `main` is the violet spine. On a large repository the graph is bounded to the most recent commits.\n\nClick a commit and the graph tells its story: the commit's history stays lit, everything unrelated dims, and if the commit reached `main` through a merge, the merge commit is marked **merged here**.\n\n## See every branch\n\nSwitch the left panel to **Branches** for a flat list of every local branch - the view that works even when history is linear and the graph collapses to one rail. Each row shows the branch's standing against `main`: how far ahead and behind (`up`/`down`), its own diff size (`+added -removed`), whether it is already merged or still open, and its latest commit. A one-line ledger up top counts open vs merged. Click a branch to focus its tip in the graph and stage it as the merge planner's source."
    },
    {
      "id": "docs/workflows/inspect-progress",
      "kind": "doc",
      "title": "Inspect a run in flight",
      "source": "Vibestrate docs: workflows/inspect-progress",
      "summary": "Where to watch a run as it happens, and where every detail is saved.",
      "titleTerms": "a flight in inspect run",
      "terms": "a act and append append-only artifact as bold bold-lovelac broker c cat chang cod command cost current dashboard detail disk durat each event every execut exit fil flow for happen id if inspect inspect-progress is it its jq json liv lovelac main md metric n ndjson of on only output participant past per per-command profil progress prompt provider read relat replay report resolv respons result rol run runtim runtime-metric s sav seat select sent snapshot sourc stat statu stderr stdout step step-id termin that the thi timelin to token transit truth txt typ ui validat validation-result verdict vib vibestrat watch wher which workflow writ",
      "body": "When Vibestrate is doing work for you, you can watch it as it goes. There are three places to look: the terminal for a quick glance while it runs, the dashboard for the full live picture, and the files on disk for the complete record you can read back at any time.\n\n## The terminal\n\nIf you start a run with the plain `vibe run` command, the terminal prints a header for each stage. The header shows the current status, the name of the agent doing the work, and any output it captured. When the checks run (the \"validation\" step that runs commands to confirm the work holds up), the output of those commands streams straight to your screen.\n\n## The files on disk\n\n```\n.vibestrate/runs/bold-lovelace/\n  state.json                       current status, transitions\n  events.ndjson                    every event, append-only\n  actions.ndjson                   every brokered action (writes, commands) + its verdict\n  runtime-metrics.json             tokens, durations, costs (where reported)\n  flow.json                        the resolved flow snapshot for this run\n  participants.json                which role/profile filled each seat\n  artifacts/\n    flows/\n      <step-id>/\n        prompt.md                  the prompt sent to the provider for that step\n        output.md                  the provider's response\n        validation-results.json    commands run + exit codes, if the step validates\n        validation/\n          <n>-<command>.stdout.txt per-command stdout\n          <n>-<command>.stderr.txt per-command stderr\n```\n\n```\ncat .vibestrate/runs/bold-lovelace/events.ndjson | jq -c 'select(.type == \"state.changed\")'\n```\n\n## Read past runs\n\n```\nvibe replay <runId>\n```"
    },
    {
      "id": "docs/workflows/pause-resume",
      "kind": "doc",
      "title": "Pause, resume, abort",
      "source": "Vibestrate docs: workflows/pause-resume",
      "summary": "How to safely stop a run, bring it back later, or end it for good.",
      "titleTerms": "abort paus resum",
      "terms": "a abort approv are at back befor block branch bring cancel cd chang d different end fir for gat git good guidanc how human human_approv id it later let list max next or pau paus pause-resum policy policy-gat project reject remov request request-chang requir resum round run safely stag statu stop to vib vibestrat vibestrate-worktre vs wait waiting_for_approv what when workflow worktre your your-project",
      "body": "Sometimes you want to stop a run, look at where it got to, and pick it back up later. Pausing does exactly that, and it sticks. The run state is saved to disk, so even if you kill Vibestrate's process and start it again, the pause is still there waiting for you.\n\nThere are three things you can do to a running run: pause it, resume it, or abort it.\n\n## Pause\n\nTo pause a run, give Vibestrate the run's ID:\n\n```\nvibe pause <runId>\n```\n\nVibestrate works in stages, and it checks for a pause flag between them. When it spots one, it moves the run to the `paused` state and writes down which stage it was about to start. Nothing gets cut off halfway. A pause always lands cleanly at the gap between two stages.\n\n## Resume\n\nTo pick the run back up:\n\n```\nvibe resume <runId>\n```\n\nThis clears the pause flag. Vibestrate starts the run again from the stage it had written down in `pausedAtStatus`, which is the spot where it stopped.\n\n## Cancel a pause request before it fires\n\nSay you ran `vibe pause` and then changed your mind before the run reached the next gap between stages. Running `vibe resume` cancels the pending pause. The run keeps going and never enters the `paused` state at all.\n\n## Abort\n\nTo end a run for good:\n\n```\nvibe abort <runId>\n```\n\n```\ncd your-project\ngit worktree remove ../.vibestrate-worktrees/<runId>\ngit branch -D vibestrate/<runId>\n```\n\n## Policy-gated pauses are different\n\n```\nvibe approvals list <runId>\nvibe approvals approve <runId> <approvalId>\nvibe approvals reject <runId> <approvalId>\nvibe approvals request-changes <runId> <approvalId> --guidance \"what to change\"\n```"
    }
  ]
};

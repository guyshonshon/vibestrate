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
  "lexicon": "12 24 40 40-58 512 58 abort acceptanc access act activity adaptiv add-flow add-provider add-skill advanc advi advisor agent aider allow allowlist already alway amp analysi analyz analyze-risk analyze-test anchor annotat answer anti anti-pattern anyth anywher api apply apply-only approv arbiter arbitrat architect architectur archiv arg array artifact ask assign assist assum assuranc attach attachment attend audit auth authenticat author authz auto auto-retri autonomy backend backoff banner bas becom behavior behind best-effort big big-pictur block blocker board bound boundary branch brand brief broader broker budget builder built built-in bundl button c0 cannot canva cap cap-and-continu capability car catalog cau caveat ceil challeng challenge-respons challenger chatbot cheap checklist claud claude-cod clean cli clo clock cloud cmd co code_writ codeba codebas codex coding-agent command commit complet concept concurrency concurrent conductor confidenc config configurabl configurat confinement confirm conflict constraint consult container context continu continuou contract control control-character conversat correctness cost create-and-run creator credenti crew cross crush csrf ctrl ctrl-k curat cursor customiz daemon daily dashboard debug-fail decid decis decision-summary dedicat deep deeper default-allow definit delay deliberately deni deny destinat detach detail deterministic diff differ directory-map disposabl doc docker doctor documentat doesn dollar downgrad downgrade-model draft drop dry dry-run earlier early editor effect effort egress email enabl end enforc enforcement enhanc enter env environment ephemer esc escalat estimat event everyth execut executor exhaust exist exit expect explicit export express extend extern fail-clo fallback fast featur fell fetch field fifty fil filesystem fill fin first first-run fixer flag flight flow forbid form fresh fully gap gap-fill gat gateway gemini generat getting-start git git-tree-merg glanc glob glossary good goos got guard guid halt hand handoff hard harden head headless heavier held hero high hint hold hom honest horizont http http-api hub human id ids imag implement implementat implementation-review implementer in-progress index info informat inherit init initializ inject input insid inspect inspect-progress inspector inst installat instead instruct intak integrat interactiv invariant isn isolat item itself json judgment key kind label last leak learn least leav ledger legibility len library lifecycl limit link liter liv loader loc localhost localhost-proxy log look loop loopback loudly machin main map markdown matcher materi matter max mcp md ment merg merge_ready messag methodology metric micro micro-plan min minimalism mod model mov ms narrow nativ navigator ndjson network never newer next non non-cli non-loopback noth notificat nul objectiv ollama onc opencod operat opt-in orb orchestrator os outcom outsid over-stuf overview overwrit owner owner-only packet panel panel-review param parameter parent parity pass past patch path pattern pau paus pause-resum pct per per-pha per-provider permiss persona pha pick pick-up pickup pickup-analysi pickup-review pictur pid pin plain plan plan-only plan-review planner plausibl plausible-but-wrong plu point policy policy-gat ponytail post post-turn postur pre pre-publish predict prefix preserv preset preset-ready press preview proc profil progress project project-param prompt propo protect prov provider provider-auth provider-nativ proxy prun publish push quality quality-arbitrat quest queu quot quota qwen rang rat rate-limit rather re re-run re-sequenc re-validat reach read-only read-writ read_only readonly ready real reason recogniz recommendat record red redact reduc reduce-effort referenc refin refu register remot renam reorder repeat replac replay report repository request requir resilienc resolv respect respons restor resum retent retri retry reu reus revalidat reversibl review review-authz review-correctness review-inject review-item review-risk review-secret review-security-risk review-test reviewer rewind right risk risky roadmap rol root round rout routin rul run runtim safety saga sandbox scaffold scan scheduler schema scop scor seat second-review secret secret-scan security security-review seed selector sequenc sequentially servic sess setup sharpen shell shift sign sign-off simplify skill skip snapshot soft someth sourc sovereignty spawn spec spec-up spec-up-intak spec-up-review spec-up-roadmap spend src sse ssrf stabl stag standard stat statu stay step step-by-step step-profil strict stuf subcommand subscript suggest summary supers supervi supervis supervised-task supervisor supervisor-control surfac switcher synthesiz tab target task task-lifecycl teach telemetry termin test think thorough threshold tier tighten timelin timeout token touch tour transient tre troubleshoot ts turn twic ui unattend unavailabl understand undo uneven unprotect unsaf unsandbox until unver upload usag usd user-request using validat var ver verbatim verdict verifier verify veto via vib vibestrat vibestrate-md vibestrate_param visibl vs wait waiting_for_approv walk walkthrough wall warn weak week welcom whol why-a-human wider window without workflow workspac worktr worktre yaml yellow yml zero zero-egress",
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
      "terms": "a act action-broker adapter advisor agent and api apply architectur assignment assist author background behind broker build builtin builtin-flow bundl catalog claud claude-code-provider claude-stream-json cli cod code_writ codebas command command-lin config config-loader config-schema consult context control cor crew crew-preset crew-registry crew-schema dashboard default default-prompt default-rol definit delivery detach detached-run detect detector diff diff-servic dir directory directory-map discovery doc doctor domain effort effort-heuristic engin entry error error-format execut fetch flow flow-assist flow-discovery flow-schema format frontend fs gateway generat generate-docs-metadata git guard guarded-fetch handbook heuristic http hub ids index init ink integrat integration-servic json known known_provider len level lin liv loader loc machin map mcp merg merge-advisor merge-preview metadata metric miss multi multi-project navigator notificat of onboard only orchestrator output output-format owner owner-taught path path-guard persona phas pick planner policy policy-engin postur preset preview profil profile-schema profile-usag program project project-detector prompt propos provider provider-detect provider-resilienc provider-runner provider-schema pty publish q queu react read read-only read_only ready registry remain resilienc review roadmap rol role-registry role-schema rout rul run run-engin run-entry runner runtim safety saga scheduler schema script select select-workflow server servic sess setup shap shell show skill skill-assignment-servic skill-discovery skill-loader sourc spec spec-up src sse start stat state-machin stor stream stream-json suggest supervisor task taught termin test the tim to top top-level tour tre ts tui ui up usag util validat vib vibestrat what wher workflow workspac worktre writ yml",
      "body": "This is a tour of `src/`, the source tree. The list isn't exhaustive, since small helpers are omitted, but every top-level directory and stable extension point appears here.\n\nIf you are looking for one thing, four questions cover most of the tree:\n\nthe run engine core/ who runs a seat agents/ the guardrails safety/ policies/ the dashboard server/ ui/\n\n## The shape of `src/`\n\n```\ncli/            the vibe command-line program\nserver/         local HTTP/SSE API behind vibe ui\nui/             React dashboard (Mission Control)\nshell/          Ink TUI behind vibe shell\ncore/           run engine, state machine, stores,\n                metrics, validation, context\nsupervisor/     picks persona, lens, flow, posture\nflows/          Flow schema, catalog, runtime, hub\nagents/         crew -> role -> profile -> skills\nproviders/      local CLIs, adapters, MCP config\nproject/        .vibestrate/project.yml schema\nsafety/         Action Broker, apply gateway\npolicies/       owner-taught project rules\ngit/            worktrees, merges, merge-preview\nroadmap/        tasks, planner, proposals\nreviews/        review suggestions and bundles\nscheduler/      background run queue\nsetup/          onboarding, doctor, provider setup\nnotifications/  rules, routing and delivery\nconsult/        read-only project Q&A + handbook\nspec-up/        the Spec-up phase\nterminal/       PTY terminal sessions\nworkspace/      multi-project navigator\nutils/          fs, json, paths, time, run ids\n```"
    },
    {
      "id": "docs/architecture/http-api",
      "kind": "doc",
      "title": "HTTP API",
      "source": "Vibestrate docs: architecture/http-api",
      "summary": "The local dashboard API, a versioned /api/v1 contract with optional bearer-token auth and the flow import, export, and create endpoints.",
      "titleTerms": "api http",
      "terms": "0 1 127 200 201 24 400 401 403 404 4317 500 a abort act advic advis an analyz and answer api apply approv architectur at auth authenticat authorizat bas bearer bearer-token bind body bound branch broker by call character cheap clean clos complet confirm consult contract control control-character coverag creat creator crew cross cross-origin cross-sit csrf curl currency dashboard data default definit delet deny descript don draft effort endpoint error event exist export expos fail fail-clos favicon fetch fil file-or-url finish finish-now first flow flow-creat flow-delet flow-fork flow-import flow-patch fork format gat get git glanc guard guid h head health hex host http http-api id ids import in initializ input integrat is it json kind lan loc localhost loopback main merg merge-to-main messag ndjson need network new no non non-loopback now of off on only openssl option or origin our out over overview overwrit patch path paus phas policy portability post preview problem profil project rand recommendat redact refus requir require_approv resolv resolve-first rol run s scan schema seat sec sec-fetch-sit secret secret-scan server sigterm sit siz sourc sse ssrf stag stage-on-integration-branch start stop supervisor target text that the then think thread to token token-gat tool tru turn ui unverifi unvers url v1 validat vers vib vibestrat vibestrate_api_token with writ www www-authenticat yaml yml",
      "body": "`vibe ui` starts a Fastify server (default `http://127.0.0.1:4317`) that backs the dashboard. The same endpoints are a stable, scriptable contract: every dashboard action is an HTTP call, so anything the UI does, an external caller can do too.\n\nPin `/api/v1` in scripts - it is rewritten to `/api` before routing, so both prefixes reach the same handlers.\n\nThe server binds loopback and auth is off by default. Set `VIBESTRATE_API_TOKEN` and every `/api` request must then carry `Authorization: Bearer` with that token. Binding a non-loopback host without a token is refused at startup.\n\n## Endpoints at a glance\n\nThree areas: flows, integration, and the supervisor. Each one is described in full further down.\n\n```\nGET  /api/v1/health\nGET  /api/v1/flows\nGET  /api/v1/flows/:flowId/export\nPOST /api/v1/flows/import\nPOST /api/v1/flows\nPOST /api/v1/flows/draft\nPOST /api/v1/crews/draft\n\nGET  /api/integration/overview\nPOST /api/integration/advice\nPOST /api/integration/analyze\nPOST /api/integration/finish\n\nGET  /api/supervisor/threads\nPOST /api/supervisor/threads/:threadId/turn\n```\n\n## Base URL and versioning\n\n- **Unversioned:** `/api/...` - what the bundled dashboard calls. - **Versioned:** `/api/v1/...` - the canonical contract for external callers.\n\nA versioned path is rewritten to its unversioned form before routing, so the two are the same handlers.\n\n## Authentication\n\n```\n# expose on the LAN, token-gated\nexport VIBESTRATE_API_TOKEN=$(openssl rand -hex 24)\nvibe ui --host 0.0.0.0\n\n# then call it with that token\nAUTH=\"Authorization: Bearer $VIBESTRATE_API_TOKEN\"\ncurl -H \"$AUTH\" http://<host>:4317/api/v1/flows\n```"
    },
    {
      "id": "docs/architecture/overview",
      "kind": "doc",
      "title": "Architecture overview",
      "source": "Vibestrate docs: architecture/overview",
      "summary": "How Vibestrate's pieces fit together, from the orchestrator down to the local CLI binary.",
      "titleTerms": "architectur overview",
      "terms": "agent an api approv architectur assert binary by cli cod code_writ component control cor daemon default deliberately down export fit for from glob how invocat loc machin miss model no on only orchestrator os overview own piec project provider read read_only relat remot run s sandbox see server src telemetry the to together transit ts ui v validat vib vibestrat wait waiting_for_approv what writ yml your",
      "body": "Vibestrate is a single Node process that orchestrates other local processes. There is no daemon, no service mesh, no cloud component.\n\nThe `vibe` CLI hands work to the orchestrator in `src/core/orchestrator.ts`, which drives a run stage by stage, moves the run state machine, and writes every artifact under `.vibestrate/runs/`. Three siblings sit below it: agents in `src/agents`, validation in `src/core/validation/`, and Mission Control - a Fastify server in `src/server` plus a React dashboard in `src/ui`.\n\nAgents reach a model through the providers in `src/providers` (11 built in, including claude, codex, gemini and ollama). A provider runs a CLI binary already installed on your machine. Vibestrate holds no model API tokens - the provider CLIs hold their own. Path guards and permission profiles are enforced by Vibestrate, not the OS.\n\n## The components\n\n```\nvibe CLI  (src/cli)\n   |\n   v\nOrchestrator  (src/core/orchestrator.ts)\n   |\n   +--> Agents  (src/agents)\n   |       |\n   |       v\n   |     Providers  (src/providers)\n   |       |\n   |       v\n   |     Local CLI binary on your machine\n   |\n   +--> Validation  (src/core/validation/)\n   |\n   +--> Mission Control  (src/server + src/ui)\n```\n\n## What the orchestrator owns\n\nThe orchestrator keeps a run moving and remembers where it is. It owns:\n\n- Stage sequencing - driving a run through the workflow. - State machine transitions - `assertTransition` before every move. - Worktree lifecycle - create, bind a branch, commit per stage. - Artifact persistence - every prompt, response, decision, and event. - Approval handling - pause for `waiting_for_approval`, resume on decide. - Pause/resume - the pause flag, durable across restarts."
    },
    {
      "id": "docs/cli/dashboard",
      "kind": "doc",
      "title": "Mission Control",
      "source": "Vibestrate docs: cli/dashboard",
      "summary": "The local dashboard for inspecting runs, approving gates, reading diffs, and steering the orchestrator.",
      "titleTerms": "control miss",
      "terms": "4317 a abort add all and approv audit banner between block board brand c canva chang claud cli cmd codebas config control crew ctrl ctrl-c ctrl-k dashboard diff do doe env execut fail fil flow for g gat headless hero id inspect inspector it jump k ledger list liv loc log main merg merge-to-main metric miss mor no no-open not open orchestrator outcom p pag policy port profil project propos provider r read rol run sourc start statu steer step stop supervisor switcher tab the to tre ui undo undo-merg using vib watch what",
      "body": "Mission Control is Vibestrate's web UI. A Fastify process serves it on demand from your own machine, and there is no backend of ours behind it. It reaches the network only on the paths you ask it to: the Flow Hub (searching, pulling or publishing a flow talks to vibestrate.com), fetching a skill from a URL, and importing a flow from a URL. It never pushes, never merges without a confirmation you send with the request, and never runs a shell command you type.\n\n## Start it\n\nOpen the dashboard with:\n\n```\nvibe ui\n```\n\nThe default port is `4317`. Pass `--port` to change it.\n\nIt opens your browser by default. `--no-open` keeps it headless.\n\nFirst visit, a short guided tour points out the six surfaces the rest of the app hangs off: Runs, Flows, Board, Policies, Consult, and New run. Skip it any time, or take it again later from the help overlay (press `?`).\n\nYou can also start a run with the dashboard already attached:\n\n```\nvibe run \"Add audit logging\" --ui\n```\n\n## The pages\n\nMission Control's left sidebar is the app shell, and the page you open fills the rest of the window:\n\nsidebar run detail status hero live execution changed files · steps · events\n\nThe sidebar lists:"
    },
    {
      "id": "docs/cli/overview",
      "kind": "doc",
      "title": "CLI overview",
      "source": "Vibestrate docs: cli/overview",
      "summary": "The shape of the vibe command, how its subcommands group, and the conventions every command follows.",
      "titleTerms": "cli overview",
      "terms": "0 1 127 2 20 4317 4400 a abort accept acm activ agent allow allow-token-to-custom-host alway an and any api apply approv architect architectur area arg as assess assign assuranc astro audit auth bas base-url boolean browser built built-in cd chang cheap check clear cli cod codebas codebase-map com command config configur confirmat consult control convent cor could crew current custom dashboard deep deep-refactor deep-review default definit descript detect discoverabl doctor don draft durabl enabl enter env every execut export fals fetch filter fix flow follow for framework friendlier from generat get ghp git github group guidanc h handl heavy help high horizont host how hub i id import in init input insid inspect inst interactiv is its json key l leak learn ledger level list log login look loop map max md memory miss mor my my-flow nam no no-open not null number of onc one open or out overview overwrit param parity pass past path paus payment per plan planner pnpm port pre pre-publish preset preview print profil project project-param prompt provider publish raw readabl recent redo refactor referenc refus regenerat reject remov renam render replay request request-chang resolv resum resume-from resume-stag reus review review-heavy reviewer rewind right risk rol run s safety sam scaffold schema secret selector semver set settabl setup shap shell show sk skill skip slug spend stag start statu step stor str strong subcommand suggest supervis supervisor t tabl task test that the thorough to token top top-level tru typecheck ui unassign unset url usd use user using validat var verb verify vers via vib vibestrat vibestrate_api_token vibestrate_hub_token view warn welcom what with work worktre wrong yaml yes yml your your-github-login zod",
      "body": "The `vibe` command is how you work with Vibestrate from a terminal. Anything you can do in the dashboard you can do here, and the other way round.\n\nAdd `--json` to any command that offers it for machine-readable output, and `--yes` to a command that would otherwise stop and ask.\n\nA failure comes back as a structured error: a title, an optional detail, and often a hint pointing at the next thing to try.\n\nRun `vibe --help` for the live list of commands, which is always exactly what your install has.\n\n## The core loop\n\n```\nvibe init               # once per project\nvibe doctor             # verify env + config\nvibe run \"Your task\"    # start a run\nvibe status             # active and recent runs\nvibe replay <runId>     # inspect any past run\nvibe path <runId>       # the run's git worktree\nvibe rename <runId> a friendlier name\n```\n\n## Command shape\n\n```\nvibe (no args)       → the interactive shell\nvibe <command>       → a top-level command\nvibe <area> <verb>   → a verb inside an area\n```\n\n```\ntop-level  init      setup     welcome\n           run       status    abort\n           pause     resume    doctor\n           ui        replay    shell\n           path      rename    logs\n           assurance audit     ledger\n           consult\n\nareas      provider  config    skills\n           flows     params    approvals\n```\n\n## Worktrees, and rewinding a run\n\n```\ncd \"$(vibe path <runId> --cd)\"\n```"
    },
    {
      "id": "docs/cli/shell",
      "kind": "doc",
      "title": "Interactive shell",
      "source": "Vibestrate docs: cli/shell",
      "summary": "The terminal panel vibe opens with no arguments, with a live status bar, tabbed pages, and an always-on command prompt.",
      "titleTerms": "interactiv shell",
      "terms": "0 00 1 1-9 10 2 30 9 a abort activ activity alway always-on an and approv argument argv autocomplet b back bar body branch browser budget c cap cli clos command complet config context context-sensitiv control crew ctrl d daily default delet dismiss do doc down e edit effort end enter esc f flag flow get git header help hi high hom htop i idl ids in in-termin j json k key layout lin liv low m main medium miss mod n nam navigat new no o of on only open opt or p pag palett panel paus prefix previou profil project prompt q queu quit r re re-run read read-only red replay resum retent roadmap run scroll select sensitiv set shell shift show snapshot spac spend statu subcommand switch tab task termin the their they to today topic trunk up usd using validat valu vib vibestrat view vim websit what with worktre writ yellow your",
      "body": "Running `vibe` with no arguments opens the interactive shell: a terminal panel that keeps the project's context in front of you and gives you a prompt to drive Vibestrate without leaving the keyboard.\n\nPress **i** to focus the prompt and run any `vibe` command, **:** for the command palette, **?** for context-sensitive help, and **q** to quit. Navigation, at the end of this page, lists the rest of the keys.\n\n```\nvibe\n```\n\nThe shell is built on Ink and runs full-screen in the terminal's alternate screen buffer, the same way `vim` or `htop` do. The canvas is fixed: it never grows or scrolls as you type, and your previous terminal contents come back when you quit.\n\nIt needs an interactive terminal. In a pipe or CI it prints a notice and exits.\n\nThe panel fills the terminal and is split into three bordered regions: a header, the context line and prompt, and a body with the active page beside a COMMANDS panel.\n\n## Layout\n\n```\nRuns      p pause · r resume · a abort · R re-run\nRoadmap   e edit · n new · d delete · Q queue\n```\n\n### Autocomplete\n\n```\nconfig             view show get set keys validate\nconfig show -      --json\n--effort           low | medium | high\n--effort=hi        --effort=high\n--crew --flow      your crew and flow ids\n--profile --task   your profile and task ids\nreplay             your run ids\ntasks show         task ids\nflows show         flow ids\n```\n\n```\n▸ vibe config set git.▌\n    › git.mainBranch             = main\n      git.branchPrefix           = vibestrate/\n      git.snapshotRetentionRuns  = 0\n    Name of the main/trunk branch (default main).\n    ⇥ complete · ↑↓ select · esc dismiss\n```"
    },
    {
      "id": "docs/cli/supervised-tasks",
      "kind": "doc",
      "title": "vibe tasks (supervised runs)",
      "source": "Vibestrate docs: cli/supervised-tasks",
      "summary": "Author and run supervised tasks - a task with ordered steps you define once and sequence later through the Conductor.",
      "titleTerms": "run supervis task vib",
      "terms": "0 1 2 20 3 4a08 5 7c1 9b2d a acceptanc add and apply ask at author back between block board boolean boundary brief budget chang check checklist ci ci-migrate-the-write-path-4a08 ci-update-the-model-9b2d clean clear cli cod com comma comma-separat command conductor config dashboard default defin display don done-when edit enabl enhanc error executor exhaust exit fil flow for from good halt handler happen heal hint id idl in in_progress into invariant is it item its json key languag later leav lik list liv look mark max migrat model mov next no not null number objectiv of on onc only order own parity pass path paus pend plain pnpm posit proc profil progress promot re re-read re-sequenc read reason relat remov reorder replac rest resum review reviewer rol rout run s saga scop self self-heal-exhaust separat sequenc set shap show spend split src stat statu step still stop str strong summary supervis supervised-task supervisor task task-settings-v2-7c1 text the through titl to tru ts typ typecheck uncheck up updat usd using v1 v2 vib watch weak what when with work worktre writ you your",
      "body": "`vibe tasks` manages this project's tasks. A **supervised** task is one you break into ordered steps first, with `vibe tasks add --supervised` and `vibe tasks checklist add`. Each step carries a scoped objective, a plain-language done-when check, and optional file hints.\n\n`vibe tasks run` then works through those steps in order, in a single git worktree, committing after each one. It stops on its own when a step fails review, when the budget is reached, or when a between-steps supervisor judges the work has gone off-goal.\n\nEach step is micro-planned, implemented and reviewed, with a bounded fix loop, then committed - and between steps the supervisor decides to proceed, enhance or escalate.\n\nOnly a failing step's own work is discarded; every step that already committed stays on the branch. Nothing is ever auto-merged, so a finished supervised task lands as one branch for you to read.\n\nSee supervised tasks for the concept.\n\n## Author the steps\n\n```\nvibe tasks add --supervised \"Settings v2\"\n```\n\n```\n✓ Task added.\n  id: task-settings-v2-7c1e\n  title: Settings v2\n```\n\n```\nvibe tasks checklist add task-settings-v2-7c1e \\\n  \"Update the model\" \\\n  --objective \"Replace the SettingsV1 type with \\\nSettingsV2 in src/models/settings.ts\" \\\n  --acceptance \"pnpm typecheck passes with no \\\nerrors in src/models/\" \\\n  --files \"src/models/settings.ts\"\n```\n\n```\n✓ Added checklist item ci-update-the-model-9b2d.\n  Update the model\n```"
    },
    {
      "id": "docs/cli/supervisor",
      "kind": "doc",
      "title": "vibe supervisor",
      "source": "Vibestrate docs: cli/supervisor",
      "summary": "The supervisor's kill switch from a terminal - stop it acting, resume it, check whether it may act - plus the persona commands.",
      "titleTerms": "supervisor vib",
      "terms": "08 15 169 2026 2026-08-15 34 49 a abort act adopt advis again an and answer archetyp as at authorizat authz autonomy bar blast blast-radiu built built-in but can catalog check cli clos command control copy correctness correctness-purist data data-migration-guardian default delet diff engineer every fail fast first for from frontend frontend-reviewer guardian hawk her id in init inject into it json kill len let list may migrat next no not now paus performanc performance-skeptic persona plu postur pragmatist prefer project purist radiu reason remov resolv resum review reviewer right risk risky run s sam sandbox sandbox-suggest secret security security-hawk security-risk set ship ship-fast-pragmatist skeptic staff staff-engineer statu still stop subcommand suggest supervisor switch t12 task termin test the thi tru updat using vib vibestrat whether will within yml you your z",
      "body": "`vibe supervisor stop` is the kill switch. It stops the supervisor **acting**: it will still answer you, but it cannot create a task, add checklist items, or start a run. It writes a flag to disk instead of editing your config, so it takes effect at once, survives a restart, and works from a terminal - which matters, because the moment you most want a stop button is not reliably a moment you have a browser tab open.\n\nIt stops the **next** action, not one already taken. A run the supervisor started before you typed this keeps going; `vibe abort` is what stops that.\n\nThe flag **fails closed**. If Vibestrate cannot read that file - corrupt, half-written, wrong permissions - the supervisor is treated as stopped. A stop that quietly degrades to \"go\" is not a stop. A missing file is the one exception, and it honestly means running: nothing has ever been stopped here.\n\nThe rest of the commands manage personas - which judgment posture the supervisor brings to a run.\n\n## Every subcommand\n\n```\nvibe supervisor <subcommand>   (bare: same as list)\n\nlist          resolved personas, built-in + project\narchetypes    the catalog you can adopt\nadopt <id>    copy an archetype into project.yml\ndefault <id>  set this project's default\nremove <id>   delete a project persona\nstop          stop it acting; it still answers\nresume        let it act again\nstatus        whether it may act right now\n```\n\n```\n--json     list, archetypes, status\n--reason   stop\n```\n\n## Stop and resume\n\n```\nvibe supervisor stop --reason \"reviewing the diff\"\nvibe supervisor resume\n```\n\n```\n! Supervisor stopped. It will answer, but it\n  will not act. (reviewing the diff)\n✓ Supervisor resumed. It can act again, within\n  your autonomy setting.\n```"
    },
    {
      "id": "docs/concepts/annotation",
      "kind": "doc",
      "title": "Annotations",
      "source": "Vibestrate docs: concepts/annotation",
      "summary": "Pin short notes to your files so the agents read them during a run, without ever touching your code.",
      "titleTerms": "annotat",
      "terms": "40 40-58 58 a actually add agent an annotat as auth authoritativ bear cod codebas concept don dur env ever fil for guidanc her human is json key lin load load-bear not one order pin project rang read refactor resolv run runtim safety see sess short so src t task the them thes thi to touch treat ts user vibestrat visibl what when whol without x your",
      "body": "An annotation is a short note you pin to a file in your codebase, telling the agents something they should know before they start work.\n\nIt works like a sticky note stuck to a page. The page stays exactly as it was, but anyone reading it sees your note first. Use one to say things like \"don't refactor this\", \"this function is the bug\", or \"match the pattern in `x.ts`\" without editing the file yourself.\n\nYou pin annotations from Mission Control's **Codebase** page. They never touch your source. They live in their own file, `.vibestrate/annotations.json`, off to the side. Annotations are entirely optional, and Vibestrate works exactly the same with none.\n\nBecause a shared note goes straight into agent prompts, it obeys the same no-secrets rule as everything else. You can't annotate a secret-like file such as `.env` or `*.key`, a note body is refused if it contains something shaped like a vendor token, paths are project-relative with no traversal, and a note stops at 4000 characters.\n\n## What a note pins to\n\nEvery note targets a file, and you can point it at a precise spot:\n\n- **Whole file** - leave the line blank. - **A line** - set a start line, or click the `+` that appears when you hover a line in the file viewer. - **A range** - set a start and end line.\n\n## When agents see them\n\nEach note has a **Visible to agents** toggle, on by default. It decides which of two places the note ends up:\n\na note you pin shared and open every agent's prompt private or resolved the dashboard only\n\n## What an agent actually reads\n\n```\n# Human Annotations\n\nThe user pinned these notes to the codebase.\nTreat them as authoritative guidance for this task:\n\n- **src/auth/session.ts:40-58** - don't refactor\n  this; the ordering here is load-bearing.\n```"
    },
    {
      "id": "docs/concepts/configuration",
      "kind": "doc",
      "title": "Configuration & settings",
      "source": "Vibestrate docs: concepts/configuration",
      "summary": "Where Vibestrate keeps its settings, and how to view and edit each one in the UI or the CLI.",
      "titleTerms": "configurat set",
      "terms": "10 10-styl 20 20-test a act adaptiv advis and anthropic anthropic_api_key api as at block budget by check cli cod code_writ codebas command commit concept config configurat control crew deeper default doctor dot dot-path each edit editor env every execut flow get git gitignor going group how human id in init instruct it its json keep key learn liv loc local-worktre map md merg methodology next not null one only or out parity path permiss persona pnpm policy ponytail postur profil project prompt provider raw read read_only readabl requir resilienc rol rul run sam scheduler schema secret sess set settabl show siz skill spec stay styl supervis supervisor test that the thing tim to tru ui up validat valu vers vib vibestrat view what wher workflow worktre writ yml your",
      "body": "Almost everything you can tune about Vibestrate lives in one place: the `.vibestrate/` folder at the root of your project, created by `vibe init`.\n\nThe heart of it is a single file, `.vibestrate/project.yml` - your providers, profiles, crews, flows, policies, and validation commands all live there. It is plain YAML sitting inside your repo, yours to commit - commit it and your whole team runs the same setup. The rest of the folder is files you write yourself:\n\n.vibestrate/ project.yml settings live here rules.md rules/ roles/ skills/ flows/ policies/ runs/ files you edit directly\n\nYou rarely need to open it by hand, though. Every setting has a place to view and edit it in both the dashboard and the CLI. That's a deliberate rule, not a coincidence (see UI and CLI parity below).\n\n`vibe config keys` lists every settable key with its type, allowed values and default. `vibe config get` reads one, and `vibe config set` writes one.\n\nConfiguration never holds secrets. An API key for an HTTP provider is given as an environment reference (`apiKey: env:ANTHROPIC_API_KEY`), resolved at run time and never written back to YAML, logged, or shown in the UI. A literal key in config is refused outright.\n\n## Viewing and editing your configuration\n\n```\nvibe config view          # grouped, readable\nvibe config view --json   # the same, as JSON\nvibe config show          # raw project.yml\nvibe config keys          # every settable key\nvibe config validate      # check the schema\n\n# one value at a time, by dot-path\nvibe config get commands.validate\nvibe config set workflow.requireHumanMerge true\n```"
    },
    {
      "id": "docs/concepts/consult",
      "kind": "doc",
      "title": "Consult",
      "source": "Vibestrate docs: concepts/consult",
      "summary": "Ask one question about your project and get an answer grounded in what is really there, and in Vibestrate's own documentation.",
      "titleTerms": "consult",
      "terms": "a about an and answer api apply are ask assist at behind block can caveat chang claud concept confidenc confirm consult cost dashboard did diff do documentat doe driv effort estimat fil flow from get git glanc ground guid hand heavier her id in is it last leav left level list look md me model new noth null one own policy post profil project propos provider quest read really reject relat run s screen shell should som spend src task termin the ther thi thing ts two until updat use vib vibestrat week what wher why writ yml you your",
      "body": "**Consult** answers one question about your project. It reads your files, your config and your recent runs. It also reads Vibestrate's own documentation, compiled into the package, so an answer about the product quotes a real command or config key instead of a remembered one.\n\nYou reach it two ways: `vibe consult \"...\"` in a terminal, and the orb at the bottom right of every dashboard screen. It answers for **where you asked from** - screens to open in the browser, commands to run in the terminal. That is not a tone setting. On the dashboard the command reference pages are dropped from the answer's source material before the model sees them, so there is nothing left to copy a terminal instruction out of.\n\nyour question dashboard screens to open terminal commands to run\n\nConsult is read-only. No run starts, no file in your repository changes, nothing merges, and the model is given no permission to write. One thing outlives the question, and it does nothing on its own: say a durable review rule while asking and consult writes it into `.vibestrate/project.yml` as a pending **policy proposal**. The code that writes it forces the advise tier and no matcher, whatever the answer asked for, and the rule enforces nothing until you confirm it.\n\nEvery answer states a **confidence** and lists **caveats** - what it could not verify. The orchestrator is a model too, and an answer with neither would be model confidence dressed as fact.\n\nFor a conversation that persists, and that can act when you allow it, see Supervisor Control. Consult is the one-shot way in."
    },
    {
      "id": "docs/concepts/crew",
      "kind": "doc",
      "title": "Crew",
      "source": "Vibestrate docs: concepts/crew",
      "summary": "Your set of AI workers, and which AI model each one uses.",
      "titleTerms": "crew",
      "terms": "a act add ai and are at backend balanc broader builder by c0 character cheap claud claude-balanc cod code_writ concept crew dashboard deeper default each edit editor executor fast field fil fit from glanc glob going hand happen implementer init install into is it its json label list loc look loop mad mak match max mcp model ndjson nul of on one only pag past permiss pick preset profil project prompt purpos read read_only ready ready-mad review rol role-field role-prompt role-skill run sav screen seat secret server set setup skill task than the them then thorough use vib vibestrat what when whether which who worker workflow writ yml you your",
      "body": "A **Crew** is your set of AI workers. Each Flow lists the *kinds* of worker it needs - a builder, a reviewer, and so on. Your Crew is who actually shows up to fill those spots.\n\nA Crew lets you put a different model in each seat, so the one that builds the change is not the one that reviews it - they read the problem from their own angle and check each other's work, instead of a single model rubber-stamping its own. The disagreement is the point.\n\nThink of a Flow as a recipe that says \"you need a chef and a taster\". The Crew is who you hire for those jobs, which is why a Flow someone else wrote still runs with your own people.\n\nEach worker in a Crew is called a **Role**. A Role does two things: it says which steps it can cover, and it picks the actual AI model that does the work.\n\n`vibe init` writes you a `default` Crew with six Roles - planner, architect, executor, fixer, reviewer, verifier - all on one Profile. Four more Crews are ready-made and installable with `vibe crew presets add`: `fast`, `thorough`, `cheap` and `local`.\n\n```\ncrews:\n  default:\n    label: Default\n    roles:\n      executor:\n        label: Backend Implementer\n        seats: [implementer, executor, builder]\n        profile: claude-balanced\n        prompt: .vibestrate/roles/executor.json\n        permissions: code_write\n        skills: []\ndefaultCrew: default\n```\n\n`defaultCrew` is the Crew a run uses when it does not pick one. `seats` is the kinds of step the Role covers; `profile` names its model and provider - see profile.\n\n## Picking who runs\n\n```\nvibe run \"task\" --crew default\n```"
    },
    {
      "id": "docs/concepts/flow",
      "kind": "doc",
      "title": "Flow",
      "source": "Vibestrate docs: concepts/flow",
      "summary": "The recipe a run follows - its ordered steps, and the kind of worker each step needs.",
      "titleTerms": "flow",
      "terms": "a actually adaptiv add and arbitrat ask assist at auth chang check codex codex-review com concept contain continu crew customiz dashboard deeper default definit each edit editor error every express field fil first flow follow for from gat glanc going good has hub id import in install instruct it its keep kind list mak model nam need new no of off on one or order other overrid own pick pin point profil project provider quality quality-arbitrat recip referenc repeat reveiw review reviewer rol routin run s select set show siz skip spec step step-profil the then thi tighten unknown up vib vibestrat what when wher which with worker worth writ yml you your yourself",
      "body": "A **Flow** is a recipe: the ordered steps a run works through, and the *kind* of worker each step needs. It names seats - \"this step needs an implementer\", \"this one needs a reviewer\" - and it never names an AI model. Your Crew supplies the workers. That is what lets you run a Flow someone else wrote with your own models and your own budget.\n\n**A Flow step has no model, provider, or profile field.** So \"always review on a different vendor\" is a Crew setting, not a Flow setting: point the Role that fills the `reviewer` seat at a Profile on another vendor. To change one step for one run only, pass `--step-profile review=` followed by a Profile id you have already defined. Why a human stays in the loop walks through creating one on a second provider.\n\nVibestrate ships the `default` flow: plan, architecture, implement, validate, review, verify, with fix and re-validate looping in when review asks for changes. Workflow is the canonical description of it, step by step.\n\nThere is no \"the default one unless you choose another\". `defaultFlow` is unset in a fresh project, so with no `--flow` Vibestrate decides per task: a short, low-risk task can be sized down to `express`, a risk-tagged one can be upgraded by your supervisor persona, and a brief that reads like \"build me a whole system\" runs the read-only Spec-up chain first. Every run prints the Flow it resolved and where the choice came from.\n\n## Picking one yourself\n\n```\n# what this project has, and what a Flow contains\nvibe flows list\nvibe flows show quality-arbitration\n\n# run one\nvibe run \"Tighten the auth checks\" \\\n  --flow quality-arbitration\n```"
    },
    {
      "id": "docs/concepts/policies",
      "kind": "doc",
      "title": "Policies",
      "source": "Vibestrate docs: concepts/policies",
      "summary": "The project's one rule surface - tiered rules the active supervisor enforces, from soft advice to a hard merge block.",
      "titleTerms": "policy",
      "terms": "12 a activ add adopt advic advis at author avoid avoid-em-dash block broken captur character choic cli concept confirm consult dash discard do draft em em-dash enforc english eyebrow fix from gat glanc hard hyphen id in it keep label list matcher merg migrat no no-em-dash no-eyebrow not one only option or owner owner-author owner-only past pend persona policy policy_advis policy_block preferenc project prompt propos reach recent reject remov review rul run s sect security slip soft stay stop suggest supervisor surfac test the tier to ui use vib vibestrat vs what would yml your",
      "body": "A **policy** is a rule the project enforces on every run. Policies belong to the *project*, not to one supervisor - so a rule like \"use a hyphen, not an em-dash\" holds no matter which supervisor reviews the work. The active supervisor is the *enforcer*: it carries them into the review, but it does not own them.\n\nEach policy has a **tier** that decides how it is enforced:\n\n**advise** - the default. The supervisor puts the rule in front of the reviewer and a model checks the change against it. A violation is flagged and rides the normal review and fix loop. Right for anything a human judges: a model generalizes to paraphrases a brittle pattern would miss. An advise rule never blocks a merge on its own.\n\n**block** - a regex matched against the lines the run **added**, not a model verdict. On a match the run lands `blocked` with the reason shown, even if the reviewer approved. A rule against em-dashes catches one the run writes and says nothing about one already in the file. It scans from the run's fork point, so mid-run commits are caught, and skips secret files. If the diff cannot be read the run is blocked, not waved through.\n\nA block is **owner-only**. The supervisor can *propose* an advise rule from a consult, never a hard block, and a proposal lands *pending* - it does nothing until you confirm it.\n\n**A broken block matcher stops the project, not the merge.** No matcher, one over 256 characters, or one that is not a valid regular expression is refused when you write it and again every time `project.yml` loads - the config fails with the reason instead of shipping a gate that looks armed. One that reaches the gate anyway is skipped and recorded as a `supervisor.policy_block` event. Dry-run a matcher with `vibe policies test`."
    },
    {
      "id": "docs/concepts/ponytail",
      "kind": "doc",
      "title": "Ponytail - the minimalism posture",
      "source": "Vibestrate docs: concepts/ponytail",
      "summary": "Code-writing agents default to the smallest solution that works - question whether the task needs to exist, reach for the standard library, one line before fifty. On by default.",
      "titleTerms": "minimalism ponytail postur the",
      "terms": "a agent already an and away befor by cod code-writ concept config crew deeper default do doe execut exist fals featur fifty for going her insid inst is it library lin mak nativ need not on one only ponytail provenanc quest reach set smallest solut standard task that the thi to trad trust vib what whether why will work writ writer",
      "body": "Left alone, a coding agent tends to over-build: a helper class where a function would do, a dependency where the standard library was fine, fifty lines where one was enough. **Ponytail** is the posture that pushes back. It injects a \"lazy senior dev\" ruleset into the agents that write code, so their default is the smallest change that actually works. It is on by default; `vibe config set ponytail false` (or the dashboard config editor) turns it off.\n\nOnly the seats that produce a diff see it - the implementer and the fixer. Planners, reviewers, the arbiter and the verifier run without it, so the check on a change stays independent of the posture that wrote it. Minimal is not careless: the correctness rules survive the posture, and every diff still passes the post-turn gate and your review.\n\n## What it makes an agent do\n\nBefore writing code, a ponytail agent climbs a ladder and stops at the first rung that answers the problem:\n\n**Does this need to exist?** The cheapest code is the code you don't write. Question the task itself before building it.\n\n**Is it already here?** Reach for something in the codebase before adding anything new.\n\n**Standard library?** Prefer what the language already ships over a new helper.\n\n**Native feature?** Prefer a platform or framework feature over a dependency.\n\n**Already installed?** Solve it with a dependency the project has before adding one it doesn't.\n\n**One line before fifty?** The smallest version that works, not the most general one.\n\nThe result is smaller, less speculative diffs: fewer new files, fewer dependencies, less dead flexibility built \"just in case.\""
    },
    {
      "id": "docs/concepts/profile",
      "kind": "doc",
      "title": "Profile",
      "source": "Vibestrate docs: concepts/profile",
      "summary": "A reusable preset that says how strong and expensive a Role runs - a Provider plus its model and effort.",
      "titleTerms": "profil",
      "terms": "1 4 5 a about actually add advanc agent allow and api at be budget budget_token built built-in by catalog claud claude-max codex codex-fast concept config configur crew deeper delet detect dial disallow duplicat effort effort_ignor exampl expensiv fast fenc from get going gpt gpt-5 guard has how id ignor implement in insid is issu its itself label legibility list low max model ms nest new no not off one opt opu orchestrat outsid overlay patch per per-profil plu point post power preset profil project provider providers-catalog quick reach refus remov reusabl rol run s say set sonnet sourc spend statu step step-profil strict strict-writer strong sub sub-agent task that the ther thi thos timeout to token tool used vib warn writ writer yml",
      "body": "A **Profile** decides how strong and expensive a Role runs. It is a saved preset that bundles a **Provider** (where the work happens), the **model**, and the **effort** level, so a Role can point at it instead of naming a model itself.\n\n**A Role points at a Profile, not a model.** A Role names a Profile by its id, and the Profile holds the actual provider, model, and effort. So you swap the model for every Role on a Profile by editing one place, and a Role never hard-codes a model itself.\n\nThink of it like the drive modes on a car. \"Eco\" and \"Sport\" don't change who is driving, they change how hard the engine works. A Profile is that setting for an AI worker, saved with a name so you can reuse it.\n\nA Profile sets five things: the `provider`, the `model` id, the effort level (`power`), an optional per-turn output cap (`maxTokens`) and a per-turn `timeoutMs`.\n\nEffort levels are the provider's own. `claude` takes low, medium, high, xhigh, max; `codex` takes minimal, low, medium, high, xhigh; the Gemini CLI has no effort flag, so no effort knob is offered for it. Set a level a provider does not have and the run warns with a `provider.effort_ignored` event rather than dropping it quietly.\n\n## A quick example\n\n```\nprofiles:\n  codex-fast:\n    provider: codex\n    label: Codex fast\n    model: gpt-5.1\n    power: low\n  claude-max:\n    provider: claude\n    label: Claude Opus, max effort\n    model: opus\n    power: max\n```\n\n## Fencing off a role's tools\n\n```\nprofiles:\n  strict-writer:\n    provider: claude\n    model: opus\n    # no nested sub-agent orchestration\n    disallowedTools: [\"Task\"]\n```"
    },
    {
      "id": "docs/concepts/project-params",
      "kind": "doc",
      "title": "Project parameters",
      "source": "Vibestrate docs: concepts/project-params",
      "summary": "Fill your project's answers once, and every run reuses them.",
      "titleTerms": "parameter project",
      "terms": "a acm and answer api astro bdd brand by check chosen cohesiv color concept deeper default deploy edit env every explicit fail fast fill flow for form framework generat gitignor glob going how id increment insid instruct is json just keep key later list methodology my my-deploy nam never nich not onc openai openai_api_key option palett param parameter per per-flow planner profil project project-glob project-param recogniz remov requir reu rol run s scaffold scop secret set shar stor str supersed tdd the them then token tru typ type-check unknown unset use valu vib vibestrat vibestrate_param vibestrate_param_color_token x yml your",
      "body": "Some Flows need a few answers before they can do their job, like a project name, a brand color, or which framework to use. **Project parameters** let you give those answers once. Every later run reuses them, so Vibestrate stops asking you the same things over and over.\n\nThe Flow says what it needs (typed values like `projectName` or `framework`), you fill them in a single time, and the values are saved in `.vibestrate/project-params.json` and reused from then on. Nothing adds that file to your `.gitignore` for you, but a `secret: true` param stores only the name of an environment variable, never the secret itself.\n\nA value can arrive from several places, and the first one that has it wins: an explicit `--param` flag, then the matching `VIBESTRATE_PARAM_*` environment variable, then your stored project value, then the Flow's own default.\n\n## Fill once, then run\n\n```\n# Fill once - the --flow form type-checks values\nvibe params set --flow scaffold \\\n  projectName=Acme framework=astro\n\n# Every later run just uses them\nvibe run --flow scaffold\n\nvibe params list\n```\n\n## Secrets\n\n```\nparams:\n  apiKey:\n    type: string\n    secret: true\n```\n\n```\n# The store keeps env:OPENAI_API_KEY, not the key\nvibe params set --flow my-deploy \\\n  apiKey=OPENAI_API_KEY\n```\n\n## Generate a default (optional)\n\n```\nparams:\n  palette:\n    type: string\n    generate:\n      instruction: >\n        Generate a cohesive color palette\n        for a {{params.niche}} brand\n```\n\n## Methodology (a recognized project-global param)\n\n```\n# Recognized values: tdd, bdd, incremental\nvibe params set methodology=tdd\n```"
    },
    {
      "id": "docs/concepts/provider",
      "kind": "doc",
      "title": "Provider",
      "source": "Vibestrate docs: concepts/provider",
      "summary": "What actually runs a model - a coding-agent CLI on your machine, or an HTTP endpoint. Vibestrate supplies the prompt.",
      "titleTerms": "provider",
      "terms": "0 1 11434 127 4 5 a accept actually add advanc agent ai ai-compatibl aider all also amp an anthropic anthropic-api anthropic_api_key any api apply arg assum auth auto auto-fil back bas built built-in c capability catalog claud claude-cod claude-haiku claude-high claude-pro claude-sonnet-4-5 clear cli cloud cod code_writ codex codex-low coding-agent com command commit common compatibl concept config configur crew crush cursor cursor-agent deeper default destinat doctor dry dry-run eco edit effort egress endpoint entry env env-ref exec exist explicitly extern extra family fil fill finetun flag for forc format from gap gap-fill gemini gemini_api_key going goos haiku help high http http-api human implement in input insid isn it its json just key kind knob known known_provider level list liter loc localhost localhost-proxy login low machin machine-readabl matter md messag mistak mod model my my-finetun mycli nam need never no no-auto-commit non non-cli not noth null ollama ollama-loc on one only open openai openai_api_key opencod or output output-format overlay own p permiss permission-mod power preset preset-ready pro prob profil project prompt provider providers-catalog proxy pull put qwen qwen3 r raw read read_only readabl ready real reason ref refresh replac reus review reviewer rol run run-wid saf safe-mod sam seat server sess set setup show sonnet sourc sovereignty stdin step step-profil submit suggest supply t test the ther thi to token tru turbo twic typ up url usag use user valu vib vibestrat view vs what wher why wid with would writ x yaml yes yml your zero zero-egress",
      "body": "A provider is what actually runs a model. Vibestrate writes the prompt; the provider runs the model and hands back the response, and the file changes too when it can edit files. Everything model-specific - login, billing, context limits - stays on the provider's side of that line.\n\nMost providers are coding-agent CLIs already installed on your machine, but not all of them are.\n\nThere are four kinds, declared under `providers:` in `project.yml`:\n\n**`claude-code`** Claude Code, the integration Vibestrate understands most deeply.\n\n**`cli`** Any other coding-agent CLI - a command, its args, and how the prompt is fed in.\n\n**`http-api`** A cloud model API on your own key, https only.\n\n**`localhost-proxy`** A model server on this machine, loopback only, so no egress.\n\nEleven CLIs ship with Vibestrate. Five are configured for you the moment they are detected:\n\nclaude codex gemini aider ollama\n\nThe other six are detected but need `vibe provider setup` once, because their flags are not stable enough across versions for Vibestrate to guess:\n\nopencode qwen crush goose cursor amp\n\n> **Use `claude-code`, not `cli`, for Claude.** A write-capable seat (`permissions: code_write`) on that provider gets `--permission-mode acceptEdits`, so the headless `claude -p` can actually apply its edits in the worktree. The seat's permission only governs Vibestrate's own broker; the underlying CLI has its *own* permission gate, and a generic `cli` provider can't be granted through it. Read-only seats get no write grant. Set `settings.permissionMode` to override the default.\n\n> **Provider vs profile vs role:** a Provider is the tool; a Profile names a Provider plus how strong to run it; a Role runs on a Profile. Roles never name a Provider directly."
    },
    {
      "id": "docs/concepts/role",
      "kind": "doc",
      "title": "Role",
      "source": "Vibestrate docs: concepts/role",
      "summary": "One worker in your Crew - the instructions it follows, the model it runs on, and the kinds of step it can handle.",
      "titleTerms": "rol",
      "terms": "1 403 a accept and api approv arbiter architect are assembl assign balanc builder built built-in can carry challenger claud claude-balanc claude-cod cli cod code_writ concept config content context crew deeper default deliberately diff edit executor field fil fixer flow follow get glob going handl how id implementer in init insid instruct into is it json kind label markdown merg merge_ready mod model not of on one only outsid patch path permiss permission-mod planner post profil project prompt provider put read read_only ready requir require_approv resolv review reviewer rol role-field role-prompt role-skill run s schema seat shell six skill split step subject termin than the thi unassign verifier vers vib vibestrat vs what why wider work worker writ yml you your",
      "body": "A **Role** is one worker in your Crew, and it says how that worker behaves and which kinds of step it can take on.\n\nThink of a Role like a job description on a team. The description says what this person does and which tasks they are allowed to pick up. It doesn't name the actual person. A Role works the same way: it points at a **profile** (which decides the model), and lists the **seats** (the kinds of step) it can fill in a flow.\n\n**Permissions are the field that decides whether a Role can change your code.**\n\n**`read_only`** Reads and reasons, but never writes a file. The planner, architect, reviewer and verifier ship this way.\n\n**`code_write`** May edit files inside the run's worktree. The executor and fixer ship this way.\n\nThat setting gates Vibestrate's own action broker. For the agent to actually write, the underlying CLI has to allow it too: on a `claude-code` provider, a `code_write` seat's turn gets `--permission-mode acceptEdits` so the headless CLI can apply edits. Read-only seats get no write grant.\n\n## What a Role carries\n\nA Role is one row inside a crew, under that crew's own `roles` map. There is no top-level `roles` map. Each Role carries:\n\n```\ncrews:\n  default:\n    roles:\n      reviewer:\n        label: Reviewer\n        seats: [reviewer, challenger]\n        profile: claude-balanced\n        prompt: .vibestrate/roles/reviewer.json\n        permissions: read_only\n        skills: []\n```\n\nA role file is **JSON, not Markdown**, and its `id` has to match its filename:\n\n```\n{\n  \"schemaVersion\": 1,\n  \"id\": \"reviewer\",\n  \"prompt\": \"You review diffs...\"\n}\n```"
    },
    {
      "id": "docs/concepts/safety",
      "kind": "doc",
      "title": "Safety - Action Broker & policies",
      "source": "Vibestrate docs: concepts/safety",
      "summary": "How Vibestrate routes every real effect through one checkpoint, writes down what it decided, and lets you deny or hold actions for approval.",
      "titleTerms": "act broker policy safety",
      "terms": "120 40 a act activ advanc after again allow allowlist already anchor and any api applicabl apply apply-only approv are ask assuranc at attend audit auto auto-retri autonomy back backend backoff be befor behavior best best-effort block blocker both boundary broker budget by can cap caus ceil chang checkpoint claud cli clock codex command complet composer concept confidenc config configur confinement consult container continu control count coverag creat crew cross daily dashboard day decid default default-allow defens deny depth descript detail did didn diff docker doctor doe dollar don dotenv down downgrad downgrade-model dur early edit effect effort egress env error every exec execut exhaust fail failur fallback fell fetch field fil fix flag flow for forbid full fully gap gat get git glob hard harden harden-read-only hiccup hold hold-merge-for-review honest how i id in information init install instead is isolat it its json kind let limit list liv load loader los loudly match max max-time-day max-turns-run may mcp md merg merge_ready messag min miss mod model nam nativ ndjson need network never no no-network-install no-secret-writ not not_applicabl noth nothing-to-verify npm of off on onc one only or os out own pars partially partially_verifi patch path pattern paus per permiss permission-mod pip plan policy post post-turn postur preset preview profil project provider provider-nativ rat rate-limit read read-only ready real reduc reduce-effort refu refus regex request requir require_approv resilienc retri retries_exhaust retry retry-after review review_miss rid root rout rul run runtim s safety sandbox scor seat secret set show sign skill so soft someth spawn spend start statu step step-by-step steps_failed_tolerat stop story stream stream-json strict strict-apply-only subscript supervisor t termin that the them then thi think through tim to today tolerat tool tool_us transient tru try turn two unattend unbound unbounded_unattended_run unsaf unsandbox usag usage_limit usd use validat validation_miss verdict verifi verificat verification_not_run verify veto vib vibestrat wait waiting_for_approv wall warn was what when wher with writ yaml yml you your zero",
      "body": "Nothing a run does to your machine happens without passing one checkpoint. That checkpoint is the **Action Broker**. It decides each request against your rules, then writes down what it decided and what actually happened.\n\nEight kinds of effect cross it, and this is the whole list:\n\n**`provider.spawn`** - start an AI provider.\n\n**`command.run`** - run a validation command.\n\n**`file.patch`** - apply or revert a diff.\n\n**`file.write`** - write a flow file, a Role's prompt, `VIBESTRATE.md`, `mcp.json`, a spec-up artifact.\n\n**`terminal.create`** - open a terminal.\n\n**`run.complete`** - finish a run.\n\n**`run.start`** - the supervisor starts a run off a chat message.\n\n**`git.merge`** - the guided merge into your main branch.\n\n**Default-allow with a policy veto.** An effect no policy matches is allowed. A policy can only refuse (`deny`) or hold (`require_approval`); none of them can grant.\n\nDecisions are honored fail-closed - anything short of an explicit `allow` refuses the effect at the call site. Every decision, refusals included, is one line in the run's `actions.ndjson`.\n\n**Editing your own settings does not cross it.** `vibe init`, the config commands, `POST /api/config/set`, the Policies panel, installing a Crew preset, adopting a supervisor persona and editing a Profile all write `project.yml` directly. So **a rule that denies `file.write` is not a lock on your config file.**\n\nTwo supervisor effects are ungated as well. In `act` mode, a chat message that creates a task or adds checklist items writes straight to the roadmap. A consult answer that proposes a policy writes a pending entry into `project.yml`. Only `run.start` is gated.\n\nThe full list is below."
    },
    {
      "id": "docs/concepts/sandbox",
      "kind": "doc",
      "title": "Container isolation - run in a disposable Docker container",
      "source": "Vibestrate docs: concepts/sandbox",
      "summary": "Run each agent turn inside a throwaway Docker container so the blast radius is the container, not your machine - what it mounts, what it can't touch, and where it stops short.",
      "titleTerms": "a container disposabl docker in isolat run",
      "terms": "0 169 22 22-bookworm-slim 254 443 512 a admin agent all allow allowlist an and anthropic anthropic_api_key anthropic_base_url api aqf are auth aws back backend bas becom befor blast bomb bookworm by can cap cap-drop cap_net_admin carry claud cli clos codex com concept config confin connect container credenti cross default degrad deny disposabl do docker doe doesn drop each egress enetunreach enforcement environment exampl exec execut f fail fail-clos fall filesystem filter fit fork fork-bomb fresh gateway github github_token guard hard harden hom host how http http_proxy https_proxy imag in insid intern is isolat it json key label latest leak limit loc local-worktre localhost machin manag max mod model mount must my my-org narrow net network never new no no-new-privileg nod not npmj of on onc only open openai openai_api_key operat opt opt-in org out outsid own per permit pid pids-limit pretend privileg process project provider provider-auth proxy prun ps radiu rather reach read read-only read-writ readonly refu registry rest rm root run runtim s safety sandbox secret security security-opt servic set short slim so ssh start stop t than the thi throwaway tmp to token too touch tru trust turn unavailabl url variabl vib vibestrat vibestrate-agent vm wall what wher worktre writ writabl yml you your",
      "body": "By default a run executes on your machine, bounded by a git worktree and the post-turn diff gate. For an unattended run, or a task you don't fully trust, you can move the agent off your host entirely: set `execution.backend: docker` and each provider turn runs inside a **disposable Docker container**. The blast radius becomes the container, and it's the same wall whichever provider runs - which a provider's own sandbox can't do, since that only confines its own process.\n\nIt is opt-in. `execution.backend: local-worktree` stays the default; switch with `vibe config set execution.backend docker` or the dashboard config editor.\n\nTwo things surprise people. The image must already carry the provider CLI, because `docker exec` runs that CLI inside the container and the default image `node:22-bookworm-slim` has none. And with the default `egress.mode: open` the container reaches the whole internet, so a credential readable inside it can be sent anywhere - run `vibe config set execution.container.egress.mode allowlist` before pointing this at anything you don't trust."
    },
    {
      "id": "docs/concepts/seat",
      "kind": "doc",
      "title": "Seat",
      "source": "Vibestrate docs: concepts/seat",
      "summary": "The empty chair a Flow step needs filled - a label, not a name, which is what keeps Flows shareable.",
      "titleTerms": "seat",
      "terms": "a agent agent-turn approv approval-gat architectur ask brief chair chang cod concept deeper descript diff empty execut fil flow flow-schema for gat going how id implement implementer input insid is keep kind label mak nam need not output plan respons response-turn review review-turn schema seat shareabl src step summary summary-turn task task-brief the ts turn validat what which",
      "body": "A **Seat** is an empty, labelled chair in a Flow that says \"this step needs someone to fill it.\" It is a contract, not a person: it names the *kind* of worker a step needs, and nothing about who.\n\nPicture a Flow as a table with chairs around it. One chair is labelled \"implementer\", another \"reviewer\". The Flow sets out the chairs and what each one is for. It never says who sits down. Your Crew does that, choosing a worker for each Seat when the task actually runs.\n\nThat gap is the whole point. Because a Flow only names chairs and never names your AI models, you can take a Flow someone else wrote and run it with your own workers. The chairs are shared. Who fills them is yours.\n\n## How a Flow asks for a Seat\n\nA Flow declares the Seats it needs, then points each step at one:\n\n```\nseats:\n  implementer:\n    label: Implementer\n    description: Makes code changes.\n\nsteps:\n  - id: implement\n    label: Implement\n    kind: agent-turn\n    seat: implementer\n    inputs: [task-brief, plan, architecture]\n    outputs: [execution, diff]\n```\n\nYour Crew fills the `implementer` seat with a worker (a Role) you've set up. You can name that Role anything - Backend Implementer, Executor, Coder - as long as it lists `implementer` in its own `seats`.\n\nA Seat carries a `label` and an optional `description`, and nothing else - no model, no vendor. The worker who takes the Seat brings the model through its profile, so the same Flow can run on different AI depending on who fills the chair.\n\n## Which steps need a Seat\n\nNot every step does. A `validation` step that runs your tests, or an `approval-gate` that waits for you, needs no Seat - nobody is sitting down to think. The four kinds where an AI takes a turn do: `agent-turn`, `review-turn`, `response-turn` and `summary-turn`."
    },
    {
      "id": "docs/concepts/skill",
      "kind": "doc",
      "title": "Skill",
      "source": "Vibestrate docs: concepts/skill",
      "summary": "A markdown file you write once that loads alongside an agent's prompt, so it always knows the things that should be true about your codebase.",
      "titleTerms": "skill",
      "terms": "a about act agent alongsid alway an as assign attach auth auth-convent be cent claud codebas common concept convent crew currency deeper default ephemer error error-handl every everyth executor extern fetch fil float for go going handl help id idempotency idempotent in includ info inlin inst integer is it json key know lik load look markdown mcp md mistak money must nam ndjson never onc oncall oncall-runbook one payment planner post process project prompt put real refund rol rul run runbook runtim s safety servic should skill so src stor stuck that the thi thing through to touch transact tru using vib vibestrat vs what when why writ yml you your",
      "body": "A **skill** is a markdown file you write once, and any agent can read it. Use it for the things that should always be true about your codebase: your conventions, your security rules, the \"we don't do X here.\"\n\nThink of it as the note you'd hand a careful new colleague on their first day. You don't repeat the house rules every time you give them a task. You write them down once, point to them, and trust they'll be remembered.\n\nSkills live in `.vibestrate/skills/` (committed with your project) or `.claude/skills/` (picked up if you already use Claude Code). Each one is either a folder holding a `SKILL.md` or a single flat markdown file, and its name is that folder or file name - so `skills/auth-conventions/SKILL.md` gives you the skill `auth-conventions`. A `name:` in the frontmatter overrides that. Prefer the folder shape: only a folder can sit beside a `.mcp.json` and bring MCP servers with it.\n\n## Why it helps\n\nMost \"the agent did the wrong thing\" problems trace back to context the agent didn't have. Skills fix that without retraining a model and without padding every task description with the same boilerplate.\n\n## What a skill looks like\n\n```\n# .vibestrate/skills/payments/SKILL.md\n\nThis codebase handles real money.\nWhen touching `src/payments/`:\n\n- Always idempotent. Every external POST\n  must include an idempotency key.\n- Currency is stored as integer cents.\n  Never floats.\n- Refunds must go through\n  `RefundService.process()` - never inline.\n```\n\n## Attaching a skill to an agent\n\n```\ncrews:\n  default:\n    roles:\n      planner:\n        skills: [payments, error-handling]\n      executor:\n        skills: [payments]\n```\n\n```\nvibe run \"Refund a stuck transaction\" \\\n  --skills payments,oncall-runbook\n```"
    },
    {
      "id": "docs/concepts/spec-up",
      "kind": "doc",
      "title": "Spec-up (plan before you build)",
      "source": "Vibestrate docs: concepts/spec-up",
      "summary": "Turn a vague brief into a scoped spec, an architecture, the risks, and a reviewable roadmap - before any code is written.",
      "titleTerms": "befor build plan spec spec-up up you",
      "terms": "a acceptanc adaptiv all an and answer any approv architectur at befor brief build cod command concept consult ecommerc edit editor fil find flow foo gap get glanc honest how id ids in intak into is it limit mini off orb proc project propos quest register reviewabl risk roadmap round run s scop simplify spec spec-up spec-up-intak start stor suggest the to ts turn up vagu valu vib what wher written yml you",
      "body": "Most planning tools answer \"how do I write this change?\" Spec-up answers the question that comes before it: \"what are we actually building, and what did you not tell me yet?\"\n\nYou give it a brief - even a vague one, like \"a mini ecommerce store\" - and it surfaces the decisions the brief left unstated (do users sign in? how do you take payments? how many products? do you ship physical goods?), asks you those gap questions, and only then drafts the plan. Nothing it does touches your code: every step is a read-only run.\n\nWhat comes back is a scope (in, out, assumptions), a spec, an architecture with a provisioning checklist, a risks register, and a roadmap of dependency-ordered board cards. Start it with `vibe spec-up start` and your brief, or start an ordinary run and let the supervisor route a plan-worthy brief here on its own.\n\nIt runs as a chain: an intake run, then rounds of gap-check questions you answer, then the spec-up run and, once you approve, a roadmap run.\n\n## Where to find it\n\n```\nvibe spec-up start \"a mini ecommerce store\"\nvibe spec-up questions <runId>   # the round's ids\nvibe spec-up simplify <runId> <questionId>\nvibe spec-up suggest <runId> --all\nvibe spec-up answer <runId> --answer <id>=<value>\nvibe spec-up answer <runId> --proceed\n```\n\n```\nvibe spec-up edit <runId> scope\nvibe spec-up edit <runId> spec\nvibe spec-up edit <runId> architecture\nvibe spec-up edit <runId> risks\nvibe spec-up approve <runId>\nvibe spec-up build <runId>\nvibe spec-up roadmap <runId>     # -> a proposal\n```"
    },
    {
      "id": "docs/concepts/state",
      "kind": "doc",
      "title": "Run state",
      "source": "Vibestrate docs: concepts/state",
      "summary": "The status a run is in, what each one means, and the rules that keep moves between them honest.",
      "titleTerms": "run stat",
      "terms": "a abort allow allowed_transit and approv architect are at between block chang concept creat deeper each enforc error execut fail fix for gat going guidanc honest id in inspect is it json keep kind lifecycl list mark matter mean merg merge_ready mov of one paus plan policy policy-gat ready reject replay request request-chang review rul run stat statu sticky termin that the them transit two user user-request validat verify vib vibestrat wait waiting_for_approv what why",
      "body": "A run always has one status, and you can check it at any moment to know exactly what the run is doing right now.\n\nThink of it like a package you've shipped. At any point it's in one definite place - \"out for delivery\", \"delivered\" - never two at once, and never somewhere the tracking made up. A run's status works the same way. It's always a single value, saved so you can read it back, and never a guess.\n\nThat saved value lives in a `state.json` file under `.vibestrate/runs/`, in the folder named after the run id. The `status` comes from a fixed set of sixteen values, and Vibestrate validates it before writing it down.\n\nA run starts at `created` and ends in one of four terminal statuses:\n\ncreated planning, architecting, executing validating, reviewing, fixing, verifying merge_ready blocked failed aborted no way back out\n\nAlong the way it can sit at `waiting_for_approval` (a policy gate is holding it) or `paused` (you asked it to stop).\n\n## The moves are enforced\n\nWhat makes the status trustworthy is that Vibestrate controls how a run gets from one status to the next. Every allowed move is written into an explicit list, the `ALLOWED_TRANSITIONS` allowlist. If something tries a move that isn't on the list, Vibestrate raises a `StateTransitionError` and stops, instead of letting the bad move happen quietly.\n\n## Two kinds of pause\n\n```\nvibe approvals list <runId>\nvibe approvals approve <runId> <approvalId>\n# reject marks the run blocked\nvibe approvals reject <runId> <approvalId>\nvibe approvals request-changes \\\n  <runId> <approvalId> --guidance \"...\"\n```\n\n## Inspecting state\n\n```\nvibe status\nvibe status --json\nvibe replay <runId>\n```"
    },
    {
      "id": "docs/concepts/supervised-tasks",
      "kind": "doc",
      "title": "Supervised tasks (run modes)",
      "source": "Vibestrate docs: concepts/supervised-tasks",
      "summary": "A task has steps and a run mode - plain (one pass) or supervised (the Conductor sequences each step with its own review). One card for a whole feature.",
      "titleTerms": "mod run supervis task",
      "terms": "20 a acceptanc add and at audit author between card check checklist clear concept conductor context curat dashboard do doe driv each enabl enhanc escalat fals featur fil for fresh from glanc goe ground halt has hint how id in invariant it its ledger log max mod model new not objectiv one only or order own packet pass paus plain plan plan-only profil project re re-ground re-sequenc refin relat remov reorder resum review run sequenc spend src statu step supervis supervised-task supervisor task text the ts usd vib vs what whol with writ writer yet yml you",
      "body": "There is no separate \"saga\" kind of task. A Task has an ordered set of **steps**, and a **run mode** that decides how those steps run:\n\n- **plain** - the default flow runs the task in one holistic pass. - **supervised** - the **Conductor** sequences the steps one at a time, each with its own review (and the supervisor, invariants, Enhance, budget, and clean-halt described below). A single-step task is just the degenerate case.\n\nEach step carries:\n\n- a **text** label - what the step is called on the card, - an **objective** - the scoped brief an executor will receive, - an **acceptance check** - a plain-language done-when description, - optional **file hints** - paths or globs that are primary context for that step.\n\n`vibe tasks sequence` runs one. It works in a single worktree and commits one step at a time to one feature branch. A step that cannot pass its review halts the task cleanly instead of pressing on, and re-running skips the steps that already finished. Nothing is ever auto-merged.\n\n## Plain vs supervised\n\nA plain task with a checklist is a lightweight to-do list, run in one pass.\n\n## Authoring a supervised task\n\n```\nvibe tasks add \"Add audit logging\" --supervised\nvibe tasks checklist add <id> \"Write the writer\" \\\n  --objective \"...\" --acceptance \"...\" \\\n  --files \"src/audit/*.ts\"\n\nvibe tasks sequence <id>   # run the steps in order\nvibe tasks status <id>     # steps, invariants, halt\nvibe tasks pause <id>      # between steps\nvibe tasks resume <id>     # clear the pause\n```"
    },
    {
      "id": "docs/concepts/supervisor",
      "kind": "doc",
      "title": "Supervisor",
      "source": "Vibestrate docs: concepts/supervisor",
      "summary": "The judgment Vibestrate brings to a run - how hard it looks, what the reviewers aim at, and a labelled record of every call it made.",
      "titleTerms": "supervisor",
      "terms": "a adopt advis aim an and apply approv archetyp are at auto block bring call can car cheap cheap-reviewer claud concept copy cross cross-model decid deeper default enforc engineer every flow for gat glanc going haiku hard harden hawk heavier honest how in into is it judgment label len list login look mad migrat mod model mor not of off on one or pag permiss permission-mod persona pick plan policy postur prefer preferenc preset profil project provider record replac review reviewer risk risky rul run s sandbox sandbox-suggest seat security security-hawk set sign sign-off singl single-profil six staff staff-engineer structur suggest supervisor the then thi thrifty to turn use vib vibestrat what who work yml you",
      "body": "A **supervisor** is the judgment Vibestrate brings to a run: how hard to look at the work, and how strict to be before calling it done. It does no work itself. It sets the level of scrutiny, then writes down every call it makes.\n\nThink of a building inspector. They do not pour the concrete or hang the drywall. They decide how hard to look, send the risky parts back for a second opinion, and record every call so you can trust the sign-off.\n\nOne word covers two things in this product, so it is worth separating them up front. **This page is the setting.** `.vibestrate/project.yml` calls it a `persona`, you pick one per run, and it shapes how the work is reviewed. The **Supervisor** panel in the dashboard is something else: a *conversation* with your project, covered by Supervisor Control. They share a name and a command: under `vibe supervisor`, list, archetypes, adopt, default and remove manage the setting on this page, while stop, resume and status belong to the conversation.\n\nA supervisor is advisory, and the product says so out loud. Its choices only ever add scrutiny, never remove it, and its record labels each entry as its own judgment or as a gate that fired.\n\nOne of its settings is worth knowing before the rest. `reviewerProfile` sends every review seat to a model you pick, so the code's author does not have to be its only reviewer.\n\ntask supervisor flow upgraded when risky lenses what reviewers aim at posture sandboxed? approve each change? feed every call, labelled"
    },
    {
      "id": "docs/concepts/supervisor-control",
      "kind": "doc",
      "title": "Supervisor Control",
      "source": "Vibestrate docs: concepts/supervisor-control",
      "summary": "The chat panel on Mission Control. It remembers the conversation, answers from your real project, and - when you allow it - turns what you say into a task or a run.",
      "titleTerms": "control supervisor",
      "terms": "40 6 a about act add advis allow already an and answer api approv are as ask assum at attach attachment autonomy back be becom budget build but button can cannot ceil chat checklist clos cod com concept config control conversat creat crew deni destinat did diff differ discuss do doe don edit effort error exist fail fil fin from gat glanc hard held how instruct into is it item its itself last leav let limit liv mad materi matter max max-turns-run md me messag miss nam never new no not noth now on one only or panel permiss phas preview profil project propos prov public quest quot rat rate-limit rather real reason remember reply request requir require_approv resum reversibl review rout run s say second set should show start statu stop stream supervisor supervisor-control task than that the thi think thre thread to todo tool turn undo uneven upload verbatim vib vibestrat what when who will without word work writ you your",
      "body": "**Supervisor Control** is the chat panel titled **Supervisor**. It sits on Mission Control, and on the page of any run that is still going. Type what you want. It answers from your real project, and it remembers what was said earlier in the thread.\n\nConsult answers one question and forgets it. Supervisor Control keeps the thread, so \"do the other one instead\" has something to point at.\n\nA turn runs in three phases. **Routing** decides what you meant. **Acting** does it. **Answering** writes the reply. Routing only runs when the supervisor is allowed to act, and out of the box it is not - so a message costs one model call and changes nothing.\n\nThe control in the panel header is a **permission**, not a stop. It reads **Answers only** or **Answers and acts**, and it decides whether the supervisor may make a task, add TODOs or start a run. Stop is a different control: the red square that replaces Send while a turn is running.\n\nyou routing acting answering you nothing to act on\n\n## One turn\n\n```\nanswer         a question, or discussion.\ntask.create    new work, not on an existing task.\nchecklist.add  TODO items on an existing task.\nrun.start      build it now, on an existing task.\n```\n\n## Stop\n\n```\nvibe supervisor stop --reason \"reviewing the diff\"\nvibe supervisor status\nvibe supervisor resume\n```\n\n## Letting it act\n\n```\nvibe config set supervisorControl.autonomy act\n```\n\n```\nvibe budget set --max-turns-run 40\n```"
    },
    {
      "id": "docs/concepts/task",
      "kind": "doc",
      "title": "Task",
      "source": "Vibestrate docs: concepts/task",
      "summary": "The plain-language brief you hand Vibestrate. One sentence is enough to start a run, and every run ends at one of four outcomes.",
      "titleTerms": "task",
      "terms": "1 1-bas a abort add adjectiv adjective-noun and another append apply assuranc at audit back back-to-back bas between block bold bold-lovelac break brief but cap cap-and-continu chang check checklist concept configurabl constraint context continu continuou correctness cost deriv detach don end endpoint enhanc enough every exist fail flow for four from giv glanc good hand handler happen health human id improv in in_progress includ inherit into is it item json key languag len lib list log logger look lovelac mark merg merge_ready mov nam need never noun of one only open or out outcom parent paus pend per per-item pick pickup pickup-review plain plain-languag plausibl plausible-but-wrong practic print progress propos put read read-only ready relat reorder return review risk rout run sav security security-risk sentenc server set should skill src stabl start stat statu step structur submit surfac task test the tip titl to ts up use user valu vib vibestrat vs weak what when whol wrong yardstick you",
      "body": "A Task is what you want done, written in plain language, the way you would brief a capable colleague. You say what you want. Vibestrate works out the steps.\n\n```\nvibe run \"Add structured logging to the \\\nsettings save handler\"\n```\n\nThat one command is a complete Task. You don't list files or set an order. The Flow decides the steps and your Crew does the work. The Task is just the brief.\n\nA Task becomes a *run*, and a run ends at one of four outcomes: `merge_ready`, `blocked`, `failed`, or `aborted`. It never pushes and never merges. The diff is yours to land.\n\n## A good Task vs a weak one\n\n```\nvibe run \"Add structured logging to the settings \\\nsave handler in src/server/routes/settings.ts. \\\nUse the existing logger from src/lib/logger.ts. \\\nInclude the user id and the changed keys, but \\\nnever the values.\"\n```\n\n```\nvibe run \"Improve logging\"\n```\n\n## Checklists: break a Task into items\n\n```\nvibe tasks checklist add <taskId> \\\n  \"/health returns json\"\nvibe tasks checklist add <taskId> \\\n  \"test the endpoint\"\nvibe tasks checklist list <taskId>\n\n# mark one done\nvibe tasks checklist check <taskId> <itemId>\n\n# or give it another status\nvibe tasks checklist status <taskId> <itemId> \\\n  in_progress\n\n# reorder, 1-based\nvibe tasks checklist move <taskId> <itemId> 1\n```\n\n### Open a step\n\n```\n# read-only: prints a proposed checklist\nvibe tasks enhance <taskId>\n\n# append the proposed items\nvibe tasks enhance <taskId> --apply\n```"
    },
    {
      "id": "docs/concepts/vibestrate-md",
      "kind": "doc",
      "title": "VIBESTRATE.md",
      "source": "Vibestrate docs: concepts/vibestrate-md",
      "summary": "A committed manual at your project root that Consult reads when you ask about your project, so you never re-explain it.",
      "titleTerms": "md vibestrat",
      "terms": "a about against and apply approv arbitrat architectur ask at author boundary build codebas codebase-map command commit concept configurat constraint consult convent credenti crew critic development domain e execut explain express extra flow g gat get goe guid guidanc head heavier how id implementer in init install is isolat it its json known lean learn lesson lint locally machin machine-own manu map md mod model never not or orchestrat order other own path planner policy prefer preferenc print project propos provider quality quality-arbitrat quest rank re re-explain read regenerat review risk rol root rul run sandbox secret show so stay task test that the thi to touch typecheck use validat vib vibestrat vibestrate-md what when who you your",
      "body": "`VIBESTRATE.md` is a committed file at your project root that says what this project is and how you like it run: its domains, its commands, the conventions you keep having to repeat. It is durable, project-aware guidance, and it is advisory rather than a hard rule - it can never override a code-enforced policy.\n\nToday one surface reads it: Consult, the advisor you ask questions. Ask \"should this use a heavier review?\" and the answer is grounded in your manual instead of guesswork. Runs themselves do not read it, so a rule you need every agent to follow belongs in `.vibestrate/rules.md`, which is loaded on every turn.\n\n`vibe guide init` scaffolds a starter file, `vibe guide show` prints the current one, and `vibe guide proposals` lists additions Consult has suggested for you to apply or reject.\n\n## What goes in it\n\nKeep it concise and prune it. Suggested sections, written in plain prose:\n\n```\n# VIBESTRATE.md\n\n## Project Model\nWhat this project is, its domains, architecture\nboundaries, critical flows.\n\n## Development Commands\nInstall, test, typecheck, lint, build, run\nlocally - in order.\n\n## Orchestration Preferences\nPreferred flows and crews; when to use heavier\nreview; when to stay lean.\n\n## Risk Rules\nWhen to propose sandbox mode, approval gates,\nisolated execution, extra validation. (e.g.\n\"propose sandbox mode when a task touches\nprovider execution or secret/credential paths.\")\n\n## Codebase Conventions\n## Known Constraints\n## Lessons Learned\n```\n\n## The codebase map: machine-owned, not authored\n\n```\nvibe learn        # regenerate the map\nvibe learn show   # print CODEBASE.md\n```\n\n### Who gets the map\n\n```\ncodebaseMapRoles: [planner, implementer]\n```"
    },
    {
      "id": "docs/concepts/walkthroughs",
      "kind": "doc",
      "title": "Walkthroughs",
      "source": "Vibestrate docs: concepts/walkthroughs",
      "summary": "A walkthrough turns an answer into a guided tour. It moves you to the right screen and rings the control it is talking about.",
      "titleTerms": "walkthrough",
      "terms": "a about an and answer anywher at author built button check concept consult control crew dashboard deep do doe down drop exampl exist first flow for generat glanc guid has how i in into is it link mak me mov not noth on or pag panel point policy press quest right ring run screen set show someth step supervisor tak talk that the ther through tim to tour turn under vibestrat walk walkthrough when wher work written wrong you your",
      "body": "An answer tells you what to do. A **walkthrough** stands you in front of it. Ask \"how do I make a crew?\", and the answer arrives with a **Show me how** button. Press it and the dashboard moves to the Crew screen, draws a ring around the control the step is about, says what it is for, and waits for you to press Next.\n\nA walkthrough can only navigate. It opens a screen and points at something on it. It never clicks a button, types in a field, saves, edits your config, or starts a run. That is the same ceiling every button under an answer has, and there is deliberately no third kind of action, because a third kind is how a chat button turns into an unreviewed effect. The pressing stays yours.\n\nTwo kinds exist. Both open the same overlay, with the same privilege.\n\n## Written down, or built for your question\n\n**Authored** - five walkthroughs for the five things most people do first. Every screen and every control they name is a literal the compiler checks and a test greps for, so they cannot drift into pointing at something the app no longer has.\n\n**Generated** - everything else. A model writes the steps for the question you actually asked, every step is checked against the real screens before anything opens, and a step that fails is **dropped**.\n\nThe five authored ones are **Tour the dashboard**, **Make a crew**, **Make a flow**, **Run something for the first time**, and **Set a policy**. A question that matches one of those gets it, with no model call to wait for.\n\n## A worked example\n\n```\nHow do I make a crew?\n```"
    },
    {
      "id": "docs/concepts/workflow",
      "kind": "doc",
      "title": "Workflow",
      "source": "Vibestrate docs: concepts/workflow",
      "summary": "The eight steps of the built-in default flow, the run status each one produces, and the review loop.",
      "titleTerms": "workflow",
      "terms": "0 a accept add and approv arbitrat architect architectur architecture-handoff array block bold bold-lovelac breaker brief built built-in by chang changes_request claud command common concept context continu contract crew decis decision-summary deeper default doc doe each edit eight error every execut execution-handoff express fail fast find finding-resolut finding-respon fix flow for fresh from going handoff high how human human_approv in init insid is long loop lovelac many max md merg merge_ready mistak n need needs_human of on one opt opt-in output pag panel panel-review pass pick plan plan-handoff pnpm produc quality quality-arbitrat re re-validat ready recip request requir resolut respon resum resume-from resume-stag retry reus review run run-brief runner sam seat sess set skip stag statu stay step summary the tie tie-breaker token too track turn typecheck typo validat verify vib vibestrat wait waiting_for_approv what when workflow",
      "body": "A workflow is the ordered set of steps one run works through, from submitted to a verdict. Every run executes a Flow through one runner, so a run's workflow is the steps of whichever Flow it is running.\n\nThis page is the canonical description of the built-in **`default`** flow. It has eight steps: plan, architecture, implement, validate, review, verify, plus **fix** and **re-validate**, which are loop-only - they run when review returns `CHANGES_REQUESTED`, and not otherwise.\n\nplan architecture implement validate review verify changes requested fix re-validate\n\nReview is the only branch. `CHANGES_REQUESTED` sends the run around the loop; any other decision goes on to verify. The default flow allows three review passes, so at most two fix rounds, and a third pass still asking for changes ends the run `blocked`.\n\n**Architecture** is a full agent turn with its own `architect` seat, not a formality. **validate** and **re-validate** have no seat at all - they run your project's own commands.\n\nA run does not always take this flow. Flow covers what gets picked when you do not name one.\n\n## One runner, many recipes\n\n```\nvibe run \"...\"                  # Vibestrate picks\nvibe run \"...\" --flow default   # the eight steps\nvibe run \"...\" --flow quality-arbitration\n```\n\n### Fast tracks\n\n```\nvibe run \"fix the typo in the seat concept page\" \\\n  --flow express\n```\n\n```\n# accepted stages: planning architecting\n#   executing reviewing fixing verifying\n# default: executing\nvibe run \"...\" --resume-from bold-lovelace \\\n  --resume-stage reviewing\n```"
    },
    {
      "id": "docs/concepts/worktree",
      "kind": "doc",
      "title": "Worktree",
      "source": "Vibestrate docs: concepts/worktree",
      "summary": "Every run does its work in a separate copy of your project, so your real files are never touched.",
      "titleTerms": "worktre",
      "terms": "a abort after along are auto block bold bold-lovelac branch bring cd checkout concept copy d deeper default dir doe env environment every fail fil git going id in its keep link liv lovelac main merg merge_ready modul never nod node_modul of off pem prefix project quiet quiet-tur ready real remov run runtim saf safety separat so the thi tool touch tur venv vibestrat vibestrate-worktre wher why work worktre yml you your your-project",
      "body": "Every time Vibestrate works on a task, it does that work in a separate copy of your project. Your real files, the ones you edit yourself, are never touched.\n\nThat separate copy is a git **worktree**. Git can keep a second working folder of the same project, on its own branch, sitting right next to your main one. Picture it like a contractor building your new kitchen in a workshop down the street: same blueprints, but the mess stays out of your house until you choose to bring the finished work home.\n\nInside the copy, Vibestrate writes the agents' file edits and one commit per stage. It refuses to write anywhere outside that folder, to secret-like files such as `.env` or `*.pem`, or any patch that adds something shaped like a leaked token.\n\nThere is one honest exception, and it is worth knowing. `node_modules`, `.venv` and `venv` are symlinked in from your project so your tests can actually run in the copy. An agent with write permission can write back through those links into your project's installed dependencies. It never reaches your tracked source, and `git.linkEnvironment: off` turns the links off.\n\nThe copy is created when the run starts, lives under `../.vibestrate-worktrees/` by default, and is named after the run id. Its branch is the `git.branchPrefix` setting followed by that same run id, with no task slug appended.\n\n## Where the copies live\n\n```\ngit:\n  worktreeDir: ../.vibestrate-worktrees   # default\n  branchPrefix: vibestrate/               # default\n  linkEnvironment: auto                   # default\n```\n\n## After the run\n\n```\ncd your-project\ngit worktree remove ../.vibestrate-worktrees/<runId>\ngit branch -D vibestrate/<runId>\n```"
    },
    {
      "id": "docs/extending/add-flow",
      "kind": "doc",
      "title": "Add a Flow",
      "source": "Vibestrate docs: extending/add-flow",
      "summary": "Write your own run recipe with seats, steps, and an optional pause for your approval.",
      "titleTerms": "a add flow",
      "terms": "a add add-flow agent agent-turn an and api approv approval-gat both builder but can challenger chang clean clean-room com command commit common decid deeper diff exampl export extend fil flow flow-skip for from gat going http id import input kind label list mistak model narrativ not one option or out over over-stuf overwrit own paus plan post producer profil project prototyp prototyper reason recip respons response-turn review review-turn reviewer rol room run s seat seat-rol shar skip spec spik spike-and-decid step step-profil stuf summary summary-turn the to tru turn url v1 validat vib vibestrat with writ yml you your",
      "body": "A custom Flow is written in YAML, in a `flow.yml` inside a directory named for the flow id, under `.vibestrate/flows/`.\n\nVibestrate finds it on its own and checks it against the schema when it loads, so a broken Flow fails loudly at the start instead of quietly partway through a run.\n\nA Flow declares `seats` (the kind of worker each step needs) and `steps`. Every step has a `kind`, one of six:\n\nagent-turn review-turn response-turn validation approval-gate summary-turn\n\n## Steps\n\n```\n   id: spike-and-decide\n   version: 1\n   label: Spike and decide\n   description: Prototype, then stop and decide.\n\n   seats:\n     planner:\n       label: Planner\n       description: Plans the spike.\n     prototyper:\n       label: Prototyper\n       description: Builds the spike.\n\n   steps:\n     - id: plan\n       label: Plan the spike\n       kind: agent-turn\n       seat: planner\n       inputs: [task-brief]\n       outputs: [plan]\n\n     - id: prototype\n       label: Build the prototype\n       kind: agent-turn\n       seat: prototyper\n       inputs: [plan]\n       outputs: [diff]\n\n     - id: validate\n       label: Validate\n       kind: validation\n       inputs: [diff]\n       outputs: [validation]\n\n     - id: human-check\n       label: Stop and decide\n       kind: approval-gate\n       approval:\n         reason: Keep the spike, or rewrite?\n         requestedAction: continue\n```\n\n```\n   vibe flows list\n   vibe flows show spike-and-decide\n```\n\n```\n   vibe run \"Prototype the search ranking\" \\\n     --flow spike-and-decide\n```\n\n## Seats, not your models\n\n```\nvibe profile list\nvibe run \"...\" --flow spike-and-decide \\\n  --step-profile prototype=<profileId>\n```"
    },
    {
      "id": "docs/extending/add-provider",
      "kind": "doc",
      "title": "Add a provider",
      "source": "Vibestrate docs: extending/add-provider",
      "summary": "Tell Vibestrate how to run a local coding CLI it doesn't already know, or change the flags of one it does.",
      "titleTerms": "a add provider",
      "terms": "11434 4 5 6 a add add-provider agent already an and anthropic anthropic-api anthropic_api_key api apply arg assign at bas binary can chang claud claude-cod claude-experiment claude-fast claude-sonnet-4-6 cli cod color com command common crew custom declar deeper default diff dir directory do doe doesn env expect experiment extend fast fil flag going how http http-api id in input instead it its json key know list liter loc localhost localhost-proxy mistak model my my-coding-cli my-model my-model-default never no no-color of ollama ollama-loc on one only openai or own p per per-provider permiss pick point profil project prompt prompt-on-stdin provider proxy put qwen3 read read_only referenc report reviewer rol run seat server sonnet stdin t tak tell test the to touch typ url usag verify vib vibestrat what with work worktre wrap yml",
      "body": "A **provider** is how Vibestrate reaches a model - almost always a command-line tool already installed on your machine. The built-in detector knows eleven: Claude Code, Codex CLI, Gemini CLI, OpenCode, Aider, Ollama, Qwen Code, Crush, Goose, Cursor CLI, and Amp. Every provider declares a type, and there are four of them:\n\ncli claude-code localhost-proxy http-api\n\nIf you want to use a CLI it doesn't know about, or you want to change the flags it passes to one it does know, you declare your own under `providers:` in `project.yml`. Any local CLI works: if a command takes a prompt and returns a change, Vibestrate can drive it. There is no plugin to write and no SDK to learn - you point at the binary and say how the prompt gets in.\n\n## Declare a custom CLI provider\n\n```\nproviders:\n  my-model:\n    type: cli\n    command: my-coding-cli\n    args: [--prompt-on-stdin, --no-color]\n    input: stdin           # stdin | arg\n```\n\n## Assign the provider to a role\n\n```\nproviders:\n  my-model:\n    type: cli\n    command: my-coding-cli\n    args: [--prompt-on-stdin, --no-color]\n    input: stdin\n\nprofiles:\n  my-model-default: { provider: my-model }\n\ncrews:\n  default:\n    roles:\n      reviewer:\n        seats: [reviewer]\n        profile: my-model-default\n        prompt: .vibestrate/roles/reviewer.json\n        permissions: read_only\n```\n\n```\nvibe run \"...\" --profile my-model-default\n```\n\n## Verify it works\n\n```\nvibe provider list\nvibe provider test my-model\n```\n\n## Wrap Claude Code with custom flags\n\n```\nproviders:\n  claude-experimental:\n    type: claude-code\n    command: claude\n    args: [-p, --model, claude-sonnet-4-6]\n```"
    },
    {
      "id": "docs/extending/add-skill",
      "kind": "doc",
      "title": "Add a skill",
      "source": "Vibestrate docs: extending/add-skill",
      "summary": "Write a markdown file, save it under .vibestrate/skills/, and attach it to a role or run.",
      "titleTerms": "a add skill",
      "terms": "1 2 3 4 a about access add add-skill agent already an and anti anti-pattern arg at attach auth auth-convent be beat body bound bullet check claud command convent creat crew deeper default descript directory discover exampl explicitly extend fa fil for form going good grant hav id in inspect is it json keep list mak mark markdown mcp md ment nam not of one only option or pattern payment permiss pg pg-mcp planner plu point postgr prefer profil project prompt query read read-only reason requir right rol rul run sav seat sentenc server sess short show skill specific src stat stay surfac that the thi titl to ts two under use vib vibestrat was way we what when which writ x yml you",
      "body": "A skill is a markdown file you write to teach your agents your project's conventions. Save it under `.vibestrate/skills/` and discovery picks it up on its own - there is no scaffold to run and no metadata form. Vibestrate reads `.claude/skills/` too, so skills you already keep for Claude Code work as they are. A skill has two possible shapes: a flat `.md` file, which is this page's default, and a directory holding `SKILL.md` for a skill that also needs an MCP server - see Pointing a skill at an MCP server below.\n\n## 2. Write the body\n\n```\n# Title - what this is about\n\n## When to use this\n\nOne or two sentences naming the surface.\n\n## Rules\n\n- Bullet list of conventions.\n- Be specific. \"We use X\" beats \"we prefer X\".\n\n## Examples\n\nShort examples of the right way.\nMark anti-patterns explicitly.\n```\n\n## 3. Check that it was discovered\n\n```\nvibe skills list\nvibe skills show <name>\n```\n\n## 4. Attach it\n\n```\ncrews:\n  default:\n    roles:\n      planner:\n        skills: [auth-conventions]\n        # plus seats, profile, prompt and\n        # permissions, which stay required\n```\n\n```\nvibe run \"Add 2FA\" --skills auth-conventions\n```\n\n## Optional: pointing a skill at an MCP server\n\n```\n.vibestrate/skills/\n  postgres/\n    SKILL.md\n    .mcp.json\n```\n\n```\n---\nname: postgres\ndescription: Read-only Postgres access.\n---\n\n# Postgres MCP\n\nThis skill grants agents read-only Postgres\naccess, for inspecting queries.\n```\n\n```\n{\n  \"mcpServers\": {\n    \"postgres\": {\n      \"command\": \"pg-mcp\",\n      \"args\": [\"--read-only\"]\n    }\n  }\n}\n```"
    },
    {
      "id": "docs/getting-started/big-picture",
      "kind": "doc",
      "title": "The big picture",
      "source": "Vibestrate docs: getting-started/big-picture",
      "summary": "Vibestrate is the frame your AI coding agents work in - one shared plan, rules the run enforces, and your call at the end. Task, Flow, and Crew, explained once.",
      "titleTerms": "big pictur the",
      "terms": "a abort add agent ai and any api architect at auth behind big big-pictur block builder but call chair challenger check cli cod crew deeper default do don each end enforc executor explain fail fil fill flow for fram get getting-start glanc going handler has hav hold how http http-api implementer in init is it job key label localhost localhost-proxy log machin merg merge_ready model mor need no not of on onc one open or overrid own pick pictur plan planner profil provider proxy ready reviewer rol routin rul run s sav seat seat-rol senior senior-reviewer server set shar start strong structur task team than that the thi through tighten to tool up vib vibestrat want with work worker you your",
      "body": "Vibestrate runs the AI coding tools you already have. You write the job once, and a team of AI workers carries it out under rules you set.\n\nRunning several models on one job by hand is where the time goes: pasting the same context into a tool that has never seen the project, carrying the plan from one chat to the next, watching each one for drift. Vibestrate is the frame that work happens inside. Every worker starts from the same plan and the same project instructions, which you write once.\n\nEach Task works in an isolated copy of your project (a worktree), runs your own checks, and ends at one of four outcomes: `merge_ready`, `blocked`, `failed`, or `aborted`. It never pushes and never merges. The diff is yours to land. See the safety guarantees.\n\nSix words carry the whole product.\n\n**Task.** The job you want done, in plain language. One sentence is a complete Task.\n\n**Flow.** The routine a Task runs through. The built-in `default` flow plans, architects, implements, validates, reviews and verifies, looping back to fix when review asks for changes.\n\n**Seat.** A labelled spot in a Flow, like `reviewer` or `implementer`. A Flow names seats, never models. If two of your roles fill one seat, or none do, the run stops and names the seat rather than guessing; `--seat-role reviewer=senior-reviewer` pins the choice.\n\n**Crew.** Your team of AI workers. Each worker is a **Role**: a name, a brief, the seats it may fill, and the Profile it runs at.\n\n**Profile.** How strong a worker runs. It picks the provider, the model, and the effort level.\n\n**Provider.** The thing behind the model. A coding CLI on your machine, a model API you hold the key for, or a model server on `localhost`.\n\nTask Flow Seat Role Profile Provider job steps which worker your Crew model, effort tool or API"
    },
    {
      "id": "docs/getting-started/first-run",
      "kind": "doc",
      "title": "Your first run",
      "source": "Vibestrate docs: getting-started/first-run",
      "summary": "Give Vibestrate one small task and watch it go from idea to a finished, ready-to-merge change.",
      "titleTerms": "first run your",
      "terms": "a abort about add adjectiv adjective-noun and anyth approv artifact at big block bohr branch cd chang clean creat decis diff doesn don event fail fin finish first first-run flow for from get getting-start gh git giv go handler happen hom idea it ll log look main md merg merge_ready ndjson never next noun one or output pass pick pr ready ready-to-merg review right run sav scop see set small sourc start statu structur t task the to too ui use verificat verify vib vibestrat vibestrate-worktre watch well well-scop what when worktre you zen zen-bohr",
      "body": "One task, start to finish. You describe what you want, Vibestrate does the work in a git worktree beside your project, and it stops with a finished change on its own branch. It never merges and never pushes, so the last step is always yours.\n\nA run ends in one of four states, and the state is the whole answer to \"what do I do next\":\n\nmerge_ready The change is finished. Read the diff and keep it or drop it. blocked The reviewer or verifier flagged something you should decide. failed Something broke mid-run. aborted You stopped the run yourself with vibe abort.\n\n## Pick a small, well-scoped task\n\nVibestrate works best on the kind of task you'd hand a careful colleague: clear scope, a part of the code you can point to, and a way to tell when it's done.\n\n**Too big** - \"Refactor the whole login system.\" No boundary, no finish line, and the reviewer has nothing to check the result against.\n\n**About right** - \"Add structured logging to the settings save handler.\" One handler, one behavior, and your existing tests say whether it worked.\n\n## Start the run\n\n```\nvibe run \"Add structured logging to the \\\nsettings save handler\"\n```\n\nTo watch it work as it goes, add `--ui`. The dashboard starts alongside the run, on port 4317 by default.\n\n```\nvibe run \"Add structured logging to the \\\nsettings save handler\" --ui\n```\n\n## What you'll see\n\n```\nFinal status: merge_ready\n  Review decision: APPROVED\n  Verification: PASSED\n  Artifacts: .vibestrate/runs/zen-bohr/artifacts\n  Worktree: /home/you/.vibestrate-worktrees/zen-bohr\n  Branch: vibestrate/zen-bohr\n```\n\n## Look at what it changed\n\n```\ncd ../.vibestrate-worktrees/zen-bohr\ngit diff main\n```"
    },
    {
      "id": "docs/getting-started/installation",
      "kind": "doc",
      "title": "Installation",
      "source": "Vibestrate docs: getting-started/installation",
      "summary": "Install Vibestrate and check your environment in two commands.",
      "titleTerms": "installat",
      "terms": "2 24 5 a add agent and artifact at attachment check cli cod coding-agent com command compos context creat crew curl doctor domain empty environment event every extra fil flow fs g get getting-start git githubusercontent gitignor got guyshonshon her hold http in init initializ install installat instruct is its js json least main markdown md metric newer next nod npm on one onto option or per pnpm policy profil project provider publish raw read requirement rol rul run s sh skill sl start stat that turn two until url vers vib vibestrat view what yml you your",
      "body": "Vibestrate needs **Node.js 24 or newer** and a git repository. Install the package globally, then run `vibe init` inside your project and `vibe doctor` to check the environment. It runs natively on macOS, Linux, and Windows. The one Windows-only exception is the in-app terminal tab - see Native Windows support.\n\n## Requirements\n\n- **Node.js 24 or newer.** Check with `node --version`. - **git 2.5 or newer.** Vibestrate creates and tears down worktrees, which need a modern git. - **npm or pnpm**, to install the package. - **At least one coding-agent CLI** on your PATH: Claude Code, Codex, Gemini, Aider, Ollama, OpenCode, or another supported provider. You can add one later, and `vibe doctor` tells you what is missing.\n\n## Install\n\n```\nnpm install -g vibestrate\n# or\npnpm add -g vibestrate\n```\n\n```\nurl=https://raw.githubusercontent.com/guyshonshon\ncurl -fsSL $url/vibestrate/main/install.sh | sh\n```\n\n```\nnpm view vibestrate versions     # what is published\nnpm install -g vibestrate@<version>\nvibe --version\n```\n\n## Initialize a project\n\n```\nvibe init\nvibe doctor\n```\n\n## What got created\n\n```\n.vibestrate/\n  project.yml  providers, profiles, crews\n               (roles), commands, policies\n  rules.md     project instructions agents\n               read on every turn\n  rules/       optional extra instruction\n               files, composed onto rules.md\n  roles/       one JSON role file per role,\n               holding its instructions\n  skills/      markdown attachments that add\n               domain context\n  flows/       your project's run Flows\n               (empty until you add one)\n  runs/        run state, artifacts, metrics,\n               events\n```\n\n```\n.vibestrate/runs/\n```"
    },
    {
      "id": "docs/getting-started/merging",
      "kind": "doc",
      "title": "Keep a change (Git and merging)",
      "source": "Vibestrate docs: getting-started/merging",
      "summary": "What Git is in one minute, and how to take a finished run from its safe copy into your real project.",
      "titleTerms": "a and chang git keep merg",
      "terms": "a advis advisor alway analyz and ask at best bold bold-lovelac branch cd chang checkout copy creat deterministic diff ff ff-only finish from get getting-start gh git going how id in integrat into is it its keep locally look lovelac main manu merg merge_ready minut on one only open or pr project pull ready real request run saf shar sourc start tak the to vib vibestrat vibestrate-worktre what why worktre your",
      "body": "A run never edits your project folder. It works in its own copy - a git worktree under `../.vibestrate-worktrees/`, on a branch named `vibestrate/` plus the run id - and stops at `merge_ready` with the change waiting on that branch. Folding it into `main` is the one step Vibestrate always leaves to you. New to Git? Start with the next section. Otherwise skip ahead to taking the change.\n\n## Git in one minute\n\nThree ideas are all you need.\n\n**A branch** is a parallel line of work. Your real code lives on a branch, usually `main`. A new change can grow on its own branch without disturbing `main`, until you decide to combine them.\n\n**A worktree** is a separate folder checked out to a branch. Every run gets its own, so the agent edits files there rather than in your project folder.\n\n**A merge** is folding one branch into another. Merging the run's branch into `main` is how a finished change becomes part of your project.\n\nRun ids are short docker-style handles like `bold-lovelace`, so that run's branch is `vibestrate/bold-lovelace`.\n\n## Look at what changed\n\nFrom the run's worktree, see every line it touched:\n\n```\ncd ../.vibestrate-worktrees/<runId>\ngit diff main\n```\n\nOr open the **Source** page in Mission Control, on its **Changes** tab, which shows the same diff file by file.\n\n## Ask the merge advisor\n\nYou don't have to judge the risk alone:\n\n```\nvibe integrate advise <runId>\n```\n\n## Take the change\n\n```\n# Open a pull request (best on a shared project)\ncd ../.vibestrate-worktrees/<runId>\ngh pr create\n\n# Or merge it into main locally\ngit checkout main\ngit merge --ff-only vibestrate/<runId>\n```"
    },
    {
      "id": "docs/getting-started/providers",
      "kind": "doc",
      "title": "Set up a provider",
      "source": "Vibestrate docs: getting-started/providers",
      "summary": "Tell Vibestrate which AI coding tools you have, then check each one can do the work.",
      "titleTerms": "a provider set up",
      "terms": "0 1 11434 127 4 4096 5 6 a ai aider alway an and anthropic anthropic_api_key api arg bas builder can challenger check choos claud claude-default claude-sonnet-4-6 cli cloud cod code_writ codex codex-default com command crew cross cross-model deeper default detect did do doe each env executor for found get getting-start going hav hold http http-api id implementer init internet is it json key liter liv loc localhost localhost-proxy machin max model nam never not ollama on one only or over own p path permiss profil project prompt provider proxy qwen3 read read_only ready referenc reviewer rol run seat see server set setup singl single-profil sonnet start stdin tell test the then they token tool tri typ up url v2 vers vib vibestrat what wher which with work writ yml you your",
      "body": "A **provider** is what actually runs the model. Vibestrate ships no model of its own, so at least one provider has to be configured before a Task can run. A provider is one of three kinds.\n\n**A coding CLI on your machine.** Claude Code, Codex CLI, Gemini CLI, OpenCode, Aider, Ollama, Qwen Code, Crush, Goose, Cursor CLI and Amp are recognised by name. Each handles its own authentication, by its own login or its own API-key variable.\n\n**A model API you hold the key for** (`http-api`). Anthropic or OpenAI wire format, over `https` only. The key is an environment reference like `env:ANTHROPIC_API_KEY`, never a literal in a file.\n\n**A model server on your own machine** (`localhost-proxy`). Ollama, LM Studio, vLLM. Loopback addresses only, so nothing leaves your computer, and no key is needed.\n\nA Role never names a provider. It points at a Profile, and the Profile names the provider - which is how two roles in one Crew end up on two different providers.\n\nSetting one up is two steps: tell Vibestrate it is there, then confirm it answers.\n\n## See what you have\n\n```\nvibe provider detect\n```\n\n```\n✓ Claude Code - ready\n  Command: claude (v2.1.4)\n  Default args: -p with prompt on stdin.\n\n○ Aider - not found\n  Command tried: aider\n  aider is not on PATH.\n```\n\n## Set it up and test it\n\n```\nvibe provider setup\n```\n\n```\nvibe provider test claude\nvibe provider test ollama\n```\n\n## Choose which one does the work\n\n```\nvibe provider set claude\n```\n\n```\nvibe run \"...\" --profile codex-default\n```"
    },
    {
      "id": "docs/getting-started/skills",
      "kind": "doc",
      "title": "Attach skills",
      "source": "Vibestrate docs: getting-started/skills",
      "summary": "A short note you hand an agent so it knows your codebase's rules before it starts.",
      "titleTerms": "attach skill",
      "terms": "2 a add agent an and are assign auth auth-convent balanc befor chang claud claude-balanc codebas convent cooky creat crew deeper default don enrollment error error-handl fa for from get getting-start go going hand handl http id inlin is it json know lax list lucia mcp md middlewar nam new not one only permiss planner profil project prompt read read_only requir review rol rout rul run s sam seat security security-review server sess short show sit skill skip so src start t thi thos to touch ts unassign under use vib vibestrat when worth writ yml you your",
      "body": "A **skill** is a markdown note that gets added to an agent's instructions before it starts work. Write it into `.vibestrate/skills/`, attach it to a role with `vibe skills assign`, and every run that seats that role reads it. It's how you teach an agent something about your project - how login works, the conventions you actually follow - once, instead of retyping it into every task. Think of it as the briefing you'd give a new contractor on their first day.\n\n## Write one\n\nA skill is a markdown file, in either of two shapes:\n\n.vibestrate/skills/ travels with your repo - prefer this one auth-conventions.md a flat file auth-conventions/SKILL.md a folder, and the only shape that can carry .mcp.json .claude/skills/ read too, if you already use Claude Code\n\n```\nThis codebase uses Lucia for sessions.\nWhen touching auth:\n\n- Don't create session middleware inline.\n  Use `requireSession` from `src/server/auth.ts`.\n- Cookies are HttpOnly and SameSite=lax.\n  Don't change those defaults.\n- New auth routes go under\n  `src/server/routes/auth/`.\n```\n\n## Hand it to an agent\n\n```\nvibe skills list\nvibe skills show auth-conventions\nvibe skills assign planner auth-conventions\nvibe skills unassign planner auth-conventions\n```\n\n```\ncrews:\n  default:\n    roles:\n      planner:\n        seats: [planner]\n        profile: claude-balanced\n        prompt: .vibestrate/roles/planner.json\n        permissions: read_only\n        skills: [auth-conventions, error-handling]\n```\n\n```\nvibe run \"Add 2FA enrollment\" \\\n  --skills auth-conventions,security-review\n```"
    },
    {
      "id": "docs/getting-started/welcome",
      "kind": "doc",
      "title": "The guided walkthrough",
      "source": "Vibestrate docs: getting-started/welcome",
      "summary": "A resumable, skippable tour through providers, crew, flows, and your first run.",
      "titleTerms": "guid the walkthrough",
      "terms": "a add and crew first flow from get getting-start go handler her if init initializ it json left log not off project provider re remember reset resumabl run sav set setup skippabl start stat structur the through to tour vib vibestrat walk welcom welcome-stat what wher yet yml you your",
      "body": "`vibe welcome` walks you through setup in four steps - providers, crew, flows, your first run - and remembers where you stopped, so you can quit and pick it up later. Every step is skippable, and `--reset` starts the tour over. It needs an interactive terminal: in a script or CI it prints the equivalent commands and exits without changing anything.\n\n```\nvibe welcome\n```\n\nIt is the guided version of the setup you would otherwise do by hand. Nothing here does anything new - it's a thin sequencer over `vibe provider setup`, the crew presets, and the same commands documented elsewhere in these pages.\n\n## What it walks through\n\n- **Providers** - pick the coding CLI behind the work; reuses `vibe provider setup`. - **Crew** - optionally install a ready-made crew (Fast, Thorough, Cheap, or Local), or skip and build your own later. - **Flows** - how to list the flows you already have, and how to install more from the flows hub. - **Your first run** - a worked task to try next.\n\nEach step opens with a short explanation, then asks: continue, skip, or quit. Nothing is forced - skip anything you already know.\n\n## It remembers where you left off\n\nQuit partway through and `vibe welcome` picks up at the first step you haven't finished.\n\nproviders crew flows first run done done picks up here\n\nProgress is saved to `.vibestrate/welcome-state.json` - a small, disposable file that only tracks which steps you've been through. Deleting it, or running `--reset`, never touches your provider, crew, or flow configuration. Those changes live in `project.yml` as usual, and stay put.\n\n```\nvibe welcome --reset\n```\n\n## If you're not initialized yet\n\n```\nvibe init\nvibe welcome\n```\n\n## Where to go from here\n\n```\nvibe run \"Add structured logging to the \\\nsettings save handler\"\n```"
    },
    {
      "id": "docs/getting-started/why-a-human",
      "kind": "doc",
      "title": "Why a human stays in the loop",
      "source": "Vibestrate docs: getting-started/why-a-human",
      "summary": "AI is fast, but it guesses and it agrees with you. Vibestrate proves the work before a person makes the final call.",
      "titleTerms": "a human in loop stay the why",
      "terms": "3 a add address agre ai alongsid and approv ask assuranc at balanc befor bold bold-lovelac branch but buy call caveat challenger claud claude-balanc cod codex codex-review confidenc consult cover crew cross cross-model default did engineer error fast fin fix flag for fresh get getting-start glanc going guess handler honest human in init install instead is it its json keep label lovelac mak medium merg merge_ready model no not object of on only own pass permiss person policy problem profil project prompt prov provider re re-validat read read_only ready return review reviewer rol run runtim seat second set setup singl single-profil skill so staff staff-engineer start step supervisor swallow test the thi to turn typ unproven validat verifi verificat vib vibestrat was what why why-a-human with work writ yml you",
      "body": "AI can write code you could not write yourself - a security fix, a piece of WebGL you have never touched, a database migration. The catch: the same AI also makes things up, and it tends to agree with whatever you said. Trusting it blind is how bad code ships.\n\n**The honest problem.** An AI model is a confident guesser. It will invent a function that does not exist, miss an edge case, or hide a bug instead of fixing it, then tell you it is done - because agreeing is what a chat assistant is built to do. None of that is malice. It is what a model is.\n\nVibestrate is built to catch that instead of trusting it. A run plans, builds, then reviews and verifies in separate steps that start from fresh context. It runs your real tests and validation commands against the result, so \"it looks done\" is not enough. And it never gets ahead of you: work happens in a throwaway copy of your project and the run stops at `merge_ready` instead of pushing or merging on your behalf - see the safety guarantees. You read the diff, or let the merge advisor flag the risks, and you decide.\n\nmerge_ready the run decides you decide plan, write, validate, review, verify keep the change, or drop it\n\nOne part of that is not on by default.\n\n**A fresh install reviews its own work.** `vibe init` writes six roles that all point at one Profile on one provider, so the reviewer starts out as the same model as the builder. Reading a change with fresh context still catches real mistakes, but a model checking itself can only lower confidence, never raise it. Every run says which one it got: `single-profile` or `cross-model`.\n\nTwo steps make the review genuinely independent: add a Profile on a second provider (`vibe profile add codex-review --provider codex`), then point the Reviewer role at it."
    },
    {
      "id": "docs/getting-started/windows",
      "kind": "doc",
      "title": "Native Windows support",
      "source": "Vibestrate docs: getting-started/windows",
      "summary": "Vibestrate runs the full core loop natively on Windows - install, providers, runs, diffs, and merge - with PowerShell or cmd and no WSL. The one exception is the in-app terminal tab.",
      "titleTerms": "nativ support window",
      "terms": "after and app claud cmd cor diff docker doctor except full g get getting-start her in in-app init inst install is isolat loop merg natively next no not npm on one or power provider ps1 recogniz right run shell start tab termin the vers vib vibestrat window with wsl",
      "body": "Vibestrate runs natively on Windows, with no WSL. The full core loop works on a plain Windows machine in PowerShell or cmd: install the CLI, configure providers, run tasks, review diffs, and merge. Exactly one feature is excluded - the in-app terminal tab is built on a POSIX shell, so on native Windows it is turned off with a note pointing here. Run Vibestrate under WSL if you want an in-app shell. Everything else, including every part of the core loop, works natively.\n\n```\nnpm install -g vibestrate\nvibe --version\n```\n\nFrom there the workflow is identical to every other platform. Run `vibe init` in a git repository, then `vibe doctor` to check your environment, then `vibe run` to start a task. The Installation and Your first run pages apply as written, Node 24 requirement included.\n\n## Providers on Windows\n\nClaude Code, Codex, and Gemini all run natively on Windows once their CLIs are installed with npm. Vibestrate runs their provider commands the same way it does on macOS and Linux.\n\nThe longer list of providers varies tool by tool - some are still POSIX-only. `vibe doctor` flags any provider it cannot find or run, so you know where each one stands rather than discovering it mid-run.\n\n**\"`claude` is not recognized\" right after installing?** This is almost always Windows, not Vibestrate. Either the new npm global bin directory is not on your PATH yet (open a fresh terminal so the updated PATH loads), or PowerShell's execution policy is blocking the `.cmd`/`.ps1` shim. Fix the PATH or the execution policy, confirm the provider runs on its own (`claude --version`), then run `vibe doctor` again."
    },
    {
      "id": "docs/glossary",
      "kind": "doc",
      "title": "Glossary",
      "source": "Vibestrate docs: glossary",
      "summary": "Plain-language definitions for the words you'll meet across these docs.",
      "titleTerms": "glossary",
      "terms": "1 2 3 a abort across act add adopt advisory all annotat api apply approv approval-gat archiv artifact assert assist at backend block board branch broker by chang checklist claud cli clos cloud cod code_writ column command complet conductor config consult container context context-fil context-url continuou control creat crew dedicat default defin definit deny detect dir doc docker don effort endpoint enhanc every execut export fail fals fil flow for gat git glossary health high http http-api human human_approv human_review id implementer in in-progress in_progress init instruct integrat into invariant isolat item json kind label languag ledger list ll loc local-worktre localhost localhost-proxy low machin main max md medium meet merg merge_ready miss mod model navigator ndjson need only open operat orchestrator overview panel param parameter patch pend permiss persona phas pick pick-up pickup plain plain-languag plan policy ponytail power preview profil progress project project-param propo propos provider proxy read read-only read_only ready reject remov replay request request-chang requir require_approv resum return review roadmap rol root rout rul run seat secret segment sequenc sequentially server set skill sourc spec spec-up spend stag start stat statu step step-by-step stop supervis supervisor task telemetry termin test the thes trac transit tru ts ui up url usd validat vib vibestrat wait waiting_for_approv word workflow workspac worktre writ x yml you",
      "body": "Short, plain definitions for the words Vibestrate's docs use.\n\n**Action Broker.** The one checkpoint every real effect has to pass through, whether that's starting a provider, running a command, or writing a file. For each effect it decides allow, deny, or ask a human first, then writes down what it decided and why in an `actions.ndjson` in that run's folder under `.vibestrate/runs/`. This is where **Policy** actually gets enforced in the running code. It is default-allow with a policy veto - an effect nobody wrote a rule about proceeds - so it's where you impose limits, not a whitelist you have to satisfy. See Safety.\n\n**Crew.** Your local team of Roles. A run uses one Crew - the one named by `defaultCrew` in `project.yml` unless you pass another - and matches the Flow's Seats to the Roles in it. See Crew.\n\n**Role.** One teammate inside a Crew. It carries instructions (a prompt), permissions, skills, the Profile it runs on, and the Seats it's allowed to fill. See Role.\n\n**Seat.** A spot a Flow step needs someone in (for example `implementer`). It's a request the Crew answers with a Role whose `seats` list includes that seat. See Seat.\n\n**Profile.** How strong and how expensive a Role runs: its provider, model, power, and timeout. Power is specific to each provider. See Profile.\n\n**Approval gate.** A spot where Vibestrate stops and waits for a person to say yes before going on. Three things can raise one: a stage listed under `policies.requireApprovalAtStages` (which fires once per run, on the first pass through that stage), a step of `kind: approval-gate` inside a Flow, or an agent emitting `HUMAN_APPROVAL: REQUIRED` in its own output. The run sits at `waiting_for_approval` until `vibe approvals approve`, `reject`, or `request-changes`.\n\n**Context source.** A file \n…"
    },
    {
      "id": "docs/index",
      "kind": "doc",
      "title": "Vibestrate docs",
      "source": "Vibestrate docs: index",
      "summary": "Vibestrate is where your AI coding agents work together - one shared plan, one set of rules, one record. It runs the CLIs you already have and leaves the final call to you.",
      "titleTerms": "doc vibestrat",
      "terms": "a add add-skill advisor agent ai already an and api ask audit boundary call can chatbot cli cod concept context context-url crew detail different doc end environment extend fin flow fully git hav her http http-api in index is it leav link log look machin mak many model modul nod node_modul not of off on one own plan point record referenc rul run sentenc set shar skill start supervisor task the to together understand up url venv vib vibestrat what wher work worktre you your",
      "body": "You already have the models. What you do not have is a way to put several of them on one task without doing the logistics by hand: pasting the same context into each tool, keeping a spare checkout so a risky change cannot hurt you, carrying one model's output into the next one's prompt, and noticing when they quietly drift apart.\n\nVibestrate is the frame they work inside. One plan, your rules, the gates you chose, one record of what happened. It drives the coding CLIs already installed on your machine, and the final call stays yours - see why a human stays in the loop.\n\nyour task plan build review verify your call a worktree on its own branch\n\nA recorded run: eight steps across five seats, a model that hits a rate limit and falls back to a backup, and the diff it produced.\n\nA run works in a separate git worktree on its own branch, so it never edits your working tree. It never pushes and never merges. Every prompt, output, and decision is written under `.vibestrate/runs/`, one folder per run. The run then stops at one of four outcomes and hands the decision back to you:\n\nmerge_ready The change is finished and waiting for your call. blocked The reviewer or verifier found something you should decide. failed Something broke mid-run. aborted You stopped the run yourself.\n\n**Where the worktree boundary ends.** `node_modules`, `.venv` and `venv` are symlinked from your project into the worktree, so your tests can actually run there. An agent with write permission can write back through those links into your project's installed dependencies. It never reaches your tracked source, and `git.linkEnvironment: off` turns the links off."
    },
    {
      "id": "docs/task-lifecycle",
      "kind": "doc",
      "title": "Task lifecycle",
      "source": "Vibestrate docs: task-lifecycle",
      "summary": "How a task moves through statuses, with the fix loop and the approval gates.",
      "titleTerms": "lifecycl task",
      "terms": "a abort act and answer append append-only approv architect artifact ask at block broker budget can chang changes_request com creat current decid deeper disk event every execut fail find finding-respon fix fixer flow for gat going happy has hold how human human_approv id it json leav lifecycl loop max md merg merge_ready mov ndjson need on only output path paus plan policy prompt re re-run ready repli request requir respon rest result resum review reviewer run see sent stag stat statu step step-id task task-lifecycl the through to transit until validat validation-result verdict verify vib vibestrat wait waiting_for_approv was what when wher with workflow you your yourself",
      "body": "Every task moves through a fixed sequence of statuses, and Vibestrate won't let it skip a step or jump backward. Think of it like a package working through delivery: it goes through sorted, in transit, and out for delivery in order, and each scan tells you exactly where it is right now.\n\nIt comes to rest in one of four places, and which one is the whole answer to \"what do I do next\":\n\nmerge_ready The diff passed. Read it, then merge it or drop it. blocked Review or verification says stop. Read the findings. failed An error broke a stage mid-run. aborted You ran vibe abort. The worktree is kept.\n\n## The happy path\n\nWhen nothing goes wrong, a task walks through every status once and finishes ready to merge.\n\nThe full status sequence, in order:\n\n```\ncreated → planning → planned\n  → architecting → architected\n  → executing → validating\n  → reviewing → verifying → merge_ready\n```\n\nA successful run touches every non-terminal status once, lands in `merge_ready`, and leaves a diff on the worktree branch.\n\n## When the reviewer asks for changes\n\nThe review step can send work back. When it does, the task drops into `fixing`, runs validation again, and returns to `reviewing` instead of moving on.\n\n## What a run leaves on disk\n\n```\n.vibestrate/runs/<runId>/\n  state.json        current status, transitions\n  events.ndjson     every event, append-only\n  actions.ndjson    brokered actions + verdicts\n  artifacts/flows/\n    <step-id>/prompt.md    what it was sent\n    <step-id>/output.md    what it replied\n    <step-id>/validation-results.json\n    findings.json          reviewer findings\n    finding-responses.json how the fixer answered\n```"
    },
    {
      "id": "docs/troubleshooting",
      "kind": "doc",
      "title": "Troubleshooting",
      "source": "Vibestrate docs: troubleshooting",
      "summary": "Concrete fixes for the issues people actually hit.",
      "titleTerms": "troubleshoot",
      "terms": "a abort actually add after ai aider aider-install an and answer anthropic anthropic-ai anthropic_api_key api approv arriv artifact at bashrc befor behind bin blank block branch but catalog cd chang check claud claude-cod clean cli cod codex com command commit concret config consult could creat curl cwd d dashboard detect detected-needs-setup didn doctor doe effort effort_ignor fail fals finish fix flow for found fs g gateway gemini gemini-cli get git googl got guidanc has hav hit http i id ignor in init initi insid inst install instead is is-inside-work-tre issu it key left level list login m main md miss need never next no not noth notificat npm of ollama openai openai_api_key operat or output panel pars pass path paus peopl pip plu pnpm policy power prefix project provider push python ready real reason reject remov repository request request-chang requir resum rev rev-pars right run say set setup sh sl stag stall start stash statu step step-id stop stuck supervisor t tab test that the them then to tre troubleshoot tru typecheck ui uncommit unexpect up validat vers vib vibestrat vibestrate-worktre wait waiting_for_approv was which with won work worktre yml your your-project yourself zshrc",
      "body": "Find the symptom that matches yours below, then run the fix. Read the failure message first - most now name themselves: a failed supervisor turn gives its reason, a cut-short one says it was stopped, and an effort level your provider does not have is refused with that provider's real ladder in the message.\n\n**Start with `vibe doctor`.** It checks your install, your providers and your config in one pass, and most fixes below begin from what it reports.\n\n### `vibe: command not found` right after installing\n\n```\nnpm config get prefix\n# then add <prefix>/bin to your PATH\n# in ~/.zshrc or ~/.bashrc\n```\n\n### `vibe init` says \"not a git repository\"\n\n```\ngit init\ngit add -A && git commit -m \"Initial commit\"\nvibe init\n```\n\n### `vibe doctor` says \"no providers ready\"\n\n```\nnpm install -g @anthropic-ai/claude-code\nnpm install -g @openai/codex\nnpm install -g @google/gemini-cli\npython -m pip install aider-install && aider-install\ncurl -fsSL https://ollama.com/install.sh | sh\n```\n\n```\nvibe provider detect\nvibe provider setup\nvibe provider test <id>\n```\n\n### The test passes, but real runs fail with \"unexpected output\"\n\n```\nvibe provider setup\n```"
    },
    {
      "id": "docs/workflows/create-and-run",
      "kind": "doc",
      "title": "Create and run a task",
      "source": "Vibestrate docs: workflows/create-and-run",
      "summary": "Go from a thing you need done to a finished change you can merge.",
      "titleTerms": "a and creat run task",
      "terms": "1 2 25 3 4 5 50 a abort add advis advisor alongsid analyz and arbitrat artifact audit away behind block branch by can cd chang checkout config creat create-and-run dashboard deeper default different don every fail ff ff-only fil finish finish-now first flow for fram from gh git go good heavier human id inspect integrat is it json just key lib list log logger main md merg merge_ready model need now oldest on one only or output path pr preserv profil project protect push quality quality-arbitrat re read read-only ready relat remov replay resolv resolve-first result review rout run server set shar sourc src stag stage-on-integration-branch start statu suggest task termin than the thi thing to touch tru ts ui vib vibestrat vibestrate-worktre walk watch weak when workflow worktre yml you yourself",
      "body": "This guide takes you from \"I have a thing to do\" all the way to a change you can merge, step by step.\n\nOne command starts the run. Vibestrate plans, writes, validates, reviews and verifies the change on its own, in a copy of your project, then stops and hands you the diff. It never pushes and never merges - the last call is yours.\n\nA run finishes in one of four terminal states: `merge_ready`, `blocked`, `failed` or `aborted`.\n\n## 1. Frame the task\n\nWrite the task description the way you'd brief a careful colleague. Name the file, name the convention, name the constraint. The more exact you are, the better the result.\n\n> **Good.** Add audit logging to the settings save handler at `src/server/routes/settings.ts`. Use the existing `auditLogger` from `src/lib/audit.ts`. Log the user id and the *keys* changed - never the values.\n\n## 2. Start the run\n\n```\nvibe run \"Add audit logging to the settings...\"\n```\n\n```\n# dashboard alongside the terminal\nvibe run \"...\" --ui\n\n# a heavier flow than the default\nvibe run \"...\" --flow quality-arbitration\n\n# a different model for this run\nvibe run \"...\" --profile <id>\n```\n\n## 4. Inspect the result\n\n```\nvibe status            # every run, oldest first\nvibe replay <runId>    # read-only, one run\n```\n\n## 5. Merge it yourself\n\n```\nvibe integrate advise <runId>\n```\n\n```\nmerge:\n  advisor:\n    suggestIntegrationBranchWhen:\n      filesTouched: 25\n      protectedPaths: true\n      behindMain: 50\n```\n\n```\ncd ../.vibestrate-worktrees/<runId>\ngh pr create      # review by a human\ngit push          # just share the branch\n```\n\n```\ngit checkout main\ngit merge --ff-only vibestrate/<runId>\n```\n\n```\nvibe abort <runId>\n# the worktree is preserved for inspection;\n# remove it when you're done\n```"
    },
    {
      "id": "docs/workflows/debug-failed",
      "kind": "doc",
      "title": "Debug a failed run",
      "source": "Vibestrate docs: workflows/debug-failed",
      "summary": "How to figure out why a run ended in failed or blocked, and what to do next.",
      "titleTerms": "a debug fail run",
      "terms": "20 a after and api architect architectur artifact authenticat block bug cd chang clean cod command creat debug debug-fail decis diff do doesn drop dry dry-run earlier end event every execut exist fail figur fil first fix flow from get git housekeep how id if in instead is it json just keep list main md miss ndjson new newest next not noth of old or orphan out output over per per-phas permiss phas plan post preview project provider prun re re-run ref referenc relat replay requir restart restor restore-preview resum resume-from resume-stag retent reus review rewind rul run s sam scop seed sharpen skill snapshot sourc stag start stat statu stderr stdout step step-id t task teach test the thi tighten to unsaf validat verificat verify vib vibestrat what when why with without workflow worktre y yml",
      "body": "When a task doesn't finish cleanly, this guide helps you find out why and decide what to do about it.\n\nA run can stop short for two different reasons. They feel similar, but they call for different responses: `failed` is a crash, `blocked` is a decision. One needs a fix; the other needs a call from you.\n\nthe run stopped short failed blocked output.md review/output.md a crash - something to fix a decision - your call in the failing step's folder the reviewer's findings\n\nEither way the evidence is already on disk, under `.vibestrate/runs/` in your project. `events.ndjson` says what happened and in what order, and each step's own folder under `artifacts/flows/` holds the prompt it was given and the answer it gave back. Nothing is deleted when a run stops.\n\nYou rarely have to start from zero after a fix. A rewind reuses a finished run's earlier work and picks up from the stage you name, so a bad implementation does not cost you the planning again.\n\n## Start with `replay`\n\n```\nvibe replay <runId>\n```\n\n## Re-run after fixing\n\n```\ncd .vibestrate/runs\ndiff <oldRunId>/artifacts/flows/plan/output.md \\\n     <newRunId>/artifacts/flows/plan/output.md\n```\n\n## Rewind instead of restarting\n\n```\n# executing     reuse plan + architecture\n# architecting  reuse just the plan\n# planning      seed nothing, start over\nvibe run \"<same task>\" --resume-from <oldRunId> \\\n  --resume-stage executing\n```\n\n### Rewinding to review, fix, or verify (restores the run's code)\n\n```\nvibe run \"<same task>\" --resume-from <oldRunId> \\\n  --resume-stage reviewing --preview\n```"
    },
    {
      "id": "docs/workflows/git-tree-merge",
      "kind": "doc",
      "title": "Merge from the git tree",
      "source": "Vibestrate docs: workflows/git-tree-merge",
      "summary": "Explore your branches as a graph, predict a merge before you apply it, let the supervisor resolve conflicts, and undo with one click.",
      "titleTerms": "from git merg the tre",
      "terms": "a add already and api apply as ask befor branch chang clean click commit conflict dat do doe down env every explor ff fil git git-tree-merg graph guid head her history if inspect integrat it last let main merg mind mov never no no-ff not of one open or path predict propos push redact remov resolv see shap sourc supervisor target the to token tre ui undo up vib vibestrat vibestrate_api_token what whol with workflow you your",
      "body": "When you want to fold one branch into another - a finished run's branch into `main`, or two pieces of work together - the **Git tree** turns it into something you can see and reverse. It is the interactive, any-node-to-any-node evolution of the merge advisor: the same safety model, but you drive it from a graph instead of a list.\n\nOpen it from the **Source** page's **Tree** tab. Nothing on this page touches a real branch until you click Apply.\n\nEvery prediction runs in a throwaway worktree, so it can tell you one of three things - clean, already up to date, or the exact files that would conflict - without touching either branch. Apply then merges for real with `--no-ff`, on the target branch only. It never moves your HEAD and never pushes, and **Undo last merge** puts the branch back on the sha it recorded before merging.\n\nOn a conflict you can ask the supervisor to propose a resolution. It stays a proposal: you review ours / theirs / proposed and edit before anything is written, and applying it is your click. A file whose path looks secret-like, a `.env` or a key file, is refused outright and never reaches a provider, and conflict text is redacted of secret-shaped tokens before it is sent.\n\nMerging from the dashboard needs `VIBESTRATE_API_TOKEN` set on the `vibe ui` process. A local API with no token is reachable by any process on your machine, so the write actions stay behind a bearer token."
    },
    {
      "id": "docs/workflows/inspect-progress",
      "kind": "doc",
      "title": "Inspect a run in flight",
      "source": "Vibestrate docs: workflows/inspect-progress",
      "summary": "Where to watch a run as it happens, and where every detail is saved.",
      "titleTerms": "a flight in inspect run",
      "terms": "a act and append append-only artifact as bold bold-lovelac broker chang cod command cost creat current dashboard decis deni detail disk durat event every execut exit fil flow follow for happen id inspect inspect-progress is it jq json liv log lovelac main md merg merge_ready messag metric n ndjson new on one only open output participant past per plan profil progress prompt provider r raw read ready relat replay resolv respons result review rol run runtim runtime-metric s sav seat select snapshot sourc stat statu stderr stdout step step-id stream termin the thi timelin to token transit txt typ ui validat validation-result verdict verificat verify vib vibestrat watch wher workflow",
      "body": "When Vibestrate is doing work for you, you can watch it as it goes. There are three places to look: the terminal for a quick glance while it runs, the dashboard for the full live picture, and the files on disk for the complete record you can read back at any time.\n\nEverything a run does is written under `.vibestrate/runs/` as it happens, and `events.ndjson` is the file to trust. One JSON line per event, only ever appended to, so it is the honest record of what happened even when you were not watching.\n\nthe terminal the dashboard files on disk vibe logs --follow vibe run --ui .vibestrate/runs/ one run a quick glance while it runs the full live picture the complete record\n\n## The terminal\n\n```\nvibe logs <runId> --follow\n```\n\n## The files on disk\n\n```\n.vibestrate/runs/bold-lovelace/\n  state.json            current status, transitions\n  events.ndjson         every event, append-only\n  actions.ndjson        brokered action + verdict\n  runtime-metrics.json  tokens, durations, costs\n  flow.json             the resolved flow snapshot\n  participants.json     role + profile per seat\n  streams/              raw provider output\n  artifacts/flows/<step-id>/\n```\n\n```\nartifacts/flows/<step-id>/\n  prompt.md                the prompt for this step\n  output.md                the provider's response\n  validation-results.json  commands run + exit codes\n  validation/              one file per command\n    <n>-<command>.stdout.txt\n    <n>-<command>.stderr.txt\n```\n\n```\njq -r 'select(.type==\"state.changed\").message' \\\n  .vibestrate/runs/bold-lovelace/events.ndjson\n```\n\n```\ncreated → planning\nplanning → planned\n...\nverifying → merge_ready\n```\n\n## Read past runs\n\n```\nvibe replay <runId>\n```"
    },
    {
      "id": "docs/workflows/pause-resume",
      "kind": "doc",
      "title": "Pause, resume, abort",
      "source": "Vibestrate docs: workflows/pause-resume",
      "summary": "How to safely stop a run, bring it back later, or end it for good.",
      "titleTerms": "abort paus resum",
      "terms": "a abort approv are at back befor block branch bring cancel cd chang d different end fir for from gat git good guidanc how human human_approv id it later let list max next or pau paus pause-resum policy policy-gat project reject remov request request-chang requir resum resume-from round run safely stag statu stop to vib vibestrat vibestrate-worktre vs wait waiting_for_approv what when workflow worktre your your-project",
      "body": "Sometimes you want to stop a run, look at where it got to, and pick it back up later. Pausing does exactly that, and it sticks: the flag is written to your project, not held in memory, so it survives anything restarting.\n\nThere are three things you can do to a running run: pause it, resume it, or abort it. Only `vibe abort` is final, and even that keeps the run's worktree on disk for you to read. `vibe pause` and `vibe resume` just set a flag - the process doing the work is what reads it, so neither one starts or stops anything by itself. If that process is gone, clearing the flag will not bring it back.\n\nA run that stops itself at a policy gate is a different thing, and `vibe resume` will not move it. Its status is `waiting_for_approval`, and the command that decides it is `vibe approvals`.\n\npaused vibe resume waiting_for_approval vibe approvals you asked for it clears the flag a policy gate stopped it approve, reject, or send guidance\n\n## Pause\n\nTo pause a run, give Vibestrate the run's ID:\n\n```\nvibe pause <runId>\n```\n\nVibestrate works in stages and checks for the flag between them. When it spots one, it moves the run to the `paused` state and writes down which stage it was about to start. Nothing gets cut off halfway.\n\n## Resume\n\nTo pick the run back up:\n\n```\nvibe resume <runId>\n```\n\n## Abort\n\n```\nvibe abort <runId>\n```\n\n```\ncd your-project\ngit worktree remove ../.vibestrate-worktrees/<runId>\ngit branch -D vibestrate/<runId>\n```\n\n## Policy-gated pauses are different\n\n```\nvibe approvals list <runId>\nvibe approvals approve <runId> <approvalId>\nvibe approvals reject <runId> <approvalId>\nvibe approvals request-changes \\\n  <runId> <approvalId> --guidance \"what to change\"\n```"
    }
  ]
};

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
  "lexicon": "12 127 20 24 40 40-58 4317 512 58 abort absenc abstract accept acceptanc access across act activ activity adaptiv add-flow add-provider add-skill additiv address adopt advanc advi advic advisor advisory afterward against agent ahead aider aim allow allowlist already alway amp analysi analyz analyze-risk analyze-test anchor annotat another answer anti anti-pattern anyth anywher api apply apply-only approv arbiter arbitrat archetyp architect architectur archiv arg array artifact ask assist assuranc attach attachment attend audit auth authenticat author authz auto auto-pick auto-retri automat automatabl autonomy availabl backend backoff banner bas behind beyond big big-pictur bind bit block blocker board bound boundary branch brief broker brow browser budget builder built built-in bundl button cam cannot cap cap-and-continu capability car card careful catalog caveat cd ceil challeng challenge-respons challenger cheap checklist checkout checkpoint chosen ci claim claud claude-cod clean cleanly clearer cli clo clock cloud cmd co codeba codebas codex coding-agent com command comment commit complet concept conci concurrency concurrent conductor confidenc config configur configurabl configurat confinement confirm conflict connect connector constraint consult container content context continu continuou contract control control-character convent conversat copy cor correctness cost cover coverag create-and-run credenti crew criteria cross cross-vendor crush ctrl ctrl-k curat current cursor custom customiz daemon daily dashboard debug-fail deci decid decis decision-summary decomposit dedicat deep deeper definit delay deliberately demand depend dependency deriv derived-flow destinat detach detail detect deterministic diff differ different directory-map disk dismiss distinct doc doctor documentat doesn dollar domain draft driv drop dry dry-run duplicat dur eaddrinu earlier editor effort egress els email enabl end enforc enforcement engin enhanc enough enter entirely entry environment ephemer esc escalat estimat event everyth evidenc execut executor exhaust exist exit explain explicit export express extend extern fail-clo fallback family fast featur feel fenc fetch fewer field fil filesystem filter fin find finish finish-now first first-run fixer flag flaky flat flight flow forbid forc fork form found fram fresh full gap gat gateway gemini gener generat getting-start git git-tree-merg glob glossary go good goos got graph gt guard guid halt hand handoff hard harden head heavier hero high hint history hol hold hom honest host hou http http-api hub human id ids imag implement implementat implementation-review implementer impossibl improv in-app in-progress inactivity index info inherit init initiali initializ inject inlin input insid inspect inspect-progress inspector inst installat instruct intak integrat interactiv invariant isolat item itself jira json judgment jump key kind know knowledg last layout learn least leav ledger leg legibility len lesson library lifecycl limit link listen liv loc localhost localhost-proxy log look loop loopback lt machin mad main manually map markdown matcher materi matter max mcp md ment merg merge-ready merge_ready messag methodology metric micro micro-plan midway min minimalism minut mod model mov ms narrow nativ navigat ndjson network never newer next noth notif notificat noun objectiv offlin ollama onc opencod operat opt-in orchestrator order os otherwi outcom outsid over-stuf overview overwrit owner owner-only packet panel panel-review param parameter parent part pass past patch path pattern pau paus pause-resum pct per per-part per-pha permanently permiss persona pha pick pick-up pickup pickup-analysi pickup-review pictur pid plain plan plan-only plan-review planner plausibl plausible-but-wrong plu point policy ponytail popular portabl positiv post post-turn postur predict prefix preserv preset press preview proc profil progress project project-param prompt propo protect prototyp prov provider provider-auth provider-nativ proxy prun publish pull push quality quality-arbitrat quest queu quick quickstart quot quota qwen rat rather re re-check re-read re-run re-sequenc re-validat reach read-only readonly ready real really reason reboot recent recogniz recommend recommendat record recoverabl red redact redo refer referenc refin refresh refu register reject remember remot renam reopen reorder repeat replac replay replayabl repo report repository request requir research resilienc resolv resolve-first respect respons restart restat restor resum retent retri retry retyp reu reus revalidat reversibl review review-authz review-correctness review-inject review-item review-risk review-secret review-security-risk review-test reviewer rewind right risk risky roadmap rol room root round rout rul run runtim saf safety saga sandbox say scaffold scan scheduler schema scop scor seat second-review secret secret-scan security security-review seed select separat sequenc servic sess setup sever shap shar sharpen shell shift simplify skill skip slower smaller smarter snapshot snippet someon someth sourc sovereignty spawn spec spec-up spec-up-intak spec-up-review spec-up-roadmap spend split squar src sse ssrf stag stage-on-integration-branch stall standard stat statu stay steer step step-by-step stor strict stricter strong stuck stuf styl subcommand submit subscript subsystem suggest suit summary supers supervi supervis supervised-task supervisor supervisor-control surfac swap sweep switch synthesiz tab taken taker target task task-lifecycl teach team telemetry tell termin test thorough thr threshold throw tighten timelin timeout tip titl token touch tour transient tre troubleshoot try ts tun turn twic two ui unassign unattend unavailabl uncommit undo uneven uniqu unprotect unsaf until upload url usag usd validat vendor verb verbatim verificat verifier verify vib vibestrat vibestrate-md vibestrate_param visibl vocabulary wait waiting_for_approv walk walkthrough wall warn watch watchdog weak week welcom whether whichever whol why-a-human window without workflow workspac worktr worktre wrot yaml yet yml yourself zero zero-egress",
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
      "body": "```text\nvibe crew - List crews, show a crew's roles, and set the default (\"active\") crew.\n  vibe crew list [--json] - List configured crews (the default is marked).\n  vibe crew show [--json] - Show a crew's roles, profiles, and seats (default crew if omitted).\n  vibe crew use - Set the default (\"active\") crew - runs without --crew use it.\n  vibe crew draft [--yaml --json] - Turn an English description into an editable Crew draft (supervisor-assisted). Draft only - never writes; adopting it means saving the printed role files, then the block, into project.yml.\n  vibe crew presets - Ready-made crews (fast / thorough / cheap / local) tuned by provider effort.\n    vibe crew presets list [--json] - List available presets and whether they're installed.\n    vibe crew presets add - Install a preset crew (fast / thorough / cheap / local) into project.yml.\n```"
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
      "terms": "allow allow-token-to-custom-host and arbitrat bas base-url built built-in clear crew custom deriv draft export export-arbitrat fil flow from handl host hub id import ins inspect install json list max max-unit nam out overwrit publish recip risk run show suggest to token unit url use vers vib vibestrat yaml yes",
      "body": "```text\nvibe flows - List and inspect Flow run recipes from built-ins and .vibestrate/flows.\n  vibe flows list [--json] - Show every discovered Flow.\n  vibe flows show [--json --crew] - Print a Flow's seats, ordered steps, and crew seat-coverage.\n  vibe flows use [--clear] - Set the default Flow applied to runs without --flow (always shown), or --clear it.\n  vibe flows suggest [--file --risk --json] - Suggest a Flow from task risk signals and local Flow outcomes.\n  vibe flows draft [--crew --yaml --json] - Turn an English description into an editable Flow draft (supervisor-assisted). Draft only - never writes; adopt it with `flows import`.\n  vibe flows derive [--id --max-units --crew --yaml --json] - Build a Flow around a specific task: a shaping turn decomposes the work, deterministic code compiles the graph. Draft only - never writes; adopt it with `flows import`.\n  vibe flows export [--out --json] - Export a Flow as canonical YAML (for sharing / backup).\n  vibe flows import [--overwrite --json] - Import a Flow from a local file path or an http(s) URL into .vibestrate/flows/.\n  vibe flows export-arbitration [--out] - Export a Quality Arbitration run as local JSON evidence for later evaluation.\n  vibe flows hub - Browse + install Flows from the community hub (vibestrate.com/api/hub).\n    vibe flows hub list [--base-url --json] - List (or search) Flows in the hub.\n    vibe flows hub install [--base-url --overwrite] - Pull + verify + install a hub Flow (by ref) into .vibestrate/flows/.\n    vibe flows hub publish [--version --name --handle --base-url --allow-token-to-custom-host --yes --json] - Publish a project flow to the hub (public, immutable).\n```"
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
      "terms": "a advis analyz apply branch confirm dedicat finish integrat into json list main merg merge-ready never pr preview push ready run vib",
      "body": "```text\nvibe integrate - Preview + integrate merge-ready run branches into a dedicated branch (never main, never push).\n  vibe integrate list - List merge-ready runs (integration candidates).\n  vibe integrate preview - Dry-run merge the selected (or all) merge-ready branches; show conflicts.\n  vibe integrate advise [--json] - Read-only merge advice for the selected (or all) merge-ready runs: risk flags, assurance lanes, topology, dry-run conflicts, and a deterministic recommendation. Mutates nothing.\n  vibe integrate pr [--json] - Prepare a pull request for a run: writes the body from the run's own record and prints the `gh pr create` line. Vibestrate never pushes - you run it.\n  vibe integrate analyze [--json] - Optional read-only LLM pass over the run's redacted diff vs main: semantic risk narrative (never a merge verdict). Spawns a local provider; caches markdown under the run.\n  vibe integrate apply [--into] - Integrate the selected (or all) merge-ready branches into --into <branch>.\n  vibe integrate finish [--confirm] - Merge a complete, clean integration branch into main - locally, with explicit confirmation, never pushed. Refuses partial integrations, dirty trees, and conflicts.\n```"
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
      "terms": "and catalog cli cloud cod coding-cli configur detect dry dry-run forc inspect json list loc prob probe-cloud provider refresh remov run set setup test vib yes",
      "body": "```text\nvibe provider - Inspect, configure, and test local coding-CLI providers.\n  vibe provider detect [--json] - Scan PATH for known local coding CLIs (claude/codex/opencode/aider/ollama).\n  vibe provider list [--json] - Show providers configured in this project.\n  vibe provider test [--yes] - Send a tiny no-op prompt to a configured provider and look for the magic token.\n  vibe provider set [--yes] - Assign every default agent to use the given provider.\n  vibe provider setup - Guided provider setup wizard.\n  vibe provider remove [--yes] - Remove a provider from project.yml (refuses if a role still uses it).\n  vibe provider catalog [--json] - Show the provider capability catalog (built-in + your .vibestrate/providers-catalog.yml overlay).\n  vibe provider refresh [--force --dry-run --probe-cloud] - Detect each provider's real models/efforts (codex `debug models` JSON, else --help scraping) and write them to the catalog overlay. Refreshes stale built-in lists; local only.\n```"
    },
    {
      "id": "cli/queue",
      "kind": "cli",
      "title": "vibe queue",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Manage the local task scheduler queue.",
      "titleTerms": "queu",
      "terms": "add drain exit exit-when-drain json list loc manag out paus queu remov resum run scheduler servic sourc statu task the vib when",
      "body": "```text\nvibe queue - Manage the local task scheduler queue.\n  vibe queue list [--json] - Show the queue and running tasks.\n  vibe queue add [--source] - Add a task to the queue.\n  vibe queue remove - Remove a task from the queue.\n  vibe queue run [--exit-when-drained] - Start the local scheduler loop and process queued tasks.\n  vibe queue pause - Pause the scheduler (new tasks will not start).\n  vibe queue resume - Resume the scheduler.\n  vibe queue service [--out] - Print a launchd/systemd unit that brings the scheduler back after a reboot. Prints it - installing is yours to do.\n  vibe queue status [--json] - Print scheduler state and recent conflict warnings.\n```"
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
      "terms": "architect brief checklist concis context context-fil context-pdf context-url crew default fil flow flow-brief flow-context flow-forc flow-skip forc from i implement mod no no-select only param pdf permiss permission-mod plan port preview profil read read-only resum resume-from resume-stag review rol run seat seat-rol select skill skip stag step step-profil supervisor task the ui ui-port unattend url verify vib workflow",
      "body": "```text\nvibe run [--ui --ui-port --task --crew --profile --read-only --permission-mode --unattended --skills --concise --flow --supervisor --select --no-select --step-profile --seat-role --flow-brief --flow-context --flow-force --flow-skip --param -i --resume-from --resume-stage --preview --checklist --context-file --context-url --context-pdf] - Run the default plan→architect→implement→review→verify workflow.\n```"
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
      "summary": "Guided wizard for provider, validation commands, and run defaults.",
      "titleTerms": "setup",
      "terms": "and command default for guid provider run setup validat vib wizard",
      "body": "```text\nvibe setup - Guided wizard for provider, validation commands, and run defaults.\n```"
    },
    {
      "id": "cli/shell",
      "kind": "cli",
      "title": "vibe shell",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Interactive terminal panel. For the full dashboard + scheduler + browser in one shot, use `vibe ui` instead.",
      "titleTerms": "shell",
      "terms": "browser dashboard for full full-screen in instead interactiv onc one panel refresh scheduler screen shell shot termin the ui use vib",
      "body": "```text\nvibe shell [--refresh --once --full-screen] - Interactive terminal panel. For the full dashboard + scheduler + browser in one shot, use `vibe ui` instead.\n```"
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
      "id": "cli/steer",
      "kind": "cli",
      "title": "vibe steer",
      "source": "CLI reference (generated from the command tree)",
      "summary": "Queue a note onto a running run; it is applied at the next step boundary.",
      "titleTerms": "steer",
      "terms": "a appli at boundary is it next not onto queu run steer step the vib",
      "body": "```text\nvibe steer [--step] - Queue a note onto a running run; it is applied at the next step boundary.\n```"
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
      "terms": "acceptanc add all apply archiv backlog cancel check checklist comment d delet don dry dry-run edit enhanc export fil flow import json list loc manag mov objectiv only out p paus pickup profil promot provider queu read read-only ready remov report resum roadmap run sequenc show skill stag statu step suggest supervis task unarchiv uncheck vib y",
      "body": "```text\nvibe tasks - Manage local tasks: backlog → queued → running → done.\n  vibe tasks add [-d -p --roadmap --skills --files --provider --read-only --supervised --json] - Create a task.\n  vibe tasks list [--status --json] - List tasks.\n  vibe tasks suggest [--all --json] - Suggest which backlog card to pick up next (ready + priority).\n  vibe tasks show [--json] - Show a task with comments and run history.\n  vibe tasks comment - Add a comment to a task.\n  vibe tasks export [--out] - Write the board as CSV (Jira / Trello / Monday / Linear all import it).\n  vibe tasks import [--dry-run] - Create tasks from a CSV exported by another tracker. Additive: never updates or deletes an existing card.\n  vibe tasks stage - File a task under a workflow stage (free label). No arguments clears it. Re-filing runs nothing - it only moves the label.\n  vibe tasks ready - Mark a task ready to run.\n  vibe tasks cancel - Cancel a task.\n  vibe tasks archive - Archive a task (files it into the board's Archived column).\n  vibe tasks unarchive - Un-archive a task.\n  vibe tasks delete [-y] - Permanently remove a task card (refuses while its run is live).\n  vibe tasks queue - Add a task to the scheduler queue.\n  vibe tasks run - Run this task now (foreground). A supervised task sequences its steps (the Conductor); a plain task runs the default flow once.\n  vibe tasks sequence [--json] - Sequence a supervised task's steps in order (the Conductor). The stable entry the scheduler spawns; `run` delegates here for supervised tasks.\n  vibe tasks status [--json] - Show a supervised task's live conductor status (lifecycle, steps, invariants, halt).\n  vibe tasks pause - Pause a supervised task's live run (between steps).\n… (deeper entries trimmed to fit)\n```"
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
      "id": "config/board",
      "kind": "config",
      "title": "project.yml: board",
      "source": "Configuration schema (generated from the Zod schema)",
      "summary": "Keys under `board` in .vibestrate/project.yml.",
      "titleTerms": "board",
      "terms": "board stag",
      "body": "```yaml\nboard: object default: {\"stages\":[]}\n  board.stages: array<string> default: []\n```"
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
      "terms": "act after auto bas delay enabl exhaust fallback limit max min ms on pattern profil rat resilienc respect retry stall timeout transient usag wait",
      "body": "```yaml\nresilience: object default: {\"enabled\":true,\"onExhausted\":\"fail\",\"autoFallback\":\"crew\",\"stallTimeoutMs\":null,\"rateLimit\":{\"maxRetries\":5,\"baseDelayMs\":2000,\"maxDelayMs\":120000,\"patterns\":[],\"fallbackProfile\":null,\"respectRetryAfter\":true},\"transient\":{\"maxRetries\":4,\"baseDelayMs\":1000,\"maxDelayMs\":60000,\"patterns\":[],\"fallbackProfile\":null},\"usageLimit\":{\"action\":\"stop\",\"maxWaitMin\":60,\"maxWaits\":2,\"fallbackProfile\":null,\"patterns\":[]}}\n  resilience.enabled: boolean default: true\n  resilience.onExhausted: enum default: \"fail\"\n  resilience.autoFallback: enum default: \"crew\"\n  resilience.stallTimeoutMs: number | null default: null\n  resilience.rateLimit: object default: {\"maxRetries\":5,\"baseDelayMs\":2000,\"maxDelayMs\":120000,\"patterns\":[],\"fallbackProfile\":null,\"respectRetryAfter\":true}\n    resilience.rateLimit.maxRetries: number (required)\n    resilience.rateLimit.baseDelayMs: number (required)\n    resilience.rateLimit.maxDelayMs: number (required)\n    resilience.rateLimit.patterns: array<string> default: []\n    resilience.rateLimit.fallbackProfile: string | null default: null\n    resilience.rateLimit.respectRetryAfter: boolean default: true\n  resilience.transient: object default: {\"maxRetries\":4,\"baseDelayMs\":1000,\"maxDelayMs\":60000,\"patterns\":[],\"fallbackProfile\":null}\n    resilience.transient.maxRetries: number (required)\n    resilience.transient.baseDelayMs: number (required)\n    resilience.transient.maxDelayMs: number (required)\n    resilience.transient.patterns: array<string> default: []\n    resilience.transient.fallbackProfile: string | null default: null\n  resilience.usageLimit: object default: {\"action\":\"stop\",\"maxWaitMin\":60,\"maxWaits\":2,\"fallbackProfile\":null,\"patterns\":[]}\n… (deeper entries trimmed to fit)\n```"
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
      "terms": "a act action-broker adapter advisor agent all and api app apply architectur assignment assist author background behind broker build builtin builtin-flow bundl catalog claud claude-code-provider cli cli-hint cod codebas command command-lin config config-loader config-schema config-update-servic config-view consult content context control cor crew crew-preset crew-registry crew-schema dashboard default default-prompt default-rol definit delivery detach detached-run detect detector did diff diff-servic dir directory directory-map discovery doc doctor doctor-servic domain effort effort-heuristic engin entry error error-format execut fetch flow flow-assist flow-discovery flow-schema format four frontend fs gateway generat generate-docs-metadata git guard guarded-fetch handbook heuristic hint http hub ids in index init init-templat ink integrat integration-servic its json know known known_provider len level lib lin liv loader loc machin map mcp merg merge-advisor merge-preview metadata metric miss most multi multi-project nav navigator notificat of onboard only orchestrator over owner owner-taught pag path path-guard persona phas pick planner policy policy-engin postur preset preview profil profile-schema profile-usag program project project-detector prompt propos provider provider-apply provider-detect provider-resilienc provider-runner provider-schema provider-setup-servic pty q queu react read read-only ready recip registry remain resilienc review roadmap rol role-registry role-schema rout rul run run-engin run-entry runner runtim safety saga scheduler schema script seat security select select-workflow server servic sess setup setup-servic shap shell show simpl skill skill-assignment-servic skill-discovery skill-loader sourc spec spec-up src sse start stat state-machin stor suggest supervisor task taught templat termin test the their tim tip to top top-level touch tour tre ts tui ui up updat usag util validat vib vibestrat view what wher who will word workflow workspac worktre yml you your",
      "body": "## In simple words\n\nA tour of `src/`. Not exhaustive - small helpers are omitted - but every top-level directory and stable extension point is here.\n\n```\nsrc/\n  core/        the run engine and its state\n  agents/      who runs a seat\n  providers/   adapters over the CLIs\n  flows/       recipes and their schema\n  safety/      the Action Broker\n  policies/    your rules\n  ui/          Mission Control\n  cli/         the vibe command\n```\n\n## The shape of `src/`\n\n```\ncli/            the vibe command-line program\nserver/         local HTTP/SSE API behind vibe ui\nui/             React dashboard (Mission Control)\nshell/          Ink TUI behind vibe shell\ncore/           run engine, state machine, stores,\n                metrics, validation, context\nsupervisor/     picks persona, lens, flow, posture\nflows/          Flow schema, catalog, runtime, hub\nagents/         crew -> role -> profile -> skills\nproviders/      local CLIs, adapters, MCP config\nproject/        .vibestrate/project.yml schema\nsafety/         Action Broker, apply gateway\npolicies/       owner-taught project rules\ngit/            worktrees, merges, merge-preview\nroadmap/        tasks, planner, proposals\nreviews/        review suggestions and bundles\nscheduler/      background run queue\nsetup/          onboarding, doctor, provider setup\nnotifications/  rules, routing and delivery\nconsult/        read-only project Q&A + handbook\nspec-up/        the Spec-up phase\nterminal/       PTY terminal sessions\nworkspace/      multi-project navigator\nutils/          fs, json, paths, time, run ids\n```"
    },
    {
      "id": "docs/architecture/http-api",
      "kind": "doc",
      "title": "HTTP API",
      "source": "Vibestrate docs: architecture/http-api",
      "summary": "The local dashboard API, a versioned /api/v1 contract with optional bearer-token auth and the flow import, export, and create endpoints.",
      "titleTerms": "api http",
      "terms": "0 1 127 200 201 24 400 401 403 404 4317 500 a abort act advic advis analyz and answer api appli apply approv architectur at auth authenticat authorizat bas bearer bearer-token bind body bound branch broker by call character cheap ci clean clos cod complet confirm consult contract control control-character coverag creat crew cross cross-origin cross-sit csrf curl currency dashboard data default definit delet deny descript deterministic did doctor don draft driv effort endpoint error event exist export expos fail fail-clos favicon fetch fil file-or-url finish finish-now first fix flow flow-creat flow-delet flow-fork flow-import flow-patch for fork format from gat get git glanc guard guid h head health hex host http http-api id ids import in init input integrat is it json kind know lan loc localhost loopback main merg merge-to-main messag ndjson network new no now of off on only openssl option or origin our out over overview overwrit own patch path paus phas policy portability post preview problem profil project rand read read-only recommendat record redact refus report requir require_approv resolv resolve-first rol rout run s saf scan schema seat sec sec-fetch-sit secret secret-scan server setup sigterm simpl sit siz skip sourc src sse ssrf stag stage-on-integration-branch statu stop summary supervisor surfac target text that the then think thread tip to token token-gat tool tru turn ui unverifi url v1 validat vers vib vibestrat vibestrate_api_token what with word writ www www-authenticat yaml yml you your",
      "body": "## In simple words\n\n`vibe ui` starts a local server (default `http://127.0.0.1:4317`) that backs the dashboard. The same endpoints are a stable, scriptable contract.\n\n```\ncurl http://127.0.0.1:4317/api/v1/runs\n```\n\n**It binds to loopback.** The server is reachable from this machine, not from your network, and write endpoints cross the same Action Broker the rest of the product does. A policy denying file writes stops an HTTP caller exactly as it stops the UI.\n\n**Tip.** Versioned paths (`/api/v1/...`) are rewritten to their unversioned form internally, so both work. Prefer the versioned form in scripts you intend to keep.\n\n## What the API is for\n\n**Driving a run from code** Start one, poll it, read the verdict, all without a browser.\n\n**CI** Kick a run from a pipeline and act on the result.\n\n## Endpoints at a glance\n\n```\nGET  /api/v1/health\n\nGET  /api/v1/flows\nGET  /api/v1/flows/:flowId/export\nPOST /api/v1/flows/import\nPOST /api/v1/flows\nPOST /api/v1/flows/draft\nPOST /api/v1/crews/draft\n\nGET  /api/setup/doctor\nPOST /api/setup/doctor/fix\nGET  /api/setup/status\nPOST /api/setup/init\n\nGET  /api/integration/overview\nPOST /api/integration/advice\nPOST /api/integration/analyze\nPOST /api/integration/finish\n\nGET  /api/supervisor/threads\nPOST /api/supervisor/threads/:threadId/turn\n```\n\n## Authentication\n\n```\n# expose on the LAN, token-gated\nexport VIBESTRATE_API_TOKEN=$(openssl rand -hex 24)\nvibe ui --host 0.0.0.0\n\n# then call it with that token\nAUTH=\"Authorization: Bearer $VIBESTRATE_API_TOKEN\"\ncurl -H \"$AUTH\" http://<host>:4317/api/v1/flows\n```"
    },
    {
      "id": "docs/architecture/overview",
      "kind": "doc",
      "title": "Architecture overview",
      "source": "Vibestrate docs: architecture/overview",
      "summary": "How Vibestrate's pieces fit together, from the orchestrator down to the local CLI binary.",
      "titleTerms": "architectur overview",
      "terms": "0 1 127 4317 a agent an api approv architectur as assert binary by child cli cod code_writ coding-agent component control cor daemon default deliberately demand did down export fit for four from gat git glob how in invocat it know loc machin manag miss model no nod on one only orchestrator os overview own per piec process project provider read read_only record relat remot run s sandbox see serv server shell simpl spawn src telemetry the thing tip to together transit ts ui v validat vib vibestrat wait waiting_for_approv what word worktre writ yml you your",
      "body": "## In simple words\n\nVibestrate is a single Node process orchestrating other local processes. No daemon, no service mesh, no cloud component.\n\n```\nyou -> vibe (one Node process)\n         |-- spawns your coding-agent CLIs as child processes\n         |-- manages a git worktree per run\n         `-- serves Mission Control on demand\n```\n\nMission Control is that last line: `vibe ui` starts a local Fastify server on `127.0.0.1:4317` and serves the dashboard from the same process. That is the surface you work in; `vibe` drives the same machinery from a script.\n\n**Tip.** \"Single process, no daemon\" is literal. Nothing runs when you are not running it: no background service to stop, no port held open, nothing to uninstall beyond the package.\n\n## The four things it owns\n\n**Spawning providers** Your CLIs, as child processes, reading their stdout.\n\n**A worktree per run** Created at start, named for the run, left on disk afterwards.\n\n**The record** Decisions, tokens, spend and artifacts, written locally as it happens.\n\n## The components\n\n```\nvibe CLI  (src/cli)        Mission Control  (src/server + src/ui)\n   |                              |\n   +--------------+---------------+\n                  v\n       Orchestrator  (src/core/orchestrator.ts)\n                  |\n                  +--> Agents  (src/agents)\n                  |       |\n                  |       v\n                  |     Providers  (src/providers)\n                  |       |\n                  |       v\n                  |     Local CLI binary on your machine\n                  |\n                  +--> Validation  (src/core/validation/)\n```"
    },
    {
      "id": "docs/cli/dashboard",
      "kind": "doc",
      "title": "Mission Control",
      "source": "Vibestrate docs: cli/dashboard",
      "summary": "The local dashboard for inspecting runs, approving gates, reading diffs, and steering the orchestrator.",
      "titleTerms": "control miss",
      "terms": "0 1 127 4317 4400 a abort activ add advanc all and api approv artifact as ask audit automat banner between block board browser c cd chang check claud cli cmd codebas complet config consult content control crew ctrl ctrl-c ctrl-k dashboard data demand did diff different do doctor doe els enter env event execut fail fil finish first fix flow for g gat guard hard headless hero host id in inspect inspector integrat it jump k know layout ledger list liv loc log main map merg merge-ready merge-to-main metric miss mor network new no no-open not noth on only open orchestrator outcom p policy port postur preview profil project propos provider prun r re re-check reach read ready replay run s saf sam select set setup sidebar simpl snapshot sourc start statu steer step stop supervisor tab termin the thi timelin tip to token tre ui undo undo-merg up validat vib vibestrat vibestrate_api_token view wait watch week what word workspac yml you your",
      "body": "## In simple words\n\nMission Control is Vibestrate's dashboard and the primary way to use it, served on demand by a local process on `127.0.0.1:4317`.\n\n```\nvibe ui\n```\n\nThere is no backend of ours behind it.\n\n**Local only** A process on your machine, bound to loopback. Nothing is sent anywhere.\n\n**On demand** Not a daemon. Close it and runs carry on without it.\n\n**The same data as the CLI** One project directory, read by both. Neither is a copy of the other.\n\n**Tip.** It is served on demand, not a daemon you leave running. Close it and nothing stops - runs continue, and reopening shows you where they got to.\n\n!Mission Control's layout - a left sidebar listing every page, beside the page you opened, here a run detail with its status hero above the live execution panel.\n\n**What it reaches the network for, and nothing else:** the Flows Hub when you search, pull or publish a flow; fetching a skill from a URL; importing a flow from a URL. It never pushes, never merges without a confirmation you send with the request, and never runs a shell command you type.\n\n**Did you know?** The dashboard writes config through the same gated writer the CLI uses, so a project policy denying file writes stops the editor too. The UI is not a privileged path around your rules.\n\n## Start it\n\n```\nvibe ui               # 127.0.0.1:4317, opens your browser\nvibe ui --port 4400   # a different port\nvibe ui --no-open     # headless\n```\n\n`--host` with anything other than `127.0.0.1` exposes the API on your network and requires `VIBESTRATE_API_TOKEN` to be set.\n\nStart a run with the dashboard already attached:\n\n```\nvibe run \"Add audit logging\" --ui\n```"
    },
    {
      "id": "docs/cli/overview",
      "kind": "doc",
      "title": "CLI overview",
      "source": "Vibestrate docs: cli/overview",
      "summary": "The shape of the vibe command, how its subcommands group, and the conventions every command follows.",
      "titleTerms": "cli overview",
      "terms": "0 1 1250 125024 127 20 20260614 20260614-1250 20260614-125024-add-audit-log 4317 4400 8 a abort accept acm add advanc advis agent allow allow-token-to-custom-host an and any api apply approv architect architectur are area arg as ask assess assign assuranc astro audit auth automat automatabl bas base-url befor boolean browser built built-in bundl cd chang cheap check clear cli cod codebas codebase-map com command config configur consult content control convent cor could crew current custom dashboard deep deep-review default definit descript detail detect did discoverabl do doctor don draft enabl enough enter env every execut export fals fetch fil filter find first fix flow follow for framework friendlier from full gat generat get git github group guidanc h handl healthz heavy high host how hub i id if import in init input insid inspect inst interactiv is it its json key know l learn leav ledger level list log login look loop machin map max md miss mor my my-flow nam need new no no-open not noun null number of oldest on onc one only open or out overview overwrit param parameter pass past path paus payment per plan planner pnpm port prefix preset preview print profil project project-param provider publish raw re re-run read read-only readabl redo referenc regenerat reject remov renam render replay request request-chang resolv resum resume-from resume-stag reus review review-heavy reviewer rewind right risk rout run s sam say scaffold schema semver set settabl setup shap shell show simpl sk skill slug so spec spec-up spend stag start statu steer step stor strong subcommand suggest supervis supervisor t tabl task termin test that the then thorough tip to token top top-level tru typecheck ui unassign uniqu unset up url usd use user validat verb verify vers vib vibestrat vibestrate_api_token vibestrate_hub_token view wait way welcom what wher wir with word work workspac worktre writ wrong yaml yes yml you your your-github-login zod",
      "body": "## In simple words\n\n```\nvibe init                       # scaffold .vibestrate/\nvibe doctor --fix               # find and wire up your CLIs\nvibe run \"Add a /healthz route\" # do the work\nvibe status                     # where is it\nvibe ui                         # open Mission Control\n```\n\n## The core loop\n\n```\nvibe init               # once per project\nvibe doctor             # verify env + config\nvibe run \"Your task\"    # start a run\nvibe status             # every run, oldest first\nvibe replay <runId>     # inspect any past run\nvibe path <runId>       # the run's git worktree\nvibe rename <runId> a friendlier name\n```\n\n## The full command list\n\n```\nvibe (no args)       → the interactive shell\nvibe <command>       → a top-level command\nvibe <area> <verb>   → a verb inside an area\n```\n\n```\ntop-level  init      setup     welcome\n           run       status    abort\n           pause     resume    doctor\n           ui        replay    shell\n           path      rename    logs\n           assurance audit     ledger\n           consult\n\nareas      provider  config    skills\n           flows     params    approvals\n```\n\n## You only need enough of a run id\n\n```\nvibe path 20260614-1250      # resolves, if only one run starts that way\nvibe abort 20260614          # same\n```\n\n## Worktrees, and rewinding a run\n\n```\ncd \"$(vibe path <runId> --cd)\"\n```"
    },
    {
      "id": "docs/cli/shell",
      "kind": "doc",
      "title": "Interactive shell",
      "source": "Vibestrate docs: cli/shell",
      "summary": "The terminal panel vibe opens with no arguments, with a live status bar, tabbed pages, and an always-on command prompt.",
      "titleTerms": "interactiv shell",
      "terms": "0 1 1-9 2 3 4 5 6 7 8 9 a abort activ activity advanc alway always-on an and approv argument autocomplet automat b back bar body branch browser budget by c cap cli clos command complet config consult context context-sensitiv control crew ctrl current d daily dashboard default delet did dismiss doc doctor down e edit effort end enter esc f fil flag flow full full-screen get git h header help hi high history hom i idl ids in in-termin inlin it its j json k key know layout less liv low m main medium miss mod n nam navigat new no notif o of off on only open opt or p pag palett panel paus pick prefix previou profil project prompt q queu quit r re re-run read read-only replay resum retent roadmap run s sam screen scroll select sensitiv sess set shell shift show simpl skill snapshot spac spend statu subcommand suggest switch tab task termin the thing tip to toggl topic trunk up usd validat valu vib vibestrat view vim websit what why window with word worktre writ you your",
      "body": "## In simple words\n\nThe interactive shell is Vibestrate's second surface. Mission Control is the primary one; the shell is the terminal-native version of the same screens.\n\n```\nvibe            # with no arguments\nvibe shell      # the same thing, named\n```\n\n## The pages\n\n```\n1 Dashboard   4 Profiles   7 Suggestions   0 Doctor\n2 Flow        5 Runs       8 Skills\n3 Crew        6 Approvals  9 Roadmap\n```\n\n```\nRuns      p pause · r resume · a abort · R re-run\nRoadmap   e edit · n new · d delete · Q queue\n```\n\n## Navigation\n\n```\n1-9 / 0   switch pages\n:         the command palette\nEsc       back to the previous page\nd         the in-terminal docs browser\nb / B     Mission Control in your browser\nm         toggle write / read-only mode\nc / f     pick the session's crew / flow\n?         context-sensitive help\nq         quit\n```\n\n## Autocomplete\n\n```\nconfig             view show get set keys validate\nconfig show -      --json\n--effort           low | medium | high\n--effort=hi        --effort=high\n--crew --flow      your crew and flow ids\n--profile --task   your profile and task ids\nreplay             your run ids\ntasks show         task ids\nflows show         flow ids\n```\n\n```\n▸ vibe config set git.▌\n    › git.mainBranch             = main\n      git.branchPrefix           = vibestrate/\n      git.snapshotRetentionRuns  = 0\n    Name of the main/trunk branch (default main).\n    ⇥ complete · ↑↓ select · esc dismiss\n```\n\n## Docs browser\n\n```\n↑ / ↓  or  j / k   scroll the page\nSpace / b          page down / up\n[ / ]              switch topic\no                  open the docs website\nEsc                close\n```"
    },
    {
      "id": "docs/cli/supervised-tasks",
      "kind": "doc",
      "title": "vibe tasks (supervised runs)",
      "source": "Vibestrate docs: cli/supervised-tasks",
      "summary": "Author and run supervised tasks - a task with ordered steps you define once and sequence later through the Conductor.",
      "titleTerms": "run supervis task vib",
      "terms": "0 1 2 20 3 4a08 5 7c1 a acceptanc add advanc and apply ask at author automat back be beat between bil block board boolean boundary brief budget chang check checklist ci ci-migrate-the-write-path-4a08 clean clear cli cod com comma comma-separat command conductor config creat default defin did display don done-when edit enabl enhanc error executor exhaust exit fil flow for from good halt handler has heal hint id idl in in_progress into invariant is it item its json key know languag later leav lik list liv look mark max may midway migrat model mov need next no not null number objectiv of on onc one only order own part pass path paus pend per per-part plain plan pnpm posit proc profil progress promot re re-read re-sequenc read reason relat remov reorder replac rest resum review reviewer rol rout run s saga scop self self-heal-exhaust separat sequenc set sever shap show simpl spend split src stat statu step still stop str strong summary supervis supervised-task supervisor tabl task task-id task-settings-v2-7c1 team text the through tip titl to tru ts typ typecheck uncheck up updat usd v1 v2 vib want watch weak what when with word work worktre writ you",
      "body": "## In simple words\n\n```\nvibe tasks add --supervised \"Add team billing\"\nvibe tasks checklist add <task-id> \"Create the teams table\"\nvibe tasks run <task-id>\n```\n\n## Author the steps\n\n```\nvibe tasks add --supervised \"Settings v2\"\n```\n\n```\n✓ Task added.\n  id: task-settings-v2-7c1e\n  title: Settings v2\n```\n\n```\nvibe tasks checklist add task-settings-v2-7c1e \\\n  \"Update the model\" \\\n  --objective \"Replace the SettingsV1 type with \\\nSettingsV2 in src/models/settings.ts\" \\\n  --acceptance \"pnpm typecheck passes with no \\\nerrors in src/models/\" \\\n  --files \"src/models/settings.ts\"\n```\n\n```\n--objective <text>    the executor's scoped brief\n--acceptance <text>   the done-when check, in\n                      plain language\n--files <list>        comma-separated file hints,\n                      re-read from the worktree\n                      at the step\n```\n\n## What a good step looks like\n\n```\nweak\n  objective:   \"clean up settings\"\n  acceptance:  \"it works\"\n\nstrong\n  objective:   \"Replace SettingsV1 with SettingsV2\n                in src/models/settings.ts. Leave the\n                route handlers to a later step.\"\n  acceptance:  \"pnpm typecheck passes with no\n                errors in src/models/\"\n```\n\n## Editing and reordering\n\n```\nvibe tasks checklist edit <taskId> <itemId> \\\n  <text...>\nvibe tasks checklist move <taskId> <itemId> \\\n  <position>\n```\n\n## Run it\n\n```\nvibe tasks run task-settings-v2-7c1e\n```\n\n```\nvibe tasks sequence task-settings-v2-7c1e --json\n```"
    },
    {
      "id": "docs/cli/supervisor",
      "kind": "doc",
      "title": "vibe supervisor",
      "source": "Vibestrate docs: cli/supervisor",
      "summary": "The supervisor's kill switch from a terminal - stop it acting, resume it, check whether it may act - plus the persona commands.",
      "titleTerms": "supervisor vib",
      "terms": "08 15 169 2026 2026-08-15 34 49 a abort act adopt advanc advis again an and answer archetyp as at authorizat authz automat autonomy bar blast blast-radiu built built-in but can catalog check cli command control copy correctness correctness-purist data data-migration-guardian default delet did diff different engineer every fast first flag for from frontend frontend-reviewer guardian hawk her id in init inject into it json kill know len let list may migrat mor no not now only paus performanc performance-skeptic persona plu postur pragmatist prefer project purist radiu reason red remov resolv resum review reviewer right risk risky run s sam sandbox sandbox-suggest secret security security-hawk security-risk set ship ship-fast-pragmatist simpl skeptic squar staff staff-engineer statu still stop subcommand suggest supervisor switch t12 task termin test the thi thre tip tru updat vib vibestrat whether will within word yml you your z",
      "body": "## In simple words\n\n```\nvibe supervisor stop      # it may still answer; it may not act\nvibe supervisor status    # may it act right now?\nvibe supervisor resume\n```\n\n## Every subcommand\n\n```\nvibe supervisor <subcommand>   (bare: same as list)\n\nlist          resolved personas, built-in + project\narchetypes    the catalog you can adopt\nadopt <id>    copy an archetype into project.yml\ndefault <id>  set this project's default\nremove <id>   delete a project persona\nstop          stop it acting; it still answers\nresume        let it act again\nstatus        whether it may act right now\n```\n\n```\n--json     list, archetypes, status\n--reason   stop\n```\n\n## Stop and resume\n\n```\nvibe supervisor stop --reason \"reviewing the diff\"\nvibe supervisor resume\n```\n\n```\n! Supervisor stopped. It will answer, but it\n  will not act. (reviewing the diff)\n✓ Supervisor resumed. It can act again, within\n  your autonomy setting.\n```\n\n## Whether it may act right now\n\n```\nvibe supervisor status\nvibe supervisor status --json\n```\n\n```\n✓ Running - may act, within your autonomy setting.\n```\n\n```\n{\n  \"pause\": {\n    \"paused\": true,\n    \"reason\": \"\",\n    \"updatedAt\": \"2026-08-15T12:49:34.169Z\"\n  }\n}\n```\n\n## Personas\n\n```\nvibe supervisor list\n```\n\n```\nSupervisor personas\n  → staff-engineer (default) [built-in]\n      Correctness, risk, and blast-radius first.\n      lenses: correctness, tests, security-risk\n  → security [built-in]\n      Authorization, secrets, and injection first.\n      lenses: authz, secrets, injection\n      posture: prefers sandbox-suggested for\n        risky tasks\n```\n\n```\nvibe supervisor archetypes\nvibe supervisor adopt security-hawk\nvibe supervisor default security-hawk\n```"
    },
    {
      "id": "docs/concepts/annotation",
      "kind": "doc",
      "title": "Annotations",
      "source": "Vibestrate docs: concepts/annotation",
      "summary": "A short note pinned to a file, which agents read before they start work.",
      "titleTerms": "annotat",
      "terms": "0 1 127 40 40-58 4317 58 a actually add agent an annotat as auth authoritativ bear befor bug codebas concept copy did do don fil for generat guidanc her human in inspector is it json know liv load load-bear not one order pattern pin privat project read refactor resolv rol see sess short simpl src start t task teach the them thes they thi tip to touch treat ts ui user vib vibestrat visibl what when wher which word work worktre would you your",
      "body": "## In simple words\n\nAn **annotation** is a short note you pin to a file, telling agents something they should know before they touch it.\n\nIt works like a sticky note on a page: the page is unchanged, but anyone reading it sees your note first, and you never edit the file yourself.\n\nYou pin it on the **Codebase** page. `vibe ui` opens the dashboard on `127.0.0.1:4317`, **Codebase** is a row in the sidebar, and its right-hand **Inspector** panel holds the notes for whichever file is open. There is no command for this one: the dashboard is the only surface.\n\n**Tip.** An annotation is the right tool when what you want to say is about *one file*. If it is true across the codebase, write a skill instead - a note pinned to forty files is forty things to keep in sync.\n\n## When you would pin one\n\n**\"This is the bug\"** Point the run at the function rather than letting it search.\n\n**\"Do not touch this\"** Load-bearing code that looks refactorable and is not.\n\n**\"Copy the pattern here\"** Name the file you want imitated.\n\n**\"This is generated\"** Stop an agent hand-editing something a script rewrites.\n\n**Did you know?** A note marked visible to agents is added to every agent's prompt during a run - your guidance, acknowledged by the whole crew, not only the one worker that happens to open that file.\n\n## What an agent actually reads\n\n```\n# Human Annotations\n\nThe user pinned these notes to the codebase. Treat them as authoritative guidance for this task:\n\n- **src/auth/session.ts:40-58** - don't refactor this; the ordering here is load-bearing.\n```"
    },
    {
      "id": "docs/concepts/configuration",
      "kind": "doc",
      "title": "Configuration & settings",
      "source": "Vibestrate docs: concepts/configuration",
      "summary": "Everything you can tune lives in one committed folder at your project root.",
      "titleTerms": "configurat set",
      "terms": "0 1 10 10-styl 127 20 20-test 4317 adaptiv and any arg artifact as at budget can check codebas command commit concept config configurat control crew default deterministic did doctor editor env every everyth execut fals fil flow folder gener get git gitignor go group guidanc hav hous human in init inst instruct into it j json k key know liv load map md merg methodology metric mor null onc one open out outsid own pag per per-run permiss persona pnpm policy ponytail postur profil project provider quota raw read readabl record relat requir resilienc rol root rul run s safety sam sav scheduler schema secret sess set settabl setup shell show simpl sit siz skill sourc spec stat stay styl supervis supervisor teach termin test the tip to tru tun turn ui up validat vib vibestrat view what word worker workflow yml you your",
      "body": "## In simple words\n\nYour project's settings are a screen. `vibe ui` opens the dashboard on `127.0.0.1:4317`, and **More > Config** lists every setting Vibestrate has, grouped, each one editable where it sits.\n\nThree surfaces read the same file, and only one of them writes:\n\n**The Config page** Grouped and editable, one control per setting, validated as you type.\n\n**The shell's Config page** The same values, read-only, without leaving the terminal.\n\n**`vibe config`** `show`, `get`, `set`. The scripting path, and the only one that reaches the three shell-command keys.\n\nBehind that screen is one committed folder at your project root. `vibe init` writes all of it except `flows/`, which appears the first time you write or install a flow:\n\n```\n.vibestrate/\n  project.yml      providers, profiles, crews, flows, policies, validation commands\n  rules.md         guidance loaded into every turn\n  roles/           one file per worker's instructions\n  skills/          house rules any role can read\n  policies/        deterministic rules\n  runs/            per-run artifacts, state and metrics\n  flows/           your own and installed flows, once you have any\n```\n\nIt is plain YAML inside your repo.\n\n## The commands\n\n```\nvibe config view          # grouped, readable\nvibe config view --json   # the same, as JSON\nvibe config show          # raw project.yml\nvibe config keys          # every settable key\nvibe config validate      # check the schema\n\nvibe config get commands.validate\nvibe config set workflow.requireHumanMerge true\n```"
    },
    {
      "id": "docs/concepts/consult",
      "kind": "doc",
      "title": "Consult",
      "source": "Vibestrate docs: concepts/consult",
      "summary": "Ask one question about your project and get an answer grounded in what is really there.",
      "titleTerms": "consult",
      "terms": "a about an and answer api apply ask assist at behind beyond block can caveat chang concept confidenc config confirm consult context cost did diff do documentat doe estimat fil fit flow from get git good ground guid heavier her how i id in is it its key know last leav left list materi md me money new noth null one orb pag pass policy post profil project propos quest r really recommend reject relat run s screen shell should show simpl sourc src task termin that the their ther thi tip to ts two until updat use vib vibestrat what wher which why word writ x yml you your",
      "body": "## In simple words\n\n**Consult** answers one question about your project, reading your files, your config and your recent runs. It also reads Vibestrate's own documentation, compiled into the package, so an answer about the product quotes a real command or config key rather than a remembered one.\n\nYou reach it from the orb that rests at the bottom right of every screen:\n\n!The bottom right corner of the dashboard. Two round controls stack there: a terminal button showing a prompt caret, and below it the Consult orb, a glowing violet square inside a circle.\n\n**Tip.** Consult is one question and one answer; the supervisor chat is a conversation that remembers the thread. Reach for the chat when you are working something out over several turns.\n\n## What it is good at\n\n**\"What is this config key?\"** Answered from the real schema, not from memory of a similar tool.\n\n**\"What changed in that run?\"** It has the run record: decisions, diff, validation output.\n\n**\"Which flow should I use here?\"** It knows which flows this project actually has installed.\n\n**\"What did this cost?\"** The ledger is local and it can read it.\n\n## From a terminal\n\n```\nvibe consult \"Should this use a heavier flow?\"\nvibe consult \"Why did the last run block?\" --run <runId>\nvibe consult \"What is left here?\" --task <taskId>\nvibe consult \"What does this file do?\" --file src/consult/consult.ts\n```\n\n```\nvibe guide proposals\nvibe guide apply <id>\nvibe guide reject <id>\n```\n\n```\nvibe policies list\nvibe policies confirm <policyId>\nvibe policies reject <policyId>\n```"
    },
    {
      "id": "docs/concepts/crew",
      "kind": "doc",
      "title": "Crew",
      "source": "Vibestrate docs: concepts/crew",
      "summary": "The team of AI workers you cast, and which model each one runs on.",
      "titleTerms": "crew",
      "terms": "0 1 127 3 4317 a add ai all all-loc an and another builder by cannot careful cast chang cheap check claim concept configur cor cover crew default did draft each edit entirely every executor fast flow from hand hav implementer in init insid install it know list loc mad mark model need never new no of offlin on one order pag pick preset print profil project propos ready ready-mad remov rol roster run sav seat seat-rol second set shell show simpl start tak task team termin the thi thorough tip to two ui use vib vibestrat which why word work worker would written yml you",
      "body": "## In simple words\n\nA flow says which *kinds* of worker a job needs - someone to plan, someone to build, someone to check - not who.\n\nA **Crew** is who shows up: a roster of workers, each pointed at a model. One crew might be all Claude, another might have Codex build and Claude review. The flow does not change either way.\n\nEach worker is a **role**, answering two questions: which kinds of step it can take, and which model it runs on.\n\n`vibe ui` opens the dashboard on `127.0.0.1:4317`, and **Crew** in the sidebar lists your crews, one card each, carrying **Configure**, **Edit roles** and **Set default**. Here is the crew `vibe init` gives you:\n\n**Tip.** You do not need a second crew to change how a run behaves. A different *model* lives on the role's profile. Reach for a second crew when you want a different team, like an all-local one.\n\n!The Default crew card. A green stripe on the left reads Crew default, runs by default. The card names the crew Default, counts 6 roles and reads all seats filled, with Configure and Edit roles buttons.\n\nEvery seat the flow asks for is covered, and this crew runs unless a run names another.\n\n## From the terminal\n\n```\nvibe crew list                        # every crew, default marked\nvibe crew show default                # roles, profiles, seats\nvibe crew use thorough                # change the default\nvibe crew presets add thorough        # install a ready-made one\nvibe crew draft \"an all-local crew\"   # a roster proposal, printed, never written\nvibe run \"task\" --crew thorough       # one run on another crew\n```"
    },
    {
      "id": "docs/concepts/derived-flows",
      "kind": "doc",
      "title": "Derived flows",
      "source": "Vibestrate docs: concepts/derived-flows",
      "summary": "Builds a flow from the work itself, rather than forcing every task through one fixed recipe.",
      "titleTerms": "deriv flow",
      "terms": "a absenc add adopt aim ambiguou an and answer api arbitrat architect architectur are auth b beyond bil block build c cannot chang command concept concurrency correctness cost counter crew data data-integrity decomposit default depend deriv derived-flow describ design did different distinct do doe down endpoint every evidenc feel fix fixer flow flow-forc flow-skip for forc fre from has id implement implement-endpoint implement-migrat implement-seat implementer import in input integrity invit is isolat it itself json know len mad max max-unit migrat model money n need new not noth of on onc one only option owner owner-only part past performanc plan plan-review planner positiv public public-api quality rather reach recip requir reus revalidat review review-correctness reviewer rol run schema seat seat-rol secret simpl skip stand step tabl tag task team test than that the through tip to ui unit untrust untrusted-input url validat verifier verify vib want we what when will word work writ wrong yaml yml you your",
      "body": "## In simple words\n\nA flow is a generic recipe, so a fixed one is always slightly wrong: too heavy for a one-line change, too light for a migration touching money.\n\n**Deriving** builds a flow from the work itself. Give it a task with real parts to it and you get a flow shaped to those parts, rather than the same eight steps regardless.\n\n```\nTask: \"Add team billing: a teams table, an owner-only invite endpoint, a seat counter\"\n\nderived flow\n  plan                 -> planner\n  architecture         -> architect\n  implement-migrate    -> implementer   (schema change, isolated)\n  implement-endpoint   -> implementer\n  implement-seats      -> implementer\n  validation           -> your commands\n  review-correctness   -> reviewer      (the `money` tag aims the correctness lens)\n  fix                  -> fixer\n  revalidation         -> your commands\n  verify               -> verifier\n```\n\nRead the order: validation waits for every unit step, and every review lens waits for validation. `plan`, `architecture`, `fix`, `revalidation` and `verify` are emitted whatever the task looks like.\n\n**Tip.** Deriving is the one flow surface with no dashboard control. It is a terminal command that **writes nothing**: it prints a flow for you to read, and adopting it is the **Import** button on the dashboard's Flows page. Treat the output as a proposal from something that read your task, not as a decision already made.\n\n## Deriving one, and adopting it\n\n```\nvibe flows derive \"add team billing\" --id billing --yaml > billing.yml\nvibe flows import billing.yml\n```"
    },
    {
      "id": "docs/concepts/flow",
      "kind": "doc",
      "title": "Flow",
      "source": "Vibestrate docs: concepts/flow",
      "summary": "The recipe a run follows - its ordered steps, and the kind of worker each step needs.",
      "titleTerms": "flow",
      "terms": "0 1 127 2 4317 a actually adaptiv add alway and arbitrat as ask assist auth automat brief build builder chang check clear cli codex codex-review com concept contain continu cor customiz dashboard default definit delet deriv did draft dry each edit enter error export express f field flow follow for fork from gat h has hub import in install it its keep kind know list mak model nam need new no no-select of off on one only open or order overrid own past paus pick plan plan-only profil project provider publish pull quality quality-arbitrat recip redo referenc repeat restor reveiw review reviewer run sam sav seat select set shar shell should show simpl siz skip spec step step-profil termin the thi tighten tip to ui undo unknown up use vib vibestrat want what when wher which word worker would writ yaml yml you",
      "body": "## In simple words\n\nA **Flow** is a recipe. It lists the steps to work through, in order, and says what *kind* of worker each step needs: someone to plan, someone to build, someone to review.\n\nWhat it never says is *which AI model*. A flow describes the process; your crew supplies the people, so a flow a stranger wrote runs on your models, at your budget, unedited. Each slot a step asks for is a **seat**, and seat covers those next.\n\n**Flows** in the sidebar is the catalog: `vibe ui` opens the dashboard on `127.0.0.1:4317`, and every flow this project can run is a card there. **New flow** and **Import** sit in the header; a card's menu holds **Set as default**, **Customize**, **Export** and, for a project flow, **Edit definition** and **Delete**.\n\n**Tip.** \"Always review on a different vendor\" is a crew setting, not a flow setting. Nothing on a flow card names a model.\n\n!The Default flow card. A bar of eight coloured blocks shows its steps in order. Below, the description reads: the standard plan, architect, implement, validate, review workflow, review loops back to fix and re-validate until it passes or the bound is hit, then a verify gate decides. Three tiles read 8 steps, 6 seats, v1 version.\n\n## Automation: the CLI\n\n```\n# what this project has, and what a flow contains\nvibe flows list\nvibe flows show quality-arbitration\n\n# run one\nvibe run \"Tighten the auth checks\" \\\n  --flow quality-arbitration\n```\n\n```\nvibe profile add codex-review --provider codex\n\nvibe run \"Tighten the auth checks\" \\\n  --flow default \\\n  --step-profile review=codex-review\n```"
    },
    {
      "id": "docs/concepts/policies",
      "kind": "doc",
      "title": "Policies",
      "source": "Vibestrate docs: concepts/policies",
      "summary": "The project's one rule surface - tiered rules enforced on every run, from soft advice to a hard merge block.",
      "titleTerms": "policy",
      "terms": "0 1 12 127 4 4317 a add adopt advic advis against an and automat block both broken character concept config confirm consol consult dash deterministic did discard do doctor draft em em-dash enforc engin english every eyebrow fix from gat guard hard hyphen id in integrat it know label list log matcher merg migrat new no no-em-dash no-eyebrow not on one only owner owner-only persona policy policy_advis policy_block preferenc project prompt propos recent reject remov rul run s safety sect see shell sid simpl snippet soft stop suggest supervisor surfac test the thi tier tip to ui use vib vibestrat what word would writ yml you your",
      "body": "## In simple words\n\nA **policy** is a rule your project enforces on every run. Something like \"use a hyphen, not an em-dash\", or \"never add `console.log` to source files\".\n\nPolicies belong to the *project*, not to one supervisor. The supervisor is the enforcer that carries them into review, so a rule holds whichever supervisor is on duty.\n\n`vibe ui` opens the dashboard on `127.0.0.1:4317`. **Policies** is its own row in the sidebar. Its header counts your advise, block and pending rules beside the engine rules loaded from disk, and a **Guards** tile reads `4/4` while all four hard guards are on. **New policy** opens the one authoring form.\n\n**Tip.** Start at the `advise` tier, the default. Reach for `block` only when you want a merge stopped outright, because a blocked run needs you to come back to it.\n\nThe page is two columns, and only the left one is yours:\n\n!The Your policies column and the Deterministic engine card. Two rules are tagged advise: one forbidding console.log in source files, one requiring unknown keys to be rejected at the boundary. Below, a card reads no rules in .vibestrate/policies/*.yml.\n\n## Automation\n\n```\nvibe policies add no-em-dash \\\n  \"do not use em-dash characters\" \\\n  --fix \"use a hyphen\"\n\nvibe policies add no-eyebrow \"no eyebrow labels\" \\\n  --block --matcher \"SectionEyebrow\"\n\nvibe policies test no-eyebrow --recent   # what would it block?\nvibe policies list\nvibe policies confirm <id>  # adopt a proposal\nvibe policies reject <id>   # discard a proposal\nvibe policies remove <id>\n```"
    },
    {
      "id": "docs/concepts/ponytail",
      "kind": "doc",
      "title": "Ponytail minimalism",
      "source": "Vibestrate docs: concepts/ponytail",
      "summary": "The posture that stops an agent over-building - smallest change that actually works.",
      "titleTerms": "minimalism ponytail",
      "terms": "abstract actually agent already an and away be beyond build can chang concept config dependency did diff do doe execut exist fals featur fewer gener her in inst is it know library lin mak nativ need not one only over over-build ponytail postur provenanc quest relat run set simpl smaller smallest standard stop task that the then thi tip to trad trust vib what why will word work writ writer you",
      "body": "## In simple words\n\nLeft alone, a coding agent over-builds: a helper class where a function would do, a dependency where the standard library was fine, fifty lines where one was enough.\n\n**Ponytail** is the posture that pushes back. It injects a \"lazy senior dev\" ruleset into the agents that write code, so their default is the smallest change that actually works.\n\nIt is on by default, and it is one switch: the `ponytail` row under **General** on the dashboard's **Config** page, or from a terminal:\n\n```\nvibe config set ponytail false\n```\n\n**Tip.** Only the seats that produce a diff see it - the implementer and the fixer. Planners, reviewers, the arbiter and the verifier run without it, so the check on a change stays independent of the posture that wrote it.\n\n## What it changes\n\n**Fewer dependencies** Standard library before a package, native platform feature before a library.\n\n**Fewer abstractions** No interface with one implementation, no config for a value that never varies.\n\n**Smaller diffs** A one-line bug does not earn a refactor.\n\n**Questions the task** Sometimes the smallest change that works is no change.\n\n**Did you know?** Minimal is not careless. The correctness rules survive the posture, and every diff still passes the post-turn gate and your review. Ponytail changes what an agent reaches for first, not what it is allowed to skip.\n\n## What it makes an agent do\n\nBefore writing code, a ponytail agent climbs a ladder and stops at the first rung that answers the problem:\n\n**Does this need to exist?** The cheapest code is the code you don't write. Question the task itself before building it."
    },
    {
      "id": "docs/concepts/profile",
      "kind": "doc",
      "title": "Profile",
      "source": "Vibestrate docs: concepts/profile",
      "summary": "A saved preset that says how strong and expensive a role runs - a provider, its model, and the effort level.",
      "titleTerms": "profil",
      "terms": "4 a about add agent allow and another api at balanc budget built built-in bundl by catalog cheap claud claude-balanc claude-cheap claude-max codex concept configur cor crew cross cross-vendor d debug deeper delet did disallow duplicat e effort exist expensiv fenc for from get guard high how id implement in is issu its itself knob know legibility level list loc m mak max model must n nest new no not off one opu orchestrat order patch pick planner post power preset profil project provider r reach real refus remov review rol run s sav say set shell simpl sit slower sourc statu step step-profil strict strict-writer strong sub sub-agent task termin that the thi tip token tool used vendor vib vibestrat when wher word would writ writer x yml you",
      "body": "## In simple words\n\nA **Profile** decides how strong and expensive a role runs. It is a saved preset bundling three things: where the work happens, which model, and how hard that model thinks.\n\nThink of the drive modes on a car: Eco and Sport change how hard the engine works, not who is driving.\n\n**Profiles** in the dashboard sidebar holds them, one card each, grouped under the provider they run on. The page header counts them and flags any that have gone unusable:\n\n**Tip.** A role points at a profile, never at a model. That indirection is the point: swap the model for six workers by editing one card.\n\n!The claude-balanced profile card, filed under a claude heading. It is marked used by 6 roles. Three tiles read claude provider, default model, medium effort. Below them are Provider, Label, Model, Max tokens and Timeout fields, and an Effort scale from Faster to Smarter offering low, medium, high, xhigh and max, with medium selected.\n\nThe tiles say what it resolves to today and the fields under them are where you change it. Edit this one card and all six roles run on the new setting from the next run.\n\n## Fencing off a role's tools\n\n```\nprofiles:\n  strict-writer:\n    provider: claude\n    model: opus\n    # no nested sub-agent orchestration\n    disallowedTools: [\"Task\"]\n```\n\n## From the terminal\n\n```\nvibe profile list\nvibe profile add claude-max --provider claude --model opus --power max\nvibe profile set claude-max --power high\nvibe profile duplicate claude-max claude-cheap\nvibe profile remove claude-cheap\n\nvibe run \"task\" --profile claude-max\nvibe run \"task\" --step-profile implement=claude-max\n```"
    },
    {
      "id": "docs/concepts/project-params",
      "kind": "doc",
      "title": "Project parameters",
      "source": "Vibestrate docs: concepts/project-params",
      "summary": "Answers a flow needs, given once and reused, so you are not asked the same things every run.",
      "titleTerms": "parameter project",
      "terms": "0 02 08 1 118 12 127 14 2026 2026-08-12 4317 a acm acme-api against all and answer anyth api are as ask astro at automatic bdd beyond brand by check chosen cohesiv color concept default deploy did enum env environment every explicit fail fals fast flow for form framework from generat get gitignor given glob hous how id in increment input instruct is json keep key know list methodology my my-deploy nam need never new nich not onc one openai openai_api_key option otherwis palett panel param parameter per per-flow planner profil project project-glob project-param recogniz ref relat requir retyp reus rol run sam sav scaffold schema scop secret set shar shell simpl so stor str styl supersed t09 tdd termin the them thing tip token tru typ type-check ui unknown unset use user valu vers vib vibestrat vibestrate_param vibestrate_param_color_token when word would x yml you z",
      "body": "## In simple words\n\nSome flows need a few answers before they can work: a project name, a brand colour, which framework you use. **Project parameters** let you give those answers once.\n\nThe dashboard's **Settings** page carries a **Project parameters** panel. Pick the flow, fill its fields, press **Save**, and every later run reuses the values. Underneath, that is a small JSON file:\n\n```\n// .vibestrate/project-params.json\n{\n  \"schemaVersion\": 1,\n  \"values\": {\n    \"scaffold.projectName\": {\n      \"value\": \"acme-api\",\n      \"setBy\": \"user\",\n      \"at\": \"2026-08-12T09:14:02.118Z\",\n      \"secret\": false\n    },\n    \"scaffold.framework\": {\n      \"value\": \"astro\",\n      \"setBy\": \"user\",\n      \"at\": \"2026-08-12T09:14:02.118Z\",\n      \"secret\": false\n    }\n  }\n}\n```\n\nEach entry records who set it and when.\n\n## Secrets\n\n```\nparams:\n  apiKey:\n    type: string\n    secret: true\n```\n\n```\n# The store keeps env:OPENAI_API_KEY, not the key\nvibe params set --flow my-deploy apiKey=OPENAI_API_KEY\n```\n\n## Generate a default (optional)\n\n```\nparams:\n  palette:\n    type: string\n    generate:\n      instruction: >\n        Generate a cohesive color palette\n        for a {{params.niche}} brand\n```\n\n## Methodology (a recognized project-global param)\n\n```\n# Recognized values: tdd, bdd, incremental\nvibe params set methodology=tdd\n```\n\n## From a terminal\n\n```\n# The --flow form type-checks values against the schema\nvibe params set --flow scaffold projectName=Acme framework=astro\n\nvibe params list           # every stored value, secrets as env refs\nvibe params get <key>\nvibe params unset <key>    # explicit, never automatic\n```"
    },
    {
      "id": "docs/concepts/provider",
      "kind": "doc",
      "title": "Provider",
      "source": "Vibestrate docs: concepts/provider",
      "summary": "What actually runs a model - a coding-agent CLI on your machine, or an HTTP endpoint.",
      "titleTerms": "provider",
      "terms": "0 1 11434 127 4 5 a accept actually add advanc agent ai ai-compatibl along also an and anthropic anthropic-api anthropic_api_key api apply are as ask bas built built-in c capability catalog claud claude-cod claude-haiku claude-pro claude-sonnet-4-5 clear cli cloud cod code_writ coding-agent com command compatibl concept config configur cor crew custom default destinat detect did doctor driv dry dry-run eco edit effort egress endpoint entry env env-ref environment exist explicitly extern family finetun flag for forc format four from further gemini going haiku help http http-api if in install is it json key kind knob know level list liter loc localhost localhost-proxy login machin mak md miss mod model my my-finetun mycli nam need network never no not noth null ollama ollama-loc on only open openai option or order output over overlay own p permiss permission-mod popular preset pro prob probe-cloud profil project prompt provider providers-catalog proxy qwen3 r raw real reason ref refresh remov replac run saf safe-mod sav server set setup shell show simpl smok sonnet sourc sovereignty submit suggest tag termin test the thi tip to token tru turbo typ up url usag use user v1 valu vib vibestrat what which why wir with word would writ yaml yml you your zero zero-egress",
      "body": "## Cloud APIs and local model servers\n\n```\nproviders:\n  # Cloud API - your own key, external destination.\n  anthropic-api:\n    type: http-api\n    api: anthropic       # or: openai\n    baseUrl: https://api.anthropic.com\n    model: claude-sonnet-4-5\n    # env-ref ONLY - never a literal key\n    apiKey: env:ANTHROPIC_API_KEY\n\n  # Local model server - no key, no egress.\n  ollama-local:\n    type: localhost-proxy\n    # or: openai, for OpenAI-compatible servers\n    api: ollama\n    baseUrl: http://localhost:11434\n    model: qwen3.5\n```\n\n## The capability catalog and your overlay\n\n```\n# .vibestrate/providers-catalog.yml\ncli:\n  mycli:\n    models: [turbo, eco]\n    # -> --model turbo\n    model: { kind: flag, flag: --model }\n    effort:\n      levels: [eco, turbo]\n      # -> --set reasoning=turbo\n      apply:\n        kind: config\n        flag: --set\n        key: reasoning\n  gemini:\n    # explicitly clear a built-in knob\n    effort: null\nhttp:\n  openai:\n    # add a model suggestion to this api family\n    models: [my-finetune]\n```"
    },
    {
      "id": "docs/concepts/role",
      "kind": "doc",
      "title": "Role",
      "source": "Vibestrate docs: concepts/role",
      "summary": "One worker in your crew - what it does, what it may touch, and which model it runs on.",
      "titleTerms": "rol",
      "terms": "3 8 a accept all and api approv arbiter architect are as assembl assign attach balanc block builder can challenger cheap claud claude-balanc claude-cheap claude-cod cli cod code_writ concept config context cor crew default deliberately did doe each edit every executor field fil fixer flow from gat glob how id implementer in init instruct is it its json know label load markdown may merg merge_ready mod model new not on one only order outsid patch path permiss permission-mod planner post profil project prompt provider put read read_only ready refus requir require_approv resolv reviewer rol role-field role-prompt role-skill rul run runtim seat shell ship show simpl six skill subject such tak termin that the thi thre tip to touch verifier vib vibestrat what which word worker writ yml you your",
      "body": "## In simple words\n\nA **Role** is one worker on your crew. Think job description, not person: it says what this worker does, which kinds of step it may pick up, and how strong a model it runs on.\n\nOpen **Crew** in the dashboard sidebar, pick a crew, and the **Roles** section is a card per worker. Each card is the whole role, editable where it stands: **Seats it takes**, **Profile (runtime)**, a permissions control, **Skills**, and **Instructions**.\n\n**Tip.** The permissions control on the card is what decides whether this worker can change your code. Planner, architect, reviewer and verifier ship **Read only**. Only the executor and fixer are set to **Can write**, and only inside the run's worktree.\n\n!A role card for Planner. A Seats it takes row lists ten chips with planner highlighted. A Profile runtime row reads claude balanced, ok medium, with New profile and Read only controls. Below that, empty Skills and a collapsed Instructions section.\n\nA role is its seats, its profile, its permission, its instructions and its skills.\n\n**Did you know?** Named roles are what make a run inspectable. The planner only plans and the reviewer only reviews, so when something goes wrong you can see which worker did it. It is also what lets you put a different vendor on review, so the reviewer does not share the writer's blind spots.\n\n## The six that ship\n\n`vibe init` writes six roles. Each fills the seat its id names, plus any others listed.\n\n## From the terminal\n\n```\nvibe crew show default              # every role, its profile, its seats\nvibe skills assign <role> <skill>   # attach a skill to one role\nvibe config show                    # the crews block as loaded\n```"
    },
    {
      "id": "docs/concepts/run",
      "kind": "doc",
      "title": "Run",
      "source": "Vibestrate docs: concepts/run",
      "summary": "One attempt at a task, driven through a flow by a crew, in its own copy of your repo.",
      "titleTerms": "run",
      "terms": "0 1 127 4317 a abort approv assuranc at attempt automat block by chang changes_request concept control copy cor creat crew describ detail did diff driven end execut fail fil fix flow for how human id in inspect is isolat its know liv merg merge_ready metric miss need needs_human of on one order own pass paus re re-run read ready record replay repo request review run sam shell simpl statu task termin the thre through timelin tip ui validat verdict vib view wait waiting_for_approv watch what with word workspac you your",
      "body": "## In simple words\n\nYou have a task (what you want done), a flow (the recipe), and a crew (who does it). A **Run** is what happens when you put those three together and press go.\n\nOne run is one attempt. It gets its own copy of your repository to work in, walks the flow's steps in order, and stops at a verdict. Your actual branch is untouched the whole time.\n\n`vibe ui` opens the dashboard on `127.0.0.1:4317` and lands on **Mission control**: the supervisor, the new-run composer, and a **Waiting on you** deck of anything holding for your approval. The sidebar lists every live run, and clicking one opens **Run detail**.\n\n**Tip.** A run is cheap to throw away: abandoning one costs you the tokens it spent and nothing else. That is what makes it safe to try something.\n\nEverything a run is fits in the top of that page:\n\n!The header of a finished run. A green panel on the left reads Run, merge ready. Beside it the task, then Flow Default with its eight steps listed in order - Plan, Architecture, Implement, Validate, Review, Fix, Re-validate, Verify - and a row reading default provider, 5m 27s elapsed, and a diff of plus 24 minus 1 across 2 files.\n\n**View diff** sits in the header row, and **Re-run with changes** joins it there once the run is finished. **Pause** and **Abort** are a level down, on the status hero, for as long as the run is live.\n\n## How a run ends\n\nA run always lands in one of four places, and only the first is mergeable.\n\n**merge_ready** Every step passed. The change is waiting for you to take it.\n\n## Automation\n\n```\nvibe run \"describe the change\"\nvibe status\nvibe replay <runId>\nvibe abort <runId>\n```"
    },
    {
      "id": "docs/concepts/safety",
      "kind": "doc",
      "title": "Safety - Action Broker & policies",
      "source": "Vibestrate docs: concepts/safety",
      "summary": "Every real effect a run has crosses one checkpoint, which decides it against your rules and writes down what it decided.",
      "titleTerms": "act broker policy safety",
      "terms": "0 1 120 127 20 40 42 4317 a about act advisory against allow allowlist already anchor and any api applicabl apply apply-only approv are artifact as ask assuranc at attend audit auto auto-retri automat autonomy backend backoff banner befor block blocker bound boundary broken broker budget but cap ceil chang changes_request check checkpoint claud claude-cod clear cli clock cod codex command complet concept confidenc config confinement container control count creat crew cross daily day decid dedicat default defens deny depth descript deterministic did diff docker doctor doe dollar dotenv down downgrad downgrade-model duplicat dur effect effort egress engin env environment every exec execut exhaust exit fail fallback fetch fil find fix flag flow for format gat get git glob guard hard harden harden-read-only has hiccup hold hold-merge-for-review i id in inactivity inert init inspect install is isolat it json kind know lik limit list load match max max-time-day max-turns-run mcp md merg merge_ready messag metric min minut miss mod model ms nam nativ ndjson need network never new no no-network-install no-secret-writ non non-zero not not_applicabl not_run noth npm off on one only or os output output-format pars parti partially partially_verifi pass past patch path paus per permiss permission-mod pip plan policy post post-turn postur profil project provider provider-nativ re re-run read read-only ready real reduc reduce-effort refu refus regex reject render report request requir require_approv resilienc retri review root rul run s safety sam sandbox scor seat secret set shap shell show sign simpl skill skip skipped_inert_diff smarter spawn spend src stall start statu stop stream stream-json strict strict-apply-only subscript supervisor tab talk termin the thi throw tim timeout tip to today tool tool_us transient tre tru ts turn typ ui unattend unbound unbounded_unattended_run unground unsaf uploader usag usd use validat verdict verifi vib vibestrat wait wall watchdog what which why with without word worktre writ yml you your zero",
      "body": "## Writing a policy file\n\n```\n# .vibestrate/policies/safety.yml\nactions:\n  - id: no-network-installs\n    description: Block installs during validation.\n    on: [command.run]\n    match:\n      commandRegex: \"npm (i|install)|pip install\"\n      commandFlags: \"i\"\n    effect: deny\n    message: Network installs are not allowed.\n\n  - id: hold-merge-for-review\n    description: Sign off before merge_ready.\n    on: [run.complete]\n    match: { status: merge_ready }\n    effect: require_approval\n    message: Runs need approval before completing.\n\n  - id: no-secret-writes\n    description: Refuse writes to dotenv files.\n    on: [file.write, file.patch]\n    match: { pathGlob: \"**/*.env\" }\n    effect: deny\n    message: Writing secret files is blocked.\n```\n\n## Automation\n\n```\nvibe assurance <runId>           # the Run assurance verdict, --json for the artifact\nvibe audit <runId> --json        # the same tree the Inspect Tree tab renders\n\nvibe policies list               # what's loaded\nvibe policies doctor             # the parse/duplicate report; exits non-zero\nvibe policies check <patchFile>  # run a diff past the rules, like Check a patch\nvibe policies config --strict-apply-only true\nvibe policies config --harden-read-only true\nvibe config set execution.isolation sandboxed\n\nvibe run --permission-mode ask --unattended\nvibe budget set --max-turns-run 40 --max-time-day 120   # use `off` to clear\nvibe approvals show <runId> <approvalId>   # the same file list as the banner\nvibe approvals approve <runId> <approvalId>\n```"
    },
    {
      "id": "docs/concepts/sandbox",
      "kind": "doc",
      "title": "Container isolation",
      "source": "Vibestrate docs: concepts/sandbox",
      "summary": "Move a run off your machine entirely, so the blast radius is a disposable container.",
      "titleTerms": "container isolat",
      "terms": "0 1 127 169 254 4317 443 512 a admin agent all allow allowlist an and anthropic anthropic_api_key anthropic_base_url api aqf are assuranc auth aws back backend bas blast bomb cap cap-drop cap_net_admin carry claud cli clos cod codex com concept config confin connect container credenti cross default degrad deny did disposabl docker doe drop egress enetunreach enforcement entirely every exampl exec execut f fail fail-clos fall filesystem filter fit for fork fork-bomb fresh gateway github github_token guard hard harden hom host how http http_proxy https_proxy imag in insid intern is isolat it json key know label latest limit loc local-worktre localhost machin manag max mod model mor mov must my my-org nam narrow net network new no no-new-privileg not npmj of off on onc one only open openai openai_api_key operat opt opt-in org out outsid own per permit pid pids-limit postur pretend privileg process project provider provider-auth proxy prun ps radiu rather reach read read-only readonly refu registry rm root rul run s safety sandbox security security-opt servic set short simpl so stop than the tip tmp to token too tru turn ui unattend unavailabl url vib vibestrat vibestrate-agent vm wall want what when wher word worktre worth writ writabl yml you your",
      "body": "## In simple words\n\nBy default a run works on your machine, bounded by its own git worktree and the post-turn diff gate. For an unattended run, or a task you do not fully trust, you can move the agent **off your host entirely**: each provider turn then runs inside a disposable Docker container, and the blast radius becomes the container. Off by default.\n\nOne of the few things with no dashboard control. `vibe ui` opens the dashboard on `127.0.0.1:4317`; its **Config** page under **More** shows **Execution** read-only, with the command that changes it:\n\n```\nvibe config set execution.backend docker\n```\n\nWhat the dashboard *does* show is whether it worked: every run page ends in **Run assurance**, recording the run's **isolation posture** from per-turn provider evidence rather than config, so a run that ran on your host cannot report a container.\n\n## Hardened, and it refuses rather than pretend\n\n```\n# .vibestrate/project.yml\nexecution:\n  backend: docker   # default: local-worktree\n  container:\n    # the image MUST carry the provider CLI\n    image: my-org/vibestrate-agent:latest\n    # default. \"degrade\" falls back to the host\n    onUnavailable: fail\n    # default. writable: worktree, /tmp, HOME\n    readonlyRoot: true\n    # default. max processes (fork-bomb guard)\n    pidsLimit: 512\n```\n\n## Confining the network\n\n```\nvibe config set \\\n  execution.container.egress.mode allowlist\n```\n\n```\nvibe config set execution.container.egress.allow \\\n  '[\"registry.npmjs.org\", \".github.com\"]'\n```\n\n## Where it stops short\n\n```\ndocker network prune -f \\\n  --filter label=vibestrate.managed=true\n\ndocker rm -f \\\n  $(docker ps -aqf label=vibestrate.managed=true)\n```"
    },
    {
      "id": "docs/concepts/seat",
      "kind": "doc",
      "title": "Seat",
      "source": "Vibestrate docs: concepts/seat",
      "summary": "The empty chair a flow step needs filled - a label, not a name, which is what keeps flows shareable.",
      "titleTerms": "seat",
      "terms": "0 1 127 3 4317 a agent agent-turn and approv approval-gat architectur automat brief carry chain chair cli concept cor cover crew default descript did diff empty execut fil fill flow flow-schema follow gat id implement implementer in input is it its keep kind know label len model nam need not one order output plan portabl process profil project respons response-turn review review-turn reviewer rol s schema seat seat-rol sever shareabl shell show simpl src stay step summary summary-turn swap taker task task-brief termin the their them they thi tip touch ts turn two ui unassign validat vib way what whether which why without word work yml you your",
      "body": "## In simple words\n\nA flow step does not say \"use Claude\". It says \"this step needs a reviewer\". That labelled, empty chair is a **Seat**: a contract, not a person, naming the *kind* of worker a step needs and nothing about who fills it. Your crew does the filling, at the moment a task runs.\n\n**Crew** in the sidebar is where you see the chairs; `vibe ui` opens the dashboard on `127.0.0.1:4317`. A crew's header counts roles, seats and anything uncovered. The ring below reads *n/m seats filled*: each arc is one seat, tinted by the role that takes it, and hovering names both. Leftovers group as **Unassigned**, which no role covers, and **Several takers**, where more than one role claims a seat. Neither is runnable: the resolver refuses rather than picking for you, and `--seat-role = ` names the one you want. Under the ring, **Roles** lists each worker as a card.\n\n**Tip.** One worker can take several seats. That is why six workers can staff a flow with eight steps, and why you rarely need to add a role because a flow got longer.\n\n## What a seat carries\n\n```\nseats:\n  implementer:\n    label: Implementer\n    description: Implements the plan and architecture.\n\nsteps:\n  - id: implement\n    label: Implement\n    kind: agent-turn\n    seat: implementer\n    inputs: [task-brief, plan, architecture]\n    outputs: [execution, diff]\n```\n\n## Automation: the CLI\n\n```\n# a flow's seats, its ordered steps, and whether your crew covers them\nvibe flows show default\n\n# your crew's roles, their profiles, and the seats they fill\nvibe crew show\n```"
    },
    {
      "id": "docs/concepts/skill",
      "kind": "doc",
      "title": "Skill",
      "source": "Vibestrate docs: concepts/skill",
      "summary": "A markdown file of house rules, attached to the roles that need it, so you write your conventions once.",
      "titleTerms": "skill",
      "terms": "0 1 127 4317 8 a act agent and api assign at attach befor belong bit boundary branch caller claud cod coerc com common concept consol convent crew default did domain edit endpoint ephemer error error-handl every everyth fetch fil from gat handl hous id in info input is it its js key know knowledg lik list log logger markdown md messag mistak mor nam ndjson need never no of on onc oncall oncall-runbook one or payment planner project prompt refund reject relat return rol rul run runbook shell show simpl singl skill so sourc src step stuck teach that the them they thi thing tip to transact typ ui unassign unknown url use validat vib vibestrat what wher word writ x yml you your",
      "body": "## In simple words\n\nA **skill** is a markdown file you write once and attach to an agent. Use it for the things that should always be true about your codebase: your conventions, your security rules, the \"we do not do X here\".\n\nIt is the note you would hand a careful new colleague on their first day.\n\n```\n# API conventions\n\n- Every endpoint validates its input at the boundary. Reject unknown keys;\n  never coerce them.\n- Errors return a typed code. Callers branch on the code, never on the message.\n- No `console.log` in source. Use the logger in `src/logger.js`.\n```\n\nThat is a whole skill. It lives under `.vibestrate/skills/`, and you attach it on the **Crew** page: `vibe ui` opens the dashboard on `127.0.0.1:4317`, and every role card there has a **Skills** field.\n\n**Tip.** A skill is the cheapest fix for \"the model keeps doing the thing I told it not to\". Try it before a custom flow or a policy: far less machinery, and it applies to every task.\n\n## What belongs in one\n\n**Conventions** Naming, error handling, which logger, which test style.\n\n**Things that bit you before** \"This module is load-bearing, do not refactor it casually.\"\n\n**Domain knowledge** What a term means in your business, which a model cannot infer.\n\n**Boundaries** Which layers may talk to which, and what never crosses.\n\n## Attach one to a role\n\n```\nvibe skills list\nvibe skills show <name>\nvibe skills assign <agent> <skill>\nvibe skills unassign <agent> <skill>\n```\n\n```\ncrews:\n  default:\n    roles:\n      planner:\n        skills: [payments, error-handling]\n```\n\n## Attach one to a step, or to a single run\n\n```\nvibe run \"Refund a stuck transaction\" --skills payments,oncall-runbook\n```"
    },
    {
      "id": "docs/concepts/spec-up",
      "kind": "doc",
      "title": "Spec-up (plan before you build)",
      "source": "Vibestrate docs: concepts/spec-up",
      "summary": "Turns a vague brief into a written spec by asking you the questions it cannot answer itself.",
      "titleTerms": "befor build plan spec spec-up up you",
      "terms": "0 1 127 4317 a accept acceptanc adaptiv all an answer anyth approv architectur ask auto auto-pick befor beyond board brief build by cannot card chain chosen command complet concept coverag creat did dismiss draft dry dry-run earn ecommerc edit editor els fil flow forc from gap get hand her hol honest id ids in intak into it item its itself keep know limit matter mini new next no no-select not off on one otherwis pag pick proc propos prototyp quest ready register remember review risk roadmap round run s sav scop seed select shell simpl simplify someon spec spec-up spec-up-intak start stor submit suggest synthesi synthesiz termin the tip to tre turn twic ui up use vagu valu vib week what when why will with word work would written you your",
      "body": "## In simple words\n\nMost planning tools answer \"how do I write this change?\" **Spec-up** answers the question before it: *what are we actually building, and what have you not told me yet?*\n\nGive the dashboard's **New run** form a brief that reads like a whole system - \"a mini ecommerce store\" - and the run opens on questions rather than code. You answer the ones you can, it writes a spec from your answers, and only then does a flow run against that spec.\n\n**Tip.** You do not have to ask for this. A brief that reads like a whole system triggers it automatically, and every run tells you afterwards that it happened. The trigger is biased toward executing: it fires only on a clear build-a-system reading, and never when the brief names a concrete file. `adaptiveSpecUp: off` on the Config page stops it entirely; `--no-select` skips it for one run.\n\n## When it earns its keep\n\n**A brief with holes in it** \"Add billing\" hides a dozen decisions. Better to surface them before code exists than during review.\n\n**Work you will not remember next week** The spec is a written artifact. It outlives the run.\n\n## From a terminal\n\n```\nvibe spec-up start \"a mini ecommerce store\"\nvibe spec-up questions <runId>   # the round's ids\nvibe spec-up simplify <runId> <questionId>\nvibe spec-up suggest <runId> --all\nvibe spec-up answer <runId> --answer <id>=<value>\nvibe spec-up answer <runId> --proceed\n```\n\n```\nvibe spec-up edit <runId> scope\nvibe spec-up approve <runId>     # -> the roadmap synthesis run\nvibe spec-up build <runId>       # -> the chosen flow, seeded\nvibe spec-up roadmap <runId>     # -> a proposal\nvibe roadmap accept <proposalId> # -> roadmap items + board cards\n```"
    },
    {
      "id": "docs/concepts/state",
      "kind": "doc",
      "title": "Run state",
      "source": "Vibestrate docs: concepts/state",
      "summary": "The status a run is in, what each one means, and the rules that keep moves between them honest.",
      "titleTerms": "run stat",
      "terms": "a abort agent agent-rais all allow allowed_transit and approv architect are ask at automat between block c chang concept cor creat dashboard detail did each enforc error execut fail filter fix for from gat guidanc honest id in is it json keep kind know list look mark mean merg merge_ready mov of on one only open order paus plan r rais ready recoverabl reject relat replay request request-chang requir resum review rul run sam shell simpl stag stat statu termin that the them tip to transit two validat verify vib wait waiting_for_approv what wher why word worth you",
      "body": "## In simple words\n\nA run is always in exactly one **state**, never two at once and never one the tracking invented.\n\nOn the dashboard that value is the Status column of **All runs**, behind Runs in the sidebar. The counts and the scheduler queue sit above the table; the sidebar repeats Active, Merge-ready and Failed as filters.\n\n**Tip.** The four terminal states mean different things. `blocked` is a *decision* - something refused. `failed` is a *crash* - a step broke. `aborted` is *you*. Only `merge_ready` is a change you can take.\n\n!The runs table, with the integration and scheduler panels above it. Rows carry Task, Status, Review, Verify, Duration, Updated and Run columns, two of them reading merge ready with review approved and verify passed, and each row ends in a Replay button. Above the table, three checked runs are staged for integration into integration/main behind Preview merges and Integrate selected, tagged never main and never push. Beside them the scheduler reads nothing running or queued, with Start the queue and Open the board.\n\n## Automation\n\n```\nvibe status\nvibe status --json\nvibe replay <runId>\nvibe pause <runId>\nvibe resume <runId>\n```\n\n```\nvibe approvals list <runId>\nvibe approvals approve <runId> <approvalId>\n# reject marks the run blocked\nvibe approvals reject <runId> <approvalId>\n# agent-raised gates only\nvibe approvals request-changes \\\n  <runId> <approvalId> --guidance \"...\"\n```"
    },
    {
      "id": "docs/concepts/supervised-tasks",
      "kind": "doc",
      "title": "Supervised tasks",
      "source": "Vibestrate docs: concepts/supervised-tasks",
      "summary": "A task with ordered steps, sequenced one at a time by the Conductor instead of run in one pass.",
      "titleTerms": "supervis task",
      "terms": "0 1 127 20 4317 a acceptanc add agent aliv all and at audit author between beyond board by card check checklist cleanly clear com concept conductor config context curat did dismiss do doe enabl enhanc escalat failur fals fil fresh from goe ground halt hint how id in install instead invariant it keep know launch launchctl leav ledger library load log max mod model myproject new not objectiv of on on-failur one only or order out packet pass paus plain plan plan-only plist profil project queu re re-ground re-sequenc reboot refin relat remov reorder restart resum roadmap run scheduler sequenc servic shell simpl spend src statu step supervis supervised-task supervisor systemd task termin the tim tip ts ui usd vib vibestrat vs w what with word writ writer yet yml you",
      "body": "## In simple words\n\nThere is no separate \"saga\" kind of task. A task has an ordered set of **steps** and a **run mode** deciding how they run:\n\n**plain** The default. The flow runs the whole task in one holistic pass.\n\n**supervised** The **Conductor** sequences the steps one at a time, each with its own review.\n\nYou pick the mode when you make the card: on the dashboard's **Board** page, **New task** carries a dropdown with **Plain run** and **Supervised (steps)**.\n\nSupervised is for work that is several changes wearing one title: a migration with four stages, a feature with a backend half and a frontend half.\n\n**Tip.** Reach for supervised when a single diff would be too big to review honestly. The point is not more automation, it is smaller units a human can actually check one at a time.\n\n## Leaving it running\n\n```\nvibe queue service --out ~/Library/LaunchAgents/com.vibestrate.scheduler.myproject.plist\nlaunchctl load -w ~/Library/LaunchAgents/com.vibestrate.scheduler.myproject.plist\n```\n\n## From a terminal\n\n```\nvibe tasks add \"Add audit logging\" --supervised\nvibe tasks checklist add <id> \"Write the writer\" \\\n  --objective \"...\" --acceptance \"...\" \\\n  --files \"src/audit/*.ts\"\n\nvibe tasks sequence <id>   # Sequence\nvibe tasks status <id>     # steps, invariants, halt\nvibe tasks pause <id>      # between steps\nvibe tasks resume <id>     # clear a pause, or re-sequence a halted task\n```"
    },
    {
      "id": "docs/concepts/supervisor",
      "kind": "doc",
      "title": "Supervisor",
      "source": "Vibestrate docs: concepts/supervisor",
      "summary": "The judgment Vibestrate brings to a run - how hard it looks, and a labelled record of every call.",
      "titleTerms": "supervisor",
      "terms": "0 1 127 4317 a add adopt adoptabl advis aim an and apply approv archetyp are auto automat block bring call can car cheap cheap-reviewer claud concept config copy cross cross-model default did enforc engineer every flow for from haiku hard harden hawk heavier how in it judgment know label len list login look mak migrat mod model mor new not of on one or own permiss permission-mod persona pick plan policy postur preferenc profil project provider record remov replac resum review reviewer risky rul run s safety sandbox sandbox-suggest seat security security-hawk set shell simpl singl single-profil six staff staff-engineer statu stop structur suggest supervisor the then thing thrifty tip to two ui use vib vibestrat what who why word work writ yml you your",
      "body": "## In simple words\n\nA **supervisor** decides how hard to look at the work before calling it done. It sets the level of scrutiny, then writes down every call it makes. A building inspector, not the crew.\n\n`vibe ui` opens the dashboard on `127.0.0.1:4317`. **Supervisors**, under **More** in the sidebar, is the catalog: every supervisor available, which one is the default, and **Set default** on each card. The **New run** page carries a **Supervisor** picker that overrides the default for one run.\n\n**Tip.** `single-profile` on the run's Supervisor panel is the supervisor telling on itself: one model both wrote and judged, so the review is a self-check. Point the reviewer role at a second provider and the tag becomes `cross-model`. The label can lower your confidence in a result; it never inflates it.\n\nYou meet the result at the top of a run:\n\n!The Supervisor panel of a run. It names staff-engineer, tags the review single-profile, and shows 3 decisions. Three judgment rows read verify PASSED, review APPROVED, and review aimed through 3 lenses - correctness, tests and security-risk.\n\n## Picking one, and picking who reviews\n\n```\npersonas:\n  thrifty:\n    label: Thrifty staff engineer\n    reviewerProfile: cheap-reviewer  # review seats\nprofiles:\n  cheap-reviewer:\n    provider: claude\n    model: haiku\n```\n\n## Automation\n\n```\nvibe supervisor list          # what you can pick\nvibe supervisor archetypes    # the six adoptable ones\nvibe supervisor adopt security-hawk    # copy it in\nvibe supervisor default security-hawk  # then use it\nvibe run \"harden the login\" --supervisor security\n```"
    },
    {
      "id": "docs/concepts/supervisor-control",
      "kind": "doc",
      "title": "Supervisor Control",
      "source": "Vibestrate docs: concepts/supervisor-control",
      "summary": "The Supervisor chat on Mission Control. It answers from your real project, remembers the thread, and can act once you let it.",
      "titleTerms": "control supervisor",
      "terms": "0 1 127 40 4317 6 a act add advis already an and answer api approv are as attachment automat autonomy back budget build button can cannot ceil chat checklist clos cod com composer concept config consult control conversat creat destinat did diff differ discuss do doe edit effort exist fail fin flag from gat header how in instruct is it item its know last leav leg let limit liv mad materi max max-turns-run md me messag miss nam never new no not noth now on onc one only or panel permiss preview profil project propos prov public quest quot rat rate-limit real reason remember requir require_approv resum reversibl review rout rul run s safety sam second set shell show simpl start statu stop supervisor supervisor-control switch task the thread tip todo turn ui undo uneven upload verbatim vib vibestrat what why will without word work writ you your",
      "body": "## In simple words\n\n**Supervisor Control** is the chat panel titled **Supervisor**. Type what you want. It answers from your real project - your files, your config, your recent runs - and remembers what was said earlier in the thread.\n\n`vibe ui` opens the dashboard on `127.0.0.1:4317`. The panel is first on **Mission control** by default, above the **New run** composer, and the board is rearrangeable if you want it lower. The same panel sits on any run still in flight, and the consult orb at the bottom right opens it under **Work in Vibestrate**.\n\n**Tip.** Leave the header switch on **Answers only** while you are learning what it does. On that setting it reads anything and changes nothing, so a misunderstood question costs you a paragraph rather than a run.\n\nOne control matters more than the rest:\n\n!A two-position switch reading Answers only and Answers and acts, with Answers and acts selected.\n\nThat switch is a **permission**, not a stop. It decides whether the supervisor may make a task, add TODOs, or start a run. Stop is a different control: the red square that replaces Send while a turn is running.\n\n## One turn\n\n```\nanswer         a question, or discussion.\ntask.create    new work, not on an existing task.\nchecklist.add  TODO items on an existing task.\nrun.start      build it now, on an existing task.\n```\n\n## Automation\n\n```\nvibe supervisor status                              # running, or stopped and why\nvibe supervisor stop --reason \"reviewing the diff\"  # same flag as the header switch\nvibe supervisor resume\nvibe budget set --max-turns-run 40                  # the ceiling act requires\nvibe config set supervisorControl.autonomy act\n```"
    },
    {
      "id": "docs/concepts/task",
      "kind": "doc",
      "title": "Task",
      "source": "Vibestrate docs: concepts/task",
      "summary": "The plain-language brief you hand Vibestrate. A sentence is enough to start.",
      "titleTerms": "task",
      "terms": "0 1 127 4317 9 a acceptanc add additiv adjectiv adjective-noun all and append apply assuranc attach audit author auto auto-pick automat backlog becom block board bold bold-lovelac break brief bring but by c cap cap-and-continu card chang check checklist cli comment concept configurabl connector constraint continu continuou cor correctness creat crew criteria csv d deriv detach detail did dismiss don draft dry dry-run e enhanc enough enter exist export fil flow forc from good hand handler health how human id import improv in in_progress includ inherit instead into is it item its jira json key know languag ledger len lib list log logger look lovelac manually matter merg merge_ready mov n nam need never new not noun one only open order out own parent pend per per-item pick pickup pickup-review plain plain-languag plan plausibl plausible-but-wrong progress propos q r read read-only ready reopen return review risk roadmap rout run sav say security security-risk see select sentenc server set shell should simpl src start statu step step-by-step structur summary supervis tak task termin test that the their their-export then tip titl to ts ui use user valu vib vibestrat what when whol why will word work would writ wrong yet you",
      "body": "## In simple words\n\nA **Task** is what you want done, written the way you would brief a capable colleague. You say what you want; Vibestrate works out the steps. No file lists, no ordering.\n\n## Writing a good one\n\n```\nAdd structured logging to the settings save handler in\nsrc/server/routes/settings.ts. Use the existing logger from\nsrc/lib/logger.ts. Include the user id and the changed keys,\nbut never the values.\n```\n\n```\nImprove logging\n```\n\n## Bringing a backlog in, and taking it out\n\n```\nvibe tasks import their-export.csv --dry-run   # see what it would create\nvibe tasks import their-export.csv\nvibe tasks export --out board.csv\n```\n\n## Automation: the CLI\n\n```\n# start a run from a brief\nvibe run \"Add structured logging to the \\\nsettings save handler\"\n\n# author a checklist\nvibe tasks checklist add <taskId> \\\n  \"/health returns json\"\nvibe tasks checklist list <taskId>\nvibe tasks checklist check <taskId> <itemId>\nvibe tasks checklist status <taskId> <itemId> \\\n  in_progress\nvibe tasks checklist move <taskId> <itemId> 1\n\n# draft one instead: read-only, then append\nvibe tasks enhance <taskId>\nvibe tasks enhance <taskId> --apply\n```\n\n```\nvibe tasks pickup <taskId>\nvibe tasks pickup <taskId> --step\nvibe tasks pickup <taskId> --flow pickup-review\n```\n\n```\nvibe run \"<task title>\" \\\n  --task <taskId> \\\n  --flow pickup-review \\\n  --checklist continuous\n```"
    },
    {
      "id": "docs/concepts/vibestrate-md",
      "kind": "doc",
      "title": "VIBESTRATE.md",
      "source": "Vibestrate docs: concepts/vibestrate-md",
      "summary": "A committed manual at your project root, so you never re-explain your project.",
      "titleTerms": "md vibestrat",
      "terms": "a against and append apply arbitrat ask at author be best bil build careful codebas codebase-map command commit concept constraint consult convent credenti crew development did do effort els entry execut explain express flow for generat get go goe good guid guidanc head heavier how http id implementer in init install is it json know known layout learn ledger lesson machin machine-own manu map md mod model money never not noth onc one only open or orchestrat order other own path planner pnpm point policy prefer preferenc print project propos provider quality quality-arbitrat r rank re re-explain read refresh relat review risk rol root rout rul run s sandbox scaffold servic shell should show simpl so someth src starter surfac task teach test text that the thi through tip to touch typecheck ui use vib vibestrat vibestrate-md what when who word work writ x you your",
      "body": "## In simple words\n\n`VIBESTRATE.md` is a committed file at your project root saying what this project is and how you like it run: its domains, its commands, the conventions you keep having to repeat.\n\n```\n# VIBESTRATE.md\n\n## Project Model\nA billing service. Money flows through `src/ledger/` and nothing else writes to it.\n\n## Development Commands\npnpm install · pnpm typecheck · pnpm test · pnpm build\n\n## Risk Rules\nPropose sandbox mode when a task touches provider execution or credential paths.\n```\n\nYou read it back through **consult** - the orb in the corner of every dashboard page. Ask \"should this use a heavier review?\" and the answer is grounded in your manual rather than guesswork.\n\n**Consult is the only surface that reads it. Runs do not.** A rule every agent must follow on every turn belongs in `.vibestrate/rules.md` instead. Either way the manual is advisory: it shapes how work is planned, and can never override a code-enforced policy.\n\n**Tip.** Prune it. The file is read as context, so every stale paragraph competes with the parts that still matter, and a page mostly out of date is worse than no page.\n\n## Ask it something\n\n```\nvibe consult \"should this use a heavier review?\"\nvibe guide show                # print the manual\nvibe guide init                # scaffold a starter one\nvibe guide proposals           # open proposals\nvibe guide apply <id>          # append a proposal's text\n```\n\n## What goes in it\n\n```\n## Orchestration Preferences\nPreferred flows and crews; when to go heavier.\n\n## Codebase Conventions\n## Known Constraints\n## Lessons Learned\n```\n\n## Who gets the map\n\n```\ncodebaseMapRoles: [planner, implementer]\n```"
    },
    {
      "id": "docs/concepts/walkthroughs",
      "kind": "doc",
      "title": "Walkthroughs",
      "source": "Vibestrate docs: concepts/walkthroughs",
      "summary": "A walkthrough turns an answer into a guided tour - it moves you to the right screen and rings the control.",
      "titleTerms": "walkthrough",
      "terms": "0 1 127 4317 a an and answer anywher at author back beyond built button cam can check concept consult control crew dashboard deep did do doe empty exampl exist first flow for generat guid how i in into is it know link mak me mov navigat not noth on one only or pag panel point policy press right ring run screen set shell show simpl someth spot step supervisor tak that the ther through tim tip to tour turn ui under vib vibestrat walk walkthrough when wher word work written wrong you",
      "body": "## In simple words\n\nAn answer tells you what to do. A **walkthrough** stands you in front of it.\n\nAsk \"how do I make a crew?\" and the answer arrives with a **Show me how** button:\n\n!A supervisor answer explaining that a crew is the set of roles a run can hand work to, with a Show me how button underneath it.\n\nPress it and the dashboard moves to the Crew screen, draws a ring around the control the step is about, says what it is for, and waits for you to press Next.\n\n**A walkthrough can only navigate.** It never clicks a button, types in a field, saves, edits your config, or starts a run. That is the same ceiling every button under an answer has, and there is deliberately no third kind of action, because a third kind is how a chat button turns into an unreviewed effect. The pressing stays yours.\n\n**Tip.** If you are not sure where a setting lives, ask rather than hunt. \"Where do I set the default crew?\" gets you a walkthrough that puts your cursor on the control instead of a paragraph describing where it is.\n\n**Did you know?** Two kinds of walkthrough exist and both open the same overlay with the same privilege. Neither can do more than the other, so there is no \"trusted\" variant that quietly gets to act on your behalf.\n\n## Where the button is\n\nThis is a dashboard feature; `vibe ui` opens it on `127.0.0.1:4317`. `vibe shell` has none and no command starts one, because a walkthrough's whole job is moving a browser to a screen.\n\n## A worked example\n\n```\nHow do I make a crew?\n```"
    },
    {
      "id": "docs/concepts/workflow",
      "kind": "doc",
      "title": "Steps - the workflow of a run",
      "source": "Vibestrate docs: concepts/workflow",
      "summary": "The eight steps of the default flow, in order, and what each one is for.",
      "titleTerms": "a of run step the workflow",
      "terms": "0 1 127 4317 a accept add and approv arbitrat architect architectur architecture-handoff array artifact befor block bold bold-lovelac brief by chang changes_request claud command common concept context continu contract cor crew decis decision-summary default did doc doe each edit eight error event every execut execution-handoff express fail fast find finding-resolut finding-respon fix flow for fresh from ground handoff high how human human_approv implement in init is know long loop lovelac many max md merg merge_ready mistak n need needs_human of on one only opt opt-in order output pag panel panel-review pass pick plan plan-handoff pnpm quality quality-arbitrat rather re re-validat ready recip relat replay request requir resolut respon restart resum resume-from resume-stag retry reus review run run-brief runner seat sess set shar simpl skip split stag step summary termin than the thi thread tip token too track tre truth turn typecheck typo ui validat verify vib vibestrat wait waiting_for_approv way what when why word workflow you",
      "body": "## In simple words\n\nA **workflow** is the ordered set of steps one run works through, from submitted to a verdict. Every run executes a flow, so its workflow is that flow's steps.\n\nThis page is the canonical description of the built-in `default` flow:\n\n```\nplan -> architecture -> implement -> validate -> review -> verify\n                                        ^          |\n                                        +-- fix <--+   (only on CHANGES_REQUESTED)\n```\n\nEight steps. Six always run; **fix** and **re-validate** are loop-only, firing when review returns `CHANGES_REQUESTED`.\n\n`vibe ui` opens the dashboard on `127.0.0.1:4317`; a live run sits at the top of the sidebar, and **Runs** lists the rest under Active, Merge-ready and Failed. A run's page has seven tabs: **Steps** lists each step's state, **Tree** draws it as a node tree, **Events** is the raw stream, **Artifacts** holds every prompt and output, **Validation** carries the command results the loop turns on, **Terminal** shows the live process, and **Replay** walks a finished run event by event.\n\n## One runner, many recipes\n\n```\nvibe run \"...\"                  # Vibestrate picks\nvibe run \"...\" --flow default   # the eight steps\nvibe run \"...\" --flow quality-arbitration\n```\n\n## Fast tracks\n\n```\nvibe run \"fix the typo in the seat page\" --flow express\n\n# accepted stages: planning architecting\n#   executing reviewing fixing verifying\n# default: executing\nvibe run \"...\" --resume-from bold-lovelace \\\n  --resume-stage reviewing\n```"
    },
    {
      "id": "docs/concepts/worktree",
      "kind": "doc",
      "title": "Worktree",
      "source": "Vibestrate docs: concepts/worktree",
      "summary": "Every run works in a separate copy of your project, so your real files are never touched.",
      "titleTerms": "worktre",
      "terms": "a abort absolut after along are at auto automat block bold bold-lovelac branch bring buy cd chang checkout concept copy cor d default did diff dir each env environment every evidenc except fail failur fenc fil git honest id in keep know link liv lovelac main merg merge_ready modul never nod node_modul noth of off onc one only order path pem prefix project quiet quiet-tur ready real relat remov run see separat simpl so sourc termin the their thi tip to tool touch tur undo venv vib vibestrat vibestrate-worktre view what wher word work workspac worktre writ yml you your your-project",
      "body": "## In simple words\n\nEvery run does its work in a **separate copy** of your project, on its own branch. Your real files, the ones you have open in your editor, are never touched.\n\nThat copy is a git **worktree**: a second working folder of the same project, right next to your main one.\n\n**Tip.** You can keep coding in your real project while a run works. The two never collide, and git does not even notice the overlap.\n\nOpen a run on the dashboard and the **Workspace** panel names the copy:\n\n!The Workspace panel of a run. It names the branch, shows the run's isolated git worktree path, and offers a Copy cd button. A line below reads: the run's isolated git worktree, run vibe path for the same from the CLI.\n\n**Copy cd** puts a `cd` command for it on your clipboard. **View diff** at the top of the page reads every line the run wrote, file by file, and the **Terminal** tab under Inspect opens a shell already inside the copy.\n\n## What this buys you\n\n**Nothing to undo** A run you dislike is a folder you ignore. It never entered your branch.\n\n**Failures keep their evidence** A run that ends blocked, failed or aborted leaves its copy on disk. Open it, read the half-finished work, take anything useful.\n\n## Where the copies live\n\n```\ngit:\n  worktreeDir: ../.vibestrate-worktrees   # default\n  branchPrefix: vibestrate/               # default\n  linkEnvironment: auto                   # default\n```\n\n## Automation\n\n```\nvibe path <runId>          # worktree path + branch\nvibe path <runId> --cd     # only the absolute path\ncd \"$(vibe path <runId> --cd)\"\n```\n\n```\ncd your-project\ngit worktree remove ../.vibestrate-worktrees/<runId>\ngit branch -D vibestrate/<runId>\n```"
    },
    {
      "id": "docs/extending/add-flow",
      "kind": "doc",
      "title": "Add a Flow",
      "source": "Vibestrate docs: extending/add-flow",
      "summary": "Write your own run recipe with seats, steps, and an optional pause for your approval.",
      "titleTerms": "a add flow",
      "terms": "0 1 127 4317 a act add add-flow agent agent-turn an and approv approval-gat as befor behind both brief brows build builder but can challenger chang check clean clean-room clearer com command commit common continu creat customiz decid descript did diff draft dry edit exampl export extend f fil first flow flow-skip for fork form from gat h http hub human human-check id import in input keep kind know label list mistak model narrativ new not on one only open option or out output over over-stuf overwrit own past paus plan planner producer profil project prototyp prototyper pull read read-only reason recip relat request respons response-turn review review-turn reviewer rewrit rol room run s seat seat-rol shar shell simpl skill skip spec spik spike-and-decid step step-profil stop stuf summary summary-turn taken task task-brief the then tip to tru try turn twic ui url validat vers vib vibestrat view with word writ yaml yml you your",
      "body": "## In simple words\n\nA custom flow is a YAML file: `flow.yml` inside a directory named for the flow id, under `.vibestrate/flows/`. You rarely author one from scratch.\n\n## The file behind the builder\n\n```\nid: spike-and-decide\nversion: 1\nlabel: Spike and decide\ndescription: Prototype, then stop and decide.\n\nseats:\n  planner:\n    label: Planner\n    description: Plans the spike.\n  prototyper:\n    label: Prototyper\n    description: Builds the spike.\n\nsteps:\n  - id: plan\n    label: Plan the spike\n    kind: agent-turn\n    seat: planner\n    inputs: [task-brief]\n    outputs: [plan]\n\n  - id: prototype\n    label: Build the prototype\n    kind: agent-turn\n    seat: prototyper\n    inputs: [plan]\n    outputs: [diff]\n\n  - id: validate\n    label: Validate\n    kind: validation\n    inputs: [diff]\n    outputs: [validation]\n\n  - id: human-check\n    label: Stop and decide\n    kind: approval-gate\n    approval:\n      reason: Keep the spike, or rewrite?\n      requestedAction: continue\n```\n\n## Seats, not your models\n\n```\nvibe profile list\nvibe run \"...\" --flow spike-and-decide \\\n  --step-profile prototype=<profileId>\n```\n\n## Optional and clean-room steps\n\n```\n- id: review\n  label: Review\n  kind: review-turn\n  seat: reviewer\n  # reasons from the change and the spec\n  inputs: [diff]\n  # ...but not the producer's narrative\n  cleanRoom: true\n```\n\n## Share a flow\n\n```\n# export a flow to a file you can commit\nvibe flows export spike-and-decide \\\n  --out spike-and-decide.flow.yml\n\n# import one from a file or an http(s) URL\nvibe flows import ./spike-and-decide.flow.yml\nvibe flows import \\\n  https://example.com/spike-and-decide.flow.yml\n```"
    },
    {
      "id": "docs/extending/add-provider",
      "kind": "doc",
      "title": "Add a provider",
      "source": "Vibestrate docs: extending/add-provider",
      "summary": "Tell Vibestrate how to run a local coding CLI it doesn't already know, or change the flags of one it does.",
      "titleTerms": "a add provider",
      "terms": "0 1 11434 127 4 4317 5 6 a add add-provider agent already an and anthropic anthropic-api anthropic_api_key api apply arg assign bas binary can chang claud claude-cod claude-experiment claude-fast claude-sonnet-4-6 cli cloud cod codex color com command common connect crew custom declar default did diff dir do doe doesn edit env experiment extend fast fil flag four how http http-api id in input install instead it its json key know list liter loc localhost localhost-proxy login mistak model mor my my-coding-cli my-model my-model-default never no no-color of ollama ollama-loc on one only openai option or own p permiss pick popular profil project prompt prompt-on-stdin provider proxy put qwen3 read read_only referenc relat report reviewer rol run sam seat server set setup shar shell simpl sonnet stdin t tab tak tell test the tip to touch two typ ui up url usag verify vib vibestrat what with word work worktre wrap yml you",
      "body": "## In simple words\n\nA provider is how Vibestrate reaches a model - almost always a command-line tool already on your machine. The detector knows eleven, so most of the time you add nothing.\n\n## Declare a custom CLI provider\n\n```\nproviders:\n  my-model:\n    type: cli\n    command: my-coding-cli\n    args: [--prompt-on-stdin, --no-color]\n    input: stdin           # stdin | arg\n```\n\n## Assign the provider to a role\n\n```\nprofiles:\n  my-model-default: { provider: my-model }\n\ncrews:\n  default:\n    roles:\n      reviewer:\n        seats: [reviewer]\n        profile: my-model-default\n        prompt: .vibestrate/roles/reviewer.json\n        permissions: read_only\n```\n\n```\nvibe run \"...\" --profile my-model-default\n```\n\n## Wrap Claude Code with custom flags\n\n```\nproviders:\n  claude-experimental:\n    type: claude-code\n    command: claude\n    args: [-p, --model, claude-sonnet-4-6]\n```\n\n## A server instead of a binary\n\n```\nproviders:\n  ollama-local:\n    type: localhost-proxy\n    api: ollama                # or: openai\n    baseUrl: http://localhost:11434\n    model: qwen3.5\n\n  anthropic-api:\n    type: http-api\n    api: anthropic             # or: openai\n    baseUrl: https://api.anthropic.com\n    model: claude-sonnet-4-6\n    # an env reference, never a literal key\n    apiKey: env:ANTHROPIC_API_KEY\n```"
    },
    {
      "id": "docs/extending/add-skill",
      "kind": "doc",
      "title": "Add a skill",
      "source": "Vibestrate docs: extending/add-skill",
      "summary": "Write a markdown file, save it under .vibestrate/skills/, and attach it to a role or run.",
      "titleTerms": "a add skill",
      "terms": "0 1 127 2 3 4 4317 a about access add add-skill agent an and anti anti-pattern api api-convent arg assign attach auth auth-convent be beat body bound bullet check claud command convent creat crew default descript did directory discover editor exampl explicitly extend fa fetch fil flat flow for form good grant id in inspect is it json keep know list mak mark markdown mcp md ment mkdir mor nam not of one only option or p pattern payment permanently permiss pg pg-mcp planner plu postgr prefer profil project prompt query read read-only reason relat requir right rol rul run sav seat sentenc server sess shap shell short show simpl skill specific src stat stay step surfac that the thi tip titl to ts two ui unassign under use vib vibestrat was way we what when which with word writ x yml you",
      "body": "## In simple words\n\nA skill is a markdown file teaching your agents your project's conventions. There is no scaffold to run and no metadata form: write the file, and discovery picks it up.\n\n```\nmkdir -p .vibestrate/skills\n$EDITOR .vibestrate/skills/api-conventions.md\n```\n\nAttaching it is the dashboard's job. `vibe ui` (`127.0.0.1:4317`) > **Crew** > open a crew > each role card has a **Skills** block with a **+ skill…** picker. Whatever you attach is appended to that role's prompt on every turn.\n\n## 2. Write the body\n\n```\n# Title - what this is about\n\n## When to use this\n\nOne or two sentences naming the surface.\n\n## Rules\n\n- Bullet list of conventions.\n- Be specific. \"We use X\" beats \"we prefer X\".\n\n## Examples\n\nShort examples of the right way.\nMark anti-patterns explicitly.\n```\n\n## 3. Check that it was discovered\n\n```\nvibe skills list\nvibe skills show <name>\n```\n\n## 4. Attach it\n\n```\nvibe skills assign <agent> <skill>\nvibe skills unassign <agent> <skill>\n```\n\n```\ncrews:\n  default:\n    roles:\n      planner:\n        skills: [auth-conventions]\n        # plus seats, profile, prompt and\n        # permissions, which stay required\n```\n\n```\nvibe run \"Add 2FA\" --skills auth-conventions\n```\n\n## Optional: an MCP server\n\n```\n.vibestrate/skills/\n  postgres/\n    SKILL.md\n    .mcp.json\n```\n\n```\n---\nname: postgres\ndescription: Read-only Postgres access.\n---\n\n# Postgres MCP\n\nThis skill grants agents read-only Postgres\naccess, for inspecting queries.\n```\n\n```\n{\n  \"mcpServers\": {\n    \"postgres\": {\n      \"command\": \"pg-mcp\",\n      \"args\": [\"--read-only\"]\n    }\n  }\n}\n```"
    },
    {
      "id": "docs/getting-started/big-picture",
      "kind": "doc",
      "title": "The big picture",
      "source": "Vibestrate docs: getting-started/big-picture",
      "summary": "How Vibestrate runs a coding job, and what Task, Flow, Seat, Crew, Profile and Provider each mean.",
      "titleTerms": "big pictur the",
      "terms": "a add ai and api architect behind big big-pictur builder but can cannot chair challenger cli cod crew default did don each executor fil fill flow for get getting-start has hold how http http-api implementer in it job key know label localhost localhost-proxy machin mean model mor need new next no non of on one open or order overrid own pick pictur profil provider proxy reviewer rol routin run runtim s seat seat-rol senior senior-reviewer server set simpl start strong task team than that the thi through tip to tool up vib vibestrat want what with word worker you your",
      "body": "## In simple words\n\nVibestrate runs the AI coding tools you already have. You write the job down once, and a team of AI workers carries it out under rules you set.\n\nRunning several models on one job by hand is where the time goes: pasting the same context into a tool that has never seen your project, carrying the plan from one chat to the next, watching each one for drift. Vibestrate is the frame that work happens inside, so every worker starts from the same plan and the same project instructions, written once.\n\n**Tip.** Every word below is a screen in the dashboard: **Flows**, **Crew**, **Profiles**, **Crew > Providers**. Read this once, then start a run - the words land better after you have watched one happen.\n\n!The header of a finished run. A green panel reads Run, merge ready. Beside it the task, the flow it followed with its eight steps listed in order, and a row reading default provider, 5m 27s elapsed, and a diff of plus 24 minus 1 across 2 files.\n\nThat is the whole idea in one picture: one task, one recipe, one team, one verdict.\n\n## Seat - a labelled chair in the routine\n\n```\nThis Flow needs the \"architect\" seat, but crew\n\"default\" has no role that fills it. Open Crew\nand add \"architect\" to a role's Seats.\n```\n\n```\nCrew \"default\" has more than one role filling the\n\"reviewer\" seat (reviewer, senior-reviewer). Pick\none with a role override.\n```"
    },
    {
      "id": "docs/getting-started/first-run",
      "kind": "doc",
      "title": "Your first run",
      "source": "Vibestrate docs: getting-started/first-run",
      "summary": "How one run works, from the sentence you type into New run to the branch it leaves behind.",
      "titleTerms": "first run your",
      "terms": "5 a abort about add adjectiv adjective-noun anyth approv artifact assuranc auto auto-pick behind big block bohr branch can cd chang concis configurat copy crew decis did diff don end event fail fin first first-run flow for from get getting-start git handler hom how id in input into it know leav log main md merg merge_ready ndjson never new next noun one or order output p pass pick plan policy r ready replay review right roadmap run sav scop sentenc set short simpl small sourc start statu step stop structur t tab tak task termin that the tip to too tre typ ui unattend up use validat verificat verify vib vibestrat vibestrate-worktre watch well well-scop wher word work workspac worktre you your zen zen-bohr",
      "body": "## In simple words\n\n**New run**, at the bottom of the sidebar, starts a run. One field takes the task, everything else has a default, and **Start run** begins.\n\nVibestrate works in a second checkout of your repository, beside your project, so the files you have open never move under you. The run stops with the change on its own branch; nothing merges and nothing pushes, so the last call is yours.\n\n**Tip.** Pick something small for the first one. You are learning what a run looks like, not testing how much it can do, and a small task reaches a verdict in minutes.\n\n!The header of a finished run reading merge ready, with the task, the flow it followed, its eight steps, the elapsed time and the diff.\n\n## Where a run can end\n\n**merge_ready** Every check passed. The change is waiting for you.\n\n**blocked** Something refused: a review, a policy, a failed check.\n\n**failed** A step crashed. Its own output says why.\n\n**aborted** You stopped it.\n\n**Did you know?** A run you dislike costs nothing to discard. It never touched your branch, so there is no revert - you ignore the folder. That is what makes it safe to try something you are unsure of.\n\n## Pick a small, well-scoped task\n\nVibestrate works best on what you'd hand a careful colleague: clear scope, code you can point at, a way to tell when it's done.\n\n## From the terminal\n\n```\nvibe run \"Add structured logging to the \\\nsettings save handler\"\n```\n\n```\nFinal status: merge_ready\n  Review decision: APPROVED\n  Verification: PASSED\n  Artifacts: .vibestrate/runs/zen-bohr/artifacts\n  Worktree: /home/you/.vibestrate-worktrees/zen-bohr\n  Branch: vibestrate/zen-bohr\n```\n\n## Use it, or don't\n\n```\ncd ../.vibestrate-worktrees/zen-bohr\ngit diff main\n```"
    },
    {
      "id": "docs/getting-started/installation",
      "kind": "doc",
      "title": "Installation",
      "source": "Vibestrate docs: getting-started/installation",
      "summary": "Install Vibestrate, open the dashboard, and let the Setup page take you from an empty folder to a first run.",
      "titleTerms": "installat",
      "terms": "0 1 127 2 24 4317 5 a add agent an and as at cd check ci cli cod codebas coding-agent com config connect creat curl dashboard did doctor edit empty f failur first fix flow folder for from fs g get getting-start git git-init githubusercontent gitignor guyshonshon http in init initialis insid install installat is it js json know learn least let machin machine-readabl main md model mor newer next nod npm one only open or order pag pass pnpm point policy project provider publish quest r raw read read-only readabl render repair repo report requirement rol rul run s saf sam scaffold set setup sh simpl skill skip sl start statu tak termin test the thi thing tip to too ui up url vers vib vibestrat view warn what wizard word writ yml you your your-project",
      "body": "## In simple words\n\nYou need **Node.js 24 or newer** and a git repository.\n\n```\nnpm install -g vibestrate     # or: curl -fsSL get.vibestrate.com | sh\ncd your-project\nvibe ui\n```\n\n`vibe ui` serves the dashboard on `http://127.0.0.1:4317`, opens your browser and starts the scheduler. The rest happens in **More > Setup**: the `vibe doctor` checks as numbered steps, with **Initialise this project** and **Fix what's safe** on the page.\n\nWorks on macOS, Linux and Windows, no WSL required.\n\n**Tip.** Setting up writes inside `.vibestrate/` and nowhere else. Your source, package manifest and git config are untouched, so trying this in an existing project costs nothing.\n\n## What setup writes\n\n**`project.yml`** Providers, profiles, crews, flows and validation commands.\n\n**`roles/`** Six workers, each with its own instructions file.\n\n**`rules.md`** Guidance stacked into every agent turn.\n\n**`policies/`** Your own rule files, read on every run. Empty until you write one.\n\n## Install\n\n```\nnpm install -g vibestrate\n# or\npnpm add -g vibestrate\n```\n\n```\nurl=https://raw.githubusercontent.com/guyshonshon\ncurl -fsSL $url/vibestrate/main/install.sh | sh\n```\n\n```\nnpm view vibestrate versions     # what is published\nnpm install -g vibestrate@<version>\nvibe --version\n```\n\n## The same thing from a terminal\n\n```\nvibe init            # scaffold .vibestrate/ (--git-init to create the repo too)\nvibe setup           # the wizard, as questions in the terminal\nvibe doctor          # the read-only report the Setup page renders\nvibe doctor --fix    # the same repair pass as Fix what's safe\nvibe doctor --json   # machine-readable, for CI\n```\n\n## Inside `.vibestrate/`\n\n```\n.vibestrate/runs/\n```"
    },
    {
      "id": "docs/getting-started/merging",
      "kind": "doc",
      "title": "Keep a change (Git and merging)",
      "source": "Vibestrate docs: getting-started/merging",
      "summary": "Git in one minute, and how to move a finished change from the run's copy into your real project.",
      "titleTerms": "a and chang git keep merg",
      "terms": "a across advic advis ahead alway analyz and any apply ask behind best bold bold-lovelac branch call cd chang checkout complet confirmat conflict copy creat deeper deterministic did diff dry dry-run dur each ff ff-only finish for from get getting-start gh git going gt guard guid hard her how id in integrat into is it json keep know leav loc locally lovelac lt machin main merg merge-ready merge-to-main merge_ready minut model mov nam next not of on one only open opt option or order part plan planner pr predict preview project pull push read read-only ready real report request run s sam secret shar simpl sourc start stricter sweep tak target termin than the then thi thre tip to tre typ undo vib vibestrat vibestrate-worktre what word worktre you your",
      "body": "## In simple words\n\nA run never edits your project folder. It works in its own copy - a git worktree beside your project, on its own branch - and stops at `merge_ready` with the change waiting there.\n\nFolding it into `main` is the one step Vibestrate always leaves to you, and the sidebar's **Source** page is where you do it: **Changes**, **Tree**, **Merge**.\n\n**Tip.** Read the diff before merging, every time. The verdict tells you which checks ran and passed, not that the change is the one you wanted. Only you can answer the second question.\n\n!The Workspace panel of a run, naming the branch and the run's isolated git worktree path, with a Copy cd button.\n\n**Copy cd** on the run page puts the worktree path on your clipboard, to read the work in your editor.\n\n## Your three options\n\n**Take it** Merge the run's branch into yours. The advisor can tell you what that would do first.\n\n## Read the change\n\n```\ncd ../.vibestrate-worktrees/<runId>\ngit diff main\n```\n\n## From the terminal\n\n```\nvibe integrate advise <runId>    # the same read-only advice; --json for a machine\nvibe integrate preview           # dry-run conflict report across merge-ready runs\nvibe integrate analyze <runId>   # the optional model read of the diff\nvibe integrate apply --into integration/<name>\nvibe integrate finish <branch>   # merge to main, typed confirmation, local only\n```\n\n```\n# Open a pull request (best on a shared project)\ncd ../.vibestrate-worktrees/<runId>\ngh pr create\n\n# Or merge it into main locally\ngit checkout main\ngit merge --ff-only vibestrate/<runId>\n```"
    },
    {
      "id": "docs/getting-started/providers",
      "kind": "doc",
      "title": "Set up a provider",
      "source": "Vibestrate docs: getting-started/providers",
      "summary": "Point Vibestrate at the AI coding tools you already have, from the Crew page's Providers tab.",
      "titleTerms": "a provider set up",
      "terms": "0 1 11434 127 2 4 4096 5 6 a add agent ai aider already among an and anthropic anthropic_api_key api are arg at bas claud claude-sonnet-4-6 cli cloud cod codex codex-default com command confident configur connect crew cross cross-model custom default detect did different doctor edit env every executor fix for found from get getting-start giv hav how http http-api implementer in init inst install is it its key kind know liter loc localhost localhost-proxy login machin mak max model mor nam need never next not ollama on one only open opencod opt option or order p pag path point popular print profil project prompt provider proxy qwen3 ready referenc relat reviewer run runtim s saf sam server set setup simpl singl single-profil smok someth sonnet start stay stdin tab termin test the they thi thre tip token tool tri typ up url v0 v2 vers vib vibestrat what wher with wizard word yml you your",
      "body": "## In simple words\n\nVibestrate ships no model of its own. It hands the work to a **provider** you already have, and you need at least one before a task can run.\n\nOpen **Crew** in the sidebar, then the **Providers** tab. Every provider is a card - detected or not, configured or not - with **Set up**, **Set default** and **Test** on it.\n\n**Tip.** **More > Setup** gets you here in context: its third step, **Connect a model**, reports what is installed and what is missing, with a **Providers** button to this tab.\n\n## Cloud models, or local ones\n\n```\nproviders:\n  cloud:\n    type: http-api\n    api: anthropic\n    baseUrl: https://api.anthropic.com\n    model: claude-sonnet-4-6\n    # an env reference only - never a literal key\n    apiKey: env:ANTHROPIC_API_KEY\n    maxTokens: 4096\n  local:\n    type: localhost-proxy\n    api: ollama\n    baseUrl: http://localhost:11434\n    model: qwen3.5\n    maxTokens: 4096\n```\n\n## From the terminal\n\n```\nvibe provider detect        # what's installed, and how confident\nvibe provider setup         # the same wizard, with Cloud API and\n                            # Local model server among its options\nvibe provider set claude    # make it the default for every agent\nvibe provider test claude   # safe smoke test; prints the login command\n```\n\n```\n✓ Claude Code - ready\n  Command: claude (v2.1.4)\n  Default args: -p with prompt on stdin.\n\n! OpenCode - detected, needs setup\n  Command: opencode (v0.4.2)\n\n○ Aider - not found\n  Command tried: aider\n  aider is not on PATH.\n```\n\n```\nvibe run \"...\" --profile codex-default\n```"
    },
    {
      "id": "docs/getting-started/quickstart",
      "kind": "doc",
      "title": "Quick start",
      "source": "Vibestrate docs: getting-started/quickstart",
      "summary": "Open the Vibestrate dashboard, point it at a coding CLI you already have, and take one task from a sentence to a branch you can keep.",
      "titleTerms": "quick start",
      "terms": "0 1 127 2 24 3 4 4317 4318 5 6 7 a accept add address advic advis ahead ai aider aider-install already analyz and anthropic anthropic-ai anthropic_api_key api apply approv arbitrat are arg as assuranc at auto auto-pick availabl back bashrc behind bin block bold bold-lovelac branch brief by can cd chang checkout claud claude-cod cli cloud cod codebas codex command commit complet concis config configur configurat confirm connect copy crew custom dashboard default detect did diff doctor doe each eaddrinus ebadengin echo edit els endpoint enter env everyth execut exit export express extra fail fil fin find finish first fix flaky flow for fork found from g gemini gemini-cli get getting-start git git-init gitignor going googl handler happen hav head healthz help her http http-api id improv in init initialis initializ insid install integrat into is isn isolat it just keep key know learn let lik list listen loc localhost localhost-proxy lock log login look lovelac m main manager md mean merg merge-to-main mod model mor mov nam need new newer nod not npm nvm of ok on one only open openai openai_api_key operat option or outcom outsid own pag panel panel-review pass path permiss permission-mod permit pick pip plan plan-only pnpm point policy popular port prefix project prov provider proxy python quality quality-arbitrat quickstart re re-run re-test read read-only ready refere repo repository restart result review run s saf sandbox sav scaffold scop security security-review see sentenc server set setup sign simpl sourc start statu stay strict structur t tak task test that the then thi through tip to tru trunk typ typecheck ui ui-port unattend uncommit until up use validat verificat vers vib vibestrat vibestrate-worktre vibestrate_provider_ok view wait walk warn what when which why with won word work workspac workspace-writ worktre worth writ yaml yes yml you your your-project zshrc",
      "body": "## In simple words\n\n```\nnpm install -g vibestrate\ncd your-project\nvibe ui\n```\n\n### Install the CLI\n\n```\nnpm install -g vibestrate\nvibe --version\n```\n\n```\nnvm install 24 && nvm use 24    # or your own version manager\nnpm install -g vibestrate\n```\n\n```\necho \"export PATH=\\\"$(npm config get prefix)/bin:\\$PATH\\\"\" >> ~/.zshrc    # or ~/.bashrc\nwhich vibe\n```\n\n### When the test fails\n\n```\n! codex looks like it isn't logged in.\n  Run this outside Vibestrate, then re-test:\n    codex login\n```\n\n## 4. Point it at your tests\n\n```\nvibe config set commands.validate \"[\\\"pnpm typecheck\\\",\\\"pnpm test\\\"]\"\n```\n\n## 5. Let it write files\n\n```\nvibe config set providers.claude.type claude-code   # or Crew > Providers > Edit as YAML\nvibe config set execution.isolation sandboxed\nvibe config set policies.strictApplyOnly true\n```\n\n### Start it\n\n```\nvibe run \"Add structured logging to the settings save handler\"\n```\n\n### Commit inside the worktree\n\n```\ncd \"$(vibe path bold-lovelace --cd)\"\ngit add -A\ngit commit -m \"Add structured logging to the settings save handler\"\ncd -    # back to your project\n```"
    },
    {
      "id": "docs/getting-started/skills",
      "kind": "doc",
      "title": "Attach skills",
      "source": "Vibestrate docs: getting-started/skills",
      "summary": "A markdown note that carries your project's rules into an agent's prompt on every run.",
      "titleTerms": "attach skill",
      "terms": "2 8 a about add agent an and are assign attach auth auth-convent balanc carry chang claud claude-balanc codebas convent cooky creat crew default did domain don enrollment error error-handl every fa fetch for from get getting-start go hand handl her how http id in inlin into is it json jwt keep know lax list login lucia markdown mcp md middlewar mint modul mor nam never new next not on one only order path permiss planner profil project prompt read read_only really reason relat requir restat review rol rout rul run s sam seat second security security-review server sess show sign simpl sit skill skip spac src start subsystem t termin that the thi thos tip to touch ts unassign under url use vib vibestrat vocabulary what when with word work worth writ yml you your",
      "body": "## In simple words\n\nA **skill** is a markdown note Vibestrate pastes into an agent's prompt before it starts work.\n\n```\n# How login works here\n\nSessions are signed cookies, not JWTs. `src/auth/session.ts` is the only\nmodule that mints one. Never add a second path.\n```\n\nWrite it into `.vibestrate/skills/`, then attach it on the **Crew** page: every role card has a skills row with **Attach a skill**. Every run seating that role reads it, so you teach an agent something once instead of retyping it into every task.\n\n**Tip.** The test for whether something belongs in a skill: would you say it to a new contractor on their first day, and be annoyed to repeat it on their second? A one-off instruction belongs in the task instead.\n\n## What to write one about\n\n**How a subsystem really works** The thing that is not obvious from reading it.\n\n## Write one\n\n```\nThis codebase uses Lucia for sessions.\nWhen touching auth:\n\n- Don't create session middleware inline.\n  Use `requireSession` from `src/server/auth.ts`.\n- Cookies are HttpOnly and SameSite=lax.\n  Don't change those defaults.\n- New auth routes go under\n  `src/server/routes/auth/`.\n```\n\n## From the terminal\n\n```\nvibe skills list\nvibe skills show auth-conventions\nvibe skills assign planner auth-conventions\nvibe skills unassign planner auth-conventions\nvibe skills fetch <url>\n```\n\n```\ncrews:\n  default:\n    roles:\n      planner:\n        seats: [planner]\n        profile: claude-balanced\n        prompt: .vibestrate/roles/planner.json\n        permissions: read_only\n        skills: [auth-conventions, error-handling]\n```\n\n```\nvibe run \"Add 2FA enrollment\" \\\n  --skills auth-conventions,security-review\n```"
    },
    {
      "id": "docs/getting-started/walkthrough",
      "kind": "doc",
      "title": "Full walkthrough",
      "source": "Vibestrate docs: getting-started/walkthrough",
      "summary": "This page covers the dashboard, flows, crews, policies, spec-up and the merge path.",
      "titleTerms": "full walkthrough",
      "terms": "4 40 5 a abl about accept across act actually adaptiv add advic advis all allow analysi analyz and answer applicabl apply approv arbitrat are arriv as ask assuranc async autonomy await back be befor block board bold bold-lovelac branch brief budget build builder can card cas cd chain challenger chang cheap check claud claude-cod cli cod code_writ codex com command commit complet config configur configurat confirm consol consult control copy cover creat crew dashboard data data-stor decis default descript deterministic did diff do doctor doe draft each eight end enforc engin engineer error every executor express fast fil finish first fix flow for gap gat generat get getting-start git going gpt gpt-5 greenfield guard handl handler hard her high how hub id implementer import in insid install intak integrat interactiv into is kebab kebab-cas keep know list loc log lovelac m main matcher max max-turns-run md me mean merg merge-to-main miss model mor nam new no no-consol no-select not of off on one only opin over pag panel panel-review partially path per pick pickup pickup-analysi pickup-review plan plan-only policy postgr power prefer prefer-async preset print proc profil project propos provider qualify quality quality-arbitrat quest re re-run read read_only ready replay review reviewer rewrit roadmap rol rul run saga sav scaffold scop seat seat-rol second second-opin security security-review select sequenc set shell ship show simpl singl sourc spec spec-up split staff staff-engineer start step stor strict structur stuck submit suggest supervisor tak task tenant termin test that the then thi thorough tip to tre tru turn two typ ui unknown unsaf unverifi up url validat verifi verificat verifier vers vib vibestrat view wait walkthrough what when whether which why will with word work workspac writ yml you your your-project yourself",
      "body": "## The dashboard\n\n```\ncd /path/to/your-project && vibe ui\n```\n\n### Mission Control\n\n```\nvibe budget set --max-turns-run 40\nvibe config set supervisorControl.autonomy act\n```\n\n### Splitting a run across two models\n\n```\nvibe profile add second-opinion --provider codex --model gpt-5.5 --power high\nvibe config set crews.default.roles.reviewer.profile second-opinion\nvibe config set crews.default.roles.verifier.profile second-opinion\nvibe crew show default\n```\n\n### Rules the reviewer enforces\n\n```\nvibe policies add prefer-async \"prefer async/await over .then() chains\" --fix \"rewrite as async/await\"\nvibe policies add no-console \"no console.log in shipped code\" --block --matcher \"console\\\\.log\\\\(\"\n```\n\n### Spec-up, for a greenfield brief\n\n```\nvibe spec-up questions <intake run id>                       # the gaps, each with a kebab-case id\nvibe spec-up answer <intake run id> --answer data-store=\"Postgres, single tenant\"\nvibe spec-up answer <intake run id> --proceed                # prints the spec run id\nvibe spec-up build <spec-up run id>\n```\n\n### Which runs arrive committed\n\n```\ncd \"$(vibe path bold-lovelace --cd)\"\ngit diff main\ngit add -A && git commit -m \"Add structured logging to the settings save handler\"\ncd -    # back to your project\n```"
    },
    {
      "id": "docs/getting-started/welcome",
      "kind": "doc",
      "title": "The guided walkthrough",
      "source": "Vibestrate docs: getting-started/welcome",
      "summary": "A four-step terminal tour of providers, crew, flows and your first run that you can skip or quit and pick up later.",
      "titleTerms": "guid the walkthrough",
      "terms": "a and can crew did each first fix flow four four-step get getting-start if in init initialis isn it json know later left mor next of off or order pick project provider quit remember reset run s saf set settl setup simpl skip start stat step t termin that the thi thre tip to tour up vib vibestrat way welcom welcome-stat what wher word work yet yml you your",
      "body": "## In simple words\n\nThe dashboard's **More > Setup** page is the primary guided path: numbered steps, live check results, a **Fix what's safe** button. `vibe welcome` is the terminal-native version.\n\n```\nvibe welcome\n```\n\nIt walks four steps: a provider, a crew, your flows, then your first run. Quit halfway and it picks up where you stopped. Skip any step. `--reset` starts over.\n\n**Tip.** It asks questions, so it needs a real terminal. In a script or in CI it prints the commands to run by hand and exits without touching anything.\n\n## What each step settles\n\n**Providers** Which coding-agent CLIs you already have, and which are logged in.\n\n**Crew** The six workers, and which model each one runs on.\n\n**Flows** Which recipes this project can run, and which is the default.\n\n**First run** A real task, start to finish, so the vocabulary lands.\n\n**Did you know?** The tour is resumable because it writes as it goes rather than at the end. Quit after step two and you have a working provider and crew, not a half-written config.\n\n## The four steps\n\n- **Providers** - the coding CLI that runs the model, such as Claude Code or Ollama. This step runs `vibe provider setup`. - **Crew** - your team of AI workers. Install a ready-made one (Fast, Thorough, Cheap, or Local), or build your own later on the **Crew** page. - **Flows** - the ordered list of steps a run works through. You see the flows you have, and how to install more from the flows hub. - **Your first run** - a small task to try next.\n\nEach step opens with a short explanation, then asks whether to continue, skip or quit.\n\n## It remembers where you left off\n\n```\nvibe welcome --reset\n```\n\n## If the project isn't set up yet\n\n```\nvibe init\nvibe welcome\n```"
    },
    {
      "id": "docs/getting-started/why-a-human",
      "kind": "doc",
      "title": "Why a human stays in the loop",
      "source": "Vibestrate docs: getting-started/why-a-human",
      "summary": "How Vibestrate checks an AI's work, and why the last call on a change is yours.",
      "titleTerms": "a human in loop stay the why",
      "terms": "3 a actually add address ai an and approv ask assuranc at bad balanc bold bold-lovelac branch call catch caveat challenger chang check claud claude-balanc cod codex codex-review confidenc consult cover crew cross cross-model default did end engineer error fix flag for get getting-start git going handler how human in instead is it keep know last lovelac medium model next no not object of on only order own pass payoff permiss policy profil project provider push re re-validat read read_only return review reviewer rol run runtim s seat second set setup simpl singl single-profil so staff staff-engineer start step suit supervisor swallow test that the tip to turn typ unproven up validat verifi verificat vib vibestrat was what why why-a-human word work writ wrot yml you your",
      "body": "## In simple words\n\nAI can write code you could not write yourself. The same AI also makes things up, and it tends to agree with whatever you just said. Trusting it blind is how bad code ships.\n\nSo a run is built to disagree with itself. A different model reads the diff than wrote it, your tests decide whether it works, and nothing merges without you.\n\n**Tip.** The single highest-value change you can make is pointing the reviewer at a second vendor. A model reviewing its own transcript mostly agrees with itself; one that reads the diff cold does not.\n\n!The Run assurance panel reading verified, with five tiles underneath: Policy passed, Validation passed 2 of 2, Review approved, Verification passed, and the supervisor that judged it, staff-engineer.\n\n## Turn on a second model\n\n```\nvibe provider setup\nvibe profile add codex-review --provider codex\nvibe assurance bold-lovelace\n```\n\n```\nRun assurance bold-lovelace - verified\n\n  policy:       passed\n  validation:   passed (3/3 passed)\n  review:       approved\n  verification: passed\n  supervisor:   staff-engineer (cross-model)\n```\n\n```\ncrews:\n  default:\n    roles:\n      reviewer:\n        seats: [reviewer, challenger]\n        # was claude-balanced\n        profile: codex-review\n        permissions: read_only\n```\n\n## Ask instead of reading\n\n```\nConsult  · confidence: medium\n\nThe reviewer flagged the settings handler for\nswallowing write errors. The fix step added a\ntyped error return and re-validation passed, so\nthe objection was addressed in code.\n\nCaveats (not verified):\n  • No test covers the error branch, so the fix\n    is unproven at runtime.\n```\n\n```\nvibe consult --run bold-lovelace \\\n  \"What did the reviewer object to?\"\n```"
    },
    {
      "id": "docs/getting-started/windows",
      "kind": "doc",
      "title": "Native Windows support",
      "source": "Vibestrate docs: getting-started/windows",
      "summary": "The core loop - install, providers, runs, diffs and merge - runs natively on Windows in PowerShell or cmd, with no WSL. The run page's Terminal tab and Docker isolation are the exceptions.",
      "titleTerms": "nativ support window",
      "terms": "0 1 127 4317 a after and are c cd check claud cmd connect copy cor dashboard did diff do docker except g get getting-start http in inst install is isolat know loop merg model mor natively next no not npm on one or order pag path power project provider ps1 re re-check recogniz right run s setup shell simpl start tab termin the thing tip to ui vers vib vibestrat what window with word work workspac worktre wsl you your your-project",
      "body": "## In simple words\n\nVibestrate runs natively on Windows, with no WSL. In PowerShell or cmd you install the CLI, open the dashboard, set up providers, run tasks, review diffs and merge.\n\n```\nnpm install -g vibestrate\ncd C:\\path\\to\\your-project\nvibe ui\n```\n\nThe dashboard comes up on `http://127.0.0.1:4317` and **More > Setup** takes it from there.\n\n**One thing you do not get: the run page's Terminal tab.** It needs a POSIX shell, so on native Windows Vibestrate reports it unavailable rather than spawning a shell that isn't there. If you want a shell inside the app, run Vibestrate under WSL.\n\n**Tip.** Your own terminal still works fine. The run page's **Workspace** panel has a **Copy cd** button for the run's worktree path, so you can open it in PowerShell.\n\n## What works natively\n\n**The dashboard** `vibe ui` in PowerShell or cmd, browser and scheduler included.\n\n**Providers** The same detection, setup and testing as anywhere else.\n\n**Runs and worktrees** Real git worktrees, real isolation, no translation layer.\n\n**Diffs and merging** The Source page's Changes, Tree and Merge tabs, or your own terminal.\n\n**Did you know?** Native Windows support is not a port of a POSIX assumption, it is a separate execution path. That is why the Terminal tab is switched off with a reason rather than failing when you click it.\n\n## Providers on Windows\n\nClaude Code, Codex and Gemini run natively on Windows once you've installed their CLIs with npm, and Vibestrate calls them the same way it does on macOS and Linux.\n\nPast those three it varies tool by tool, and some are still POSIX-only. The Setup page's **Connect a model** step flags any provider it can't find or run, so you know where each stands before you start."
    },
    {
      "id": "docs/glossary",
      "kind": "doc",
      "title": "Glossary",
      "source": "Vibestrate docs: glossary",
      "summary": "Plain-language definitions for the words you'll meet across these docs.",
      "titleTerms": "glossary",
      "terms": "0 1 127 2 3 4317 a abort across act add advisory all annotat api apply approv approval-gat archiv artifact assert assist at backend block board broker by checklist claud cli clos cloud cod code_writ column command complet concept conductor config consult container context context-fil context-pdf context-url continuou control creat crew default defin definit deny did dir doc docker don each effort endpoint enhanc every execut export fail fals fil fill flow for gat git glossary good high http http-api human human_approv human_review id implementer in in-progress in_progress init instruct integrat invariant isolat json kind know languag ledger ll loc local-worktre localhost localhost-proxy look low machin main max md medium meet merg merge_ready miss mod model nam ndjson need on only open operat orchestrator overview panel param parameter patch pdf pdftotext pend permiss persona phas pick pick-up pickup plain plain-languag plan policy ponytail power preview profil progress project project-param propos provider proxy read read-only read_only ready replay requir require_approv return review roadmap rol root rout rul run s seat secret segment server set simpl skill sourc spec spec-up spend stag stat statu step step-by-step supervis supervisor task telemetry term termin test the thes through tip trac transit tru ui up url usd validat vib vibestrat wait waiting_for_approv which whos word work workflow workspac worktre writ yml you your",
      "body": "## In simple words\n\nPlain definitions for the words these docs use.\n\n**Tip.** Meeting these for the first time? Read the big picture instead. It introduces the same words in the order they depend on each other, which is far easier than an alphabetical list.\n\nThe words in one sentence:\n\n```\nA Task runs through a Flow, whose steps name Seats,\nwhich your Crew's Roles fill, each on a Profile, which names a Provider.\n```\n\nThe four you cannot skip:\n\n**Task** The job you want done, in a sentence.\n\n**Flow** The ordered steps it runs through.\n\n**Crew** The roles that fill those steps.\n\n**Run** One pass over the task, on its own branch.\n\n**Did you know?** A seat, a role and a profile are three different things that people routinely collapse into \"the model\". Keeping them apart is exactly what lets a flow written by a stranger run on your models, at your budget, unedited.\n\n## Every term\n\n**Action Broker.** The one checkpoint every real effect crosses - starting a provider, running a command, writing a file - deciding allow, deny, or ask a human, and recording it in that run's `actions.ndjson`. Default-allow with a policy veto: it is where you impose limits, not a whitelist to satisfy. See Safety.\n\n**Crew.** Your local team of Roles, matched to a Flow's Seats. A run uses `defaultCrew` from `project.yml` unless you pass another. See Crew.\n\n**Role.** One teammate inside a Crew: instructions, permissions, skills, the Profile it runs on, and the Seats it may fill. See Role.\n\n**Seat.** A slot a Flow step needs someone in, such as `implementer`, answered by a Role whose `seats` list includes it. See Seat.\n\n**Profile.** How strong and how expensive a Role runs: provider, model, power, timeout. Power is provider-specific. See Profile."
    },
    {
      "id": "docs/index",
      "kind": "doc",
      "title": "Vibestrate docs",
      "source": "Vibestrate docs: index",
      "summary": "Vibestrate is where your AI coding agents work together - one shared plan, one set of rules, one record. It runs the CLIs you already have and leaves the final call to you.",
      "titleTerms": "doc vibestrat",
      "terms": "0 1 127 4317 a add agent ai already and api audit boundary build call can chosen cli cod consult context context-url copy crew dashboard default did doc end environment every express fin flow full get getting-start git go hav her http http-api id in index init is it know leav link log model modul next nod node_modul not of off on one only per plan profil project quest quick quickstart re re-read read read-only recip record repo review reviewer rul run scaffold set shar simpl skill start statu stay steer task termin that the thi tip to together ui unattend url venv verify vib vibestrat walkthrough want what when wher word work worktre writ you your",
      "body": "## In simple words\n\nYou have the models. Vibestrate takes over the logistics of putting several of them on one task: pasting the same context into each tool, keeping a spare checkout so a risky change cannot reach your files, carrying one model's output into the next one's prompt, and catching where they drift apart.\n\n`vibe ui` opens the dashboard on `127.0.0.1:4317`, and it drives the coding CLIs already installed on your machine. The final call stays yours.\n\n!The header of a finished run reading merge ready, with the task, the flow it followed and its eight steps, the elapsed time and the diff.\n\n**Tip.** New here? Read the big picture for the vocabulary, then open the dashboard and run one task. The words land faster once you have watched a run happen.\n\n## What you get\n\n**One plan, every model** Same project context, same plan, same story so far.\n\n**A reviewer that did not write it** Cross-model review by construction, not by remembering to open a new chat.\n\n**A copy of your repo per run** Your branch is untouched until you decide.\n\n**A record you can re-read** Every decision, token and dollar, written down locally.\n\n## The terminal, when you want it\n\n```\nvibe ui                                            # the dashboard on 127.0.0.1:4317\nvibe init                                          # scaffold .vibestrate/\nvibe run \"Add audit logging to the settings flow\"  # plan, build, review, verify\nvibe status                                        # the runs in this project\n```"
    },
    {
      "id": "docs/task-lifecycle",
      "kind": "doc",
      "title": "Task lifecycle",
      "source": "Vibestrate docs: task-lifecycle",
      "summary": "How a task moves through statuses, with the fix loop and the approval gates.",
      "titleTerms": "lifecycl task",
      "terms": "a abort act afterward all and answer append append-only approv architect artifact ask at block broker budget c can chang com concept cor creat current decid did different disk event every execut fail find finding-respon fix fixer flow for from gat happy has history hold how human human_approv id impossibl in is it json know leav lifecycl liv look loop max md merg merge_ready mov ndjson need no now on only order output path paus plan policy prompt r re re-run ready reject relat replayabl repli request requir respon rest result resum review reviewer run sent sequenc simpl stag stat statu step step-id stuck task task-lifecycl tell the through timelin tip to transit until validat validation-result verdict verify vib vibestrat view wait waiting_for_approv was what when wher why with word work workflow you your yourself",
      "body": "## In simple words\n\nEvery task moves through a fixed sequence of statuses, and Vibestrate will not let it skip a step or jump backward.\n\nOpen a run and its status hero carries the flow's steps as a rail with the current one marked **Now**; the **Live timeline** panel ticks them over as they finish. The Status column on **All runs** is the same value for every run at once.\n\n**Tip.** If a status looks stuck, the sequence is the first thing to check. A task waiting at an approval gate and a task whose step crashed look similar from a distance and need completely different responses.\n\n## Why a fixed sequence\n\n**You can tell where it is** One status, read from a saved value, never inferred.\n\n**No impossible history** A task cannot reach a status along a path the state machine does not allow.\n\n**Stuck looks different from working** Waiting on you and crashed are distinct states, not one ambiguous \"not done\".\n\n**Replayable afterwards** The sequence is the record, so a finished task can be re-read rather than remembered.\n\n## The happy path\n\n```\ncreated → planning → planned\n  → architecting → architected\n  → executing → validating\n  → reviewing → verifying → merge_ready\n```\n\n## What a run leaves on disk\n\n```\n.vibestrate/runs/<runId>/\n  state.json        current status, transitions\n  events.ndjson     every event, append-only\n  actions.ndjson    brokered actions + verdicts\n  artifacts/flows/\n    <step-id>/prompt.md    what it was sent\n    <step-id>/output.md    what it replied\n    <step-id>/validation-results.json\n    findings.json          reviewer findings\n    finding-responses.json how the fixer answered\n```"
    },
    {
      "id": "docs/troubleshooting",
      "kind": "doc",
      "title": "Troubleshooting",
      "source": "Vibestrate docs: troubleshooting",
      "summary": "Concrete fixes for the issues people actually hit.",
      "titleTerms": "troubleshoot",
      "terms": "a abort actually add after ai aider aider-install an and answer anthropic anthropic-ai anthropic_api_key api app approv arriv artifact at bashrc befor behind bin blank block branch browser but catalog cd chang check claud claude-cod clean cli cod codex com command commit concret config connect consult control could creat crew curl d dashboard detect did didn doctor doe edit effect effort effort_ignor enabl expo fail fals finish first fix flow for found fs g gateway gemini gemini-cli get git googl got guidanc has hav her hit http i id ignor in in-app init initi initialis insid inst install instead is is-inside-work-tre issu it key know left level list login m main md model mor never next no not noth notificat npm of ollama on openai openai_api_key operat or output own pag panel pars pass path paus peopl pip plu pnpm point policy power prefix profil project provider push python ready real reason reject remov replay repository request request-chang requir resum rev rev-pars right run run-id s saf say see set setup sh simpl sl sourc stag stall start stash statu step step-id stop stuck supervisor system t tab tak termin test that the them then thi tip to tre troubleshoot tru typecheck ui uncommit unexpect up validat vers vib vibestrat vibestrate-worktre wait waiting_for_approv was what wher which with won word work worktre xhigh yml you your your-project yourself zshrc",
      "body": "## `vibe: command not found` right after installing\n\n```\nnpm config get prefix\n# then add <prefix>/bin to your PATH\n# in ~/.zshrc or ~/.bashrc\n```\n\n## `vibe init` says \"not a git repository\"\n\n```\ngit init\ngit add -A && git commit -m \"Initial commit\"\nvibe init\n```\n\n## `vibe doctor` says \"no providers ready\"\n\n```\nnpm install -g @anthropic-ai/claude-code\nnpm install -g @openai/codex\nnpm install -g @google/gemini-cli\npython -m pip install aider-install && aider-install\ncurl -fsSL https://ollama.com/install.sh | sh\n```\n\n```\nvibe provider detect\nvibe provider setup\nvibe provider test <id>\n```\n\n## Runs finish, but nothing was actually checked\n\n```\n# adds the commands it detected for your project\nvibe doctor --fix\n\n# or set them yourself\nvibe config set commands.validate \\\n  '[\"pnpm typecheck\", \"pnpm test\"]'\n```\n\n## Run stuck in `waiting_for_approval`\n\n```\nvibe approvals list <runId>\nvibe approvals approve <runId> <approvalId>\n# or: reject, or request-changes --guidance \"...\"\n```\n\n## Worktree creation fails: \"main branch has uncommitted changes\"\n\n```\ngit stash push -m \"before vibe run\"\nvibe run \"...\"\n```\n\n## An effort level your provider does not have\n\n```\nEffort \"xhigh\" won't take effect on gemini\n(gemini exposes no effort control) - the provider ignores it.\n```"
    },
    {
      "id": "docs/workflows/create-and-run",
      "kind": "doc",
      "title": "Create and run a task",
      "source": "Vibestrate docs: workflows/create-and-run",
      "summary": "Go from a thing you need done to a finished change you can merge.",
      "titleTerms": "a and creat run task",
      "terms": "1 2 25 3 4 5 50 a abandon abort add advanc advis advisor ahead alongsid analyz and arbitrat artifact audit auto auto-pick automat away backoff behind branch by can cd chang checkout cli complet concis config configurat creat create-and-run crew dashboard decis default did diff different don event every ff ff-only fil finish finish-now first flow for fram from gh git go good heavier how human id in input inspect integrat is it json just know lib list liv locally log logger main md merg metric model mor need new now oldest on one only or output path permiss pick pr preserv profil project protect push quality quality-arbitrat re read read-only relat remov replay resolv resolve-first result retry review rout run server set shar simpl sourc src stag stage-on-integration-branch start statu step suggest supervisor task termin than the thi thing thre timelin tip to touch tre tru ts tun ui unattend uploader validat vib vibestrat vibestrate-worktre walk watch weak when whether with word workflow worktre yml you yourself",
      "body": "## In simple words\n\nThis guide takes you from \"I have a thing to do\" to a change you can merge. Mission Control is the primary surface; the commands below are the automation path, and each section names the screen that does the same thing.\n\n```\nvibe run \"Add retry with backoff to the uploader\" --ui\n```\n\n**Tip.** `--ui` opens Mission Control alongside the run. Watching your first few is worth the screen space; once the shape is familiar you will mostly start them and come back.\n\n## The three decisions\n\n**How to frame it** Say what you want and the constraint that matters. Not which files to edit.\n\n**Whether to pick a flow** Auto is a good default. Name one when you disagree with what it chose.\n\n**Whether to watch** A run is fine unattended. Nothing merges without you either way.\n\n## 2. Start the run\n\n```\nvibe run \"Add audit logging to the settings...\"\n```\n\n```\n# dashboard alongside the terminal\nvibe run \"...\" --ui\n\n# a heavier flow than the default\nvibe run \"...\" --flow quality-arbitration\n\n# a different model for this run\nvibe run \"...\" --profile <id>\n```\n\n## 4. Inspect the result\n\n```\nvibe status            # every run, oldest first\nvibe replay <runId>    # read-only, one run\n```\n\n## 5. Merge it yourself\n\n```\nvibe integrate advise <runId>\n```\n\n```\nmerge:\n  advisor:\n    suggestIntegrationBranchWhen:\n      filesTouched: 25\n      protectedPaths: true\n      behindMain: 50\n```\n\n```\ncd ../.vibestrate-worktrees/<runId>\ngh pr create      # review by a human\ngit push          # just share the branch\n\n# or merge it locally\ngit checkout main\ngit merge --ff-only vibestrate/<runId>\n\n# or abandon it; the worktree is preserved for\n# inspection, remove it when you're done\nvibe abort <runId>\n```"
    },
    {
      "id": "docs/workflows/debug-failed",
      "kind": "doc",
      "title": "Debug a failed run",
      "source": "Vibestrate docs: workflows/debug-failed",
      "summary": "How to figure out why a run ended in failed or blocked, and what to do next.",
      "titleTerms": "a debug fail run",
      "terms": "20 a advanc after and api architect architectur artifact authenticat automat block bug cd chang clean cli command config creat crew debug debug-fail decis did diff do doesn drop dry dry-run earlier end event every execut exist fail figur fil find fix flow from get git how id if in inspect instead is json just keep know list look main md miss mor ndjson new newest next not noth of old or orphan out outcom output over per per-phas permiss phas plan preview project provider prun re re-run ref referenc relat replay requir restart restor restore-preview resum resume-from resume-stag retent reus review rewind rul run s sam scop see seed sharpen simpl skill snapshot sourc stag start stat statu stderr stdout step step-id t task teach test the thi tighten tip to unsaf validat verificat verify vib vibestrat view what when wher why with without word workflow worktre y yml you",
      "body": "## In simple words\n\nWhen a task does not finish cleanly, this guide helps you find out why. The run screen in Mission Control surfaces the same evidence; the commands and paths below are the automation path.\n\nStart by reading the status, because `failed` and `blocked` mean different things and need different responses:\n\n**failed** A step crashed. Read that step's own output - it says what broke.\n\n**blocked** Something refused: a review, a policy, or a failed check. Read the decision.\n\n**Tip.** `vibe replay ` is the fastest first move for either. It reopens the finished run with every decision, output and artifact in place, so you read what happened rather than reconstructing it. The run screen's **Replay** tab is the same.\n\n## Where to look\n\n**The failing step's output** For `failed`. Usually a stack trace or a command that exited non-zero.\n\n## Start with replay\n\n```\nvibe replay <runId>\n```\n\n## Re-run after fixing\n\n```\ncd .vibestrate/runs\ndiff <oldRunId>/artifacts/flows/plan/output.md \\\n     <newRunId>/artifacts/flows/plan/output.md\n```\n\n## Rewind instead of restarting\n\n```\n# executing     reuse plan + architecture\n# architecting  reuse just the plan\n# planning      seed nothing, start over\nvibe run \"<same task>\" --resume-from <oldRunId> \\\n  --resume-stage executing\n```\n\n## Rewinding to review, fix or verify\n\n```\nvibe run \"<same task>\" --resume-from <oldRunId> \\\n  --resume-stage reviewing --preview\n```\n\n## Pruning snapshots\n\n```\nvibe runs prune                # orphans\nvibe runs prune --keep 20      # keep newest 20\nvibe runs prune --run <id>     # just this run\nvibe runs prune --orphans --dry-run   # preview\n```"
    },
    {
      "id": "docs/workflows/git-tree-merge",
      "kind": "doc",
      "title": "Merge from the git tree",
      "source": "Vibestrate docs: workflows/git-tree-merge",
      "summary": "Explore your branches as a graph, predict a merge before you apply it, let the supervisor resolve conflicts, and undo with one click.",
      "titleTerms": "from git merg the tre",
      "terms": "a add advanc advis already and apply as ask automat befor branch clean cli click commit confirm conflict dat did do doe down dry dry-run env every explor ff fil finish for git git-tree-merg good graph guid head her history id in inspect inspector integrat into is it json know let log main merg merge-ready merge-to-main mov nam never no no-ff not of one only open or path per per-run planner predict preview propos push read read-only ready redact remov report resolv run see shap simpl sourc supervisor target the thi tip to tre undo up vib what whol with word workflow would you your",
      "body": "## In simple words\n\nFolding one branch into another - a finished run's branch into `main`, or two pieces of work together - is something the **Git tree** lets you see before you do it. It is the **Source** page's **Tree** tab in Mission Control, and the interactive canvas has no CLI equivalent by design.\n\nThe per-run path does have one:\n\n```\nvibe integrate advise <runId>    # read-only: what would merging this do?\nvibe integrate apply <runId> --into integration/logging\nvibe integrate finish integration/logging \\\n  --confirm merge-to-main\n```\n\n**Tip.** Look before you merge. The tree shows the shape of what you are about to combine, which beats deciding from a branch name.\n\n## What it is good for\n\n**Seeing the shape** Which branches exist, where they forked, what is ahead of what.\n\n**Reading a commit** Before deciding whether you want it.\n\n**Predicting a merge** What would happen, before it happens.\n\n**Undoing one** There is a real revert path, not just advice to be careful.\n\n## The per-run path\n\n```\nvibe integrate advise            # every merge-ready run\nvibe integrate advise <runId> --json\nvibe integrate preview           # dry-run conflict report\nvibe integrate apply <runId> --into integration/<name>\nvibe integrate finish integration/<name> \\\n  --confirm merge-to-main\n```"
    },
    {
      "id": "docs/workflows/inspect-progress",
      "kind": "doc",
      "title": "Inspect a run in flight",
      "source": "Vibestrate docs: workflows/inspect-progress",
      "summary": "Where to watch a run as it happens, and where every detail is saved.",
      "titleTerms": "a flight in inspect run",
      "terms": "5 a act advanc and append append-only artifact as automat bold bold-lovelac boundary broker cd chang check cli cod command correct cost creat current dashboard decis deni detail did disk do durat error event every execut exist exit fil flow follow for handl happen helper id in inspect inspect-progress interactiv is it jq json know liv log lovelac main md merg merge_ready messag metric n ndjson new next not on one only output p participant past per plan profil progress prompt provider queu r raw read ready relat replay request resolv respons result retry review rol run runtim runtime-metric s sav seat select shell simpl snapshot sourc specifically stat statu stderr stdout steer step step-id stop stream tab termin the thi timelin tip to token transit txt typ ui use validat validation-result verdict verificat verify vib vibestrat watch wher whichever without word workflow workspac writ you",
      "body": "## In simple words\n\nWhile Vibestrate is working you can watch it. The dashboard is the primary place; the terminal and the files on disk are the automation paths to the same record.\n\n**The dashboard** The full live picture: steps ticking over, tokens, spend, the diff so far.\n\n**The interactive shell** `vibe` opens the same run panel in the terminal, on page `5`.\n\n**The terminal** `vibe logs` for what a provider actually wrote.\n\n**The files on disk** The complete record, readable at any time, including long after the run.\n\n## The terminal\n\n```\nvibe logs <runId> --follow\n```\n\n## The files on disk\n\n```\n.vibestrate/runs/bold-lovelace/\n  state.json            current status, transitions\n  events.ndjson         every event, append-only\n  actions.ndjson        brokered action + verdict\n  runtime-metrics.json  tokens, durations, costs\n  flow.json             the resolved flow snapshot\n  participants.json     role + profile per seat\n  streams/              raw provider output\n  artifacts/flows/<step-id>/\n```\n\n```\nartifacts/flows/<step-id>/\n  prompt.md                the prompt for this step\n  output.md                the provider's response\n  validation-results.json  commands run + exit codes\n  validation/              one file per command\n    <n>-<command>.stdout.txt\n    <n>-<command>.stderr.txt\n```\n\n```\njq -r 'select(.type==\"state.changed\").message' \\\n  .vibestrate/runs/bold-lovelace/events.ndjson\n```\n\n```\ncreated → planning\nplanning → planned\n...\nverifying → merge_ready\n```\n\n## Correct it without stopping it\n\n```\nvibe steer <runId> \"use the existing retry helper, do not write a new one\"\nvibe steer <runId> --step review \"check error handling specifically\"\n```"
    },
    {
      "id": "docs/workflows/pause-resume",
      "kind": "doc",
      "title": "Pause, resume, abort",
      "source": "Vibestrate docs: workflows/pause-resume",
      "summary": "How to safely stop a run, bring it back later, or end it for good.",
      "titleTerms": "abort paus resum",
      "terms": "a abort advanc and approv are at automat back block branch bring cd chang cli control d detail did different end for from gat git good guidanc how human human_approv id in is it know later list max miss next not on or p pau paus pause-resum pick point policy policy-gat project r refus reject remov request request-chang requir resum resume-from round run saf safely simpl someth stag stop the thre tip to up vib vibestrat vibestrate-worktre wait waiting_for_approv way what when wher word workflow worktre you your your-project",
      "body": "## In simple words\n\nSometimes you want to stop a run, see where it got to, and pick it up later. The run screen in Mission Control has all three controls; the commands below are the automation path.\n\n```\nvibe pause <runId>     # stops at the next safe point\nvibe resume <runId>    # picks up where it stopped\nvibe abort <runId>     # ends it\n```\n\nPausing sticks. The flag is written to your project, not held in memory, so it survives anything restarting.\n\n**Tip.** Pause is not abort. A paused run keeps its worktree, its branch and everything it had done, and resuming continues rather than starting over. Abort is the one that ends it.\n\n## The three ways a run stops\n\n**You paused it** Status `paused`. Resume clears the flag and it continues.\n\n**It is waiting on you** Status `waiting_for_approval`. An approval gate wants a human.\n\n**Something refused** Status `blocked`. A policy, review or check said no.\n\n**Did you know?** Because the pause flag is a file rather than process state, a pause survives closing your laptop, restarting the dashboard or a reboot. A run cannot quietly resume because something restarted.\n\n## Pause\n\nOpen the run from the sidebar and press **Pause**, in the actions row of the status card at the top.\n\n## Abort\n\n```\ncd your-project\ngit worktree remove ../.vibestrate-worktrees/<runId>\ngit branch -D vibestrate/<runId>\n```\n\n## Policy-gated pauses are different\n\n```\nvibe approvals list <runId>\nvibe approvals approve <runId> <approvalId>\nvibe approvals reject <runId> <approvalId>\nvibe approvals request-changes \\\n  <runId> <approvalId> --guidance \"what to change\"\n```"
    }
  ]
};

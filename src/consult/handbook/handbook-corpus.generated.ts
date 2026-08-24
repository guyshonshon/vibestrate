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
  "lexicon": "110 12 120 23 24 322 40 40-58 512 58 abort absenc abstract access across act activity adaptiv add-flow add-provider add-skill advanc advi advisor advisory afterward agent aider aim allow allowlist already alway amp analysi analyz analyze-risk analyze-test anchor annotat another answer anti anti-pattern anyth anywher api apply apply-only approv arbiter arbitrat architect architectur archiv arg array artifact ask assign assist assum assuranc attach attachment attend audit auth authenticat author authz auto auto-retri automat automatabl autonomy availabl backend backoff banner bas becom behind best-effort beyond big big-pictur bind bit block blocker board bound boundary branch brand brief broker budget builder built built-in bundl button cannot canva cap cap-and-continu capability car careful catalog cau caveat cd ceil challeng challenge-respons challenger cheap checklist checkout checkpoint ci claim claud claude-cod clean clearer cli clo clock cloud cmd co code_writ codeba codebas codex coding-agent com command commit complet concept concurrency concurrent conductor confidenc config configur configurabl configurat confinement confirm conflict constraint consult container context continu continuou contract control control-character convent conversat copy cor correctness cost create-and-run creator credenti crew cross cross-vendor crush csrf ctrl ctrl-k curat current cursor custom customiz daemon daily dashboard debug-fail deci decid decis decision-summary decomposit dedicat deep deeper default-allow delay deliberately deni deny depend dependency deriv derived-flow destinat detach deterministic diff differ different directory-map disk distinct doc doctor documentat doesn dollar domain downgrad downgrade-model draft driv drop dry dry-run duplicat earlier early editor effect effort egress els email enabl end enforc enforcement engin enhanc enter entirely env environment ephemer esc escalat estimat event everyth evidenc execut executor exhaust exist exit expect explain explicit export express extend extern fail-clo fallback fast featur feel fell fenc fetch fewer field fifty fil filesystem fill filter fin find finish first first-run fixer flag flaky flat flight flow forbid form fram fresh full gap gap-fill gat gateway gemini generat getting-start git git-tree-merg glob glossary going good goos got guard guid halt hand handoff hard harden head headless heavier held hero high history hol hold hom honest horizont host hou http http-api human id ids imag implement implementat implementation-review implementer impossibl improv in-app in-progress index info informat inherit init initializ inject input insid inspect inspect-progress inspector inst installat instead instruct intak integrat interactiv invariant isn isolat item itself job json judgment key kind know knowledg label last leak learn least leav ledger legibility len lesson library lifecycl limit link liter liv loader loc localhost localhost-proxy log look loop loopback loudly machin mad main map markdown match matcher materi matter max mcp md ment merg merge_ready messag methodology metric micro micro-plan midway min minimalism mod model mov ms narrow nativ navigat navigator ndjson network never newer next non non-cli non-loopback noth notificat noun offlin ollama onc opencod operat opin opt-in orb orchestrator order os otherwi outcom outsid over-stuf overview overwrit owner owner-only packet panel panel-review parallel param parameter parent parity part pass past patch path pattern pau paus pause-resum payment pct per per-part per-pha per-provider permiss persona pha pick pick-up pickup pickup-analysi pickup-review pictur pid plain plan plan-only plan-review planner plausibl plausible-but-wrong plu policy ponytail portabl positiv post post-turn postur pre pre-publish predict prefer prefix preserv preset preset-ready press preview proc profil progress project project-param prompt propo protect prototyp prov provider provider-auth provider-nativ proxy prun publish push quality quality-arbitrat quest queu quick quickstart quot quota qwen rang rat rate-limit rather re re-read re-run re-sequenc re-validat reach read-only read-writ read_only readonly ready real really reason recent recogniz recommendat record recoverabl red redact reduc reduce-effort refer referenc refin refu register reject remember remot renam reorder repair repeat replac replay replayabl repo report repository request requir resilienc resolv respect respons restart restat restor resum retent retri retry retyp reu reus revalidat reversibl review review-authz review-correctness review-inject review-item review-risk review-secret review-security-risk review-test reviewer rewind right risk risky roadmap rol root round rout rul run run-id safety saga sandbox say scaffold scan scheduler schema scop scor seat second-review secret secret-scan security security-review seed selector separat sequenc sequentially servic sess setup sever shap shar sharpen shell shift shown sign sign-off simplify skill skip slower smaller snapshot soft someon someth sourc sovereignty spawn spec spec-up spec-up-intak spec-up-review spec-up-roadmap spend split squar src sse ssrf stabl stag standard stat statu stay steer step step-by-step story strict strong stuck stuf styl subcommand subscript subsystem suggest suit summary supers supervi supervis supervised-task supervisor supervisor-control surfac swap switch switcher synthesiz tab target task task-lifecycl teach team telemetry tell termin test themselv think thorough threshold tighten timelin timeout tip titl token touch tour transient tre troubleshoot trust try ts turn twic two ui unattend unavailabl uncommit undo uneven unprotect unsaf unsandbox until unver upload uploader usag usd using validat var vendor ver verb verbatim verdict verificat verifier verify veto via vib vibestrat vibestrate-md vibestrate_param visibl vocabulary wait waiting_for_approv walk walkthrough wall warn watch weak week welcom went whether whol why-a-human wider window without workflow workspac worktr worktre wrot yaml yellow yml yourself zero zero-egress",
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
      "body": "```text\nvibe crew - List crews, show a crew's roles, and set the default (\"active\") crew.\n  vibe crew list [--json] - List configured crews (the default is marked).\n  vibe crew show [--json] - Show a crew's roles, profiles, and seats (default crew if omitted).\n  vibe crew use - Set the default (\"active\") crew - runs without --crew use it.\n  vibe crew draft [--yaml --json] - Turn an English description into an editable Crew draft (supervisor-assisted). Draft only - never writes; adopting it means saving the printed role files, then the block, into project.yml.\n  vibe crew presets - Ready-made crews (fast / thorough / cheap / local) tuned by provider effort.\n    vibe crew presets list [--json] - List available presets and whether they're installed.\n    vibe crew presets add - Install a preset crew (fast / thorough) into project.yml.\n```"
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
      "body": "```text\nvibe provider - Inspect, configure, and test local coding-CLI providers.\n  vibe provider detect [--json] - Scan PATH for known local coding CLIs (claude/codex/opencode/aider/ollama).\n  vibe provider list [--json] - Show providers configured in this project.\n  vibe provider test [--yes] - Send a tiny no-op prompt to a configured provider and look for the magic token.\n  vibe provider set [--yes] - Assign every default agent to use the given provider.\n  vibe provider setup - Guided provider setup wizard.\n  vibe provider remove [--yes] - Remove a provider from project.yml (refuses if a role still uses it).\n  vibe provider catalog [--json] - Show the provider capability catalog (built-in + your .vibestrate/providers-catalog.yml overlay).\n  vibe provider refresh [--force --dry-run] - Detect each provider's real models/efforts (codex `debug models` JSON, else --help scraping) and write them to the catalog overlay. Refreshes stale built-in lists; local only.\n```"
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
      "terms": "architect brief checklist concis context context-fil context-url crew default fil flow flow-brief flow-context flow-forc flow-skip forc from i implement mod no no-select only param permiss permission-mod plan port preview profil read read-only resum resume-from resume-stag review rol run seat seat-rol select skill skip stag step step-profil supervisor task the ui ui-port unattend url verify vib workflow",
      "body": "```text\nvibe run [--ui --ui-port --task --crew --profile --read-only --permission-mode --unattended --skills --concise --flow --supervisor --select --no-select --step-profile --seat-role --flow-brief --flow-context --flow-force --flow-skip --param -i --resume-from --resume-stage --preview --checklist --context-file --context-url] - Run the default plan→architect→implement→review→verify workflow.\n```"
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
      "terms": "a act action-broker adapter advisor agent and api apply architectur assignment assist author background behind broker build builtin builtin-flow bundl catalog claud claude-code-provider claude-stream-json cli cod code_writ codebas command command-lin config config-loader config-schema consult context control cor crew crew-preset crew-registry crew-schema dashboard deeper default default-prompt default-rol definit delivery detach detached-run detect detector did diff diff-servic dir directory directory-map discovery doc doctor domain effort effort-heuristic engin entry error error-format execut fetch flow flow-assist flow-discovery flow-schema format four frontend fs gateway generat generate-docs-metadata git going guard guarded-fetch handbook heuristic http hub ids in index init ink integrat integration-servic its json know known known_provider len level lin liv loader loc machin map mcp merg merge-advisor merge-preview metadata metric miss most multi multi-project navigator notificat of onboard only orchestrator output output-format over owner owner-taught path path-guard persona phas pick planner policy policy-engin postur preset preview profil profile-schema profile-usag program project project-detector prompt propos provider provider-detect provider-resilienc provider-runner provider-schema pty publish q queu react read read-only read_only ready recip registry remain resilienc review roadmap rol role-registry role-schema rout rul run run-engin run-entry runner runtim safety saga scheduler schema script seat select select-workflow server servic sess setup shap shell show simpl skill skill-assignment-servic skill-discovery skill-loader sourc spec spec-up src sse start stat state-machin stor stream stream-json suggest supervisor task taught termin test the their tim tip to top top-level touch tour tre ts tui ui up usag util validat vib vibestrat what wher who will word workflow workspac worktre writ yml you your",
      "body": "## In simple words\n\n```\nsrc/\n  core/        the run engine and its state\n  agents/      who runs a seat\n  providers/   adapters over the CLIs\n  flows/       recipes and their schema\n  safety/      the Action Broker\n  policies/    your rules\n  ui/          Mission Control\n  cli/         the vibe command\n```\n\n### The shape of `src/`\n\n```\ncli/            the vibe command-line program\nserver/         local HTTP/SSE API behind vibe ui\nui/             React dashboard (Mission Control)\nshell/          Ink TUI behind vibe shell\ncore/           run engine, state machine, stores,\n                metrics, validation, context\nsupervisor/     picks persona, lens, flow, posture\nflows/          Flow schema, catalog, runtime, hub\nagents/         crew -> role -> profile -> skills\nproviders/      local CLIs, adapters, MCP config\nproject/        .vibestrate/project.yml schema\nsafety/         Action Broker, apply gateway\npolicies/       owner-taught project rules\ngit/            worktrees, merges, merge-preview\nroadmap/        tasks, planner, proposals\nreviews/        review suggestions and bundles\nscheduler/      background run queue\nsetup/          onboarding, doctor, provider setup\nnotifications/  rules, routing and delivery\nconsult/        read-only project Q&A + handbook\nspec-up/        the Spec-up phase\nterminal/       PTY terminal sessions\nworkspace/      multi-project navigator\nutils/          fs, json, paths, time, run ids\n```"
    },
    {
      "id": "docs/architecture/http-api",
      "kind": "doc",
      "title": "HTTP API",
      "source": "Vibestrate docs: architecture/http-api",
      "summary": "The local dashboard API, a versioned /api/v1 contract with optional bearer-token auth and the flow import, export, and create endpoints.",
      "titleTerms": "api http",
      "terms": "0 1 127 200 201 24 400 401 403 404 4317 500 a abort act advic advis an analyz and answer api apply approv architectur at auth authenticat authorizat bas bearer bearer-token bind body bound branch broker by call character cheap ci clean clos cod complet confirm consult contract control control-character coverag creat creator crew cross cross-origin cross-sit csrf curl currency dashboard data deeper default definit delet deny descript did don draft driv effort endpoint error event exist export expos fail fail-clos favicon fetch fil file-or-url finish finish-now first flow flow-creat flow-delet flow-fork flow-import flow-patch for fork format from gat get git glanc going guard guid h head health hex host http http-api id ids import in initializ input integrat is it json kind know lan loc localhost loopback main merg merge-to-main messag ndjson need network new no non non-loopback now of off on only openssl option or origin our out over overview overwrit own patch path paus phas policy portability post preview problem profil project rand read recommendat record redact refus requir require_approv resolv resolve-first rol run s scan schema seat sec sec-fetch-sit secret secret-scan server sigterm simpl sit siz sourc sse ssrf stag stage-on-integration-branch start stop supervisor surfac target text that the then think thread tip to token token-gat tool tru turn ui unverifi unvers url v1 validat vers vib vibestrat vibestrate_api_token what with word writ www www-authenticat yaml yml you your",
      "body": "## In simple words\n\n`vibe ui` starts a local server (default `http://127.0.0.1:4317`) that backs the dashboard. The same endpoints are a stable, scriptable contract.\n\n```\ncurl http://127.0.0.1:4317/api/v1/runs\n```\n\nAnything the dashboard does, a script can do.\n\n**It binds to loopback.** The server is reachable from this machine, not from your network, and write endpoints cross the same Action Broker the rest of the product does. A policy denying file writes stops an HTTP caller exactly as it stops the UI.\n\n**Tip.** Versioned paths (`/api/v1/...`) are rewritten to their unversioned form internally, so both work. Prefer the versioned form in scripts you intend to keep.\n\n## What the API is for\n\n**Driving a run from code** Start one, poll it, read the verdict, all without a browser.\n\n**CI** Kick a run from a pipeline and act on the result.\n\n### Endpoints at a glance\n\n```\nGET  /api/v1/health\nGET  /api/v1/flows\nGET  /api/v1/flows/:flowId/export\nPOST /api/v1/flows/import\nPOST /api/v1/flows\nPOST /api/v1/flows/draft\nPOST /api/v1/crews/draft\n\nGET  /api/integration/overview\nPOST /api/integration/advice\nPOST /api/integration/analyze\nPOST /api/integration/finish\n\nGET  /api/supervisor/threads\nPOST /api/supervisor/threads/:threadId/turn\n```\n\n### Authentication\n\n```\n# expose on the LAN, token-gated\nexport VIBESTRATE_API_TOKEN=$(openssl rand -hex 24)\nvibe ui --host 0.0.0.0\n\n# then call it with that token\nAUTH=\"Authorization: Bearer $VIBESTRATE_API_TOKEN\"\ncurl -H \"$AUTH\" http://<host>:4317/api/v1/flows\n```"
    },
    {
      "id": "docs/architecture/overview",
      "kind": "doc",
      "title": "Architecture overview",
      "source": "Vibestrate docs: architecture/overview",
      "summary": "How Vibestrate's pieces fit together, from the orchestrator down to the local CLI binary.",
      "titleTerms": "architectur overview",
      "terms": "a agent an api approv architectur as assert binary by child cli cod code_writ coding-agent component control cor daemon deeper default deliberately demand did down export fit for four from gat git glob going how in invocat it know loc machin manag miss model no nod on one only orchestrator os overview own per piec process project provider read read_only record relat remot run s sandbox see serv server simpl spawn src telemetry the thing tip to together transit ts ui v validat vib vibestrat wait waiting_for_approv what word worktre writ yml you your",
      "body": "## In simple words\n\nVibestrate is a single Node process that orchestrates other local processes. There is no daemon, no service mesh, and no cloud component.\n\n```\nyou -> vibe (one Node process)\n         |-- spawns your coding-agent CLIs as child processes\n         |-- manages a git worktree per run\n         `-- serves Mission Control on demand\n```\n\n**Tip.** \"Single process, no daemon\" is worth taking literally. Nothing runs when you are not running it, so there is no background service to stop, no port held open, and nothing to uninstall beyond the package.\n\n## The four things it owns\n\n**Spawning providers** Your CLIs, as child processes, reading their stdout.\n\n**A worktree per run** Created at start, named for the run, left on disk afterwards.\n\n**The record** Decisions, tokens, spend and artifacts, written locally as it happens.\n\n**The gate** Every side-effecting action crosses the Action Broker.\n\n**Did you know?** Vibestrate is never in the middle of a model call. Prompts and responses travel directly between the vendor CLI and the vendor's servers; Vibestrate builds the prompt, hands it over, and reads what comes back. That is why it holds no API keys.\n\n### The components\n\n```\nvibe CLI  (src/cli)\n   |\n   v\nOrchestrator  (src/core/orchestrator.ts)\n   |\n   +--> Agents  (src/agents)\n   |       |\n   |       v\n   |     Providers  (src/providers)\n   |       |\n   |       v\n   |     Local CLI binary on your machine\n   |\n   +--> Validation  (src/core/validation/)\n   |\n   +--> Mission Control  (src/server + src/ui)\n```\n\n### What the orchestrator owns\n\nThe orchestrator keeps a run moving and remembers where it is. It owns:"
    },
    {
      "id": "docs/cli/dashboard",
      "kind": "doc",
      "title": "Mission Control",
      "source": "Vibestrate docs: cli/dashboard",
      "summary": "The local dashboard for inspecting runs, approving gates, reading diffs, and steering the orchestrator.",
      "titleTerms": "control miss",
      "terms": "4317 a abort add advanc all and approv audit automat banner between block board brand c canva chang claud cli cmd codebas config control crew ctrl ctrl-c ctrl-k dashboard deeper did diff do doe els env execut fail fil flow for g gat going headless hero http id in inspect inspector it jump k know ledger list liv loc localhost log main merg merge-to-main metric miss mor most network no no-open not noth open orchestrator outcom p pag policy port profil project propos provider r reach read rol run simpl sourc start statu steer step stop supervisor switcher tab the tip to tre ui undo undo-merg use vib watch what will word you",
      "body": "## In simple words\n\nMission Control is Vibestrate's web UI. A local process serves it on demand from your own machine.\n\n```\nvibe ui            # opens http://localhost:4317\n```\n\nThere is no backend of ours behind it.\n\n**What it reaches the network for, and nothing else:** the Flow Hub when you search, pull or publish a flow; fetching a skill from a URL; importing a flow from a URL. It never pushes, never merges without a confirmation you send with the request, and never runs a shell command you type.\n\n**Tip.** It is served on demand, so it is not a daemon you leave running. Close it and nothing stops - runs continue, and reopening it shows you where they got to.\n\n## The pages you will use most\n\n**Mission control** Start a run, see what is waiting on you, ask the supervisor.\n\n**Runs** Everything this project has done, and the detail of any one of them.\n\n**Crew and Flows** Who does the work, and the recipes they follow.\n\n**Policies** The rules enforced on every run.\n\n**Did you know?** The dashboard writes config through the same gated writer the CLI uses, so a project policy denying file writes stops the editor too. The UI is not a privileged path around your own rules.\n\n### Start it\n\nOpen the dashboard with:\n\n```\nvibe ui\n```\n\nThe default port is `4317`. Pass `--port` to change it.\n\nIt opens your browser by default. `--no-open` keeps it headless.\n\nFirst visit, a short guided tour points out the six surfaces the rest of the app hangs off: Runs, Flows, Board, Policies, Consult, and New run. Skip it any time, or take it again later from the help overlay (press `?`).\n\n```\nvibe run \"Add audit logging\" --ui\n```"
    },
    {
      "id": "docs/cli/overview",
      "kind": "doc",
      "title": "CLI overview",
      "source": "Vibestrate docs: cli/overview",
      "summary": "The shape of the vibe command, how its subcommands group, and the conventions every command follows.",
      "titleTerms": "cli overview",
      "terms": "0 1 127 2 20 4317 4400 a abort accept acm activ add advanc advis agent allow allow-token-to-custom-host alway an and any api apply approv architect architectur are area arg as assess assign assuranc astro audit auth automat automatabl bas base-url boolean browser built built-in cd chang cheap check clear cli cod codebas codebase-map com command config configur confirmat consult control convent cor could crew current custom dashboard deep deep-refactor deep-review deeper default definit descript detect did discoverabl do doctor don draft durabl enabl enter env every execut export fals fetch filter find fix flow follow for framework friendlier from gat generat get ghp git github going group guidanc h handl healthz heavy high horizont host how hub i id import in init input insid inspect inst interactiv is it its json key know l leak learn ledger level list log login look loop map max md memory miss mor my my-flow nam no no-open not noun null number of onc one only open or out overview overwrit param parity pass past path paus payment per plan planner pnpm port pre pre-publish preset preview print profil project project-param prompt provider publish raw read read-only readabl recent redo refactor referenc refus regenerat reject remov renam render replay request request-chang resolv resum resume-from resume-stag reus review review-heavy reviewer rewind right risk rol rout run s safety sam say scaffold schema secret selector semver set settabl setup shap shell show simpl sk skill skip slug so spend stag start statu step stor str strong subcommand suggest supervis supervisor t tabl task test that the then thorough tip to token top top-level tru typecheck ui unassign unset up url usd use user validat var verb verify vers via vib vibestrat vibestrate_api_token vibestrate_hub_token view warn welcom what wher wir with word work worktre writ wrong yaml yes yml you your your-github-login zod",
      "body": "## In simple words\n\n```\nvibe init                       # scaffold .vibestrate/\nvibe doctor --fix               # find and wire up your CLIs\nvibe run \"Add a /healthz route\" # do the work\nvibe status                     # where is it\nvibe ui                         # open Mission Control\n```\n\n### The core loop\n\n```\nvibe init               # once per project\nvibe doctor             # verify env + config\nvibe run \"Your task\"    # start a run\nvibe status             # active and recent runs\nvibe replay <runId>     # inspect any past run\nvibe path <runId>       # the run's git worktree\nvibe rename <runId> a friendlier name\n```\n\n### Command shape\n\n```\nvibe (no args)       → the interactive shell\nvibe <command>       → a top-level command\nvibe <area> <verb>   → a verb inside an area\n```\n\n```\ntop-level  init      setup     welcome\n           run       status    abort\n           pause     resume    doctor\n           ui        replay    shell\n           path      rename    logs\n           assurance audit     ledger\n           consult\n\nareas      provider  config    skills\n           flows     params    approvals\n```\n\n### Worktrees, and rewinding a run\n\n```\ncd \"$(vibe path <runId> --cd)\"\n```"
    },
    {
      "id": "docs/cli/shell",
      "kind": "doc",
      "title": "Interactive shell",
      "source": "Vibestrate docs: cli/shell",
      "summary": "The terminal panel vibe opens with no arguments, with a live status bar, tabbed pages, and an always-on command prompt.",
      "titleTerms": "interactiv shell",
      "terms": "0 00 1 1-9 10 2 30 9 a abort activ activity advanc alway always-on an and approv argument argv autocomplet automat b back bar body branch browser budget c cap cli clos command complet config context context-sensitiv control crew ctrl current d daily deeper default delet did dismiss do doc down e edit effort end enter esc f flag flow front get git going header help hi high history hom i idl ids in in-termin it its j json k keep key know layout lin liv low m main medium miss mod n nam navigat new no o of on only open opt or p pag palett panel paus prefix previou profil project prompt q queu quit r re re-run read read-only red replay resum retent roadmap run scroll select sensitiv set shell shift show simpl snapshot spac spend statu subcommand switch tab task termin the their they tip to today topic trunk up usd validat valu vib vibestrat view websit what with word worktre writ yellow you your",
      "body": "## In simple words\n\nRunning `vibe` with no arguments opens the interactive shell: a terminal panel keeping the project's context in front of you, with a prompt to drive Vibestrate without leaving the keyboard.\n\n```\nvibe\n```\n\n**Tip.** The shell is for a working session, not a one-off. If you only want to start a single run, `vibe run \"...\"` is fewer keystrokes and exits when it is done.\n\n## What it keeps in front of you\n\n**The project and its status** Which project, which crew, what is running.\n\n### Layout\n\n```\nRuns      p pause · r resume · a abort · R re-run\nRoadmap   e edit · n new · d delete · Q queue\n```\n\n### Autocomplete\n\n```\nconfig             view show get set keys validate\nconfig show -      --json\n--effort           low | medium | high\n--effort=hi        --effort=high\n--crew --flow      your crew and flow ids\n--profile --task   your profile and task ids\nreplay             your run ids\ntasks show         task ids\nflows show         flow ids\n```\n\n```\n▸ vibe config set git.▌\n    › git.mainBranch             = main\n      git.branchPrefix           = vibestrate/\n      git.snapshotRetentionRuns  = 0\n    Name of the main/trunk branch (default main).\n    ⇥ complete · ↑↓ select · esc dismiss\n```\n\n### Docs browser\n\n```\n↑ / ↓  or  j / k   scroll the page\nSpace / b          page down / up\n[ / ]              switch topic\no                  open the docs website\nEsc                close\n```\n\n### Navigation\n\n```\n1-9 / 0   switch tabs\n:         the command palette\nEsc       back to the previous page\nd         the in-terminal docs browser\nB         Mission Control in your browser\n?         context-sensitive help\nq         quit\n```"
    },
    {
      "id": "docs/cli/supervised-tasks",
      "kind": "doc",
      "title": "vibe tasks (supervised runs)",
      "source": "Vibestrate docs: cli/supervised-tasks",
      "summary": "Author and run supervised tasks - a task with ordered steps you define once and sequence later through the Conductor.",
      "titleTerms": "run supervis task vib",
      "terms": "0 1 2 20 3 4a08 5 7c1 9b2d a acceptanc add advanc and apply ask at author automat back be beat between bil block board boolean boundary brief budget chang check checklist ci ci-migrate-the-write-path-4a08 ci-update-the-model-9b2d clean clear cli cod com comma comma-separat command conductor config creat dashboard deeper default defin did display don done-when edit enabl enhanc error executor exhaust exit fil flow for from going good halt handler happen has heal hint id idl in in_progress into invariant is it item its json key know languag later leav lik list liv look mark max may midway migrat model mov need next no not null number objectiv of on onc one only order own parity part pass path paus pend per per-part plain plan pnpm posit proc profil progress promot re re-read re-sequenc read reason relat remov reorder replac rest resum review reviewer rol rout run s saga scop self self-heal-exhaust separat sequenc set sever shap show simpl spend split src stat statu step still stop str strong summary supervis supervised-task supervisor tabl task task-id task-settings-v2-7c1 team text the through tip titl to tru ts typ typecheck uncheck up updat usd v1 v2 vib want watch weak what when with word work worktre writ you your",
      "body": "## In simple words\n\n```\nvibe tasks add --supervised \"Add team billing\"\nvibe tasks checklist add <task-id> \"Create the teams table\"\nvibe tasks run <task-id>\n```\n\n### Author the steps\n\n```\nvibe tasks add --supervised \"Settings v2\"\n```\n\n```\n✓ Task added.\n  id: task-settings-v2-7c1e\n  title: Settings v2\n```\n\n```\nvibe tasks checklist add task-settings-v2-7c1e \\\n  \"Update the model\" \\\n  --objective \"Replace the SettingsV1 type with \\\nSettingsV2 in src/models/settings.ts\" \\\n  --acceptance \"pnpm typecheck passes with no \\\nerrors in src/models/\" \\\n  --files \"src/models/settings.ts\"\n```\n\n```\n✓ Added checklist item ci-update-the-model-9b2d.\n  Update the model\n```\n\n```\n--objective <text>    the executor's scoped brief\n--acceptance <text>   the done-when check, in\n                      plain language\n--files <list>        comma-separated file hints,\n                      re-read from the worktree\n                      at the step\n```\n\n### What a good step looks like\n\n```\nweak\n  objective:   \"clean up settings\"\n  acceptance:  \"it works\"\n\nstrong\n  objective:   \"Replace SettingsV1 with SettingsV2\n                in src/models/settings.ts. Leave the\n                route handlers to a later step.\"\n  acceptance:  \"pnpm typecheck passes with no\n                errors in src/models/\"\n```\n\n### Editing and reordering\n\n```\nvibe tasks checklist edit <taskId> <itemId> \\\n  <text...>\nvibe tasks checklist move <taskId> <itemId> \\\n  <position>\n```"
    },
    {
      "id": "docs/cli/supervisor",
      "kind": "doc",
      "title": "vibe supervisor",
      "source": "Vibestrate docs: cli/supervisor",
      "summary": "The supervisor's kill switch from a terminal - stop it acting, resume it, check whether it may act - plus the persona commands.",
      "titleTerms": "supervisor vib",
      "terms": "08 15 169 2026 2026-08-15 34 49 a abort act adopt advanc advis again an and answer archetyp are as at authorizat authz automat autonomy bar blast blast-radiu built built-in but can catalog check cli command control copy correctness correctness-purist data data-migration-guardian deeper default delet did diff engineer every fast first for from frontend frontend-reviewer going guardian hawk her id in init inject into it json kill know len let list may migrat no non not now of only paus performanc performance-skeptic permiss persona plu postur pragmatist prefer project purist radiu reason red remov resolv resum review reviewer right risk risky run s sam sandbox sandbox-suggest secret security security-hawk security-risk set ship ship-fast-pragmatist simpl skeptic squar staff staff-engineer statu still stop subcommand suggest supervisor switch t12 task termin test the them thi tip tru updat versu vib vibestrat whether will within word yml you your z",
      "body": "## In simple words\n\n```\nvibe supervisor stop      # it may still answer; it may not act\nvibe supervisor status    # may it act right now?\nvibe supervisor resume\n```\n\n### Every subcommand\n\n```\nvibe supervisor <subcommand>   (bare: same as list)\n\nlist          resolved personas, built-in + project\narchetypes    the catalog you can adopt\nadopt <id>    copy an archetype into project.yml\ndefault <id>  set this project's default\nremove <id>   delete a project persona\nstop          stop it acting; it still answers\nresume        let it act again\nstatus        whether it may act right now\n```\n\n```\n--json     list, archetypes, status\n--reason   stop\n```\n\n### Stop and resume\n\n```\nvibe supervisor stop --reason \"reviewing the diff\"\nvibe supervisor resume\n```\n\n```\n! Supervisor stopped. It will answer, but it\n  will not act. (reviewing the diff)\n✓ Supervisor resumed. It can act again, within\n  your autonomy setting.\n```\n\n### Whether it may act right now\n\n```\nvibe supervisor status\nvibe supervisor status --json\n```\n\n```\n✓ Running - may act, within your autonomy setting.\n```\n\n```\n{\n  \"pause\": {\n    \"paused\": true,\n    \"reason\": \"\",\n    \"updatedAt\": \"2026-08-15T12:49:34.169Z\"\n  }\n}\n```\n\n### Personas\n\n```\nvibe supervisor list\n```\n\n```\nSupervisor personas\n  → staff-engineer (default) [built-in]\n      Correctness, risk, and blast-radius first.\n      lenses: correctness, tests, security-risk\n  → security [built-in]\n      Authorization, secrets, and injection first.\n      lenses: authz, secrets, injection\n      posture: prefers sandbox-suggested for\n        risky tasks\n```\n\n```\nvibe supervisor archetypes\nvibe supervisor adopt security-hawk\nvibe supervisor default security-hawk\n```"
    },
    {
      "id": "docs/concepts/annotation",
      "kind": "doc",
      "title": "Annotations",
      "source": "Vibestrate docs: concepts/annotation",
      "summary": "A short note pinned to a file, which agents read before they start work.",
      "titleTerms": "annotat",
      "terms": "40 40-58 58 a actually add agent an annotat as auth authoritativ bear befor bug codebas concept copy deeper did do don fil for generat going guidanc her human in is it know lin load load-bear not one order pattern pin project rang read refactor resolv see sess short simpl src start t task teach the them thes they thi tip to touch treat ts user visibl what when which whol word work would x you your",
      "body": "## In simple words\n\nAn **annotation** is a short note you pin to a file, telling agents something they should know before they touch it.\n\nIt works like a sticky note on a page. The page is unchanged, but anyone reading it sees your note first. Use one to say \"do not refactor this\", \"this function is the bug\", or \"match the pattern in `x.ts`\" without editing the file yourself.\n\n**Tip.** An annotation is the right tool when the thing you want to say is about *one file*. If it is true across the whole codebase, write a skill instead - a note pinned to forty files is forty things to keep in sync.\n\n## When you would pin one\n\n**\"This is the bug\"** Point the run at the function rather than letting it search.\n\n**\"Do not touch this\"** Load-bearing code that looks refactorable and is not.\n\n**\"Copy the pattern here\"** Name the file you want imitated.\n\n**\"This is generated\"** Stop an agent hand-editing something a script rewrites.\n\n**Did you know?** Annotations marked visible to agents are added to every agent's prompt during a run - your guidance, acknowledged by the whole crew, not just the one worker that happens to open that file.\n\n### What a note pins to\n\nEvery note targets a file, and you can point it at a precise spot:\n\n- **Whole file** - leave the line blank. - **A line** - set a start line, or click the `+` that appears when you hover a line in the file viewer. - **A range** - set a start and end line.\n\n### What an agent actually reads\n\n```\n# Human Annotations\n\nThe user pinned these notes to the codebase.\nTreat them as authoritative guidance for this task:\n\n- **src/auth/session.ts:40-58** - don't refactor\n  this; the ordering here is load-bearing.\n```"
    },
    {
      "id": "docs/concepts/configuration",
      "kind": "doc",
      "title": "Configuration & settings",
      "source": "Vibestrate docs: concepts/configuration",
      "summary": "Everything you can tune lives in one committed folder at your project root.",
      "titleTerms": "configurat set",
      "terms": "10 10-styl 20 20-test a act adaptiv advis and any as at block budget by can check cli cod code_writ codebas command commit concept config configurat control crew deeper default deterministic did doctor dot dot-path edit editor env every everyth execut fil flow folder get git gitignor going group guidanc hous human id in init inst instruct into it json key know learn liv load loc local-worktre map md merg methodology next not null one only out own parity path per permiss persona pnpm policy ponytail postur profil project prompt provider raw read read_only readabl requir resilienc rol root rul run s sam scheduler schema secret sess set settabl show simpl siz skill spec stay styl supervis supervisor teach test that the thing tim tip to tru tun turn ui up validat valu vers vib vibestrat view what wher word worker workflow worktre writ yml you your",
      "body": "## In simple words\n\nAlmost everything you can tune lives in one place: the `.vibestrate/` folder at your project root, created by `vibe init`.\n\nThe heart of it is a single file:\n\n```\n.vibestrate/\n  project.yml      providers, profiles, crews, flows, policies, validation commands\n  rules.md         guidance loaded into every turn\n  roles/           one file per worker's instructions\n  skills/          house rules any role can read\n  flows/           your own and installed flows\n  policies/        deterministic rules\n```\n\nIt is plain YAML sitting inside your repo. Commit it and your whole team runs the same setup.\n\n**Tip.** You rarely need to hand-edit `project.yml`. The dashboard writes the same file through a gated writer, so a project policy that denies file writes stops the editor too. Hand-editing is for the handful of fields no page exposes.\n\n## What lives where\n\n**`project.yml`** The wiring: providers, profiles, crews, flows, policies, validation commands.\n\n**`rules.md`** Guidance stacked into every agent turn.\n\n**`roles/`** One file per worker, holding its instructions.\n\n**`skills/` and `flows/`** Reusable house rules, and the recipes runs follow.\n\n### Viewing and editing your configuration\n\n```\nvibe config view          # grouped, readable\nvibe config view --json   # the same, as JSON\nvibe config show          # raw project.yml\nvibe config keys          # every settable key\nvibe config validate      # check the schema\n\n# one value at a time, by dot-path\nvibe config get commands.validate\nvibe config set workflow.requireHumanMerge true\n```"
    },
    {
      "id": "docs/concepts/consult",
      "kind": "doc",
      "title": "Consult",
      "source": "Vibestrate docs: concepts/consult",
      "summary": "Ask one question about your project and get an answer grounded in what is really there.",
      "titleTerms": "consult",
      "terms": "a about advanc an and answer api apply are ask assist at automat beyond block can caveat chang claud cli concept confidenc config confirm consult cost deeper did diff do documentat doe effort estimat fil fit flow from get git going good ground guid hand heavier her i id in is it its key know last leav left level list look materi md me model money new noth null one policy post profil project propos provider quest really reject relat run s screen shell should simpl som sourc spend src surfac task that the ther thi tip to ts two until updat use vib vibestrat week what which why word writ yml you your",
      "body": "## In simple words\n\n**Consult** answers one question about your project. It reads your files, your config and your recent runs. It also reads Vibestrate's own documentation, compiled into the package, so an answer about the product quotes a real command or config key rather than a remembered one.\n\nYou reach it from the orb that rests at the bottom right of every screen:\n\n!The bottom right corner of the dashboard. Two round controls stack there: a terminal button showing a prompt caret, and below it the Consult orb, a glowing violet square inside a circle.\n\nOne click from whatever raised the question, on whatever screen raised it.\n\n**Tip.** Consult is one question and one answer. The supervisor chat is a conversation that remembers the thread. Reach for the orb when you want a fast grounded answer about what is in front of you, and the chat when you are working something out over several turns.\n\n### Advanced: CLI and automation\n\n```\nvibe consult \"Should this use a heavier flow?\"\nvibe consult \"Why did the last run block?\" \\\n  --run <runId>\nvibe consult \"What did this week's runs spend?\"\nvibe consult \"What is left here?\" --task <taskId>\nvibe consult \"What does this file do?\" \\\n  --file src/consult/consult.ts\n```\n\n```\nvibe consult \"...\" --profile <id>\nvibe consult \"...\" --provider <id> \\\n  --model <model> --effort <level>\n```\n\n```\nvibe guide proposals\nvibe guide apply <id>\nvibe guide reject <id>\n```\n\n```\nvibe policies list\nvibe policies confirm <policyId>\nvibe policies reject <policyId>\n```"
    },
    {
      "id": "docs/concepts/crew",
      "kind": "doc",
      "title": "Crew",
      "source": "Vibestrate docs: concepts/crew",
      "summary": "The team of AI workers you cast, and which model each one runs on.",
      "titleTerms": "crew",
      "terms": "a add ai and another builder by careful cast cheap check claim concept cor crew deeper did each edit entirely executor fast fil from get going hand hav how implementer in init it job keep know liv loc mad match model new no of offlin on one order pag past project ready ready-mad rol run sav seat simpl tak team the thorough tip to two ui use vib vibestrat when wher which word work worker would yml you",
      "body": "## In simple words\n\nA flow says which *kinds* of worker a job needs: someone to plan it, someone to build it, someone to check it. It does not say who.\n\nA **Crew** is who shows up. It is your roster: a list of workers, each one pointed at a model. One crew might be all Claude. Another might have Codex build and Claude review. The flow does not change either way.\n\nEach worker on the roster is called a **Role**, and a role answers two questions: which kinds of step can it take, and which model does it run on.\n\nOpen it with `vibe ui` and pick **Crew** in the sidebar. Here is the crew `vibe init` gives you:\n\n!The Default crew card. A green stripe on the left reads Crew default, runs by default. The card names the crew Default, counts 6 roles and reads all seats filled, with Configure and Edit roles buttons.\n\nSix workers, every seat the flow asks for covered, and it runs unless you name another.\n\n**Tip.** You do not need a second crew to change how a run behaves. Most of the time you want a different *model*, and that lives on the role's profile. Reach for a second crew when you want a genuinely different team, like an all-local one.\n\n## When you would use one\n\n**Have one model check another** Put Codex on the role that builds and Claude on the role that reviews. The reviewer reads the diff cold, so it is not marking its own homework.\n\n**Keep a cheap team and a careful team** A `fast` crew for a typo or a rename, a `thorough` crew for a migration. Same flows, different roster, chosen per run.\n\n**Work entirely offline** A `local` crew points every role at a provider on your own machine, so no code leaves it."
    },
    {
      "id": "docs/concepts/derived-flows",
      "kind": "doc",
      "title": "Derived flows",
      "source": "Vibestrate docs: concepts/derived-flows",
      "summary": "Builds a flow from the work itself, rather than forcing every task through one fixed recipe.",
      "titleTerms": "deriv flow",
      "terms": "110 120 2 23 322 a absenc add ambiguou an and answer api are auth b becaus beyond bil block build c cannot chang command concept concurrency counter data data-integrity decomposit deeper default depend deriv derived-flow describ design did different distinct do doe down endpoint every evidenc feel fix flow flow-forc for forc fre from going has implementer in input integrity invit is isolat it itself know len mad max max-unit migrat model money n need not noth of on onc one only owner owner-only part performanc plan planner positiv public public-api rather reach recip requir reus review reviewer rol run schema scor seat seat-rol second secret simpl skip stand static step tabl task team test than that the through tip to touch ui unit untrust untrusted-input validat verifier verify want we what when will word work workflow writ wrong you your",
      "body": "## In simple words\n\nA flow is a generic recipe, so a fixed one is always slightly wrong: too heavy for a one-line change, too light for a migration touching money.\n\n**Deriving** builds a flow from the work itself. Give it a task with real parts to it and you get a flow shaped to those parts, rather than the same eight steps regardless.\n\n```\nTask: \"Add team billing: a teams table, an owner-only invite endpoint, a seat counter\"\n\nderived flow\n  plan            -> planner\n  migrate         -> implementer   (schema change, isolated)\n  endpoint        -> implementer\n  review:money    -> reviewer      (added because the task touches billing)\n  validate        -> your commands\n  verify          -> verifier\n```\n\n**Tip.** Deriving **writes nothing**. It prints a flow for you to read, and adopting it is a separate step you take. Treat it as a proposal from something that read your task, not as a decision already made.\n\n## When to reach for it\n\n**The task has distinct parts** A schema change, an endpoint and a UI are three different risk profiles wearing one title.\n\n**The default feels wrong** Too many steps for a rename, too few for a migration.\n\n**You want a flow you will reuse** Derive once, read it, adopt it, and it becomes a normal project flow.\n\n**A part needs a different lens** Money-touching work can carry a review the rest of the task does not need."
    },
    {
      "id": "docs/concepts/flow",
      "kind": "doc",
      "title": "Flow",
      "source": "Vibestrate docs: concepts/flow",
      "summary": "The recipe a run follows - its ordered steps, and the kind of worker each step needs.",
      "titleTerms": "flow",
      "terms": "a actually adaptiv add alway and arbitrat as ask assist auth brief build chang check clear cli codex codex-review com concept contain continu cor customiz deeper default deriv did doe draft each error express field fil flow follow for from gat going has hub import in install it its keep kind know list mak model nam need new no no-select of off on one only or order overrid own paus pick plan plan-only profil project provider quality quality-arbitrat recip referenc repeat reveiw review reviewer run sam sav seat select set shar should show simpl siz skip spec step step-profil the thi tighten tip to unknown up use vib vibestrat want what when wher which word worker would writ yml you",
      "body": "## In simple words\n\nA **Flow** is a recipe. It lists the steps to work through, in order, and says what *kind* of worker each step needs: someone to plan, someone to build, someone to review.\n\nWhat it never says is *which AI model*. That is the whole point. A flow describes the process; your crew supplies the people. So a flow a stranger wrote runs on your models, at your budget, without you editing it.\n\nEach slot a step asks for is called a **seat**, and seat covers those next.\n\nOpen **Flows** in the sidebar. Every flow this project can run is a card:\n\n!The Default flow card. A bar of eight coloured blocks shows its steps in order. Below, the description reads: the standard plan, architect, implement, validate, review workflow, review loops back to fix and re-validate until it passes or the bound is hit, then a verify gate decides. Three tiles read 8 steps, 6 seats, v1 version.\n\nThat bar is the flow itself, coloured by the job each step does: **Build** writes the change, **Review** judges it, **Check** runs commands that pass or fail, **Gate** stops for a person. You can read a flow's length and shape before opening it.\n\n### From the CLI\n\n```\n# what this project has, and what a flow contains\nvibe flows list\nvibe flows show quality-arbitration\n\n# run one\nvibe run \"Tighten the auth checks\" \\\n  --flow quality-arbitration\n```\n\n```\nvibe profile add codex-review --provider codex\n\nvibe run \"Tighten the auth checks\" \\\n  --flow default \\\n  --step-profile review=codex-review\n```"
    },
    {
      "id": "docs/concepts/policies",
      "kind": "doc",
      "title": "Policies",
      "source": "Vibestrate docs: concepts/policies",
      "summary": "The project's one rule surface - tiered rules enforced on every run, from soft advice to a hard merge block.",
      "titleTerms": "policy",
      "terms": "12 a add adopt advanc advic advis an and author automat avoid avoid-em-dash block both broken chang character cli concept confirm consol consult dash deeper deterministic did discard do draft em em-dash enforc engin english every eyebrow fix from gat going hard hyphen id in it keep know label list log matcher merg migrat new no no-em-dash no-eyebrow not of on one only option owner owner-author owner-only past pend persona policy policy_advis policy_block preferenc project prompt propos recent reject remov review rul run s safety sect security see sid simpl slip soft stay stop suggest supervisor surfac test the tier tip to use vib vibestrat vs what word would writ yml you",
      "body": "## In simple words\n\nA **policy** is a rule your project enforces on every run. Something like \"use a hyphen, not an em-dash\", or \"never add `console.log` to source files\".\n\nPolicies belong to the *project*, not to one supervisor. The supervisor is the enforcer that carries them into review; it does not own them, so a rule holds whichever supervisor is on duty.\n\nTwo columns, and only one of them is yours:\n\n!The Your policies column and the Deterministic engine card. Two rules are tagged advise: one forbidding console.log in source files, one requiring unknown keys to be rejected at the boundary. Below, a card reads no rules in .vibestrate/policies/*.yml.\n\nThat is the part you author, and a fresh project starts with it empty. Beside it sit four guards that ship on for everyone:\n\n### Advanced: CLI and automation\n\n```\nvibe policies add no-em-dash \\\n  \"do not use em-dash characters\" \\\n  --fix \"use a hyphen\"\n\nvibe policies add no-eyebrow \"no eyebrow labels\" \\\n  --block --matcher \"SectionEyebrow\"\n\n# what would it block?\nvibe policies test no-eyebrow --recent\n\nvibe policies list\nvibe policies confirm <id>  # adopt a proposal\nvibe policies reject <id>   # discard a proposal\nvibe policies remove <id>\n```\n\n```\n$ vibe consult \"em-dashes keep slipping past review\"\n\n$ vibe policies list\nProject policies (owner-authored):\navoid-em-dashes  advise  pending confirm\n  avoid em-dashes -> use a hyphen\n\n$ vibe policies confirm avoid-em-dashes\n```"
    },
    {
      "id": "docs/concepts/ponytail",
      "kind": "doc",
      "title": "Ponytail minimalism",
      "source": "Vibestrate docs: concepts/ponytail",
      "summary": "The posture that stops an agent over-building - smallest change that actually works.",
      "titleTerms": "minimalism ponytail",
      "terms": "abstract actually agent already an and away befor beyond build by chang concept config deeper default dependency did diff do doe execut exist fals featur fewer fifty going her in inst is it know library lin mak nativ need not off on one only over over-build ponytail postur provenanc quest run set simpl smaller smallest standard stop task that the thi tip to trad trust turn vib what why will word work writer you",
      "body": "## In simple words\n\nLeft alone, a coding agent over-builds: a helper class where a function would do, a dependency where the standard library was fine, fifty lines where one was enough.\n\n**Ponytail** is the posture that pushes back. It injects a \"lazy senior dev\" ruleset into the agents that write code, so their default is the smallest change that actually works.\n\n```\n# on by default; this turns it off\nvibe config set ponytail false\n```\n\n**Tip.** Only the seats that produce a diff see it - the implementer and the fixer. Planners, reviewers, the arbiter and the verifier run without it, so the check on a change stays independent of the posture that wrote it.\n\n## What it changes\n\n**Fewer dependencies** Standard library before a package, native platform feature before a library.\n\n**Fewer abstractions** No interface with one implementation, no config for a value that never varies.\n\n**Smaller diffs** A one-line bug does not earn a refactor.\n\n**Questions the task** Sometimes the smallest change that works is no change.\n\n**Did you know?** Minimal is not careless. The correctness rules survive the posture, and every diff still passes the post-turn gate and your review. Ponytail changes what an agent reaches for first, not what it is allowed to skip.\n\n### What it makes an agent do\n\nBefore writing code, a ponytail agent climbs a ladder and stops at the first rung that answers the problem:\n\n**Does this need to exist?** The cheapest code is the code you don't write. Question the task itself before building it.\n\n**Is it already here?** Reach for something in the codebase before adding anything new."
    },
    {
      "id": "docs/concepts/profile",
      "kind": "doc",
      "title": "Profile",
      "source": "Vibestrate docs: concepts/profile",
      "summary": "A saved preset that says how strong and expensive a role runs - a provider, its model, and the effort level.",
      "titleTerms": "profil",
      "terms": "1 4 5 6 a about actually add agent allow and another api balanc be budget built built-in by catalog chain cheap claud claude-balanc claude-cheap claude-max cli codex codex-fast concept config configur cor cross cross-vendor deeper delet detect dial did disallow duplicat effort expensiv fast fenc from get going gpt gpt-5 guard has high how id implement in is issu its itself knob know label legibility level list loc low mak max model ms nest no not off one opt opu orchestrat order overlay patch per per-profil planner post power preset profil project provider reach real refus remov review rol run s sav say set shell simpl sit slower sonnet sourc spend statu step step-profil strict strict-writer strong sub sub-agent task that the ther thi timeout tip to token tool used vendor vib vibestrat when wher word would writ writer yml you",
      "body": "## In simple words\n\nA **Profile** decides how strong and expensive a role runs. It is a saved preset bundling three things: where the work happens, which model, and how hard that model thinks.\n\nThink of the drive modes on a car. Eco and Sport do not change who is driving, they change how hard the engine works. A profile is that setting for an AI worker, saved under a name so you can reuse it.\n\nProfiles live on their own page in the sidebar:\n\n### Fencing off a role's tools\n\n```\nprofiles:\n  strict-writer:\n    provider: claude\n    model: opus\n    # no nested sub-agent orchestration\n    disallowedTools: [\"Task\"]\n```\n\n### From the CLI\n\n```\nprofiles:\n  codex-fast:\n    provider: codex\n    label: Codex fast\n    model: gpt-5.1\n    power: low\n  claude-max:\n    provider: claude\n    label: Claude Opus, max effort\n    model: opus\n    power: max\n```\n\n```\nvibe profile list\nvibe profile add claude-max --provider claude --model opus --power max\nvibe profile set claude-max --power high\nvibe profile duplicate claude-max claude-cheap\nvibe profile remove claude-cheap\n\nvibe run \"task\" --profile claude-max\nvibe run \"task\" \\\n  --step-profile implement=claude-max\n```\n\n```\nGET    /api/profiles\nPOST   /api/profiles\nPOST   /api/profiles/:id/duplicate\nPATCH  /api/profiles/:id\nDELETE /api/profiles/:id\nGET    /api/providers/catalog\n```"
    },
    {
      "id": "docs/concepts/project-params",
      "kind": "doc",
      "title": "Project parameters",
      "source": "Vibestrate docs: concepts/project-params",
      "summary": "Answers a flow needs, given once and reused, so you are not asked the same things every run.",
      "titleTerms": "parameter project",
      "terms": "a acm acme-api and answer anyth api are ask astro bdd beyond brand by check chosen cohesiv color concept deeper default deploy did edit env environment every explicit fail fast fastify fill flow for form framework generat gitignor given glob going hous how id in increment instruct is json just keep key know later list methodology my my-deploy nam need never nich not onc one openai openai_api_key option otherwis palett param parameter per per-flow planner profil project project-glob project-param recogniz remov requir retyp reus rol run sam scaffold scop secret set shar simpl so stor str styl supersed tdd the them then thing tip token tru typ type-check unknown unset use valu vib vibestrat vibestrate_param vibestrate_param_color_token when word would x yml you",
      "body": "## In simple words\n\nSome flows need a few answers before they can work: a project name, a brand colour, which framework you use. **Project parameters** let you give those answers once.\n\n```\n// .vibestrate/project-params.json\n{\n  \"projectName\": \"acme-api\",\n  \"framework\": \"fastify\"\n}\n```\n\nThe flow declares what it needs, you fill it in a single time, and every later run reuses the values.\n\n**Tip.** A `secret: true` parameter stores only the *name* of an environment variable, never the value. Nothing adds `project-params.json` to your `.gitignore` for you, so that distinction is what keeps a committed file safe to commit.\n\n## When a flow uses them\n\n**Scaffolding** A flow generating a starter project needs the name and the stack.\n\n**House style** A brand colour or a design token set that never changes between runs.\n\n**Environment names** Which staging branch, which deploy target.\n\n### Fill once, then run\n\n```\n# Fill once - the --flow form type-checks values\nvibe params set --flow scaffold \\\n  projectName=Acme framework=astro\n\n# Every later run just uses them\nvibe run --flow scaffold\n\nvibe params list\n```\n\n### Secrets\n\n```\nparams:\n  apiKey:\n    type: string\n    secret: true\n```\n\n```\n# The store keeps env:OPENAI_API_KEY, not the key\nvibe params set --flow my-deploy \\\n  apiKey=OPENAI_API_KEY\n```\n\n### Generate a default (optional)\n\n```\nparams:\n  palette:\n    type: string\n    generate:\n      instruction: >\n        Generate a cohesive color palette\n        for a {{params.niche}} brand\n```\n\n### Methodology (a recognized project-global param)\n\n```\n# Recognized values: tdd, bdd, incremental\nvibe params set methodology=tdd\n```"
    },
    {
      "id": "docs/concepts/provider",
      "kind": "doc",
      "title": "Provider",
      "source": "Vibestrate docs: concepts/provider",
      "summary": "What actually runs a model - a coding-agent CLI on your machine, or an HTTP endpoint.",
      "titleTerms": "provider",
      "terms": "0 1 11434 127 4 5 a accept actually add advanc agent ai ai-compatibl aider all also amp an anthropic anthropic-api anthropic_api_key any api apply arg assum auth auto auto-fil back bas built built-in c capability catalog claud claude-cod claude-haiku claude-high claude-pro claude-sonnet-4-5 clear cli cloud cod code_writ codex codex-low coding-agent com command commit common compatibl concept config configur cor crew crush cursor cursor-agent deeper default destinat did doctor dry dry-run eco edit effort egress endpoint entry env env-ref exec exist explicitly extern extra family fil fill finetun flag for forc format four from gap gap-fill gemini gemini_api_key going goos haiku help high http http-api human implement in input isn it its json just key kind knob know known known_provider level list liter loc localhost localhost-proxy login low machin machine-readabl matter md messag mistak mod model my my-finetun mycli nam need never no no-auto-commit non non-cli not noth null ollama ollama-loc on one only open openai openai_api_key opencod or order output output-format overlay own p permiss permission-mod power preset preset-ready pro prob profil project prompt provider providers-catalog proxy pull put qwen qwen3 r raw read read_only readabl ready real reason ref refresh replac reus review reviewer rol run run-wid saf safe-mod sam seat server sess set setup show simpl sonnet sourc sovereignty stdin step step-profil submit suggest t test the ther thi tip to token tru turbo twic typ up url usag use user valu vib vibestrat view vs what wher why wid with word would writ x yaml yes yml you your zero zero-egress",
      "body": "### Non-CLI providers (HTTP)\n\n```\nproviders:\n  # Cloud API - your own key, external destination.\n  anthropic-api:\n    type: http-api\n    api: anthropic       # or: openai\n    baseUrl: https://api.anthropic.com\n    model: claude-sonnet-4-5\n    # env-ref ONLY - never a literal key\n    apiKey: env:ANTHROPIC_API_KEY\n\n  # Local model server - no key, no egress.\n  ollama-local:\n    type: localhost-proxy\n    # or: openai, for OpenAI-compatible servers\n    api: ollama\n    baseUrl: http://localhost:11434\n    model: qwen3.5\n```\n\n### Providers back Profiles, Profiles back Roles\n\n```\nproviders:\n  claude:\n    type: claude-code\n    command: claude\n    args: [\"-p\"]\n    input: stdin\n  codex:\n    type: cli\n    command: codex\n    args: [\"exec\"]\n    input: stdin\n\nprofiles:\n  claude-high:\n    provider: claude\n    model: sonnet\n    power: high\n  codex-low:\n    provider: codex\n    power: low\n\ncrews:\n  default:\n    roles:\n      reviewer:\n        seats: [reviewer]\n        profile: codex-low\n        prompt: .vibestrate/roles/reviewer.json\n        permissions: read_only\n```\n\n```\n# run-wide\nvibe run \"...\" --profile claude-high\n\n# one step\nvibe run \"...\" --step-profile implement=claude-high\n```"
    },
    {
      "id": "docs/concepts/role",
      "kind": "doc",
      "title": "Role",
      "source": "Vibestrate docs: concepts/role",
      "summary": "One worker in your crew - what it does, what it may touch, and which model it runs on.",
      "titleTerms": "rol",
      "terms": "1 a accept and api approv arbiter architect are assembl assign balanc builder challenger claud claude-balanc claude-cod cli cod code_writ concept config context cor crew deeper default deliberately did diff doe each edit executor field fil fixer flow gat glob going how id implementer in init is it its json know label liv markdown may merg merge_ready mod model not of on one only order outsid patch path permiss permission-mod planner post profil project prompt provider put read read_only ready requir require_approv resolv review reviewer rol role-field role-prompt role-skill run schema seat simpl six skill subject than the thi tip touch verifier vers vib vibestrat what wher which wider word worker writ yml you your",
      "body": "## In simple words\n\nA **Role** is one worker on your crew. Think job description, not person: it says what this worker does, which kinds of step it may pick up, and how strong a model it runs on.\n\nHere is one, as the crew page shows it:\n\n!A role card for Planner. A Seats it takes row lists ten chips with planner highlighted. A Profile runtime row reads claude balanced, ok medium, with New profile and Read only controls. Below that, empty Skills and a collapsed Instructions section.\n\nFour things, and that is the whole of a role: the seats it will take, the profile it runs on, whether it may write, and its instructions.\n\n**Tip.** `Read only` in the corner is the setting that decides whether this worker can change your code. Planner, architect, reviewer and verifier ship read-only. Only the executor and fixer can write, and only inside the run's worktree.\n\n## What each of the six does\n\n`vibe init` writes six. Each fills the seat its id names, plus any others listed.\n\n**`planner`** Reads the task and produces a structured plan.\n\n**`architect`** Expands the plan with module boundaries and interfaces.\n\n**`executor`** Also fills `implementer` and `builder`. Edits files in the worktree.\n\n**`fixer`** Addresses review findings without rebuilding from scratch.\n\n### Where a role lives\n\n```\ncrews:\n  default:\n    roles:\n      reviewer:\n        label: Reviewer\n        seats: [reviewer, challenger]\n        profile: claude-balanced\n        prompt: .vibestrate/roles/reviewer.json\n        permissions: read_only\n        skills: []\n```\n\n```\n{\n  \"schemaVersion\": 1,\n  \"id\": \"reviewer\",\n  \"prompt\": \"You review diffs...\"\n}\n```"
    },
    {
      "id": "docs/concepts/run",
      "kind": "doc",
      "title": "Run",
      "source": "Vibestrate docs: concepts/run",
      "summary": "One attempt at a task, driven through a flow by a crew, in its own copy of your repo.",
      "titleTerms": "run",
      "terms": "a abort and approv at attempt block by can carry chang changes_request concept copy cor creat crew deeper did driven early end fail finish flow for going how human in is isolat it its know last look merg merge_ready need needs_human of one order own pass read ready record repo request run simpl step still stop task the thre through tip verdict wait waiting_for_approv want week went what when word would wrong you your",
      "body": "## In simple words\n\nYou have a task (what you want done), a flow (the recipe), and a crew (who does it). A **Run** is what happens when you put those three together and press go.\n\nOne run is one attempt. It gets its own copy of your repository to work in, walks the flow's steps in order, and stops at a verdict. Your actual branch is untouched the whole time.\n\nEverything a run is fits in its own header:\n\n!The header of a finished run. A green panel on the left reads Run, merge ready. Beside it the task, then Flow Default with its eight steps listed in order - Plan, Architecture, Implement, Validate, Review, Fix, Re-validate, Verify - and a row reading default provider, 5m 27s elapsed, and a diff of plus 24 minus 1 across 2 files.\n\nThe task at the top, the flow it is following, the steps it will walk, and what it has cost so far.\n\n**Tip.** A run is cheap to throw away. It never touched your branch, so abandoning one costs you the tokens it spent and nothing else. That is what makes it safe to just try something.\n\n## How a run ends\n\nA run always lands in one of four places, and only the first is mergeable.\n\n**merge_ready** Every step passed. The change is waiting for you to take it.\n\n**blocked** Something refused. A policy, a review, or a failed check.\n\n**failed** A step crashed. The failing step's own output says why.\n\n**aborted** You stopped it.\n\nBetween `created` and one of those four, a run moves through the states its flow needs: planning, architecting, executing, validating, reviewing, fixing, verifying, and pausing at `waiting_for_approval` whenever a gate asks for you."
    },
    {
      "id": "docs/concepts/safety",
      "kind": "doc",
      "title": "Safety - Action Broker & policies",
      "source": "Vibestrate docs: concepts/safety",
      "summary": "Every real effect a run has crosses one checkpoint, which decides it against your rules and writes down what it decided.",
      "titleTerms": "act broker policy safety",
      "terms": "120 40 a act activ actually advanc after again against allow allowlist already anchor and any api applicabl apply apply-only approv are artifact as ask assuranc at attend audit auto auto-retri automat autonomy back backend backoff banner be befor behavior best best-effort block blocker both bound boundary broker budget by can cap caus ceil chang check checkpoint claud clear cli clock codex command complet composer concept confidenc config configur confinement container continu control count coverag creat crew cross daily day decid dedicat deeper default default-allow defens deny depth descript detail deterministic did didn diff docker doctor doe dollar don dotenv down downgrad downgrade-model duplicat dur early edit effect effort egress engin env error every exec execut exhaust exit fail failur fallback fell fetch field fil fix flag flow for full fully gap gat get git glob going guard hard harden harden-read-only has hiccup hold hold-merge-for-review i id in information init inspect install instead is isolat it its json kind know lik limit list load loader los loudly match max max-time-day max-turns-run may mcp md merg merge_ready messag min miss mod model nam nativ ndjson need network never no no-network-install no-secret-writ non non-zero not not_applicabl noth nothing-to-verify npm of off on onc one only or os out own pars partially partially_verifi past patch path pattern paus per permiss permission-mod pip plan policy post post-turn postur preset profil project provider provider-nativ rat rate-limit re re-run read read-only ready real reduc reduce-effort refu refus regex reject render repair report request requir require_approv resilienc retri retries_exhaust retry retry-after review review_miss rid root rul run s safety sam sandbox scor seat secret set shap show sign simpl skill so soft someth spawn spend start statu step step-by-step steps_failed_tolerat stop story stream stream-json strict strict-apply-only subscript supervisor t tab termin that the them then thi think tim tip to today toggl tolerat tool tool_us transient tre tru try turn two unattend unbound unbounded_unattended_run unsaf unsandbox usag usage_limit usd use validat validation_miss verdict verifi verificat verification_not_run verify veto vib vibestrat wait waiting_for_approv wall warn what wher which with without word worktre writ yaml yml you your zero",
      "body": "### Two kinds of policy\n\n```\n# .vibestrate/policies/safety.yml\nactions:\n  - id: no-network-installs\n    description: Block installs during validation.\n    on: [command.run]\n    match:\n      commandRegex: \"npm (i|install)|pip install\"\n      commandFlags: \"i\"\n    effect: deny\n    message: Network installs are not allowed.\n\n  - id: hold-merge-for-review\n    description: Sign off before merge_ready.\n    on: [run.complete]\n    match: { status: merge_ready }\n    effect: require_approval\n    message: Runs need approval before completing.\n\n  - id: no-secret-writes\n    description: Refuse writes to dotenv files.\n    on: [file.write, file.patch]\n    match: { pathGlob: \"**/*.env\" }\n    effect: deny\n    message: Writing secret files is blocked.\n```\n\n### A policy set that didn't fully load stops the run\n\n```\nRefusing to start. The policy set in\n.vibestrate/policies/ did not fully load, so rules\nyou think are active may not be.\n  safety.yml: YAML parse error: ...\nFix them (details: `vibe policies doctor`), then\ntry again.\n```\n\n### Advanced: CLI and automation\n\n```\nvibe assurance <runId>           # the Run assurance verdict, --json for the artifact\nvibe audit <runId> --json        # the same tree the Inspect > Tree tab renders\n```"
    },
    {
      "id": "docs/concepts/sandbox",
      "kind": "doc",
      "title": "Container isolation",
      "source": "Vibestrate docs: concepts/sandbox",
      "summary": "Move a run off your machine entirely, so the blast radius is a disposable container.",
      "titleTerms": "container isolat",
      "terms": "0 169 254 443 512 a admin agent all allow allowlist an and anthropic anthropic_api_key anthropic_base_url api aqf are auth aws back backend bas becom befor blast bomb by cap cap-drop cap_net_admin carry claud cli clos cod codex com concept config confin connect container credenti cross deeper default degrad deny did disposabl do docker doe doesn drop egress enetunreach enforcement entirely environment every exampl exec execut f fail fail-clos fall filesystem filter fit for fork fork-bomb fresh gateway github github_token going guard hard harden hom host how http http_proxy https_proxy imag in insid intern is isolat it json key know label latest leak limit loc local-worktre localhost machin manag max mod model mov must my my-org nam narrow net network never new no no-new-privileg not npmj of off on onc one only open openai openai_api_key operat opt opt-in org out outsid own per permit pid pids-limit pretend privileg process project provider provider-auth proxy prun ps radiu rather reach read read-only read-writ readonly refu registry rest rm root rul run s safety sandbox secret security security-opt servic set short simpl so ssh start stop t than the thi tip tmp to token too tru trust turn unattend unavailabl url variabl vib vibestrat vibestrate-agent vm wall want what when wher word worktre worth writ writabl yml you your",
      "body": "## In simple words\n\nBy default a run works on your machine, bounded by its own git worktree and the post-turn diff gate. For an unattended run, or a task you do not fully trust, you can move the agent **off your host entirely**:\n\n```\nvibe config set execution.backend docker\n```\n\nEach provider turn then runs inside a disposable Docker container. The blast radius becomes the container.\n\n**It is off by default**, and the run records the confinement that was actually enforced, never what was merely configured. A run that could not start the container tells you so rather than quietly falling back to your host.\n\n### Fail-closed: it refuses rather than pretend\n\n```\n# .vibestrate/project.yml\nexecution:\n  backend: docker   # default: local-worktree\n  container:\n    # the image MUST carry the provider CLI\n    image: my-org/vibestrate-agent:latest\n    # default. \"degrade\" falls back to the host\n    onUnavailable: fail\n    # default. writable: worktree, /tmp, HOME\n    readonlyRoot: true\n    # default. max processes (fork-bomb guard)\n    pidsLimit: 512\n```\n\n### Confining the network (egress allowlist)\n\n```\nvibe config set \\\n  execution.container.egress.mode allowlist\n```\n\n```\nvibe config set execution.container.egress.allow \\\n  '[\"registry.npmjs.org\", \".github.com\"]'\n```\n\n```\ndocker network prune -f \\\n  --filter label=vibestrate.managed=true\n```\n\n### Where it stops short (read this before trusting it)\n\n```\ndocker rm -f \\\n  $(docker ps -aqf label=vibestrate.managed=true)\n```"
    },
    {
      "id": "docs/concepts/seat",
      "kind": "doc",
      "title": "Seat",
      "source": "Vibestrate docs: concepts/seat",
      "summary": "The empty chair a flow step needs filled - a label, not a name, which is what keeps flows shareable.",
      "titleTerms": "seat",
      "terms": "a agent agent-turn and approv approval-gat architectur befor brief carry chain chair cli concept cor cover crew deeper default descript did diff empty execut fil fill flow flow-schema follow from gap gat going id implement implementer in input is it its keep kind know label len model nam need not one order output plan portabl process profil respons response-turn review review-turn reviewer rol run s schema seat shareabl show simpl src stay step summary summary-turn surfac swap task task-brief the their them they thi tip touch ts turn two validat vib way what whether which why without word work you your",
      "body": "## In simple words\n\nA flow step does not say \"use Claude\". It says \"this step needs a reviewer\". That labelled, empty chair is a **Seat**.\n\nA seat is a contract, not a person. It names the *kind* of worker a step needs and nothing about who fills it. Your crew does the filling, at the moment a task runs.\n\nOpen a crew and each worker lists the seats it will take:\n\n!The Seats it takes row on a role card. Ten chips read arbiter, architect, builder, challenger, executor, fixer, implementer, planner, reviewer and verifier. The planner chip is highlighted, marking the seat this role takes.\n\nEvery chip is a chair this role *could* take. The highlighted one is the chair it does take.\n\n**Tip.** One worker can take several seats. That is why six workers can staff a flow with eight steps, and why you rarely need to add a role just because a flow got longer.\n\n## Why it works this way\n\n**Flows stay portable** A flow names chairs, never models. Download someone's flow and it runs on your models, at your budget, unedited.\n\n**You swap models without touching process** Point the role that takes `reviewer` at a different provider. Every flow you run gets that reviewer.\n\n### What a seat carries\n\n```\nseats:\n  implementer:\n    label: Implementer\n    description: Implements the plan and architecture.\n\nsteps:\n  - id: implement\n    label: Implement\n    kind: agent-turn\n    seat: implementer\n    inputs: [task-brief, plan, architecture]\n    outputs: [execution, diff]\n```\n\n### From the CLI\n\n```\n# a flow's seats, its ordered steps, and whether your crew covers them\nvibe flows show default\n\n# your crew's roles, their profiles, and the seats they fill\nvibe crew show\n```"
    },
    {
      "id": "docs/concepts/skill",
      "kind": "doc",
      "title": "Skill",
      "source": "Vibestrate docs: concepts/skill",
      "summary": "A markdown file of house rules that every agent reads, so you write your conventions once.",
      "titleTerms": "skill",
      "terms": "a act agent alway an api as assign at attach befor belong bit boundary branch caller cent cod codebas coerc common concept consol convent crew currency deeper default did domain endpoint ephemer error error-handl every everyth executor extern fetch fil float for go going handl help hous id idempotency idempotent in includ info inlin input inst integer is it its js json key know knowledg lik log logger look markdown mcp md messag mistak money must ndjson never no of on onc oncall oncall-runbook one payment planner post process project prompt put read real refund reject return rol rul run runbook servic simpl skill so sourc src stor stuck teach that the them thi thing through tip to touch transact typ unknown use using validat vib vibestrat vs what when why word writ yml you your",
      "body": "## In simple words\n\nA **skill** is a markdown file you write once, and any agent can read it. Use it for the things that should always be true about your codebase: your conventions, your security rules, the \"we do not do X here\".\n\nThink of the note you would hand a careful new colleague on their first day. You do not repeat the house rules every time you give them a task. You write them down once, point at them, and trust they are remembered.\n\n```\n# API conventions\n\n- Every endpoint validates its input at the boundary. Reject unknown keys;\n  never coerce them.\n- Errors return a typed code. Callers branch on the code, never on the message.\n- No `console.log` in source. Use the logger in `src/logger.js`.\n```\n\nThat is a whole skill. It lives under `.vibestrate/skills/`, and any role you attach it to reads it on every turn.\n\n### What a skill looks like\n\n```\n# .vibestrate/skills/payments/SKILL.md\n\nThis codebase handles real money.\nWhen touching `src/payments/`:\n\n- Always idempotent. Every external POST\n  must include an idempotency key.\n- Currency is stored as integer cents.\n  Never floats.\n- Refunds must go through\n  `RefundService.process()` - never inline.\n```\n\n### Attaching a skill to an agent\n\n```\ncrews:\n  default:\n    roles:\n      planner:\n        skills: [payments, error-handling]\n      executor:\n        skills: [payments]\n```\n\n```\nvibe run \"Refund a stuck transaction\" \\\n  --skills payments,oncall-runbook\n```"
    },
    {
      "id": "docs/concepts/spec-up",
      "kind": "doc",
      "title": "Spec-up (plan before you build)",
      "source": "Vibestrate docs: concepts/spec-up",
      "summary": "Turns a vague brief into a written spec by asking you the questions it cannot answer itself.",
      "titleTerms": "befor build plan spec spec-up up you",
      "terms": "a acceptanc adaptiv all an answer anyth approv architectur ask beyond brief build by cannot command concept consult deeper did earn ecommerc edit editor els fil find flow foo gap get going hand hol honest how id ids in intak into it its itself keep know limit mini next no no-select not off one orb otherwis proc project propos prototyp quest register remember risk roadmap round run s scop select simpl simplify someon spec spec-up spec-up-intak start stor suggest the tip to ts turn twic up vagu valu vib week what when wher will with word work would written yml you",
      "body": "## In simple words\n\nMost planning tools answer \"how do I write this change?\" **Spec-up** answers the question before it: *what are we actually building, and what have you not told me yet?*\n\nGive it a brief, even a vague one like \"a mini ecommerce store\", and it comes back with questions rather than code. You answer the ones you can. It writes a spec from your answers, and only then does a flow run against that spec.\n\n**Tip.** You do not have to invoke this. A brief that reads like a whole system triggers it automatically, and every run tells you afterwards that it happened. `--no-select` skips it for one run; `adaptiveSpecUp: off` stops it entirely.\n\n## When it earns its keep\n\n**A brief with holes in it** \"Add billing\" hides a dozen decisions. Better to surface them before code exists than during review.\n\n**Work you will not remember next week** The spec is a written artifact. It outlives the run.\n\n**Handing work to someone else** A spec someone reviewed beats a task description someone interpreted.\n\n**Anything you would otherwise prototype twice** Cheaper to answer questions than to rebuild.\n\n### Where to find it\n\n```\nvibe spec-up start \"a mini ecommerce store\"\nvibe spec-up questions <runId>   # the round's ids\nvibe spec-up simplify <runId> <questionId>\nvibe spec-up suggest <runId> --all\nvibe spec-up answer <runId> --answer <id>=<value>\nvibe spec-up answer <runId> --proceed\n```\n\n```\nvibe spec-up edit <runId> scope\nvibe spec-up edit <runId> spec\nvibe spec-up edit <runId> architecture\nvibe spec-up edit <runId> risks\nvibe spec-up approve <runId>\nvibe spec-up build <runId>\nvibe spec-up roadmap <runId>     # -> a proposal\n```"
    },
    {
      "id": "docs/concepts/state",
      "kind": "doc",
      "title": "Run state",
      "source": "Vibestrate docs: concepts/state",
      "summary": "The status a run is in, what each one means, and the rules that keep moves between them honest.",
      "titleTerms": "run stat",
      "terms": "a abort advanc agent agent-rais all allow allowed_transit and approv architect are ask at automat between block chang cli concept cor creat deeper did each enforc error execut fail filter fix for gat going guidanc honest id in is it json keep kind know list look mark matter mean merg merge-ready merge_ready mov of one only open order paus plan rais ready record recoverabl reject replay request request-chang requir resum review rul run simpl stag stat statu sticky termin that the them tip to transit trust two validat verify vib wait waiting_for_approv what wher why word worth you",
      "body": "## In simple words\n\nA run is always in exactly one **state**. Think of a package you have shipped: it is in one definite place, \"out for delivery\" or \"delivered\", never two at once and never somewhere the tracking invented.\n\nThe Status column on **All runs** is that value:\n\n!The All runs table. Rows carry Task, Status, Review, Verify and Duration columns, with one row reading merge-ready. A filter box sits above, beside Replay and Prune snapshots controls.\n\nA run starts at `created` and ends in one of four terminal states:\n\ncreated planning, architecting, executing validating, reviewing, fixing, verifying merge_ready blocked failed aborted no way back out\n\n**Tip.** The four terminal states mean different things and it is worth not blurring them. `blocked` is a *decision* - something refused. `failed` is a *crash* - a step broke. `aborted` is *you*. Only `merge_ready` is a change you can take.\n\n## Why the states are worth knowing\n\n**Knowing where to look** `failed` means read the failing step's own output. `blocked` means read the review or the policy that refused.\n\n**Knowing what is recoverable** A blocked run is usually one fix away. A failed one may be an environment problem rather than a code one.\n\n### Advanced: CLI and automation\n\n```\nvibe status\nvibe status --json\nvibe replay <runId>\nvibe pause <runId>\nvibe resume <runId>\n```\n\n```\nvibe approvals list <runId>\nvibe approvals approve <runId> <approvalId>\n# reject marks the run blocked\nvibe approvals reject <runId> <approvalId>\n# agent-raised gates only\nvibe approvals request-changes \\\n  <runId> <approvalId> --guidance \"...\"\n```"
    },
    {
      "id": "docs/concepts/supervised-tasks",
      "kind": "doc",
      "title": "Supervised tasks",
      "source": "Vibestrate docs: concepts/supervised-tasks",
      "summary": "A task with ordered steps, sequenced one at a time by the Conductor instead of run in one pass.",
      "titleTerms": "supervis task",
      "terms": "20 a acceptanc add and at audit author between beyond by checklist clear concept conductor context curat dashboard deeper did do doe driv enabl enhanc escalat fals fil fresh from goe going ground halt how id in instead invariant it know ledger log max mod model new not objectiv of one only order packet pass paus plain plan plan-only profil project re re-ground re-sequenc refin relat remov reorder resum run sequenc simpl spend src statu step supervis supervised-task supervisor task the tim tip ts usd vib vs what with word writ writer yet yml you",
      "body": "## In simple words\n\nThere is no separate \"saga\" kind of task. A task has an ordered set of **steps** and a **run mode** deciding how they run:\n\n**plain** The default. The flow runs the whole task in one holistic pass.\n\n**supervised** The **Conductor** sequences the steps one at a time, each with its own review.\n\nSupervised is for work that is genuinely several changes wearing one title: a migration with four stages, a feature with a backend half and a frontend half.\n\n**Tip.** Reach for supervised when a single diff would be too big to review honestly. The point is not more automation, it is smaller units of work that a human can actually check one at a time.\n\n**Did you know?** Between steps the supervisor returns one of three verdicts: proceed, and the next step starts; re-plan, and the remaining steps are rewritten against what the last one actually did; or stop. That middle one is why a supervised task can survive a step turning out differently than planned, instead of marching the rest of the sequence into a stale assumption.\n\n### Plain vs supervised\n\nA plain task with a checklist is a lightweight to-do list, run in one pass.\n\n### Authoring a supervised task\n\n```\nvibe tasks add \"Add audit logging\" --supervised\nvibe tasks checklist add <id> \"Write the writer\" \\\n  --objective \"...\" --acceptance \"...\" \\\n  --files \"src/audit/*.ts\"\n\nvibe tasks sequence <id>   # run the steps in order\nvibe tasks status <id>     # steps, invariants, halt\nvibe tasks pause <id>      # between steps\nvibe tasks resume <id>     # clear the pause\n```"
    },
    {
      "id": "docs/concepts/supervisor",
      "kind": "doc",
      "title": "Supervisor",
      "source": "Vibestrate docs: concepts/supervisor",
      "summary": "The judgment Vibestrate brings to a run - how hard it looks, and a labelled record of every call.",
      "titleTerms": "supervisor",
      "terms": "a adopt advanc advis aim an and apply approv archetyp are auth auto automat block bring by call can car chang cheap cheap-reviewer claud cli concept copy cross cross-model deeper default did enforc engineer every flow for gat going haiku hard harden has hawk heavier honest how in into it its judgment just know label len list login look mak migrat mod model mor not of off on one opin or own payment permiss permission-mod persona pick plan policy postur prefer preferenc preset profil project provider reason record remov replac resum review reviewer risk risky rul run s safety sandbox sandbox-suggest seat second security security-hawk sign sign-off simpl singl single-profil six staff staff-engineer statu stop structur suggest supervisor the then thing thrifty tip to touch turn two use verdict vib vibestrat want what when who why word work would yml you",
      "body": "## In simple words\n\nA **supervisor** decides how hard to look at the work before calling it done. It does none of the work itself. It sets the level of scrutiny, then writes down every call it makes.\n\nThink of a building inspector. They do not pour the concrete or hang the drywall. They decide how closely to look, send the risky parts back for a second opinion, and record every call so the sign-off means something.\n\nYou meet it at the top of a run:\n\n!The Supervisor panel of a run. It names staff-engineer, tags the review single-profile, and shows 3 decisions. Three judgment rows read verify PASSED, review APPROVED, and review aimed through 3 lenses - correctness, tests and security-risk.\n\nNamed, tagged, counted, and every judgment written down with a timestamp.\n\n**Tip.** `single-profile` on that panel is the supervisor telling on itself. It means one model both wrote and judged, which is a self-check. Point the reviewer role at a second provider and the tag becomes `cross-model`. The label can lower your confidence in a result; it never inflates it.\n\n### Picking who reviews\n\n```\npersonas:\n  thrifty:\n    label: Thrifty staff engineer\n    reviewerProfile: cheap-reviewer  # review seats\nprofiles:\n  cheap-reviewer:\n    provider: claude\n    model: haiku\n```\n\n### Advanced: CLI and automation\n\n```\nvibe supervisor list          # what you can pick\nvibe supervisor archetypes    # the six presets\nvibe supervisor adopt security-hawk    # copy it in\nvibe supervisor default security-hawk  # then use it\nvibe run \"harden the login\" --supervisor security\n```"
    },
    {
      "id": "docs/concepts/supervisor-control",
      "kind": "doc",
      "title": "Supervisor Control",
      "source": "Vibestrate docs: concepts/supervisor-control",
      "summary": "The Supervisor chat on Mission Control. It answers from your real project, remembers the thread, and can act once you let it.",
      "titleTerms": "control supervisor",
      "terms": "40 6 a about act add advanc advis already an and answer api approv are as ask assum attach attachment automat autonomy back be becom block budget build but button can cannot ceil chat checklist cli clos cod com concept config control conversat creat crew deeper deni destinat did diff differ discuss do doe don edit effort error exist fail fil fin flag from gat get going hard header held how i in instruct is it item its itself know last leav let limit liv mad mak materi matter max max-turns-run md me messag miss nam never new no not noth now on onc one only or panel permiss phas preview profil project propos prov public quest quot rat rate-limit rather real reason remember reply request requir require_approv resum retry reversibl review rout rul run s safety sam second set should show simpl start statu stop stream supervisor supervisor-control switch task than that the thi think thre thread tip to todo tool turn undo uneven upload uploader verbatim vib vibestrat what who why will without word work would writ you your",
      "body": "## In simple words\n\n**Supervisor Control** is the chat panel titled **Supervisor**. Type what you want. It answers from your real project - your files, your config, your recent runs - and it remembers what was said earlier in the thread.\n\nOne control matters more than the rest, and it is the first thing to find:\n\n!A two-position switch reading Answers only and Answers and acts, with Answers and acts selected.\n\nThat switch is a **permission**, not a stop. It decides whether the supervisor may make a task, add TODOs, or start a run. Stop is a different control: the red square that replaces Send while a turn is running.\n\n**Tip.** Leave it on **Answers only** while you are learning what it does. On that setting it can read anything and change nothing, so a misunderstood question costs you a paragraph rather than a run.\n\n## What you would ask it\n\n**\"What does this project do?\"** It reads your real files rather than guessing from the name.\n\n### One turn\n\n```\nanswer         a question, or discussion.\ntask.create    new work, not on an existing task.\nchecklist.add  TODO items on an existing task.\nrun.start      build it now, on an existing task.\n```\n\n### Advanced: CLI and automation\n\n```\nvibe supervisor status                              # running, or stopped and why\nvibe supervisor stop --reason \"reviewing the diff\"  # same flag as the header switch\nvibe supervisor resume\nvibe budget set --max-turns-run 40                  # the ceiling act requires\nvibe config set supervisorControl.autonomy act\n```"
    },
    {
      "id": "docs/concepts/task",
      "kind": "doc",
      "title": "Task",
      "source": "Vibestrate docs: concepts/task",
      "summary": "The plain-language brief you hand Vibestrate. A sentence is enough to start.",
      "titleTerms": "task",
      "terms": "1 1-bas a add adjectiv adjective-noun advanc and another append apply arbiter assuranc audit automat back back-to-back bas between block bold bold-lovelac break brief but cap cap-and-continu chang check checklist cli concept configurabl constraint context continu continuou cor correctness cost crew deeper deriv detach did don enhanc enough exist flow for four from giv going good hand handler happen health how human id improv in in_progress includ inherit into is it item json key know languag len lib list log logger look lovelac mark matter merg merge_ready mov nam need never next not noun one only open or order out outcom panel parent path paus pend per per-item pick pickup pickup-review plain plain-languag plausibl plausible-but-wrong practic print progress propos put read read-only ready relat reorder return review risk rout run sav say security security-risk sentenc server set should simpl skill src stabl start stat statu step structur summary surfac tak task test that the tip titl to ts up use user valu vib vibestrat vs weak what when whol will word work writ wrong yardstick you",
      "body": "## In simple words\n\nA **Task** is what you want done, written the way you would brief a capable colleague. You say what you want. Vibestrate works out the steps.\n\nYou do not list files. You do not set an order. A sentence is enough to launch.\n\n### A good Task vs a weak one\n\n```\nAdd structured logging to the settings save handler in\nsrc/server/routes/settings.ts. Use the existing logger from\nsrc/lib/logger.ts. Include the user id and the changed keys,\nbut never the values.\n```\n\n```\nImprove logging\n```\n\n### Advanced: CLI and automation\n\n```\nvibe run \"Add structured logging to the \\\nsettings save handler\"\n```\n\n```\nvibe tasks checklist add <taskId> \\\n  \"/health returns json\"\nvibe tasks checklist list <taskId>\n\n# mark one done\nvibe tasks checklist check <taskId> <itemId>\n\n# or give it another status\nvibe tasks checklist status <taskId> <itemId> \\\n  in_progress\n\n# reorder, 1-based\nvibe tasks checklist move <taskId> <itemId> 1\n```\n\n```\n# read-only: prints a proposed checklist\nvibe tasks enhance <taskId>\n\n# append the proposed items\nvibe tasks enhance <taskId> --apply\n```\n\n```\n# continuous: items back-to-back\nvibe tasks pickup <taskId>\n\n# pause between items for review\nvibe tasks pickup <taskId> --step\n\n# per-item review panel + arbiter\nvibe tasks pickup <taskId> --flow pickup-review\n```\n\n```\nvibe run \"<task title>\" \\\n  --task <taskId> \\\n  --flow pickup-review \\\n  --checklist continuous\n```"
    },
    {
      "id": "docs/concepts/vibestrate-md",
      "kind": "doc",
      "title": "VIBESTRATE.md",
      "source": "Vibestrate docs: concepts/vibestrate-md",
      "summary": "A committed manual at your project root, so you never re-explain your project.",
      "titleTerms": "md vibestrat",
      "terms": "a advisory against and apply approv arbitrat architectur ask at author be bil boundary build careful codebas codebase-map command commit concept constraint consult convent credenti crew critic deeper development did do domain e els execut explain express extra flow for g gat get goe going good guid guidanc head heavier how id implementer in init install is isolat it its json know known lean learn ledger lesson lint locally machin machine-own manu map md mod model money never not noth onc one only or orchestrat order other own path planner pnpm policy prefer preferenc print project propos provider quality quality-arbitrat quest rank re re-explain read regenerat review risk rol root rul run sandbox secret servic show simpl so src stay surfac task teach test the themselv thi through tip to today touch typecheck use validat vib vibestrat vibestrate-md what when who word writ you your",
      "body": "## In simple words\n\n`VIBESTRATE.md` is a committed file at your project root saying what this project is and how you like it run: its domains, its commands, the conventions you keep having to repeat.\n\n```\n# VIBESTRATE.md\n\n## Project Model\nA billing service. Money flows through `src/ledger/` and nothing else writes to it.\n\n## Development Commands\npnpm install · pnpm typecheck · pnpm test · pnpm build\n\n## Risk Rules\nPropose sandbox mode when a task touches provider execution or credential paths.\n```\n\nIt is durable, project-aware guidance, and it is **advisory**: it shapes how work is planned, and it can never override a code-enforced policy.\n\n### What goes in it\n\n```\n# VIBESTRATE.md\n\n### Project Model\nWhat this project is, its domains, architecture\nboundaries, critical flows.\n\n### Development Commands\nInstall, test, typecheck, lint, build, run\nlocally - in order.\n\n### Orchestration Preferences\nPreferred flows and crews; when to use heavier\nreview; when to stay lean.\n\n### Risk Rules\nWhen to propose sandbox mode, approval gates,\nisolated execution, extra validation. (e.g.\n\"propose sandbox mode when a task touches\nprovider execution or secret/credential paths.\")\n\n### Codebase Conventions\n### Known Constraints\n### Lessons Learned\n```\n\n### The codebase map: machine-owned, not authored\n\n```\nvibe learn        # regenerate the map\nvibe learn show   # print CODEBASE.md\n```\n\n### Who gets the map\n\n```\ncodebaseMapRoles: [planner, implementer]\n```"
    },
    {
      "id": "docs/concepts/walkthroughs",
      "kind": "doc",
      "title": "Walkthroughs",
      "source": "Vibestrate docs: concepts/walkthroughs",
      "summary": "A walkthrough turns an answer into a guided tour - it moves you to the right screen and rings the control.",
      "titleTerms": "walkthrough",
      "terms": "a an and answer anywher at author beyond built button can check concept consult control crew dashboard deep deeper did do doe down drop exampl exist first flow for generat going guid has how i in into is it know link mak me mov navigat not noth on one only or pag panel point policy press quest right ring run screen set show simpl someth step supervisor tak that the ther through tim tip to tour turn under vibestrat walk walkthrough when wher word work written wrong you your",
      "body": "## In simple words\n\nAn answer tells you what to do. A **walkthrough** stands you in front of it.\n\nAsk \"how do I make a crew?\" and the answer arrives with a **Show me how** button:\n\n!A supervisor answer explaining that a crew is the set of roles a run can hand work to, with a Show me how button underneath it.\n\nPress it and the dashboard moves to the Crew screen, draws a ring around the control the step is about, says what it is for, and waits for you to press Next.\n\n**A walkthrough can only navigate.** It opens a screen and points at something on it. It never clicks a button, types in a field, saves, edits your config, or starts a run. That is the same ceiling every button under an answer has, and there is deliberately no third kind of action, because a third kind is how a chat button turns into an unreviewed effect. The pressing stays yours.\n\n**Tip.** If you are not sure where a setting lives, ask rather than hunt. \"Where do I set the default crew?\" gets you a walkthrough that puts your cursor on the control instead of a paragraph describing where it is.\n\n**Did you know?** Two kinds of walkthrough exist and both open the same overlay with the same privilege. Neither can do more than the other, so there is no \"trusted\" variant that quietly gets to act on your behalf.\n\n### Written down, or built for your question\n\n**Authored** - five walkthroughs for the five things most people do first. Every screen and every control they name is a literal the compiler checks and a test greps for, so they cannot drift into pointing at something the app no longer has.\n\n### A worked example\n\n```\nHow do I make a crew?\n```"
    },
    {
      "id": "docs/concepts/workflow",
      "kind": "doc",
      "title": "Steps - the workflow of a run",
      "source": "Vibestrate docs: concepts/workflow",
      "summary": "The eight steps of the default flow, in order, and what each one is for.",
      "titleTerms": "a of run step the workflow",
      "terms": "0 a accept add and approv arbitrat architect architectur architecture-handoff array befor block bold bold-lovelac breaker brief by chang changes_request claud command common concept context continu contract cor crew decis decision-summary deeper default did doc doe each edit eight error every execut execution-handoff express fail fast find finding-resolut finding-respon fix flow for fresh from going handoff high how human human_approv implement in init is know long loop lovelac many max md merg merge_ready mistak n need needs_human of on one only opt opt-in order output pag panel panel-review pass pick plan plan-handoff pnpm quality quality-arbitrat rather re re-validat ready recip request requir resolut respon restart resum resume-from resume-stag retry reus review run run-brief runner sam seat sess set simpl skip split stag stay step summary than the thi tie tie-breaker tip token too track turn typecheck typo validat verify vib vibestrat wait waiting_for_approv way what when why word workflow you",
      "body": "## In simple words\n\nA **workflow** is the ordered set of steps one run works through, from submitted to a verdict. Every run executes a flow, so a run's workflow is the steps of whichever flow it is running.\n\nThis page is the canonical description of the built-in `default` flow:\n\n```\nplan -> architecture -> implement -> validate -> review -> verify\n                                        ^          |\n                                        +-- fix <--+   (only on CHANGES_REQUESTED)\n```\n\nEight steps. Six always run; **fix** and **re-validate** are loop-only - they run when review returns `CHANGES_REQUESTED`, and not otherwise.\n\n**Tip.** The loop is the part worth understanding. A review that asks for changes does not end the run and does not start it over: it sends the work to fix with the finding attached, then re-validates, then reviews again. That is why a run can pass on its second attempt without you doing anything.\n\n### One runner, many recipes\n\n```\nvibe run \"...\"                  # Vibestrate picks\nvibe run \"...\" --flow default   # the eight steps\nvibe run \"...\" --flow quality-arbitration\n```\n\n### Fast tracks\n\n```\nvibe run \"fix the typo in the seat concept page\" \\\n  --flow express\n```\n\n```\n# accepted stages: planning architecting\n#   executing reviewing fixing verifying\n# default: executing\nvibe run \"...\" --resume-from bold-lovelace \\\n  --resume-stage reviewing\n```"
    },
    {
      "id": "docs/concepts/worktree",
      "kind": "doc",
      "title": "Worktree",
      "source": "Vibestrate docs: concepts/worktree",
      "summary": "Every run works in a separate copy of your project, so your real files are never touched.",
      "titleTerms": "worktre",
      "terms": "a abort absolut advanc after along and are auto automat block bold bold-lovelac branch bring buy can cd checkout cli concept copy cor d deeper default did diff dir env environment every evidenc except fail failur fenc fil git going honest id in keep know link liv lovelac main merg merge_ready modul never nod node_modul noth of off one only order parallel path pem prefix project quiet quiet-tur ready real remov run separat simpl so the their thi tip to tool touch tur undo venv vib vibestrat vibestrate-worktre view what wher word work worktre writ yml you your your-project",
      "body": "## In simple words\n\nEvery run does its work in a **separate copy** of your project, on its own branch. Your real files, the ones you have open in your editor, are never touched.\n\nOpen a finished run and the Workspace panel names that copy:\n\n!The Workspace panel of a run. It names the branch, shows the run's isolated git worktree path, and offers a Copy cd button. A line below reads: the run's isolated git worktree, run vibe path for the same from the CLI.\n\n**Copy cd** puts a `cd` command for it on your clipboard, so you can go and look at the work yourself.\n\nThat copy is a git **worktree**. Git can keep a second working folder of the same project, on its own branch, right next to your main one. Picture a contractor building your new kitchen in a workshop down the street: same blueprints, and the mess stays out of your house until you choose to bring the finished work home.\n\n**Tip.** Because the run works in its own folder on its own branch, you can keep coding in your real project while it runs. The two never collide, and git does not even notice the overlap.\n\n## What this buys you\n\n**Nothing to undo** A run you dislike is a folder you ignore. It never entered your branch, so there is nothing to revert.\n\n### Where the copies live\n\n```\ngit:\n  worktreeDir: ../.vibestrate-worktrees   # default\n  branchPrefix: vibestrate/               # default\n  linkEnvironment: auto                   # default\n```\n\n### Advanced: CLI and automation\n\n```\nvibe path <runId>          # worktree path + branch\nvibe path <runId> --cd     # only the absolute path\ncd \"$(vibe path <runId> --cd)\"\n```\n\n```\ncd your-project\ngit worktree remove ../.vibestrate-worktrees/<runId>\ngit branch -D vibestrate/<runId>\n```"
    },
    {
      "id": "docs/extending/add-flow",
      "kind": "doc",
      "title": "Add a Flow",
      "source": "Vibestrate docs: extending/add-flow",
      "summary": "Write your own run recipe with seats, steps, and an optional pause for your approval.",
      "titleTerms": "a add flow",
      "terms": "a add add-flow agent agent-turn an and api approv approval-gat befor both builder but can challenger chang clean clean-room clearer com command commit common customiz decid deeper did diff draft exampl export extend fil first flow flow-skip for from gat going http id import in input kind know label list mistak model narrativ not one option or out over over-stuf overwrit own paus plan post producer profil project prototyp prototyper quick quick-review reason recip respons response-turn review review-turn reviewer rol room run s seat seat-rol shar simpl skill skip spec spik spike-and-decid step step-profil stuf summary summary-turn task the then tip to tru try turn url v1 validat vib vibestrat with word writ yml you your",
      "body": "## In simple words\n\n```\nid: quick-review\nlabel: Quick review\nseats:\n  reviewer:\n    label: Reviewer\nsteps:\n  - id: review\n    label: Review\n    kind: review-turn\n    seat: reviewer\n```\n\n### Steps\n\n```\n   id: spike-and-decide\n   version: 1\n   label: Spike and decide\n   description: Prototype, then stop and decide.\n\n   seats:\n     planner:\n       label: Planner\n       description: Plans the spike.\n     prototyper:\n       label: Prototyper\n       description: Builds the spike.\n\n   steps:\n     - id: plan\n       label: Plan the spike\n       kind: agent-turn\n       seat: planner\n       inputs: [task-brief]\n       outputs: [plan]\n\n     - id: prototype\n       label: Build the prototype\n       kind: agent-turn\n       seat: prototyper\n       inputs: [plan]\n       outputs: [diff]\n\n     - id: validate\n       label: Validate\n       kind: validation\n       inputs: [diff]\n       outputs: [validation]\n\n     - id: human-check\n       label: Stop and decide\n       kind: approval-gate\n       approval:\n         reason: Keep the spike, or rewrite?\n         requestedAction: continue\n```\n\n```\n   vibe flows list\n   vibe flows show spike-and-decide\n```\n\n```\n   vibe run \"Prototype the search ranking\" \\\n     --flow spike-and-decide\n```\n\n### Seats, not your models\n\n```\nvibe profile list\nvibe run \"...\" --flow spike-and-decide \\\n  --step-profile prototype=<profileId>\n```\n\n### Optional steps\n\n```\nvibe run \"...\" --flow spike-and-decide \\\n  --flow-skip plan\n```\n\n### Clean-room steps\n\n```\n- id: review\n  label: Review\n  kind: review-turn\n  seat: reviewer\n  # reasons from the change and the spec\n  inputs: [diff]\n  # ...but not the producer's narrative\n  cleanRoom: true\n```"
    },
    {
      "id": "docs/extending/add-provider",
      "kind": "doc",
      "title": "Add a provider",
      "source": "Vibestrate docs: extending/add-provider",
      "summary": "Tell Vibestrate how to run a local coding CLI it doesn't already know, or change the flags of one it does.",
      "titleTerms": "a add provider",
      "terms": "11434 4 5 6 a add add-provider agent already an and anthropic anthropic-api anthropic_api_key api apply arg assign at bas binary can chang check claud claude-cod claude-experiment claude-fast claude-sonnet-4-6 cli cod color com command common connectivity crew custom declar deeper default detect did diff dir directory do doctor doe doesn env expect experiment extend fast fil flag four going how http http-api id in input instead it its json key know list liter loc localhost localhost-proxy mistak model my my-coding-cli my-model my-model-default never no no-color of ollama ollama-loc on one only openai or own p per per-provider permiss pick point profil project prompt prompt-on-stdin provider proxy put qwen3 read read_only referenc report reviewer rol run saf seat server setup simpl sonnet stdin t tak tell test the tip to touch typ up url usag verify vib vibestrat what wir with word work worktre wrap yml you",
      "body": "## In simple words\n\nA provider is how Vibestrate reaches a model - almost always a command-line tool already on your machine. The detector knows eleven, so most of the time you add nothing.\n\n```\nvibe provider setup            # wire up a detected CLI\nvibe provider test <id>        # safe connectivity check\n```\n\n### Declare a custom CLI provider\n\n```\nproviders:\n  my-model:\n    type: cli\n    command: my-coding-cli\n    args: [--prompt-on-stdin, --no-color]\n    input: stdin           # stdin | arg\n```\n\n### Assign the provider to a role\n\n```\nproviders:\n  my-model:\n    type: cli\n    command: my-coding-cli\n    args: [--prompt-on-stdin, --no-color]\n    input: stdin\n\nprofiles:\n  my-model-default: { provider: my-model }\n\ncrews:\n  default:\n    roles:\n      reviewer:\n        seats: [reviewer]\n        profile: my-model-default\n        prompt: .vibestrate/roles/reviewer.json\n        permissions: read_only\n```\n\n```\nvibe run \"...\" --profile my-model-default\n```\n\n### Verify it works\n\n```\nvibe provider list\nvibe provider test my-model\n```\n\n### Wrap Claude Code with custom flags\n\n```\nproviders:\n  claude-experimental:\n    type: claude-code\n    command: claude\n    args: [-p, --model, claude-sonnet-4-6]\n```\n\n### Point at a server instead of a binary\n\n```\nproviders:\n  ollama-local:\n    type: localhost-proxy\n    api: ollama                # or: openai\n    baseUrl: http://localhost:11434\n    model: qwen3.5\n\n  anthropic-api:\n    type: http-api\n    api: anthropic             # or: openai\n    baseUrl: https://api.anthropic.com\n    model: claude-sonnet-4-6\n    # an env reference, never a literal key\n    apiKey: env:ANTHROPIC_API_KEY\n```"
    },
    {
      "id": "docs/extending/add-skill",
      "kind": "doc",
      "title": "Add a skill",
      "source": "Vibestrate docs: extending/add-skill",
      "summary": "Write a markdown file, save it under .vibestrate/skills/, and attach it to a role or run.",
      "titleTerms": "a add skill",
      "terms": "1 2 3 4 a about access add add-skill agent already an and anti anti-pattern api api-convent arg at attach auth auth-convent be beat body bound bullet check claud command convent creat crew deeper default descript did directory discover editor exampl explicitly extend fa fil flat for form going good grant hav id in inspect is it json keep know list mak mark markdown mcp md ment mkdir nam not of one only option or p pattern payment permiss pg pg-mcp planner plu point postgr prefer profil project prompt query read read-only reason requir right rol rul run sav seat sentenc server sess shap short show simpl skill specific src stat stay surfac that the thi tip titl to ts two under use vib vibestrat was way we what when which with word writ x yml you",
      "body": "## In simple words\n\nA skill is a markdown file teaching your agents your project's conventions. There is no scaffold to run and no metadata form - write the file, and discovery picks it up.\n\n```\nmkdir -p .vibestrate/skills\n$EDITOR .vibestrate/skills/api-conventions.md\n```\n\n**Tip.** Vibestrate reads `.claude/skills/` too, so skills you already keep for Claude Code work as they are. You do not have to move or duplicate them.\n\n## The two shapes\n\n**A flat `.md` file** The common case. Instructions only. This page's default.\n\n**A directory with `SKILL.md`** For a skill that also needs an MCP server alongside its instructions.\n\n### 2. Write the body\n\n```\n# Title - what this is about\n\n### When to use this\n\nOne or two sentences naming the surface.\n\n### Rules\n\n- Bullet list of conventions.\n- Be specific. \"We use X\" beats \"we prefer X\".\n\n### Examples\n\nShort examples of the right way.\nMark anti-patterns explicitly.\n```\n\n### 3. Check that it was discovered\n\n```\nvibe skills list\nvibe skills show <name>\n```\n\n### 4. Attach it\n\n```\ncrews:\n  default:\n    roles:\n      planner:\n        skills: [auth-conventions]\n        # plus seats, profile, prompt and\n        # permissions, which stay required\n```\n\n```\nvibe run \"Add 2FA\" --skills auth-conventions\n```\n\n### Optional: pointing a skill at an MCP server\n\n```\n.vibestrate/skills/\n  postgres/\n    SKILL.md\n    .mcp.json\n```\n\n```\n---\nname: postgres\ndescription: Read-only Postgres access.\n---\n\n# Postgres MCP\n\nThis skill grants agents read-only Postgres\naccess, for inspecting queries.\n```\n\n```\n{\n  \"mcpServers\": {\n    \"postgres\": {\n      \"command\": \"pg-mcp\",\n      \"args\": [\"--read-only\"]\n    }\n  }\n}\n```"
    },
    {
      "id": "docs/getting-started/big-picture",
      "kind": "doc",
      "title": "The big picture",
      "source": "Vibestrate docs: getting-started/big-picture",
      "summary": "How Vibestrate runs a coding job, and what Task, Flow, Seat, Crew, Profile and Provider each mean.",
      "titleTerms": "big pictur the",
      "terms": "a add ai and any api architect auth behind big big-pictur builder but chair challenger check cli cod crew deeper default did don each executor fil fill flow for get getting-start going handler has hav hold how http http-api implementer in init it job key know label localhost localhost-proxy log machin mean meet model mor need no of on one open or order overrid own pick pictur profil provider proxy reviewer rol routin run s sav seat seat-rol senior senior-reviewer server set simpl start strong structur t task team than that the thi through tighten tip to tool up vib vibestrat want what will with word worker you your",
      "body": "## In simple words\n\nVibestrate runs the AI coding tools you already have. You write the job down once, and a team of AI workers carries it out under rules you set.\n\nRunning several models on one job by hand is where the time goes: you paste the same context into a tool that has never seen your project, carry the plan from one chat to the next, and watch each one for drift. Vibestrate is the frame that work happens inside, so every worker starts from the same plan and the same project instructions, which you write once.\n\n!The header of a finished run. A green panel reads Run, merge ready. Beside it the task, the flow it followed with its eight steps listed in order, and a row reading default provider, 5m 27s elapsed, and a diff of plus 24 minus 1 across 2 files.\n\nThat is the whole idea in one picture: one task, one recipe, one team, one verdict.\n\n**Tip.** Read this page once for the vocabulary, then go and start a run. The words below make far more sense after you have watched one happen than before.\n\n## Task - the job you want done\n\n```\nvibe run \"Add structured logging to the \\\nsettings save handler\"\n```\n\n## Seat - a labelled chair in the routine\n\n```\nCrew \"default\" has more than one role filling\nthe \"reviewer\" seat (reviewer, senior-reviewer).\nPick one with a role override.\n```\n\n```\nvibe run \"Tighten the auth checks\" \\\n  --seat-role reviewer=senior-reviewer\n```\n\n```\nThis Flow needs the \"architect\" seat, but crew\n\"default\" has no role that fills it. Open Crew\nand add \"architect\" to a role's Seats.\n```"
    },
    {
      "id": "docs/getting-started/first-run",
      "kind": "doc",
      "title": "Your first run",
      "source": "Vibestrate docs: getting-started/first-run",
      "summary": "How one run works, from the sentence you type to the branch it leaves behind.",
      "titleTerms": "first run your",
      "terms": "a abort about add adjectiv adjective-noun anyth approv artifact at behind big block bohr branch can cd chang creat decis deeper did diff don end event fail fin first first-run flow for from get getting-start gh git going handler hom how in it know leav log look main md merg merge_ready ndjson never next noun one or order output pass pick pr ready review right run sav scop sentenc set short simpl small sourc start statu step stop structur t tak task termin that the tip to too typ ui use verificat verify vib vibestrat vibestrate-worktre well well-scop what wher word work worktre you zen zen-bohr",
      "body": "## In simple words\n\nYou hand Vibestrate one task and it takes that task start to finish. It works in a second checkout of your repository, in a folder beside your project, so the files you have open never move under you.\n\nThe run stops with the change on its own branch. Vibestrate never merges and never pushes, so the last call is yours.\n\n!The header of a finished run reading merge ready, with the task, the flow it followed, its eight steps, the elapsed time and the diff.\n\n**Tip.** Pick something small for the first one. You are learning what the run looks like, not testing how much it can do, and a small task gets you to a verdict in a couple of minutes.\n\n## Where a run can end\n\n**merge_ready** Every check passed. The change is waiting for you.\n\n**blocked** Something refused: a review, a policy, a failed check.\n\n**failed** A step crashed. Its own output says why.\n\n**aborted** You stopped it.\n\n**Did you know?** A run you dislike costs you nothing to discard. It never touched your branch, so there is no revert - you just ignore the folder. That is what makes it safe to try something you are unsure about.\n\n## Start the run\n\n```\nvibe run \"Add structured logging to the \\\nsettings save handler\"\n```\n\n```\nvibe run \"Add structured logging to the \\\nsettings save handler\" --ui\n```\n\n### In the terminal\n\n```\nFinal status: merge_ready\n  Review decision: APPROVED\n  Verification: PASSED\n  Artifacts: .vibestrate/runs/zen-bohr/artifacts\n  Worktree: /home/you/.vibestrate-worktrees/zen-bohr\n  Branch: vibestrate/zen-bohr\n```\n\n### Look at what it changed\n\n```\ncd ../.vibestrate-worktrees/zen-bohr\ngit diff main\n```"
    },
    {
      "id": "docs/getting-started/installation",
      "kind": "doc",
      "title": "Installation",
      "source": "Vibestrate docs: getting-started/installation",
      "summary": "Install Vibestrate and check your environment in two commands.",
      "titleTerms": "installat",
      "terms": "2 24 5 add agent already and artifact at attachment cd check cli cod codebas coding-agent com command compos context crew curl deeper did doctor domain els empty environment event every extra fil find fix flow fs g get getting-start git githubusercontent gitignor going guyshonshon hav hold http in init insid install installat instruct is its js json know least main markdown md metric newer next nod noth npm on one onto option or order per pnpm policy profil project provider publish raw read requirement rol rul run s scaffold set sh simpl skill sl start stat that the tip touch turn two until up url vers vib vibestrat view what wir word writ yml you your your-project",
      "body": "## In simple words\n\nYou need **Node.js 24 or newer** and a git repository.\n\n```\nnpm install -g vibestrate     # or: curl -fsSL get.vibestrate.com | sh\ncd your-project\nvibe init                     # scaffolds .vibestrate/, touches nothing else\nvibe doctor --fix             # finds and wires up the CLIs you already have\n```\n\nIt runs on macOS, Linux and Windows, no WSL required.\n\n**Tip.** `vibe init` only writes inside `.vibestrate/`. It does not touch your source, your package manifest or your git config, so running it in an existing project is safe to try.\n\n## What init writes\n\n**`project.yml`** Providers, profiles, crews, flows and validation commands.\n\n**`roles/`** Six workers, each with its own instructions file.\n\n### Install\n\n```\nnpm install -g vibestrate\n# or\npnpm add -g vibestrate\n```\n\n```\nurl=https://raw.githubusercontent.com/guyshonshon\ncurl -fsSL $url/vibestrate/main/install.sh | sh\n```\n\n```\nnpm view vibestrate versions     # what is published\nnpm install -g vibestrate@<version>\nvibe --version\n```\n\n### Set up your project\n\n```\nvibe init\nvibe doctor\n```\n\n### Inside `.vibestrate/`\n\n```\n.vibestrate/\n  project.yml  providers, profiles, crews\n               (roles), commands, policies\n  rules.md     project instructions agents\n               read on every turn\n  rules/       optional extra instruction\n               files, composed onto rules.md\n  roles/       one JSON role file per role,\n               holding its instructions\n  skills/      markdown attachments that add\n               domain context\n  flows/       your project's run Flows\n               (empty until you add one)\n  runs/        run state, artifacts, metrics,\n               events\n```\n\n```\n.vibestrate/runs/\n```"
    },
    {
      "id": "docs/getting-started/merging",
      "kind": "doc",
      "title": "Keep a change (Git and merging)",
      "source": "Vibestrate docs: getting-started/merging",
      "summary": "Git in one minute, and how to move a finished change from the run's copy into your real project.",
      "titleTerms": "a and chang git keep merg",
      "terms": "a advis advisor alway analyz and ask at best bold bold-lovelac branch call cd chang checkout copy creat deeper deterministic did diff ff ff-only finish from get getting-start gh git going how id in integrat into is it keep know leav locally look lovelac main merg merge_ready minut mov of on one only open opt or order part pr project pull ready real request run s shar simpl sourc start tak the thre tip to vib vibestrat vibestrate-worktre what word worktre you your",
      "body": "## In simple words\n\nA run never edits your project folder. It works in its own copy - a git worktree beside your project, on its own branch - and stops at `merge_ready` with the change waiting there.\n\nFolding it into `main` is the one step Vibestrate always leaves to you.\n\n!The Workspace panel of a run, naming the branch and the run's isolated git worktree path, with a Copy cd button.\n\n**Copy cd** puts the path on your clipboard, so you can go and read the work before you take it.\n\n**Tip.** Read the diff before merging, every time. The verdict tells you which checks ran and passed; it does not tell you the change is the one you wanted. Those are different questions and only you can answer the second.\n\n## Your three options\n\n**Take it** Merge the run's branch into yours. The advisor can tell you what that would do first.\n\n**Take part of it** It is a normal git branch. Cherry-pick what you want.\n\n**Leave it** Ignore the folder. Nothing entered your branch, so there is nothing to undo.\n\n**Did you know?** `vibe integrate advise` is read-only. It reads the run's branch and tells you which of the three routes it recommends, changing nothing. The merge itself needs a separate command, and finishing into `main` needs a typed confirmation token.\n\n## Git in one minute\n\nThree ideas cover it.\n\n## Look at what changed\n\n```\ncd ../.vibestrate-worktrees/<runId>\ngit diff main\n```\n\n## Ask the merge advisor\n\n```\nvibe integrate advise <runId>\n```\n\n### Take the change\n\n```\n# Open a pull request (best on a shared project)\ncd ../.vibestrate-worktrees/<runId>\ngh pr create\n\n# Or merge it into main locally\ngit checkout main\ngit merge --ff-only vibestrate/<runId>\n```"
    },
    {
      "id": "docs/getting-started/providers",
      "kind": "doc",
      "title": "Set up a provider",
      "source": "Vibestrate docs: getting-started/providers",
      "summary": "Tell Vibestrate which AI coding tools you have, then check that each one answers.",
      "titleTerms": "a provider set up",
      "terms": "0 1 11434 127 4 4096 5 6 a ai aider already an and answer anthropic anthropic_api_key api are arg bas builder challenger check choos claud claude-default claude-sonnet-4-6 cli cloud cod code_writ codex codex-default com command crew cross cross-model deeper default detect did doctor doe each env executor found get getting-start going hav http http-api id implementer in init internet is it json key kind know liter loc localhost localhost-proxy machin max model nam never next not ollama on one only or order over own p path permiss profil project prompt provider proxy qwen3 read read_only ready referenc reviewer rol run seat see server set setup simpl singl single-profil someth sonnet start stay stdin tell test that the then they thi thre tip token tool tri typ up url v2 vers vib vibestrat what wher which with word work writ yml you your",
      "body": "## In simple words\n\nVibestrate does not ship a model of its own. It hands the work to something you already have, and that something is a **provider**.\n\nYou need at least one before a task can run.\n\n### See what you have\n\n```\nvibe provider detect\n```\n\n```\n✓ Claude Code - ready\n  Command: claude (v2.1.4)\n  Default args: -p with prompt on stdin.\n\n○ Aider - not found\n  Command tried: aider\n  aider is not on PATH.\n```\n\n### Set it up and test it\n\n```\nvibe provider setup\n```\n\n```\nvibe provider test claude\nvibe provider test ollama\n```\n\n### Choose which one does the work\n\n```\nvibe provider set claude\n```\n\n```\nvibe run \"...\" --profile codex-default\n```\n\n```\nprofiles:\n  claude-default: { provider: claude }\n  codex-default:  { provider: codex }\n\ncrews:\n  default:\n    roles:\n      executor:\n        seats: [implementer, executor, builder]\n        profile: codex-default\n        prompt: .vibestrate/roles/executor.json\n        permissions: code_write\n      reviewer:\n        seats: [reviewer, challenger]\n        profile: claude-default\n        prompt: .vibestrate/roles/reviewer.json\n        permissions: read_only\n```\n\n### Models over the internet or on your own machine\n\n```\nproviders:\n  cloud:\n    type: http-api\n    api: anthropic\n    baseUrl: https://api.anthropic.com\n    model: claude-sonnet-4-6\n    # an env reference only - never a literal key\n    apiKey: env:ANTHROPIC_API_KEY\n    maxTokens: 4096\n  local:\n    type: localhost-proxy\n    api: ollama\n    baseUrl: http://localhost:11434\n    model: qwen3.5\n    maxTokens: 4096\n```"
    },
    {
      "id": "docs/getting-started/quickstart",
      "kind": "doc",
      "title": "Quick start",
      "source": "Vibestrate docs: getting-started/quickstart",
      "summary": "Install Vibestrate, point it at a coding CLI you already have, and take one task from a sentence to a branch you can keep.",
      "titleTerms": "quick start",
      "terms": "0 0a1b2c3d4 1 10 13 2 22 227 24 3 318m 4 4318 497m 5 6 7 9 a abort about accept acm acme-api add adjust advic advis advisor agent ahead ai aider aider-install all already amount an and anthropic anthropic-ai anthropic_api_key api appli applicabl apply approv arbitrat architect are arg artifact as assuranc at auto auto-push availabl back bar bashrc be behind bin block bold bold-lovelac branch brief build but by can carry cd chang check checkout claud claude-cod clean cleanly cli cloud cod codebas codex command commit confidenc config configur confirm connect consum copy cover crew current custom dashboard decis deeper default detect did diff different disabl do doctor doe durat each earn ebadengin echo edit els endpoint engin engineer everyth exactly exampl exec execut executor exist exit export express fail fast fast-forward fil fin find finish finish-now first fix fixer flag flaky flow for fork forward found from g gemini gemini-cli get getting-start git git-init gitignor going googl handler happen hav head healthz help her high hold hom how http http-api id if improv in init initialis initializ input insid install integrat into invocat invok is isn isolat it its js json just keep key know land later learn left let lik lin list llm lm loc localhost localhost-proxy log login look lovelac m magic main manager master may md mean merg merge-to-main merge_ready mod model mov must nam need newer next no no-op nod not noth now npm nvm of often ok ollama on one only onto op open openai openai_api_key opencod operat or outcom outsid own p packag pag panel panel-review pass path permiss permission-mod permit persona pick pid pip plac plan plan-only planner pnpm point policy port prefix present preset project prompt prompt-flag prov provider proxy push python quality quality-arbitrat quickstart qwen3 ran re re-test read read-only readm ready real refere repo repository requir resolv respond restart review reviewer right rol rul run s saf sandbox sav say scaffold scop script security security-review select send sentenc server set setup shap should show sign simpl sit skill small so someth staff staff-engineer stag stand start starter statu stay stdin stdout strict structur studio substitut summary supervisor t tak task tell test that the their then thi thre tiny tip to token took touch tri tru trunk typ typecheck ui ui-port unattend uncommit unsupport usag use v v0 v2 v22 valid validat verificat verifier verify vers via vib vibestrat vibestrate-worktre vibestrate_provider_ok view wait warn was watch wer what when which whos will with without word workspac workspace-writ worktre worth would writ yes yml you your your-project your-write-flag yourself zshrc",
      "body": "## In simple words\n\n```\nnpm install -g vibestrate\ncd your-project\nvibe init && vibe doctor --fix\nvibe run \"Add a /healthz endpoint\" --ui\n```\n\n### Install the CLI\n\n```\nnpm install -g vibestrate\nvibe --version\n```\n\n```\n0.2.1\n```\n\n```\nnpm warn EBADENGINE Unsupported engine {\nnpm warn EBADENGINE   package: 'vibestrate@0.2.1',\nnpm warn EBADENGINE   required: { node: '>=24' },\nnpm warn EBADENGINE   current: { node: 'v22.22.2', npm: '10.9.7' }\nnpm warn EBADENGINE }\n```\n\n```\nnode --version\nnvm install 24 && nvm use 24    # or your own version manager\nnpm install -g vibestrate\n```\n\n```\nnpm config get prefix\necho \"export PATH=\\\"$(npm config get prefix)/bin:\\$PATH\\\"\" >> ~/.zshrc    # or ~/.bashrc\nwhich vibe\n```\n\n### Initialise your project\n\n```\nvibe init --yes\n```"
    },
    {
      "id": "docs/getting-started/skills",
      "kind": "doc",
      "title": "Attach skills",
      "source": "Vibestrate docs: getting-started/skills",
      "summary": "A markdown note that carries your project's rules into an agent's prompt on every run.",
      "titleTerms": "attach skill",
      "terms": "2 a about add agent an and are assign auth auth-convent balanc carry chang claud claude-balanc codebas convent cooky creat crew deeper default did domain don enrollment error error-handl every fa for from get getting-start go going hand handl her how http id in inlin into is it json jwt keep know lax list login lucia markdown mcp md middlewar mint modul nam never new not on one only order path permiss planner profil project prompt read read_only really reason requir restat review rol rout rul run s sam seat second security security-review server sess show sign simpl sit skill skip src start subsystem t that the thi thos tip to touch ts unassign under use vib vibestrat vocabulary what when with word work worth writ yml you your",
      "body": "## In simple words\n\nA **skill** is a markdown note Vibestrate pastes into an agent's prompt before it starts work.\n\n```\n# How login works here\n\nSessions are signed cookies, not JWTs. `src/auth/session.ts` is the only\nmodule that mints one. Never add a second path.\n```\n\nWrite it into `.vibestrate/skills/`, attach it to a role, and every run seating that role reads it. You teach an agent something about your project once instead of retyping it into every task.\n\n**Tip.** The test for whether something belongs in a skill: would you say it to a new contractor on their first day, and would you be annoyed to repeat it on their second? That is a skill. A one-off instruction belongs in the task.\n\n## What to write one about\n\n**How a subsystem really works** The thing that is not obvious from reading it.\n\n**Conventions you keep restating** Naming, error handling, which logger.\n\n### Write one\n\n```\nThis codebase uses Lucia for sessions.\nWhen touching auth:\n\n- Don't create session middleware inline.\n  Use `requireSession` from `src/server/auth.ts`.\n- Cookies are HttpOnly and SameSite=lax.\n  Don't change those defaults.\n- New auth routes go under\n  `src/server/routes/auth/`.\n```\n\n### Hand it to an agent\n\n```\nvibe skills list\nvibe skills show auth-conventions\nvibe skills assign planner auth-conventions\nvibe skills unassign planner auth-conventions\n```\n\n```\ncrews:\n  default:\n    roles:\n      planner:\n        seats: [planner]\n        profile: claude-balanced\n        prompt: .vibestrate/roles/planner.json\n        permissions: read_only\n        skills: [auth-conventions, error-handling]\n```\n\n```\nvibe run \"Add 2FA enrollment\" \\\n  --skills auth-conventions,security-review\n```"
    },
    {
      "id": "docs/getting-started/walkthrough",
      "kind": "doc",
      "title": "Full walkthrough",
      "source": "Vibestrate docs: getting-started/walkthrough",
      "summary": "This page covers the dashboard, flows, crews, policies, spec-up and the merge path.",
      "titleTerms": "full walkthrough",
      "terms": "1 2 3 4 40 5 a abl accept across act actually adaptiv add advic advis afterward allow alon an analysi and answer applicabl apply approv arbitrat are as assuranc async auth autonomy await back be befor block bold bold-lovelac branch brief budget build builder can cas cd chain challenger chang cheap check checkout claud claude-cod cli cod code_writ codex com command commit config configur confirm consol consult control cover crew dashboard data data-stor decis deeper default did diff do doctor doe each eight end enforc engineer error every exampl executor express fast fil finish first fix flow for from gap gat get getting-start git going gpt gpt-5 greenfield handl handler harden head her high how hub id implementer in init insid install intak integrat interactiv into is it its just kebab kebab-cas keep know list loc log lovelac m main many matcher max max-turns-run md me mean merg merge-to-main miss model mov nam no no-consol no-select not of off on one only opin origin over own pag panel panel-review partially path per pick pickup pickup-analysi pickup-review plan plan-only plan-worthy policy postgr power prefer prefer-async preset print proc profil project propos provider qualify quality quality-arbitrat quest read read-only read_only ready refresh refus requir review reviewer rewrit roadmap rol rul run s saga sav scaffold seat seat-rol second second-opin security security-review select sequenc set setup ship show shown simpl simplify singl so spec spec-up specifi split staff staff-engineer stag stand start statu step stop stor strict structur stuck supervisor tak task tenant termin that the then thi thorough tip to token tracker tru turn two typ ui under under-specifi unknown unsaf unverifi up validat verbatim verifi verificat verifier vers vib vibestrat view walkthrough what when whether which who why will with word workspac worktre worthy would writ yml you your your-project yourself",
      "body": "### Starting a run\n\n```\nvibe run \"Add structured logging to the settings save handler\"\n```\n\n## The dashboard\n\n```\nvibe ui\n```\n\n```\ncd /path/to/your-project && vibe ui\n```\n\n### The flows that ship\n\n```\nvibe flows list\nvibe flows show default --crew default\nvibe run \"Harden the token refresh path\" --flow security-review\n```\n\n### Splitting a run across two models\n\n```\nvibe profile add second-opinion --provider codex --model gpt-5.5 --power high\nvibe config set crews.default.roles.reviewer.profile second-opinion\nvibe config set crews.default.roles.verifier.profile second-opinion\nvibe crew show default\n```\n\n### Rules the reviewer enforces\n\n```\nvibe policies add prefer-async \"prefer async/await over .then() chains\" --fix \"rewrite as async/await\"\nvibe policies add no-console \"no console.log in shipped code\" --block --matcher \"console\\\\.log\\\\(\"\n```\n\n```\nvibe policies doctor\n```\n\n### Spec-up, for a brief that reads greenfield\n\n```\nvibe run \"build a task tracker with auth and a dashboard\"\n```\n\n```\nFlow: Default (default)  ·  spec-up (plan-worthy brief; read-only spec-up chain)\n  → Under-specified brief - spec-up first (read-only intake -> spec); \"default\" then builds from the approved spec.\n```"
    },
    {
      "id": "docs/getting-started/welcome",
      "kind": "doc",
      "title": "The guided walkthrough",
      "source": "Vibestrate docs: getting-started/welcome",
      "summary": "A four-step tour of providers, crew, flows and your first run that you can skip or quit and pick up later.",
      "titleTerms": "guid the walkthrough",
      "terms": "a add and can crew deeper did each first flow four four-step from get getting-start going handler her if in init initializ it json know later left log not of off or order pick project provider quit re remember reset run sav set settl setup simpl skip start stat step structur that the tip to tour up vib vibestrat welcom welcome-stat what wher word yet yml you your",
      "body": "## In simple words\n\n`vibe welcome` walks you through setup in four steps: a provider, a crew, your flows, then your first run.\n\n```\nvibe welcome\n```\n\nQuit halfway and it picks up where you stopped. Skip any step. `--reset` starts over.\n\n**Tip.** It asks questions, so it needs a real terminal. In a script or in CI it prints the commands to run by hand and exits without touching anything, rather than hanging on a prompt nobody will answer.\n\n## What each step settles\n\n**Providers** Which coding-agent CLIs you already have, and which are logged in.\n\n**Crew** The six workers, and which model each one runs on.\n\n**Flows** Which recipes this project can run, and which is the default.\n\n**First run** A real task, start to finish, so the vocabulary lands.\n\n**Did you know?** The tour is resumable because it writes as it goes rather than at the end. Quitting after step two leaves you with a working provider and crew, not a half-written config that has to be started again.\n\n### The four steps\n\n- **Providers** - the coding CLI that runs the model doing the work, such as Claude Code or Ollama. This step runs `vibe provider setup` for you. - **Crew** - your team of AI workers. Install a ready-made one (Fast, Thorough, Cheap, or Local), or skip and build your own later. - **Flows** - a flow is the ordered list of steps a run works through. You'll see how to list the flows you already have, and how to install more from the flows hub, a shared collection you can browse. - **Your first run** - a small task to try next.\n\n### It remembers where you left off\n\n```\nvibe welcome --reset\n```\n\n### If you're not initialized yet\n\n```\nvibe init\nvibe welcome\n```\n\n### From here\n\n```\nvibe run \"Add structured logging to the \\\nsettings save handler\"\n```"
    },
    {
      "id": "docs/getting-started/why-a-human",
      "kind": "doc",
      "title": "Why a human stays in the loop",
      "source": "Vibestrate docs: getting-started/why-a-human",
      "summary": "How Vibestrate checks an AI's work, and why the last call on a change is yours.",
      "titleTerms": "a human in loop stay the why",
      "terms": "3 a actually add address ai alongsid an and approv ask assuranc at bad balanc bold bold-lovelac branch call catch caveat challenger chang check claud claude-balanc cod codex codex-review confidenc consult cover crew cross cross-model deeper default did end engineer error fix flag for get getting-start going handler how human in instead is it json keep know label last lovelac medium model no not object of on only order own pass payoff permiss policy profil project prompt provider re re-validat read read_only return review reviewer rol run runtim s seat second set setup simpl singl single-profil skill so staff staff-engineer start step suit supervisor swallow test that the tip to turn typ unproven validat verifi verificat vib vibestrat was what why why-a-human word work writ wrot yml you your",
      "body": "## In simple words\n\nAI can write code you could not write yourself. The same AI also makes things up, and it tends to agree with whatever you just said. Trusting it blind is how bad code ships.\n\nSo a run is built to disagree with itself. A different model reads the diff than wrote it, your tests decide whether it works, and nothing merges without you.\n\n!The Run assurance panel reading verified, with four tiles underneath: Policy passed, Validation passed 2 of 2, Review approved, Verification passed.\n\n### Turn on a second model\n\n```\n# add codex alongside claude\nvibe provider setup\nvibe profile add codex-review --provider codex\n```\n\n```\ncrews:\n  default:\n    roles:\n      reviewer:\n        label: Reviewer\n        seats: [reviewer, challenger]\n        # was claude-balanced\n        profile: codex-review\n        prompt: .vibestrate/roles/reviewer.json\n        permissions: read_only\n        skills: []\n```\n\n```\n$ vibe assurance bold-lovelace\nRun assurance bold-lovelace - verified\n\n  policy:       passed\n  validation:   passed (3/3 passed)\n  review:       approved\n  verification: passed\n  supervisor:   staff-engineer (cross-model)\n```\n\n### Ask instead of reading\n\n```\nvibe consult --run bold-lovelace \\\n  \"What did the reviewer object to, and did the \\\nfix step address it?\"\n```\n\n```\nConsult  · confidence: medium\n\nThe reviewer flagged the settings handler for\nswallowing write errors. The fix step added a\ntyped error return and re-validation passed, so\nthe objection was addressed in code.\n\nCaveats (not verified):\n  • No test covers the error branch, so the fix\n    is unproven at runtime.\n```"
    },
    {
      "id": "docs/getting-started/windows",
      "kind": "doc",
      "title": "Native Windows support",
      "source": "Vibestrate docs: getting-started/windows",
      "summary": "The core loop - install, providers, runs, diffs and merge - runs natively on Windows in PowerShell or cmd, with no WSL. The in-app terminal tab and Docker isolation are the exceptions.",
      "titleTerms": "nativ support window",
      "terms": "after and app are c cd claud cmd cor deeper did diff do docker doctor except fix g get getting-start going in in-app init inst install is isolat know loop merg natively next no not npm on one or order path power project provider ps1 recogniz right run shell simpl start tab termin the thing tip to vers vib vibestrat what window with word work worktre wsl you your your-project",
      "body": "## In simple words\n\nVibestrate runs natively on Windows, with no WSL. In PowerShell or cmd you install the CLI, set up providers, run tasks, review diffs and merge, the same as anywhere else.\n\n```\nnpm install -g vibestrate\ncd C:\\path\\to\\your-project\nvibe init\nvibe doctor --fix\n```\n\n**One thing you do not get: the in-app terminal tab.** It needs a POSIX shell, so on native Windows Vibestrate turns it off and points you here. If you want a shell inside the app, run Vibestrate under WSL instead. Everything else works as it does everywhere.\n\n**Tip.** Your own terminal still works fine. The run's worktree path is on the run page with a copy button, so you can open it in PowerShell and work there directly.\n\n## What works natively\n\n**Install and init** `npm install -g vibestrate`, then `vibe init` in PowerShell or cmd.\n\n**Providers** The same detection and setup as anywhere else.\n\n**Runs and worktrees** Real git worktrees, real isolation, no translation layer.\n\n**Diffs and merging** Read the change, take it, all from the dashboard or your own terminal.\n\n**Did you know?** Native Windows support was not a port of a POSIX assumption - it is a separate execution path. That is why the terminal tab is switched off with an explanation rather than failing at the moment you click it.\n\n### Providers on Windows\n\nClaude Code, Codex and Gemini all run natively on Windows once you've installed their CLIs with npm. Vibestrate calls them the same way it does on macOS and Linux.\n\nPast those three it varies tool by tool, and some are still POSIX-only. `vibe doctor` flags any provider it can't find or run, so you know where each one stands before you start rather than halfway through a run."
    },
    {
      "id": "docs/glossary",
      "kind": "doc",
      "title": "Glossary",
      "source": "Vibestrate docs: glossary",
      "summary": "Plain-language definitions for the words you'll meet across these docs.",
      "titleTerms": "glossary",
      "terms": "1 2 3 a abort across act add adopt advisory all annotat api apply approv approval-gat archiv artifact assert assist at backend block board branch broker by chang checklist claud cli clos cloud cod code_writ column command complet conductor config consult container context context-fil context-url continuou control creat crew dedicat deeper default defin definit deny detect did dir doc docker don each effort endpoint enhanc every execut export fail fals fil fill fiv flow for gat git glossary going health high http http-api human human_approv human_review id implementer in in-progress in_progress init instruct integrat into invariant isolat item json kind know label languag ledger list ll loc local-worktre localhost localhost-proxy low machin main matter max md medium meet merg merge_ready miss mod model most nam navigator ndjson need on only open operat orchestrator overview panel param parameter patch pend permiss persona phas pick pick-up pickup plain plain-languag plan policy ponytail power preview profil progress project project-param propo propos provider proxy read read-only read_only ready reject remov replay request request-chang requir require_approv resum return review roadmap rol root rout rul run s seat secret segment sequenc sequentially server set simpl skill sourc spec spec-up spend stag start stat statu step step-by-step stop supervis supervisor task telemetry term termin test that the thes through tip trac transit tru ts ui up url usd validat vib vibestrat wait waiting_for_approv which whos word workflow workspac worktre writ x yml you your",
      "body": "## In simple words\n\nShort, plain definitions for the words these docs use.\n\n**Tip.** Meeting these for the first time? Read the big picture instead. It introduces the same words in the order they depend on each other, which is far easier than an alphabetical list.\n\nThe words in one sentence, so the shape is visible before the list:\n\n```\nA Task runs through a Flow, whose steps name Seats,\nwhich your Crew's Roles fill, each on a Profile, which names a Provider.\n```\n\n## The five that matter most\n\n**Task** What you want done, in plain language.\n\n**Flow** The recipe: ordered steps, each naming a kind of worker.\n\n**Crew** Who fills those slots, and which model each one runs on.\n\n**Run** One attempt at a task, in its own copy of your repo.\n\n**Did you know?** A seat, a role and a profile are three different things that people routinely collapse into \"the model\". Keeping them apart is exactly what lets a flow written by a stranger run on your models, at your budget, unedited.\n\n### Every term\n\n**Action Broker.** The one checkpoint every real effect has to pass through, whether that's starting a provider, running a command, or writing a file. For each effect it decides allow, deny, or ask a human first, then writes down what it decided and why in an `actions.ndjson` in that run's folder under `.vibestrate/runs/`. This is where **Policy** actually gets enforced in the running code. It is default-allow with a policy veto - an effect nobody wrote a rule about proceeds - so it's where you impose limits, not a whitelist you have to satisfy. See Safety.\n\n**Crew.** Your local team of Roles. A run uses one Crew - the one named by `defaultCrew` in `project.yml` unless you pass another - and matches the Flow's Seats to the Roles in it. See Crew."
    },
    {
      "id": "docs/index",
      "kind": "doc",
      "title": "Vibestrate docs",
      "source": "Vibestrate docs: index",
      "summary": "Vibestrate is where your AI coding agents work together - one shared plan, one set of rules, one record. It runs the CLIs you already have and leaves the final call to you.",
      "titleTerms": "doc vibestrat",
      "terms": "a add advanc agent ai already and api audit automat boundary build call can chosen cli cod codex consol consult context context-url control copy crew deeper default did doc end environment every express fin flow full get getting-start git go going hav her http http-api id in index init input is it know leav link log miss model modul next no no-console-log nod node_modul not of off on one only open per plan profil project quest quick quickstart re re-read read read-only recip record repo review reviewer rul run scaffold set shar simpl skill start statu stay steer task that the thi tip to together ui unattend url user validat validate-input venv verify vib vibestrat walkthrough what wher word work worktre writ you your",
      "body": "## In simple words\n\nYou have the models. Vibestrate takes over the logistics of putting several of them on one task: pasting the same context into each tool, keeping a spare checkout so a risky change cannot reach your files, carrying one model's output into the next one's prompt, and catching where they drift apart.\n\nIt drives the coding CLIs already installed on your machine. The final call stays yours.\n\n!The header of a finished run reading merge ready, with the task, the flow it followed and its eight steps, the elapsed time and the diff.\n\n**Tip.** New here? Read the big picture for the vocabulary, then run one task. The words land much faster once you have watched a run happen.\n\n## What you get\n\n**One plan, every model** Same project context, same plan, same story so far. Nothing explained twice.\n\n**A reviewer that did not write it** Cross-model review by construction, not by remembering to open a new chat.\n\n**A copy of your repo per run** Agents work there. Your branch is untouched until you decide.\n\n**A record you can re-read** Every decision, token and dollar, written down locally as it happened.\n\n### Advanced: CLI and automation\n\n```\nvibe init                                          # scaffold .vibestrate/\nvibe run \"Add audit logging to the settings flow\"  # plan, build, review, verify\nvibe status                                        # the runs in this project\nvibe ui                                            # open Mission Control\n```"
    },
    {
      "id": "docs/task-lifecycle",
      "kind": "doc",
      "title": "Task lifecycle",
      "source": "Vibestrate docs: task-lifecycle",
      "summary": "How a task moves through statuses, with the fix loop and the approval gates.",
      "titleTerms": "lifecycl task",
      "terms": "a abort act afterward and answer append append-only approv architect artifact ask at block broker budget can chang changes_request com concept cor creat current decid deeper did different disk event every execut fail find finding-respon fix fixer flow for from gat going happy has history hold how human human_approv id impossibl in is it json know leav lifecycl look loop max md merg merge_ready mov ndjson need no on only order output path paus plan policy prompt re re-run ready replayabl repli request requir respon rest result resum review reviewer run see sent sequenc simpl stag stat statu step step-id stuck task task-lifecycl tell the through tip to transit until validat validation-result verdict verify vib vibestrat wait waiting_for_approv was what when wher why with word work workflow you your yourself",
      "body": "## In simple words\n\nEvery task moves through a fixed sequence of statuses, and Vibestrate will not let it skip a step or jump backward.\n\nThink of a package working through delivery: sorted, in transit, out for delivery, in that order, and each scan tells you exactly where it is right now.\n\n**Tip.** If a status looks stuck, the sequence is the first thing to check. A task waiting at an approval gate and a task whose step crashed look similar from a distance and need completely different responses.\n\n## Why a fixed sequence\n\n**You can tell where it is** One status, read from a saved value, never inferred.\n\n**No impossible history** A task cannot reach a status along a path that does not exist.\n\n**Stuck looks different from working** Waiting on you and crashed are distinct states, not one ambiguous \"not done\".\n\n**Replayable afterwards** The sequence is the record, so a finished task can be re-read rather than remembered.\n\n### The happy path\n\n```\ncreated → planning → planned\n  → architecting → architected\n  → executing → validating\n  → reviewing → verifying → merge_ready\n```\n\n### What a run leaves on disk\n\n```\n.vibestrate/runs/<runId>/\n  state.json        current status, transitions\n  events.ndjson     every event, append-only\n  actions.ndjson    brokered actions + verdicts\n  artifacts/flows/\n    <step-id>/prompt.md    what it was sent\n    <step-id>/output.md    what it replied\n    <step-id>/validation-results.json\n    findings.json          reviewer findings\n    finding-responses.json how the fixer answered\n```"
    },
    {
      "id": "docs/troubleshooting",
      "kind": "doc",
      "title": "Troubleshooting",
      "source": "Vibestrate docs: troubleshooting",
      "summary": "Concrete fixes for the issues people actually hit.",
      "titleTerms": "troubleshoot",
      "terms": "a abort actually add after ai aider aider-install an and answer anthropic anthropic-ai anthropic_api_key api approv arriv artifact at bashrc befor behind bin blank block branch but catalog cd chang check claud claude-cod clean cli cod codex com command commit concret config consult could creat curl cwd d dashboard deeper detect detected-needs-setup did didn doctor doe effort effort_ignor fail fals finish fix flow for found fs g gateway gemini gemini-cli get git going googl got guidanc has hav her hit http i id ignor in init initi insid inst install instead is is-inside-work-tre issu it key know left level list login m main md miss need never next no not noth notificat npm of ollama openai openai_api_key operat or output own panel pars pass path paus peopl pip plu pnpm policy power prefix project provider push python ready real reason reject remov replay repository request request-chang requir resum rev rev-pars right run run-id s say set setup sh simpl sl stag stall start stash statu step step-id stop stuck supervisor t tab test that the them then tip to tre troubleshoot tru typecheck ui uncommit unexpect up validat vers vib vibestrat vibestrate-worktre wait waiting_for_approv was which with won word work worktre yml you your your-project yourself zshrc",
      "body": "### `vibe: command not found` right after installing\n\n```\nnpm config get prefix\n# then add <prefix>/bin to your PATH\n# in ~/.zshrc or ~/.bashrc\n```\n\n### `vibe init` says \"not a git repository\"\n\n```\ngit init\ngit add -A && git commit -m \"Initial commit\"\nvibe init\n```\n\n### `vibe doctor` says \"no providers ready\"\n\n```\nnpm install -g @anthropic-ai/claude-code\nnpm install -g @openai/codex\nnpm install -g @google/gemini-cli\npython -m pip install aider-install && aider-install\ncurl -fsSL https://ollama.com/install.sh | sh\n```\n\n```\nvibe provider detect\nvibe provider setup\nvibe provider test <id>\n```\n\n### The test passes, but real runs fail with \"unexpected output\"\n\n```\nvibe provider setup\n```\n\n### Runs finish, but nothing was actually checked\n\n```\n# adds the commands it detected for your project\nvibe doctor --fix\n\n# or set them yourself\nvibe config set commands.validate \\\n  '[\"pnpm typecheck\", \"pnpm test\"]'\n```\n\n### Run stuck in `waiting_for_approval`\n\n```\nvibe approvals list <runId>\nvibe approvals approve <runId> <approvalId>\n# or: reject / request-changes --guidance \"...\"\n```\n\n### Worktree creation fails: \"main branch has uncommitted changes\"\n\n```\ngit stash push -m \"before vibe run\"\nvibe run \"...\"\n```\n\n```\nvibe config set git.requireCleanMain false\n```"
    },
    {
      "id": "docs/workflows/create-and-run",
      "kind": "doc",
      "title": "Create and run a task",
      "source": "Vibestrate docs: workflows/create-and-run",
      "summary": "Go from a thing you need done to a finished change you can merge.",
      "titleTerms": "a and creat run task",
      "terms": "1 2 25 3 4 5 50 a abort add advanc advis advisor alongsid analyz and arbitrat artifact audit automat away backoff behind branch by can cd chang checkout cli config creat create-and-run dashboard decis deeper default did different don every ff ff-only fil finish finish-now first flow for fram from gh git go going good heavier how human id in inspect integrat is it json just key know lib list log logger main md merg model need now oldest on one only or output path pick pr preserv profil project protect push quality quality-arbitrat re read read-only relat remov replay resolv resolve-first result retry review rout run server set shar simpl sourc src stag stage-on-integration-branch start statu suggest task termin than the thi thing thre tip to touch tru ts ui uploader vib vibestrat vibestrate-worktre walk watch weak when whether with word workflow worktre yml you yourself",
      "body": "## In simple words\n\nThis guide takes you from \"I have a thing to do\" to a change you can merge.\n\n```\nvibe run \"Add retry with backoff to the uploader\" --ui\n```\n\nThat is the short version. The rest of this page is what each part of it means and what to do when the answer is not obvious.\n\n**Tip.** `--ui` opens Mission Control alongside the run. Watching your first few runs is worth the screen space; once the shape is familiar you will mostly start them and come back.\n\n## The three decisions\n\n**How to frame it** Say what you want and the constraint that matters. Not which files to edit.\n\n**Whether to pick a flow** Auto is a good default. Name one when you disagree with what it chose.\n\n**Whether to watch** A run is fine unattended. Nothing merges without you either way.\n\n### 2. Start the run\n\n```\nvibe run \"Add audit logging to the settings...\"\n```\n\n```\n# dashboard alongside the terminal\nvibe run \"...\" --ui\n\n# a heavier flow than the default\nvibe run \"...\" --flow quality-arbitration\n\n# a different model for this run\nvibe run \"...\" --profile <id>\n```\n\n### 4. Inspect the result\n\n```\nvibe status            # every run, oldest first\nvibe replay <runId>    # read-only, one run\n```\n\n### 5. Merge it yourself\n\n```\nvibe integrate advise <runId>\n```\n\n```\nmerge:\n  advisor:\n    suggestIntegrationBranchWhen:\n      filesTouched: 25\n      protectedPaths: true\n      behindMain: 50\n```\n\n```\ncd ../.vibestrate-worktrees/<runId>\ngh pr create      # review by a human\ngit push          # just share the branch\n```\n\n```\ngit checkout main\ngit merge --ff-only vibestrate/<runId>\n```\n\n```\nvibe abort <runId>\n# the worktree is preserved for inspection;\n# remove it when you're done\n```"
    },
    {
      "id": "docs/workflows/debug-failed",
      "kind": "doc",
      "title": "Debug a failed run",
      "source": "Vibestrate docs: workflows/debug-failed",
      "summary": "How to figure out why a run ended in failed or blocked, and what to do next.",
      "titleTerms": "a debug fail run",
      "terms": "20 a advanc after and api architect architectur artifact authenticat automat block bug cd chang clean cli cod command creat debug debug-fail decis deeper did diff do doesn drop dry dry-run earlier end event every execut exist fail figur fil find first fix flow from get git going housekeep how id if in instead is it json just keep know list look main md miss ndjson new newest next not noth of old or orphan out output over per per-phas permiss phas plan post preview project provider prun re re-run ref referenc relat replay requir restart restor restore-preview resum resume-from resume-stag retent reus review rewind rul run run-id s sam scop seed sharpen simpl skill snapshot sourc stag start stat statu stderr stdout step step-id t task teach test the thi tighten tip to unsaf validat verificat verify vib vibestrat what when wher why with without word workflow worktre y yml you",
      "body": "## In simple words\n\nWhen a task does not finish cleanly, this guide helps you find out why.\n\nStart by reading the status, because `failed` and `blocked` mean different things and need different responses:\n\n**failed** A step crashed. Read that step's own output - it says what broke.\n\n**blocked** Something refused: a review, a policy, or a failed check. Read the decision.\n\n**Tip.** `vibe replay ` is the fastest first move for either. It reopens the finished run with every decision, output and artifact in place, so you are reading what happened rather than reconstructing it.\n\n## Where to look\n\n**The failing step's output** For `failed`. Usually a stack trace or a command that exited non-zero.\n\n**The review finding** For `blocked` on review. It says what it objected to and why.\n\n### Start with `replay`\n\n```\nvibe replay <runId>\n```\n\n### Re-run after fixing\n\n```\ncd .vibestrate/runs\ndiff <oldRunId>/artifacts/flows/plan/output.md \\\n     <newRunId>/artifacts/flows/plan/output.md\n```\n\n### Rewind instead of restarting\n\n```\n# executing     reuse plan + architecture\n# architecting  reuse just the plan\n# planning      seed nothing, start over\nvibe run \"<same task>\" --resume-from <oldRunId> \\\n  --resume-stage executing\n```\n\n### Rewinding to review, fix, or verify (restores the run's code)\n\n```\nvibe run \"<same task>\" --resume-from <oldRunId> \\\n  --resume-stage reviewing --preview\n```\n\n### Housekeeping: pruning snapshots\n\n```\nvibe runs prune                # orphans\nvibe runs prune --keep 20      # keep newest 20\nvibe runs prune --run <id>     # just this run\nvibe runs prune --orphans --dry-run   # preview\n```"
    },
    {
      "id": "docs/workflows/git-tree-merge",
      "kind": "doc",
      "title": "Merge from the git tree",
      "source": "Vibestrate docs: workflows/git-tree-merge",
      "summary": "Explore your branches as a graph, predict a merge before you apply it, let the supervisor resolve conflicts, and undo with one click.",
      "titleTerms": "from git merg the tre",
      "terms": "a add advanc advis already and apply as ask automat befor branch chang clean cli click commit confirmat conflict dat deeper did do doe down env every explor ff fil finish for git git-tree-merg going good graph guid head her history id if in inspect integrat into is it know last let log main merg mind mov need never no no-ff not of one only open or path predict propos push read read-only redact remov resolv run run-id see shap simpl sourc supervisor target the thi tip to token tre typ undo up vib what whol with word workflow would you your",
      "body": "## In simple words\n\nWhen you want to fold one branch into another - a finished run's branch into `main`, or two pieces of work together - the **Git tree** turns it into something you can see before you do it.\n\n```\nvibe integrate advise <run-id>   # read-only: what would merging this do?\nvibe integrate apply <run-id> --into integration/logging\nvibe integrate finish --into main   # needs a typed confirmation token\n```\n\n**Tip.** Look before you merge. The tree shows you the shape of what you are about to combine, which is a far better basis for a decision than a branch name and hope.\n\n## What it is good for\n\n**Seeing the shape** Which branches exist, where they forked, what is ahead of what.\n\n**Reading a commit** Before deciding whether you want it.\n\n**Predicting a merge** What would happen, before it happens.\n\n**Undoing one** There is a real revert path, not just advice to be careful.\n\n**Did you know?** The merge advisor is read-only. It reads the run's branch and recommends one of three routes - finish now, stage on an integration branch, or leave it - and changes nothing. Merging is a separate command, and finishing into `main` needs a typed confirmation token."
    },
    {
      "id": "docs/workflows/inspect-progress",
      "kind": "doc",
      "title": "Inspect a run in flight",
      "source": "Vibestrate docs: workflows/inspect-progress",
      "summary": "Where to watch a run as it happens, and where every detail is saved.",
      "titleTerms": "a flight in inspect run",
      "terms": "a act advanc and append append-only artifact as automat bold bold-lovelac broker chang cli cod command cost creat current dashboard decis deeper deni detail did disk durat event every execut exit fil flow follow for going happen id in inspect inspect-progress is it jq json know liv log lovelac main md merg merge_ready messag metric n ndjson new on one only open output participant past per plan profil progress prompt provider r raw read ready relat replay resolv respons result review rol run runtim runtime-metric s sav seat select simpl snapshot sourc stat statu stderr stdout step step-id stream termin the thi timelin tip to token transit txt typ ui validat validation-result verdict verificat verify vib vibestrat watch wher word workflow you",
      "body": "## In simple words\n\nWhile Vibestrate is working you can watch it. Three places to look, depending on what you want.\n\n**The terminal** `vibe logs` for a quick glance at what step it is on.\n\n**The dashboard** The full live picture: steps ticking over, tokens, spend, the diff so far.\n\n**The files on disk** The complete record, readable at any time, including long after the run.\n\n**Tip.** You do not have to watch. The run does the same thing either way, and the record is written as it happens rather than at the end - so walking away costs you nothing you cannot read back later.\n\n### The terminal\n\n```\nvibe logs <runId> --follow\n```\n\n### The files on disk\n\n```\n.vibestrate/runs/bold-lovelace/\n  state.json            current status, transitions\n  events.ndjson         every event, append-only\n  actions.ndjson        brokered action + verdict\n  runtime-metrics.json  tokens, durations, costs\n  flow.json             the resolved flow snapshot\n  participants.json     role + profile per seat\n  streams/              raw provider output\n  artifacts/flows/<step-id>/\n```\n\n```\nartifacts/flows/<step-id>/\n  prompt.md                the prompt for this step\n  output.md                the provider's response\n  validation-results.json  commands run + exit codes\n  validation/              one file per command\n    <n>-<command>.stdout.txt\n    <n>-<command>.stderr.txt\n```\n\n```\njq -r 'select(.type==\"state.changed\").message' \\\n  .vibestrate/runs/bold-lovelace/events.ndjson\n```\n\n```\ncreated → planning\nplanning → planned\n...\nverifying → merge_ready\n```\n\n### Read past runs\n\n```\nvibe replay <runId>\n```"
    },
    {
      "id": "docs/workflows/pause-resume",
      "kind": "doc",
      "title": "Pause, resume, abort",
      "source": "Vibestrate docs: workflows/pause-resume",
      "summary": "How to safely stop a run, bring it back later, or end it for good.",
      "titleTerms": "abort paus resum",
      "terms": "a abort advanc and approv are at automat back befor block branch bring cancel cd chang cli d deeper did different end fir for from gat git going good guidanc how human human_approv id in is it know later let list max next on or pau paus pause-resum pick point policy policy-gat project refus reject remov request request-chang requir resum resume-from round run run-id saf safely simpl someth stag statu stop the thre tip to up vib vibestrat vibestrate-worktre vs wait waiting_for_approv way what when wher word workflow worktre you your your-project",
      "body": "## In simple words\n\nSometimes you want to stop a run, look at where it got to, and pick it up later.\n\n```\nvibe pause <run-id>     # stops at the next safe point\nvibe resume <run-id>    # picks up where it stopped\n```\n\nPausing sticks. The flag is written to your project, not held in memory, so it survives anything restarting.\n\n**Tip.** Pause is not abort. A paused run keeps its worktree, its branch and everything it had done, and resuming continues rather than starting over. Abort is the one that ends it.\n\n## The three ways a run stops\n\n**You paused it** Status `paused`. Resume clears the flag and it continues.\n\n**It is waiting on you** Status `waiting_for_approval`. An approval gate wants a human.\n\n**Something refused** Status `blocked`. A policy, review or check said no.\n\n**Did you know?** Because the pause flag is a file rather than process state, a pause you requested survives closing your laptop, restarting the dashboard, or the machine rebooting. A run cannot quietly resume because something restarted.\n\n### Pause\n\nTo pause a run, give Vibestrate the run's ID:\n\n```\nvibe pause <runId>\n```\n\n### Resume\n\n```\nvibe resume <runId>\n```\n\n### Abort\n\n```\nvibe abort <runId>\n```\n\n```\ncd your-project\ngit worktree remove ../.vibestrate-worktrees/<runId>\ngit branch -D vibestrate/<runId>\n```\n\n### Policy-gated pauses are different\n\n```\nvibe approvals list <runId>\nvibe approvals approve <runId> <approvalId>\nvibe approvals reject <runId> <approvalId>\nvibe approvals request-changes \\\n  <runId> <approvalId> --guidance \"what to change\"\n```"
    }
  ]
};

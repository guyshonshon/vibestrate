import { z } from "zod";

/**
 * The one bound on a run's task text. Every entry point (CLI run spec, server
 * routes, resolved-flow snapshot) imports THIS schema - the cap lives in one
 * place so the boundaries cannot drift apart again (they did: six copies of a
 * 2000-char literal).
 *
 * 65,536 because that is GitHub's own issue-body limit: a user pasting a real
 * issue verbatim is the canonical long task, and it must fit by construction.
 * A benchmark run against SWE-bench Verified found real issues at ~2,300 chars
 * being refused at the old cap - a first-contact failure on ordinary input.
 * The bound still fails fast on absurd input (megabytes of piped logs).
 */
export const taskTextSchema = z.string().min(1).max(65_536);

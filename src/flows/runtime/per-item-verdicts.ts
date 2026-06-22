import { runChecklistItemArbitrationPath } from "../../utils/paths.js";
import { pathExists } from "../../utils/fs.js";
import { readJson } from "../../utils/json.js";
import {
  flowArbitrationLedgerSchema,
  type FlowArbitrationLedger,
} from "./flow-arbitration.js";

export type PerItemVerdict = {
  itemIndex: number;
  verdict: "approved" | "changes_requested" | "none";
  openFindingCount: number;
};

// Only "resolved" means closed in flowFindingResolutionDispositionSchema.
// "still-open", "invalid-finding", "needs-human" are all open/unresolved.
const RESOLVED_DISPOSITIONS = new Set(["resolved"]);

export function deriveItemVerdict(
  ledger: FlowArbitrationLedger | null,
): PerItemVerdict["verdict"] {
  const rec = ledger?.decision?.output;
  if (!rec) return "none";
  // Real schema field is `recommendation`, not `verdict`/`disposition`.
  // "merge-ready" -> approved; "changes-requested" | "blocked" -> changes_requested;
  // "needs-human" -> none.
  const r = rec.recommendation;
  if (r === "merge-ready") return "approved";
  if (r === "changes-requested" || r === "blocked") return "changes_requested";
  return "none";
}

export function openFindingCount(ledger: FlowArbitrationLedger | null): number {
  if (!ledger) return 0;
  const resolved = new Set(
    ledger.resolutions
      .filter((r) =>
        RESOLVED_DISPOSITIONS.has(
          String(
            (r.resolution as { disposition?: string }).disposition ?? "",
          ),
        ),
      )
      .map(
        (r) =>
          (r.resolution as { findingId: string }).findingId,
      ),
  );
  return ledger.findings.filter((f) => !resolved.has(f.finding.id)).length;
}

export async function collectPerItemVerdicts(input: {
  projectRoot: string;
  runId: string;
  itemCount: number;
}): Promise<PerItemVerdict[]> {
  const out: PerItemVerdict[] = [];
  for (let i = 0; i < input.itemCount; i++) {
    const p = runChecklistItemArbitrationPath(
      input.projectRoot,
      input.runId,
      i,
    );
    let ledger: FlowArbitrationLedger | null = null;
    if (await pathExists(p)) {
      ledger = flowArbitrationLedgerSchema.parse(await readJson<unknown>(p));
    }
    out.push({
      itemIndex: i,
      verdict: deriveItemVerdict(ledger),
      openFindingCount: openFindingCount(ledger),
    });
  }
  return out;
}

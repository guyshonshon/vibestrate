import { detectProject } from "../../../project/project-detector.js";
import {
  draftFlowFromDescription,
  type FlowDraft,
} from "../../../flows/authoring/flow-assist.js";
import { color, header, indent, symbol } from "../../ui/format.js";

/**
 * Print what the model checked with its own tools and what it could not.
 *
 * BOTH lists print ALWAYS, including when empty. Currency is model self-report -
 * nothing in the product can verify it, and Vibestrate opens no socket to try -
 * so an empty "could not verify" must read as a claim the agent made, not as
 * silence. Shared with `vibe crew draft` (crew.ts) so the two drafting surfaces
 * report it identically, mirroring the single `currencySchema` the two assist
 * services share.
 *
 * `write` is the sink: stdout normally, stderr in --yaml mode so the piped
 * document stays clean while the warning still reaches the terminal.
 */
export function printCurrency(
  currency: { checked: string[]; unverified: string[] },
  write: (line: string) => void = console.log,
): void {
  write("");
  write(color.bold("Could not verify"));
  if (currency.unverified.length === 0) {
    write(indent(color.dim("(the agent reported nothing unverified)")));
  } else {
    for (const item of currency.unverified) {
      write(indent(`${symbol.warn()} ${item}`));
    }
  }
  write("");
  write(color.bold("Checked"));
  if (currency.checked.length === 0) {
    write(indent(color.dim("(nothing needed a current fact)")));
  } else {
    for (const item of currency.checked) {
      write(indent(`${symbol.ok()} ${item}`));
    }
  }
}

/**
 * Turn an English description into an editable Flow draft.
 *
 * DRAFT ONLY - this command writes nothing. The draft carries the canonical YAML
 * that accepting it would write; adopting it is the separate, explicit
 * `vibe flows import` (or the dashboard's create action). `--yaml` exists so the
 * owner pipes the document to a file they can read and edit before importing,
 * which keeps drafting write-free by construction.
 */
export async function runFlowsDraft(
  description: string,
  opts: { crew?: string; yaml?: boolean; json?: boolean } = {},
): Promise<number> {
  const detected = await detectProject(process.cwd());
  const { draft } = await draftFlowFromDescription({
    projectRoot: detected.projectRoot,
    description,
    crewId: opts.crew ?? null,
  });

  if (opts.json) {
    console.log(JSON.stringify({ draft }, null, 2));
    return 0;
  }

  if (opts.yaml) {
    // The document goes to stdout alone so `--yaml > flow.yml` produces a file
    // the importer accepts; the currency report goes to stderr so redirecting
    // never hides what the agent could not check.
    const err = (line: string) => process.stderr.write(`${line}\n`);
    process.stdout.write(draft.yaml.endsWith("\n") ? draft.yaml : `${draft.yaml}\n`);
    printCurrency(draft.currency, err);
    err(
      `\n${color.dim("Nothing was written. Adopt the file with ")}${color.bold("vibe flows import <file>")}${color.dim(".")}`,
    );
    return 0;
  }

  printFlowDraft(draft);
  return 0;
}

function printFlowDraft(draft: FlowDraft): void {
  const flow = draft.flow;
  console.log(header(`Draft flow: ${flow.label}`));
  console.log(indent(color.dim(`id: ${flow.id}`)));
  console.log(indent(color.dim(`version: ${flow.version}`)));
  console.log(
    indent(
      color.dim(`would save to: ${draft.targetPath}`) +
        (draft.exists ? color.yellow(" (exists - importing needs --overwrite)") : ""),
    ),
  );
  console.log("");
  console.log(flow.description);

  console.log("");
  console.log(color.bold("Seats"));
  for (const [seatId, seat] of Object.entries(flow.seats)) {
    console.log(
      indent(
        `${seatId}: ${seat.label}${seat.description ? color.dim(` - ${seat.description}`) : ""}`,
      ),
    );
  }

  console.log("");
  console.log(color.bold("Steps"));
  for (const [index, step] of flow.steps.entries()) {
    const seat = step.seat ? ` seat ${step.seat}` : "";
    const needs = step.needs?.length ? ` ${color.dim(`needs ${step.needs.join(", ")}`)}` : "";
    console.log(
      indent(
        `${index + 1}. ${step.id}: ${step.label} ${color.dim(`(${step.kind}${seat} · ${step.stage})`)}${needs}`,
      ),
    );
  }

  // Seat coverage is computed locally against the target crew - no model
  // involved. A gap is not a rejected draft: the owner may be about to add the
  // role, so it is shown and the draft still stands.
  const cov = draft.coverage;
  console.log("");
  console.log(
    `${color.bold("Coverage")} ${color.dim(`(crew: ${cov.crewId})`)} ${
      cov.runnable ? color.dim("- runnable") : color.yellow("- has gaps")
    }`,
  );
  for (const seat of cov.seats) {
    const mark =
      seat.status === "filled"
        ? symbol.ok()
        : seat.status === "gap"
          ? symbol.fail()
          : symbol.arrow();
    const detail =
      seat.status === "filled"
        ? color.dim(seat.resolvedRoleId ?? "")
        : seat.status === "ambiguous"
          ? color.dim(`ambiguous: ${seat.candidateRoleIds.join(", ")}`)
          : color.dim("no role fills this seat");
    const unused = seat.usedByStep ? "" : color.dim(" (unused)");
    console.log(indent(`${mark} ${seat.seatId}  ${detail}${unused}`));
  }

  console.log("");
  console.log(color.bold("Rationale"));
  console.log(indent(draft.rationale));

  printCurrency(draft.currency);

  console.log("");
  console.log(color.dim("Nothing was written. Review it, then:"));
  console.log(indent(color.bold(`vibe flows draft "…" --yaml > ${flow.id}.yml`)));
  console.log(indent(color.bold(`vibe flows import ${flow.id}.yml`)));
}

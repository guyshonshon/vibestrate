import { detectAllProviders } from "../../../providers/provider-detection.js";
import { color, header, indent, symbol } from "../../ui/format.js";

export async function runProviderDetect(opts: { json?: boolean }): Promise<number> {
  const detections = await detectAllProviders();

  if (opts.json) {
    console.log(JSON.stringify(detections, null, 2));
    return 0;
  }

  console.log(header("Detected local coding CLIs:"));
  console.log("");
  for (const d of detections) {
    if (d.confidence === "ready") {
      console.log(
        `${symbol.ok()} ${color.bold(d.label)} — ready`,
      );
      console.log(indent(`Command: ${d.command}${d.version ? ` (v${d.version})` : ""}`));
      for (const note of d.notes) console.log(indent(color.dim(note)));
    } else if (d.confidence === "detected-needs-setup") {
      console.log(`${symbol.warn()} ${color.bold(d.label)} — detected, needs setup`);
      console.log(indent(`Command: ${d.command}${d.version ? ` (v${d.version})` : ""}`));
      for (const note of d.notes) console.log(indent(color.dim(note)));
    } else {
      console.log(`${color.dim("○")} ${d.label} — not found`);
      console.log(indent(color.dim(`Command tried: ${d.command}`)));
      for (const note of d.notes) console.log(indent(color.dim(note)));
    }
    console.log("");
  }
  console.log(
    color.dim(
      "Tip: run `vibestrate provider setup` to configure or `vibestrate provider set <id>` after setup.",
    ),
  );
  return 0;
}

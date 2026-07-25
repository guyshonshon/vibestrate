import { describe, it, expect } from "vitest";
import { buildLedgerCommand } from "../src/cli/commands/ledger.js";

describe("vibe ledger command wiring", () => {
  it("registers the top-level command plus an add subcommand", () => {
    const cmd = buildLedgerCommand();
    expect(cmd.name()).toBe("ledger");
    const names = cmd.commands.map((c) => c.name());
    expect(names).toContain("add");
  });

  it("add requires --kind and --title, and accepts --detail/--tags/--status/--json", () => {
    const add = buildLedgerCommand().commands.find((c) => c.name() === "add");
    const required = add?.options.filter((o) => o.mandatory).map((o) => o.long);
    expect(required).toEqual(expect.arrayContaining(["--kind", "--title"]));
    expect(add?.options.map((o) => o.long)).toEqual(
      expect.arrayContaining(["--kind", "--title", "--detail", "--tags", "--status", "--json"]),
    );
  });
});

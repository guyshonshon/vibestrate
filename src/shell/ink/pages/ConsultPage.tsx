import React, { useEffect, useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import {
  listManualProposals,
  applyManualProposal,
  rejectManualProposal,
  type ManualProposal,
} from "../../../project/manual-proposals.js";
import { ACCENT, ACCENT_BRIGHT } from "../theme.js";
import { SelectionMark } from "../components/visuals.js";

type Props = {
  projectRoot: string;
  onToast: (kind: "ok" | "err" | "info", message: string) => void;
  selectedIndex: number;
  setSelectedIndex: (i: number) => void;
  active: boolean;
};

/**
 * Shell Consult surface. Asking a question flows through the command prompt
 * (`consult "..."` runs the real CLI with rendered output + autocomplete); this
 * page is the keyboard-driven review of VIBESTRATE.md proposals consult produced
 * - apply or reject them without leaving the shell.
 */
export function ConsultPage({
  projectRoot,
  onToast,
  selectedIndex,
  setSelectedIndex,
  active,
}: Props) {
  const [proposals, setProposals] = useState<ManualProposal[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const list = await listManualProposals(projectRoot, { status: "open" }).catch(() => []);
    setProposals(list);
  }, [projectRoot]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const idx = Math.min(selectedIndex, Math.max(0, proposals.length - 1));
  const selected = proposals[idx] ?? null;

  async function mutate(fn: () => Promise<unknown>, okMsg: string) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      onToast("ok", okMsg);
      await refresh();
    } catch (err) {
      onToast("err", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  useInput(
    (input, key) => {
      if (!active) return;
      if (key.upArrow || input === "k") {
        setSelectedIndex(Math.max(0, idx - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setSelectedIndex(Math.min(proposals.length - 1, idx + 1));
        return;
      }
      if (input === "r") {
        void refresh();
        return;
      }
      if (!selected) return;
      if (input === "a") {
        void mutate(
          () => applyManualProposal(projectRoot, selected.id),
          `Applied ${selected.id} - review the VIBESTRATE.md diff before committing.`,
        );
      } else if (input === "x") {
        void mutate(() => rejectManualProposal(projectRoot, selected.id), `Rejected ${selected.id}.`);
      }
    },
    { isActive: active },
  );

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text>
        Ask the orchestrator from the prompt:{" "}
        <Text color={ACCENT}>consult "should this use a heavier review?"</Text>
      </Text>
      <Text dimColor>
        It answers from VIBESTRATE.md + config + recent runs (read-only). Proposed
        manual updates land here for review.
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text color={ACCENT_BRIGHT}>Proposed VIBESTRATE.md updates ({proposals.length})</Text>
        {proposals.length === 0 ? (
          <Text dimColor>None. A consult that proposes a manual update adds it here.</Text>
        ) : (
          proposals.map((p, i) => (
            <Text key={p.id} color={i === idx ? ACCENT : undefined}>
              <SelectionMark selected={i === idx} /> {p.id} <Text dimColor>- {p.rationale}</Text>
            </Text>
          ))
        )}
      </Box>
      {selected ? (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>why: {selected.rationale}</Text>
          {selected.evidence ? <Text dimColor>evidence: {selected.evidence}</Text> : null}
          <Box marginTop={1}>
            <Text>{selected.suggestedText.trim()}</Text>
          </Box>
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Text dimColor>
          <Text color={ACCENT}>↑↓/jk</Text> move · <Text color={ACCENT}>a</Text> apply ·{" "}
          <Text color={ACCENT}>x</Text> reject · <Text color={ACCENT}>r</Text> refresh
        </Text>
      </Box>
    </Box>
  );
}

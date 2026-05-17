import React from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { applyDoctorFixes } from "../../../setup/doctor-service.js";
import type { DoctorReport } from "../../../setup/doctor-service.js";
import { clip } from "../theme.js";

type Props = {
  projectRoot: string;
  report: DoctorReport | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  onToast: (kind: "ok" | "err" | "info", message: string) => void;
  active: boolean;
};

export function DoctorPage({
  projectRoot,
  report,
  loading,
  error,
  refresh,
  onToast,
  active,
}: Props) {
  useInput(
    (input) => {
      if (!active) return;
      if (input === "r" || input === "R") {
        void refresh().then(() => onToast("ok", "doctor refreshed."));
        return;
      }
      if (input === "f" || input === "F") {
        void applyDoctorFixes({ projectRoot }).then(async (r) => {
          onToast("ok", `Applied ${r.applied.length} fix(es).`);
          await refresh();
        });
      }
    },
    { isActive: active },
  );

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold color="cyan">
          DOCTOR
        </Text>
        {loading ? (
          <Text dimColor>
            {"   "}
            <Spinner type="dots" />
            <Text> scanning…</Text>
          </Text>
        ) : report ? (
          <Text dimColor>
            {"   "}
            {countBySeverity(report).ok} ok ·{" "}
            <Text color="yellow">
              {countBySeverity(report).warn} warn
            </Text>{" "}
            ·{" "}
            <Text color="red">{countBySeverity(report).fail} fail</Text>
          </Text>
        ) : null}
      </Box>

      {error ? (
        <Box marginTop={1}>
          <Text color="red">doctor failed: {error}</Text>
        </Box>
      ) : null}

      {report ? (
        <Box marginTop={1} flexDirection="column">
          {report.findings.slice(0, 14).map((f) => (
            <Box key={f.id}>
              <Text>
                <Text color={severityColor(f.severity)}>
                  {severityGlyph(f.severity)}
                </Text>
                <Text>  {clip(f.title, 70)}</Text>
              </Text>
            </Box>
          ))}
          {report.findings.length > 14 ? (
            <Text dimColor>+ {report.findings.length - 14} more</Text>
          ) : null}
          {report.recommendedNextSteps.length > 0 ? (
            <Box marginTop={1} flexDirection="column">
              <Text dimColor>next steps</Text>
              {report.recommendedNextSteps.slice(0, 4).map((s, i) => (
                <Text key={i}>
                  <Text color="cyan">→</Text> {clip(s, 80)}
                </Text>
              ))}
            </Box>
          ) : null}
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Text dimColor>
          <Text color="cyan">r</Text> rerun · <Text color="cyan">f</Text> apply safe fixes
        </Text>
      </Box>
    </Box>
  );
}

function countBySeverity(report: DoctorReport): {
  ok: number;
  warn: number;
  fail: number;
} {
  return report.findings.reduce(
    (acc, f) => {
      if (f.severity === "ok") acc.ok += 1;
      else if (f.severity === "warn") acc.warn += 1;
      else acc.fail += 1;
      return acc;
    },
    { ok: 0, warn: 0, fail: 0 },
  );
}

function severityColor(s: string): "green" | "yellow" | "red" | undefined {
  if (s === "ok") return "green";
  if (s === "warn") return "yellow";
  if (s === "fail") return "red";
  return undefined;
}
function severityGlyph(s: string): string {
  if (s === "ok") return "✓";
  if (s === "warn") return "!";
  if (s === "fail") return "✗";
  return "·";
}

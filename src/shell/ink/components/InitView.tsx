import React from "react";
import { Box, Text } from "ink";
import { ACCENT, ACCENT_BRIGHT, ACCENT_DIM } from "../theme.js";

/**
 * First-run gate for the shell: shown when the project has no `.vibestrate/`.
 * Parity with the dashboard's onboarding - press `i` to initialize in place
 * (runs `vibe init`); the view clears itself once the config loads.
 */
export function InitView({
  projectName,
  running,
  error,
}: {
  projectName: string;
  running: boolean;
  error: string | null;
}) {
  return (
    <Box flexDirection="column" alignItems="center" paddingY={2}>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={ACCENT_DIM}
        paddingX={4}
        paddingY={2}
        width={64}
      >
        <Text>
          <Text bold color={ACCENT_BRIGHT}>
            Welcome to Vibestrate
          </Text>
        </Text>
        <Box marginTop={1}>
          <Text color="gray">
            The local-first way to supervise AI coding flows.{" "}
            <Text color="white">{projectName}</Text> isn't set up yet - it stays
            entirely on your machine.
          </Text>
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Text color="gray">Initializing creates:</Text>
          <Text color="gray">
            {"  "}.vibestrate/ - config, crew, roles, and flows
          </Text>
          <Text color="gray">
            {"  "}a default crew + flow, with your detected providers
          </Text>
        </Box>

        <Box marginTop={1}>
          {running ? (
            <Text color={ACCENT}>Setting up your project…</Text>
          ) : (
            <Text>
              <Text color={ACCENT}>i</Text>
              <Text color="gray"> initialize</Text>
              <Text color="gray"> · </Text>
              <Text color={ACCENT}>q</Text>
              <Text color="gray"> quit</Text>
            </Text>
          )}
        </Box>

        {error && !running ? (
          <Box marginTop={1}>
            <Text color="yellow" wrap="wrap">
              {error}
            </Text>
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}

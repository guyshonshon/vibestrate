import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { CARD_PROPS } from "../theme.js";

type Props = {
  projectRoot: string;
};

/**
 * Shown for the brief window between the panel mounting and the first
 * on-disk snapshot landing. Cards-and-chrome instead of a bare "loading"
 * line so the first frame already feels like the product, not a stub.
 */
export function LoadingScreen({ projectRoot }: Props) {
  return (
    <Box flexDirection="column">
      <Box {...CARD_PROPS} borderColor="cyan" flexDirection="column">
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> </Text>
          <Text bold>reading project state</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>
            scanning runs, queue, scheduler, roadmap and event logs.
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>{projectRoot}</Text>
        </Box>
      </Box>
      <Box marginTop={1} flexDirection="row" gap={1}>
        <Skeleton title="active" />
        <Skeleton title="queue" />
        <Skeleton title="approvals" />
        <Skeleton title="suggestions" />
        <Skeleton title="scheduler" />
      </Box>
      <Box marginTop={1} flexDirection="row" gap={1}>
        <Skeleton title="active runs" lines={3} grow />
        <Skeleton title="recent activity" lines={3} grow />
      </Box>
    </Box>
  );
}

function Skeleton({
  title,
  lines = 1,
  grow,
}: {
  title: string;
  lines?: number;
  grow?: boolean;
}) {
  return (
    <Box
      {...CARD_PROPS}
      flexDirection="column"
      flexBasis={0}
      flexGrow={grow ? 1 : 1}
    >
      <Text dimColor>{title}</Text>
      <Box marginTop={1} flexDirection="column">
        {Array.from({ length: lines }).map((_, i) => (
          <Text key={i} dimColor>
            ░░░░░░░░░░░░░░░
          </Text>
        ))}
      </Box>
    </Box>
  );
}

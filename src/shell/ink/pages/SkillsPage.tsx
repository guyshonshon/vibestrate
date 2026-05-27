import React from "react";
import { Box, Text, useInput } from "ink";
import type { DiscoveredSkill } from "../../../skills/skill-discovery.js";
import type { SkillAssignmentSummary } from "../../../skills/skill-assignment-service.js";
import {
  assignSkillToRole,
  unassignSkillFromRole,
} from "../../../skills/skill-assignment-service.js";
import { builtinRoleIds } from "../../../roles/role-schema.js";
import { clip } from "../theme.js";
import { SelectionMark } from "../components/visuals.js";

type Props = {
  projectRoot: string;
  skills: DiscoveredSkill[];
  assignments: SkillAssignmentSummary[];
  refresh: () => Promise<void>;
  onToast: (kind: "ok" | "err" | "info", message: string) => void;
  selectedIndex: number;
  setSelectedIndex: (i: number) => void;
  active: boolean;
};

const AGENTS: readonly string[] = builtinRoleIds;

export function SkillsPage({
  projectRoot,
  skills,
  assignments,
  refresh,
  onToast,
  selectedIndex,
  setSelectedIndex,
  active,
}: Props) {
  const [roleCursor, setRoleCursor] = React.useState(0);
  const idx = Math.max(0, Math.min(skills.length - 1, selectedIndex));
  const selected = skills[idx] ?? null;
  const roleIdx = Math.max(0, Math.min(AGENTS.length - 1, roleCursor));
  const focusedRole = AGENTS[roleIdx]!;

  const isAssigned = (roleId: string, name: string): boolean => {
    const row = assignments.find((a) => a.roleId === roleId);
    return row ? row.skills.includes(name) : false;
  };

  const toggle = async (): Promise<void> => {
    if (!selected) return;
    const on = isAssigned(focusedRole, selected.name);
    try {
      if (on) {
        await unassignSkillFromRole(projectRoot, focusedRole, selected.name);
        onToast("ok", `Unassigned ${selected.name} from ${focusedRole}.`);
      } else {
        await assignSkillToRole(projectRoot, focusedRole, selected.name);
        onToast("ok", `Assigned ${selected.name} to ${focusedRole}.`);
      }
      await refresh();
    } catch (err) {
      onToast(
        "err",
        err instanceof Error ? err.message : String(err),
      );
    }
  };

  useInput(
    (input, key) => {
      if (!active) return;
      if (key.upArrow || input === "k") {
        setSelectedIndex(Math.max(0, idx - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setSelectedIndex(Math.min(skills.length - 1, idx + 1));
        return;
      }
      if (key.leftArrow || input === "h") {
        setRoleCursor(Math.max(0, roleIdx - 1));
        return;
      }
      if (key.rightArrow || input === "l") {
        setRoleCursor(Math.min(AGENTS.length - 1, roleIdx + 1));
        return;
      }
      if (key.return || input === " ") {
        void toggle();
      }
    },
    { isActive: active },
  );

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">
        SKILLS
        <Text dimColor>   ({skills.length} discovered)</Text>
      </Text>
      <Box marginTop={1} flexDirection="row" gap={2}>
        <Box flexDirection="column" minWidth={36}>
          {skills.length === 0 ? (
            <Text dimColor>
              no skills found in <Text color="cyan">.amaco/skills</Text> or{" "}
              <Text color="cyan">.claude/skills</Text>
            </Text>
          ) : (
            skills.slice(0, 12).map((s, i) => {
              const mcpCount = Object.keys(s.mcpServers).length;
              return (
                <Box key={s.id}>
                  <SelectionMark selected={i === idx} />
                  <Text>
                    <Text bold={i === idx}>{clip(s.name, 22).padEnd(22)}</Text>
                    <Text dimColor>  {s.source.padEnd(6)}</Text>
                    {mcpCount > 0 ? (
                      <Text color="magenta">  {mcpCount} mcp</Text>
                    ) : null}
                    {s.mcpError ? (
                      <Text color="yellow">  .mcp err</Text>
                    ) : null}
                  </Text>
                </Box>
              );
            })
          )}
          {skills.length > 12 ? (
            <Text dimColor>+ {skills.length - 12} more</Text>
          ) : null}
        </Box>
        {selected ? (
          <Box flexDirection="column" flexGrow={1}>
            <Text bold color="cyan">
              {selected.name}
            </Text>
            {selected.description ? (
              <Text dimColor>{selected.description}</Text>
            ) : null}
            <Box marginTop={1} flexDirection="column">
              <Text>
                <Text dimColor>source       </Text>
                <Text>{selected.source}</Text>
              </Text>
              <Text>
                <Text dimColor>file         </Text>
                <Text>{selected.filePath}</Text>
              </Text>
              {Object.keys(selected.mcpServers).length > 0 ? (
                <Text>
                  <Text dimColor>mcp servers  </Text>
                  <Text>{Object.keys(selected.mcpServers).join(", ")}</Text>
                </Text>
              ) : null}
              {selected.mcpError ? (
                <Text>
                  <Text dimColor>mcp error    </Text>
                  <Text color="yellow">{selected.mcpError}</Text>
                </Text>
              ) : null}
            </Box>
            <Box marginTop={1} flexDirection="column">
              <Text dimColor>assigned to (←→ to focus · Enter to toggle)</Text>
              <Box flexWrap="wrap">
                <Text>
                  {AGENTS.map((id, i) => {
                    const on = isAssigned(id, selected.name);
                    const focused = i === roleIdx;
                    return (
                      <React.Fragment key={id}>
                        {i > 0 ? <Text dimColor>   </Text> : null}
                        {focused ? (
                          <Text color="black" backgroundColor="cyan" bold>
                            {" "}
                            {on ? "✓" : "·"} {id}
                            {" "}
                          </Text>
                        ) : (
                          <Text>
                            <Text color={on ? "green" : "gray"}>
                              {on ? "✓" : "·"}
                            </Text>
                            <Text dimColor> {id}</Text>
                          </Text>
                        )}
                      </React.Fragment>
                    );
                  })}
                </Text>
              </Box>
            </Box>
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}

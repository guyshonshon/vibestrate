import { z } from "zod";
import type { McpServersMap } from "../mcp/mcp-schema.js";

export const skillReferenceSchema = z
  .string()
  .min(1)
  .regex(/^[a-zA-Z0-9._-]+$/, "Skill names may only contain letters, digits, dot, dash, underscore.");

export type SkillReference = z.infer<typeof skillReferenceSchema>;

export type LoadedSkill = {
  name: string;
  filePath: string;
  content: string;
  mcpServers: McpServersMap;
};

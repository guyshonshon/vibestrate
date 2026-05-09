import { z } from "zod";
import { prioritySchema, safeIdSchema } from "../roadmap/roadmap-types.js";

export const queueEntrySchema = z.object({
  taskId: safeIdSchema,
  enqueuedAt: z.string(),
  priority: prioritySchema.default("medium"),
});
export type QueueEntry = z.infer<typeof queueEntrySchema>;

export const queueFileSchema = z.object({
  entries: z.array(queueEntrySchema).default([]),
});
export type QueueFile = z.infer<typeof queueFileSchema>;

export const schedulerStateSchema = z.object({
  paused: z.boolean().default(false),
  runningTaskIds: z.array(safeIdSchema).default([]),
  lastUpdatedAt: z.string(),
  // Snapshot of the policy at the time the loop started, so the UI can read
  // it without re-loading project config.
  maxConcurrentRuns: z.number().int().min(1).default(1),
  conflictPolicy: z.enum(["warn", "block"]).default("warn"),
  queuePolicy: z.enum(["fifo", "priority"]).default("fifo"),
});
export type SchedulerState = z.infer<typeof schedulerStateSchema>;

export const conflictWarningSchema = z.object({
  id: z.string(),
  taskId: safeIdSchema,
  conflictsWith: z.array(safeIdSchema),
  overlappingFiles: z.array(z.string()),
  policy: z.enum(["warn", "block"]),
  blocked: z.boolean(),
  createdAt: z.string(),
});
export type ConflictWarning = z.infer<typeof conflictWarningSchema>;

export const conflictsFileSchema = z.object({
  warnings: z.array(conflictWarningSchema).default([]),
});
export type ConflictsFile = z.infer<typeof conflictsFileSchema>;

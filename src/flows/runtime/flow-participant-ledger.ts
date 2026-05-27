import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pathExists } from "../../utils/fs.js";
import { readJson, writeJson } from "../../utils/json.js";
import { runFlowParticipantsPath } from "../../utils/paths.js";
import { nowIso } from "../../utils/time.js";
import type {
  ProviderCapabilities,
  ProviderSessionRequest,
} from "../../providers/provider-types.js";
import type { ResolvedFlowSnapshot } from "../schemas/flow-schema.js";

export const flowContextRetentionModeSchema = z.enum([
  "opened",
  "reused",
  "rehydrated",
  "stateless",
]);
export type FlowContextRetentionMode = z.infer<
  typeof flowContextRetentionModeSchema
>;

export const flowParticipantCapabilitiesSchema = z
  .object({
    providerType: z.string().min(1),
    sessionReuse: z.enum(["none", "resume"]),
    interactiveSessions: z.boolean(),
    reportsSessionId: z.boolean(),
    reportsTokenUsage: z.boolean(),
  })
  .strict();
export type FlowParticipantCapabilities = z.infer<
  typeof flowParticipantCapabilitiesSchema
>;

export const flowParticipantTurnSchema = z
  .object({
    stepId: z.string().min(1),
    roleId: z.string().min(1),
    providerId: z.string().min(1),
    contextMode: flowContextRetentionModeSchema,
    contextPacketPath: z.string().min(1),
    promptArtifactPath: z.string().min(1),
    outputArtifactPath: z.string().min(1),
    sessionId: z.string().nullable().default(null),
    fallbackReason: z.string().nullable().default(null),
    completedAt: z.string(),
  })
  .strict();
export type FlowParticipantTurn = z.infer<typeof flowParticipantTurnSchema>;

export const flowParticipantSchema = z
  .object({
    slotId: z.string().min(1),
    label: z.string().min(1),
    providerId: z.string().min(1),
    capabilities: flowParticipantCapabilitiesSchema,
    sessionId: z.string().nullable().default(null),
    turns: z.array(flowParticipantTurnSchema).default([]),
  })
  .strict();
export type FlowParticipant = z.infer<typeof flowParticipantSchema>;

export const flowRunParticipantStateSchema = z
  .object({
    slotId: z.string().min(1),
    label: z.string().min(1),
    providerId: z.string().min(1),
    providerType: z.string().min(1),
    sessionReuse: z.enum(["none", "resume"]),
    sessionId: z.string().nullable().default(null),
    turnCount: z.number().int().nonnegative(),
    lastContextMode: flowContextRetentionModeSchema.nullable().default(null),
    lastFallbackReason: z.string().nullable().default(null),
  })
  .strict();
export type FlowRunParticipantState = z.infer<
  typeof flowRunParticipantStateSchema
>;

export const flowParticipantLedgerSchema = z
  .object({
    schemaVersion: z.literal(1),
    flowId: z.string().min(1),
    flowVersion: z.number().int().positive(),
    createdAt: z.string(),
    updatedAt: z.string(),
    participants: z.array(flowParticipantSchema),
  })
  .strict();
export type FlowParticipantLedger = z.infer<
  typeof flowParticipantLedgerSchema
>;

export type PreparedFlowParticipantTurn = {
  slotId: string;
  contextMode: FlowContextRetentionMode;
  fallbackReason: string | null;
  sessionRequest?: ProviderSessionRequest;
};

export function createFlowParticipantLedger(input: {
  snapshot: ResolvedFlowSnapshot;
  capabilities: (providerId: string) => ProviderCapabilities;
}): FlowParticipantLedger {
  const createdAt = nowIso();
  return flowParticipantLedgerSchema.parse({
    schemaVersion: 1,
    flowId: input.snapshot.flowId,
    flowVersion: input.snapshot.flowVersion,
    createdAt,
    updatedAt: createdAt,
    participants: input.snapshot.slots.map((slot) => ({
      slotId: slot.id,
      label: slot.label,
      providerId: slot.providerId,
      capabilities: input.capabilities(slot.providerId),
      sessionId: null,
      turns: [],
    })),
  });
}

export function prepareFlowParticipantTurn(
  ledger: FlowParticipantLedger,
  slotId: string,
): PreparedFlowParticipantTurn {
  const participant = requireParticipant(ledger, slotId);
  if (participant.capabilities.sessionReuse === "resume") {
    if (participant.sessionId) {
      return {
        slotId,
        contextMode: "reused",
        fallbackReason: null,
        sessionRequest: {
          action: "resume",
          sessionId: participant.sessionId,
        },
      };
    }

    return {
      slotId,
      contextMode: "opened",
      fallbackReason: null,
      sessionRequest: {
        action: "open",
        sessionId: randomUUID(),
      },
    };
  }

  if (participant.turns.length > 0) {
    return {
      slotId,
      contextMode: "rehydrated",
      fallbackReason:
        "Provider has no Flow session reuse adapter; prior context came from Flow artifacts.",
    };
  }

  return {
    slotId,
    contextMode: "stateless",
    fallbackReason:
      "Provider has no Flow session reuse adapter; this is the participant's first turn.",
  };
}

export function recordFlowParticipantTurn(input: {
  ledger: FlowParticipantLedger;
  prepared: PreparedFlowParticipantTurn;
  stepId: string;
  roleId: string;
  providerId: string;
  contextPacketPath: string;
  promptArtifactPath: string;
  outputArtifactPath: string;
  providerSessionId?: string | null;
}): FlowParticipantLedger {
  const updatedAt = nowIso();
  const participants = input.ledger.participants.map((participant) => {
    if (participant.slotId !== input.prepared.slotId) return participant;

    const sessionId =
      input.providerSessionId ??
      input.prepared.sessionRequest?.sessionId ??
      participant.sessionId;
    return {
      ...participant,
      sessionId: sessionId ?? null,
      turns: [
        ...participant.turns,
        {
          stepId: input.stepId,
          roleId: input.roleId,
          providerId: input.providerId,
          contextMode: input.prepared.contextMode,
          contextPacketPath: input.contextPacketPath,
          promptArtifactPath: input.promptArtifactPath,
          outputArtifactPath: input.outputArtifactPath,
          sessionId: sessionId ?? null,
          fallbackReason: input.prepared.fallbackReason,
          completedAt: updatedAt,
        },
      ],
    };
  });

  return flowParticipantLedgerSchema.parse({
    ...input.ledger,
    updatedAt,
    participants,
  });
}

export function summarizeFlowParticipants(
  ledger: FlowParticipantLedger,
): FlowRunParticipantState[] {
  return ledger.participants.map((participant) => {
    const lastTurn = participant.turns.at(-1) ?? null;
    return {
      slotId: participant.slotId,
      label: participant.label,
      providerId: participant.providerId,
      providerType: participant.capabilities.providerType,
      sessionReuse: participant.capabilities.sessionReuse,
      sessionId: participant.sessionId,
      turnCount: participant.turns.length,
      lastContextMode: lastTurn?.contextMode ?? null,
      lastFallbackReason: lastTurn?.fallbackReason ?? null,
    };
  });
}

function requireParticipant(
  ledger: FlowParticipantLedger,
  slotId: string,
): FlowParticipant {
  const participant = ledger.participants.find((entry) => entry.slotId === slotId);
  if (!participant) {
    throw new Error(`Flow participant slot "${slotId}" is not in the participant ledger.`);
  }
  return participant;
}

export class FlowParticipantLedgerStore {
  constructor(
    private readonly projectRoot: string,
    private readonly runId: string,
  ) {}

  get filePath(): string {
    return runFlowParticipantsPath(this.projectRoot, this.runId);
  }

  async read(): Promise<FlowParticipantLedger | null> {
    if (!(await pathExists(this.filePath))) return null;
    return flowParticipantLedgerSchema.parse(
      await readJson<unknown>(this.filePath),
    );
  }

  async write(ledger: FlowParticipantLedger): Promise<void> {
    await writeJson(this.filePath, flowParticipantLedgerSchema.parse(ledger));
  }
}

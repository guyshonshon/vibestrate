import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pathExists } from "../../utils/fs.js";
import { readJson, writeJson } from "../../utils/json.js";
import { runGuideParticipantsPath } from "../../utils/paths.js";
import { nowIso } from "../../utils/time.js";
import type {
  ProviderCapabilities,
  ProviderSessionRequest,
} from "../../providers/provider-types.js";
import type { ResolvedGuideSnapshot } from "../schemas/guide-schema.js";

export const guideContextRetentionModeSchema = z.enum([
  "opened",
  "reused",
  "rehydrated",
  "stateless",
]);
export type GuideContextRetentionMode = z.infer<
  typeof guideContextRetentionModeSchema
>;

export const guideParticipantCapabilitiesSchema = z
  .object({
    providerType: z.string().min(1),
    sessionReuse: z.enum(["none", "resume"]),
    interactiveSessions: z.boolean(),
    reportsSessionId: z.boolean(),
    reportsTokenUsage: z.boolean(),
  })
  .strict();
export type GuideParticipantCapabilities = z.infer<
  typeof guideParticipantCapabilitiesSchema
>;

export const guideParticipantTurnSchema = z
  .object({
    stepId: z.string().min(1),
    agentId: z.string().min(1),
    providerId: z.string().min(1),
    contextMode: guideContextRetentionModeSchema,
    contextPacketPath: z.string().min(1),
    promptArtifactPath: z.string().min(1),
    outputArtifactPath: z.string().min(1),
    sessionId: z.string().nullable().default(null),
    fallbackReason: z.string().nullable().default(null),
    completedAt: z.string(),
  })
  .strict();
export type GuideParticipantTurn = z.infer<typeof guideParticipantTurnSchema>;

export const guideParticipantSchema = z
  .object({
    slotId: z.string().min(1),
    label: z.string().min(1),
    providerId: z.string().min(1),
    capabilities: guideParticipantCapabilitiesSchema,
    sessionId: z.string().nullable().default(null),
    turns: z.array(guideParticipantTurnSchema).default([]),
  })
  .strict();
export type GuideParticipant = z.infer<typeof guideParticipantSchema>;

export const guideRunParticipantStateSchema = z
  .object({
    slotId: z.string().min(1),
    label: z.string().min(1),
    providerId: z.string().min(1),
    providerType: z.string().min(1),
    sessionReuse: z.enum(["none", "resume"]),
    sessionId: z.string().nullable().default(null),
    turnCount: z.number().int().nonnegative(),
    lastContextMode: guideContextRetentionModeSchema.nullable().default(null),
    lastFallbackReason: z.string().nullable().default(null),
  })
  .strict();
export type GuideRunParticipantState = z.infer<
  typeof guideRunParticipantStateSchema
>;

export const guideParticipantLedgerSchema = z
  .object({
    schemaVersion: z.literal(1),
    guideId: z.string().min(1),
    guideVersion: z.number().int().positive(),
    createdAt: z.string(),
    updatedAt: z.string(),
    participants: z.array(guideParticipantSchema),
  })
  .strict();
export type GuideParticipantLedger = z.infer<
  typeof guideParticipantLedgerSchema
>;

export type PreparedGuideParticipantTurn = {
  slotId: string;
  contextMode: GuideContextRetentionMode;
  fallbackReason: string | null;
  sessionRequest?: ProviderSessionRequest;
};

export function createGuideParticipantLedger(input: {
  snapshot: ResolvedGuideSnapshot;
  capabilities: (providerId: string) => ProviderCapabilities;
}): GuideParticipantLedger {
  const createdAt = nowIso();
  return guideParticipantLedgerSchema.parse({
    schemaVersion: 1,
    guideId: input.snapshot.guideId,
    guideVersion: input.snapshot.guideVersion,
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

export function prepareGuideParticipantTurn(
  ledger: GuideParticipantLedger,
  slotId: string,
): PreparedGuideParticipantTurn {
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
        "Provider has no Guide session reuse adapter; prior context came from Guide artifacts.",
    };
  }

  return {
    slotId,
    contextMode: "stateless",
    fallbackReason:
      "Provider has no Guide session reuse adapter; this is the participant's first turn.",
  };
}

export function recordGuideParticipantTurn(input: {
  ledger: GuideParticipantLedger;
  prepared: PreparedGuideParticipantTurn;
  stepId: string;
  agentId: string;
  providerId: string;
  contextPacketPath: string;
  promptArtifactPath: string;
  outputArtifactPath: string;
  providerSessionId?: string | null;
}): GuideParticipantLedger {
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
          agentId: input.agentId,
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

  return guideParticipantLedgerSchema.parse({
    ...input.ledger,
    updatedAt,
    participants,
  });
}

export function summarizeGuideParticipants(
  ledger: GuideParticipantLedger,
): GuideRunParticipantState[] {
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
  ledger: GuideParticipantLedger,
  slotId: string,
): GuideParticipant {
  const participant = ledger.participants.find((entry) => entry.slotId === slotId);
  if (!participant) {
    throw new Error(`Guide participant slot "${slotId}" is not in the participant ledger.`);
  }
  return participant;
}

export class GuideParticipantLedgerStore {
  constructor(
    private readonly projectRoot: string,
    private readonly runId: string,
  ) {}

  get filePath(): string {
    return runGuideParticipantsPath(this.projectRoot, this.runId);
  }

  async read(): Promise<GuideParticipantLedger | null> {
    if (!(await pathExists(this.filePath))) return null;
    return guideParticipantLedgerSchema.parse(
      await readJson<unknown>(this.filePath),
    );
  }

  async write(ledger: GuideParticipantLedger): Promise<void> {
    await writeJson(this.filePath, guideParticipantLedgerSchema.parse(ledger));
  }
}

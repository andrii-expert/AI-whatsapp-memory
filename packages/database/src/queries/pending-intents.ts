import { and, eq, desc } from "drizzle-orm";
import type { Database } from "../client";
import {
  flowSessions,
  interactivePrompts,
  pendingIntents,
} from "../schema";
import {
  withMutationLogging,
  withQueryLogging,
} from "../utils/query-logger";

type PendingIntentRecord = typeof pendingIntents.$inferSelect;
type PendingIntentInsert = typeof pendingIntents.$inferInsert;
type FlowSessionRecord = typeof flowSessions.$inferSelect;
type InteractivePromptRecord = typeof interactivePrompts.$inferSelect;
type InteractivePromptInsert = typeof interactivePrompts.$inferInsert;

type PendingIntentUpdate = Partial<
  Pick<
    PendingIntentInsert,
    "intentSnapshot" | "clarificationPlan" | "status" | "expiresAt"
  >
>;

export async function createPendingIntent(
  db: Database,
  data: PendingIntentInsert
): Promise<PendingIntentRecord | null> {
  return withMutationLogging(
    "createPendingIntent",
    { jobId: data.jobId, userId: data.userId },
    async () => {
      const [record]: PendingIntentRecord[] = await db
        .insert(pendingIntents)
        .values({
          ...data,
          expiresAt:
            data.expiresAt ?? new Date(Date.now() + 5 * 60 * 1000),
        })
        .returning();

      if (!record) {
        return null;
      }

      return record;
    }
  );
}

export async function getPendingIntentById(
  db: Database,
  id: string
): Promise<PendingIntentRecord | null> {
  return withQueryLogging(
    "getPendingIntentById",
    { pendingIntentId: id },
    async () => {
      const record = await db.query.pendingIntents.findFirst({
        where: eq(pendingIntents.id, id),
      });

      return record ?? null;
    }
  );
}

export async function getPendingIntentByJobId(
  db: Database,
  jobId: string
): Promise<PendingIntentRecord | null> {
  return withQueryLogging(
    "getPendingIntentByJobId",
    { jobId },
    async () => {
      const record = await db.query.pendingIntents.findFirst({
        where: eq(pendingIntents.jobId, jobId),
      });

      return record ?? null;
    }
  );
}

export async function getActivePendingIntentByWhatsappNumber(
  db: Database,
  whatsappNumberId: string
): Promise<PendingIntentRecord | null> {
  return withQueryLogging(
    "getActivePendingIntentByWhatsappNumber",
    { whatsappNumberId },
    async () => {
      const record = await db.query.pendingIntents.findFirst({
        where: and(
          eq(pendingIntents.whatsappNumberId, whatsappNumberId),
          eq(pendingIntents.status, "awaiting_clarification")
        ),
        orderBy: [desc(pendingIntents.updatedAt)],
      });

      return record ?? null;
    }
  );
}

export async function updatePendingIntent(
  db: Database,
  id: string,
  updates: PendingIntentUpdate
): Promise<PendingIntentRecord | null> {
  if (!Object.keys(updates).length) {
    return getPendingIntentById(db, id);
  }

  return withMutationLogging(
    "updatePendingIntent",
    { pendingIntentId: id, fields: Object.keys(updates) },
    async () => {
      const [updated]: PendingIntentRecord[] = await db
        .update(pendingIntents)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(pendingIntents.id, id))
        .returning();

      if (!updated) {
        return null;
      }

      return updated;
    }
  );
}

export async function deletePendingIntent(
  db: Database,
  id: string
): Promise<boolean> {
  return withMutationLogging(
    "deletePendingIntent",
    { pendingIntentId: id },
    async () => {
      const deleted = await db
        .delete(pendingIntents)
        .where(eq(pendingIntents.id, id))
        .returning({ id: pendingIntents.id });

      return deleted.length > 0;
    }
  );
}

export async function createFlowSession(
  db: Database,
  data: typeof flowSessions.$inferInsert
): Promise<FlowSessionRecord | null> {
  return withMutationLogging(
    "createFlowSession",
    { flowToken: data.flowToken },
    async () => {
      const [record]: FlowSessionRecord[] = await db
        .insert(flowSessions)
        .values({
          ...data,
          expiresAt:
            data.expiresAt ?? new Date(Date.now() + 5 * 60 * 1000),
        })
        .returning();

      if (!record) {
        return null;
      }

      return record;
    }
  );
}

export async function getFlowSessionByToken(
  db: Database,
  flowToken: string
): Promise<FlowSessionRecord | null> {
  return withQueryLogging(
    "getFlowSessionByToken",
    { flowToken },
    async () => {
      const record = await db.query.flowSessions.findFirst({
        where: eq(flowSessions.flowToken, flowToken),
      });

      return record ?? null;
    }
  );
}

export async function markFlowSessionResponse(
  db: Database,
  flowToken: string,
  responseData: Record<string, unknown>
): Promise<FlowSessionRecord | null> {
  return withMutationLogging(
    "markFlowSessionResponse",
    { flowToken },
    async () => {
      const [updated]: FlowSessionRecord[] = await db
        .update(flowSessions)
        .set({
          responseData,
          responseReceived: true,
        })
        .where(eq(flowSessions.flowToken, flowToken))
        .returning();

      if (!updated) {
        return null;
      }

      return updated;
    }
  );
}

export async function deleteFlowSession(
  db: Database,
  flowToken: string
): Promise<boolean> {
  return withMutationLogging(
    "deleteFlowSession",
    { flowToken },
    async () => {
      const deleted = await db
        .delete(flowSessions)
        .where(eq(flowSessions.flowToken, flowToken))
        .returning({ flowToken: flowSessions.flowToken });

      return deleted.length > 0;
    }
  );
}

type InteractivePromptResponseUpdate = {
  whatsappMessageId?: string | null;
  selectedValue?: string | null;
  options?: unknown;
};

export async function markInteractivePromptResponse(
  db: Database,
  pendingIntentId: string,
  fieldKey: string,
  update: InteractivePromptResponseUpdate
): Promise<InteractivePromptRecord | null> {
  return withMutationLogging(
    "markInteractivePromptResponse",
    { pendingIntentId, fieldKey },
    async () => {
      const [updated]: InteractivePromptRecord[] = await db
        .update(interactivePrompts)
        .set({
          responseReceived: true,
          selectedValue: update.selectedValue ?? null,
          whatsappMessageId: update.whatsappMessageId ?? null,
          options: update.options ?? [],
        })
        .where(
          and(
            eq(interactivePrompts.pendingIntentId, pendingIntentId),
            eq(interactivePrompts.fieldKey, fieldKey)
          )
        )
        .returning();

      if (updated) {
        return updated;
      }

      const [created]: InteractivePromptRecord[] = await db
        .insert(interactivePrompts)
        .values({
          pendingIntentId,
          fieldKey,
          whatsappMessageId: update.whatsappMessageId ?? null,
          options: update.options ?? [],
          selectedValue: update.selectedValue ?? null,
          responseReceived: true,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        })
        .returning();

      if (!created) {
        return null;
      }

      return created;
    }
  );
}

export async function createInteractivePrompt(
  db: Database,
  data: InteractivePromptInsert
): Promise<InteractivePromptRecord | null> {
  return withMutationLogging(
    "createInteractivePrompt",
    { pendingIntentId: data.pendingIntentId, fieldKey: data.fieldKey },
    async () => {
      const [record]: InteractivePromptRecord[] = await db
        .insert(interactivePrompts)
        .values({
          ...data,
          responseReceived: false,
          expiresAt:
            data.expiresAt ?? new Date(Date.now() + 5 * 60 * 1000),
        })
        .returning();

      return record ?? null;
    }
  );
}

export type {
  PendingIntentRecord,
  FlowSessionRecord,
  InteractivePromptRecord,
};

export async function getActivePendingIntents(
  db: Database,
  limit = 100
): Promise<PendingIntentRecord[]> {
  return withQueryLogging(
    "getActivePendingIntents",
    { limit },
    async () => {
      const records = await db.query.pendingIntents.findMany({
        where: eq(pendingIntents.status, "awaiting_clarification"),
        orderBy: [desc(pendingIntents.updatedAt)],
        limit,
      });

      return records;
    }
  );
}

export async function getInteractivePromptsByPendingIntentId(
  db: Database,
  pendingIntentId: string
): Promise<InteractivePromptRecord[]> {
  return withQueryLogging(
    "getInteractivePromptsByPendingIntentId",
    { pendingIntentId },
    async () => {
      const records = await db.query.interactivePrompts.findMany({
        where: eq(interactivePrompts.pendingIntentId, pendingIntentId),
      });

      return records;
    }
  );
}

export async function getFlowSessionsByPendingIntentId(
  db: Database,
  pendingIntentId: string
): Promise<FlowSessionRecord[]> {
  return withQueryLogging(
    "getFlowSessionsByPendingIntentId",
    { pendingIntentId },
    async () => {
      const records = await db.query.flowSessions.findMany({
        where: eq(flowSessions.pendingIntentId, pendingIntentId),
      });

      return records;
    }
  );
}


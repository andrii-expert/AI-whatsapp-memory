import { eq, and, lt } from "drizzle-orm";
import type { Database } from "../client";
import { conversationStates } from "../schema";
import { withQueryLogging, withMutationLogging } from "../utils/query-logger";

export async function createConversationState(
  db: Database,
  data: {
    userId: string;
    whatsappNumberId: string;
    voiceJobId: string;
    partialIntent: any; // JSONB
    pendingResolutions: any; // JSONB
    lastQuestionAsked: string;
    expectedResponseType: string;
  }
) {
  return withMutationLogging(
    'createConversationState',
    { userId: data.userId, voiceJobId: data.voiceJobId },
    async () => {
      // Set expiry to 24 hours from now
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const [state] = await db
        .insert(conversationStates)
        .values({
          ...data,
          status: 'waiting_for_input',
          expiresAt,
        })
        .returning();

      return state;
    }
  );
}

export async function getActiveConversationState(
  db: Database,
  userId: string,
  whatsappNumberId: string
) {
  return withQueryLogging(
    'getActiveConversationState',
    { userId, whatsappNumberId },
    () => db.query.conversationStates.findFirst({
      where: and(
        eq(conversationStates.userId, userId),
        eq(conversationStates.whatsappNumberId, whatsappNumberId),
        eq(conversationStates.status, 'waiting_for_input')
      ),
      orderBy: (conversationStates, { desc }) => [desc(conversationStates.createdAt)],
    })
  );
}

export async function getConversationStateById(db: Database, id: string) {
  return withQueryLogging(
    'getConversationStateById',
    { conversationStateId: id },
    () => db.query.conversationStates.findFirst({
      where: eq(conversationStates.id, id),
    })
  );
}

export async function getConversationStateByJobId(db: Database, voiceJobId: string) {
  return withQueryLogging(
    'getConversationStateByJobId',
    { voiceJobId },
    () => db.query.conversationStates.findFirst({
      where: eq(conversationStates.voiceJobId, voiceJobId),
    })
  );
}

export async function updateConversationStateWithResponse(
  db: Database,
  id: string,
  data: {
    resolvedData: any; // JSONB - accumulated resolved data
    lastQuestionAsked?: string;
    expectedResponseType?: string;
  }
) {
  return withMutationLogging(
    'updateConversationStateWithResponse',
    { conversationStateId: id },
    async () => {
      const [updated] = await db
        .update(conversationStates)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(conversationStates.id, id))
        .returning();

      return updated;
    }
  );
}

export async function updateConversationStateResolvedData(
  db: Database,
  id: string,
  resolvedData: any,
  status?: 'waiting_for_input' | 'processing' | 'completed' | 'expired'
) {
  return withMutationLogging(
    'updateConversationStateResolvedData',
    { conversationStateId: id },
    async () => {
      const updateData: any = {
        resolvedData,
        updatedAt: new Date(),
      };
      
      if (status) {
        updateData.status = status;
      }

      const [updated] = await db
        .update(conversationStates)
        .set(updateData)
        .where(eq(conversationStates.id, id))
        .returning();

      return updated;
    }
  );
}

export async function completeConversationState(db: Database, id: string) {
  return withMutationLogging(
    'completeConversationState',
    { conversationStateId: id },
    async () => {
      const [updated] = await db
        .update(conversationStates)
        .set({
          status: 'completed',
          updatedAt: new Date(),
        })
        .where(eq(conversationStates.id, id))
        .returning();

      return updated;
    }
  );
}

export async function expireConversationState(db: Database, id: string) {
  return withMutationLogging(
    'expireConversationState',
    { conversationStateId: id },
    async () => {
      const [updated] = await db
        .update(conversationStates)
        .set({
          status: 'expired',
          updatedAt: new Date(),
        })
        .where(eq(conversationStates.id, id))
        .returning();

      return updated;
    }
  );
}

export async function deleteExpiredConversationStates(db: Database) {
  return withMutationLogging(
    'deleteExpiredConversationStates',
    {},
    async () => {
      const now = new Date();
      const deleted = await db
        .delete(conversationStates)
        .where(lt(conversationStates.expiresAt, now))
        .returning();

      return deleted;
    }
  );
}

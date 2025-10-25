import { eq, and } from "drizzle-orm";
import type { Database } from "../client";
import { eventVerificationStates } from "../schema";
import { withQueryLogging, withMutationLogging } from "../utils/query-logger";

export async function createEventVerificationState(
  db: Database,
  data: {
    userId: string;
    whatsappNumberId: string;
    voiceJobId: string;
    operationType: 'create' | 'update' | 'delete';
    intentToVerify: any; // JSONB CalendarIntent
    targetEventId?: string; // For update/delete operations
  }
) {
  return withMutationLogging(
    'createEventVerificationState',
    { userId: data.userId, voiceJobId: data.voiceJobId },
    async () => {
      // Set expiry to 5 minutes from now
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 5);

      const [state] = await db
        .insert(eventVerificationStates)
        .values({
          ...data,
          status: 'pending',
          expiresAt,
        })
        .returning();

      return state;
    }
  );
}

export async function getEventVerificationStateByVoiceJobId(
  db: Database,
  voiceJobId: string
) {
  return withQueryLogging(
    'getEventVerificationStateByVoiceJobId',
    { voiceJobId },
    () => db.query.eventVerificationStates.findFirst({
      where: eq(eventVerificationStates.voiceJobId, voiceJobId),
      orderBy: (eventVerificationStates, { desc }) => [desc(eventVerificationStates.createdAt)],
    })
  );
}

export async function getActiveEventVerificationStateByWhatsappNumber(
  db: Database,
  userId: string,
  whatsappNumberId: string
) {
  return withQueryLogging(
    'getActiveEventVerificationStateByWhatsappNumber',
    { userId, whatsappNumberId },
    () => db.query.eventVerificationStates.findFirst({
      where: and(
        eq(eventVerificationStates.userId, userId),
        eq(eventVerificationStates.whatsappNumberId, whatsappNumberId),
        eq(eventVerificationStates.status, 'pending')
      ),
      orderBy: (eventVerificationStates, { desc }) => [desc(eventVerificationStates.createdAt)],
    })
  );
}

export async function getEventVerificationStateById(db: Database, id: string) {
  return withQueryLogging(
    'getEventVerificationStateById',
    { verificationStateId: id },
    () => db.query.eventVerificationStates.findFirst({
      where: eq(eventVerificationStates.id, id),
    })
  );
}

export async function updateEventVerificationStateWithResponse(
  db: Database,
  id: string,
  data: {
    userResponse: string; // 'yes' or 'no'
    status: 'approved' | 'rejected';
    responseReceivedAt: Date;
  }
) {
  return withMutationLogging(
    'updateEventVerificationStateWithResponse',
    { verificationStateId: id, status: data.status },
    async () => {
      const [updated] = await db
        .update(eventVerificationStates)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(eventVerificationStates.id, id))
        .returning();

      return updated;
    }
  );
}

export async function expireEventVerificationState(db: Database, id: string) {
  return withMutationLogging(
    'expireEventVerificationState',
    { verificationStateId: id },
    async () => {
      const [updated] = await db
        .update(eventVerificationStates)
        .set({
          status: 'expired',
          updatedAt: new Date(),
        })
        .where(eq(eventVerificationStates.id, id))
        .returning();

      return updated;
    }
  );
}

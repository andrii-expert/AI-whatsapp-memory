import { eq, and, desc } from "drizzle-orm";
import type { Database } from "../client";
import { reminders } from "../schema";

export type ReminderFrequency = "daily" | "hourly" | "minutely";

export interface CreateReminderInput {
  userId: string;
  title: string;
  frequency: ReminderFrequency;
  time?: string;
  minuteOfHour?: number;
  intervalMinutes?: number;
  active?: boolean;
}

export interface UpdateReminderInput {
  title?: string;
  frequency?: ReminderFrequency;
  time?: string;
  minuteOfHour?: number;
  intervalMinutes?: number;
  active?: boolean;
}

export async function createReminder(db: Database, input: CreateReminderInput) {
  const [reminder] = await db
    .insert(reminders)
    .values({
      userId: input.userId,
      title: input.title,
      frequency: input.frequency,
      time: input.time,
      minuteOfHour: input.minuteOfHour,
      intervalMinutes: input.intervalMinutes,
      active: input.active ?? true,
    })
    .returning();
  
  return reminder;
}

export async function getRemindersByUserId(db: Database, userId: string) {
  return await db
    .select()
    .from(reminders)
    .where(eq(reminders.userId, userId))
    .orderBy(desc(reminders.createdAt));
}

export async function getReminderById(db: Database, id: string, userId: string) {
  const [reminder] = await db
    .select()
    .from(reminders)
    .where(and(eq(reminders.id, id), eq(reminders.userId, userId)));
  
  return reminder;
}

export async function updateReminder(
  db: Database,
  id: string,
  userId: string,
  input: UpdateReminderInput
) {
  const [updated] = await db
    .update(reminders)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(and(eq(reminders.id, id), eq(reminders.userId, userId)))
    .returning();
  
  return updated;
}

export async function deleteReminder(db: Database, id: string, userId: string) {
  const [deleted] = await db
    .delete(reminders)
    .where(and(eq(reminders.id, id), eq(reminders.userId, userId)))
    .returning();
  
  return deleted;
}

export async function toggleReminderActive(
  db: Database,
  id: string,
  userId: string,
  active: boolean
) {
  const [updated] = await db
    .update(reminders)
    .set({
      active,
      updatedAt: new Date(),
    })
    .where(and(eq(reminders.id, id), eq(reminders.userId, userId)))
    .returning();
  
  return updated;
}


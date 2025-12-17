import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { createTRPCRouter } from "../init";
import { adminRouter } from "./admin";
import { authRouter } from "./auth";
import { billingRouter } from "./billing";
import { calendarRouter } from "./calendar";
import { invoicesRouter } from "./invoices";
import { paymentsRouter } from "./payments";
import { preferencesRouter } from "./preferences";
import { userRouter } from "./user";
import { devRouter } from "./dev";
import { whatsappAnalyticsRouter } from "./whatsapp-analytics";
import { whatsappRouter } from "./whatsapp";
import { voiceTestingRouter } from "./voice-testing";
import { plansRouter } from "./plans";
import { tasksRouter } from "./tasks";
import { taskSharingRouter } from "./task-sharing";
import { shoppingListRouter } from "./shopping-list";
import { notesRouter } from "./notes";
import { noteSharingRouter } from "./note-sharing";
import { remindersRouter } from "./reminders";
import { storageRouter } from "./storage";
import { fileSharingRouter } from "./file-sharing";
import { addressesRouter } from "./addresses";
import { addressSharingRouter } from "./address-sharing";
import { friendsRouter } from "./friends";

export const appRouter = createTRPCRouter({
  admin: adminRouter,
  auth: authRouter,
  user: userRouter,
  billing: billingRouter,
  calendar: calendarRouter,
  invoices: invoicesRouter,
  payments: paymentsRouter,
  preferences: preferencesRouter,
  whatsapp: whatsappRouter,
  whatsappAnalytics: whatsappAnalyticsRouter,
  voiceTesting: voiceTestingRouter,
  dev: devRouter,
  plans: plansRouter,
  tasks: tasksRouter,
  taskSharing: taskSharingRouter,
  shoppingList: shoppingListRouter,
  notes: notesRouter,
  noteSharing: noteSharingRouter,
  reminders: remindersRouter,
  storage: storageRouter,
  fileSharing: fileSharingRouter,
  addresses: addressesRouter,
  addressSharing: addressSharingRouter,
  friends: friendsRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type RouterInputs = inferRouterInputs<AppRouter>;
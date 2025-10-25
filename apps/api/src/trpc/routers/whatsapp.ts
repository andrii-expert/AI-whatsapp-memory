import {
  generateVerificationCodeSchema,
  verifyCodeSchema,
} from "@api/schemas/whatsapp-verification";
import { createTRPCRouter, protectedProcedure } from "@api/trpc/init";
import {
  generateVerificationCode,
  verifyWhatsAppCode,
  getUserWhatsAppNumbers,
  getPendingVerification,
  resetWhatsAppVerification,
} from "@imaginecalendar/database/queries";

export const whatsappRouter = createTRPCRouter({
  generateVerificationCode: protectedProcedure
    .input(generateVerificationCodeSchema)
    .mutation(async ({ ctx: { db, session }, input }) => {
      return generateVerificationCode(
        db,
        session.user.id,
        input.phoneNumber
      );
    }),

  verifyCode: protectedProcedure
    .input(verifyCodeSchema)
    .mutation(async ({ ctx: { db }, input }) => {
      return verifyWhatsAppCode(
        db,
        input.phoneNumber,
        input.verificationCode
      );
    }),

  resetVerification: protectedProcedure
    .mutation(async ({ ctx: { db, session } }) => {
      return resetWhatsAppVerification(db, session.user.id);
    }),

  getMyNumbers: protectedProcedure.query(async ({ ctx: { db, session } }) => {
    return getUserWhatsAppNumbers(db, session.user.id);
  }),

  getPendingVerification: protectedProcedure.query(async ({ ctx: { db, session } }) => {
    return getPendingVerification(db, session.user.id);
  }),
});
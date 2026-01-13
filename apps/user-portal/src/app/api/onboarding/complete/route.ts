import { NextRequest, NextResponse } from "next/server";
import { connectDb } from "@imaginecalendar/database/client";
import { verifyToken } from "@api/utils/auth-helpers";
import { logger } from "@imaginecalendar/logger";
import { getVerifiedWhatsappNumberByPhone, getUserWhatsAppNumbers, logOutgoingWhatsAppMessage } from "@imaginecalendar/database/queries";
import { WhatsAppService } from "@imaginecalendar/whatsapp";

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("auth-token")?.value;
    if (!token) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: "Invalid token" },
        { status: 401 }
      );
    }

    const db = await connectDb();

    // Get user's verified WhatsApp numbers
    const whatsappNumbers = await getUserWhatsAppNumbers(db, decoded.userId);
    const verifiedNumber = whatsappNumbers.find((num: any) => num.isVerified);

    // Send completion message via WhatsApp if user has verified number
    if (verifiedNumber) {
      try {
        const whatsappService = new WhatsAppService();
        const message = `🎉 *Setup Complete!*\n\nWelcome to CrackOn! Your account has been successfully set up.\n\nYou can now:\n• Manage your calendar events\n• Set reminders\n• Create tasks and notes\n• And much more!\n\nWe're excited to have you on board. If you need any help, just send us a message!`;

        await whatsappService.sendTextMessage(verifiedNumber.phoneNumber, message);

        // Log the message
        await logOutgoingWhatsAppMessage(db, {
          whatsappNumberId: verifiedNumber.id,
          userId: decoded.userId,
          messageType: 'text',
          messageContent: message,
          isFreeMessage: true,
        });

        logger.info({ userId: decoded.userId, phoneNumber: verifiedNumber.phoneNumber }, "Setup completion message sent via WhatsApp");
      } catch (error) {
        // Don't fail the request if WhatsApp message fails
        logger.error({ error, userId: decoded.userId }, "Failed to send setup completion message via WhatsApp");
      }
    }

    logger.info({ userId: decoded.userId }, "Onboarding completed successfully");

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, "Onboarding completion error");

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to complete setup" },
      { status: 500 }
    );
  }
}


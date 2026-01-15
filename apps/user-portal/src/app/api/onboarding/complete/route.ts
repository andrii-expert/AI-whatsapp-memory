import { NextRequest, NextResponse } from "next/server";
import { connectDb } from "@imaginecalendar/database/client";
import { verifyToken } from "@api/utils/auth-helpers";
import { logger } from "@imaginecalendar/logger";
import { getVerifiedWhatsappNumberByPhone, getUserById, getUserWhatsAppNumbers, logOutgoingWhatsAppMessage, updateUser } from "@imaginecalendar/database/queries";
import { WhatsAppService, type CTAButtonMessage } from "@imaginecalendar/whatsapp";

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

    // Update user setupStep to 4 (Complete)
    await updateUser(db, decoded.userId, {
      setupStep: 4, // Setup complete
    });

    // Get user's verified WhatsApp numbers
    const whatsappNumbers = await getUserWhatsAppNumbers(db, decoded.userId);
    const verifiedNumber = whatsappNumbers.find((num: any) => num.isVerified);

    // Send completion message via WhatsApp if user has verified number
    if (verifiedNumber) {
      try {
        const whatsappService = new WhatsAppService();
        
        // Get user details for personalization
        const user = await getUserById(db, decoded.userId);
        const userName = user?.firstName 
          ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ''}`
          : 'there';
        
        // Get the base URL for the dashboard button
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://crackon.ai';
        const dashboardUrl = `${baseUrl}/dashboard`;
        
        // Create completion message with CTA button
        const completionMessage: CTAButtonMessage = {
          bodyText: `Boom 💥 You are all setup, ${userName}\n\nThis chat is now your command center. Voice note or type here to create meetings, reminders (once-off or recurring), shopping lists, and more. No forms. No buttons. Just talk:\n\nTry this now in the chat:\n"Add milk to my list"\n"Show my shopping list"\n"Remind me in 5 minutes to go shopping"\n\nEasy, right? Now CrackOn 🚀`,
          buttonText: 'Dashboard',
          buttonUrl: dashboardUrl,
        };

        await whatsappService.sendCTAButtonMessage(verifiedNumber.phoneNumber, completionMessage);

        // Log the message
        await logOutgoingWhatsAppMessage(db, {
          whatsappNumberId: verifiedNumber.id,
          userId: decoded.userId,
          messageType: 'interactive',
          messageContent: completionMessage.bodyText,
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


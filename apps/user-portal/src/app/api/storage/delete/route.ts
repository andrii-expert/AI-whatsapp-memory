import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Cloudflare configuration
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || "OPOOJV50EcUypSt-DSXsUyCWCMzEhMlbI4LbpQgf";
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || "";

export async function DELETE(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const cloudflareId = searchParams.get("id");

    if (!cloudflareId) {
      return NextResponse.json(
        { success: false, error: "No file ID provided" },
        { status: 400 }
      );
    }

    // If it's a base64 data URL, just return success (nothing to delete from Cloudflare)
    if (cloudflareId.startsWith("data:")) {
      return NextResponse.json({ success: true });
    }

    // Try to delete from Cloudflare Images
    if (CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_API_TOKEN) {
      try {
        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/images/v1/${cloudflareId}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
            },
          }
        );

        const result = await response.json();
        
        if (!result.success) {
          console.warn("Cloudflare delete warning:", result.errors);
        }
      } catch (cloudflareError) {
        console.warn("Cloudflare delete error:", cloudflareError);
        // Continue even if Cloudflare delete fails
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Delete failed",
      },
      { status: 500 }
    );
  }
}


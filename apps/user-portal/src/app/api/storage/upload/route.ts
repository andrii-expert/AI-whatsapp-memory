import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Cloudflare configuration - stored securely on server
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || "OPOOJV50EcUypSt-DSXsUyCWCMzEhMlbI4LbpQgf";
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || "";

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }

    // Check file size (10MB max)
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "File too large. Maximum size is 10MB." },
        { status: 400 }
      );
    }

    // Generate unique file ID
    const timestamp = Date.now();
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const fileId = `${userId}_${timestamp}_${sanitizedFileName}`;

    const isImage = file.type.startsWith("image/");

    // Try Cloudflare Images API for images
    if (isImage && CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_API_TOKEN) {
      const cloudflareFormData = new FormData();
      cloudflareFormData.append("file", file);
      cloudflareFormData.append("id", fileId);

      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/images/v1`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
          },
          body: cloudflareFormData,
        }
      );

      const result = await response.json();

      if (result.success) {
        return NextResponse.json({
          success: true,
          id: result.result.id,
          url: result.result.variants?.[0] || result.result.url,
          thumbnailUrl:
            result.result.variants?.find((v: string) =>
              v.includes("thumbnail")
            ) || result.result.variants?.[0],
        });
      }
      
      // If Cloudflare fails, fall back to base64
      console.warn("Cloudflare upload failed, falling back to base64:", result.errors);
    }

    // Fallback: Convert to base64 data URL
    // This is temporary storage - in production, use Cloudflare R2 for non-images
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");
    const mimeType = file.type || "application/octet-stream";
    const dataUrl = `data:${mimeType};base64,${base64}`;

    return NextResponse.json({
      success: true,
      id: fileId,
      url: dataUrl,
      thumbnailUrl: isImage ? dataUrl : undefined,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Upload failed",
      },
      { status: 500 }
    );
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};


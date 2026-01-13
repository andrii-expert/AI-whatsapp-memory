import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// Cloudflare R2 configuration (must be provided via env)
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "imaginecalendar";
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || (R2_ACCOUNT_ID ? `https://pub-${R2_ACCOUNT_ID}.r2.dev` : undefined);

function getS3Client() {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error("Missing R2 credentials. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.");
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const cookieStore = await cookies();
    const token = cookieStore.get("auth-token")?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    const userId = payload.userId;
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

    // Generate unique file key
    const timestamp = Date.now();
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const fileKey = `users/${userId}/${timestamp}-${sanitizedFileName}`;
    const fileId = `${userId}_${timestamp}_${sanitizedFileName}`;

    if (!R2_PUBLIC_URL) {
      throw new Error("Missing R2_PUBLIC_URL. Set it to your public R2 endpoint (e.g., https://pub-<ACCOUNT_ID>.r2.dev).");
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    try {
      // Upload to R2
      const s3Client = getS3Client();
      const command = new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: fileKey,
        Body: buffer,
        ContentType: file.type || "application/octet-stream",
        Metadata: {
          originalName: file.name,
          userId: userId,
          uploadedAt: new Date().toISOString(),
        },
      });

      await s3Client.send(command);

      // Generate public URL
      const publicUrl = `${R2_PUBLIC_URL}/${fileKey}`;
      
      // For images, the same URL serves as thumbnail (R2 doesn't have built-in transforms)
      const isImage = file.type.startsWith("image/");
      const thumbnailUrl = isImage ? publicUrl : undefined;

      return NextResponse.json({
        success: true,
        id: fileId,
        key: fileKey,
        url: publicUrl,
        thumbnailUrl,
      });
    } catch (r2Error) {
      console.error("R2 upload error:", r2Error);
      
      // Fallback: Convert to base64 data URL if R2 fails
      const base64 = buffer.toString("base64");
      const mimeType = file.type || "application/octet-stream";
      const dataUrl = `data:${mimeType};base64,${base64}`;
      const isImage = file.type.startsWith("image/");

      return NextResponse.json({
        success: true,
        id: fileId,
        url: dataUrl,
        thumbnailUrl: isImage ? dataUrl : undefined,
        warning: "Stored locally - R2 upload failed",
      });
    }
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

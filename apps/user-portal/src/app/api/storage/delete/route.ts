import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

// Cloudflare R2 configuration (must be provided via env)
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "imaginecalendar";

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

export async function DELETE(request: NextRequest) {
  try {
    // Check authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const fileKey = searchParams.get("key");
    const fileId = searchParams.get("id");

    // If it's a base64 data URL, just return success (nothing to delete from R2)
    if (fileId?.startsWith("data:") || (!fileKey && fileId?.includes("_"))) {
      return NextResponse.json({ success: true });
    }

    if (!fileKey) {
      return NextResponse.json(
        { success: false, error: "No file key provided" },
        { status: 400 }
      );
    }

    try {
      // Delete from R2
      const s3Client = getS3Client();
      const command = new DeleteObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: fileKey,
      });

      await s3Client.send(command);
      
      return NextResponse.json({ success: true });
    } catch (r2Error) {
      console.warn("R2 delete error:", r2Error);
      // Return success anyway - file might not exist or already deleted
      return NextResponse.json({ success: true });
    }
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

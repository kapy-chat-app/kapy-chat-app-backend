// app/api/files/[id]/download/route.ts - Download encrypted file from Cloudinary

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { downloadEncryptedFile } from "@/lib/actions/file.action";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id: fileId } = await params;

    console.log(`📥 Download request for file: ${fileId}`);

    // ✅ Download encrypted file from Cloudinary
    const result = await downloadEncryptedFile(fileId, userId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    console.log(`✅ File downloaded successfully: ${result.data?.fileName}`);

    return NextResponse.json({
      success: true,
      data: result.data,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("❌ API Error - GET /files/:id/download:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
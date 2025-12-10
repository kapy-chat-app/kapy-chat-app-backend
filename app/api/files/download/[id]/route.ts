/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/files/[id]/download/route.ts
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import File from "@/database/file.model";
import { getS3PresignedUrl } from "@/lib/s3";
import Message from "@/database/message.model";

export const maxDuration = 30;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkUserId } = await auth();

    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: fileId } = await params;

    await connectToDatabase();

    const file = await File.findById(fileId);

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Check authorization
    const message = await Message.findOne({ attachments: fileId }).populate({
      path: "conversation",
      populate: { path: "participants", select: "clerkId" },
    });

    if (!message) {
      return NextResponse.json(
        { error: "File not found in any message" },
        { status: 404 }
      );
    }

    const conversation = message.conversation as any;
    const isParticipant = conversation.participants.some(
      (p: any) => p.clerkId === clerkUserId
    );

    if (!isParticipant) {
      return NextResponse.json(
        { error: "Unauthorized to access this file" },
        { status: 403 }
      );
    }

    // ✅ Generate presigned URL (valid for 1 hour)
    const presignedUrl = await getS3PresignedUrl(file.file_path, 3600);

    console.log(`✅ Generated presigned URL for file: ${fileId}`);

    return NextResponse.json({
      success: true,
      data: {
        // ✅ Wrap trong data
        downloadUrl: presignedUrl,
        fileName: file.file_name,
        fileType: file.file_type,
        fileSize: file.file_size,
        isEncrypted: file.is_encrypted,
        encryptionMetadata: file.encryption_metadata,
        expiresIn: 3600,
      },
    });
  } catch (error: any) {
    console.error("❌ [Download File] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate download URL" },
      { status: 500 }
    );
  }
}

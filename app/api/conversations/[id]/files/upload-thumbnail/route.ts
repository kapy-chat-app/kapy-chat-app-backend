/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/conversations/[id]/files/upload-thumbnail/route.ts
// ✅ Upload thumbnail trước khi upload file chính
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import User from "@/database/user.model";
import Conversation from "@/database/conversation.model";
import { uploadToS3 } from "@/lib/s3";

export const maxDuration = 30;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    console.log("🖼️ [Upload Thumbnail] Starting...");

    const { id: conversationId } = await params;
    const { userId: clerkUserId } = await auth();

    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const user = await User.findOne({ clerkId: clerkUserId });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // ✅ Verify user is participant
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const isParticipant = conversation.participants.some(
      (p: any) => p.toString() === user._id.toString()
    );

    if (!isParticipant) {
      return NextResponse.json({ error: "Not a participant" }, { status: 403 });
    }

    const body = await req.json();
    const { thumbnail, conversationId: bodyConvId } = body;

    if (!thumbnail) {
      return NextResponse.json(
        { error: "Missing required field: thumbnail" },
        { status: 400 }
      );
    }

    console.log("📦 Thumbnail size:", (thumbnail.length / 1024).toFixed(2), "KB");

    // ✅ Decode base64
    const buffer = Buffer.from(thumbnail, 'base64');
    
    if (buffer.length > 500 * 1024) { // 500KB limit
      return NextResponse.json(
        { error: "Thumbnail too large. Maximum: 500KB" },
        { status: 400 }
      );
    }

    // ✅ Upload to S3
    // uploadToS3(buffer, fileName, fileType, folder, metadata)
    const uploadResult = await uploadToS3(
      buffer,
      `thumb_${Date.now()}.jpg`,  // fileName
      'image/jpeg',                // fileType
      `thumbnails/${conversationId}`, // folder
      {
        'content-disposition': 'inline',
        'cache-control': 'public, max-age=31536000',
      }
    );

    if (!uploadResult.success) {
      throw new Error(`S3 upload failed: ${uploadResult.error}`);
    }

    console.log("✅ Thumbnail uploaded:", uploadResult.url);

    return NextResponse.json({
      url: uploadResult.url,
      key: uploadResult.key,
      size: buffer.length,
    });

  } catch (error: any) {
    console.error("❌ [Upload Thumbnail] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to upload thumbnail" },
      { status: 500 }
    );
  }
}
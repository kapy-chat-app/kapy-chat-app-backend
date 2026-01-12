/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/conversations/[id]/files/init-chunked-upload/route.ts
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import User from "@/database/user.model";
import { v4 as uuidv4 } from "uuid";
import { uploadSessionStore, UploadSession } from "@/lib/uploadSessionStore";

export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();

  try {
    console.log("🚀 [Init Chunked Upload] Starting...");

    const { id: conversationId } = await context.params;
    console.log("📍 Conversation ID:", conversationId);

    const { userId: clerkUserId } = await auth();
    console.log("👤 clerkUserId:", clerkUserId);

    if (!clerkUserId) {
      console.error("❌ Auth returned null userId");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const user = await User.findOne({ clerkId: clerkUserId });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await req.json();
    const { fileName, totalSize, totalChunks, fileType, thumbnailUrl } = body;

    // ✅ Validation
    if (!fileName || !totalSize || !totalChunks) {
      return NextResponse.json(
        {
          error: "Missing required fields: fileName, totalSize, totalChunks",
        },
        { status: 400 }
      );
    }

    // ✅ Size check (max 100MB)
    const maxSize = 100 * 1024 * 1024;
    if (totalSize > maxSize) {
      return NextResponse.json(
        {
          error: `File too large: ${(totalSize / 1024 / 1024).toFixed(
            2
          )} MB. Maximum: 100MB`,
        },
        { status: 400 }
      );
    }

    console.log(`📦 File: ${fileName}`);
    console.log(`📊 Size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`🔢 Chunks: ${totalChunks}`);
    console.log(`👤 User: ${user.full_name} (${clerkUserId})`);

    // ✅ Generate unique upload ID
    const uploadId = uuidv4();

    // ✅ Create session object matching UploadSession interface
    const session: UploadSession = {
      uploadId,
      conversationId,
      userId: user._id.toString(),
      clerkUserId,
      fileName,
      fileSize: totalSize, // ✅ FIX: totalSize → fileSize
      totalChunks,
      fileType: fileType || 'application/octet-stream', // ✅ FIX: Thêm fileType
      thumbnailUrl, // ✅ Optional
      uploadUrls: [], // ✅ FIX: Khởi tạo mảng rỗng
      uploadedChunks: new Set(), // ✅ FIX: chunks Map → uploadedChunks Set
      createdAt: new Date(),
    };

    uploadSessionStore.set(uploadId, session);
    uploadSessionStore.scheduleCleanup(uploadId, 2); // Auto-cleanup sau 2 giờ

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Upload session created: ${uploadId} (${elapsed}s)`);
    console.log(`⏰ Session will expire in 2 hours`);
    console.log(`📊 Active sessions: ${uploadSessionStore.size()}`);

    return NextResponse.json({
      uploadId,
      message: "Upload session initialized",
      totalChunks,
    });
  } catch (error: any) {
    console.error("❌ [Init Chunked Upload] Error:", error);
    console.error("   Stack:", error.stack);
    return NextResponse.json(
      { error: error.message || "Failed to initialize upload" },
      { status: 500 }
    );
  }
}
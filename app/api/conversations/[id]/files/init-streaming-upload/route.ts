/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/conversations/[id]/files/init-streaming-upload/route.ts
// ✅ NEW: Streaming upload với presigned S3 URLs
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import User from "@/database/user.model";
import { v4 as uuidv4 } from "uuid";
import { uploadSessionStore, UploadSession } from "@/lib/uploadSessionStore";
import { generateMultipartUploadUrls } from "@/lib/s3";

export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();

  try {
    console.log("🚀 [Init Streaming Upload] Starting...");

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

    const body = await req.json();
    const { fileName, fileSize, totalChunks, fileType, thumbnailUrl } = body;

    // ✅ Validation
    if (!fileName || !fileSize || !totalChunks || !fileType) {
      return NextResponse.json(
        {
          error: "Missing required fields: fileName, fileSize, totalChunks, fileType",
        },
        { status: 400 }
      );
    }

    // ✅ Size check (max 500MB for streaming)
    const maxSize = 500 * 1024 * 1024; // 500MB
    if (fileSize > maxSize) {
      return NextResponse.json(
        {
          error: `File too large: ${(fileSize / 1024 / 1024).toFixed(2)} MB. Maximum: 500MB`,
        },
        { status: 400 }
      );
    }

    console.log(`📦 File: ${fileName}`);
    console.log(`📊 Size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`🔢 Chunks: ${totalChunks}`);
    console.log(`🖼️ Thumbnail: ${thumbnailUrl || 'N/A'}`);

    // ✅ Generate upload ID
    const uploadId = uuidv4();

    // ✅ CRITICAL: Create session BEFORE generating URLs
    // This ensures the session exists when generateMultipartUploadUrls tries to update S3 info
    const session: UploadSession = {
      uploadId,
      conversationId,
      userId: user._id.toString(),
      clerkUserId,
      fileName,
      fileSize,
      totalChunks,
      fileType,
      thumbnailUrl,
      uploadUrls: [] as string[], // ✅ FIX: Explicit type annotation
      uploadedChunks: new Set<number>(),
      createdAt: new Date(),
      // s3UploadId and s3Key will be added by generateMultipartUploadUrls
    };

    uploadSessionStore.set(uploadId, session);
    console.log(`✅ Session created: ${uploadId}`);

    // ✅ Generate presigned S3 URLs
    // This will also update the session with s3UploadId and s3Key
    console.log("🔑 Generating presigned URLs...");
    const uploadUrls = await generateMultipartUploadUrls(
      conversationId,
      uploadId,
      totalChunks,
      fileType
    );

    console.log(`✅ Generated ${uploadUrls.length} presigned URLs`);

    // ✅ Update session with URLs
    session.uploadUrls = uploadUrls;
    uploadSessionStore.set(uploadId, session);

    // ✅ Schedule auto-cleanup after 2 hours
    uploadSessionStore.scheduleCleanup(uploadId, 2);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Streaming upload session created: ${uploadId} (${elapsed}s)`);

    // ✅ Verify session has S3 info
    const verifySession = uploadSessionStore.get(uploadId);
    if (verifySession?.s3UploadId) {
      console.log(`✅ Session verified with S3 Upload ID: ${verifySession.s3UploadId}`);
    } else {
      console.warn(`⚠️ Session missing S3 Upload ID - this may cause issues later`);
    }

    return NextResponse.json({
      uploadId,
      uploadUrls,
      message: "Streaming upload session initialized",
      totalChunks,
      expiresIn: 7200, // 2 hours
    });

  } catch (error: any) {
    console.error("❌ [Init Streaming Upload] Error:", error);
    
    // ✅ Enhanced error logging
    if (error.message?.includes('session not found')) {
      console.error("💥 Session was not found when trying to update S3 info");
      console.error("   This indicates a race condition or session creation failure");
    }
    
    return NextResponse.json(
      { error: error.message || "Failed to initialize streaming upload" },
      { status: 500 }
    );
  }
}
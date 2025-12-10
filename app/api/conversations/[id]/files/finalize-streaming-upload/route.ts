/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/conversations/[id]/files/finalize-streaming-upload/route.ts
// ✅ FIXED: Save recipientKeys for group chat support

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import File from "@/database/file.model";
import User from "@/database/user.model";
import Message from "@/database/message.model";
import Conversation from "@/database/conversation.model";
import { uploadSessionStore } from "@/lib/uploadSessionStore";
import { completeMultipartUpload } from "@/lib/s3";

export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();

  try {
    console.log("🏁 [Finalize Streaming Upload] Starting...");

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
    const { uploadId, chunks, metadata } = body;

    console.log("📊 Request body:", {
      uploadId,
      chunksLength: chunks?.length,
      metadataChunks: metadata?.chunks?.length,
      recipientKeysCount: metadata?.recipientKeys?.length, // ✅ NEW
    });

    // ✅ Enhanced validation
    if (!uploadId || !chunks || !metadata) {
      return NextResponse.json(
        { error: "Missing required fields: uploadId, chunks, metadata" },
        { status: 400 }
      );
    }

    // ✅ NEW: Validate recipientKeys
    if (!metadata.recipientKeys || !Array.isArray(metadata.recipientKeys)) {
      return NextResponse.json(
        { error: "Missing recipientKeys in metadata" },
        { status: 400 }
      );
    }

    if (metadata.recipientKeys.length === 0) {
      return NextResponse.json(
        { error: "recipientKeys array is empty" },
        { status: 400 }
      );
    }

    console.log(`🔑 [Finalize] Recipients: ${metadata.recipientKeys.length}`);
    metadata.recipientKeys.forEach((rk: any, index: number) => {
      console.log(`   [${index}] ${rk.userId.substring(0, 10)}...`);
    });

    // Validate metadata.chunks
    if (!metadata.chunks || !Array.isArray(metadata.chunks)) {
      return NextResponse.json(
        { error: "Invalid metadata.chunks - must be an array" },
        { status: 400 }
      );
    }

    // Verify each chunk has required encryption fields
    const missingFields = [];
    for (let i = 0; i < metadata.chunks.length; i++) {
      const chunk = metadata.chunks[i];
      if (!chunk.iv) missingFields.push(`chunks[${i}].iv`);
      if (!chunk.authTag) missingFields.push(`chunks[${i}].authTag`);
      if (!chunk.gcmAuthTag) missingFields.push(`chunks[${i}].gcmAuthTag`);
    }

    if (missingFields.length > 0) {
      console.error("❌ Missing encryption fields:", missingFields);
      return NextResponse.json(
        {
          error: "Invalid chunk metadata - missing required encryption fields",
          missingFields,
        },
        { status: 400 }
      );
    }

    // ✅ NEW: Validate each recipientKey
    const missingRecipientFields = [];
    for (let i = 0; i < metadata.recipientKeys.length; i++) {
      const rk = metadata.recipientKeys[i];
      if (!rk.userId) missingRecipientFields.push(`recipientKeys[${i}].userId`);
      if (!rk.encryptedSymmetricKey) missingRecipientFields.push(`recipientKeys[${i}].encryptedSymmetricKey`);
      if (!rk.keyIv) missingRecipientFields.push(`recipientKeys[${i}].keyIv`);
      if (!rk.keyAuthTag) missingRecipientFields.push(`recipientKeys[${i}].keyAuthTag`);
    }

    if (missingRecipientFields.length > 0) {
      console.error("❌ Missing recipientKey fields:", missingRecipientFields);
      return NextResponse.json(
        {
          error: "Invalid recipientKeys - missing required fields",
          missingFields: missingRecipientFields,
        },
        { status: 400 }
      );
    }

    console.log(`📦 Finalizing upload: ${uploadId}`);
    console.log(`📊 Chunks: ${chunks.length}`);
    console.log(`📊 Metadata chunks: ${metadata.chunks.length}`);
    console.log(`🔑 Recipient keys: ${metadata.recipientKeys.length}`);

    // Get session
    const session = uploadSessionStore.get(uploadId);
    if (!session) {
      return NextResponse.json(
        { error: "Upload session not found or expired" },
        { status: 404 }
      );
    }

    if (session.clerkUserId !== clerkUserId) {
      return NextResponse.json(
        { error: "Unauthorized: You do not own this upload session" },
        { status: 403 }
      );
    }

    // Verify chunks array
    if (!Array.isArray(chunks) || chunks.length === 0) {
      return NextResponse.json(
        { error: "Invalid chunks format - must be array of ETags" },
        { status: 400 }
      );
    }

    // Verify chunk count
    if (chunks.length !== session.totalChunks) {
      return NextResponse.json(
        {
          error: `Missing chunks: received ${chunks.length}/${session.totalChunks}`,
          receivedChunks: chunks.length,
          totalChunks: session.totalChunks,
        },
        { status: 400 }
      );
    }

    console.log(`✅ All ${session.totalChunks} chunks confirmed`);

    // Complete S3 multipart upload
    console.log("☁️ Completing S3 multipart upload...");

    const completeResult = await completeMultipartUpload(uploadId, chunks);

    if (!completeResult.success) {
      throw new Error(
        `Failed to complete S3 multipart upload: ${completeResult.error}`
      );
    }

    const uploadElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ S3 multipart upload completed in ${uploadElapsed}s`);

    // Save file metadata to database
    console.log("💾 Saving file metadata to database...");

    // Map chunks metadata
    const chunksMetadata = metadata.chunks.map((c: any) => ({
      index: c.index,
      iv: c.iv,
      authTag: c.authTag,
      gcmAuthTag: c.gcmAuthTag,
      originalSize: c.originalSize,
      encryptedSize: c.encryptedSize,
    }));

    // ✅ NEW: Map recipientKeys
    const recipientKeysMetadata = metadata.recipientKeys.map((rk: any) => ({
      userId: rk.userId,
      encryptedSymmetricKey: rk.encryptedSymmetricKey,
      keyIv: rk.keyIv,
      keyAuthTag: rk.keyAuthTag,
    }));

    console.log("🔍 First chunk metadata:", {
      ...chunksMetadata[0],
      gcmAuthTagPreview: chunksMetadata[0].gcmAuthTag?.substring(0, 20) + "...",
    });

    console.log("🔍 First recipient key:", {
      userId: recipientKeysMetadata[0].userId.substring(0, 10) + "...",
      hasKey: !!recipientKeysMetadata[0].encryptedSymmetricKey,
    });

    const file = await File.create({
      file_name: metadata.file_name,
      file_type: metadata.file_type,
      file_size: metadata.encrypted_size,
      file_path: completeResult.key!,
      url: completeResult.url!,
      cloudinary_public_id: completeResult.key,
      is_encrypted: true,
      encryption_metadata: {
        iv: metadata.iv,
        authTag: metadata.authTag,
        original_size: metadata.original_size,
        encrypted_size: metadata.encrypted_size,
        totalChunks: metadata.chunks.length,
        chunks: chunksMetadata,
        recipientKeys: recipientKeysMetadata, // ✅ NEW: Save recipient keys
        fileId: uploadId,
      },
      uploaded_by: user._id,
    });

    console.log(`✅ File metadata saved: ${file._id}`);
    console.log(`   Chunks: ${chunksMetadata.length}`);
    console.log(`   Recipients: ${recipientKeysMetadata.length}`);

    // Create message with file attachment
    console.log("📨 Creating message with file attachment...");

    let messageContent = `📎 ${metadata.file_name}`;
    if (metadata.file_type.startsWith("image/")) {
      messageContent = `🖼️ ${metadata.file_name}`;
    } else if (metadata.file_type.startsWith("video/")) {
      messageContent = `🎥 ${metadata.file_name}`;
    } else if (metadata.file_type.startsWith("audio/")) {
      messageContent = `🎵 ${metadata.file_name}`;
    }

    let messageType: "image" | "video" | "audio" | "file" = "file";
    if (metadata.file_type.startsWith("image/")) {
      messageType = "image";
    } else if (metadata.file_type.startsWith("video/")) {
      messageType = "video";
    } else if (metadata.file_type.startsWith("audio/")) {
      messageType = "audio";
    }

    const message = await Message.create({
      conversation: conversationId,
      sender: user._id,
      content: messageContent,
      type: messageType,
      attachments: [file._id],
      read_by: [
        {
          user: user._id,
          read_at: new Date(),
        },
      ],
      metadata: {
        thumbnailUrl: session.thumbnailUrl,
        streamingUpload: true,
        uploadId: uploadId,
        recipientsCount: recipientKeysMetadata.length, // ✅ NEW
      },
    });

    console.log(`✅ Message created: ${message._id}`);

    // Update conversation
    await Conversation.findByIdAndUpdate(conversationId, {
      last_message: message._id,
      last_activity: new Date(),
    });

    console.log("✅ Conversation updated");

    // Populate message
    const populatedMessage = await Message.findById(message._id)
      .populate("sender", "clerkId full_name username avatar")
      .populate({
        path: "sender",
        populate: {
          path: "avatar",
          select: "url",
        },
      })
      .populate(
        "attachments",
        "file_name file_type file_size url is_encrypted encryption_metadata"
      );

    // Emit socket event
    try {
      const socketUrl =
        process.env.SOCKET_URL || "http://localhost:3000/api/socket/emit";

      await fetch(socketUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "newMessage",
          conversationId,
          emitToParticipants: true,
          data: {
            conversation_id: conversationId,
            message: populatedMessage,
            sender_id: clerkUserId,
            timestamp: new Date(),
          },
        }),
      });

      console.log("✅ Socket event emitted: newMessage");
    } catch (socketError) {
      console.error("⚠️ Failed to emit socket event:", socketError);
    }

    // Cleanup
    uploadSessionStore.clearTimeout(uploadId);
    uploadSessionStore.delete(uploadId);
    console.log(`🗑️ Upload session cleaned: ${uploadId}`);

    const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`🎉 Streaming upload complete in ${totalElapsed}s`);

    return NextResponse.json({
      success: true,
      fileId: file._id.toString(),
      messageId: message._id.toString(),
      url: completeResult.url,
      key: completeResult.key,
      thumbnailUrl: session.thumbnailUrl,
      metadata: {
        ...metadata,
        thumbnailUrl: session.thumbnailUrl,
        chunksCount: chunksMetadata.length,
        recipientsCount: recipientKeysMetadata.length, // ✅ NEW
      },
      elapsedSeconds: parseFloat(totalElapsed),
    });
  } catch (error: any) {
    console.error("❌ [Finalize Streaming Upload] Error:", error);

    let errorMessage = error.message || "Failed to finalize streaming upload";

    if (error.message?.includes("timeout")) {
      errorMessage =
        "Upload timeout. File may be too large or connection is slow.";
    } else if (
      error.message?.includes("AWS") ||
      error.message?.includes("S3")
    ) {
      errorMessage = `AWS S3 Error: ${error.message}`;
    }

    return NextResponse.json(
      { 
        success: false,
        error: errorMessage 
      }, 
      { status: 500 }
    );
  }
}
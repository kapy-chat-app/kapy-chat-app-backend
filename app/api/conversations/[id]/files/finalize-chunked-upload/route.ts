/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/conversations/[id]/files/finalize-chunked-upload/route.ts
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import File from "@/database/file.model";
import User from "@/database/user.model";
import Message from "@/database/message.model"; // ✅ THÊM
import Conversation from "@/database/conversation.model"; // ✅ THÊM
import { uploadSessionStore } from "@/lib/uploadSessionStore";
import { uploadEncryptedFileToS3 } from "@/lib/s3";

export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  
  try {
    console.log('🏁 [Finalize Upload] Starting...');

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
    const { uploadId } = body;

    if (!uploadId) {
      return NextResponse.json(
        { error: "Missing required field: uploadId" },
        { status: 400 }
      );
    }

    console.log(`📦 Finalizing upload: ${uploadId}`);

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

    if (session.chunks.size !== session.totalChunks) {
      return NextResponse.json(
        { 
          error: `Missing chunks: received ${session.chunks.size}/${session.totalChunks}`,
          receivedChunks: session.chunks.size,
          totalChunks: session.totalChunks,
        },
        { status: 400 }
      );
    }

    console.log(`✅ All ${session.totalChunks} chunks received`);

    // Reassemble file
    console.log('🔧 Reassembling file...');
    let reassembledData = '';
    
    for (let i = 0; i < session.totalChunks; i++) {
      const chunkData = session.chunks.get(i);
      if (!chunkData) {
        throw new Error(`Missing chunk ${i} during reassembly`);
      }
      reassembledData += chunkData;
      
      if ((i + 1) % 10 === 0 || (i + 1) === session.totalChunks) {
        const progress = (((i + 1) / session.totalChunks) * 100).toFixed(1);
        console.log(`   → Reassembling: ${progress}% (${i + 1}/${session.totalChunks} chunks)`);
      }
    }

    const reassembledSize = (reassembledData.length / 1024 / 1024).toFixed(2);
    console.log(`✅ File reassembled: ${reassembledSize} MB (base64)`);

    console.log('🔄 Converting base64 to buffer...');
    const binaryData = Buffer.from(reassembledData, 'base64');
    const binarySizeMB = (binaryData.length / 1024 / 1024).toFixed(2);
    console.log(`✅ Binary size: ${binarySizeMB} MB`);

    console.log('☁️ Uploading to AWS S3...');
    
    const uploadResult = await uploadEncryptedFileToS3(
      binaryData,
      session.fileName,
      session.metadata.file_type,
      {
        iv: session.metadata.iv,
        authTag: session.metadata.authTag,
        original_size: session.metadata.original_size.toString(),
        encrypted_size: session.metadata.encrypted_size.toString(),
      }
    );

    if (!uploadResult.success) {
      throw new Error(`S3 upload failed: ${uploadResult.error}`);
    }

    const uploadElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Uploaded to S3 in ${uploadElapsed}s`);

    console.log('💾 Saving file metadata to database...');
    
    const file = await File.create({
      file_name: session.fileName,
      file_type: session.metadata.file_type,
      file_size: session.metadata.encrypted_size,
      file_path: uploadResult.key!,
      url: uploadResult.url!,
      cloudinary_public_id: uploadResult.key,
      is_encrypted: true,
      encryption_metadata: {
        iv: session.metadata.iv,
        authTag: session.metadata.authTag,
        original_size: session.metadata.original_size,
        encrypted_size: session.metadata.encrypted_size,
      },
      uploaded_by: user._id,
    });

    console.log(`✅ File metadata saved: ${file._id}`);

    // ==========================================
    // ✨ NEW: TẠO MESSAGE TỰ ĐỘNG
    // ==========================================
    console.log('📨 Creating message with file attachment...');
    
    const message = await Message.create({
      conversation: conversationId,
      sender: user._id,
      content: `📎 ${session.fileName}`, // Content mặc định
      type: 'file',
      attachments: [file._id],
      read_by: [{
        user: user._id,
        read_at: new Date()
      }]
    });

    console.log(`✅ Message created: ${message._id}`);

    // ✅ Update conversation's last_message and last_activity
    await Conversation.findByIdAndUpdate(conversationId, {
      last_message: message._id,
      last_activity: new Date()
    });

    console.log('✅ Conversation updated with new message');

    // ✅ Populate message với sender info
    const populatedMessage = await Message.findById(message._id)
      .populate('sender', 'clerkId full_name username avatar')
      .populate({
        path: 'sender',
        populate: {
          path: 'avatar',
          select: 'url'
        }
      })
      .populate('attachments', 'file_name file_type file_size url is_encrypted encryption_metadata');

    // ✅ Emit socket event
    try {
      const socketUrl = process.env.SOCKET_URL || 'http://localhost:3000/api/socket/emit';
      
      await fetch(socketUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'newMessage',
          conversationId,
          emitToParticipants: true,
          data: {
            conversation_id: conversationId,
            message: populatedMessage,
            sender_id: clerkUserId,
            timestamp: new Date(),
          }
        })
      });
      
      console.log('✅ Socket event emitted: newMessage');
    } catch (socketError) {
      console.error('⚠️ Failed to emit socket event:', socketError);
    }

    // Cleanup
    uploadSessionStore.clearTimeout(uploadId);
    uploadSessionStore.delete(uploadId);
    console.log(`🗑️ Upload session cleaned: ${uploadId}`);

    const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`🎉 Chunked upload complete in ${totalElapsed}s`);

    return NextResponse.json({
      fileId: file._id.toString(),
      messageId: (message._id as string).toString(), // ✅ Trả về message ID
      url: uploadResult.url,
      key: uploadResult.key,
      size: uploadResult.size,
      metadata: session.metadata,
      elapsedSeconds: parseFloat(totalElapsed),
    });

  } catch (error: any) {
    console.error('❌ [Finalize Upload] Error:', error);
    
    let errorMessage = error.message || "Failed to finalize upload";
    
    if (error.message?.includes('timeout')) {
      errorMessage = "Upload timeout. File may be too large or connection is slow.";
    } else if (error.message?.includes('AWS')) {
      errorMessage = `AWS S3 Error: ${error.message}`;
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
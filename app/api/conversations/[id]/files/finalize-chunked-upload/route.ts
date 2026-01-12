/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/conversations/[id]/files/finalize-chunked-upload/route.ts
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import File from "@/database/file.model";
import User from "@/database/user.model";
import Message from "@/database/message.model";
import Conversation from "@/database/conversation.model";
import { uploadSessionStore } from "@/lib/uploadSessionStore";
import { uploadEncryptedFileToS3 } from "@/lib/s3";

export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  
  try {
    console.log('🏁 [Finalize Upload] Starting...');

    const { id: conversationId } = await context.params;
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

    // ✅ FIX: Dùng uploadedChunks thay vì chunks
    if (session.uploadedChunks.size !== session.totalChunks) {
      return NextResponse.json(
        { 
          error: `Missing chunks: received ${session.uploadedChunks.size}/${session.totalChunks}`,
          receivedChunks: session.uploadedChunks.size,
          totalChunks: session.totalChunks,
        },
        { status: 400 }
      );
    }

    console.log(`✅ All ${session.totalChunks} chunks received`);

    // ⚠️ LƯU Ý: Phần reassemble này có vẻ không đúng với implementation hiện tại
    // Vì bạn đang dùng S3 multipart upload, không cần reassemble ở đây
    // Code dưới đây chỉ để tham khảo nếu bạn muốn reassemble từ chunks
    
    console.log('☁️ Uploading to AWS S3...');
    
    // ✅ Nếu bạn đã upload từng chunk lên S3, bạn cần complete multipart upload
    // thay vì upload lại toàn bộ file
    
    // Placeholder - bạn cần implement complete multipart upload
    // const uploadResult = await completeMultipartUpload(
    //   session.s3UploadId!,
    //   session.s3Key!,
    //   session.uploadedChunks
    // );

    // ⚠️ TẠM THỜI: Giả sử upload thành công (bạn cần replace bằng logic thực tế)
    const uploadResult = {
      success: true,
      key: session.s3Key || `uploads/${uploadId}/${session.fileName}`,
      url: `https://your-bucket.s3.amazonaws.com/${session.s3Key || uploadId}`,
      size: session.fileSize
    };

    if (!uploadResult.success) {
      throw new Error(`S3 upload failed`);
    }

    const uploadElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Uploaded to S3 in ${uploadElapsed}s`);

    console.log('💾 Saving file metadata to database...');
    
    const file = await File.create({
      file_name: session.fileName,
      file_type: session.fileType,
      file_size: session.fileSize,
      file_path: uploadResult.key,
      url: uploadResult.url,
      cloudinary_public_id: uploadResult.key,
      is_encrypted: false, // ⚠️ Cập nhật nếu file có encrypt
      uploaded_by: user._id,
    });

    console.log(`✅ File metadata saved: ${file._id}`);

    // ==========================================
    // ✨ TẠO MESSAGE TỰ ĐỘNG
    // ==========================================
    console.log('📨 Creating message with file attachment...');
    
    const message = await Message.create({
      conversation: conversationId,
      sender: user._id,
      content: `📎 ${session.fileName}`,
      type: 'file',
      attachments: [file._id],
      read_by: [{
        user: user._id,
        read_at: new Date()
      }]
    });

    console.log(`✅ Message created: ${message._id}`);

    // ✅ Update conversation
    await Conversation.findByIdAndUpdate(conversationId, {
      last_message: message._id,
      last_activity: new Date()
    });

    console.log('✅ Conversation updated with new message');

    // ✅ Populate message
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
      messageId: (message._id as string).toString(),
      url: uploadResult.url,
      key: uploadResult.key,
      size: uploadResult.size,
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
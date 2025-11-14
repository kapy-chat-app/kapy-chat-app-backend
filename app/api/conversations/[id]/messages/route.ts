/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/conversations/[id]/messages/route.ts - UPDATED WITH RICH MEDIA

import { CreateMessageDTO } from "@/dtos/message.dto";
import { uploadMultipleFiles, uploadEncryptedFileToCloudinary } from "@/lib/actions/file.action";
import {
  removeReaction,
  deleteMessage,
  getMessages,
  createMessage,
} from "@/lib/actions/message.action";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

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

    const { id: conversationId } = await params;

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");

    const result = await getMessages(conversationId, page, limit);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("API Error - GET /conversations/:id/messages:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
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

    const { id: conversationId } = await params;
    const contentType = req.headers.get('content-type') || '';

    let messageData: CreateMessageDTO;

    // ==========================================
    // ✨ CASE 1: JSON (Text, Encrypted Files, GIF, Sticker)
    // ==========================================
    if (contentType.includes('application/json')) {
      const body = await req.json();
      
      console.log('📨 JSON request received:', {
        hasEncryptedContent: !!body.encryptedContent,
        hasPlaintextContent: !!body.content,
        hasEncryptedFiles: !!body.encryptedFiles,
        hasRichMedia: !!body.richMedia, // ✨ NEW
        type: body.type,
      });

      // ✨ NEW: Validate GIF/Sticker
      if (body.type === 'gif' || body.type === 'sticker') {
        if (!body.richMedia || !body.richMedia.provider || !body.richMedia.media_url) {
          return NextResponse.json(
            { 
              success: false, 
              error: `Rich media data is required for ${body.type} messages` 
            },
            { status: 400 }
          );
        }
        
        console.log(`✨ ${body.type.toUpperCase()} message with rich media from ${body.richMedia.provider}`);
        
        messageData = {
          ...body,
          conversationId,
        };
      }
      // ✅ Handle encrypted files from mobile
      else if (body.encryptedFiles && Array.isArray(body.encryptedFiles)) {
        console.log(`🔐 Processing ${body.encryptedFiles.length} encrypted files...`);

        const uploadedFileIds: string[] = [];

        for (const encFile of body.encryptedFiles) {
          try {
            const {
              encryptedBase64,
              originalFileName,
              originalFileType,
              encryptionMetadata
            } = encFile;

            if (!encryptedBase64 || !encryptionMetadata) {
              console.error('❌ Invalid encrypted file data');
              continue;
            }

            console.log(`📤 Uploading encrypted file to Cloudinary: ${originalFileName}`);

            const uploadResult = await uploadEncryptedFileToCloudinary(
              encryptedBase64,
              originalFileName,
              originalFileType,
              encryptionMetadata
            );

            if (uploadResult.success && uploadResult.file) {
              uploadedFileIds.push(uploadResult.file.id);
              console.log(`✅ Encrypted file uploaded: ${originalFileName} (ID: ${uploadResult.file.id})`);
            } else {
              console.error(`❌ Failed to upload encrypted file: ${originalFileName}`, uploadResult.error);
            }
          } catch (error) {
            console.error('❌ Error uploading encrypted file:', error);
          }
        }

        console.log(`✅ Uploaded ${uploadedFileIds.length}/${body.encryptedFiles.length} encrypted files`);

        messageData = {
          ...body,
          conversationId,
          attachments: uploadedFileIds.length > 0 ? uploadedFileIds : body.attachments,
        };

        delete (messageData as any).encryptedFiles;

      } else {
        // Regular JSON message (text only)
        messageData = {
          ...body,
          conversationId,
        };
      }
    }
    // ==========================================
    // ✨ CASE 2: NON-ENCRYPTED FILES (FormData)
    // ==========================================
    else if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      
      const content = formData.get('content') as string | null;
      const encryptedContent = formData.get('encryptedContent') as string | null;
      const encryptionMetadataStr = formData.get('encryptionMetadata') as string | null;
      const type = formData.get('type') as string;
      const replyTo = formData.get('replyTo') as string | null;
      const files = formData.getAll('files') as File[];

      console.log(`📤 FormData: Uploading ${files.length} non-encrypted files of type: ${type}`);

      const uploadResult = await uploadMultipleFiles(files, 'chatapp/messages', userId);

      if (uploadResult.failed.length > 0) {
        console.warn('⚠️ Some files failed to upload:', uploadResult.failed);
      }

      const attachmentIds = uploadResult.successful.map(file => file.id);

      let encryptionMetadata = null;
      if (encryptionMetadataStr) {
        try {
          encryptionMetadata = JSON.parse(encryptionMetadataStr);
        } catch (e) {
          console.error('❌ Failed to parse encryption metadata:', e);
        }
      }

      messageData = {
        conversationId,
        content: content || undefined,
        encryptedContent: encryptedContent || undefined,
        encryptionMetadata: encryptionMetadata || undefined,
        type: type as any,
        attachments: attachmentIds.length > 0 ? attachmentIds : undefined,
        replyTo: replyTo || undefined,
      };

      console.log(`✅ FormData message created with ${attachmentIds.length} attachments`);
    }
    // ==========================================
    // ✨ CASE 3: INVALID REQUEST
    // ==========================================
    else {
      return NextResponse.json(
        { success: false, error: "Invalid content type" },
        { status: 400 }
      );
    }

    // ==========================================
    // ✨ VALIDATION
    // ==========================================
    if (!messageData.type) {
      return NextResponse.json(
        { success: false, error: "Missing required field: type" },
        { status: 400 }
      );
    }

    // ✨ For GIF/Sticker - rich media is REQUIRED
    if ((messageData.type === 'gif' || messageData.type === 'sticker') && !messageData.richMedia) {
      console.error(`❌ ${messageData.type} message missing rich media`);
      return NextResponse.json(
        { 
          success: false, 
          error: `Rich media is required for ${messageData.type} messages` 
        },
        { status: 400 }
      );
    }

    // ✨ For text messages without attachments, encrypted content is REQUIRED
    if (messageData.type === 'text' && (!messageData.attachments || messageData.attachments.length === 0)) {
      if (!messageData.encryptedContent) {
        console.error('❌ Text message missing encrypted content');
        return NextResponse.json(
          { 
            success: false, 
            error: "Encrypted content is required for text messages (E2EE enabled)" 
          },
          { status: 400 }
        );
      }
      console.log('✅ Text message has encrypted content');
    }

    console.log('📨 Calling createMessage with:', {
      conversationId: messageData.conversationId,
      type: messageData.type,
      hasContent: !!messageData.content,
      hasEncryptedContent: !!messageData.encryptedContent,
      hasRichMedia: !!messageData.richMedia, // ✨ NEW
      hasAttachments: !!messageData.attachments?.length,
      attachmentsCount: messageData.attachments?.length || 0
    });

    // ==========================================
    // ✨ CREATE MESSAGE
    // ==========================================
    const result = await createMessage(messageData);

    if (!result.success) {
      console.error('❌ createMessage failed:', result.error);
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    console.log('✅ Message created successfully');

    return NextResponse.json(
      {
        success: true,
        data: result.data,
        timestamp: new Date(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("❌ API Route Error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Internal server error" 
      },
      { status: 500 }
    );
  }
}
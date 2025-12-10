/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/conversations/[id]/messages/route.ts - UPDATED WITH CHUNKED UPLOAD SUPPORT

import { CreateMessageDTO } from "@/dtos/message.dto";
import { uploadMultipleFiles, uploadEncryptedFile } from "@/lib/actions/file.action";
import {
  removeReaction,
  deleteMessage,
  getMessages,
  createMessage,
} from "@/lib/actions/message.action";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

// ✅ Tăng timeout và body size limit
export const maxDuration = 300; // 5 minutes for Vercel
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '100mb', // ✅ Support large encrypted files
    },
    responseLimit: false,
  },
};

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
  const startTime = Date.now();
  
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
    // ✅ CASE 1: JSON (Encrypted Files from mobile)
    // ==========================================
    if (contentType.includes('application/json')) {
      const body = await req.json();
      
      console.log('📨 JSON request received:', {
        type: body.type,
        hasEncryptedFiles: !!body.encryptedFiles,
        encryptedFilesCount: body.encryptedFiles?.length || 0,
      });

      // ✅ Handle encrypted files
      if (body.encryptedFiles && Array.isArray(body.encryptedFiles)) {
        console.log(`🔐 Processing ${body.encryptedFiles.length} encrypted file(s)...`);

        const uploadedFileIds: string[] = [];

        for (let i = 0; i < body.encryptedFiles.length; i++) {
          const encFile = body.encryptedFiles[i];
          const fileIndex = i + 1;
          
          try {
            // ✅ CHECK: Is this a large file (already uploaded)?
            if (encFile.isLargeFile && encFile.encryptedFileId) {
              console.log(`📦 [${fileIndex}/${body.encryptedFiles.length}] Large file (already uploaded): ${encFile.originalFileName}`);
              console.log(`   File ID: ${encFile.encryptedFileId}`);
              
              // ✅ CRITICAL: Just add the file ID reference
              uploadedFileIds.push(encFile.encryptedFileId);
              
              console.log(`✅ [${fileIndex}/${body.encryptedFiles.length}] Large file reference added`);
              continue;
            }

            // ✅ CASE 2: Small file (direct upload via base64)
            if (!encFile.encryptedBase64 || !encFile.encryptionMetadata) {
              console.error(`❌ [${fileIndex}/${body.encryptedFiles.length}] Invalid encrypted file data`);
              console.error('   Missing fields:', {
                hasBase64: !!encFile.encryptedBase64,
                hasMetadata: !!encFile.encryptionMetadata,
                hasFileId: !!encFile.encryptedFileId,
                isLargeFile: !!encFile.isLargeFile,
              });
              continue;
            }

            // Upload small file
            const fileSizeBytes = (encFile.encryptedBase64.length * 3) / 4;
            const fileSizeMB = (fileSizeBytes / 1024 / 1024).toFixed(2);

            console.log(`📤 [${fileIndex}/${body.encryptedFiles.length}] Uploading (direct): ${encFile.originalFileName} (${fileSizeMB} MB)`);

            const uploadResult = await uploadEncryptedFile(
              encFile.encryptedBase64,
              encFile.originalFileName,
              encFile.originalFileType,
              encFile.encryptionMetadata
            );

            if (uploadResult.success && uploadResult.file) {
              uploadedFileIds.push(uploadResult.file.id);
              console.log(`✅ [${fileIndex}/${body.encryptedFiles.length}] Uploaded: ${encFile.originalFileName}`);
            } else {
              console.error(`❌ [${fileIndex}/${body.encryptedFiles.length}] Upload failed:`, uploadResult.error);
            }
          } catch (error: any) {
            console.error(`❌ [${fileIndex}/${body.encryptedFiles.length}] Error:`, error?.message);
          }
        }

        const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`✅ Processed ${uploadedFileIds.length}/${body.encryptedFiles.length} file(s) in ${totalElapsed}s`);

        if (uploadedFileIds.length === 0 && body.encryptedFiles.length > 0) {
          return NextResponse.json(
            { 
              success: false, 
              error: "All file uploads failed" 
            },
            { status: 400 }
          );
        }

        messageData = {
          ...body,
          conversationId,
          attachments: uploadedFileIds,
        };

        // ✅ Clean up
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

      console.log(`📤 FormData: Uploading ${files.length} non-encrypted file(s) of type: ${type}`);

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

      console.log(`✅ FormData message created with ${attachmentIds.length} attachment(s)`);
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
      hasRichMedia: !!messageData.richMedia,
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

    const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Message created successfully in ${totalElapsed}s`);

    return NextResponse.json(
      {
        success: true,
        data: result.data,
        timestamp: new Date(),
      },
      { status: 201 }
    );
  } catch (error: any) {
    const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`❌ API Route Error after ${totalElapsed}s:`, error);
    
    // ✅ Better error messages
    let errorMessage = "Internal server error";
    
    if (error?.message?.includes('timeout')) {
      errorMessage = "Request timeout. File may be too large or connection is slow.";
    } else if (error?.message?.includes('too large')) {
      errorMessage = "File size exceeds limit. Maximum 100MB per file.";
    } else if (error instanceof Error) {
      errorMessage = error.message;
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
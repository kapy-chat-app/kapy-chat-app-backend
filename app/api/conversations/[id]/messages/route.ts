/* eslint-disable @typescript-eslint/no-explicit-any */
import { CreateMessageDTO } from "@/dtos/message.dto";
import { uploadMultipleFiles } from "@/lib/actions/file.action";
import {
  removeReaction,
  deleteMessage,
  getMessages,
  createMessage,
} from "@/lib/actions/message.action";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

// ✅ FIX: Đổi params thành Promise và await nó
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> } // ✅ ĐÃ SỬA
) {
  try {
    // ✅ Verify authentication trước
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // ✅ FIX: Await params trước khi dùng
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

    // Check if request is FormData (có files)
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      
      // ✨ Get encrypted content and metadata
      const content = formData.get('content') as string | null;
      const encryptedContent = formData.get('encryptedContent') as string | null;
      const encryptionMetadataStr = formData.get('encryptionMetadata') as string | null;
      const type = formData.get('type') as string;
      const replyTo = formData.get('replyTo') as string | null;
      const files = formData.getAll('files') as File[];

      console.log(`📤 Uploading ${files.length} files of type: ${type}`);
      console.log(`🔐 FormData - Has encrypted content: ${!!encryptedContent}`);

      // Upload files
      const uploadResult = await uploadMultipleFiles(files, 'chatapp/messages', userId);

      if (uploadResult.failed.length > 0) {
        console.warn('⚠️ Some files failed to upload:', uploadResult.failed);
      }

      // Get IDs of successfully uploaded files
      const attachmentIds = uploadResult.successful.map(file => file.id);

      // ✨ Parse encryption metadata if present
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
        content: content || undefined, // Optional plaintext
        encryptedContent: encryptedContent || undefined, // ✨ Encrypted content
        encryptionMetadata: encryptionMetadata || undefined, // ✨ Encryption metadata
        type: type as any,
        attachments: attachmentIds.length > 0 ? attachmentIds : undefined,
        replyTo: replyTo || undefined,
      };

      console.log(`✅ Created message with ${attachmentIds.length} attachments and E2EE: ${!!encryptedContent}`);
    } else {
      // Regular JSON request
      const body = await req.json();
      
      // ✨ Log E2EE info for debugging
      console.log('📨 JSON request received:', {
        hasEncryptedContent: !!body.encryptedContent,
        hasPlaintextContent: !!body.content,
        type: body.type,
        bodyKeys: Object.keys(body)
      });

      messageData = {
        ...body,
        conversationId,
      };
    }

    // ✨ Enhanced validation for E2EE
    if (!messageData.type) {
      return NextResponse.json(
        { success: false, error: "Missing required field: type" },
        { status: 400 }
      );
    }

    // ✨ For text messages, encrypted content is REQUIRED
    if (messageData.type === 'text') {
      if (!messageData.encryptedContent) {
        console.error('❌ Text message missing encrypted content:', {
          hasEncryptedContent: !!messageData.encryptedContent,
          hasContent: !!messageData.content,
          type: messageData.type
        });
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

    // ✨ Debug log before calling createMessage
    console.log('📨 Calling createMessage with:', {
      conversationId: messageData.conversationId,
      type: messageData.type,
      hasContent: !!messageData.content,
      hasEncryptedContent: !!messageData.encryptedContent,
      hasEncryptionMetadata: !!messageData.encryptionMetadata,
      hasAttachments: !!messageData.attachments?.length
    });

    // Create message
    const result = await createMessage(messageData);

    if (!result.success) {
      console.error('❌ createMessage failed:', result.error);
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    console.log('✅ Message created successfully with E2EE');

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
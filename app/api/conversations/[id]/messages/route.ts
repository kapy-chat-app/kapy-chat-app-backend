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



export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
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

    const conversationId = params.id;
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
      
      const content = formData.get('content') as string | null;
      const type = formData.get('type') as string;
      const replyTo = formData.get('replyTo') as string | null;
      const files = formData.getAll('files') as File[];

      console.log(`📤 Uploading ${files.length} files of type: ${type}`);

      // Upload files
      const uploadResult = await uploadMultipleFiles(files, 'chatapp/messages', userId);

      if (uploadResult.failed.length > 0) {
        console.warn('⚠️ Some files failed to upload:', uploadResult.failed);
      }

      // Get IDs of successfully uploaded files
      const attachmentIds = uploadResult.successful.map(file => file.id);

      messageData = {
        conversationId,
        content: content || undefined,
        type: type as any,
        attachments: attachmentIds.length > 0 ? attachmentIds : undefined,
        replyTo: replyTo || undefined,
      };

      console.log(`✅ Created message with ${attachmentIds.length} attachments`);
    } else {
      // Regular JSON request
      const body = await req.json();
      messageData = {
        ...body,
        conversationId,
      };
    }

    // Validate required fields
    if (!messageData.type) {
      return NextResponse.json(
        { success: false, error: "Missing required field: type" },
        { status: 400 }
      );
    }

    // Create message
    const result = await createMessage(messageData);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: result.data,
        timestamp: new Date(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
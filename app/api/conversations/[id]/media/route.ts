import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getConversationMedia } from "@/lib/actions/conversation.action";

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
    const mediaType = searchParams.get("type") as 'image' | 'video' | 'file' | 'audio';
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    if (!mediaType || !['image', 'video', 'file', 'audio'].includes(mediaType)) {
      return NextResponse.json(
        { success: false, error: "Invalid media type" },
        { status: 400 }
      );
    }

    const result = await getConversationMedia(conversationId, mediaType, page, limit);

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
    console.error("API Error - GET /conversations/:id/media:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
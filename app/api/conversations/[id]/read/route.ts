import { markConversationAsRead } from "@/lib/actions/conversation.action";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    console.log(`📖 API: Mark conversation ${id} as read`);

    const result = await markConversationAsRead(id);

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
    console.error("❌ API Error - PUT /conversations/[id]/read:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
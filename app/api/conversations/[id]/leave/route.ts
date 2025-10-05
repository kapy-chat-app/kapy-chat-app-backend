import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { leaveGroup } from "@/lib/actions/conversation.action";

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
    const result = await leaveGroup(conversationId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      data: result.data,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("API Error - POST /conversations/:id/leave:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

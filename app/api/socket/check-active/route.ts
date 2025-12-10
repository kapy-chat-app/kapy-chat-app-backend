import { isUserActiveInConversation } from "@/lib/socket/activeUsers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, conversationId } = body;

    console.log("🔍 [CHECK_ACTIVE_API] Received request:", { userId, conversationId });

    if (!userId || !conversationId) {
      console.error("❌ [CHECK_ACTIVE_API] Missing parameters");
      return NextResponse.json(
        { 
          success: false, 
          error: "Missing userId or conversationId", 
          isActive: false 
        },
        { status: 400 }
      );
    }

    // ✅ Call function from activeUsers.ts (reads from global.activeUsersMap)
    const isActive = isUserActiveInConversation(userId, conversationId);

    console.log(`✅ [CHECK_ACTIVE_API] Result for ${userId}: ${isActive}`);

    return NextResponse.json({
      success: true,
      isActive,
      userId,
      conversationId,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error("❌ [CHECK_ACTIVE_API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        isActive: false,
      },
      { status: 500 }
    );
  }
}

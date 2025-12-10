// src/app/api/ai/chat/history/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAIChatHistory } from "@/lib/actions/ai-chat.action";
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get('conversationId');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');

  if (!conversationId) {
    return NextResponse.json(
      { success: false, error: "Conversation ID is required" },
      { status: 400 }
    );
  }

  const result = await getAIChatHistory({ conversationId, page, limit });

  if (!result.success) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result);
}
// src/app/api/ai/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { sendAIChatMessage } from "@/lib/actions/ai-chat.action";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { message, conversationId, includeEmotionContext, language } = body;

  if (!message) {
    return NextResponse.json(
      { success: false, error: "Message is required" },
      { status: 400 }
    );
  }

  const result = await sendAIChatMessage({
    message,
    conversationId,
    includeEmotionContext,
    language
  });

  if (!result.success) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result);
}
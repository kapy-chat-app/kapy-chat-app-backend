// src/app/api/ai/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { sendAIMessage } from "@/lib/actions/ai-chat.unified.action";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, conversationId, includeEmotionContext, language } = body;

    if (!message?.trim()) {
      return NextResponse.json(
        { success: false, error: "Message is required" },
        { status: 400 }
      );
    }

    const result = await sendAIMessage({
      message,
      conversationId,
      includeEmotionContext,
      language,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
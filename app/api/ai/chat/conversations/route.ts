// src/app/api/ai/chat/conversations/route.ts
import { NextResponse } from "next/server";
import { getAllAIChatConversations } from "@/lib/actions/ai-chat.action";

export async function GET() {
  const result = await getAllAIChatConversations();
  
  if (!result.success) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result);
}
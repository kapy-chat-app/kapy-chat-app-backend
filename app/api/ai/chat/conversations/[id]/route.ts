// src/app/api/ai/chat/conversations/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { deleteAIChatConversation } from "@/lib/actions/ai-chat.action";
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const result = await deleteAIChatConversation(params.id);
  
  if (!result.success) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result);
}
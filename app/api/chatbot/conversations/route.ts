import { deleteChatConversation, getAllChatConversations } from "@/lib/actions/chatbot.actions";
import {  NextRequest, NextResponse } from "next/server";

export async function GET() {
  try {
    const result = await getAllChatConversations();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { conversationId } = await req.json();
    const result = await deleteChatConversation(conversationId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
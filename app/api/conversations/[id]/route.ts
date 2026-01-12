import { UpdateConversationDTO } from "@/dtos/conversation.dto";
import {
  getConversationById,
  updateConversation,
  deleteConversation,
} from "@/lib/actions/conversation.action";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const result = await getConversationById(id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error === "Conversation not found" ? 404 : 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("API Error - GET /conversations/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body: UpdateConversationDTO = await req.json();

    const result = await updateConversation(id, body);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("API Error - PUT /conversations/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const result = await deleteConversation(id);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("API Error - DELETE /conversations/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
import {
  updateMessage,
  addReaction,
  markAsRead,
  deleteMessage,
  removeReaction,
} from "@/lib/actions/message.action";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(
  req: NextRequest,
  { params }: { params: { messageId: string } }
) {
  try {
    const body = await req.json();

    if (body.action === "edit" && body.content) {
      const result = await updateMessage(params.messageId, body.content);

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        data: result.data,
        timestamp: new Date(),
      });
    }

    if (body.action === "reaction" && body.reactionType) {
      const result = await addReaction(params.messageId, body.reactionType);

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        data: result.data,
        timestamp: new Date(),
      });
    }

    if (body.action === "read") {
      const result = await markAsRead(params.messageId);

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        data: result.data,
        timestamp: new Date(),
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("API Error - PUT /messages/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


export async function DELETE(
  req: NextRequest,
  { params }: { params: { messageId: string } }
) {
  try {
    const { searchParams } = new URL(req.url);
    const deleteType =
      (searchParams.get("type") as "only_me" | "both") || "only_me";

    if (deleteType === "remove_reaction") {
      const result = await removeReaction(params.messageId);

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        data: result.data,
        timestamp: new Date(),
      });
    }

    const result = await deleteMessage(params.messageId, deleteType);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("API Error - DELETE /messages/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
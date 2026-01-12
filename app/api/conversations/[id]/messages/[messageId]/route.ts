// app/api/conversations/[id]/messages/[messageId]/route.ts - UPDATED WITH REACTIONS
import { ReactionType } from "@/dtos/message.dto";
import {
  updateMessage,
  markAsRead,
  deleteMessage,
  addReaction,
  removeReaction,
  toggleReaction,
  getReactionCounts,
  getUsersWhoReacted,
  recallMessage,
} from "@/lib/actions/message.action";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ messageId: string }> }
) {
  try {
    const { messageId } = await context.params;
    const body = await req.json();
    
    // ==========================================
    // ✅ EDIT MESSAGE
    // ==========================================
    if (body.action === "edit" && body.content) {
      const result = await updateMessage(
        messageId,
        body.content || "",
        body.encryptedContent,
        body.encryptionMetadata
      );

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        data: result.data,
        timestamp: new Date(),
      });
    }
    
    if (body.action === "recall") {
      const result = await recallMessage(messageId);

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        data: result.data,
        timestamp: new Date(),
      });
    }

    // ==========================================
    // ✨ ADD/TOGGLE REACTION - UPDATED
    // ==========================================
    if (body.action === "reaction" && body.reactionType) {
      const reactionType = body.reactionType as ReactionType;

      // Validate reaction type
      const validReactions: ReactionType[] = [
        "heart",
        "like",
        "sad",
        "angry",
        "laugh",
        "wow",
        "dislike",
      ];
      if (!validReactions.includes(reactionType)) {
        return NextResponse.json(
          { error: "Invalid reaction type" },
          { status: 400 }
        );
      }

      // ✨ NEW: Support toggle mode
      let result;
      if (body.toggle === true) {
        result = await toggleReaction(messageId, reactionType);
      } else {
        result = await addReaction(messageId, reactionType);
      }

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        data: result.data,
        timestamp: new Date(),
      });
    }

    // ==========================================
    // ✅ MARK AS READ
    // ==========================================
    if (body.action === "read") {
      const result = await markAsRead(messageId);

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
  context: { params: Promise<{ messageId: string }> }
) {
  try {
    const { messageId } = await context.params;
    const { searchParams } = new URL(req.url);
    const deleteType =
      (searchParams.get("type") as "only_me" | "both" | "remove_reaction") ||
      "only_me";

    // ==========================================
    // ✨ REMOVE REACTION - UPDATED
    // ==========================================
    if (deleteType === "remove_reaction") {
      const result = await removeReaction(messageId);

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        data: result.data,
        timestamp: new Date(),
      });
    }

    // ==========================================
    // ✅ DELETE MESSAGE
    // ==========================================
    const result = await deleteMessage(messageId, deleteType);

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

// ==========================================
// ✨ NEW: GET REACTION INFO
// ==========================================
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ messageId: string }> }
) {
  try {
    const { messageId } = await context.params;
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");

    // Get reaction counts
    if (action === "counts") {
      const result = await getReactionCounts(messageId);

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        data: result.data,
        timestamp: new Date(),
      });
    }

    // Get users who reacted
    if (action === "users") {
      const reactionType = searchParams.get("reactionType") as
        | ReactionType
        | undefined;
      const result = await getUsersWhoReacted(messageId, reactionType);

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        data: result.data,
        timestamp: new Date(),
      });
    }

    return NextResponse.json(
      { error: "Invalid action. Use ?action=counts or ?action=users" },
      { status: 400 }
    );
  } catch (error) {
    console.error("API Error - GET /messages/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
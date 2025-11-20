import { removeFriend } from "@/lib/actions/friend.action";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

// DELETE /api/friends/[friendId] - Remove a friend
export async function DELETE(
  request: NextRequest,
  { params }: { params: { friendId: string } }
) {
  try {
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { friendId } = params;

    if (!friendId) {
      return NextResponse.json(
        { error: "Friend ID is required" },
        { status: 400 }
      );
    }

    const result = await removeFriend(clerkId, friendId);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Remove friend API error:", error);
    return NextResponse.json(
      { 
        success: false,
        error: "Internal server error" 
      },
      { status: 500 }
    );
  }
}
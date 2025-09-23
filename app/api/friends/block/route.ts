import {
  blockUser,
  unblockUser,
  getBlockedUsers,
} from "@/lib/actions/friend.action";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const {userId: clerkId} = await auth();
    const body = await request.json();
    const { userId, reason } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    const result = await blockUser(clerkId!,{ userId, reason });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Block user API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const {userId: clerkId} = await auth();
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    const result = await unblockUser(clerkId!,{ userId });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Unblock user API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const {userId: clerkId} = await auth();
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const search = searchParams.get("search") || undefined;

    const result = await getBlockedUsers(clerkId!,{ page, limit, search });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Get blocked users API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

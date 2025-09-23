import { isBlockedByUser, hasBlockedUser } from "@/lib/actions/friend.action";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const {userId:clerkId} = await auth();
    const body = await request.json();
    const { userId, checkType } = body;

    if (!userId || !checkType) {
      return NextResponse.json(
        { error: "User ID and check type are required" },
        { status: 400 }
      );
    }

    if (!["isBlockedBy", "hasBlocked"].includes(checkType)) {
      return NextResponse.json(
        { error: "Invalid check type. Use 'isBlockedBy' or 'hasBlocked'" },
        { status: 400 }
      );
    }

    let result;
    if (checkType === "isBlockedBy") {
      result = await isBlockedByUser(clerkId!,userId);
    } else {
      result = await hasBlockedUser(clerkId!,userId);
    }

    return NextResponse.json({ [checkType]: result });
  } catch (error) {
    console.error("Check block status API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

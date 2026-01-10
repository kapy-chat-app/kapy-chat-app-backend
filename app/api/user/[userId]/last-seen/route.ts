// app/api/users/[userId]/last-seen/route.ts - NEW FILE

import User from "@/database/user.model";
import { connectToDatabase } from "@/lib/mongoose";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = params;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    // ✅ Tìm user bằng clerkId
    const user = await User.findOne({ clerkId: userId })
      .select("clerkId is_online last_seen")

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      clerkId: user.clerkId,
      is_online: user.is_online || false,
      last_seen: user.last_seen || new Date(),
    });
  } catch (error) {
    console.error("Get user last seen API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
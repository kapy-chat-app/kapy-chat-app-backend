// src/app/api/keys/[userId]/route.ts - SIMPLIFIED
import User from "@/database/user.model";
import { connectToDatabase } from "@/lib/mongoose";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    await connectToDatabase();
    const { userId: currentUserId } = await auth();
    if (!currentUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ✅ Tìm user theo clerkId
    const targetUser = await User.findOne({ clerkId: params.userId });
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // ✅ Check có public key không
    if (!targetUser.encryption_public_key) {
      return NextResponse.json(
        { error: "User has not uploaded encryption key yet" },
        { status: 404 }
      );
    }

    // ✅ Return simple public key
    return NextResponse.json({
      success: true,
      data: {
        userId: targetUser._id,
        clerkId: targetUser.clerkId,
        publicKey: targetUser.encryption_public_key,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching key:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch key",
      },
      { status: 500 }
    );
  }
}
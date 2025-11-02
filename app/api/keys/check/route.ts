// src/app/api/keys/check/route.ts
import UserKeys from "@/database/user-keys.model";
import User from "@/database/user.model";
import { connectToDatabase } from "@/lib/mongoose";
import { auth} from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await User.findOne({ clerkId: userId });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const unusedCount = await UserKeys.countUnusedPreKeys(user._id.toString());

    return NextResponse.json({
      success: true,
      data: {
        unused_pre_keys: unusedCount,
        needs_refill: unusedCount < 20,
        threshold: 20,
      },
    });
  } catch (error) {
    console.error("❌ Error checking keys:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to check keys",
      },
      { status: 500 }
    );
  }
}
// src/app/api/keys/upload/route.ts
import User from "@/database/user.model";
import { connectToDatabase } from "@/lib/mongoose";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const { publicKey } = body;

    if (!publicKey) {
      return NextResponse.json(
        { error: "Missing publicKey" },
        { status: 400 }
      );
    }

    // ✅ Save với timestamp
    user.encryption_public_key = publicKey;
    user.encryption_key_uploaded_at = new Date();
    await user.save();

    console.log('✅ Public key uploaded for user:', userId);

    return NextResponse.json({
      success: true,
      message: "Public key uploaded successfully",
      data: {
        user_id: user._id,
        clerk_id: userId,
        uploaded_at: user.encryption_key_uploaded_at,
      },
    });
  } catch (error) {
    console.error("❌ Error uploading key:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to upload key",
      },
      { status: 500 }
    );
  }
}
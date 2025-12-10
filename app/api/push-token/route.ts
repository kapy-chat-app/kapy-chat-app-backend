import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import PushToken from "@/database/push-token.model";
import User from "@/database/user.model";
import { auth } from "@clerk/nextjs/server";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { pushToken, platform, deviceName, deviceId } = await request.json();

    await connectToDatabase();

    // Find MongoDB user
    const user = await User.findOne({ clerkId: userId });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Upsert push token
    await PushToken.findOneAndUpdate(
      { token: pushToken },
      {
        user: user._id,
        token: pushToken,
        platform,
        device_name: deviceName,
        device_id: deviceId,
        is_active: true,
        last_used: new Date(),
      },
      {
        upsert: true,
        new: true,
      }
    );

    console.log(`✅ Push token saved for user: ${userId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving push token:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    // Find MongoDB user
    const user = await User.findOne({ clerkId: userId });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Soft delete - mark as inactive
    await PushToken.updateMany(
      { user: user._id },
      { is_active: false }
    );

    console.log(`✅ Push tokens deactivated for user: ${userId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting push token:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

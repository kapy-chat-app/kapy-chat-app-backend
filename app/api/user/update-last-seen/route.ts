// app/api/user/update-last-seen/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import User from "@/database/user.model";

// ✅ Thêm rate limiting
const updateCache = new Map();
const CACHE_TTL = 30000; // 30 seconds

export async function POST(request: NextRequest) {
  try {
    const { user_id, is_online, last_seen } = await request.json();

    if (!user_id) {
      return NextResponse.json(
        { error: "user_id is required" },
        { status: 400 }
      );
    }

    // ✅ Check cache để tránh update quá nhiều
    const cacheKey = `${user_id}-${is_online}`;
    const cached = updateCache.get(cacheKey);
    if (cached && Date.now() - cached < CACHE_TTL) {
      return NextResponse.json({
        success: true,
        cached: true,
        message: "Using cached update"
      });
    }

    await connectToDatabase();

    const updatedUser = await User.findOneAndUpdate(
      { clerkId: user_id },
      {
        is_online: is_online ?? false,
        last_seen: last_seen ? new Date(last_seen) : new Date(),
      },
      { new: true, upsert: false } // ✅ Không tạo user mới
    );

    if (!updatedUser) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // ✅ Lưu cache
    updateCache.set(cacheKey, Date.now());

    return NextResponse.json({
      success: true,
      message: "Last seen updated",
      data: {
        user_id: updatedUser.clerkId,
        is_online: updatedUser.is_online,
        last_seen: updatedUser.last_seen,
      },
    });
  } catch (error) {
    console.error("❌ Error updating last_seen:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/api/agora/app-id/route.ts
// ⚡ Fast endpoint for pre-initializing Agora (no token generation)
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const appId = process.env.AGORA_APP_ID;

    if (!appId) {
      console.error("❌ AGORA_APP_ID not configured");
      return NextResponse.json(
        { error: "Agora App ID not configured" },
        { status: 500 }
      );
    }

    console.log("⚡ Returning Agora App ID for pre-initialization");

    return NextResponse.json({
      appId,
      message: "Ready for pre-initialization",
    });
  } catch (error: any) {
    console.error("❌ Error getting Agora App ID:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
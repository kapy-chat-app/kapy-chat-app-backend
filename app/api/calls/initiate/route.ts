/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/calls/initiate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { initiateCall } from "@/lib/actions/call.action";


export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { conversationId, type } = await req.json();

    if (!conversationId || !type) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Call the action
    const result = await initiateCall({
      userId,
      conversationId,
      type,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("❌ Error in initiate call API:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to initiate call",
      },
      { status: 500 }
    );
  }
}